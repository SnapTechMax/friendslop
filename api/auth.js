// All account traffic. One function, actions picked by ?action= (Hobby plan caps functions at 12).
//
// GET  ?action=me                      -> { user } or { user: null }
// GET  ?action=providers               -> { providers: [...], mailEnabled }
// POST ?action=register                { email, password, name }
// POST ?action=login                   { email, password }
// POST ?action=logout                  ends this session
// POST ?action=logout-all              ends every session for the account
// POST ?action=verify                  { token }
// POST ?action=resend-verification     (logged in)
// POST ?action=forgot                  { email }   always says ok
// POST ?action=reset                   { token, password }
// POST ?action=change-password         { current, next }   (logged in)
// GET  ?action=oauth&provider=x&next=  302 to the provider   (rewritten from /auth/start/:provider)
// GET  ?action=callback&provider=x     302 back to the site  (rewritten from /auth/callback/:provider)

import { createHash, randomBytes } from 'node:crypto';
import {
  EMAIL_RE, NAME_RE, claimEmail, clearSessionCookie, clientIp, consumeToken, cookieHeader, createSession,
  destroyAllSessions, destroySession, emailPath, findUserByEmail, getUser, hashPassword, hasFetchHeader, issueToken,
  newId, normEmail, oauthPath, parseCookies, passwordProblem, publicUser, safeNext, saveUser, sessionCookie, siteUrl,
  underLimit, userPath, verifyPassword
} from '../lib/auth.js';
import { mailEnabled, resetEmail, sendMail, verificationEmail } from '../lib/mail.js';
import { PROVIDERS, enabledProviders, exchangeCode, providerCreds, redirectUri } from '../lib/oauth.js';
import { readJson, writeJson } from '../lib/submissions.js';

const OAUTH_COOKIE = 'fs_oauth';

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: Object.assign({ 'Cache-Control': 'no-store' }, headers) });
}

function redirect(location, headers = {}) {
  return new Response(null, { status: 302, headers: Object.assign({ Location: location, 'Cache-Control': 'no-store' }, headers) });
}

async function sendVerification(request, user) {
  if (!mailEnabled()) return { sent: false, error: 'mail not configured' };
  const token = await issueToken('verify', { userId: user.id, email: user.email }, 24 * 60);
  const link = siteUrl(request) + '/verify?token=' + encodeURIComponent(token);
  return sendMail(Object.assign({ to: user.email }, verificationEmail(user, link)));
}

// ---- account creation ----

async function register(request, body) {
  const email = normEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');

  const errors = {};
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'That does not look like an email address.';
  const pw = passwordProblem(password, email);
  if (pw) errors.password = pw;
  if (!NAME_RE.test(name)) errors.name = 'Name: 2 to 30 letters, numbers, spaces, or . _ - \'';
  if (Object.keys(errors).length) return json({ ok: false, message: 'Fix the marked fields.', errors }, 400);

  if (!(await underLimit('register', clientIp(request), 10, 3600))) {
    return json({ ok: false, message: 'Too many sign-ups from here. Try again in an hour.' }, 429);
  }

  const id = newId('u');
  if (!(await claimEmail(email, id))) {
    return json({ ok: false, message: 'That email already has an account. Log in, or reset the password.', errors: { email: 'Already registered.' } }, 409);
  }

  const user = {
    id,
    email,
    emailVerified: !mailEnabled(), // no mail service means nothing to verify with, so trust it
    name,
    passwordHash: await hashPassword(password),
    providers: {},
    createdAt: new Date().toISOString()
  };
  await saveUser(user);

  const mail = await sendVerification(request, user);
  const cookie = sessionCookie(request, await createSession(id, request));
  return json({ ok: true, user: publicUser(user), verificationSent: !!mail.sent, verificationRequired: mailEnabled() }, 200, { 'Set-Cookie': cookie });
}

async function login(request, body) {
  const email = normEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!EMAIL_RE.test(email) || !password) return json({ ok: false, message: 'Wrong email or password.' }, 401);

  if (!(await underLimit('login', clientIp(request) + '|' + email, 10, 15 * 60))) {
    return json({ ok: false, message: 'Too many attempts. Wait 15 minutes and try again.' }, 429);
  }

  const user = await findUserByEmail(email);
  const ok = user && !user.disabled && (await verifyPassword(password, user.passwordHash));
  if (!ok) {
    if (user && !user.passwordHash) return json({ ok: false, message: 'That account signs in with ' + Object.keys(user.providers || {}).join(' or ') + '. Use that button, or reset the password to add one.' }, 401);
    return json({ ok: false, message: 'Wrong email or password.' }, 401);
  }

  const cookie = sessionCookie(request, await createSession(user.id, request));
  return json({ ok: true, user: publicUser(user) }, 200, { 'Set-Cookie': cookie });
}

