// friendslop.wtf — shared upvote button. Used by the front page and the leaderboard.
// window.fsVote.button(game, onChange) returns a <button>; onChange(count, voted) fires after a toggle.
(function () {
  var myVotes = {};
  try { myVotes = JSON.parse(localStorage.getItem('fs_votes') || '{}') || {}; } catch (e) { myVotes = {}; }

  function remember(id, on) {
    if (on) myVotes[id] = true; else delete myVotes[id];
    try { localStorage.setItem('fs_votes', JSON.stringify(myVotes)); } catch (e) { /* fine */ }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function button(g, onChange) {
    var count = el('span', { class: 'vote-count', text: String(g.votes || 0) });
    var btn = el('button', { type: 'button', class: 'vote' + (myVotes[g.id] ? ' is-on' : ''), title: 'Upvote' }, [
      el('span', { class: 'vote-arrow', text: '▲' }), count
    ]);
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      var A = window.fsAuth;
      btn.disabled = true;
      A.me().then(function (user) {
        if (!user) { location.href = A.loginUrl(); return; }
        return fetch('/api/vote', { method: 'POST', headers: A.headers, body: JSON.stringify({ id: g.id }) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.code === 'login_required') { location.href = A.loginUrl(); return; }
            if (!d || !d.ok) { btn.classList.add('is-shake'); setTimeout(function () { btn.classList.remove('is-shake'); }, 400); return; }
            count.textContent = String(d.count);
            btn.classList.toggle('is-on', !!d.voted);
            remember(g.id, !!d.voted);
            if (onChange) onChange(d.count, !!d.voted);
          });
      })
        .catch(function () {})
        .then(function () { btn.disabled = false; });
    });
    return btn;
  }

  window.fsVote = { button: button, el: el, voted: function (id) { return !!myVotes[id]; } };
})();
