(() => {
  const loadingAd = {
    title: 'Get exam-ready with Edgeducate classes',
    body: 'Small-group VCE and secondary tuition led by top-performing tutors. Book a free consultation to find your class.',
    duration: 4
  };
  const eligibleAd = () => {
    if (window.EDG_ADS_ENABLED === false) return loadingAd;
    const today = new Date().toISOString().slice(0, 10);
    const ads = (window.EDG_ADS || []).filter((ad) => ad.status !== 'draft'
      && (!ad.startDate || today >= ad.startDate)
      && (!ad.endDate || today <= ad.endDate));
    return ads[Math.floor(Math.random() * ads.length)] || loadingAd;
  };
  const showResourceLoading = (destination) => {
    const ad = eligibleAd();
    const overlay = document.createElement('div');
    overlay.className = 'session-loading';
    overlay.innerHTML = `<div class="session-loading-inner" role="status" aria-live="polite">
      <span class="session-loading-brand"><strong>Edge</strong>ducate</span>
      <div class="session-loading-spinner" aria-hidden="true"></div>
      <p class="session-loading-status">Preparing your resource library...</p>
      <div class="session-loading-ad">
        <p class="session-loading-ad-eyebrow">While you wait</p>
        <h2>${String(ad.title || loadingAd.title).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))}</h2>
        <p>${String(ad.body || loadingAd.body).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))}</p>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const duration = Math.max(2, Number(ad.duration) || loadingAd.duration) * 1000;
    window.setTimeout(() => { window.location.href = destination; }, duration);
  };
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.endsWith('/all-resources.html')) return;
    event.preventDefault();
    showResourceLoading(url.href);
  });

  const prefix = location.pathname.includes('/resource-pages/') ? '../../' : '';
  const menuMarkup = `
    <a href="#">Pricing</a>
    <details class="nav-dropdown">
      <summary>Our Classes</summary>
      <div class="nav-dropdown-menu">
        <a href="#">Primary</a>
        <a href="#">Secondary</a>
        <a href="#">Selective School</a>
      </div>
    </details>
    <details class="nav-dropdown">
      <summary>VCE Preparation</summary>
      <div class="nav-dropdown-menu">
        <a href="#">VCE Biology</a>
        <a href="#">VCE Chemistry</a>
        <a href="#">VCE Physics</a>
        <a href="#">VCE General Mathematics</a>
        <a href="#">VCE Mathematical Methods</a>
      </div>
    </details>
    <a href="${prefix}resources.html">Resources</a>
    <a class="club-nav-link" href="${prefix}club.html">Club</a>
    <a href="#">Contact Us</a>`;

  document.querySelectorAll('.site-header .navbar').forEach((navbar) => {
    let nav = navbar.querySelector('.primary-nav');
    if (!nav) {
      nav = document.createElement('nav');
      nav.className = 'primary-nav';
      navbar.insertBefore(nav, navbar.querySelector('.btn-cta'));
    }
    nav.id = 'primary-nav';
    nav.setAttribute('aria-label', 'Primary');
    nav.innerHTML = menuMarkup;

    let toggle = navbar.querySelector('.nav-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.className = 'nav-toggle';
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'primary-nav');
      toggle.setAttribute('aria-label', 'Toggle navigation');
      toggle.innerHTML = '<span></span><span></span><span></span>';
      navbar.insertBefore(toggle, nav);
    }

    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    nav.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
      dropdown.addEventListener('mouseenter', () => { dropdown.open = true; });
      dropdown.addEventListener('mouseleave', () => {
        if (!dropdown.matches(':focus-within')) dropdown.open = false;
      });
    });

    let cta = navbar.querySelector('.btn-cta');
    if (!cta) {
      cta = document.createElement('a');
      cta.className = 'btn btn-cta';
      navbar.appendChild(cta);
    }
    cta.href = '#';
    cta.textContent = 'Book Free Consultation';
  });
})();
