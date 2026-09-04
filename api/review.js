// POST   /api/review  { id, status: "approved" | "rejected" | "pending", note?, notify? }
// DELETE /api/review?id=<id>
// Admin only. Updates a submission and rebuilds the public approved-games index.
// Approving emails the dev once (or again when notify is true).

import { del, list } from '@vercel/blob';
import { isAdminKey, keyFromRequest } from '../lib/admin.js';
import { sendApprovalEmail } from '../lib/mail.js';
import { ID_RE, STATUSES, readJson, writeJson, rebuildApprovedIndex } from '../lib/submissions.js';
import { deleteVotesFor } from '../lib/votes.js';

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  if (!isAdminKey(keyFromRequest(request))) return json({ ok: false, message: 'Nope.' }, 401);

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || '');
  const status = String(body.status || '');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null;
  const forceNotify = body.notify === true;

  if (!ID_RE.test(id)) return json({ ok: false, message: 'Bad id.' }, 400);
  if (!STATUSES.has(status)) return json({ ok: false, message: 'Status has to be pending, approved, or rejected.' }, 400);

  try {
    const path = 'submissions/' + id + '.json';
    const record = await readJson(path);
    if (!record) return json({ ok: false, message: 'No submission with that id.' }, 404);

    const now = new Date().toISOString();
    record.status = status;
    record.reviewedAt = now;
    if (note !== null && note !== '') record.note = note;
    if (status === 'approved') record.approvedAt = record.approvedAt || now;
    else delete record.approvedAt;

    // Email the dev the first time a game is approved. notify: true resends.
    let email = null;
    if (status === 'approved' && (forceNotify || !record.notifiedAt)) {
      email = await sendApprovalEmail(record);
      if (email.sent) {
        record.notifiedAt = new Date().toISOString();
        delete record.notifyError;
      } else {
        record.notifyError = email.error;
      }
    }

    await writeJson(path, record);
    const games = await rebuildApprovedIndex();
    return json({ ok: true, id, status, record, approvedCount: games.length, email });
  } catch (err) {
    console.error('review failed', err);
    return json({ ok: false, message: 'Something broke on our end.' }, 500);
  }
}

export async function DELETE(request) {
  if (!isAdminKey(keyFromRequest(request))) return json({ ok: false, message: 'Nope.' }, 401);

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!ID_RE.test(id)) return json({ ok: false, message: 'Bad id.' }, 400);

  try {
    const path = 'submissions/' + id + '.json';
    const record = await readJson(path);
    if (!record) return json({ ok: false, message: 'No submission with that id.' }, 404);

    const doomed = [path];
    const { blobs } = await list({ prefix: 'covers/' + id + '.', limit: 5 });
    for (const b of blobs) doomed.push(b.pathname);
    await del(doomed);
    const votesDeleted = await deleteVotesFor(id);

    const games = await rebuildApprovedIndex();
    return json({ ok: true, id, deleted: doomed, votesDeleted, approvedCount: games.length });
  } catch (err) {
    console.error('delete failed', err);
    return json({ ok: false, message: 'Something broke on our end.' }, 500);
  }
}
