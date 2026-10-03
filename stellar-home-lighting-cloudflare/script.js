(() => {
  const form = document.getElementById('leadForm');
  const steps = [...document.querySelectorAll('.form-step')];
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  const message = document.getElementById('formMessage');
  const submitBtn = document.getElementById('submitBtn');
  const year = document.getElementById('year');
  let current = 0;

  if (year) year.textContent = new Date().getFullYear();

  function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = `form-message ${type} show`;
  }

  function clearMessage() {
    message.textContent = '';
    message.className = 'form-message';
  }

  function showStep(index, scroll = true) {
    current = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach((step, i) => step.classList.toggle('active', i === current));
    progressBar.style.width = `${((current + 1) / steps.length) * 100}%`;
    progressText.textContent = `${current + 1} of ${steps.length}`;
    clearMessage();
    if (scroll && window.innerWidth < 980) {
      document.getElementById('quote')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function stepValid(index) {
    const step = steps[index];
    const required = [...step.querySelectorAll('input[required]')];
    const checkedGroups = new Set();

    for (const field of required) {
      if (field.type === 'radio') {
        if (checkedGroups.has(field.name)) continue;
        checkedGroups.add(field.name);
        if (!step.querySelector(`input[name="${field.name}"]:checked`)) {
          showMessage(field.name === 'home_coverage'
            ? 'Choose how much of your home you would like lit.'
            : 'Choose a budget range to continue.');
          return false;
        }
        continue;
      }
      if (!field.checkValidity()) {
        field.reportValidity();
        return false;
      }
    }
    return true;
  }

  document.querySelectorAll('.form-next').forEach(btn => {
    btn.addEventListener('click', () => {
      if (stepValid(current)) showStep(current + 1);
    });
  });

  document.querySelectorAll('.form-back').forEach(btn => {
    btn.addEventListener('click', () => showStep(current - 1));
  });

  // On multiple-choice steps, a selection can advance automatically.
  document.querySelectorAll('.choice-card input, .budget-option input').forEach(input => {
    input.addEventListener('change', () => {
      clearMessage();
      window.setTimeout(() => {
        if ((current === 0 || current === 2) && stepValid(current)) showStep(current + 1);
      }, 160);
    });
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    clearMessage();

    if (!stepValid(current) || !form.checkValidity()) return;

    const data = new FormData(form);
    const payload = {
      first_name: String(data.get('first_name') || '').trim(),
      last_name: String(data.get('last_name') || '').trim(),
      email: String(data.get('email') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      address: String(data.get('address') || '').trim(),
      home_coverage: String(data.get('home_coverage') || ''),
      budget_range: String(data.get('budget_range') || ''),
      consent: Boolean(data.get('consent')),
      website: String(data.get('website') || ''),
      lead_source: 'Stellar Home Lighting Website',
      service: 'Permanent Outdoor Lighting',
      state_market: 'Florida',
      page_url: window.location.href,
      submitted_at: new Date().toISOString()
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending to Mission Control…';

    try {
      const response = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      let result = {};
      try { result = await response.json(); } catch (_) {}
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || 'Submission failed');
      }

      form.innerHTML = `
        <div class="success-state">
          <div class="success-orbit">✦</div>
          <div class="step-kicker">TRANSMISSION RECEIVED</div>
          <h3>You’re on our radar.</h3>
          <p>Thanks, ${escapeHtml(payload.first_name)}. Stellar Home Lighting received your project details and will follow up about your custom quote.</p>
          <a class="button" href="tel:+18502967028">Call or Text (850) 296-7028</a>
        </div>`;
    } catch (error) {
      console.error('Lead submission error:', error);
      showMessage('We could not send your request right now. Please call or text (850) 296-7028 and we’ll take care of you.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Get My Free Quote';
    }
  });

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));
  }

  showStep(0, false);
})();
