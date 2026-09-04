// friendslop.wtf — submission form. Validates a bit client-side, posts the
// multipart form to /api/submit, and shows the server's field errors.

(function () {
  var form = document.getElementById('submit-form');
  if (!form) return;

  // Accounts only. The gate card explains; the form shows once logged in and verified.
  var user = null;
  window.fsAuth.gate(document.getElementById('submit-section'), document.getElementById('submit-gate'), 'post a game').then(function (u) {
    user = u;
    if (u) document.getElementById('posting-as').textContent = 'Posting as ' + u.name + '. We will email ' + u.email + ' when it goes up.';
  });

  var status = document.getElementById('submit-status');
  var button = form.querySelector('button[type=submit]');
  var done = document.getElementById('submit-done');
  var MAX_COVER = 2 * 1024 * 1024;

  // Live character count on the blurb.
  var blurb = document.getElementById('f-blurb');
  var blurbCount = document.getElementById('blurb-count');
  if (blurb && blurbCount) {
    var updateCount = function () { blurbCount.textContent = String(blurb.value.length); };
    blurb.addEventListener('input', updateCount);
    updateCount();
  }

  // "Posting for a friend" reveals the credit field.
  var behalf = document.getElementById('f-behalf');
  var creditField = document.getElementById('credit-field');
  if (behalf && creditField) {
    var toggleCredit = function () { creditField.hidden = !behalf.checked; };
    behalf.addEventListener('change', toggleCredit);
    toggleCredit();
  }

  // Mirrors lib/links.js on the server: itch.io game pages and Steam store pages only.
  function gameLink(raw) {
    var u;
    try { u = new URL(raw); } catch (e) { return { ok: false, reason: 'Needs a full link, starting with https://.' }; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, reason: 'Needs a full link, starting with https://.' };
    var host = u.hostname.toLowerCase();
    var path = u.pathname.replace(/\/+$/, '');
    if (/^([a-z0-9-]+\.)?itch\.io$/.test(host)) {
      if (path === '') return { ok: false, reason: host === 'itch.io' ? 'Link the game page on itch.io, not the homepage.' : "That's an itch.io profile. Link the game's page, like https://you.itch.io/your-game." };
      return { ok: true };
    }
    if (host === 'store.steampowered.com') {
      if (!/^\/app\/\d+(\/|$)/.test(u.pathname)) return { ok: false, reason: 'Link the Steam store page, like https://store.steampowered.com/app/12345/Your_Game/.' };
      return { ok: true };
    }
    return { ok: false, reason: "Only itch.io pages and Steam store pages, no zips or other hosts. We're not opening your .exe to find out." };
  }

  function clearErrors() {
    var spans = form.querySelectorAll('.field-error');
    for (var i = 0; i < spans.length; i++) spans[i].textContent = '';
    var bad = form.querySelectorAll('.is-bad');
    for (var j = 0; j < bad.length; j++) bad[j].classList.remove('is-bad');
  }

  function showErrors(errors) {
    var first = null;
    Object.keys(errors).forEach(function (name) {
      var span = form.querySelector('.field-error[data-for="' + name + '"]');
      if (span) span.textContent = errors[name];
      var input = form.querySelector('[name="' + name + '"]');
      if (input) {
        input.classList.add('is-bad');
        if (!first) first = input;
      }
    });
    if (first && first.focus) first.focus();
  }

  function localErrors() {
    var errors = {};
    var val = function (name) { return (form.elements[name].value || '').trim(); };

    if (!val('title')) errors.title = 'Needs a title.';
    var link = gameLink(val('url'));
    if (!link.ok) errors.url = link.reason;
    if (!val('blurb')) errors.blurb = 'Say something about it.';
    var min = parseInt(val('minPlayers'), 10);
    var max = parseInt(val('maxPlayers'), 10);
    if (!(min >= 1 && min <= 99)) errors.minPlayers = 'A number from 1 to 99.';
    if (!(max >= 1 && max <= 99)) errors.maxPlayers = 'A number from 1 to 99.';
    else if (min >= 1 && max < min) errors.maxPlayers = 'Max has to be at least the min.';
    if (!val('devName')) errors.devName = 'Who made it?';
    if (form.elements.onBehalf.checked && !val('credit')) errors.credit = 'Tell us who to credit.';
    if (!form.elements.confirm.checked) errors.confirm = 'You have to tick the box.';

    var cover = form.elements.cover.files && form.elements.cover.files[0];
    if (cover) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(cover.type)) errors.cover = 'PNG, JPG, GIF, or WebP only.';
      else if (cover.size > MAX_COVER) errors.cover = 'Under 2MB, please.';
    }
    return errors;
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    clearErrors();

    var errors = localErrors();
    if (Object.keys(errors).length) {
      showErrors(errors);
      status.textContent = 'Fix the marked fields and try again.';
      return;
    }

    status.textContent = 'Sending...';
    button.disabled = true;

    fetch('/api/submit', { method: 'POST', headers: { 'X-Requested-With': 'fetch' }, body: new FormData(form) })
      .then(function (res) {
        return res.json().catch(function () { return { ok: false, message: 'The server said something we could not read.' }; });
      })
      .then(function (data) {
        if (data && data.code === 'login_required') { location.href = window.fsAuth.loginUrl(); return; }
        if (data && data.ok) {
          document.getElementById('done-title').textContent = form.elements.title.value.trim();
          document.getElementById('done-id').textContent = data.id;
          document.getElementById('done-email').textContent = user ? user.email : 'you';
          form.closest('section').hidden = true;
          done.hidden = false;
          done.scrollIntoView({ behavior: 'smooth', block: 'start' });
          form.reset();
          return;
        }
        if (data && data.errors) showErrors(data.errors);
        status.textContent = (data && data.message) || 'That did not work. Try again in a bit.';
      })
      .catch(function () {
        status.textContent = 'That did not work. Try again in a bit, or yell at us on socials.';
      })
      .then(function () { button.disabled = false; });
  });
})();