async function logout(request, all) {
  const auth = await getUser(request);
  if (auth) {
    if (all) await destroyAllSessions(auth.user.id);
    else await destroySession(auth.user.id, auth.sessionKey);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(request) });
}

// ---- email verification ----

async function verify(request, body) {
  const rec = await consumeToken('verify', body.token);
  if (!rec) return json({ ok: false, message: 'That link is expired or already used. Log in and ask for a new one.' }, 400);
  const user = await readJson(userPath(rec.userId));
  if (!user || normEmail(user.email) !== normEmail(rec.email)) return json({ ok: false, message: 'That link does not match the account anymore.' }, 400);
  user.emailVerified = true;
  user.emailVerifiedAt = new Date().toISOString();
  await saveUser(user);
  return json({ ok: true, user: publicUser(user) });
}

async function resendVerification(request) {
  const auth = await getUser(request);
  if (!auth) return json({ ok: false, message: 'Log in first.' }, 401);
  if (auth.user.emailVerified) return json({ ok: true, message: 'Already verified.' });
  if (!(await underLimit('resend', auth.user.id, 3, 3600))) return json({ ok: false, message: 'Already sent a few. Check spam, then try again in an hour.' }, 429);
  const mail = await sendVerification(request, auth.user);
  return json({ ok: !!mail.sent, message: mail.sent ? 'Sent. Check your inbox.' : 'Could not send: ' + mail.error });
}

// ---- password reset ----

async function forgot(request, body) {
  const email = normEmail(body.email);
  const generic = { ok: true, message: 'If that email has an account, a reset link is on its way.' };
  if (!EMAIL_RE.test(email)) return json(generic);
  if (!mailEnabled()) return json({ ok: false, message: 'Password reset emails are not set up yet. Yell at us on socials and we will sort it by hand.' }, 503);
  if (!(await underLimit('forgot', email, 3, 3600))) return json(generic);
  const user = await findUserByEmail(email);
  if (user && !user.disabled) {
    const token = await issueToken('reset', { userId: user.id }, 60);
    const link = siteUrl(request) + '/reset?token=' + encodeURIComponent(token);
    await sendMail(Object.assign({ to: user.email }, resetEmail(user, link)));
  }
  return json(generic);
}

async function reset(request, body) {
  const pw = passwordProblem(body.password);
  if (pw) return json({ ok: false, message: pw, errors: { password: pw } }, 400);
  const rec = await consumeToken('reset', body.token);
  if (!rec) return json({ ok: false, message: 'That link is expired or already used. Ask for a new one.' }, 400);
  const user = await readJson(userPath(rec.userId));
  if (!user) return json({ ok: false, message: 'That account is gone.' }, 400);
  user.passwordHash = await hashPassword(body.password);
  user.passwordChangedAt = new Date().toISOString();
  if (!user.emailVerified) { user.emailVerified = true; user.emailVerifiedAt = user.passwordChangedAt; } // they proved they own the inbox
  await saveUser(user);
  await destroyAllSessions(user.id);
  const cookie = sessionCookie(request, await createSession(user.id, request));
  return json({ ok: true, user: publicUser(user) }, 200, { 'Set-Cookie': cookie });
}

async function changePassword(request, body) {
  const auth = await getUser(request);
  if (!auth) return json({ ok: false, message: 'Log in first.' }, 401);
  const pw = passwordProblem(body.next, auth.user.email);
  if (pw) return json({ ok: false, message: pw, errors: { next: pw } }, 400);
  if (auth.user.passwordHash && !(await verifyPassword(String(body.current || ''), auth.user.passwordHash))) {
    return json({ ok: false, message: 'Current password is wrong.', errors: { current: 'Wrong password.' } }, 401);
  }
  auth.user.passwordHash = await hashPassword(body.next);
  auth.user.passwordChangedAt = new Date().toISOString();
  await saveUser(auth.user);
  await destroyAllSessions(auth.user.id);
  const cookie = sessionCookie(request, await createSession(auth.user.id, request));
  return json({ ok: true, user: publicUser(auth.user) }, 200, { 'Set-Cookie': cookie });
}

// ---- OAuth2, authorization code + PKCE ----

function b64url(buf) { return buf.toString('base64url'); }

