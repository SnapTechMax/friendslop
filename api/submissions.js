// GET /api/submissions             -> JSON list of every submission, newest first
// GET /api/submissions?format=csv  -> flat CSV
// Requires the admin key: "Authorization: Bearer <key>" or "?key=<key>".

import { isAdminKey, keyFromRequest } from '../lib/admin.js';
import { readAllSubmissions } from '../lib/submissions.js';
import { countAllVotes } from '../lib/votes.js';

function csvCell(value) {
  const s = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function GET(request) {
  if (!isAdminKey(keyFromRequest(request))) {
    return new Response('Nope.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const rows = await readAllSubmissions();
    const counts = await countAllVotes();
    for (const r of rows) r.votes = counts[r.id] || 0;
    rows.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));

    const format = new URL(request.url).searchParams.get('format');
    if (format === 'csv') {
      const cols = ['id', 'status', 'votes', 'title', 'url', 'minPlayers', 'maxPlayers', 'tags', 'devName', 'email', 'onBehalf', 'credit', 'cover', 'submittedAt', 'reviewedAt', 'approvedAt', 'note'];
      const lines = [cols.join(',')];
      for (const r of rows) {
        lines.push([r.id, r.status, r.votes, r.title, r.url, r.players?.min, r.players?.max, r.tags, r.devName, r.email, r.onBehalf, r.credit, r.cover, r.submittedAt, r.reviewedAt, r.approvedAt, r.note].map(csvCell).join(','));
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
