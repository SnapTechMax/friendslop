// friendslop.wtf — a public profile at /u/<username>.
(function () {
  var A = window.fsAuth;
  var el = A.el;
  var username = new URLSearchParams(location.search).get('username') || decodeURIComponent((location.pathname.match(/^\/u\/([^/]+)/) || [])[1] || '');
  var status = document.getElementById('pc-status');
  var card = document.getElementById('pc');
  var missing = document.getElementById('pc-missing');
  var ROLE_LABEL = { owner: 'website owner', admin: 'staff' };
  var stripes = ['cover-a', 'cover-b', 'cover-c'];

  function initials(name) { return (name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?'; }

  // Shared with profile.js: builds the avatar box, image or initials.
  window.fsAvatar = function (p, size) {
    var box = el('div', { class: 'avatar avatar-' + (size || 'lg') + ' accent-' + (p.accent || 'grape') });
    if (p.hasAvatar) box.appendChild(el('img', { src: '/api/cover?avatar=' + encodeURIComponent(p.username) + '&v=' + (p.avatarVersion || 0), alt: '' }));
    else box.appendChild(el('span', { text: initials(p.username) }));
    return box;
  };

  function players(g) { if (!g.players) return ''; return g.players.min === g.players.max ? g.players.min + ' players' : g.players.min + '–' + g.players.max + ' players'; }

  function gameCard(g, i) {
    var cover = g.hasCover
      ? el('div', { class: 'cover cover-img' }, [el('img', { src: '/api/cover?id=' + encodeURIComponent(g.id), alt: '', loading: 'lazy' })])
      : el('div', { class: 'cover ' + stripes[i % 3] }, [el('span', { text: 'NO COVER' })]);
    return el('article', { class: 'game card' }, [
      cover,
      el('h4', { text: g.title }),
      el('div', { class: 'meta', text: players(g) + ' · by ' + (g.onBehalf && g.credit ? g.credit : g.devName) }),
      el('p', { class: 'blurb', text: g.blurb }),
      el('div', { class: 'tags' }, (g.tags || []).map(function (t) { return el('span', { text: t }); })),
      el('div', { class: 'game-actions' }, [
        el('a', { class: 'cta cta-small', href: g.url, target: '_blank', rel: 'noopener noreferrer', text: g.store === 'steam' ? 'Get it on Steam' : g.store === 'itch' ? 'Get it on itch.io' : 'Get it' }),
        window.fsVote.button(g)
      ])
    ]);
  }

  function render(d, me) {
    var p = d.profile;
    document.title = p.username + ' — friendslop.wtf';
    card.className = 'pcard accent-' + (p.accent || 'grape');
    document.getElementById('pc-avatar').appendChild(window.fsAvatar(p, 'lg'));
    document.getElementById('pc-name').textContent = p.username;
    var pro = document.getElementById('pc-pronouns'); if (p.pronouns) { pro.textContent = p.pronouns; pro.hidden = false; }
    var role = document.getElementById('pc-role'); if (ROLE_LABEL[p.role]) { role.textContent = ROLE_LABEL[p.role]; role.className = 'pill pill-role'; role.hidden = false; }
    document.getElementById('pc-since').textContent = 'here since ' + (p.createdAt || '').slice(0, 10);
    document.getElementById('pc-year').textContent = (p.createdAt || '').slice(0, 4) || '?';
    document.getElementById('pc-bio').textContent = p.bio || (me && me.username === p.username ? "You haven't written anything yet. Hit Edit profile." : 'Prefers to remain mysterious.');
    var favs = document.getElementById('pc-favs');
    if (p.favorites && p.favorites.length) p.favorites.forEach(function (f) { favs.appendChild(el('span', { text: f })); });
    else favs.appendChild(el('span', { class: 'tag-empty', text: 'none listed' }));
    var links = document.getElementById('pc-links');
    var any = false;
    if (p.links && p.links.discord) { links.appendChild(el('span', { class: 'contact' }, ['Discord: ', el('code', { class: 'contact-value', text: p.links.discord })])); any = true; }
    if (p.links && p.links.itch) { links.appendChild(el('a', { class: 'cta cta-small', href: p.links.itch, target: '_blank', rel: 'noopener noreferrer', text: 'itch.io' })); any = true; }
    if (p.links && p.links.steam) { links.appendChild(el('a', { class: 'cta cta-small', href: p.links.steam, target: '_blank', rel: 'noopener noreferrer', text: 'Steam' })); any = true; }
    document.getElementById('pc-links-section').hidden = !any;
    document.getElementById('pc-games-count').textContent = String((d.games || []).length);
    document.getElementById('pc-crews').textContent = String(d.crewsOpen || 0);
    var grid = document.getElementById('pc-games');
    (d.games || []).forEach(function (g, i) { grid.appendChild(gameCard(g, i)); });
    document.getElementById('pc-no-games').hidden = (d.games || []).length > 0;
    if (me && me.username === p.username) document.getElementById('pc-edit').hidden = false;
    status.textContent = '';
    card.hidden = false;
  }

  if (!username) { status.textContent = ''; missing.hidden = false; return; }
  Promise.all([
    fetch('/api/auth?action=profile&u=' + encodeURIComponent(username)).then(function (r) { return r.json(); }),
    A.me()
  ]).then(function (res) {
    var d = res[0];
    if (!d || !d.ok) { status.textContent = ''; missing.hidden = false; return; }
    render(d, res[1]);
  }).catch(function () { status.textContent = 'Could not load that profile. Try again in a bit.'; });
})();