async function oauthStart(request, url) {
  const provider = url.searchParams.get('provider') || '';
  const p = PROVIDERS[provider];
  const creds = p && providerCreds(provider);
  if (!creds) return json({ ok: false, message: 'That sign-in provider is not set up.' }, 404);

  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const next = safeNext(url.searchParams.get('next'));
  const site = siteUrl(request);

  const authUrl = new URL(p.authUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', creds.id);
  authUrl.searchParams.set('redirect_uri', redirectUri(site, provider));
  authUrl.searchParams.set('scope', p.scope);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  if (provider === 'google') { authUrl.searchParams.set('access_type', 'online'); authUrl.searchParams.set('prompt', 'select_account'); }

  const cookie = cookieHeader(request, OAUTH_COOKIE, JSON.stringify({ state, verifier, provider, next }), 10 * 60);
  return redirect(authUrl.toString(), { 'Set-Cookie': cookie });
}

async function oauthCallback(request, url) {
  const provider = url.searchParams.get('provider') || '';
  const fail = (why) => redirect('/login?error=' + encodeURIComponent(why), { 'Set-Cookie': cookieHeader(request, OAUTH_COOKIE, '', 0) });

  const p = PROVIDERS[provider];
  if (!p || !providerCreds(provider)) return fail('provider');
  let saved;
  try { saved = JSON.parse(parseCookies(request)[OAUTH_COOKIE] || ''); } catch (err) { saved = null; }
  if (url.searchParams.get('error')) return fail('denied');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!saved || !code || !state || saved.provider !== provider || saved.state !== state) return fail('state');

  let profile;
  try {
    const token = await exchangeCode(provider, { code, redirect: redirectUri(siteUrl(request), provider), verifier: saved.verifier });
    profile = await p.profile(token);
  } catch (err) {
    console.error('oauth failed', provider, err);
    return fail('exchange');
  }
  if (!profile || !profile.id) return fail('profile');

  const now = new Date().toISOString();
  let user = null;

  // 1. Seen this provider account before?
  const link = await readJson(oauthPath(provider, profile.id));
  if (link && link.userId) user = await readJson(userPath(link.userId));

  // 2. Otherwise match on a verified email, or create a fresh account.
  if (!user) {
    const email = normEmail(profile.email);
    if (!EMAIL_RE.test(email)) return fail('noemail');
    if (!profile.emailVerified) return fail('unverified');
    user = await findUserByEmail(email);
    if (!user) {
      const id = newId('u');
      if (!(await claimEmail(email, id))) return fail('race');
      const name = String(profile.name || '').trim().replace(/\s+/g, ' ').slice(0, 30);
      user = { id, email, emailVerified: true, name: NAME_RE.test(name) ? name : 'player ' + id.slice(-4), passwordHash: null, providers: {}, createdAt: now };
    } else if (!user.emailVerified) {
      user.emailVerified = true;
      user.emailVerifiedAt = now;
    }
    user.providers = user.providers || {};
    user.providers[provider] = { id: profile.id, linkedAt: now };
    await saveUser(user);
    await writeJson(oauthPath(provider, profile.id), { userId: user.id, provider, providerUserId: profile.id });
  }

  if (user.disabled) return fail('disabled');
  const cookie = sessionCookie(request, await createSession(user.id, request));
  return new Response(null, {
    status: 302,
    headers: [['Location', safeNext(saved.next)], ['Cache-Control', 'no-store'], ['Set-Cookie', cookie], ['Set-Cookie', cookieHeader(request, OAUTH_COOKIE, '', 0)]]
  });
}

// ---- router ----

export async function GET(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  try {
    if (action === 'me') {
      const auth = await getUser(request);
      return json({ user: auth ? publicUser(auth.user) : null, mailEnabled: mailEnabled() });
    }
    if (action === 'providers') {
      return json({ providers: enabledProviders().map((k) => ({ id: k, label: PROVIDERS[k].label })), mailEnabled: mailEnabled() }, 200, { 'Cache-Control': 'public, s-maxage=60' });
    }
    if (action === 'oauth') return oauthStart(request, url);
    if (action === 'callback') return oauthCallback(request, url);
    return json({ ok: false, message: 'Unknown action.' }, 404);
  } catch (err) {
    console.error('auth GET failed', action, err);
    return json({ ok: false, message: 'Something broke on our end.' }, 500);
  }
}

export async function POST(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get('action') || '';
  if (!hasFetchHeader(request)) return json({ ok: false, message: 'Request needs to come from the site.' }, 403);
  const body = await request.json().catch(() => ({}));
  try {
    switch (action) {
      case 'register': return await register(request, body);
      case 'login': return await login(request, body);
      case 'logout': return await logout(request, false);
      case 'logout-all': return await logout(request, true);
      case 'verify': return await verify(request, body);
      case 'resend-verification': return await resendVerification(request);
      case 'forgot': return await forgot(request, body);
      case 'reset': return await reset(request, body);
      case 'change-password': return await changePassword(request, body);
      default: return json({ ok: false, message: 'Unknown action.' }, 404);
    }
  } catch (err) {
    console.error('auth POST failed', action, err);
    return json({ ok: false, message: 'Something broke on our end.' }, 500);
  }
}
