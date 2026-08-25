const CONFIG = window.EDG_CONFIG;
const ALL = (window.EDG_RESOURCES || []).filter((r) => r.status !== 'draft');

const el = (id) => document.getElementById(id);
const grid = el('resource-grid');
const countEl = el('result-count');
const noResults = el('no-results');
const loadMoreBtn = el('load-more');
const searchInput = el('q');

const state = { q: '', type: '', subject: '', year: '', sort: 'newest', shown: CONFIG.pageSize };

document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- header ---------- */
const toggle = document.querySelector('.nav-toggle');
const nav = el('primary-nav');
toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('is-open');
  toggle.setAttribute('aria-expanded', String(open));
});

const header = document.querySelector('.site-header');
const setHeaderState = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
setHeaderState();
window.addEventListener('scroll', setHeaderState, { passive: true });

/* ---------- helpers ---------- */
const levelTone = (level) => {
  const map = { Easy: 'easy', Medium: 'medium', Hard: 'hard', Fun: 'fun' };
  return map[level] || 'info';
};

function youtubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

/* ---------- categories ---------- */
function renderCategories() {
  const wrap = el('category-grid');
  wrap.innerHTML = '';
  Object.entries(CONFIG.types).forEach(([key, t]) => {
    const total = ALL.filter((r) => r.type === key).length;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'category-card';
    card.dataset.type = key;
    card.setAttribute('aria-pressed', 'false');
    card.innerHTML = `
      <span class="cat-icon ${t.colour}"><svg class="ico"><use href="#i-${t.icon}"/></svg></span>
      <span class="cat-body">
        <span class="cat-title">${t.label}</span>
        <span class="cat-blurb">${t.blurb}</span>
      </span>
      <span class="cat-foot">
        <span class="cat-count">${total} ${total === 1 ? 'resource' : 'resources'}</span>
        <svg class="ico arrow" aria-hidden="true"><use href="#i-arrow"/></svg>
      </span>`;
    card.addEventListener('click', () => {
      setFilter('type', state.type === key ? '' : key);
      el('latest').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    wrap.appendChild(card);
  });
}

/* ---------- filters ---------- */
function renderFilterControls() {
  const fill = (select, values) => {
    values.forEach((v) => {
      const o = document.createElement('option');
      o.value = v;
      o.textContent = v;
      select.appendChild(o);
    });
  };
  fill(el('filter-subject'), CONFIG.subjects);
  fill(el('filter-year'), CONFIG.years);

  el('filter-subject').addEventListener('change', (e) => setFilter('subject', e.target.value));
  el('filter-year').addEventListener('change', (e) => setFilter('year', e.target.value));
  el('sort-by').addEventListener('change', (e) => setFilter('sort', e.target.value));
  el('no-results-reset').addEventListener('click', resetFilters);
}

function setFilter(key, value) {
  state[key] = value;
  state.shown = CONFIG.pageSize;
  render();
}

function resetFilters() {
  state.q = '';
  state.type = '';
  state.subject = '';
  state.year = '';
  state.shown = CONFIG.pageSize;
  searchInput.value = '';
  el('filter-subject').value = '';
  el('filter-year').value = '';
  render();
}

/* ---------- active filter pills ---------- */
function renderActiveFilters() {
  const wrap = el('active-filters');
  const pills = [];
  if (state.q) pills.push({ key: 'q', label: `“${state.q}”` });
  if (state.type) pills.push({ key: 'type', label: (CONFIG.types[state.type] || {}).label || state.type });
  if (state.subject) pills.push({ key: 'subject', label: state.subject });
  if (state.year) pills.push({ key: 'year', label: state.year });

  wrap.hidden = pills.length === 0;
  wrap.innerHTML = '';
  pills.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'active-pill';
    b.innerHTML = `${p.label}<svg class="ico" aria-hidden="true"><use href="#i-close"/></svg>`;
    b.setAttribute('aria-label', `Remove filter ${p.label}`);
    b.addEventListener('click', () => {
      if (p.key === 'q') searchInput.value = '';
      if (p.key === 'subject') el('filter-subject').value = '';
      if (p.key === 'year') el('filter-year').value = '';
      setFilter(p.key, '');
    });
    wrap.appendChild(b);
  });

  if (pills.length > 1) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'clear-all';
    clear.textContent = 'Clear all';
    clear.addEventListener('click', resetFilters);
    wrap.appendChild(clear);
  }
}

