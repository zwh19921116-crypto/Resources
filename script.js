const CONFIG = window.EDG_CONFIG;
const ALL = (window.EDG_RESOURCES || []).filter((r) => r.status !== 'draft');
const PAGE = document.body.dataset.page;

const el = (id) => document.getElementById(id);
const grid = el('resource-grid');
const searchInput = el('q');

const state = { q: '', type: '', subject: '', year: '', sort: 'newest', shown: CONFIG.pageSize };

el('year').textContent = new Date().getFullYear();

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
const levelTone = (level) => ({ Easy: 'easy', Medium: 'medium', Hard: 'hard', Fun: 'fun' }[level] || 'info');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function youtubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function driveId(url) {
  const m = String(url).match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  return m ? m[1] : null;
}
const isPdf = (url) => /\.pdf(\?|#|$)/i.test(String(url));

/* ---------- cards ---------- */
function buildCard(r) {
  const type = CONFIG.types[r.type] || { label: r.type, colour: 'blue', action: 'link' };
  const card = document.createElement('article');
  card.className = 'resource-card';
  card.dataset.id = r.id;

  const tone = levelTone(r.level);
  card.innerHTML = `
    <div class="thumb">
      ${window.edgThumb(r.art, r.image)}
      <span class="badge badge-${type.colour}">${esc(type.label)}</span>
      ${type.action === 'embed' ? '<span class="play-overlay"><svg class="ico" aria-hidden="true"><use href="#i-play"/></svg></span>' : ''}
    </div>
    <button class="card-link" type="button">
      <h3>${esc(r.title)}</h3>
      <p class="meta">${[r.year, r.details].filter(Boolean).map(esc).join(' &nbsp;•&nbsp; ')}</p>
    </button>
    <p class="foot">
      <span class="level ${tone}">${esc(r.level || '')}</span>
      <svg class="ico bars ${tone}" aria-hidden="true"><use href="#i-bars"/></svg>
    </p>`;

  card.querySelector('.thumb').addEventListener('click', () => openDetail(r));
  card.querySelector('.card-link').addEventListener('click', () => openDetail(r));
  return card;
}

/* ---------- detail popup ---------- */
const modal = el('detail-modal');

function previewMarkup(r) {
  const yt = youtubeId(r.url);
  if (yt) {
    return `<iframe src="https://www.youtube-nocookie.com/embed/${yt}?rel=0" title="${esc(r.title)}"
      allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }
  const drive = driveId(r.url);
  if (drive) {
    return `<iframe src="https://drive.google.com/file/d/${drive}/preview" title="${esc(r.title)}" allow="autoplay"></iframe>`;
  }
  if (isPdf(r.url)) {
    return `<iframe src="${esc(r.url)}#view=FitH" title="${esc(r.title)}"></iframe>
      <p class="preview-hint">Preview not loading? Some sites block embedding — use <b>Download / Open</b>.</p>`;
  }
  return `
    <div class="preview-fallback">
      ${window.edgThumb(r.art, r.image)}
      <div class="preview-note">
        <p>No preview available for this resource.</p>
        <p class="small">Use the button below to open it.</p>
      </div>
    </div>`;
}

function openDetail(r) {
  const type = CONFIG.types[r.type] || { label: r.type, colour: 'blue', action: 'link' };
  const tone = levelTone(r.level);

  el('detail-preview').innerHTML = previewMarkup(r);
  el('detail-badge').className = `badge badge-${type.colour}`;
  el('detail-badge').textContent = type.label;
  el('detail-title').textContent = r.title;
  el('detail-desc').textContent = r.desc || '';
  el('detail-desc').hidden = !r.desc;

  const rows = [
    ['Subject', r.subject],
    ['Year level', r.year],
    ['Difficulty', r.level],
    ['Details', r.details],
    ['Added', r.added]
  ].filter(([, v]) => v);
  el('detail-meta').innerHTML = rows
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd${k === 'Difficulty' ? ` class="level ${tone}"` : ''}>${esc(v)}</dd></div>`)
    .join('');

  const tags = el('detail-tags');
  tags.innerHTML = (r.tags || []).map((t) => `<span class="tag-chip">${esc(t)}</span>`).join('');
  tags.hidden = !(r.tags || []).length;

  const action = el('detail-download');
  action.href = r.url || '#';
  action.textContent = youtubeId(r.url) ? 'Watch on YouTube' : 'Download / Open';

  modal.hidden = false;
  document.body.classList.add('modal-open');
  el('detail-close').focus();
}

function closeDetail() {
  modal.hidden = true;
  el('detail-preview').innerHTML = '';
  document.body.classList.remove('modal-open');
}

modal.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeDetail();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeDetail();
});

