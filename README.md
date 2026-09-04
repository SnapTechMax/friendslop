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

Landing page, signup form, game submission form, a review queue at `/admin`, approved games on the front page with upvotes, a crew board at `/crews`, and approval emails once a Resend key is set.

## Running it

It's a static site. Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 4173
```

Then visit http://localhost:4173.

## Layout

- `index.html` — the landing page
- `css/styles.css` — all styling. Loud on purpose, readable on purpose.
- `js/main.js` — visitor counter, the ticking "bugs shipped as features" stat, the signup form handler, and the front-page game cards
- `js/vote.js` — the shared upvote button
- `top.html` / `js/top.js` — the Top Slop leaderboard at `/top`
- `submit.html` — the game submission page, served at `/submit`
- `js/submit.js` — client-side validation and the multipart post for submissions
- `api/signup.js` — POST saves a signup to Vercel Blob; GET exports them, admin key required
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
- `lib/mail.js` — the approval email and the Resend call
- `lib/links.js` — which game links are allowed (itch.io and Steam) and which store a link is
- `api/auth.js` — register, login, logout, verify, reset, change password, OAuth start and callback
- `lib/auth.js` — password hashing, sessions, cookies, one-time tokens, rate limits
- `lib/oauth.js` — Discord, Google, and GitHub provider config and token exchange
- `login.html` / `js/login.js`, `profile.html` / `js/profile.js`, `reset.html`, `verify.html` — the account pages
- `js/auth.js` — shared: who am I, the nav slot, and the "log in first" gate
- `api/vote.js` — toggles an upvote on an approved game
- `lib/votes.js` — one-per-person toggle storage, used by votes and crew "I'm in"
- `crews.html` / `js/crews.js` — the crew board at `/crews`
- `api/crews.js` — lists crew calls; `api/crew.js` — post, delete, "I'm in", report, and clear reports, picked by `?action=`
- `lib/crews.js` — crew storage, expiry, and the sweep
- `vercel.json` — `cleanUrls` so `/submit.html` is reachable as `/submit`

## Signup form

The form posts JSON (`{ email, role, website }`) to `/api/signup`, a Vercel function in `api/signup.js`. Each signup is stored as a private blob in the Vercel Blob store `friendslop-signups`, one file per email at `signups/<sha256 of the email>.json`, so signing up twice is a no-op. The `website` field is a hidden honeypot: if a bot fills it in, the function says thanks and saves nothing.

To download the list, send a GET to `/api/signup` with the admin key. CSV by default, `?format=json` for JSON:

```bash
curl -H "Authorization: Bearer $SIGNUP_ADMIN_KEY" https://friendslop.wtf/api/signup -o signups.csv
```

The key is the `SIGNUP_ADMIN_KEY` environment variable on the Vercel project. `vercel env pull .env.local` copies it and the blob token into a local `.env.local`, which is gitignored.

## Accounts

Posting a game, calling a crew, joining one, reporting one, and voting all need an account. Reading, the leaderboard, and the newsletter signup don't. Everything lives in `api/auth.js` behind `?action=`, with helpers in `lib/auth.js` and `lib/oauth.js`.

**Usernames.** Every account has a unique username, 4 to 32 characters of letters, numbers, dots, dashes, and underscores, unique case-insensitively (`usernames/<lowercase>.json` is the claim, written with overwrite disabled). It's chosen at sign-up and changeable on `/profile`, five times a day, with a live availability check. Renaming rewrites the "by" name on the account's existing submissions and crew calls. Accounts created through OAuth get a provisional username from the provider's display name and are nudged to change it. A handful of names like admin, owner, and staff are reserved.

**Roles.** A user record can carry `role: "owner"` or `role: "admin"`. Staff get a badge in the tab strip and on their profile, and `/admin` lets them in on their session (with the fetch header) instead of the key. The key still works. Roles are set by editing the user record; there's no UI for it.

**Email and password.** Sign up with a username, an email, and a password of 8+ characters. Passwords are hashed with scrypt (N=2^15, r=8, p=1, 16-byte salt, 64-byte key) and compared in constant time. Sessions are random 256-bit tokens stored server-side under `sessions/<user>/`, hashed at rest, sent as an `HttpOnly; Secure; SameSite=Lax` cookie for 30 days. Every cookie-authenticated write must carry `X-Requested-With: fetch`, which a cross-site form can't add, so that's the CSRF check. Login is limited to 10 attempts per IP and email per 15 minutes; sign-ups to 10 per IP per hour. Email uniqueness is enforced by writing `emails/<sha256>.json` with overwrite disabled.

**Verification and reset** go out through the same Resend setup as approval emails. Verification links last 24 hours, reset links one hour, both single-use. Resetting the password logs out every other session. Until `RESEND_API_KEY` and `MAIL_FROM` are set, new accounts are marked verified on creation (there is nothing to verify with) and the forgot-password form says so. Once mail is on, unverified accounts can log in but can't post until they click the link; "Resend" lives on `/login`.

**OAuth2** uses the authorization-code flow with PKCE and a state cookie. Providers switch on when both variables exist:

| Provider | Variables                                            | Redirect URI to register with the provider   |
| -------- | ---------------------------------------------------- | -------------------------------------------- |
| Discord  | `OAUTH_DISCORD_CLIENT_ID`, `OAUTH_DISCORD_CLIENT_SECRET` | `https://friendslop.wtf/auth/callback/discord` |
| Google   | `OAUTH_GOOGLE_CLIENT_ID`, `OAUTH_GOOGLE_CLIENT_SECRET`   | `https://friendslop.wtf/auth/callback/google`  |
| GitHub   | `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET`   | `https://friendslop.wtf/auth/callback/github`  |

