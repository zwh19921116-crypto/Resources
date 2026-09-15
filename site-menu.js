(() => {
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
