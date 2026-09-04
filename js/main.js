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

  // Signup form. Set data-endpoint on the form to a URL that accepts JSON
  // { email, role } and it will POST there. With no endpoint it says so.
  var form = document.getElementById('signup-form');
  var status = document.getElementById('signup-status');
  if (form && status) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = (document.getElementById('signup-email').value || '').trim();
      var role = document.getElementById('signup-role').value;
      var endpoint = form.getAttribute('data-endpoint');

      if (!endpoint) {
        status.textContent = 'Sign-ups are not wired up yet [the form is real, the backend is not]. Check back soon.';
        return;
      }

      status.textContent = 'Summoning...';
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, role: role })
      }).then(function (res) {
        if (!res.ok) throw new Error('bad status ' + res.status);
        status.textContent = 'Lobby summoned. Watch your inbox.';
        form.reset();
      }).catch(function () {
        status.textContent = 'That did not work. Try again in a bit, or yell at us on socials.';
      });
    });
  }
})();
