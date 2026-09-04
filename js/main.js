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
