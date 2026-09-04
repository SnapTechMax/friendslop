# friendslop.wtf

A community for developers and gamers to come together.

## What it is

Small devs make weird, chaotic, "made-with-my-friends" games all the time and most of them never get seen. friendslop.wtf is a place to show them off, find people to play them with, and give the good ones a real shot at going viral.

## Who it's for

- **Developers** who want a low-pressure place to post friendslop projects, get playtesters, and get eyes on their work.
- **Gamers** who want to find strange, fun, early games and the people making them.

## Goals

- Make it dead simple for a small dev to post a project and get it in front of players.
- Make it easy for players to discover, play, and share projects.
- Give the community the tools to push the best stuff to a wider audience.

## Status

Landing page, signup form, game submission form, a review queue at `/admin`, and approved games showing on the front page. No voting or crew-finding yet.

## Running it

It's a static site. Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 4173
```

Then visit http://localhost:4173.

## Layout

- `index.html` — the landing page
- `css/styles.css` — all styling. Loud on purpose, readable on purpose.
- `js/main.js` — visitor counter, the ticking "bugs shipped as features" stat, and the signup form handler
- `submit.html` — the game submission page, served at `/submit`
- `js/submit.js` — client-side validation and the multipart post for submissions
- `api/signup.js` — saves a signup to Vercel Blob
- `api/signups.js` — exports the signups, admin key required
- `admin.html` — the review queue, served at `/admin`, unlocked with the admin key
- `js/admin.js` — lists submissions and calls the review endpoint
- `api/submit.js` — validates a game submission and saves it plus its cover image
- `api/submissions.js` — exports the submissions, admin key required
- `api/review.js` — approve, reject, pull, or delete a submission; rebuilds the approved index
- `api/games.js` — public list of approved games, read by the front page
- `api/cover.js` — streams a submission's cover image out of the private store
- `api/stats.js` — public counts of submissions and approved games, used by the front page
- `lib/admin.js` — shared admin key check
- `lib/submissions.js` — shared blob helpers and the approved-index rebuild
- `vercel.json` — `cleanUrls` so `/submit.html` is reachable as `/submit`

## Signup form

The form posts JSON (`{ email, role, website }`) to `/api/signup`, a Vercel function in `api/signup.js`. Each signup is stored as a private blob in the Vercel Blob store `friendslop-signups`, one file per email at `signups/<sha256 of the email>.json`, so signing up twice is a no-op. The `website` field is a hidden honeypot: if a bot fills it in, the function says thanks and saves nothing.

To download the list, call `/api/signups` with the admin key. CSV by default, `?format=json` for JSON:

```bash
curl -H "Authorization: Bearer $SIGNUP_ADMIN_KEY" https://friendslop.wtf/api/signups -o signups.csv
```

The key is the `SIGNUP_ADMIN_KEY` environment variable on the Vercel project. `vercel env pull .env.local` copies it and the blob token into a local `.env.local`, which is gitignored.

## Game submissions

`/submit` posts a multipart form to `/api/submit`. The function validates every field, drops honeypot hits, and writes `submissions/<id>.json` to the same Blob store, plus `covers/<id>.<ext>` when a cover image was attached (PNG, JPG, GIF, or WebP under 2MB). Every submission starts with `status: "pending"`. Nothing is shown publicly yet.

A submission record looks like:

```json
{
  "id": "mtn9phtp-503ce1",
  "status": "pending",
  "title": "Untitled Physics Thing",
  "url": "https://example.itch.io/untitled-physics-thing",
  "blurb": "Four of you run a haunted deli.",
  "players": { "min": 2, "max": 4 },
  "tags": ["physics", "horror"],
  "devName": "me and dave",
  "email": "dev@example.com",
  "onBehalf": false,
  "credit": "",
  "cover": "covers/mtn9phtp-503ce1.png",
  "submittedAt": "2026-09-04T18:08:46.729Z"
}
```

To see the queue, call `/api/submissions` with the admin key. JSON by default, `?format=csv` for a flat CSV:

```bash
curl -H "Authorization: Bearer $SIGNUP_ADMIN_KEY" https://friendslop.wtf/api/submissions
```

Covers are served at `/api/cover?id=<submission id>`. `/api/stats` returns `{ "submissions": <count>, "approved": <count> }` and feeds the front page's lobby status box.

## Reviewing submissions

Open `/admin`, paste the admin key, and you get the queue: Pending, Approved, Rejected, All. Each card has Approve, Reject, Pull it (back to pending), Back to queue, and Delete, plus a private note field. The page remembers the key in localStorage until you hit "Forget key". It isn't linked from anywhere and carries a `noindex` tag.

Under the hood, `POST /api/review` with `{ "id", "status", "note" }` updates the record, and `DELETE /api/review?id=<id>` removes the record and its cover. After every change the function rebuilds `index/approved.json`, a single blob holding the public fields of every approved game, newest approval first. That's what `/api/games` serves, cached at the edge for 30 seconds, so a freshly approved game can take up to half a minute to appear.

The front page fetches `/api/games` and, when there is at least one approved game, swaps the three placeholder cards for real ones. Titles and blurbs are rendered as text, never as HTML.

```bash
# approve from the command line
curl -X POST https://friendslop.wtf/api/review -H "Authorization: Bearer $SIGNUP_ADMIN_KEY" \
  -H "Content-Type: application/json" -d '{"id":"<id>","status":"approved"}'
```

## Local development

```bash
npm install
vercel env pull .env.local
vercel dev
```

`vercel dev` serves the static site and runs the functions in `api/`.

## Style notes

Geocities energy, on purpose: Comic Sans, a pale lilac page over a grape/lime striped background, acid lime, grape purple, tangerine and hot pink accents, deep plum ridge and double borders, hard shadows, slightly rotated cards, a marquee, an amber-on-black "lobby status" box, and a hit counter. The structure nods to gamerbf.com; the palette is its own. The copy is deadpan but explains what the site actually does.

## Deployment

The site is hosted on Vercel, project `friendslop`. The GitHub repo is connected, so every push to `main` deploys to production. Preview deployments are created for other branches and pull requests.

DNS lives at Namecheap and points at Vercel:

| Type  | Host | Value                                  |
| ----- | ---- | -------------------------------------- |
| A     | @    | 216.198.79.1                           |
| CNAME | www  | 2617a4284173be61.vercel-dns-017.com    |

Vercel's older generic values (A `76.76.21.21`, CNAME `cname.vercel-dns.com`) also work. `www.friendslop.wtf` redirects to `friendslop.wtf`.

Manual deploy from this folder, if ever needed:

```bash
vercel deploy --prod
```
