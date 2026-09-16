(() => {
  const deals = Array.isArray(window.EDG_CLUB_DEALS) ? window.EDG_CLUB_DEALS : [];
  const grid = document.getElementById('club-deals');
  const empty = document.getElementById('club-empty');
  const search = document.getElementById('club-search');
  const clearSearch = document.getElementById('club-search-clear');
  const filterButtons = [...document.querySelectorAll('[data-filter]')];
  const detailDialog = document.getElementById('club-detail-dialog');
  const today = new Date().toISOString().slice(0, 10);
  let activeFilter = 'all';
  let userLocation = null;
  let renderLimit = 9;
  let loadObserver = null;

  document.getElementById('year').textContent = new Date().getFullYear();
  const navToggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('primary-nav');
  navToggle.addEventListener('click', () => {
    const expanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('is-open', !expanded);
  });

  const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));

  const publishedDeals = deals.filter((deal) => deal.status === 'published' && (!deal.expires || deal.expires >= today));
  const hasCoordinates = (deal) => Number.isFinite(Number(deal.latitude)) && Number.isFinite(Number(deal.longitude)) && deal.latitude !== '' && deal.longitude !== '';
  const sampleImages = [
    'https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=700&q=80',
    'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=700&q=80',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=700&q=80',
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=700&q=80',
    'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=700&q=80'
  ];
  const sampleCategories = ['Study', 'Study', 'Study', 'Shopping', 'Activities', 'Study', 'Study', 'Study', 'Wellbeing', 'Activities'];
  const isInStore = (deal) => Boolean(deal.locationName || deal.address || deal.mapUrl || hasCoordinates(deal));

  function distanceInKm(latitudeA, longitudeA, latitudeB, longitudeB) {
    const radians = (value) => value * Math.PI / 180;
    const deltaLatitude = radians(latitudeB - latitudeA);
    const deltaLongitude = radians(longitudeB - longitudeA);
    const value = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(deltaLongitude / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function renderDeals() {
    const query = search.value.trim().toLowerCase();
    const visibleDeals = publishedDeals.filter((deal) => {
      const matchesSearch = !query || `${deal.title} ${deal.partner} ${deal.description} ${deal.code}`.toLowerCase().includes(query);
      const matchesFilter = activeFilter === 'all'
        || (activeFilter === 'in-store' && isInStore(deal))
        || (activeFilter === 'online' && !isInStore(deal))
        || (activeFilter === 'birthday' && deal.birthday)
        || (activeFilter === 'nearby' && hasCoordinates(deal));
      return matchesSearch && matchesFilter;
    }).sort((first, second) => {
      if (activeFilter !== 'nearby' || !userLocation) return 0;
      return distanceInKm(userLocation.latitude, userLocation.longitude, Number(first.latitude), Number(first.longitude)) - distanceInKm(userLocation.latitude, userLocation.longitude, Number(second.latitude), Number(second.longitude));
    });
    const renderedDeals = visibleDeals.slice(0, renderLimit);
    clearSearch.hidden = !query;
    empty.hidden = visibleDeals.length > 0;
    grid.innerHTML = renderedDeals.map((deal, index) => {
    const expiry = deal.expires ? `<p class="club-expiry">Ends ${new Date(`${deal.expires}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>` : '<p class="club-expiry">Available for a limited time</p>';
    const locationLink = hasCoordinates(deal)
      ? `geo:${Number(deal.latitude)},${Number(deal.longitude)}?q=${encodeURIComponent(`${deal.latitude},${deal.longitude} (${deal.partner || deal.title})`)}`
      : deal.mapUrl;
    const sample = deal.birthday ? '<span class="club-sample">Birthday perk</span>' : /^sample/i.test(deal.partner || '') ? '<span class="club-sample">Sample offer</span>' : '';
    const disclaimer = deal.disclaimer ? `<p class="club-disclaimer">${escapeHtml(deal.disclaimer)}</p>` : '';
    const distance = userLocation && hasCoordinates(deal) ? `<p class="club-distance">${distanceInKm(userLocation.latitude, userLocation.longitude, Number(deal.latitude), Number(deal.longitude)).toFixed(1)} km away</p>` : '';
    const inferredHighlight = /^free\b/i.test(deal.title) ? 'FREE' : (deal.title.match(/^\d+%/) || [])[0] ? `${(deal.title.match(/^\d+/) || [])[0]}% OFF` : 'CLUB DEAL';
    const highlight = `<span class="club-offer-highlight">${escapeHtml(deal.highlight || inferredHighlight)}</span>`;
    const marker = escapeHtml((deal.partner || 'E').trim().slice(0, 1).toUpperCase());
    const category = deal.category || (deal.birthday ? 'Birthday' : sampleCategories[index % sampleCategories.length]);
    const dealKind = deal.badge || (deal.birthday ? 'Birthday perk' : isInStore(deal) ? 'In-store' : 'Online');
    const place = deal.locationName || deal.address || (isInStore(deal) ? 'In-store location' : 'Online');
    const image = deal.image || sampleImages[index % sampleImages.length];
    const tone = ['blue', 'orange', 'purple', 'green'][index % 4];
    return `<article class="club-deal club-deal--${index % 5}" data-tone="${tone}" data-deal-id="${escapeHtml(deal.id)}" tabindex="0">
      <div class="club-deal-banner"><span class="club-kind">${escapeHtml(dealKind)}</span><span class="club-deal-marker">${marker}</span></div>
      <div class="club-deal-content"><div class="club-deal-top"><span class="club-deal-tags">${highlight}${sample}</span></div>
      <h2>${escapeHtml(deal.title)}</h2>
      <p class="club-partner">${escapeHtml(deal.partner || 'Edgeducate Club')}</p>
      <p class="club-tile-place">${escapeHtml(place)}</p>
      <p class="club-description">${escapeHtml(deal.description)}</p>
      ${distance}
      <div class="club-deal-foot">${expiry}<span class="club-tile-label">${deal.birthday ? 'Birthday treat' : 'Club offer'}</span><button class="club-view-deal" type="button" data-open="${escapeHtml(deal.id)}">View deal</button></div>${disclaimer}</div>
      <div class="club-card-image"><img src="${escapeHtml(image)}" alt="" loading="lazy" /></div>
    </article>`;
    }).join('');
    const loadMore = document.getElementById('club-load-more');
    loadMore.hidden = renderedDeals.length >= visibleDeals.length;
    loadMore.textContent = `Load more offers (${visibleDeals.length - renderedDeals.length} left)`;
    if (loadObserver) loadObserver.disconnect();
    if (renderedDeals.length < visibleDeals.length) {
      loadObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          renderLimit += 9;
          renderDeals();
        }
      }, { rootMargin: '0px 0px 80px' });
      loadObserver.observe(loadMore);
    }
  }

  renderDeals();
  search.addEventListener('input', () => { renderLimit = 9; renderDeals(); });
  clearSearch.addEventListener('click', () => { search.value = ''; search.focus(); renderLimit = 9; renderDeals(); });
  document.getElementById('club-load-more').addEventListener('click', () => { renderLimit += 9; renderDeals(); });
  filterButtons.forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.filter === 'nearby' && !userLocation) {
      if (!navigator.geolocation) return;
      button.disabled = true;
      button.textContent = 'Finding you...';
      navigator.geolocation.getCurrentPosition((position) => {
        userLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        button.disabled = false;
        button.textContent = 'Near me';
        activeFilter = 'nearby';
        filterButtons.forEach((item) => item.classList.toggle('is-active', item === button));
        renderDeals();
      }, () => {
        button.disabled = false;
        button.textContent = 'Near me';
      }, { enableHighAccuracy: false, maximumAge: 300000, timeout: 10000 });
      return;
    }
    activeFilter = button.dataset.filter;
    renderLimit = 9;
    filterButtons.forEach((item) => item.classList.toggle('is-active', item === button));
    renderDeals();
  }));

  grid.addEventListener('click', async (event) => {
    const openButton = event.target.closest('[data-open]');
    if (openButton) {
      openOffer(openButton.dataset.open, openButton.closest('.club-deal')?.dataset.tone);
      return;
    }
    const card = event.target.closest('.club-deal');
    if (card && !event.target.closest('a, button')) {
      openOffer(card.dataset.dealId, card.dataset.tone);
      return;
    }
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy code'; }, 1600);
    } catch (error) {
      window.prompt('Copy this voucher code:', button.dataset.copy);
    }
  });

  grid.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('club-deal')) {
      event.preventDefault();
      openOffer(event.target.dataset.dealId, event.target.dataset.tone);
    }
  });

  function openOffer(id, tone) {
    const deal = publishedDeals.find((item) => item.id === id);
    if (!deal) return;
    const detailTone = tone || 'blue';
    detailDialog.classList.remove('club-detail-dialog--blue', 'club-detail-dialog--orange', 'club-detail-dialog--purple', 'club-detail-dialog--green');
    detailDialog.classList.add(`club-detail-dialog--${detailTone}`);
    const inferredHighlight = /^free\b/i.test(deal.title) ? 'FREE' : (deal.title.match(/^\d+/) || [])[0] ? `${(deal.title.match(/^\d+/) || [])[0]}% OFF` : 'CLUB DEAL';
    const locationLink = hasCoordinates(deal) ? `geo:${Number(deal.latitude)},${Number(deal.longitude)}?q=${encodeURIComponent(`${deal.latitude},${deal.longitude} (${deal.partner || deal.title})`)}` : deal.mapUrl;
    const offerType = deal.birthday ? 'Birthday perk' : (deal.locationName || deal.address || deal.mapUrl || hasCoordinates(deal)) ? 'In-store offer' : 'Online offer';
    const visual = document.getElementById('club-detail-image');
    visual.src = deal.image || 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=700&q=80';
    visual.hidden = false;
    document.getElementById('club-detail-kind').textContent = offerType;
    document.getElementById('club-detail-type').textContent = offerType;
    document.getElementById('club-detail-partner').textContent = deal.partner || 'Edgeducate Club';
    document.getElementById('club-detail-highlight').textContent = deal.highlight || inferredHighlight;
    document.getElementById('club-detail-title').textContent = deal.title;
    document.getElementById('club-detail-description').textContent = deal.description || '';
    const formatDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
    document.getElementById('club-detail-location').textContent = deal.locationName || (locationLink ? 'Location details available' : 'Online offer');
    document.getElementById('club-detail-address').textContent = deal.address || (locationLink ? 'Open location for directions' : 'Not applicable');
    document.getElementById('club-detail-validity').textContent = deal.starts && deal.expires ? `${formatDate(deal.starts)} to ${formatDate(deal.expires)}` : deal.expires ? `Until ${formatDate(deal.expires)}` : deal.starts ? `From ${formatDate(deal.starts)}` : 'Available for a limited time';
    const disclaimer = document.getElementById('club-detail-disclaimer');
    disclaimer.textContent = deal.disclaimer || '';
    disclaimer.hidden = !deal.disclaimer;
    const codeBox = document.getElementById('club-detail-code');
    codeBox.hidden = !deal.code;
    codeBox.innerHTML = deal.code ? `<p>Show this voucher code at checkout.</p><span>${escapeHtml(deal.code)}</span><button type="button" data-copy="${escapeHtml(deal.code)}">Copy code</button>` : '';
    const actionLink = deal.url || locationLink;
    document.getElementById('club-detail-actions').innerHTML = `<a class="club-detail-view-all" href="#club-offers" onclick="document.getElementById('club-detail-dialog').close()">View all offers <span aria-hidden="true">&rarr;</span></a>${actionLink ? `<a class="btn btn-primary" href="${escapeHtml(actionLink)}"${hasCoordinates(deal) ? '' : ' target="_blank" rel="noopener noreferrer"'}>${deal.url ? 'Book a session' : 'Open location'} <span aria-hidden="true">&rarr;</span></a>` : ''}`;
    detailDialog.showModal();
  }

  document.getElementById('club-detail-close').addEventListener('click', () => detailDialog.close());
  document.getElementById('club-detail-code').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = 'Copied'; } catch (error) { window.prompt('Copy this voucher code:', button.dataset.copy); }
  });
})();
