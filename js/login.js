// friendslop.wtf — the login page: log in, sign up, forgot, and the account card.
(function () {
  var A = window.fsAuth;
  var el = A.el;
  var params = new URLSearchParams(location.search);
  var next = params.get('next') || '/';
  if (!/^\/(?!\/)/.test(next)) next = '/';

  var panes = { login: document.getElementById('login-form'), signup: document.getElementById('signup-form'), forgot: document.getElementById('forgot-form') };
  var status = document.getElementById('auth-status');
  var notice = document.getElementById('auth-notice');
  var authCard = document.querySelector('.auth-card');
  var acct = document.getElementById('account-card');

  function show(name) {
    Object.keys(panes).forEach(function (k) { panes[k].hidden = k !== name; });
    Array.prototype.forEach.call(document.querySelectorAll('.auth-tabs .tab'), function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-pane') === (name === 'forgot' ? 'login' : name));
    });
    status.textContent = '';
  }
  Array.prototype.forEach.call(document.querySelectorAll('.auth-tabs .tab'), function (t) {
    t.addEventListener('click', function () { show(t.getAttribute('data-pane')); });
  });
  document.getElementById('show-forgot').addEventListener('click', function () { show('forgot'); });
  document.getElementById('show-login').addEventListener('click', function () { show('login'); });
  if (params.get('signup') === '1') show('signup');

  var ERRORS = {
    provider: 'That sign-in provider is not set up.',
    state: 'That sign-in attempt expired or got mixed up. Try again.',
    denied: 'You cancelled the sign-in. No hard feelings.',
    exchange: 'The provider did not accept the sign-in. Try again in a bit.',
    profile: 'The provider did not tell us who you are.',
    noemail: 'That provider did not share an email address, and we need one. Try another way.',
    unverified: 'That provider says your email is not verified. Verify it there, or sign up with a password.',
    race: 'Two sign-ups at once? Try again.',
    disabled: 'That account is disabled.'
  };
  if (params.get('error')) notice.textContent = ERRORS[params.get('error')] || 'Sign-in failed.';

  function clearErrors(form) {
    Array.prototype.forEach.call(form.querySelectorAll('.field-error'), function (s) { s.textContent = ''; });
    Array.prototype.forEach.call(form.querySelectorAll('.is-bad'), function (i) { i.classList.remove('is-bad'); });
  }
  function showErrors(form, errors) {
    Object.keys(errors || {}).forEach(function (name) {
      var span = form.querySelector('.field-error[data-for="' + name + '"]');
      if (span) span.textContent = errors[name];
      var input = form.querySelector('[name="' + name + '"]');
      if (input) input.classList.add('is-bad');
    });
  }
  function vals(form) {
    var out = {};
    Array.prototype.forEach.call(form.elements, function (i) { if (i.name) out[i.name] = i.value; });
    return out;
  }

  function afterLogin(d) {
    if (d.verificationRequired && !d.verificationSent) status.textContent = 'Account made, but the verification email could not be sent. Try resending from your account.';
    location.href = d.user && !d.user.emailVerified ? '/login?verify=1&next=' + encodeURIComponent(next) : next;
  }

  panes.login.addEventListener('submit', function (ev) {
    ev.preventDefault(); clearErrors(panes.login); status.textContent = 'Checking...';
    A.post('login', vals(panes.login)).then(function (d) {
      if (d.ok) return afterLogin(d);
      showErrors(panes.login, d.errors); status.textContent = d.message || 'That did not work.';
    });
  });

  panes.signup.addEventListener('submit', function (ev) {
    ev.preventDefault(); clearErrors(panes.signup);
    var v = vals(panes.signup);
    if (v.website) return; // honeypot
    status.textContent = 'Making it...';
    A.post('register', v).then(function (d) {
      if (d.ok) return afterLogin(d);
      showErrors(panes.signup, d.errors); status.textContent = d.message || 'That did not work.';
    });
  });

  panes.forgot.addEventListener('submit', function (ev) {
    ev.preventDefault(); clearErrors(panes.forgot); status.textContent = 'Sending...';
    A.post('forgot', vals(panes.forgot)).then(function (d) { status.textContent = d.message || 'If that email has an account, a reset link is on its way.'; });
  });

  // Sign-in buttons for whichever providers are configured.
  fetch('/api/auth?action=providers').then(function (r) { return r.json(); }).then(function (d) {
    var list = (d && d.providers) || [];
    if (!list.length) return;
    var row = document.getElementById('oauth');
    var slot = document.getElementById('oauth-buttons');
    list.forEach(function (p) {
      slot.appendChild(el('a', { class: 'cta cta-small oauth-' + p.id, href: '/auth/start/' + p.id + '?next=' + encodeURIComponent(next), text: p.label }));
    });
    row.hidden = false;
  }).catch(function () {});

  // Already logged in? Show the account card instead of the forms.
  A.me().then(function (user) {
    if (!user) return;
    authCard.hidden = true;
    acct.hidden = false;
    document.getElementById('acct-name').textContent = user.name;
    document.getElementById('acct-line').textContent = user.email + (user.emailVerified ? ' · verified' : ' · not verified') + (user.providers.length ? ' · signs in with ' + user.providers.join(', ') : '');
    document.getElementById('acct-verify').hidden = user.emailVerified;
    document.getElementById('acct-next').setAttribute('href', next);
    document.getElementById('current-field').hidden = !user.hasPassword;
    if (params.get('verify') === '1' && !user.emailVerified) notice.textContent = 'Check your inbox for the verification link. Then come back and carry on.';
    document.getElementById('acct-resend').addEventListener('click', function (ev) {
      ev.target.disabled = true;
      A.post('resend-verification').then(function (d) { ev.target.textContent = d.message || 'Sent.'; });
    });
    document.getElementById('acct-logout').addEventListener('click', function () { A.post('logout').then(function () { location.href = '/'; }); });
    document.getElementById('acct-logout-all').addEventListener('click', function () { A.post('logout-all').then(function () { location.href = '/'; }); });
    var pf = document.getElementById('password-form');
    pf.addEventListener('submit', function (ev) {
      ev.preventDefault(); clearErrors(pf);
      var ps = document.getElementById('password-status'); ps.textContent = 'Changing...';
      A.post('change-password', vals(pf)).then(function (d) {
        if (d.ok) { ps.textContent = 'Changed. Other devices are logged out.'; pf.reset(); return; }
        showErrors(pf, d.errors); ps.textContent = d.message || 'That did not work.';
      });
    });
  });
})();
