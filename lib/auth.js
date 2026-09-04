// Accounts and sessions on top of Vercel Blob.
//
// users/<id>.json                    the account (password hash, name, email, linked providers)
// emails/<sha256(email)>.json        { userId }  written with allowOverwrite:false, so it's the uniqueness lock
// oauth/<provider>/<sha256(pid)>.json { userId }  provider account -> user
// sessions/<userId>/<sha256(token)>.json          server-side session; the cookie is "<userId>.<token>"
// tokens/verify/<sha256(token)>.json, tokens/reset/<sha256(token)>.json   one-time links
// ratelimit/<kind>/<sha256(key)>.json             small counters for login and reset attempts

import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { del, list, put } from '@vercel/blob';
import { readJson, writeJson } from './submissions.js';

const scrypt = promisify(scryptCb);

export const SESSION_COOKIE = 'fs_session';
export const SESSION_DAYS = 30;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const USERNAME_RE = /^[A-Za-z0-9_.-]{4,32}$/;
export const RESERVED_USERNAMES = new Set(['admin', 'administrator', 'owner', 'mod', 'moderator', 'staff', 'system', 'friendslop', 'support', 'root', 'null', 'undefined', 'anonymous', 'deleted', 'me', 'login', 'profile']);
export const STAFF_ROLES = new Set(['owner', 'admin']);
export const ACCENTS = ['lime', 'grape', 'tang', 'pink', 'amber', 'ink'];
export const BIO_MAX = 300;
export const FAVORITES_MAX = 5;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, keylen: 64, maxmem: 128 * 1024 * 1024 };

export function sha(s) { return createHash('sha256').update(String(s)).digest('hex'); }
export function newId(prefix) { return prefix + '_' + Date.now().toString(36) + randomBytes(5).toString('hex'); }
export function newToken() { return randomBytes(32).toString('base64url'); }
export function normEmail(e) { return String(e || '').trim().toLowerCase(); }

export const userPath = (id) => 'users/' + id + '.json';
export const usernamePath = (username) => 'usernames/' + String(username).toLowerCase() + '.json';
export const emailPath = (email) => 'emails/' + sha(normEmail(email)) + '.json';
export const oauthPath = (provider, pid) => 'oauth/' + provider + '/' + sha(pid) + '.json';
export const sessionPath = (userId, tokenHash) => 'sessions/' + userId + '/' + tokenHash + '.json';
export const verifyTokenPath = (tokenHash) => 'tokens/verify/' + tokenHash + '.json';
export const resetTokenPath = (tokenHash) => 'tokens/reset/' + tokenHash + '.json';

// Passwords: scrypt with a random salt, stored as scrypt$N$r$p$salt$key.
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const [algo, N, r, p, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const salt = Buffer.from(saltB64, 'base64');
  const key = Buffer.from(keyB64, 'base64');
  const test = await scrypt(password, salt, key.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return test.length === key.length && timingSafeEqual(test, key);
}

export function passwordProblem(password, email) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return 'Password needs at least ' + PASSWORD_MIN + ' characters.';
  if (password.length > PASSWORD_MAX) return 'Password is too long.';
  if (email && password.toLowerCase() === normEmail(email)) return 'Your password cannot be your email.';
  if (/^(password|12345678|qwertyui|11111111|friendslop)/i.test(password)) return 'Pick a less guessable password.';
  return null;
}

export function usernameProblem(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) return 'Username: 4 to 32 characters, letters, numbers, dots, dashes, or underscores.';
  if (RESERVED_USERNAMES.has(username.toLowerCase())) return 'That one is reserved.';
  return null;
}

export function isStaff(user) {
  return !!user && STAFF_ROLES.has(user.role);
}

// Users
export async function findUserByEmail(email) {
  const ref = await readJson(emailPath(email));
  return ref && ref.userId ? readJson(userPath(ref.userId)) : null;
}

// Claims the email atomically. Returns false if someone already has it.
export async function claimEmail(email, userId) {
  try {
    await put(emailPath(email), JSON.stringify({ userId, email: normEmail(email) }), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false
    });
    return true;
  } catch (err) {
    if (/already exists/i.test(String(err && err.message))) return false;
    throw err;
  }
}

// Claims a username atomically (case-insensitive). Returns false if taken.
export async function claimUsername(username, userId) {
  try {
    await put(usernamePath(username), JSON.stringify({ userId, username }), {
      access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: false
    });
    return true;
  } catch (err) {
    if (/already exists/i.test(String(err && err.message))) return false;
    throw err;
  }
}

