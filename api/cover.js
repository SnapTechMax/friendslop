// GET /api/cover?id=<submission id>
// Streams a submission's cover image out of the private blob store.

import { get, list } from '@vercel/blob';

const ID_RE = /^[a-z0-9]{1,16}-[a-f0-9]{6}$/;
const MIME = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export async function GET(request) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!ID_RE.test(id)) return new Response('Bad id.', { status: 400 });

  try {
    const { blobs } = await list({ prefix: 'covers/' + id + '.', limit: 1 });
    if (!blobs.length) return new Response('No cover.', { status: 404 });

    const result = await get(blobs[0].pathname, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return new Response('No cover.', { status: 404 });

    const ext = blobs[0].pathname.split('.').pop();
    return new Response(result.stream, {
      headers: {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400'
      }
    });
  } catch (err) {
    console.error('cover failed', err);
    return new Response('Cover failed.', { status: 500 });
  }
}
