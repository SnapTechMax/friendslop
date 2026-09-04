// One-per-person toggles stored as tiny private blobs at <prefix>/<id>/<voterHash>.json.
// Used for game upvotes (prefix "votes") and crew "I'm in" claims (prefix "crewin").
// Uniqueness of the pathname is the dedupe: one per voter per id.
import { createHash } from 'node:crypto';
import { del, head, list, put, BlobNotFoundError } from '@vercel/blob';

// Salted hash of the caller's IP. Never stored raw, never reversible without the salt.
export function voterHash(request) {
  const salt = process.env.VOTE_SALT || '';
  const xff = request.headers.get('x-forwarded-for') || '';
  const ip = (xff.split(',')[0] || request.headers.get('x-real-ip') || '').trim() || 'unknown';
  return createHash('sha256').update(salt + '|' + ip).digest('hex').slice(0, 32);
}

export function votePath(id, voter, prefix = 'votes') {
  return prefix + '/' + id + '/' + voter + '.json';
}

export async function hasVoted(id, voter, prefix = 'votes') {
  try {
    await head(votePath(id, voter, prefix));
    return true;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return false;
    throw err;
  }
}

export async function addVote(id, voter, prefix = 'votes') {
  await put(votePath(id, voter, prefix), JSON.stringify({ at: new Date().toISOString() }), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

export async function removeVote(id, voter, prefix = 'votes') {
  await del(votePath(id, voter, prefix));
}

export async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

export async function countVotesFor(id, prefix = 'votes') {
  return (await listAll(prefix + '/' + id + '/')).length;
}

// { id: count } for every id with at least one vote under the prefix.
export async function countAllVotes(prefix = 'votes') {
  const counts = {};
  for (const b of await listAll(prefix + '/')) {
    const parts = b.pathname.split('/');
    if (parts.length === 3) counts[parts[1]] = (counts[parts[1]] || 0) + 1;
  }
  return counts;
}

export async function deleteVotesFor(id, prefix = 'votes') {
  const blobs = await listAll(prefix + '/' + id + '/');
  if (blobs.length) await del(blobs.map((b) => b.pathname));
  return blobs.length;
}
