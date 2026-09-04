// POST /api/crew-in { id } -> { ok, in, count }
// Toggles "I'm in" on an open crew call. One per person (salted IP hash), like votes.

import { CREW_ID_RE, IN_PREFIX, REPORT_PREFIX, REPORT_THRESHOLD, isOpen } from '../lib/crews.js';
import { readJson } from '../lib/submissions.js';
import { addVote, countVotesFor, hasVoted, removeVote, voterHash } from '../lib/votes.js';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!CREW_ID_RE.test(id)) return json({ ok: false, message: 'Bad id.' }, 400);

  try {
    const crew = await readJson('crews/' + id + '.json');
    if (!crew || !isOpen(crew)) return json({ ok: false, message: 'That crew call is gone.' }, 404);
    if ((await countVotesFor(id, REPORT_PREFIX)) >= REPORT_THRESHOLD) return json({ ok: false, message: 'That crew call is gone.' }, 404);

    const voter = voterHash(request);
    let on;
    if (await hasVoted(id, voter, IN_PREFIX)) {
      await removeVote(id, voter, IN_PREFIX);
      on = false;
    } else {
      await addVote(id, voter, IN_PREFIX);
      on = true;
    }
    const count = await countVotesFor(id, IN_PREFIX);
    return json({ ok: true, id, in: on, count });
  } catch (err) {
    console.error('crew-in failed', err);
    return json({ ok: false, message: 'Something broke on our end. Try again in a bit.' }, 500);
  }
}

export function GET() {
  return json({ ok: false, message: 'POST only.' }, 405);
}
