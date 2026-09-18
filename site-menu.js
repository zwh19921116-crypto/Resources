(() => {
  const EDG_TIMEZONE = 'Australia/Melbourne';
  const edgTimezoneFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: EDG_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const edgTimezoneParts = (date) => {
    const pieces = edgTimezoneFormatter.formatToParts(date);
    const out = {};
    pieces.forEach((piece) => {
      if (piece.type !== 'literal') out[piece.type] = piece.value;
    });
    return {
      ymd: `${out.year}-${out.month}-${out.day}`,
      minutes: (Number(out.hour) * 60) + Number(out.minute)
    };
  };

  const loadingAd = {
    title: 'Get exam-ready with Edgeducate classes',
    body: 'Small-group VCE and secondary tuition led by top-performing tutors. Book a free consultation to find your class.',
    duration: 4
  };

  const isAdEligibleNow = (ad, now) => {
    const zonedNow = edgTimezoneParts(now);
    const today = zonedNow.ymd;
    if (ad.startDate && today < ad.startDate) return false;
    if (ad.endDate && today > ad.endDate) return false;

    if (ad.startTime || ad.endTime) {
      const nowMinutes = zonedNow.minutes;
      const [sh, sm] = (ad.startTime || '00:00').split(':').map(Number);
      const [eh, em] = (ad.endTime || '23:59').split(':').map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      return start <= end
        ? nowMinutes >= start && nowMinutes <= end
        : nowMinutes >= start || nowMinutes <= end;
    }

    return true;
  };

  const eligibleAd = () => {
    if (window.EDG_ADS_ENABLED === false) return loadingAd;
    const now = new Date();
    const ads = (window.EDG_ADS || []).filter((ad) => ad.status !== 'draft' && isAdEligibleNow(ad, now));
    return ads[Math.floor(Math.random() * ads.length)] || loadingAd;
  };
  const showResourceLoading = (destination) => {
    const ad = eligibleAd();
    const overlay = document.createElement('div');
    overlay.className = 'session-loading resource-navigation-loading';
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
  window.addEventListener('pageshow', () => {
    document.querySelectorAll('.resource-navigation-loading').forEach((overlay) => overlay.remove());
  });
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
    const hrefAttr = cta.getAttribute('href');
    if (!hrefAttr || !hrefAttr.trim()) cta.href = '#';
    if (!cta.textContent || !cta.textContent.trim()) cta.textContent = 'Book Free Consultation';
  });
})();
