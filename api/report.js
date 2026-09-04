// POST   /api/report { id, reason, note? } -> { ok, reports, hidden }
//   Reports a crew call. One report per person (salted IP hash) per call.
//   Three reports hide the call from the board until an admin clears them.
// DELETE /api/report?id=<crew id>   admin key required: clears every report on the call.

import { isAdminKey, keyFromRequest } from '../lib/admin.js';
import { CREW_ID_RE, REPORT_PREFIX, REPORT_REASONS, REPORT_THRESHOLD, isOpen } from '../lib/crews.js';
import { readJson } from '../lib/submissions.js';
import { addVote, countVotesFor, deleteVotesFor, hasVoted, voterHash } from '../lib/votes.js';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  const reason = String(body.reason || '');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
  if (!CREW_ID_RE.test(id)) return json({ ok: false, message: 'Bad id.' }, 400);
  if (!REPORT_REASONS.has(reason)) return json({ ok: false, message: 'Pick a reason.' }, 400);

  try {
    const crew = await readJson('crews/' + id + '.json');
    if (!crew || !isOpen(crew)) return json({ ok: false, message: 'That crew call is gone.' }, 404);

    const voter = voterHash(request);
    const already = await hasVoted(id, voter, REPORT_PREFIX);
    if (!already) await addVote(id, voter, REPORT_PREFIX, { reason, note });
    const reports = await countVotesFor(id, REPORT_PREFIX);
    return json({ ok: true, id, already, reports, hidden: reports >= REPORT_THRESHOLD });
  } catch (err) {
    console.error('report failed', err);
    return json({ ok: false, message: 'Something broke on our end. Try again in a bit.' }, 500);
  }
}

export async function DELETE(request) {
  if (!isAdminKey(keyFromRequest(request))) return json({ ok: false, message: 'Nope.' }, 401);
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!CREW_ID_RE.test(id)) return json({ ok: false, message: 'Bad id.' }, 400);
  try {
    const cleared = await deleteVotesFor(id, REPORT_PREFIX);
    return json({ ok: true, id, cleared });
  } catch (err) {
    console.error('clear reports failed', err);
    return json({ ok: false, message: 'Something broke on our end.' }, 500);
  }
}

export function GET() {
  return json({ ok: false, message: 'POST only.' }, 405);
}