/* ---------- home page ---------- */
function renderHome() {
  const wrap = el('category-grid');
  Object.entries(CONFIG.types).forEach(([key, t]) => {
    const total = ALL.filter((r) => r.type === key).length;
    const a = document.createElement('a');
    a.className = 'category-card';
    a.href = `resources.html?type=${encodeURIComponent(key)}`;
    a.innerHTML = `
      <span class="cat-icon ${t.colour}"><svg class="ico"><use href="#i-${t.icon}"/></svg></span>
      <span class="cat-body">
        <span class="cat-title">${esc(t.label)}</span>
        <span class="cat-blurb">${esc(t.blurb)}</span>
      </span>
      <span class="cat-foot">
        <span class="cat-count">${total} ${total === 1 ? 'resource' : 'resources'}</span>
        <svg class="ico arrow" aria-hidden="true"><use href="#i-arrow"/></svg>
      </span>`;
    wrap.appendChild(a);
  });

  const typeWrap = el('filter-type');
  const chip = (key, label, count) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter-chip';
    b.dataset.type = key;
    b.innerHTML = `${esc(label)} <span class="chip-count">${count}</span>`;
    b.addEventListener('click', () => {
      state.type = state.type === key ? '' : key;
      renderLatest();
    });
    return b;
  };
  typeWrap.appendChild(chip('', 'All', ALL.length));
  Object.entries(CONFIG.types).forEach(([key, t]) =>
    typeWrap.appendChild(chip(key, t.label, ALL.filter((r) => r.type === key).length))
  );

  function renderLatest() {
    const latest = ALL.filter((r) => !state.type || r.type === state.type)
      .sort((a, b) => String(b.added || '').localeCompare(String(a.added || '')))
      .slice(0, 8);

    grid.innerHTML = '';
    latest.forEach((r) => grid.appendChild(buildCard(r)));
    el('no-results').hidden = latest.length > 0;

    typeWrap.querySelectorAll('.filter-chip').forEach((c) => {
      c.classList.toggle('is-on', c.dataset.type === state.type);
    });
  }
  renderLatest();

  el('resource-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    location.href = q ? `resources.html?q=${encodeURIComponent(q)}` : 'resources.html';
  });

  renderPopular();
}

