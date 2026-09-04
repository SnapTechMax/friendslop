// Crew calls: "I have 1, need 3, tonight, here's my Discord." Stored at
// crews/<id>.json, expire on their own, and get swept once they're stale.
import { del } from '@vercel/blob';
import { readJson } from './submissions.js';
import { countAllVotes, deleteVotesFor, listAll } from './votes.js';

export const CREW_ID_RE = /^[a-z0-9]{1,16}-[a-f0-9]{6}$/;
export const IN_PREFIX = 'crewin';
export const REPORT_PREFIX = 'reports';
export const REPORT_THRESHOLD = 3;
export const REPORT_REASONS = new Set(['spam', 'scam', 'harassment', 'wrong', 'other']);
export const MAX_OPEN_PER_POSTER = 3;
// A poster's first call waits this long before the public board shows it.
export const HOLD_MINUTES = 15;

// How long a call stays up, by "when".
export const WHEN = {
  now: { label: 'right now', ttlHours: 6 },
  tonight: { label: 'tonight', ttlHours: 18 },
  tomorrow: { label: 'tomorrow', ttlHours: 36 },
  weekend: { label: 'this weekend', ttlHours: 96 },
  whenever: { label: 'whenever', ttlHours: 168 }
};

export const PLATFORMS = new Set(['any', 'pc', 'console', 'browser']);
export const CONTACT_TYPES = new Set(['discord', 'link', 'other']);

export function isOpen(crew, now = Date.now()) {
  return new Date(crew.expiresAt).getTime() > now;
}

export function isHeld(crew, now = Date.now()) {
  return !!crew.holdUntil && new Date(crew.holdUntil).getTime() > now;
}

export function posterPath(userId) {
  return 'posters/' + userId + '.json';
}

export async function readAllCrews() {
  const rows = [];
  const blobs = await listAll('crews/');
  for (let i = 0; i < blobs.length; i += 20) {
    const records = await Promise.all(blobs.slice(i, i + 20).map((b) => readJson(b.pathname)));
    for (const r of records) if (r) rows.push(r);
  }
  return rows;
}

// Attach "I'm in" and report counts. Calls at or over the report threshold are
// hidden from the public board until an admin clears the reports.
export async function withInCounts(crews) {
  const counts = crews.length ? await countAllVotes(IN_PREFIX) : {};
  const reports = crews.length ? await countAllVotes(REPORT_PREFIX) : {};
  for (const c of crews) {
    c.in = counts[c.id] || 0;
    c.reports = reports[c.id] || 0;
    c.hidden = c.reports >= REPORT_THRESHOLD;
  }
  return crews;
}

// The reasons people gave, for the admin view.
export async function readReports(id) {
  const blobs = await listAll(REPORT_PREFIX + '/' + id + '/');
  const out = [];
  for (const b of blobs) {
    const r = await readJson(b.pathname);
    if (r) out.push({ reason: r.reason || 'other', note: r.note || '', at: r.at });
  }
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return out;
}

// What the public sees. No account id.
export function publicCrew(c) {
  return {
    id: c.id,
    by: c.userName || '',
    gameId: c.gameId || null,
    gameTitle: c.gameTitle,
    gameUrl: c.gameUrl || null,
    have: c.have,
    need: c.need,
    when: c.when,
    whenNote: c.whenNote || '',
    platform: c.platform,
    region: c.region || '',
    contactType: c.contactType,
    contact: c.contact,
    note: c.note || '',
    in: c.in || 0,
    createdAt: c.createdAt,
    expiresAt: c.expiresAt,
    held: isHeld(c),
    holdUntil: isHeld(c) ? c.holdUntil : null
  };
}

export async function deleteCrew(id) {
  await del('crews/' + id + '.json');
  const claims = await deleteVotesFor(id, IN_PREFIX);
  await deleteVotesFor(id, REPORT_PREFIX);
  return claims;
}

// Remove calls that expired more than a day ago. Called from the public list,
// so the store tidies itself without a cron.
export async function sweepExpired(crews) {
  const cutoff = Date.now() - 24 * 3600 * 1000;
  const stale = crews.filter((c) => new Date(c.expiresAt).getTime() < cutoff);
  for (const c of stale) {
    try { await deleteCrew(c.id); } catch (err) { console.error('sweep failed for', c.id, err); }
  }
  return stale.length;
}
