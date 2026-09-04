// GET /api/stats -> { submissions: <count> }
// Cached at the edge for a minute so the front page doesn't hammer the store.

import { list } from '@vercel/blob';

export async function GET() {
  try {
    let submissions = 0;
    let cursor;
    do {
      const page = await list({ prefix: 'submissions/', limit: 1000, cursor, mode: 'folded' });
      submissions += page.blobs.length;
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    return Response.json({ submissions }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' }
    });
  } catch (err) {
    console.error('stats failed', err);
    return Response.json({ submissions: null }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
