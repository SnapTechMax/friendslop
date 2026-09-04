// friendslop.wtf — the crew board. Lists open calls, posts new ones, "I'm in".
// Built with DOM APIs because every field is user input.

(function () {
  var listEl = document.getElementById('crews-list');
  var emptyEl = document.getElementById('crews-empty');
  var countEl = document.getElementById('crews-count');
  var statusEl = document.getElementById('crews-status');
  var form = document.getElementById('crew-form');
  var formStatus = document.getElementById('crew-form-status');
  var button = form.querySelector('button[type=submit]');

  var WHEN = { now: 'right now', tonight: 'tonight', tomorrow: 'tomorrow', weekend: 'this weekend', whenever: 'whenever' };
  var PLATFORM = { any: 'any platform', pc: 'PC', console: 'console', browser: 'browser' };

  var A = window.fsAuth;
  var user = null;
  // Calls this account owns (from ?mine=1), plus what this browser said "I'm in" or "report" to.
  var mine = {};
  var ins = {};
  var reported = {};
  try { ins = JSON.parse(localStorage.getItem('fs_crewin') || '{}') || {}; } catch (e) { ins = {}; }
  try { reported = JSON.parse(localStorage.getItem('fs_reports') || '{}') || {}; } catch (e) { reported = {}; }
  function save(key, obj) { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* fine */ } }
  function needLogin() { location.href = A.loginUrl(); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c !== null && c !== undefined) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }

  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  function minutesLeft(iso) {
    return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
  }

  function until(iso) {
    var s = Math.max(0, (new Date(iso).getTime() - Date.now()) / 1000);
    if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm';
    if (s < 86400) return Math.floor(s / 3600) + 'h';
    return Math.floor(s / 86400) + 'd';
  }

  function contactNode(c) {
    if (c.contactType === 'link') {
      return el('a', { class: 'cta cta-small', href: c.contact, target: '_blank', rel: 'noopener noreferrer', text: 'Join their invite' });
    }
    var label = c.contactType === 'discord' ? 'Discord: ' : 'Reach them: ';
    var value = el('code', { class: 'contact-value', text: c.contact });
    var copy = el('button', { type: 'button', class: 'copy', text: 'copy', onclick: function () {
      if (navigator.clipboard) navigator.clipboard.writeText(c.contact).then(function () { copy.textContent = 'copied'; setTimeout(function () { copy.textContent = 'copy'; }, 1200); });
    } });
    return el('span', { class: 'contact' }, [label, value, ' ', copy]);
  }

  function inButton(c) {
    var count = el('span', { class: 'vote-count', text: String(c.in || 0) + '/' + c.need });
    var btn = el('button', { type: 'button', class: 'vote in-btn' + (ins[c.id] ? ' is-on' : ''), title: "Say you're in" }, [
      el('span', { text: ins[c.id] ? "I'm in" : "I'm in?" }), count
    ]);
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      if (!user) return needLogin();
      btn.disabled = true;
      fetch('/api/crew?action=in', { method: 'POST', headers: A.headers, body: JSON.stringify({ id: c.id }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.code === 'login_required') return needLogin();
          if (!d || !d.ok) { btn.classList.add('is-shake'); setTimeout(function () { btn.classList.remove('is-shake'); }, 400); return; }
          count.textContent = d.count + '/' + c.need;
          btn.classList.toggle('is-on', !!d.in);
          btn.firstChild.textContent = d.in ? "I'm in" : "I'm in?";
          if (d.in) ins[c.id] = true; else delete ins[c.id];
          save('fs_crewin', ins);
        })
        .catch(function () {})
        .then(function () { btn.disabled = false; });
    });
    return btn;
  }

  var REASONS = [
    ['spam', 'Spam or an ad'],
    ['scam', 'Scam or phishing link'],
    ['harassment', 'Harassment or slurs'],
    ['wrong', 'Not a real crew call'],
    ['other', 'Something else']
  ];

  function reportControl(c, cardEl) {
    if (reported[c.id]) return el('span', { class: 'reported', text: 'reported' });
    var open = false;
    var btn = el('button', { type: 'button', class: 'report-btn', text: 'report' });
    var select = el('select', { class: 'report-reason' }, REASONS.map(function (r) { return el('option', { value: r[0], text: r[1] }); }));
    var note = el('input', { type: 'text', class: 'report-note', maxlength: '200', placeholder: 'Anything else? (optional)' });
    var send = el('button', { type: 'button', class: 'cta cta-small cta-danger', text: 'Send report' });
    var cancel = el('button', { type: 'button', class: 'copy', text: 'cancel' });
    var status = el('span', { class: 'when' });
    var panel = el('div', { class: 'report-form', hidden: '' }, [select, note, send, cancel, status]);
    var wrap = el('div', { class: 'report-wrap' }, [btn, panel]);

    btn.addEventListener('click', function () { if (!user) return needLogin(); open = !open; panel.hidden = !open; if (open) select.focus(); });
    cancel.addEventListener('click', function () { open = false; panel.hidden = true; });
    send.addEventListener('click', function () {
      send.disabled = true;
      status.textContent = 'Sending...';
      fetch('/api/crew?action=report', { method: 'POST', headers: A.headers, body: JSON.stringify({ id: c.id, reason: select.value, note: note.value.trim() }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.code === 'login_required') return needLogin();
          if (!d || !d.ok) { status.textContent = (d && d.message) || 'That did not work.'; send.disabled = false; return; }
          reported[c.id] = true; save('fs_reports', reported);
          wrap.textContent = '';
          wrap.appendChild(el('span', { class: 'reported', text: d.hidden ? 'reported, now hidden' : 'reported, thanks' }));
          if (d.hidden && cardEl) cardEl.classList.add('crew-full');
        })
        .catch(function () { status.textContent = 'That did not work.'; send.disabled = false; });
    });
    return wrap;
  }

  function card(c) {
    var spots = c.need + (c.need === 1 ? ' spot' : ' spots');
    var when = WHEN[c.when] || c.when;
    var metaBits = [spots + ' · have ' + c.have, when + (c.whenNote ? ' (' + c.whenNote + ')' : ''), PLATFORM[c.platform] || c.platform];
    if (c.by) metaBits.unshift('by ' + c.by);
    if (c.region) metaBits.push(c.region);
    var full = (c.in || 0) >= c.need;

    var title = c.gameUrl
      ? el('a', { href: c.gameUrl, target: '_blank', rel: 'noopener noreferrer', text: c.gameTitle })
      : el('span', { text: c.gameTitle });

    var actions = [inButton(c)];
    if (mine[c.id]) {
      actions.push(el('button', { type: 'button', class: 'cta cta-small cta-danger', text: 'Delete my call', onclick: function () { remove(c.id); } }));
    }

    var article = el('article', { class: 'card crew' + (full ? ' crew-full' : '') + (c.held ? ' crew-held' : '') }, [
      el('div', { class: 'crew-head' }, [
        el('span', { class: 'pill pill-when', text: when }),
        c.held ? el('span', { class: 'pill pill-held', text: 'on hold · public in ' + minutesLeft(c.holdUntil) + ' min' }) : null,
        full ? el('span', { class: 'pill pill-full', text: 'probably full' }) : null,
        el('span', { class: 'when', text: 'posted ' + ago(c.createdAt) + ' · gone in ' + until(c.expiresAt) })
      ]),
      el('h3', null, [title]),
      el('div', { class: 'meta', text: metaBits.join(' · ') }),
      c.note ? el('p', { class: 'blurb', text: c.note }) : null,
      el('div', { class: 'crew-contact' }, [contactNode(c)]),
      el('div', { class: 'review-actions' }, actions)
    ]);
    if (!mine[c.id]) article.appendChild(reportControl(c, article));
    return article;
  }

  var crews = [];
  function render() {
    listEl.textContent = '';
    crews.forEach(function (c) { listEl.appendChild(card(c)); });
    emptyEl.hidden = crews.length > 0;
    countEl.textContent = String(crews.length);
  }

  function load() {
    statusEl.textContent = 'Loading...';
    var pub = fetch('/api/crews', { cache: 'no-store' }).then(function (r) { return r.json(); });
    // Your own calls come from the uncached ?mine=1: it marks what you can delete,
    // and it's the only way to see your first call while it's on hold.
    var own = fetch('/api/crews?mine=1', { cache: 'no-store' }).then(function (r) { return r.json(); }).catch(function () { return { crews: [] }; });
    return Promise.all([pub, own]).then(function (res) {
      var ownList = (res[1] && res[1].crews) || [];
      mine = {};
      ownList.forEach(function (c) { mine[c.id] = true; });
      var seen = {};
      var held = ownList.filter(function (c) { return c.held; });
      held.forEach(function (c) { seen[c.id] = true; });
      crews = held.concat(((res[0] && res[0].crews) || []).filter(function (c) { return !seen[c.id]; }));
      statusEl.textContent = '';
      render();
    }).catch(function () { statusEl.textContent = 'Could not load the board. Try refresh.'; });
  }

  function remove(id) {
    if (!window.confirm('Delete this crew call?')) return;
    statusEl.textContent = 'Deleting...';
    fetch('/api/crew?id=' + encodeURIComponent(id), { method: 'DELETE', headers: A.headers })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { statusEl.textContent = d.message || 'That did not work.'; return; }
        delete mine[id];
        crews = crews.filter(function (c) { return c.id !== id; });
        statusEl.textContent = 'Deleted. Have fun.';
        render();
      })
      .catch(function () { statusEl.textContent = 'That did not work.'; });
  }

  // Game picker, filled from the approved list. ?game=<id> preselects.
  var gameSelect = document.getElementById('c-game');
  var otherField = document.getElementById('c-other-field');
  var wanted = new URLSearchParams(location.search).get('game') || '';
  fetch('/api/games').then(function (r) { return r.json(); }).then(function (d) {
    var games = (d && d.games) || [];
    var other = gameSelect.querySelector('option[value="__other"]');
    games.forEach(function (g) { gameSelect.insertBefore(el('option', { value: g.id, text: g.title }), other); });
    if (wanted && games.some(function (g) { return g.id === wanted; })) gameSelect.value = wanted;
  }).catch(function () {});
  function toggleOther() { otherField.hidden = gameSelect.value !== '__other'; }
  gameSelect.addEventListener('change', toggleOther);
  toggleOther();

  // Contact placeholder follows the type.
  var contactType = document.getElementById('c-contacttype');
  var contact = document.getElementById('c-contact');
  var hints = { discord: 'your.discord.name', link: 'https://discord.gg/...', other: 'steam profile, email, carrier pigeon' };
  function contactHint() { contact.placeholder = hints[contactType.value] || ''; }
  contactType.addEventListener('change', contactHint);
  contactHint();

  function clearErrors() {
    Array.prototype.forEach.call(form.querySelectorAll('.field-error'), function (s) { s.textContent = ''; });
    Array.prototype.forEach.call(form.querySelectorAll('.is-bad'), function (i) { i.classList.remove('is-bad'); });
  }
  function showErrors(errors) {
    var first = null;
    Object.keys(errors).forEach(function (name) {
      var span = form.querySelector('.field-error[data-for="' + name + '"]');
      if (span) span.textContent = errors[name];
      var input = form.querySelector('[name="' + name + '"]');
      if (input) { input.classList.add('is-bad'); if (!first) first = input; }
    });
    if (first && first.focus) first.focus();
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    clearErrors();
    var v = function (name) { return (form.elements[name].value || '').trim(); };
    var payload = {
      gameId: gameSelect.value === '__other' ? '' : gameSelect.value,
      gameTitle: gameSelect.value === '__other' ? v('gameTitle') : '',
      have: v('have'), need: v('need'), when: v('when'), whenNote: v('whenNote'),
      platform: v('platform'), region: v('region'),
      contactType: v('contactType'), contact: v('contact'), note: v('note'),
      website: v('website')
    };
    formStatus.textContent = 'Putting it out...';
    button.disabled = true;
    fetch('/api/crew', { method: 'POST', headers: A.headers, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: 'The server said something we could not read.' }; }); })
      .then(function (d) {
        if (d && d.code === 'login_required') return needLogin();
        if (d && d.ok && d.crew) {
          mine[d.id] = true;
          crews.unshift(d.crew);
          render();
          form.reset(); toggleOther(); contactHint();
          formStatus.textContent = d.held
            ? "It's up for you. First call from a new poster gets a " + (d.holdMinutes || 15) + " minute hold before everyone else sees it [spam, sorry]. Later ones go up instantly."
            : "It's up. Delete it when you're full.";
          listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        if (d && d.errors) showErrors(d.errors);
        formStatus.textContent = (d && d.message) || 'That did not work. Try again in a bit.';
      })
      .catch(function () { formStatus.textContent = 'That did not work. Try again in a bit.'; })
      .then(function () { button.disabled = false; });
  });

  document.getElementById('crews-refresh').addEventListener('click', load);
  A.gate(form, document.getElementById('crew-gate'), 'call a crew').then(function (u) { user = u; load(); });
})();
