// Shared admin-key check for the export endpoints.
import { timingSafeEqual } from 'node:crypto';

export function isAdminKey(provided) {
  const expected = process.env.SIGNUP_ADMIN_KEY || '';
  const given = String(provided || '');
  if (!expected || !given || expected.length !== given.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

// Pulls the key out of a Web-standard Request: Authorization: Bearer <key> or ?key=<key>.
export function keyFromRequest(request) {
  const auth = request.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return new URL(request.url).searchParams.get('key') || '';
}
