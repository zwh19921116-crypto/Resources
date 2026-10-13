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
  window.addEventListener('pageshow', () => {
    if (window.location.pathname.endsWith('/all-resources.html')) return;
    document.querySelectorAll('.resource-navigation-loading').forEach((overlay) => overlay.remove());
  });
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
    if (link.dataset.directNavigation === 'true') return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.endsWith('/all-resources.html')) return;
  });

  const prefix = location.pathname.includes('/resource-pages/')
    ? (location.pathname.includes('/solutions/') ? '../../../' : '../../')
    : '';
  const footerMarkup = `
    <div class="container footer-grid">
      <nav class="footer-column" aria-label="Site links">
        <h2>Links</h2>
        <a href="https://edgeducate.com.au/">Home</a>
        <a href="https://edgeducate.com.au/pricing">Pricing</a>
        <a href="https://edgeducate.com.au/vce-preparation">VCE Preparation</a>
        <a href="https://edgeducate.com.au/faqs">FAQ</a>
        <a href="https://edgeducate.com.au/contact-us">Contact Us</a>
      </nav>
      <nav class="footer-column" aria-label="Resource links">
        <h2>Resources</h2>
        <a href="${prefix}all-resources.html?type=interactive-app">Interactive Learning</a>
        <a href="${prefix}all-resources.html?type=video">Videos</a>
        <a href="${prefix}all-resources.html?type=practice-questions">Practice Questions</a>
        <a href="${prefix}all-resources.html?type=practice-exam">Practice Exams</a>
        <a href="${prefix}all-resources.html?type=knowledge-sheet">Knowledge Sheet</a>
        <a href="${prefix}all-resources.html?q=Formula+Sheets">Formula Sheets</a>
      </nav>
      <nav class="footer-column" aria-label="Subject links">
        <h2>Subjects</h2>
        <a href="${prefix}all-resources.html?subject=Biology">VCE Biology</a>
        <a href="${prefix}all-resources.html?subject=Chemistry">VCE Chemistry</a>
        <a href="${prefix}all-resources.html?subject=Maths&mathsType=general">VCE General Mathematics</a>
        <a href="${prefix}all-resources.html?subject=Maths&mathsType=methods">VCE Mathematical Methods</a>
        <a href="${prefix}all-resources.html?subject=Physics">VCE Physics</a>
        <a href="${prefix}all-resources.html?subject=Physics&type=practice-questions">VCE Physics Practice Questions</a>
        <a href="${prefix}all-resources.html?subject=Physics&type=practice-exam">VCE Physics Practice Exams</a>
        <a href="${prefix}all-resources.html?subject=Physics&type=checklist">VCE Physics Checklists</a>
      </nav>
      <nav class="footer-column" aria-label="Legal links">
        <h2>Legal</h2>
        <a href="https://edgeducate.com.au/code-of-conduct">Code of Conduct</a>
        <a href="https://edgeducate.com.au/terms-and-conditions">Terms and Conditions</a>
        <a href="https://edgeducate.com.au/payment-and-refund-policy">Payment and Refund</a>
        <a href="https://edgeducate.com.au/privacy-policy">Privacy Policy</a>
        <a href="https://edgeducate.com.au/child-safety-statement">Child Safety</a>
      </nav>
    </div>`;

  document.querySelectorAll('.site-footer').forEach((footer) => {
    footer.innerHTML = footerMarkup;
  });

  const hydrateSolutionsDetails = async () => {
    const copy = document.querySelector('.solutions-detail .resource-detail-copy');
    if (!copy || copy.querySelector('.resource-detail-meta')) return;

    let sourceMeta = null;
    try {
      const response = await fetch('../index.html', { credentials: 'same-origin' });
      if (response.ok) {
        const source = new DOMParser().parseFromString(await response.text(), 'text/html');
        sourceMeta = source.querySelector('.resource-detail-meta');
      }
    } catch (error) {
      sourceMeta = null;
    }

    if (!sourceMeta && Array.isArray(window.EDG_RESOURCES)) {
      const title = copy.querySelector('h1')?.textContent.trim();
      const resource = window.EDG_RESOURCES.find((item) => item.title === title);
      if (resource) {
        sourceMeta = document.createElement('dl');
        sourceMeta.className = 'resource-detail-meta';
        [['Subject', resource.subject], ['Year level', resource.year], ['Difficulty', resource.level]]
          .filter(([, value]) => value)
          .forEach(([label, value]) => {
            const row = document.createElement('div');
            const term = document.createElement('dt');
            const definition = document.createElement('dd');
            term.textContent = label;
            definition.textContent = value;
            row.append(term, definition);
            sourceMeta.appendChild(row);
          });
      }
    }

    if (!sourceMeta) return;
    const meta = sourceMeta.cloneNode(true);
    meta.querySelectorAll('div').forEach((row) => {
      const label = row.querySelector('dt')?.textContent.trim();
      if (label === 'Solutions' || label === 'Solutions video') row.remove();
    });
    copy.insertBefore(meta, copy.querySelector('.btn') || null);
  };
  void hydrateSolutionsDetails();

  const solutionsCopy = document.querySelector('.solutions-detail .resource-detail-copy');
  if (solutionsCopy && !solutionsCopy.querySelector('.resource-back')) {
    const backLink = document.createElement('a');
    backLink.className = 'resource-back solution-back-link btn btn-light btn-block';
    backLink.href = '../index.html';
    backLink.textContent = 'Back to resource';
    solutionsCopy.appendChild(backLink);
  }

  const menuMarkup = `
    <a href="https://edgeducate.com.au/pricing">Pricing</a>
    <details class="nav-dropdown">
      <summary>Our Classes</summary>
      <div class="nav-dropdown-menu">
        <a href="#">Primary</a>
        <a href="#">Secondary</a>
        <a href="#">Selective School</a>
      </div>
    </details>
    <details class="nav-dropdown">
      <summary><a href="https://edgeducate.com.au/vce-preparation-program">VCE Preparation</a></summary>
      <div class="nav-dropdown-menu">
        <a href="https://edgeducate.com.au/vce-biology">VCE Biology</a>
        <a href="https://edgeducate.com.au/vce-chemistry">VCE Chemistry</a>
        <a href="${prefix}all-resources.html?subject=Physics">VCE Physics</a>
        <a href="${prefix}all-resources.html?subject=Maths&mathsType=general">VCE General Mathematics</a>
        <a href="https://edgeducate.com.au/vce-mathematical-methods">VCE Mathematical Methods</a>
      </div>
    </details>
    <a href="${prefix}resources.html">Resources</a>
    <a class="club-nav-link" href="${prefix}club.html">Club</a>
    <a href="https://edgeducate.com.au/contact-us">Contact Us</a>`;

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

    if (!toggle.dataset.menuBound) {
      toggle.addEventListener('click', () => {
        const detailDialog = document.getElementById('club-detail-dialog');
        if (detailDialog && detailDialog.open) detailDialog.close();
        const open = nav.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('nav-open', open);
        if (!open) {
          nav.querySelectorAll('.nav-dropdown[open]').forEach((dropdown) => { dropdown.open = false; });
        }
      });
      toggle.dataset.menuBound = '1';
    }

    nav.querySelectorAll('.nav-dropdown').forEach((dropdown) => {
      const summary = dropdown.querySelector('summary');

      if (!dropdown.dataset.hoverBound) {
        dropdown.addEventListener('mouseenter', () => {
          if (window.matchMedia('(min-width: 1101px)').matches) dropdown.open = true;
        });
        dropdown.addEventListener('mouseleave', () => {
          if (window.matchMedia('(min-width: 1101px)').matches) dropdown.open = false;
        });
        dropdown.dataset.hoverBound = '1';
      }

      if (summary && !summary.dataset.mobileAccordionBound) {
        summary.addEventListener('click', (event) => {
          if (!window.matchMedia('(max-width: 1100px)').matches) return;
          if (event.target.closest('a')) return;
          event.preventDefault();
          const willOpen = !dropdown.open;
          nav.querySelectorAll('.nav-dropdown[open]').forEach((item) => {
            if (item !== dropdown) item.open = false;
          });
          dropdown.open = willOpen;
        });
        summary.dataset.mobileAccordionBound = '1';
      }
    });

  });
})();
