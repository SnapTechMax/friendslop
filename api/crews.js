// GET /api/crews          -> { crews: [...] }  open, unheld crew calls, newest first (edge cached)
// GET /api/crews?mine=1   -> the logged-in account's own open calls, held or not (never cached)
// GET /api/crews?all=1    -> every call including expired and held, admin key required

import { isAdminRequest } from '../lib/admin.js';
import { isHeld, isOpen, publicCrew, readAllCrews, readReports, sweepExpired, withInCounts } from '../lib/crews.js';
import { getUser } from '../lib/auth.js';

export async function GET(request) {
  const url = new URL(request.url);
  const wantAll = url.searchParams.get('all') === '1';
  const wantMine = url.searchParams.get('mine') === '1';
  if (wantAll && !(await isAdminRequest(request))) {
    return new Response('Nope.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const all = await withInCounts(await readAllCrews());
    all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

    if (wantMine) {
      const auth = await getUser(request);
      if (!auth) return Response.json({ crews: [], count: 0 }, { headers: { 'Cache-Control': 'no-store' } });
      const now = Date.now();
      const own = all.filter((c) => c.userId === auth.user.id && isOpen(c, now)).map(publicCrew);
      return Response.json({ crews: own, count: own.length }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (wantAll) {
      const rows = [];
      for (const c of all) {
        const row = Object.assign(publicCrew(c), { open: isOpen(c), reports: c.reports, hidden: c.hidden });
        if (c.reports > 0) row.reportReasons = await readReports(c.id);
        rows.push(row);
      }
      return Response.json({ count: rows.length, crews: rows }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const now = Date.now();
    const open = all.filter((c) => isOpen(c, now) && !c.hidden && !isHeld(c, now)).map(publicCrew);
    // Tidy up on the way out. Stale calls are gone from the response either way.
    await sweepExpired(all);

    return Response.json({ crews: open, count: open.length }, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=120' }
    });
  } catch (err) {
    console.error('crews failed', err);
    return Response.json({ crews: [], count: 0 }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
