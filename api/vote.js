// POST /api/vote { id } -> { ok, voted, count }
// Toggles the logged-in account's vote on an approved game. One vote per account per game.

import { requireUser } from '../lib/auth.js';
import { ID_RE, INDEX_PATH, readJson } from '../lib/submissions.js';
import { addVote, countVotesFor, hasVoted, removeVote } from '../lib/votes.js';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  if (!ID_RE.test(id)) return json({ ok: false, message: 'Bad id.' }, 400);

  try {
    const index = await readJson(INDEX_PATH);
    const live = index && Array.isArray(index.games) && index.games.some((g) => g.id === id);
    if (!live) return json({ ok: false, message: 'That game is not on the front page.' }, 404);

    const voter = auth.user.id;
    let voted;
    if (await hasVoted(id, voter)) {
      await removeVote(id, voter);
      voted = false;
    } else {
      await addVote(id, voter);
      voted = true;
    }
    const count = await countVotesFor(id);
    return json({ ok: true, id, voted, count });
  } catch (err) {
    console.error('vote failed', err);
    return json({ ok: false, message: 'Something broke on our end. Try again in a bit.' }, 500);
  }
}

export function GET() {
  return json({ ok: false, message: 'POST only.' }, 405);
}