Create the app in the provider's developer console (Discord Developer Portal, Google Cloud Console OAuth client, GitHub Developer Settings OAuth app), paste the redirect URI above, then `vercel env add` the two variables and redeploy. `/login` shows a button per configured provider. On callback, a provider account already linked logs straight in; otherwise the provider's email is matched to an existing account only if the provider says it is verified, or a new account is created. A provider that returns no email, or an unverified one, is refused with a message.

`SITE_URL` (default `https://friendslop.wtf`) is the base for email links and OAuth redirect URIs.

**Pages:** `/login` (log in, sign up, forgot password), `/profile` (username, email status and resend, change password, log out, log out everywhere, and a link to the back room for staff), `/verify?token=`, `/reset?token=`. The tab strip shows "Log in" or your username linking to the profile, plus a role badge for staff.

**What it changes elsewhere.** Submissions take the contact email from the account and record who posted. Crew calls belong to the account (no more delete tokens), the three-open-calls limit and the first-post hold are per account, and "by name" shows on the card. Votes, "I'm in", and reports are one per account instead of one per IP, so shared networks no longer collide. `VOTE_SALT` is no longer used.

## Game submissions

`/submit` posts a multipart form to `/api/submit` for the logged-in account. The function validates every field, drops honeypot hits, accepts only itch.io game pages and Steam store pages as the link (`lib/links.js`; no zips, no other hosts, so nobody has to open an unknown executable), and writes `submissions/<id>.json` to the same Blob store, plus `covers/<id>.<ext>` when a cover image was attached (PNG, JPG, GIF, or WebP under 2MB). Every submission starts with `status: "pending"`. Nothing is shown publicly yet.

A submission record looks like:

```json
{
  "id": "mtn9phtp-503ce1",
  "status": "pending",
  "title": "Untitled Physics Thing",
  "url": "https://example.itch.io/untitled-physics-thing",
  "store": "itch",
  "blurb": "Four of you run a haunted deli.",
  "players": { "min": 2, "max": 4 },
  "tags": ["physics", "horror"],
  "devName": "me and dave",
  "email": "dev@example.com",
  "userId": "u_mtn...",
  "userName": "dave",
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

Covers are served at `/api/cover?id=<submission id>`. `/api/stats` returns submission, approved, vote, and open-crew counts and feeds the front page's lobby status box.

## Reviewing submissions

Open `/admin`, paste the admin key, and you get the queue: Pending, Approved, Rejected, All. Each card has Approve, Reject, Pull it (back to pending), Back to queue, and Delete, plus a private note field. The page remembers the key in localStorage until you hit "Forget key". It isn't linked from anywhere and carries a `noindex` tag.

Under the hood, `POST /api/review` with `{ "id", "status", "note" }` updates the record, and `DELETE /api/review?id=<id>` removes the record and its cover. After every change the function rebuilds `index/approved.json`, a single blob holding the public fields of every approved game, newest approval first. That's what `/api/games` serves, cached at the edge for 30 seconds, so a freshly approved game can take up to half a minute to appear.

The front page fetches `/api/games` and, when there is at least one approved game, swaps the three placeholder cards for real ones with vote buttons. Titles and blurbs are rendered as text, never as HTML.

### Approval emails

Approving a game emails the contact address once, from `lib/mail.js` through [Resend](https://resend.com)'s REST API. It needs two environment variables on the Vercel project:

| Variable         | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| `RESEND_API_KEY` | An API key from the Resend dashboard                         |
| `MAIL_FROM`      | The sender, e.g. `friendslop.wtf <hello@friendslop.wtf>`      |
| `MAIL_REPLY_TO`  | Optional. Where replies go if not the from address           |

Set them with `vercel env add RESEND_API_KEY production` (and the same for `MAIL_FROM`), then redeploy. To send from an @friendslop.wtf address, add the domain in Resend and put the DNS records it gives you (DKIM, SPF, and a return-path CNAME) into Namecheap. Until the domain is verified, Resend only delivers to the email on the Resend account, from `onboarding@resend.dev`, which is enough to test with.

Without the variables, approving still works. The admin card shows "not emailed" with the reason, and a "Send email" button retries once they are set. The record keeps `notifiedAt` on success or `notifyError` on failure. `POST /api/review` with `"notify": true` forces a resend.

```bash
# approve from the command line
curl -X POST https://friendslop.wtf/api/review -H "Authorization: Bearer $SIGNUP_ADMIN_KEY" \
  -H "Content-Type: application/json" -d '{"id":"<id>","status":"approved"}'
