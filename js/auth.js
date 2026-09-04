// friendslop.wtf — shared account bits for every page.
// window.fsAuth.me()          -> Promise<user|null>, cached
// window.fsAuth.post(action, body) -> Promise<json>   (adds the fetch header the API requires)
// window.fsAuth.headers        -> headers for any logged-in write
// window.fsAuth.loginUrl(next) -> "/login?next=..."
(function () {
  var HEADERS = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };
  var mePromise = null;

  function me(force) {
    if (!mePromise || force) {
      mePromise = fetch('/api/auth?action=me', { cache: 'no-store' })
        .then(function (r) { return r.json(); })
        .then(function (d) { return d && d.user ? d.user : null; })
        .catch(function () { return null; });
    }
    return mePromise;
  }

  function post(action, body) {
    return fetch('/api/auth?action=' + encodeURIComponent(action), { method: 'POST', headers: HEADERS, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: 'The server said something we could not read.' }; }); });
  }

  function loginUrl(next) {
    return '/login?next=' + encodeURIComponent(next || (location.pathname + location.search));
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return node;
  }

  // The little account slot at the right of the tab strip.
  function renderNav(user) {
    var slot = document.getElementById('nav-user');
    if (!slot) return;
    slot.textContent = '';
    if (!user) {
      slot.appendChild(el('a', { href: loginUrl(), class: 'nav-login', text: 'Log in' }));
      return;
    }
    slot.appendChild(el('span', { class: 'nav-name', text: user.name }));
    if (!user.emailVerified) slot.appendChild(el('a', { href: '/login?verify=1', class: 'nav-unverified', title: 'Email not verified yet', text: 'unverified' }));
    slot.appendChild(el('button', { type: 'button', class: 'nav-logout', text: 'Log out', onclick: function () {
      post('logout').then(function () { location.reload(); });
    } }));
  }

  // Swaps a form for a "log in first" card when there's no session.
  function gate(formEl, gateEl, what) {
    return me().then(function (user) {
      if (user && user.emailVerified) { if (gateEl) gateEl.hidden = true; if (formEl) formEl.hidden = false; return user; }
      if (formEl) formEl.hidden = true;
      if (gateEl) {
        gateEl.hidden = false;
        gateEl.textContent = '';
        if (user && !user.emailVerified) {
          gateEl.appendChild(el('span', { class: 'badge', text: 'One more step™' }));
          gateEl.appendChild(el('h2', { text: 'Verify your email' }));
          gateEl.appendChild(el('p', { text: 'You are logged in as ' + user.name + ', but the email is not verified yet, and that is what unlocks ' + what + '. Check your inbox.' }));
          gateEl.appendChild(el('button', { type: 'button', class: 'cta', text: 'Resend the email', onclick: function (ev) {
            ev.target.disabled = true;
            post('resend-verification').then(function (d) { ev.target.textContent = d.message || 'Sent.'; });
          } }));
        } else {
          gateEl.appendChild(el('span', { class: 'badge', text: 'Members Only™' }));
          gateEl.appendChild(el('h2', { text: 'Log in to ' + what }));
          gateEl.appendChild(el('p', { text: 'Takes a minute. Email and a password, or one of the sign-in buttons. No newsletter unless you ask for it.' }));
          gateEl.appendChild(el('a', { class: 'cta', href: loginUrl(), text: 'Log in' }));
          gateEl.appendChild(el('a', { class: 'cta cta-alt', href: loginUrl() + '&signup=1', text: 'Sign up' }));
        }
      }
      return null;
    });
  }

  window.fsAuth = { me: me, post: post, headers: HEADERS, loginUrl: loginUrl, gate: gate, el: el };
  me().then(renderNav);
})();
