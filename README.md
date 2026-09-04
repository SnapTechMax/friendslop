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

Landing page with a working signup form. Nothing else yet.

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
- `api/signup.js` — saves a signup to Vercel Blob
- `api/signups.js` — exports the signups, admin key required

## Signup form

The form posts JSON (`{ email, role, website }`) to `/api/signup`, a Vercel function in `api/signup.js`. Each signup is stored as a private blob in the Vercel Blob store `friendslop-signups`, one file per email at `signups/<sha256 of the email>.json`, so signing up twice is a no-op. The `website` field is a hidden honeypot: if a bot fills it in, the function says thanks and saves nothing.

To download the list, call `/api/signups` with the admin key. CSV by default, `?format=json` for JSON:

```bash
curl -H "Authorization: Bearer $SIGNUP_ADMIN_KEY" https://friendslop.wtf/api/signups -o signups.csv
```

The key is the `SIGNUP_ADMIN_KEY` environment variable on the Vercel project. `vercel env pull .env.local` copies it and the blob token into a local `.env.local`, which is gitignored.

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
