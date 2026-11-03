// bookmyGCC site script: back-to-top button and lead forms (client + partner).
(function(){var b=document.getElementById('to-top');function u(){b.classList.toggle('show',window.scrollY>600)}window.addEventListener('scroll',u,{passive:true});u();b.addEventListener('click',function(e){e.preventDefault();window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})})})();

(function () {
  var MSG = {
    client: 'Thank you. Your request has reached the founder. You can pick a time now using "Choose a time", or we will reply within 1 business day.',
    partner: 'Thank you. Your expression of interest has reached the founder, who replies within 3 business days.',
    preview: ' (Preview site: the request was checked but not stored yet.)'
  };
  function setStatus(el, text, cls) { el.textContent = text; el.className = 'small form-status ' + (cls || ''); }
  document.querySelectorAll('form.js-lead').forEach(function (form) {
    var status = form.querySelector('.form-status');
    var btn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        var bad = form.querySelector(':invalid');
        setStatus(status, bad && bad.type === 'checkbox' ? 'Please tick the consent box to continue.' : 'Please fill in your name, a valid work email and your organisation.', 'err');
        if (bad) bad.focus();
        return;
      }
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : v; });
      data.consent = !!form.querySelector('[name="consent"]').checked;
      data.kind = form.dataset.kind;
      data.token = data['cf-turnstile-response'] || '';
      delete data['cf-turnstile-response'];
      if (!data.token) { setStatus(status, 'Please wait a moment for the security check to finish, then try again.', 'err'); return; }
      btn.disabled = true; setStatus(status, 'Sending…');
      fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { j.status = r.status; return j; }); })
        .then(function (j) {
          if (j.ok) {
            form.reset();
            setStatus(status, MSG[data.kind] + (j.stored === false ? MSG.preview : ''), 'ok');
          } else {
            setStatus(status, (j.error || 'Something went wrong.') + ' You can also email hello@bookmygcc.com.', 'err');
          }
        })
        .catch(function () { setStatus(status, 'Network problem. Please try again, or email hello@bookmygcc.com.', 'err'); })
        .finally(function () { btn.disabled = false; if (window.turnstile) { try { window.turnstile.reset(form.querySelector('.cf-turnstile')); } catch (x) {} } });
    });
  });
})();
