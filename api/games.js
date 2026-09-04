// GET /api/games -> { games: [...], updatedAt }
// Public list of approved games with vote counts, most votes first, newest
// approval first when tied. Read from the index that /api/review maintains.

import { INDEX_PATH, readJson } from '../lib/submissions.js';
import { countAllVotes } from '../lib/votes.js';

export async function GET() {
  try {
    const index = await readJson(INDEX_PATH);
    const games = (index && index.games) || [];
    const counts = games.length ? await countAllVotes() : {};
    for (const g of games) g.votes = counts[g.id] || 0;
    games.sort((a, b) => (b.votes - a.votes) || String(b.approvedAt).localeCompare(String(a.approvedAt)));

    return Response.json(
      { games, updatedAt: (index && index.updatedAt) || null },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' } }
    );
  } catch (err) {
    console.error('games failed', err);
    return Response.json({ games: [], updatedAt: null }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
