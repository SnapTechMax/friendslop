// GET /api/games -> { games: [...], updatedAt }
// Public list of approved games, read from the index that /api/review maintains.

import { INDEX_PATH, readJson } from '../lib/submissions.js';

export async function GET() {
  try {
    const index = await readJson(INDEX_PATH);
    return Response.json(
      { games: (index && index.games) || [], updatedAt: (index && index.updatedAt) || null },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300' } }
    );
  } catch (err) {
    console.error('games failed', err);
    return Response.json({ games: [], updatedAt: null }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
