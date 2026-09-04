// GET /api/signups            -> CSV of everyone who signed up
// GET /api/signups?format=json -> same thing as JSON
// Requires the SIGNUP_ADMIN_KEY, as "Authorization: Bearer <key>" or "?key=<key>".

import { timingSafeEqual } from 'node:crypto';
import { get, list } from '@vercel/blob';

function authorized(req, url) {
  const expected = process.env.SIGNUP_ADMIN_KEY || '';
  const auth = req.headers.authorization || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (url.searchParams.get('key') || '');
  if (!expected || !provided || expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

async function readRecord(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const text = await new Response(result.stream).text();
  try { return JSON.parse(text); } catch { return null; }
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'http://localhost');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('GET only.');
  }
  if (!authorized(req, url)) {
    return res.status(401).send('Nope.');
  }

  try {
    const rows = [];
    let cursor;
    do {
      const page = await list({ prefix: 'signups/', limit: 1000, cursor });
      // Read in small batches so a big list doesn't fire hundreds of requests at once.
      for (let i = 0; i < page.blobs.length; i += 20) {
        const batch = page.blobs.slice(i, i + 20);
        const records = await Promise.all(batch.map((b) => readRecord(b.pathname)));
        for (const r of records) if (r) rows.push(r);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    rows.sort((a, b) => String(a.signedUpAt).localeCompare(String(b.signedUpAt)));

    if (url.searchParams.get('format') === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).send(JSON.stringify({ count: rows.length, signups: rows }));
    }

    const lines = ['email,role,signedUpAt'];
    for (const r of rows) lines.push([r.email, r.role, r.signedUpAt].map(csvCell).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="friendslop-signups.csv"');
    return res.status(200).send(lines.join('\n') + '\n');
  } catch (err) {
    console.error('export failed', err);
    return res.status(500).send('Export failed. Check the function logs.');
  }
}
