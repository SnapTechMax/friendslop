// friendslop.wtf — the leaderboard. Reads /api/games (already sorted by votes).
(function () {
  var el = window.fsVote.el;
  var podium = document.getElementById('podium');
  var list = document.getElementById('top-list');
  var empty = document.getElementById('top-empty');
  var status = document.getElementById('top-status');
  var countEl = document.getElementById('top-count');
  var MEDALS = ['🥇', '🥈', '🥉'];
  var stripes = ['cover-a', 'cover-b', 'cover-c'];

  function cover(g, i) {
    return g.hasCover
      ? el('div', { class: 'cover cover-img' }, [el('img', { src: '/api/cover?id=' + encodeURIComponent(g.id), alt: '', loading: 'lazy' })])
      : el('div', { class: 'cover ' + stripes[i % 3] }, [el('span', { text: 'NO COVER' })]);
  }

  function players(g) {
    if (!g.players) return '';
    return g.players.min === g.players.max ? g.players.min + ' players' : g.players.min + '–' + g.players.max + ' players';
  }

  function who(g) { return g.onBehalf && g.credit ? g.credit : g.devName; }

  function podiumCard(g, i) {
    return el('article', { class: 'card game podium-card podium-' + (i + 1) }, [
      el('div', { class: 'rank-badge', text: MEDALS[i] + ' #' + (i + 1) }),
      cover(g, i),
      el('h3', { text: g.title }),
      el('div', { class: 'meta', text: players(g) + ' · by ' + who(g) }),
      el('p', { class: 'blurb', text: g.blurb }),
      el('div', { class: 'tags' }, (g.tags || []).map(function (t) { return el('span', { text: t }); })),
      el('div', { class: 'game-actions' }, [
        el('a', { class: 'cta cta-small', href: g.url, target: '_blank', rel: 'noopener noreferrer', text: g.store === 'steam' ? 'Get it on Steam' : g.store === 'itch' ? 'Get it on itch.io' : 'Get it' }),
        window.fsVote.button(g),
        el('a', { class: 'crew-link', href: '/crews?game=' + encodeURIComponent(g.id), text: 'find a crew' })
      ])
    ]);
  }

  function row(g, i) {
    var rank = i + 1;
    return el('li', { class: 'lb-row' + (rank <= 3 ? ' lb-top' : '') }, [
      el('div', { class: 'lb-rank', text: (rank <= 3 ? MEDALS[rank - 1] + ' ' : '') + '#' + rank }),
      el('div', { class: 'lb-cover' }, [cover(g, i)]),
      el('div', { class: 'lb-body' }, [
        el('h3', null, [el('a', { href: g.url, target: '_blank', rel: 'noopener noreferrer', text: g.title })]),
        el('div', { class: 'meta', text: players(g) + ' · by ' + who(g) }),
        el('div', { class: 'tags' }, (g.tags || []).map(function (t) { return el('span', { text: t }); }))
      ]),
      el('div', { class: 'lb-actions' }, [
        window.fsVote.button(g),
        el('a', { class: 'crew-link', href: '/crews?game=' + encodeURIComponent(g.id), text: 'find a crew' })
      ])
    ]);
  }

  function render(games) {
    countEl.textContent = String(games.length);
    podium.textContent = '';
    list.textContent = '';
    empty.hidden = games.length > 0;
    podium.hidden = games.length === 0;
    games.slice(0, 3).forEach(function (g, i) { podium.appendChild(podiumCard(g, i)); });
    games.forEach(function (g, i) { list.appendChild(row(g, i)); });
  }

  status.textContent = 'Loading...';
  fetch('/api/games').then(function (r) { return r.json(); }).then(function (d) {
    status.textContent = '';
    render((d && d.games) || []);
  }).catch(function () { status.textContent = 'Could not load the board. Try again in a bit.'; });
})();
