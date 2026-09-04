// friendslop.wtf — the back room. Lists submissions and reviews them.
// Everything is built with DOM APIs because titles and blurbs are user input.

(function () {
  var KEY_STORAGE = 'fs_admin_key';
  var key = '';
  var all = [];
  var crews = [];
  var filter = 'pending';

  var keyCard = document.getElementById('key-card');
  var keyForm = document.getElementById('key-form');
  var keyInput = document.getElementById('key-input');
  var keyStatus = document.getElementById('key-status');
  var queue = document.getElementById('queue');
  var listEl = document.getElementById('list');
  var emptyEl = document.getElementById('empty');
  var statusEl = document.getElementById('admin-status');

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function ago(iso) {
    if (!iso) return '';
    var s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }

  function say(msg) { statusEl.textContent = msg || ''; }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({ Authorization: 'Bearer ' + key }, options.headers || {});
    return fetch(path, options).then(function (res) {
      if (res.status === 401) {
        forgetKey();
        keyStatus.textContent = 'That key did not work.';
        throw new Error('unauthorized');
      }
      return res;
    });
  }

  function load() {
    say('Loading...');
    return api('/api/submissions')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        all = d.submissions || [];
        keyCard.hidden = true;
        queue.hidden = false;
        say('');
        render();
        return api('/api/crews?all=1').then(function (r) { return r.json(); }).then(function (c) {
          crews = c.crews || [];
          render();
        });
      })
      .catch(function (err) {
        if (err.message !== 'unauthorized') say('Could not load the queue. Try refresh.');
      });
  }

  function counts() {
    var c = { pending: 0, approved: 0, rejected: 0, all: all.length, crews: crews.length };
    all.forEach(function (r) { if (c[r.status] !== undefined) c[r.status] += 1; });
    Object.keys(c).forEach(function (k) {
      var span = document.querySelector('[data-count="' + k + '"]');
      if (span) span.textContent = String(c[k]);
    });
  }

  function review(id, status, note, notify) {
    say(notify ? 'Sending email...' : 'Saving...');
    return api('/api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, status: status, note: note || '', notify: !!notify })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { say(d.message || 'That did not work.'); return; }
      all = all.map(function (r) { return r.id === id ? d.record : r; });
      var msg = 'Saved. ' + d.approvedCount + ' live on the front page.';
      if (d.email) msg += d.email.sent ? ' Email sent.' : ' Email not sent: ' + d.email.error + '.';
      say(msg);
      render();
    }).catch(function () { say('That did not work.'); });
  }

  function remove(id, title) {
    if (!window.confirm('Delete "' + title + '" and its cover for good?')) return;
    say('Deleting...');
    api('/api/review?id=' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { say(d.message || 'That did not work.'); return; }
        all = all.filter(function (r) { return r.id !== id; });
        say('Deleted.');
        render();
      })
      .catch(function () { say('That did not work.'); });
  }

  function card(r) {
    var noteInput = el('input', { type: 'text', class: 'note-input', placeholder: 'Private note (optional)', maxlength: '500', value: r.note || '' });
    var note = function () { return noteInput.value.trim(); };

    var actions = [];
    if (r.status !== 'approved') actions.push(el('button', { type: 'button', class: 'cta cta-small', text: 'Approve', onclick: function () { review(r.id, 'approved', note()); } }));
    if (r.status === 'approved') actions.push(el('button', { type: 'button', class: 'cta cta-small', text: 'Pull it', onclick: function () { review(r.id, 'pending', note()); } }));
    if (r.status !== 'rejected') actions.push(el('button', { type: 'button', class: 'cta cta-small cta-alt', text: 'Reject', onclick: function () { review(r.id, 'rejected', note()); } }));
    if (r.status === 'rejected') actions.push(el('button', { type: 'button', class: 'cta cta-small', text: 'Back to queue', onclick: function () { review(r.id, 'pending', note()); } }));
    if (r.status === 'approved') actions.push(el('button', { type: 'button', class: 'cta cta-small cta-mail', text: r.notifiedAt ? 'Email again' : 'Send email', onclick: function () { review(r.id, 'approved', note(), true); } }));
    actions.push(el('button', { type: 'button', class: 'cta cta-small cta-danger', text: 'Delete', onclick: function () { remove(r.id, r.title); } }));

    var thumb = r.cover
      ? el('div', { class: 'thumb' }, [el('img', { src: '/api/cover?id=' + encodeURIComponent(r.id), alt: '' })])
      : el('div', { class: 'thumb thumb-empty' }, [el('span', { text: 'NO COVER' })]);

    var who = r.devName + (r.onBehalf ? ' (posted by a friend, credit: ' + (r.credit || '?') + ')' : '') + (r.userName ? ' · account: ' + r.userName : '');
    var players = r.players ? (r.players.min === r.players.max ? r.players.min + ' players' : r.players.min + '–' + r.players.max + ' players') : '';

    var pills = [el('span', { class: 'pill pill-' + r.status, text: r.status })];
    if (r.status === 'approved') pills.push(el('span', { class: 'pill pill-votes', text: '\u25b2 ' + (r.votes || 0) }));
    if (r.approvedAt) pills.push(el('span', { class: 'when', text: 'approved ' + ago(r.approvedAt) }));
    pills.push(el('span', { class: 'when', text: 'submitted ' + ago(r.submittedAt) }));
    if (r.status === 'approved') {
      if (r.notifiedAt) pills.push(el('span', { class: 'pill pill-mail', text: 'emailed ' + ago(r.notifiedAt) }));
      else pills.push(el('span', { class: 'pill pill-nomail', text: 'not emailed', title: r.notifyError || '' }));
    }

    return el('article', { class: 'card review review-' + r.status }, [
      el('div', { class: 'review-grid' }, [
        thumb,
        el('div', { class: 'review-body' }, [
          el('div', { class: 'review-head' }, pills),
          el('h3', null, [el('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', text: r.title })]),
          el('p', { class: 'blurb', text: r.blurb }),
          el('div', { class: 'meta', text: players + ' · by ' + who }),
          r.status === 'approved' && !r.notifiedAt && r.notifyError ? el('div', { class: 'meta mail-error', text: 'Email not sent: ' + r.notifyError }) : null,
          el('div', { class: 'tags' }, (r.tags || []).map(function (t) { return el('span', { text: t }); })),
          el('div', { class: 'meta meta-contact' }, [
            el('a', { href: 'mailto:' + r.email, text: r.email }),
            ' · ',
            el('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', text: r.url }),
            ' · id ',
            el('code', { text: r.id })
          ]),
          el('div', { class: 'review-actions' }, actions.concat([noteInput]))
        ])
      ])
    ]);
  }

  function removeCrew(id, title) {
    if (!window.confirm('Delete the crew call for "' + title + '"?')) return;
    say('Deleting...');
    api('/api/crew?id=' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { say(d.message || 'That did not work.'); return; }
        crews = crews.filter(function (c) { return c.id !== id; });
        say('Deleted.');
        render();
      })
      .catch(function () { say('That did not work.'); });
  }

  var WHEN = { now: 'right now', tonight: 'tonight', tomorrow: 'tomorrow', weekend: 'this weekend', whenever: 'whenever' };

  function clearReports(id) {
    say('Clearing reports...');
    api('/api/crew?id=' + encodeURIComponent(id) + '&action=reports', { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { say(d.message || 'That did not work.'); return; }
        crews = crews.map(function (c) { return c.id === id ? Object.assign({}, c, { reports: 0, hidden: false, reportReasons: [] }) : c; });
        say('Cleared ' + d.cleared + ' report' + (d.cleared === 1 ? '' : 's') + '. It is back on the board.');
        render();
      })
      .catch(function () { say('That did not work.'); });
  }

  function releaseCrew(id) {
    say('Releasing...');
    api('/api/crew?action=release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { say(d.message || 'That did not work.'); return; }
        crews = crews.map(function (c) { return c.id === id ? Object.assign({}, c, { held: false, holdUntil: null }) : c; });
        say('Released. It is on the board now.');
        render();
      })
      .catch(function () { say('That did not work.'); });
  }

  function crewCard(c) {
    var contact = c.contactType === 'link'
      ? el('a', { href: c.contact, target: '_blank', rel: 'noopener noreferrer', text: c.contact })
      : el('code', { text: c.contact });
    return el('article', { class: 'card review crew' + (c.open ? '' : ' review-rejected') + (c.hidden ? ' review-hidden' : '') }, [
      el('div', { class: 'review-head' }, [
        el('span', { class: 'pill ' + (c.open ? 'pill-approved' : 'pill-rejected'), text: c.open ? 'open' : 'expired' }),
        el('span', { class: 'pill pill-when', text: WHEN[c.when] || c.when }),
        el('span', { class: 'pill pill-votes', text: (c.in || 0) + '/' + c.need + ' in' }),
        c.reports ? el('span', { class: 'pill pill-report', text: '\u2691 ' + c.reports + (c.hidden ? ' · hidden' : '') }) : null,
        c.held ? el('span', { class: 'pill pill-held', text: 'on hold · ' + Math.max(1, Math.ceil((new Date(c.holdUntil).getTime() - Date.now()) / 60000)) + ' min' }) : null,
        el('span', { class: 'when', text: 'posted ' + ago(c.createdAt) })
      ]),
      el('h3', null, [c.gameUrl ? el('a', { href: c.gameUrl, target: '_blank', rel: 'noopener noreferrer', text: c.gameTitle }) : el('span', { text: c.gameTitle })]),
      el('div', { class: 'meta', text: (c.by ? 'by ' + c.by + ' · ' : '') + 'have ' + c.have + ' · need ' + c.need + ' · ' + c.platform + (c.region ? ' · ' + c.region : '') + (c.whenNote ? ' · ' + c.whenNote : '') }),
      c.note ? el('p', { class: 'blurb', text: c.note }) : null,
      el('div', { class: 'meta meta-contact' }, [c.contactType + ': ', contact, ' · id ', el('code', { text: c.id })]),
      c.reportReasons && c.reportReasons.length ? el('ul', { class: 'report-list' }, c.reportReasons.map(function (r) {
        return el('li', { text: r.reason + (r.note ? ': ' + r.note : '') + ' (' + ago(r.at) + ')' });
      })) : null,
      el('div', { class: 'review-actions' }, [
        el('button', { type: 'button', class: 'cta cta-small cta-danger', text: 'Delete', onclick: function () { removeCrew(c.id, c.gameTitle); } }),
        c.reports ? el('button', { type: 'button', class: 'cta cta-small', text: 'Clear reports', onclick: function () { clearReports(c.id); } }) : null,
        c.held ? el('button', { type: 'button', class: 'cta cta-small', text: 'Release now', onclick: function () { releaseCrew(c.id); } }) : null
      ])
    ]);
  }

  function render() {
    counts();
    if (filter === 'crews') {
      listEl.textContent = '';
      crews.forEach(function (c) { listEl.appendChild(crewCard(c)); });
      emptyEl.hidden = crews.length > 0;
      return;
    }
    var rows = all.filter(function (r) { return filter === 'all' || r.status === filter; });
    rows.sort(function (a, b) { return String(b.submittedAt).localeCompare(String(a.submittedAt)); });
    listEl.textContent = '';
    rows.forEach(function (r) { listEl.appendChild(card(r)); });
    emptyEl.hidden = rows.length > 0;
  }

  function forgetKey() {
    key = '';
    try { localStorage.removeItem(KEY_STORAGE); } catch (e) { /* fine */ }
    queue.hidden = true;
    keyCard.hidden = false;
    keyInput.value = '';
  }

  // Tabs. The hash mirrors the tab so /admin#approved opens straight to it.
  function selectTab(name) {
    var tabs = document.querySelectorAll('.tab');
    var found = false;
    Array.prototype.forEach.call(tabs, function (t) {
      var hit = t.getAttribute('data-filter') === name;
      t.classList.toggle('is-active', hit);
      if (hit) found = true;
    });
    if (!found) return selectTab('pending');
    filter = name;
    if (('#' + name) !== location.hash) history.replaceState(null, '', '#' + name);
    render();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
    tab.addEventListener('click', function () { selectTab(tab.getAttribute('data-filter')); });
  });
  window.addEventListener('hashchange', function () { selectTab(location.hash.slice(1)); });
  if (location.hash.length > 1) {
    filter = location.hash.slice(1);
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-filter') === filter);
    });
    if (!document.querySelector('.tab.is-active')) filter = 'pending';
  }

  document.getElementById('refresh').addEventListener('click', load);
  document.getElementById('logout').addEventListener('click', forgetKey);
  document.getElementById('export-csv').addEventListener('click', function () {
    say('Building CSV...');
    api('/api/submissions?format=csv').then(function (r) { return r.blob(); }).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'friendslop-submissions.csv' });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      say('');
    }).catch(function () { say('CSV export failed.'); });
  });

  keyForm.addEventListener('submit', function (ev) {
    ev.preventDefault();
    key = keyInput.value.trim();
    if (!key) return;
    keyStatus.textContent = 'Checking...';
    load().then(function () {
      if (!queue.hidden) {
        keyStatus.textContent = '';
        try { localStorage.setItem(KEY_STORAGE, key); } catch (e) { /* fine */ }
      }
    });
  });

  // Remembered key from last time
  try { key = localStorage.getItem(KEY_STORAGE) || ''; } catch (e) { key = ''; }
  if (key) load();
})();
