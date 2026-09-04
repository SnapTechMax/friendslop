// One-per-person toggles stored as tiny private blobs at <prefix>/<id>/<voter>.json.
// Used for game upvotes (prefix "votes"), crew "I'm in" claims (prefix "crewin"),
// and crew reports (prefix "reports"). The voter is the account id, so the
// pathname itself enforces one per person per id.
import { del, head, list, put, BlobNotFoundError } from '@vercel/blob';

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

export async function addVote(id, voter, prefix = 'votes', extra = {}) {
  await put(votePath(id, voter, prefix), JSON.stringify(Object.assign({ at: new Date().toISOString() }, extra)), {
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
