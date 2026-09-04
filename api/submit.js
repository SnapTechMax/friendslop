// POST /api/submit  (multipart form)
// Saves a game submission to Vercel Blob as submissions/<id>.json, plus an
// optional cover image at covers/<id>.<ext>. Everything starts as "pending".

import { randomBytes } from 'node:crypto';
import { put } from '@vercel/blob';
import { classifyGameUrl } from '../lib/links.js';

const MAX_COVER_BYTES = 2 * 1024 * 1024;
const IMAGE_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TAG_RE = /^[a-z0-9][a-z0-9 -]{0,19}$/;

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function field(form, name) {
  const v = form.get(name);
  return typeof v === 'string' ? v.trim() : '';
}

function parseTags(raw) {
  const seen = new Set();
  for (const part of raw.split(',')) {
    const t = part.trim().toLowerCase().replace(/\s+/g, ' ');
    if (t && TAG_RE.test(t)) seen.add(t);
    if (seen.size === 5) break;
  }
  return [...seen];
}

export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, message: 'Could not read the form. Is the cover image under 2MB?' }, 400);
  }

  // Honeypot: hidden field, only bots fill it. Pretend it worked.
  if (field(form, 'website')) return json({ ok: true, id: 'thanks', message: 'Slop received.' });

  const title = field(form, 'title');
  const url = field(form, 'url');
  const blurb = field(form, 'blurb');
  const devName = field(form, 'devName');
  const email = field(form, 'email').toLowerCase();
  const credit = field(form, 'credit');
  const onBehalf = form.get('onBehalf') === 'on';
  const confirm = form.get('confirm') === 'on';
  const minPlayers = parseInt(field(form, 'minPlayers'), 10);
  const maxPlayers = parseInt(field(form, 'maxPlayers'), 10);
  const tags = parseTags(field(form, 'tags'));

  const errors = {};
  const link = classifyGameUrl(url);
  if (!title || title.length > 80) errors.title = 'Needs a title, 80 characters or fewer.';
  if (!link.ok) errors.url = link.reason;
  if (!blurb || blurb.length > 500) errors.blurb = 'Say something about it, 500 characters or fewer.';
  if (!Number.isInteger(minPlayers) || minPlayers < 1 || minPlayers > 99) errors.minPlayers = 'Minimum players: a number from 1 to 99.';
  if (!Number.isInteger(maxPlayers) || maxPlayers < 1 || maxPlayers > 99) errors.maxPlayers = 'Maximum players: a number from 1 to 99.';
  if (!errors.minPlayers && !errors.maxPlayers && maxPlayers < minPlayers) errors.maxPlayers = 'Max has to be at least the min.';
  if (!devName || devName.length > 60) errors.devName = 'Who made it? 60 characters or fewer.';
  if (!EMAIL_RE.test(email) || email.length > 254) errors.email = 'That does not look like an email address.';
  if (onBehalf && (!credit || credit.length > 60)) errors.credit = 'If you are posting for a friend, tell us who to credit.';
  if (!confirm) errors.confirm = 'You have to tick the box.';

  const cover = form.get('cover');
  const hasCover = cover && typeof cover === 'object' && typeof cover.size === 'number' && cover.size > 0;
  let coverExt = null;
  if (hasCover) {
    coverExt = IMAGE_EXT[cover.type] || null;
    if (!coverExt) errors.cover = 'Cover has to be a PNG, JPG, GIF, or WebP.';
    else if (cover.size > MAX_COVER_BYTES) errors.cover = 'Cover has to be under 2MB.';
  }

  if (Object.keys(errors).length) {
    return json({ ok: false, message: 'Fix the marked fields and try again.', errors }, 400);
  }

  const id = Date.now().toString(36) + '-' + randomBytes(3).toString('hex');

  try {
    let coverPath = null;
    if (hasCover) {
      coverPath = 'covers/' + id + '.' + coverExt;
      await put(coverPath, await cover.arrayBuffer(), {
        access: 'private',
        contentType: cover.type,
        addRandomSuffix: false
      });
    }

    const record = {
      id,
      status: 'pending',
      title,
      url: link.url,
      store: link.store,
      blurb,
      players: { min: minPlayers, max: maxPlayers },
      tags,
      devName,
      email,
      onBehalf,
      credit: onBehalf ? credit : '',
      cover: coverPath,
      submittedAt: new Date().toISOString()
    };

    await put('submissions/' + id + '.json', JSON.stringify(record), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false
    });

    return json({ ok: true, id, message: 'Slop received.' });
  } catch (err) {
    console.error('submit failed', err);
    return json({ ok: false, message: 'Something broke on our end. Try again in a bit.' }, 500);
  }
}

export function GET() {
  return json({ ok: false, message: 'POST only.' }, 405);
}
