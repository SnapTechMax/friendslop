// Votes are one tiny private blob each at votes/<gameId>/<voterHash>.json.
// Uniqueness of the pathname is the dedupe: one vote per voter per game.
import { createHash } from 'node:crypto';
import { del, head, list, put, BlobNotFoundError } from '@vercel/blob';

// Salted hash of the caller's IP. Never stored raw, never reversible without the salt.
export function voterHash(request) {
  const salt = process.env.VOTE_SALT || '';
  const xff = request.headers.get('x-forwarded-for') || '';
  const ip = (xff.split(',')[0] || request.headers.get('x-real-ip') || '').trim() || 'unknown';
  return createHash('sha256').update(salt + '|' + ip).digest('hex').slice(0, 32);
}

export function votePath(gameId, voter) {
  return 'votes/' + gameId + '/' + voter + '.json';
}

export async function hasVoted(gameId, voter) {
  try {
    await head(votePath(gameId, voter));
    return true;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return false;
    throw err;
  }
}

export async function addVote(gameId, voter) {
  await put(votePath(gameId, voter), JSON.stringify({ at: new Date().toISOString() }), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

export async function removeVote(gameId, voter) {
  await del(votePath(gameId, voter));
}

async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

export async function countVotesFor(gameId) {
  return (await listAll('votes/' + gameId + '/')).length;
}

// { gameId: count } for every game with at least one vote.
export async function countAllVotes() {
  const counts = {};
  for (const b of await listAll('votes/')) {
    const parts = b.pathname.split('/');
    if (parts.length === 3) counts[parts[1]] = (counts[parts[1]] || 0) + 1;
  }
  return counts;
}

export async function deleteVotesFor(gameId) {
  const blobs = await listAll('votes/' + gameId + '/');
  if (blobs.length) await del(blobs.map((b) => b.pathname));
  return blobs.length;
}