/** Popular searches come from the tags and subjects actually in the library. */
function renderPopular() {
  const wrap = el('popular');
  const counts = new Map();
  ALL.forEach((r) => {
    [...(r.tags || []), r.subject].filter(Boolean).forEach((term) => {
      const key = String(term).trim();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([term]) => term);

  if (!top.length) return;
  top.forEach((term) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = term;
    b.addEventListener('click', () => {
      location.href = `resources.html?q=${encodeURIComponent(term)}`;
    });
    wrap.appendChild(b);
  });
  wrap.hidden = false;
}

/* ---------- library page ---------- */
function matches(r) {
  if (state.type && r.type !== state.type) return false;
  if (state.subject && r.subject !== state.subject) return false;
  if (state.year && r.year !== state.year) return false;
  if (!state.q) return true;
  const type = CONFIG.types[r.type];
  const haystack = [r.title, r.desc, r.subject, r.year, r.level, r.details, type && type.label, (r.tags || []).join(' ')]
    .join(' ')
    .toLowerCase();
  return state.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => haystack.includes(w));
}

function setFilter(key, value) {
  state[key] = value;
  state.shown = CONFIG.pageSize;
  renderLibrary();
}

function resetFilters() {
  Object.assign(state, { q: '', type: '', subject: '', year: '', shown: CONFIG.pageSize });
  searchInput.value = '';
  el('filter-subject').value = '';
  el('filter-year').value = '';
  renderLibrary();
}

function renderLibraryControls() {
  const stats = el('hero-stats');
  if (stats) {
    const subjects = new Set(ALL.map((r) => r.subject).filter(Boolean));
    [
      ['Resources', ALL.length],
      ['Categories', Object.keys(CONFIG.types).length],
      ['Subjects', subjects.size]
    ].forEach(([label, value]) => {
      const d = document.createElement('div');
      d.innerHTML = `<dt>${esc(label)}</dt><dd>${value}</dd>`;
      stats.appendChild(d);
    });
  }

  const typeWrap = el('filter-type');
  const option = (key, label, count, icon, colour) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter-option';
    b.dataset.type = key;
    b.innerHTML = `
      ${icon ? `<span class="opt-icon ${colour}"><svg class="ico"><use href="#i-${icon}"/></svg></span>` : '<span class="opt-icon all">✦</span>'}
      <span class="opt-label">${esc(label)}</span>
      <span class="opt-count">${count}</span>`;
    b.addEventListener('click', () => setFilter('type', state.type === key ? '' : key));
    return b;
  };
  typeWrap.appendChild(option('', 'All resources', ALL.length));
  Object.entries(CONFIG.types).forEach(([key, t]) =>
    typeWrap.appendChild(option(key, t.label, ALL.filter((r) => r.type === key).length, t.icon, t.colour))
  );

  const fill = (select, values) => values.forEach((v) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
  fill(el('filter-subject'), CONFIG.subjects);
  fill(el('filter-year'), CONFIG.years);

  el('filter-subject').addEventListener('change', (e) => setFilter('subject', e.target.value));
  el('filter-year').addEventListener('change', (e) => setFilter('year', e.target.value));
  el('sort-by').addEventListener('change', (e) => setFilter('sort', e.target.value));
  el('no-results-reset').addEventListener('click', resetFilters);
  el('filter-reset').addEventListener('click', resetFilters);
  el('load-more').addEventListener('click', () => {
    state.shown += CONFIG.pageSize;
    renderLibrary();
  });

  // A new search starts fresh - it replaces any category or dropdown filters.
  const runSearch = () => {
    state.type = '';
    state.subject = '';
    state.year = '';
    el('filter-subject').value = '';
    el('filter-year').value = '';
    setFilter('q', searchInput.value.trim());
  };
  searchInput.addEventListener('input', runSearch);
  el('resource-search').addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch();
  });
}

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
    b.innerHTML = `${esc(p.label)}<svg class="ico" aria-hidden="true"><use href="#i-close"/></svg>`;
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

function renderLibrary() {
  const results = ALL.filter(matches).sort((a, b) =>
    state.sort === 'az'
      ? a.title.localeCompare(b.title)
      : String(b.added || '').localeCompare(String(a.added || ''))
  );
  const page = results.slice(0, state.shown);

  grid.innerHTML = '';
  page.forEach((r) => grid.appendChild(buildCard(r)));

  const type = CONFIG.types[state.type];
  el('latest-title').textContent = type ? type.label : 'All resources';
  el('result-count').textContent = `${results.length} ${results.length === 1 ? 'resource' : 'resources'}`;
  el('no-results').hidden = results.length > 0;

  const more = results.length - state.shown;
  el('load-more').hidden = more <= 0;
  el('load-more').textContent = `Load more (${more} remaining)`;

  renderActiveFilters();
  el('filter-reset').hidden = !(state.q || state.type || state.subject || state.year);
  document.querySelectorAll('#filter-type .filter-option').forEach((opt) => {
    const on = opt.dataset.type === state.type;
    opt.classList.toggle('is-on', on);
    opt.setAttribute('aria-pressed', String(on));
  });
}

/* ---------- start ---------- */
if (PAGE === 'library') {
  renderLibraryControls();
  const params = new URLSearchParams(location.search);
  const q = params.get('q');
  const type = params.get('type');
  if (q) {
    state.q = q;
    searchInput.value = q;
  }
  if (type && CONFIG.types[type]) state.type = type;
  renderLibrary();
} else {
  renderHome();
}
