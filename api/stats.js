// GET /api/stats -> { submissions, approved, votes, crews }  (crews = open crew calls)
// Cached at the edge for a minute so the front page doesn't hammer the store.

import { list } from '@vercel/blob';
import { INDEX_PATH, readJson } from '../lib/submissions.js';
import { countAllVotes } from '../lib/votes.js';
import { isHeld, isOpen, readAllCrews, withInCounts } from '../lib/crews.js';

export async function GET() {
  try {
    let submissions = 0;
    let cursor;
    do {
      const page = await list({ prefix: 'submissions/', limit: 1000, cursor, mode: 'folded' });
      submissions += page.blobs.length;
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    const index = await readJson(INDEX_PATH);
    const approved = index && Array.isArray(index.games) ? index.games.length : 0;
    const counts = await countAllVotes();
    const votes = Object.values(counts).reduce((a, b) => a + b, 0);
    const crews = (await withInCounts(await readAllCrews())).filter((c) => isOpen(c) && !c.hidden && !isHeld(c)).length;

    return Response.json({ submissions, approved, votes, crews }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
    });
  } catch (err) {
    console.error('stats failed', err);
    return Response.json({ submissions: null, approved: null, votes: null, crews: null }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