export async function releaseUsername(username) {
  try { await del(usernamePath(username)); } catch (err) { /* already gone */ }
}

export async function usernameTaken(username) {
  return !!(await readJson(usernamePath(username)));
}

// For OAuth sign-ups: turn a provider display name into a free username.
export async function pickUsername(base, userId) {
  let stem = String(base || '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24);
  if (stem.length < 4) stem = 'player';
  const tries = [stem];
  for (let i = 0; i < 6; i++) tries.push(stem.slice(0, 26) + '_' + Math.floor(1000 + Math.random() * 9000));
  for (const t of tries) {
    if (usernameProblem(t)) continue;
    if (await claimUsername(t, userId)) return t;
  }
  const last = 'player_' + userId.slice(-6);
  await claimUsername(last, userId);
  return last;
}

export async function saveUser(user) {
  await writeJson(userPath(user.id), user);
  return user;
}

// Validates the editable profile fields. Returns { values, errors }.
export function profileProblems(body) {
  const errors = {};
  const values = {};
  const str = (v, max) => (typeof v === 'string' ? v.trim().replace(/\r/g, '') : '').slice(0, max + 1);

  values.bio = str(body.bio, BIO_MAX);
  if (values.bio.length > BIO_MAX) errors.bio = 'About me: ' + BIO_MAX + ' characters or fewer.';

  values.pronouns = str(body.pronouns, 24);
  if (values.pronouns && !/^[\p{L}\/ .-]{1,24}$/u.test(values.pronouns)) errors.pronouns = 'Pronouns: letters and slashes, 24 characters or fewer.';

  values.accent = ACCENTS.includes(body.accent) ? body.accent : 'grape';

  const favRaw = Array.isArray(body.favorites) ? body.favorites.join(',') : String(body.favorites || '');
  const seen = new Set();
  values.favorites = [];
  for (const part of favRaw.split(/[,\n]/)) {
    const t = part.trim().replace(/\s+/g, ' ').slice(0, 41);
    if (!t) continue;
    if (t.length > 40) { errors.favorites = 'Each favorite: 40 characters or fewer.'; break; }
    if (!seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); values.favorites.push(t); }
    if (values.favorites.length === FAVORITES_MAX) break;
  }

  values.links = {};
  const discord = str(body.discord, 40);
  if (discord && !/^[\w.#\- ]{2,40}$/.test(discord)) errors.discord = 'That does not look like a Discord username.';
  if (discord) values.links.discord = discord;

  const hostOk = (raw, re) => { try { const u = new URL(raw); return (u.protocol === 'https:' || u.protocol === 'http:') && re.test(u.hostname.toLowerCase()); } catch { return false; } };
  const itch = str(body.itch, 200);
  if (itch && !hostOk(itch, /^([a-z0-9-]+\.)?itch\.io$/)) errors.itch = 'Needs a full itch.io link, like https://you.itch.io.';
  if (itch) values.links.itch = itch;
  const steam = str(body.steam, 200);
  if (steam && !hostOk(steam, /^(store\.steampowered\.com|steamcommunity\.com)$/)) errors.steam = 'Needs a Steam profile or store link.';
  if (steam) values.links.steam = steam;

  return { values, errors };
}

// The profile everyone can see. No email, no provider ids.
export function publicProfile(u) {
  return {
    username: u.username,
    role: u.role || null,
    pronouns: u.pronouns || '',
    bio: u.bio || '',
    accent: u.accent || 'grape',
    favorites: u.favorites || [],
    links: u.links || {},
    hasAvatar: !!u.avatar,
    avatarVersion: u.avatarVersion || 0,
    createdAt: u.createdAt
  };
}

export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    usernameProvisional: !!u.usernameProvisional,
    role: u.role || null,
    email: u.email,
    emailVerified: !!u.emailVerified,
    hasPassword: !!u.passwordHash,
    providers: Object.keys(u.providers || {}),
    createdAt: u.createdAt,
    profile: publicProfile(u)
  };
}

// Sessions
export async function createSession(userId, request) {
  const token = newToken();
  const now = Date.now();
  await writeJson(sessionPath(userId, sha(token)), {
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_DAYS * 86400 * 1000).toISOString(),
    ua: (request && request.headers.get('user-agent') || '').slice(0, 200)
  });
  return userId + '.' + token;
}

