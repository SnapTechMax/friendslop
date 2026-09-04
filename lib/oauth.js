// OAuth2 providers. Each is on when OAUTH_<PROVIDER>_CLIENT_ID and _CLIENT_SECRET are set.
// Authorization-code flow with PKCE and a state cookie.

async function getJson(url, token, extraHeaders = {}) {
  const res = await fetch(url, { headers: Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/json', 'User-Agent': 'friendslop.wtf' }, extraHeaders) });
  if (!res.ok) throw new Error('profile fetch failed: ' + res.status);
  return res.json();
}

export const PROVIDERS = {
  discord: {
    label: 'Discord',
    authUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    scope: 'identify email',
    async profile(token) {
      const u = await getJson('https://discord.com/api/users/@me', token);
      return { id: String(u.id), name: u.global_name || u.username, email: u.email || null, emailVerified: !!u.verified };
    }
  },
  google: {
    label: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    async profile(token) {
      const u = await getJson('https://openidconnect.googleapis.com/v1/userinfo', token);
      return { id: String(u.sub), name: u.name || u.given_name, email: u.email || null, emailVerified: !!u.email_verified };
    }
  },
  github: {
    label: 'GitHub',
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    async profile(token) {
      const u = await getJson('https://api.github.com/user', token);
      let email = u.email || null;
      let emailVerified = false;
      try {
        const emails = await getJson('https://api.github.com/user/emails', token);
        const best = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
        if (best) { email = best.email; emailVerified = true; }
      } catch (err) { /* fall back to the public email, unverified */ }
      return { id: String(u.id), name: u.name || u.login, email, emailVerified };
    }
  }
};

export function providerCreds(name) {
  const key = name.toUpperCase();
  const id = process.env['OAUTH_' + key + '_CLIENT_ID'];
  const secret = process.env['OAUTH_' + key + '_CLIENT_SECRET'];
  return id && secret ? { id, secret } : null;
}

export function enabledProviders() {
  return Object.keys(PROVIDERS).filter((p) => providerCreds(p));
}

export function redirectUri(site, provider) {
  return site + '/auth/callback/' + provider;
}

export async function exchangeCode(provider, { code, redirect, verifier }) {
  const p = PROVIDERS[provider];
  const creds = providerCreds(provider);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    client_id: creds.id,
    client_secret: creds.secret,
    code_verifier: verifier
  });
  const res = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'friendslop.wtf' },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error('token exchange failed: ' + res.status + ' ' + (data.error || ''));
  return data.access_token;
}