/* ---------- matching ---------- */
function matches(r) {
  if (state.type && r.type !== state.type) return false;
  if (state.subject && r.subject !== state.subject) return false;
  if (state.year && r.year !== state.year) return false;
  if (!state.q) return true;
  const type = CONFIG.types[r.type];
  const haystack = [r.title, r.desc, r.subject, r.year, r.level, r.details, type && type.label, (r.tags || []).join(' ')]
    .join(' ')
    .toLowerCase();
  return state.q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/* ---------- cards ---------- */
function buildCard(r) {
  const type = CONFIG.types[r.type] || { label: r.type, colour: 'blue', action: 'link' };
  const card = document.createElement('article');
  card.className = 'resource-card';
  card.dataset.id = r.id;

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  thumb.innerHTML = window.edgThumb(r.art, r.image);

  const badge = document.createElement('span');
  badge.className = `badge badge-${type.colour}`;
  badge.textContent = type.label;
  thumb.appendChild(badge);

  if (type.action === 'embed') {
    const play = document.createElement('span');
    play.className = 'play-overlay';
    play.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-play"/></svg>';
    thumb.appendChild(play);
  }

  const link = document.createElement('a');
  link.className = 'card-link';
  link.href = r.url || '#';
  link.innerHTML = `
    <h3>${r.title}</h3>
    <p class="meta">${[r.year, r.details].filter(Boolean).join(' &nbsp;•&nbsp; ')}</p>`;

  if (type.action === 'embed') {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      openVideo(r);
    });
    thumb.addEventListener('click', () => openVideo(r));
  } else {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    thumb.addEventListener('click', () => link.click());
  }

  const foot = document.createElement('p');
  foot.className = 'foot';
  const tone = levelTone(r.level);
  foot.innerHTML = `
    <span class="level ${tone}">${r.level || ''}</span>
    <svg class="ico bars ${tone}" aria-hidden="true"><use href="#i-bars"/></svg>`;

  card.append(thumb, link, foot);
  return card;
}

/* ---------- video popup ---------- */
const modal = el('video-modal');
const videoFrame = el('video-frame');

function openVideo(r) {
  const id = youtubeId(r.url);
  el('video-title').textContent = r.title;
  videoFrame.innerHTML = id
    ? `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="${r.title}" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    : `<p class="modal-fallback">This video can't be embedded. <a href="${r.url}" target="_blank" rel="noopener noreferrer">Open it in a new tab</a>.</p>`;
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeVideo() {
  modal.hidden = true;
  videoFrame.innerHTML = '';
  document.body.classList.remove('modal-open');
}

modal.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeVideo();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeVideo();
});

/* ---------- render ---------- */
function render() {
  const results = ALL.filter(matches).sort((a, b) => {
    if (state.sort === 'az') return a.title.localeCompare(b.title);
    return String(b.added || '').localeCompare(String(a.added || ''));
  });
  const page = results.slice(0, state.shown);

  grid.innerHTML = '';
  page.forEach((r) => grid.appendChild(buildCard(r)));

  const type = CONFIG.types[state.type];
  el('latest-title').textContent = type ? type.label : 'Latest resources';
  countEl.textContent = `${results.length} ${results.length === 1 ? 'resource' : 'resources'}`;
  noResults.hidden = results.length > 0;
  loadMoreBtn.hidden = results.length <= state.shown;
  loadMoreBtn.textContent = `Load more (${results.length - state.shown} remaining)`;

  renderActiveFilters();

  document.querySelectorAll('.category-card').forEach((c) => {
    const on = c.dataset.type === state.type;
    c.classList.toggle('is-on', on);
    c.setAttribute('aria-pressed', String(on));
  });
}

loadMoreBtn.addEventListener('click', () => {
  state.shown += CONFIG.pageSize;
  render();
});

/* ---------- search ---------- */
searchInput.addEventListener('input', () => setFilter('q', searchInput.value.trim()));

el('resource-search').addEventListener('submit', (e) => {
  e.preventDefault();
  setFilter('q', searchInput.value.trim());
  el('latest').scrollIntoView({ behavior: 'smooth' });
});

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    searchInput.value = chip.textContent;
    setFilter('q', chip.textContent);
    el('latest').scrollIntoView({ behavior: 'smooth' });
  });
});

/* ---------- start ---------- */
renderCategories();
renderFilterControls();

const deepLink = new URLSearchParams(location.search).get('r');
if (deepLink) {
  const found = ALL.find((r) => r.id === deepLink);
  if (found) {
    searchInput.value = found.title;
    state.q = found.title;
  }
}

render();
