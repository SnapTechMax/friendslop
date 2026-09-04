// GET /api/stats -> { submissions: <count>, approved: <count> }
// Cached at the edge for a minute so the front page doesn't hammer the store.

import { list } from '@vercel/blob';
import { INDEX_PATH, readJson } from '../lib/submissions.js';

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

    return Response.json({ submissions, approved }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
    });
  } catch (err) {
    console.error('stats failed', err);
    return Response.json({ submissions: null, approved: null }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