```

## Navigation and the leaderboard

Every public page has a tab strip under the ticker: Front page (`/`), Top Slop (`/top`), Post a Game (`/submit`), Find a Crew (`/crews`). The active tab is lit. `/admin` is deliberately not in it.

`/top` is the leaderboard: every approved game ranked by votes, from the same `/api/games` call the front page uses. The top three get podium cards with medals, then the full numbered list. Votes work from there too. The front page shows the first six and links to the full board.

## Voting

Every approved game on the front page has an upvote button. `POST /api/vote` with `{ "id": "<game id>" }` toggles the caller's vote and returns `{ ok, voted, count }`. Only games in the approved index can be voted on.

Voting needs an account. Each vote is one tiny blob at `votes/<game id>/<account id>.json`, so the pathname itself enforces one vote per person per game. Counts are exact: `/api/games` lists the `votes/` prefix and tallies, then sorts most votes first, newest approval first when tied. That list is cached at the edge for 30 seconds. The browser remembers what it voted for in localStorage so the arrow lights up on reload, but the server is the record.

Deleting a game from `/admin` deletes its votes too. `/api/stats` includes the total, and the admin list and CSV show each game's count.

## Crew board

`/crews` is a looking-for-group board. Anyone with an account can post a crew call: which game (one from the front page, or anything typed in), how many they have and need, when, platform, region, how to reach them (a Discord username, an invite link, or free text), and a note. No accounts. Calls expire on their own based on "when": right now lasts 6 hours, tonight 18, tomorrow 36, this weekend 96, whenever a week. Expired calls drop out of the list immediately and get deleted a day later by the public list endpoint itself, so there is no cron.

Endpoints:

- `GET /api/crews` lists open calls, newest first, cached 15 seconds. `?all=1` with the admin key includes expired ones.
- `POST /api/crew` posts a call for the logged-in account. Three open calls per account, then a 429.
- `DELETE /api/crew?id=<id>` lets the poster (logged in) remove it; the admin key works too.
- `POST /api/crew?action=in` with `{ "id" }` toggles "I'm in", one per person per call, same mechanism as votes. Cards show `in/need` and flip to "probably full" when it's reached. It's a signal, not a reservation; the contact method is where the crew actually forms.

The first call from a new account is held off the public board for 15 minutes (`HOLD_MINUTES` in `lib/crews.js`). The poster sees it immediately with an "on hold" pill, via `GET /api/crews?mine=1`, which is never cached. Everyone else sees it when the hold ends. A `posters/<account id>.json` marker records that the account has posted before, so their later calls go up instantly. Held calls don't count in stats and can't be joined yet. On `/admin`, held calls carry an amber pill and a "Release now" button (`POST /api/crew?action=release` with the admin key) for when you've looked and it's fine.

Every card that isn't yours has a small "report" link with a reason picker (spam, scam, harassment, not a real call, other) and an optional note. `POST /api/crew?action=report` stores one report per account per call. At three reports the call disappears from the public board on its own. The admin Crews tab shows the count and the reasons, with "Clear reports" (`DELETE /api/crew?id=<id>&action=reports` with the admin key) to put it back, or Delete to remove it.

Contact details are public by design, that's the whole point of the board. Invite links must be full http(s) URLs and open in a new tab; usernames are shown as text with a copy button. The Crews tab on `/admin` lists every call, open or expired, with a delete button.

## The 12-function limit

Vercel's Hobby plan allows 12 serverless functions per deployment. Every file in `api/` is one function, so related actions share a file and pick their behaviour from `?action=` or the HTTP method. There are 10 right now. A deployment with 13 fails after the build with `exceeded_serverless_functions_per_deployment`, and production silently stays on the previous deployment, so check `vercel ls` after pushing if something new doesn't show up.

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
