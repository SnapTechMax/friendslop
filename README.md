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

Landing page only. No backend yet.

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

## Signup form

The form in `index.html` posts JSON (`{ email, role }`) to whatever URL is in its `data-endpoint` attribute. It's empty right now, so the form tells people sign-ups aren't wired up yet. Point it at a form backend or your own endpoint when one exists.

## Style notes

The look borrows from gamerbf.com: Comic Sans, a cream page over a magenta/cyan/yellow background, thick ridge and double borders, hard black shadows, slightly rotated cards, a marquee, a green-on-black "system notice" box, and a hit counter. The copy is deadpan but explains what the site actually does.

## Deployment

The site is served by GitHub Pages from the `main` branch root. Every push to `main` redeploys it. The `CNAME` file pins the custom domain to `friendslop.wtf`.

DNS lives at Namecheap. The records GitHub Pages needs:

| Type  | Host | Value                   |
| ----- | ---- | ----------------------- |
| A     | @    | 185.199.108.153         |
| A     | @    | 185.199.109.153         |
| A     | @    | 185.199.110.153         |
| A     | @    | 185.199.111.153         |
| CNAME | www  | snaptechmax.github.io   |

Once DNS resolves and GitHub has issued the certificate, turn on HTTPS enforcement:

```bash
gh api -X PUT repos/SnapTechMax/friendslop/pages -F https_enforced=true
```
