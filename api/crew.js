// One function for everything you can do to a crew call (Hobby plan caps
// deployments at 12 functions, so related actions share one):
//
// POST   /api/crew                 (json) -> { ok, id, crew }          post a call (logged in)
// POST   /api/crew?action=in       { id } -> { ok, in, count }          toggle "I'm in"
// POST   /api/crew?action=report   { id, reason, note? }               report a call
// POST   /api/crew?action=release  { id }   with the admin key          end a first-post hold early
// DELETE /api/crew?id=<id>                 poster (logged in) or admin key removes a call
// DELETE /api/crew?id=<id>&action=reports  with the admin key           admin clears its reports

import { randomBytes } from 'node:crypto';
import { isAdminKey, keyFromRequest } from '../lib/admin.js';
import { getUser, hasFetchHeader, requireUser } from '../lib/auth.js';
import { CONTACT_TYPES, CREW_ID_RE, HOLD_MINUTES, IN_PREFIX, MAX_OPEN_PER_POSTER, PLATFORMS, REPORT_PREFIX, REPORT_REASONS, REPORT_THRESHOLD, WHEN, deleteCrew, isHeld, isOpen, posterPath, publicCrew, readAllCrews } from '../lib/crews.js';
import { ID_RE, INDEX_PATH, readJson, writeJson } from '../lib/submissions.js';
import { addVote, countVotesFor, deleteVotesFor, hasVoted, removeVote } from '../lib/votes.js';

const DISCORD_RE = /^[\w.#\- ]{2,40}$/;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max + 1) : '';
}

function validUrl(raw) {
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') && raw.length <= 300;
  } catch { return false; }
}

async function toggleIn(request, body) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const id = String(body.id || '');
  if (!CREW_ID_RE.test(id)) return json({ ok: false, message: 'Bad id.' }, 400);
  try {
    const crew = await readJson('crews/' + id + '.json');
    if (!crew || !isOpen(crew)) return json({ ok: false, message: 'That crew call is gone.' }, 404);
    if (isHeld(crew)) return json({ ok: false, message: 'That call is still on hold.' }, 404);
    if ((await countVotesFor(id, REPORT_PREFIX)) >= REPORT_THRESHOLD) return json({ ok: false, message: 'That crew call is gone.' }, 404);

    const voter = auth.user.id;
    let on;
    if (await hasVoted(id, voter, IN_PREFIX)) {
      await removeVote(id, voter, IN_PREFIX);
      on = false;
    } else {
      await addVote(id, voter, IN_PREFIX);
      on = true;
    }
    const count = await countVotesFor(id, IN_PREFIX);
    return json({ ok: true, id, in: on, count });
  } catch (err) {
    console.error('crew-in failed', err);
    return json({ ok: false, message: 'Something broke on our end. Try again in a bit.' }, 500);
  }
}

async function report(request, body) {
  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const id = String(body.id || '');
  const reason = String(body.reason || '');
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
  if (!CREW_ID_RE.test(id)) return json({ ok: false, message: 'Bad id.' }, 400);
  if (!REPORT_REASONS.has(reason)) return json({ ok: false, message: 'Pick a reason.' }, 400);
  try {
    const crew = await readJson('crews/' + id + '.json');
    if (!crew || !isOpen(crew)) return json({ ok: false, message: 'That crew call is gone.' }, 404);

    const voter = auth.user.id;
    const already = await hasVoted(id, voter, REPORT_PREFIX);
    if (!already) await addVote(id, voter, REPORT_PREFIX, { reason, note });
    const reports = await countVotesFor(id, REPORT_PREFIX);
    return json({ ok: true, id, already, reports, hidden: reports >= REPORT_THRESHOLD });
  } catch (err) {
    console.error('report failed', err);
    return json({ ok: false, message: 'Something broke on our end. Try again in a bit.' }, 500);
  }
}

