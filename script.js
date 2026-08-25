const CONFIG = window.EDG_CONFIG;
const ALL = (window.EDG_RESOURCES || []).filter((r) => r.status !== 'draft');

const el = (id) => document.getElementById(id);
const grid = el('resource-grid');
const countEl = el('result-count');
const noResults = el('no-results');
const loadMoreBtn = el('load-more');
const searchInput = el('q');

const state = { q: '', type: '', subject: '', year: '', shown: CONFIG.pageSize };

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
const artTemplates = {};
document.querySelectorAll('.art-templates template').forEach((t) => {
  artTemplates[t.dataset.art] = t;
});

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
    const a = document.createElement('a');
    a.className = 'category-card';
    a.href = '#latest';
    a.innerHTML = `
      <span class="cat-icon ${t.colour}"><svg class="ico"><use href="#i-${t.icon}"/></svg></span>
      <div class="cat-body">
        <h3>${t.label}</h3>
        <p>${t.blurb}</p>
      </div>
      <svg class="ico arrow" aria-hidden="true"><use href="#i-arrow"/></svg>`;
    a.addEventListener('click', () => setFilter('type', state.type === key ? '' : key));
    wrap.appendChild(a);
  });
}

/* ---------- filters ---------- */
function renderFilterControls() {
  const typeWrap = el('filter-type');
  const mk = (key, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter-chip';
    b.dataset.type = key;
    b.textContent = label;
    b.addEventListener('click', () => setFilter('type', key));
    return b;
  };
  typeWrap.appendChild(mk('', 'All'));
  Object.entries(CONFIG.types).forEach(([key, t]) => typeWrap.appendChild(mk(key, t.label)));

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
  el('filter-reset').addEventListener('click', resetFilters);
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
  const tpl = artTemplates[r.art] || artTemplates.maths;
  if (tpl) thumb.appendChild(tpl.content.cloneNode(true));

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
  const results = ALL.filter(matches);
  const page = results.slice(0, state.shown);

  grid.innerHTML = '';
  page.forEach((r) => grid.appendChild(buildCard(r)));

  countEl.textContent = results.length
    ? `${results.length} resource${results.length === 1 ? '' : 's'}`
    : '';
  noResults.hidden = results.length > 0;
  loadMoreBtn.hidden = results.length <= state.shown;

  const filtering = Boolean(state.q || state.type || state.subject || state.year);
  el('filter-reset').hidden = !filtering;

  document.querySelectorAll('#filter-type .filter-chip').forEach((chip) => {
    chip.classList.toggle('is-on', chip.dataset.type === state.type);
  });
  document.querySelectorAll('.category-card').forEach((c, i) => {
    const key = Object.keys(CONFIG.types)[i];
    c.classList.toggle('is-on', key === state.type);
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
