// friendslop.wtf — the profile page: username, email status, password, sessions.
(function () {
  var A = window.fsAuth;
  var params = new URLSearchParams(location.search);
  var profile = document.getElementById('profile');
  var notice = document.getElementById('auth-notice');
  var ROLE_LABEL = { owner: 'Website Owner™', admin: 'Staff™' };

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

  function initials(name) { return (name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?'; }
  function avatarBox(user) {
    var p = user.profile || {};
    var box = A.el('div', { class: 'avatar avatar-lg accent-' + (p.accent || 'grape') });
    if (p.hasAvatar) box.appendChild(A.el('img', { src: '/api/cover?avatar=' + encodeURIComponent(user.username) + '&v=' + (p.avatarVersion || 0), alt: '' }));
    else box.appendChild(A.el('span', { text: initials(user.username) }));
    return box;
  }

  function fillLook(user) {
    var p = user.profile || {};
    var slot = document.getElementById('look-avatar'); slot.textContent = ''; slot.appendChild(avatarBox(user));
    var lf = document.getElementById('look-form');
    var radio = lf.querySelector('input[name=accent][value="' + (p.accent || 'grape') + '"]'); if (radio) radio.checked = true;
    lf.elements.pronouns.value = p.pronouns || '';
    lf.elements.bio.value = p.bio || '';
    document.getElementById('bio-count').textContent = String((p.bio || '').length);
    lf.elements.favorites.value = (p.favorites || []).join(', ');
    lf.elements.discord.value = (p.links && p.links.discord) || '';
    lf.elements.itch.value = (p.links && p.links.itch) || '';
    lf.elements.steam.value = (p.links && p.links.steam) || '';
    document.getElementById('p-public-link').setAttribute('href', '/u/' + encodeURIComponent(user.username));
  }

  function fill(user) {
    fillLook(user);
    document.getElementById('p-username').textContent = user.username;
    document.getElementById('role-badge').textContent = ROLE_LABEL[user.role] || 'Member™';
    document.getElementById('u-input').value = user.username;
    document.getElementById('p-email').textContent = user.email + (user.emailVerified ? ' · verified' : ' · not verified');
    document.getElementById('p-verify').hidden = user.emailVerified;
    document.getElementById('current-field').hidden = !user.hasPassword;
    document.getElementById('delete-password-field').hidden = !user.hasPassword;
    document.getElementById('t-role').textContent = user.role || 'member';
    document.getElementById('t-verified').textContent = user.emailVerified ? 'verified' : 'NOT verified';
    document.getElementById('t-providers').textContent = (user.hasPassword ? ['password'] : []).concat(user.providers || []).join(', ') || 'nothing yet';
    document.getElementById('t-since').textContent = (user.createdAt || '').slice(0, 10);
    document.getElementById('staff-block').hidden = !(user.role === 'owner' || user.role === 'admin');
    if (user.usernameProvisional) notice.textContent = 'We picked "' + user.username + '" from your sign-in. Change it to whatever you like.';
    else if (params.get('verify') === '1' && !user.emailVerified) notice.textContent = 'Check your inbox for the verification link.';
  }

  A.gate(profile, document.getElementById('profile-gate'), 'see your profile').then(function (user) {
    // gate() only passes verified users through; unverified ones should still see the profile.
    return user || A.me();
  }).then(function (user) {
    if (!user) return;
    document.getElementById('profile-gate').hidden = true;
    profile.hidden = false;
    fill(user);

    // Username: live availability, then save.
    var input = document.getElementById('u-input');
    var avail = document.getElementById('u-avail');
    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      var v = input.value.trim();
      avail.textContent = '';
      avail.className = 'hint avail';
      if (v.length < 4) return;
      timer = setTimeout(function () {
        fetch('/api/auth?action=username-available&u=' + encodeURIComponent(v), { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .then(function (d) { avail.textContent = d.message || ''; avail.className = 'hint avail ' + (d.available ? 'avail-ok' : 'avail-bad'); })
          .catch(function () {});
      }, 350);
    });
    var uf = document.getElementById('username-form');
    var us = document.getElementById('u-status');
    uf.addEventListener('submit', function (ev) {
      ev.preventDefault(); clearErrors(uf); us.textContent = 'Saving...';
      A.post('set-username', { username: input.value.trim() }).then(function (d) {
        if (d.ok) { us.textContent = 'Saved.'; notice.textContent = ''; fill(d.user); A.me(true).then(function () { location.reload(); }); return; }
        showErrors(uf, d.errors); us.textContent = d.message || 'That did not work.';
      });
    });

    // Look: avatar upload and remove, accent, bio, favorites, links.
    var avStatus = document.getElementById('avatar-status');
    document.getElementById('avatar-upload').addEventListener('click', function () {
      var file = document.getElementById('avatar-input').files[0];
      if (!file) { avStatus.textContent = 'Pick an image first.'; return; }
      if (file.size > 1024 * 1024) { avStatus.textContent = 'Under 1MB, please.'; return; }
      var fd = new FormData(); fd.append('avatar', file);
      avStatus.textContent = 'Uploading...';
      fetch('/api/auth?action=avatar', { method: 'POST', headers: { 'X-Requested-With': 'fetch' }, body: fd })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.ok) { avStatus.textContent = 'Looking good.'; fillLook(d.user); A.me(true); } else avStatus.textContent = d.message || 'That did not work.'; })
        .catch(function () { avStatus.textContent = 'That did not work.'; });
    });
    document.getElementById('avatar-remove').addEventListener('click', function () {
      avStatus.textContent = 'Removing...';
      A.post('remove-avatar').then(function (d) { if (d.ok) { avStatus.textContent = 'Back to initials.'; fillLook(d.user); A.me(true); } else avStatus.textContent = d.message || 'That did not work.'; });
    });
    var lf = document.getElementById('look-form');
    lf.elements.bio.addEventListener('input', function () { document.getElementById('bio-count').textContent = String(lf.elements.bio.value.length); });
    lf.addEventListener('submit', function (ev) {
      ev.preventDefault(); clearErrors(lf);
      var ls = document.getElementById('look-status'); ls.textContent = 'Saving...';
      var v = {}; Array.prototype.forEach.call(lf.elements, function (i) { if (i.name && (i.type !== 'radio' || i.checked)) v[i.name] = i.value; });
      A.post('update-profile', v).then(function (d) {
        if (d.ok) { ls.textContent = 'Saved.'; fillLook(d.user); A.me(true); return; }
        showErrors(lf, d.errors); ls.textContent = d.message || 'That did not work.';
      });
    });

    document.getElementById('p-resend').addEventListener('click', function (ev) {
      ev.target.disabled = true;
      A.post('resend-verification').then(function (d) { ev.target.textContent = d.message || 'Sent.'; });
    });
    document.getElementById('p-logout').addEventListener('click', function () { A.post('logout').then(function () { location.href = '/'; }); });
    document.getElementById('p-logout-all').addEventListener('click', function () { A.post('logout-all').then(function () { location.href = '/'; }); });

    var df = document.getElementById('delete-form');
    df.addEventListener('submit', function (ev) {
      ev.preventDefault(); clearErrors(df);
      var ds = document.getElementById('delete-status');
      var v = {}; Array.prototype.forEach.call(df.elements, function (i) { if (i.name) v[i.name] = i.value; });
      if ((v.confirm || '').trim().toLowerCase() !== 'delete') { showErrors(df, { confirm: 'Type delete to confirm.' }); return; }
      if (!window.confirm('Delete your account and everything tied to it? There is no undo.')) return;
      ds.textContent = 'Deleting...';
      A.post('delete-account', v).then(function (d) {
        if (d.ok) { ds.textContent = 'Gone. Thanks for playing.'; setTimeout(function () { location.href = '/'; }, 1200); return; }
        showErrors(df, d.errors); ds.textContent = d.message || 'That did not work.';
      });
    });

    var pf = document.getElementById('password-form');
    pf.addEventListener('submit', function (ev) {
      ev.preventDefault(); clearErrors(pf);
      var ps = document.getElementById('password-status'); ps.textContent = 'Changing...';
      var v = {}; Array.prototype.forEach.call(pf.elements, function (i) { if (i.name) v[i.name] = i.value; });
      A.post('change-password', v).then(function (d) {
        if (d.ok) { ps.textContent = 'Changed. Other devices are logged out.'; pf.reset(); return; }
        showErrors(pf, d.errors); ps.textContent = d.message || 'That did not work.';
      });
    });
  });
})();