export function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isSecure(request) {
  const proto = request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '');
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(':')[0];
  return proto === 'https' || !/^(localhost|127\.0\.0\.1)$/.test(host);
}

export function cookieHeader(request, name, value, maxAgeSec) {
  const bits = [name + '=' + encodeURIComponent(value), 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + maxAgeSec];
  if (isSecure(request)) bits.push('Secure');
  return bits.join('; ');
}

export function sessionCookie(request, value) {
  return cookieHeader(request, SESSION_COOKIE, value, SESSION_DAYS * 86400);
}

export function clearSessionCookie(request) {
  return cookieHeader(request, SESSION_COOKIE, '', 0);
}

// Resolves the caller. Returns { user, sessionKey } or null.
export async function getUser(request) {
  const raw = parseCookies(request)[SESSION_COOKIE];
  if (!raw) return null;
  const dot = raw.indexOf('.');
  if (dot < 1) return null;
  const userId = raw.slice(0, dot);
  const token = raw.slice(dot + 1);
  if (!/^u_[a-z0-9]+$/.test(userId) || !token) return null;
  const key = sha(token);
  const session = await readJson(sessionPath(userId, key));
  if (!session || new Date(session.expiresAt).getTime() < Date.now()) return null;
  const user = await readJson(userPath(userId));
  if (!user || user.disabled) return null;
  return { user, sessionKey: key };
}

export async function destroySession(userId, key) {
  try { await del(sessionPath(userId, key)); } catch (err) { /* already gone */ }
}

export async function destroyAllSessions(userId) {
  const doomed = [];
  let cursor;
  do {
    const page = await list({ prefix: 'sessions/' + userId + '/', limit: 1000, cursor });
    doomed.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (doomed.length) await del(doomed);
  return doomed.length;
}

// Guards for the other endpoints.
// Browser JS sends X-Requested-With: fetch. A cross-site HTML form can't add
// that header, and a cross-site fetch that tries triggers a CORS preflight we
// don't answer, so it doubles as the CSRF check for cookie-authenticated writes.
export function hasFetchHeader(request) {
  return request.headers.get('x-requested-with') === 'fetch';
}

export function deny(message, status) {
  return Response.json({ ok: false, message, code: status === 401 ? 'login_required' : undefined }, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Returns { user } or a Response to send straight back.
export async function requireUser(request, { verified = true } = {}) {
  if (!hasFetchHeader(request)) return { response: deny('Request needs to come from the site.', 403) };
  const auth = await getUser(request);
  if (!auth) return { response: deny('You need to be logged in to do that.', 401) };
  if (verified && !auth.user.emailVerified) {
    return { response: Response.json({ ok: false, message: 'Verify your email first. Check your inbox, or resend from your account.', code: 'verify_required' }, { status: 403, headers: { 'Cache-Control': 'no-store' } }) };
  }
  return auth;
}

// One-time tokens (verify email, reset password)
export async function issueToken(kind, data, ttlMinutes) {
  const token = newToken();
  const path = kind === 'verify' ? verifyTokenPath(sha(token)) : resetTokenPath(sha(token));
  await writeJson(path, Object.assign({}, data, { expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString() }));
  return token;
}

export async function consumeToken(kind, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
  const path = kind === 'verify' ? verifyTokenPath(sha(token)) : resetTokenPath(sha(token));
  const rec = await readJson(path);
  if (!rec) return null;
  try { await del(path); } catch (err) { /* fine */ }
  if (new Date(rec.expiresAt).getTime() < Date.now()) return null;
  return rec;
}

// Simple fixed-window counters. Good enough to blunt password guessing.
export async function underLimit(kind, key, max, windowSec) {
  const path = 'ratelimit/' + kind + '/' + sha(key) + '.json';
  const now = Date.now();
  let rec = await readJson(path);
  if (!rec || rec.resetAt < now) rec = { count: 0, resetAt: now + windowSec * 1000 };
  rec.count += 1;
  await writeJson(path, rec);
  return rec.count <= max;
}

export function clientIp(request) {
  const xff = request.headers.get('x-forwarded-for') || '';
  return (xff.split(',')[0] || request.headers.get('x-real-ip') || '').trim() || 'unknown';
}

// Where absolute links (emails, OAuth redirects) point.
export function siteUrl(request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'friendslop.wtf';
  return proto + '://' + host;
}

// Only allow same-site relative paths as post-login destinations.
export function safeNext(raw) {
  const s = String(raw || '');
  return /^\/(?!\/)[^\s]*$/.test(s) ? s : '/';
}
