// friendslop.wtf — small bits of life for the landing page.

(function () {
  // Visitor counter. Counts this browser only, which the page admits to.
  var hits = document.getElementById('hits');
  if (hits) {
    var count = 1;
    try {
      count = parseInt(localStorage.getItem('fs_hits') || '0', 10) + 1;
      localStorage.setItem('fs_hits', String(count));
    } catch (e) { /* private mode or blocked storage: stay at 1 */ }
    hits.textContent = String(count).padStart(6, '0');
  }

  // "Bugs shipped as features" creeps up while you read. It never goes down.
  var bugs = document.getElementById('stat-bugs');
  if (bugs) {
    var n = parseInt(bugs.textContent, 10) || 15;
    setInterval(function () {
      if (Math.random() < 0.35) {
        n += 1;
        bugs.textContent = String(n);
      }
    }, 2200);
  }

  // Live "games submitted" count from /api/stats. Falls back to whatever is in the HTML.
  var games = document.getElementById('stat-games');
  var live = document.getElementById('stat-live');
  if (games && window.fetch) {
    fetch('/api/stats').then(function (r) { return r.json(); }).then(function (d) {
      if (d && typeof d.submissions === 'number') games.textContent = String(d.submissions);
      if (live && d && typeof d.approved === 'number') live.textContent = String(d.approved);
      var votes = document.getElementById('stat-votes');
      if (votes && d && typeof d.votes === 'number') votes.textContent = String(d.votes);
    }).catch(function () {});
  }

  // Approved games replace the placeholder cards. Built with DOM APIs because
  // titles and blurbs are user input.
  var grid = document.getElementById('games');
  if (grid && window.fetch) {
    var el = function (tag, attrs, children) {
      var node = document.createElement(tag);
      if (attrs) Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
      (children || []).forEach(function (c) { if (c) node.appendChild(c); });
      return node;
    };
    var stripes = ['cover-a', 'cover-b', 'cover-c'];

    // Which games this browser has voted for. The server is the real record;
    // this just paints the button the right colour on load.
    var myVotes = {};
    try { myVotes = JSON.parse(localStorage.getItem('fs_votes') || '{}') || {}; } catch (e) { myVotes = {}; }
    var rememberVote = function (id, on) {
      if (on) myVotes[id] = true; else delete myVotes[id];
      try { localStorage.setItem('fs_votes', JSON.stringify(myVotes)); } catch (e) { /* fine */ }
    };

    var voteButton = function (g) {
      var count = el('span', { class: 'vote-count', text: String(g.votes || 0) });
      var btn = el('button', { type: 'button', class: 'vote' + (myVotes[g.id] ? ' is-on' : ''), title: 'Upvote' }, [
        el('span', { class: 'vote-arrow', text: '\u25b2' }), count
      ]);
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        btn.disabled = true;
        fetch('/api/vote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: g.id })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (!d || !d.ok) { btn.classList.add('is-shake'); setTimeout(function () { btn.classList.remove('is-shake'); }, 400); return; }
          count.textContent = String(d.count);
          btn.classList.toggle('is-on', !!d.voted);
          rememberVote(g.id, !!d.voted);
        }).catch(function () {}).then(function () { btn.disabled = false; });
      });
      return btn;
    };

    var gameCard = function (g, i) {
      var cover = g.hasCover
        ? el('div', { class: 'cover cover-img' }, [el('img', { src: '/api/cover?id=' + encodeURIComponent(g.id), alt: '', loading: 'lazy' })])
        : el('div', { class: 'cover ' + stripes[i % 3] }, [el('span', { text: 'NO COVER' })]);
      var players = g.players ? (g.players.min === g.players.max ? g.players.min + ' players' : g.players.min + '\u2013' + g.players.max + ' players') : '';
      var who = g.onBehalf && g.credit ? g.credit : g.devName;
      return el('article', { class: 'game card' }, [
        cover,
        el('h4', { text: g.title }),
        el('div', { class: 'meta', text: players + ' \u00b7 by ' + who }),
        el('p', { class: 'blurb', text: g.blurb }),
        el('div', { class: 'tags' }, (g.tags || []).map(function (t) { return el('span', { text: t }); })),
        el('div', { class: 'game-actions' }, [
          el('a', { class: 'cta cta-small', href: g.url, target: '_blank', rel: 'noopener noreferrer', text: 'Get it' }),
          voteButton(g)
        ])
      ]);
    };
    fetch('/api/games').then(function (r) { return r.json(); }).then(function (d) {
      var list = (d && d.games) || [];
      if (!list.length) return;
      var title = document.getElementById('games-title');
      var lede = document.getElementById('games-lede');
      if (title) title.textContent = 'Front page slop';
      if (lede) lede.textContent = 'Real games by real small teams. Most votes first. Play one, then hit the arrow if it deserves it.';
      grid.textContent = '';
      list.forEach(function (g, i) { grid.appendChild(gameCard(g, i)); });
    }).catch(function () {});
  }

  // Signup form. POSTs JSON { email, role, website } to the form's data-endpoint
  // (/api/signup in production). The server replies { ok, message }.
  var form = document.getElementById('signup-form');
  var status = document.getElementById('signup-status');
  if (form && status) {
    var button = form.querySelector('button[type=submit]');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = (document.getElementById('signup-email').value || '').trim();
      var role = document.getElementById('signup-role').value;
      var hp = document.getElementById('signup-website');
      var endpoint = form.getAttribute('data-endpoint');

      if (!endpoint) {
        status.textContent = 'Sign-ups are not wired up yet [the form is real, the backend is not]. Check back soon.';
        return;
      }

      status.textContent = 'Summoning...';
      if (button) button.disabled = true;

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, role: role, website: hp ? hp.value : '' })
      }).then(function (res) {
        return res.json().catch(function () { return { ok: res.ok }; });
      }).then(function (data) {
        if (data && data.ok) {
          status.textContent = data.message || 'Lobby summoned. Watch your inbox.';
          form.reset();
        } else {
          status.textContent = (data && data.message) || 'That did not work. Try again in a bit.';
        }
      }).catch(function () {
        status.textContent = 'That did not work. Try again in a bit, or yell at us on socials.';
      }).finally(function () {
        if (button) button.disabled = false;
      });
    });
  }
})();
