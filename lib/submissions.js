// Shared helpers for reading and writing submission records in Vercel Blob.
import { BlobNotFoundError, get, list, put } from '@vercel/blob';

export const ID_RE = /^[a-z0-9]{1,16}-[a-f0-9]{6}$/;
export const INDEX_PATH = 'index/approved.json';
export const STATUSES = new Set(['pending', 'approved', 'rejected']);

export async function readJson(pathname) {
  try {
    const result = await get(pathname, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return JSON.parse(await new Response(result.stream).text());
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

export async function writeJson(pathname, data) {
  await put(pathname, JSON.stringify(data), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

export async function readAllSubmissions() {
  const rows = [];
  let cursor;
  do {
    const page = await list({ prefix: 'submissions/', limit: 1000, cursor });
    // Read in small batches so a long queue doesn't fire hundreds of requests at once.
    for (let i = 0; i < page.blobs.length; i += 20) {
      const batch = page.blobs.slice(i, i + 20);
      const records = await Promise.all(batch.map((b) => readJson(b.pathname)));
      for (const r of records) if (r) rows.push(r);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return rows;
}

// The fields a game shows to the public. No email, no notes.
export function publicGame(r) {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    store: r.store || null,
    blurb: r.blurb,
    players: r.players,
    tags: r.tags || [],
    devName: r.devName,
    onBehalf: !!r.onBehalf,
    credit: r.credit || '',
    hasCover: !!r.cover,
    approvedAt: r.approvedAt || null,
    submittedAt: r.submittedAt
  };
}

// Recomputes index/approved.json from every submission. Called after each review
// action, so the public list can never drift from the records.
export async function rebuildApprovedIndex() {
  const all = await readAllSubmissions();
  const games = all
    .filter((r) => r.status === 'approved')
    .map(publicGame)
    .sort((a, b) => String(b.approvedAt).localeCompare(String(a.approvedAt)));
  await writeJson(INDEX_PATH, { games, updatedAt: new Date().toISOString() });
  return games;
}
