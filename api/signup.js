// POST /api/signup  { email, role }       stores one private blob per email at signups/<sha256(email)>.json
// GET  /api/signup                        CSV of everyone who signed up, admin key required
// GET  /api/signup?format=json            same as JSON

import { createHash } from 'node:crypto';
import { get, list, put } from '@vercel/blob';
import { isAdminKey, keyFromRequest } from '../lib/admin.js';

const ROLES = new Set(['dev', 'player', 'both']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const THANKS = 'Lobby summoned. Watch your inbox.';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    // Honeypot: the field is hidden, so anything in it came from a bot.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return json({ ok: true, message: THANKS });
    }

    const email = String(body.email || '').trim().toLowerCase();
    const role = ROLES.has(body.role) ? body.role : 'unknown';
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return json({ ok: false, message: 'That does not look like an email address.' }, 400);
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
        return json({ ok: true, message: "You're already on the list. We'll be in touch." });
      }
      throw err;
    }
    return json({ ok: true, message: THANKS });
  } catch (err) {
    console.error('signup failed', err);
    return json({ ok: false, message: 'Something broke on our end. Try again in a bit.' }, 500);
  }
}

async function readRecord(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  try { return JSON.parse(await new Response(result.stream).text()); } catch { return null; }
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function GET(request) {
  if (!isAdminKey(keyFromRequest(request))) {
    return new Response('Nope.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const rows = [];
    let cursor;
    do {
      const page = await list({ prefix: 'signups/', limit: 1000, cursor });
      for (let i = 0; i < page.blobs.length; i += 20) {
        const records = await Promise.all(page.blobs.slice(i, i + 20).map((b) => readRecord(b.pathname)));
        for (const r of records) if (r) rows.push(r);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    rows.sort((a, b) => String(a.signedUpAt).localeCompare(String(b.signedUpAt)));

    if (new URL(request.url).searchParams.get('format') === 'json') {
      return Response.json({ count: rows.length, signups: rows }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const lines = ['email,role,signedUpAt'];
    for (const r of rows) lines.push([r.email, r.role, r.signedUpAt].map(csvCell).join(','));
    return new Response(lines.join('\n') + '\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="friendslop-signups.csv"',
        'Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    console.error('signup export failed', err);
    return new Response('Export failed. Check the function logs.', { status: 500 });
  }
}
