// GET /api/submissions             -> JSON list of every submission, newest first
// GET /api/submissions?format=csv  -> flat CSV
// Requires the admin key: "Authorization: Bearer <key>" or "?key=<key>".

import { get, list } from '@vercel/blob';
import { isAdminKey, keyFromRequest } from '../lib/admin.js';

async function readRecord(pathname) {
  const result = await get(pathname, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  try { return JSON.parse(await new Response(result.stream).text()); } catch { return null; }
}

function csvCell(value) {
  const s = Array.isArray(value) ? value.join('|') : String(value ?? '');
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
      const page = await list({ prefix: 'submissions/', limit: 1000, cursor });
      for (let i = 0; i < page.blobs.length; i += 20) {
        const batch = page.blobs.slice(i, i + 20);
        const records = await Promise.all(batch.map((b) => readRecord(b.pathname)));
        for (const r of records) if (r) rows.push(r);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    rows.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));

    const format = new URL(request.url).searchParams.get('format');
    if (format === 'csv') {
      const cols = ['id', 'status', 'title', 'url', 'minPlayers', 'maxPlayers', 'tags', 'devName', 'email', 'onBehalf', 'credit', 'cover', 'submittedAt'];
      const lines = [cols.join(',')];
      for (const r of rows) {
        lines.push([r.id, r.status, r.title, r.url, r.players?.min, r.players?.max, r.tags, r.devName, r.email, r.onBehalf, r.credit, r.cover, r.submittedAt].map(csvCell).join(','));
      }
      return new Response(lines.join('\n') + '\n', {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="friendslop-submissions.csv"',
          'Cache-Control': 'no-store'
        }
      });
    }

    return Response.json({ count: rows.length, submissions: rows }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('submissions export failed', err);
    return new Response('Export failed. Check the function logs.', { status: 500 });
  }
}
