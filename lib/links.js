// Where a game is allowed to live. itch.io and Steam host the files and do the
// virus scanning, so we never touch a zip.
//
// classifyGameUrl(raw) -> { ok: true, store: 'itch' | 'steam', url }
//                       | { ok: false, reason }

const ITCH_HOST = /^([a-z0-9-]+\.)?itch\.io$/i;
const STEAM_APP = /^\/app\/\d+(\/|$)/;

export function classifyGameUrl(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return { ok: false, reason: 'Needs a full link, starting with https://.' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'Needs a full link, starting with https://.' };
  if (raw.length > 500) return { ok: false, reason: 'That link is too long.' };

  const host = u.hostname.toLowerCase();

  if (ITCH_HOST.test(host)) {
    const sub = host !== 'itch.io';
    if (sub && u.pathname.replace(/\/+$/, '') === '') return { ok: false, reason: "That's an itch.io profile. Link the game's page, like https://you.itch.io/your-game." };
    if (!sub && u.pathname.replace(/\/+$/, '') === '') return { ok: false, reason: 'Link the game page on itch.io, not the homepage.' };
    return { ok: true, store: 'itch', url: u.toString() };
  }

  if (host === 'store.steampowered.com') {
    if (!STEAM_APP.test(u.pathname)) return { ok: false, reason: 'Link the Steam store page, like https://store.steampowered.com/app/12345/Your_Game/.' };
    return { ok: true, store: 'steam', url: u.toString() };
  }

  return { ok: false, reason: "Only itch.io pages and Steam store pages, no zips or other hosts. We're not opening your .exe to find out." };
}

export const STORE_LABEL = { itch: 'itch.io', steam: 'Steam' };