async function release(request, body) {
  if (!isAdminKey(keyFromRequest(request))) return json({ ok: false, message: 'Nope.' }, 401);
  const id = String(body.id || '');
  if (!CREW_ID_RE.test(id)) return json({ ok: false, message: 'Bad id.' }, 400);
  try {
    const path = 'crews/' + id + '.json';
    const crew = await readJson(path);
    if (!crew) return json({ ok: false, message: 'No crew call with that id.' }, 404);
    delete crew.holdUntil;
    crew.releasedAt = new Date().toISOString();
    await writeJson(path, crew);
    return json({ ok: true, id, crew: publicCrew(crew) });
  } catch (err) {
    console.error('release failed', err);
    return json({ ok: false, message: 'Something broke on our end.' }, 500);
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const action = new URL(request.url).searchParams.get('action') || '';
  if (action === 'in') return toggleIn(request, body);
  if (action === 'report') return report(request, body);
  if (action === 'release') return release(request, body);
  if (action) return json({ ok: false, message: 'Unknown action.' }, 400);

  const auth = await requireUser(request);
  if (auth.response) return auth.response;
  const user = auth.user;

  // Honeypot: hidden field, only bots fill it. Pretend it worked.
  if (str(body.website, 10)) return json({ ok: true, id: 'thanks', crew: null });

  const gameId = str(body.gameId, 40);
  let gameTitle = str(body.gameTitle, 80);
  const have = parseInt(body.have, 10);
  const need = parseInt(body.need, 10);
  const when = str(body.when, 20);
  const whenNote = str(body.whenNote, 60);
  const platform = str(body.platform, 20) || 'any';
  const region = str(body.region, 30);
  const contactType = str(body.contactType, 20);
  const contact = str(body.contact, 120);
  const note = str(body.note, 200);

  const errors = {};
  let gameUrl = null;

  try {
    if (gameId) {
      if (!ID_RE.test(gameId)) errors.gameId = 'Pick a game from the list.';
      else {
        const index = await readJson(INDEX_PATH);
        const game = index && Array.isArray(index.games) ? index.games.find((g) => g.id === gameId) : null;
        if (!game) errors.gameId = 'That game is not on the front page.';
        else { gameTitle = game.title; gameUrl = game.url; }
      }
    } else if (!gameTitle || gameTitle.length > 80) {
      errors.gameTitle = 'What are you playing? 80 characters or fewer.';
    }
    if (!Number.isInteger(have) || have < 1 || have > 15) errors.have = 'How many do you have already? 1 to 15.';
    if (!Number.isInteger(need) || need < 1 || need > 15) errors.need = 'How many more do you need? 1 to 15.';
    if (!WHEN[when]) errors.when = 'Pick when.';
    if (whenNote.length > 60) errors.whenNote = '60 characters or fewer.';
    if (!PLATFORMS.has(platform)) errors.platform = 'Pick a platform.';
    if (region.length > 30) errors.region = '30 characters or fewer.';
    if (!CONTACT_TYPES.has(contactType)) errors.contactType = 'How should people reach you?';
    else if (!contact || contact.length > 120) errors.contact = 'People need a way to reach you. 120 characters or fewer.';
    else if (contactType === 'link' && !validUrl(contact)) errors.contact = 'Needs a full link, starting with http:// or https://.';
    else if (contactType === 'discord' && !DISCORD_RE.test(contact)) errors.contact = 'That does not look like a Discord username.';
    if (note.length > 200) errors.note = '200 characters or fewer.';

    if (Object.keys(errors).length) return json({ ok: false, message: 'Fix the marked fields and try again.', errors }, 400);

    const open = (await readAllCrews()).filter((c) => c.userId === user.id && isOpen(c));
    if (open.length >= MAX_OPEN_PER_POSTER) {
      return json({ ok: false, message: 'You already have ' + open.length + ' crew calls up. Delete one first.' }, 429);
    }

    // First call from this account? Hold it off the public board for a bit.
    const seenBefore = await readJson(posterPath(user.id));
    const now = new Date();
    const holdUntil = seenBefore ? null : new Date(now.getTime() + HOLD_MINUTES * 60 * 1000).toISOString();

    const id = now.getTime().toString(36) + '-' + randomBytes(3).toString('hex');
    const crew = {
      id,
      gameId: gameId || null,
      gameTitle,
      gameUrl,
      have,
      need,
      when,
      whenNote,
      platform,
      region,
      contactType,
      contact,
      note,
      userId: user.id,
      userName: user.name,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + WHEN[when].ttlHours * 3600 * 1000).toISOString()
    };
    if (holdUntil) crew.holdUntil = holdUntil;
    await writeJson('crews/' + id + '.json', crew);
    if (!seenBefore) await writeJson(posterPath(user.id), { firstPostAt: now.toISOString(), firstCallId: id });

    return json({ ok: true, id, held: !!holdUntil, holdUntil, holdMinutes: HOLD_MINUTES, crew: publicCrew(Object.assign({ in: 0 }, crew)) });
  } catch (err) {
    console.error('crew post failed', err);
    return json({ ok: false, message: 'Something broke on our end. Try again in a bit.' }, 500);
  }
}

export async function DELETE(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const action = url.searchParams.get('action') || '';
  if (!CREW_ID_RE.test(id)) return json({ ok: false, message: 'Bad id.' }, 400);

  if (action === 'reports') {
    if (!isAdminKey(keyFromRequest(request))) return json({ ok: false, message: 'Nope.' }, 401);
    try {
      const cleared = await deleteVotesFor(id, REPORT_PREFIX);
      return json({ ok: true, id, cleared });
    } catch (err) {
      console.error('clear reports failed', err);
      return json({ ok: false, message: 'Something broke on our end.' }, 500);
    }
  }
  if (action) return json({ ok: false, message: 'Unknown action.' }, 400);

  try {
    const crew = await readJson('crews/' + id + '.json');
    if (!crew) return json({ ok: false, message: 'No crew call with that id.' }, 404);

    const admin = isAdminKey(keyFromRequest(request));
    let owner = false;
    if (!admin && hasFetchHeader(request)) {
      const auth = await getUser(request);
      owner = !!auth && auth.user.id === crew.userId;
    }
    if (!admin && !owner) return json({ ok: false, message: 'Not yours.' }, 403);

    const claims = await deleteCrew(id);
    return json({ ok: true, id, claimsDeleted: claims });
  } catch (err) {
    console.error('crew delete failed', err);
    return json({ ok: false, message: 'Something broke on our end.' }, 500);
  }
}
