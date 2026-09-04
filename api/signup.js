// POST /api/signup  { email, role }
// Stores one private blob per email in Vercel Blob at signups/<sha256(email)>.json.

import { createHash } from 'node:crypto';
import { put } from '@vercel/blob';

const ROLES = new Set(['dev', 'player', 'both']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const THANKS = 'Lobby summoned. Watch your inbox.';

function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    raw = Buffer.concat(chunks).toString('utf8');
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { ok: false, message: 'POST only.' });
  }

  try {
    const body = await readBody(req);

    // Honeypot: the field is hidden, so anything in it came from a bot.
    // Pretend it worked so the bot moves on.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return json(res, 200, { ok: true, message: THANKS });
    }

    const email = String(body.email || '').trim().toLowerCase();
    const role = ROLES.has(body.role) ? body.role : 'unknown';

    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return json(res, 400, { ok: false, message: 'That does not look like an email address.' });
    }

    const key = 'signups/' + createHash('sha256').update(email).digest('hex') + '.json';
    const record = { email, role, signedUpAt: new Date().toISOString() };

    try {
      await put(key, JSON.stringify(record), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: false
      });
    } catch (err) {
      if (/already exists/i.test(String(err && err.message))) {
        return json(res, 200, { ok: true, message: "You're already on the list. We'll be in touch." });
      }
      throw err;
    }

    return json(res, 200, { ok: true, message: THANKS });
  } catch (err) {
    console.error('signup failed', err);
    return json(res, 500, { ok: false, message: 'Something broke on our end. Try again in a bit.' });
  }
}
