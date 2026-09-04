// GET /api/cover?id=<submission id>      streams a submission's cover image
// GET /api/cover?avatar=<username>       streams that account's avatar
// Both come out of the private blob store.

import { get, list } from '@vercel/blob';
import { usernamePath } from '../lib/auth.js';
import { readJson } from '../lib/submissions.js';

const ID_RE = /^[a-z0-9]{1,16}-[a-f0-9]{6}$/;
const USER_RE = /^[A-Za-z0-9_.-]{1,32}$/;
const MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const id = params.get('id') || '';
  const avatarOf = params.get('avatar') || '';

  try {
    let prefix;
    if (avatarOf) {
      if (!USER_RE.test(avatarOf)) return new Response('Bad username.', { status: 400 });
      const ref = await readJson(usernamePath(avatarOf));
      if (!ref || !ref.userId) return new Response('No avatar.', { status: 404 });
      prefix = 'avatars/' + ref.userId + '.';
    } else {
      if (!ID_RE.test(id)) return new Response('Bad id.', { status: 400 });
      prefix = 'covers/' + id + '.';
    }

    const { blobs } = await list({ prefix, limit: 1 });
    if (!blobs.length) return new Response(avatarOf ? 'No avatar.' : 'No cover.', { status: 404 });

    const result = await get(blobs[0].pathname, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return new Response('Not found.', { status: 404 });

    const ext = blobs[0].pathname.split('.').pop();
    return new Response(result.stream, {
      headers: {
        'Content-Type': MIME[ext] || result.contentType || 'application/octet-stream',
        'Cache-Control': avatarOf ? 'public, max-age=300, s-maxage=300' : 'public, max-age=3600, s-maxage=86400'
      }
    });
  } catch (err) {
    console.error('cover failed', err);
    return new Response('Image failed.', { status: 500 });
  }
}
