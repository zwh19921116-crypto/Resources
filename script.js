const CONFIG = window.EDG_CONFIG;
const ALL = (window.EDG_RESOURCES || []).filter((r) => r.status !== 'draft');
const PAGE = document.body.dataset.page;

const el = (id) => document.getElementById(id);
const grid = el('resource-grid');
const searchInput = el('q');

const state = { q: '', type: '', subject: '', mathsType: '', year: '', solutions: false, video: false, sort: 'newest', shown: CONFIG.pageSize };

const footerYearNode = el('year');
if (footerYearNode) footerYearNode.textContent = new Date().getFullYear();

const showLibraryLoading = () => {
  const ad = (window.EDG_ADS || []).filter((item) => item.status !== 'draft')[0] || {
    title: 'Get exam-ready with Edgeducate classes',
    body: 'Small-group VCE and secondary tuition led by top-performing tutors. Book a free consultation for your class.',
    duration: 4
  };
  const overlay = document.querySelector('.resource-navigation-loading') || document.createElement('div');
  if (!overlay.parentElement) {
    overlay.className = 'session-loading resource-navigation-loading';
    overlay.innerHTML = `<div class="session-loading-inner" role="status" aria-live="polite">
      <span class="session-loading-brand"><strong>Edge</strong>ducate</span>
      <div class="session-loading-spinner" aria-hidden="true"></div>
      <p class="session-loading-status">Preparing your resource library...</p>
      <div class="session-loading-ad">
        <p class="session-loading-ad-eyebrow">While you wait</p>
        <h2>${esc(ad.title)}</h2>
        <p>${esc(ad.body)}</p>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  }
  window.setTimeout(() => {
    overlay.classList.add('is-done');
    document.documentElement.classList.remove('resource-loading-pending');
    window.setTimeout(() => overlay.remove(), 450);
  }, Math.max(2, Number(ad.duration) || 4) * 1000);
};

/* ---------- header ---------- */

const header = document.querySelector('.site-header');
const setHeaderState = () => header.classList.toggle('is-scrolled', window.scrollY > 24);
setHeaderState();
window.addEventListener('scroll', setHeaderState, { passive: true });

/* ---------- helpers ---------- */
const levelTone = (level) => ({ Easy: 'easy', Medium: 'medium', Hard: 'hard', Fun: 'fun' }[level] || 'info');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

showLibraryLoading();

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
  const detailUrl = `resource-pages/${encodeURIComponent(r.id)}/index.html`;

  const tone = levelTone(r.level);
  const hasSolutions = Boolean(String(r.solutions || '').trim() || String(r.solutionsVideo || '').trim());
  const hasVideo = Boolean(String(r.solutionsVideo || '').trim());
  const availability = hasSolutions || hasVideo ? `
      <span class="resource-availability" aria-label="Available materials">
        ${hasSolutions ? '<span class="availability-item availability-solutions"><svg class="ico" aria-hidden="true"><use href="#i-doc"/></svg>Solutions</span>' : ''}
        ${hasVideo ? '<span class="availability-item availability-video"><svg class="ico" aria-hidden="true"><use href="#i-play"/></svg>Video</span>' : ''}
      </span>` : '';
  card.innerHTML = `
    <a class="thumb" href="${detailUrl}" target="_blank" rel="noopener" aria-label="Open ${esc(r.title)} in a new tab">
      ${window.edgThumb(r.art, r.image)}
      <span class="badge badge-${type.colour}">${esc(type.label)}</span>
      ${type.action === 'embed' ? '<span class="play-overlay"><svg class="ico" aria-hidden="true"><use href="#i-play"/></svg></span>' : ''}
    </a>
    <a class="card-link" href="${detailUrl}" target="_blank" rel="noopener">
      <span class="card-title-row"><h3>${esc(r.title)}</h3>${availability}</span>
      <p class="meta">${[r.year, r.details].filter(Boolean).map(esc).join(' &nbsp;•&nbsp; ')}</p>
    </a>
    <p class="foot">
      <span class="level ${tone}">${esc(r.level || '')}</span>
      <span class="card-actions">
        <button class="card-info" type="button" aria-label="Preview and details for ${esc(r.title)}">Info</button>
      </span>
    </p>`;
  card.querySelector('.card-info').addEventListener('click', () => openDetail(r));
  card.addEventListener('click', (event) => {
    if (event.target.closest('a, button')) return;
    window.open(detailUrl, '_blank', 'noopener');
  });
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

  const solutionsAction = el('detail-solutions');
  const hasSolutionsPage = Boolean(String(r.solutions || '').trim() || String(r.solutionsVideo || '').trim());
  solutionsAction.hidden = !hasSolutionsPage;
  solutionsAction.href = hasSolutionsPage
    ? `resource-pages/${encodeURIComponent(r.id)}/solutions/index.html`
    : '#';

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
function renderHeroStats() {
  document.querySelectorAll('[data-stat-type]').forEach((node) => {
    const count = ALL.filter((r) => r.type === node.dataset.statType).length;
    const label = node.dataset.statLabel || node.dataset.statType;
    node.textContent = `${count} ${label}${count === 1 ? '' : 's'}`;
  });
}

function renderHeroSessionPreview() {
  const preview = document.querySelector('.session-preview-head');
  if (!preview) return;

  const stages = [
    { value: 'primary', label: 'Primary School' },
    { value: 'secondary', label: 'Secondary School' },
    { value: 'vce', label: 'VCE' }
  ];
  const topicsForStage = (stage) => [...new Set(ALL
    .filter((resource) => {
      const resourceStage = resource.stage || (String(resource.year || '').startsWith('VCE') ? 'vce' : 'secondary');
      return resourceStage === stage.value;
    })
    .map((resource) => stage.value === 'vce' ? `VCE ${resource.subject}` : resource.subject)
    .filter(Boolean))];
  const goals = {
    all: 'focused study',
    'knowledge-sheet': 'Build understanding',
    'practice-questions': 'focused practice',
    'practice-exam': 'exam preparation'
  };
  const durations = [15, 30, 60];
  let stageIndex = 1;
  let topicIndex = 0;
  let unitIndex = -1;
  let durationIndex = 1;
  let goal = 'all';

  const stageField = document.querySelector('[data-preview-field="stage"]');
  const topicField = document.querySelector('[data-preview-field="topic"]');
  const unitField = document.querySelector('[data-preview-field="unit"]');
  const stageButton = stageField.querySelector('button');
  const topicButton = topicField.querySelector('button');
  const unitButton = unitField.querySelector('button');
  const stageMenu = stageField.querySelector('[data-preview-menu], .session-preview-menu');
  const topicMenu = topicField.querySelector('[data-preview-menu], .session-preview-menu');
  const unitMenu = unitField.querySelector('[data-preview-menu], .session-preview-menu');
  const minutesText = document.querySelector('.session-preview-minutes');

  const closeMenus = () => {
    [stageField, topicField, unitField].forEach((field) => {
      field.querySelector('.session-preview-menu').hidden = true;
      field.querySelector('button').setAttribute('aria-expanded', 'false');
    });
  };
  const renderMenu = (menu, options, selectedIndex, searchable = false) => {
    menu.innerHTML = '';
    if (searchable) {
      const searchItem = document.createElement('li');
      searchItem.className = 'session-preview-search';
      const searchInput = document.createElement('input');
      searchInput.type = 'search';
      searchInput.placeholder = 'Search topics...';
      searchInput.setAttribute('aria-label', 'Search topics');
      searchInput.addEventListener('click', (event) => event.stopPropagation());
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        menu.querySelectorAll('li[data-option]').forEach((item) => {
          item.hidden = query && !item.dataset.option.includes(query);
        });
      });
      searchItem.appendChild(searchInput);
      menu.appendChild(searchItem);
    }
    options.forEach((option, index) => {
      const item = document.createElement('li');
      item.dataset.option = option.toLowerCase();
      const button = document.createElement('button');
      button.type = 'button';
      button.role = 'option';
      button.textContent = option;
      button.setAttribute('aria-selected', String(index === selectedIndex));
      item.appendChild(button);
      menu.appendChild(item);
    });
  };
  const renderMenus = () => {
    const topics = topicsForStage(stages[stageIndex]);
    renderMenu(stageMenu, stages.map((stage) => stage.label), stageIndex);
    renderMenu(topicMenu, ['Select a topic', ...topics], topicIndex + 1, true);
    const topic = topics[topicIndex] || '';
    const subject = topic.replace(/^VCE /, '');
    const units = stageIndex === 2 && topicIndex >= 0
      ? [...new Set(ALL.filter((resource) => {
        const resourceStage = resource.stage || (String(resource.year || '').startsWith('VCE') ? 'vce' : 'secondary');
        return resourceStage === 'vce' && resource.subject === subject;
      }).map((resource) => resource.unit || resource.year).filter(Boolean))]
      : [];
    unitField.hidden = !units.length;
    if (unitIndex >= units.length) unitIndex = -1;
    renderMenu(unitMenu, ['Any unit', ...units], unitIndex + 1);
  };

  const update = () => {
    const stage = stages[stageIndex];
    const topics = topicsForStage(stage);
    const minutes = durations[durationIndex];
    if (topicIndex >= topics.length) topicIndex = -1;
    stageButton.querySelector('b').textContent = stage.label;
    topicButton.querySelector('b').textContent = topicIndex < 0 ? 'Select a topic' : topics[topicIndex];
    const topic = topics[topicIndex] || '';
    const subject = topic.replace(/^VCE /, '');
    const units = stageIndex === 2 && topicIndex >= 0
      ? [...new Set(ALL.filter((resource) => {
        const resourceStage = resource.stage || (String(resource.year || '').startsWith('VCE') ? 'vce' : 'secondary');
        return resourceStage === 'vce' && resource.subject === subject;
      }).map((resource) => resource.unit || resource.year).filter(Boolean))]
      : [];
    unitField.hidden = !units.length;
    unitButton.querySelector('b').textContent = unitIndex < 0 ? 'Any unit' : units[unitIndex] || 'Any unit';
    minutesText.textContent = `${minutes} minutes`;
    renderMenus();
  };

  stageButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = stageMenu.hidden;
    closeMenus();
    stageMenu.hidden = !open;
    stageButton.setAttribute('aria-expanded', String(open));
  });
  topicButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = topicMenu.hidden;
    closeMenus();
    topicMenu.hidden = !open;
    topicButton.setAttribute('aria-expanded', String(open));
  });
  stageMenu.addEventListener('click', (event) => {
    const option = event.target.closest('button');
    if (!option) return;
    stageIndex = [...stageMenu.querySelectorAll('button')].indexOf(option);
    topicIndex = 0;
    unitIndex = -1;
    closeMenus();
    update();
  });
  topicMenu.addEventListener('click', (event) => {
    const option = event.target.closest('button');
    if (!option) return;
    const index = [...topicMenu.querySelectorAll('button')].indexOf(option);
    topicIndex = index - 1;
    unitIndex = -1;
    closeMenus();
    update();
  });
  unitButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = unitMenu.hidden;
    closeMenus();
    unitMenu.hidden = !open;
    unitButton.setAttribute('aria-expanded', String(open));
  });
  unitMenu.addEventListener('click', (event) => {
    const option = event.target.closest('button');
    if (!option) return;
    unitIndex = [...unitMenu.querySelectorAll('button')].indexOf(option) - 1;
    closeMenus();
    update();
  });
  document.addEventListener('click', closeMenus);
  document.querySelectorAll('[data-preview-duration]').forEach((button) => button.addEventListener('click', () => {
    durationIndex = durations.indexOf(Number(button.dataset.previewDuration));
    document.querySelectorAll('[data-preview-duration]').forEach((item) => item.classList.toggle('is-active', item === button));
    update();
  }));
  document.querySelectorAll('[data-preview-type]').forEach((button) => button.addEventListener('click', () => {
    goal = button.dataset.previewType;
    document.querySelectorAll('[data-preview-type]').forEach((item) => {
      item.classList.toggle('is-active', item === button);
    });
    update();
  }));
  document.querySelector('[data-preview-start]').addEventListener('click', () => {
    const stageValues = ['primary', 'secondary', 'vce'];
    const topics = topicsForStage(stages[stageIndex]);
    const topic = topics[topicIndex] || (stages[stageIndex].value === 'secondary' ? 'Maths' : topics[0]);
    if (!topic) {
      window.location.href = 'study-builder.html';
      return;
    }
    const params = new URLSearchParams({
      stage: stageValues[stageIndex],
      subject: topic.replace(/^VCE /, ''),
      minutes: String(durations[durationIndex])
    });
    if (goal !== 'all') params.set('type', goal);
    if (unitIndex >= 0) {
      const selectedUnit = unitMenu.querySelectorAll('button')[unitIndex + 1];
      if (selectedUnit) params.set('unit', selectedUnit.textContent);
    }
    window.location.href = `study-session.html?${params}`;
  });
  update();
}

function renderHome() {
  renderHeroStats();
  renderHeroSessionPreview();
  const wrap = el('category-grid');
  const categoryArt = {
    'practice-questions': 'questions',
    'practice-exam': 'examCard',
    checklist: 'checklistCard',
    'knowledge-sheet': 'knowledge',
    'interactive-app': 'interactive',
    video: 'videoCard'
  };
  Object.entries(CONFIG.types).forEach(([key, t]) => {
    const total = ALL.filter((r) => r.type === key).length;
    const a = document.createElement('a');
    a.className = `category-card category-${t.colour}`;
    a.href = `all-resources.html?type=${encodeURIComponent(key)}`;
    a.innerHTML = `
      <span class="cat-art">${window.edgThumb(categoryArt[key])}</span>
      <span class="cat-body">
        <span class="cat-title">${esc(key === 'video' ? 'Video Lessons' : t.label)}</span>
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

  document.querySelectorAll('.finder-choice').forEach((choice) => {
    choice.addEventListener('click', () => {
      const type = choice.dataset.resourceType;
      location.href = `all-resources.html?type=${encodeURIComponent(type)}`;
    });
  });

  el('resource-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    location.href = q ? `all-resources.html?q=${encodeURIComponent(q)}` : 'all-resources.html';
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
      location.href = `all-resources.html?q=${encodeURIComponent(term)}`;
    });
    wrap.appendChild(b);
  });
  wrap.hidden = false;
}

function renderDailyQuote() {
  const text = el('daily-quote-text');
  if (!text || !Array.isArray(window.EDG_QUOTES) || !window.EDG_QUOTES.length) return;

  const now = new Date();
  const leap = new Date(now.getFullYear(), 1, 29).getMonth() === 1;
  const day = Math.floor((now - new Date(now.getFullYear(), 0, 1)) / 86400000);
  const index = leap || day < 59 ? day : day + 1;
  let shown = index;

  const show = () => {
    text.textContent = `“${window.EDG_QUOTES[shown]}”`;
  };
  show();
  el('quote-next').addEventListener('click', () => {
    shown = (shown + 1) % window.EDG_QUOTES.length;
    show();
  });
}

/* ---------- custom dropdown (styled to match the rest of the UI) ---------- */
function createDropdown(container, options) {
  const placeholder = container.dataset.placeholder || 'Select…';
  container.innerHTML = `
    <button type="button" class="dropdown-trigger" aria-haspopup="listbox" aria-expanded="false">
      <span class="dropdown-value">${esc(placeholder)}</span>
      <svg class="ico chev" aria-hidden="true"><use href="#i-chevron"/></svg>
    </button>
    <ul class="dropdown-list" role="listbox" hidden></ul>`;
  const trigger = container.querySelector('.dropdown-trigger');
  const valueEl = container.querySelector('.dropdown-value');
  const list = container.querySelector('.dropdown-list');
  let availableOptions = options;
  let value = '';

  const renderOptions = () => {
    list.innerHTML = availableOptions
      .map((opt) => `<li role="option" data-value="${esc(opt.value)}" class="${opt.value === value ? 'is-selected' : ''}">${esc(opt.label)}</li>`)
      .join('');
  };
  renderOptions();

  const close = () => {
    list.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };
  const open = () => {
    list.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  };

  trigger.addEventListener('click', () => (list.hidden ? open() : close()));
  document.addEventListener('click', (event) => {
    if (!container.contains(event.target)) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  let onChange = () => {};
  list.addEventListener('click', (event) => {
    const item = event.target.closest('li');
    if (!item) return;
    value = item.dataset.value;
    valueEl.textContent = value ? availableOptions.find((o) => o.value === value).label : placeholder;
    list.querySelectorAll('li').forEach((li) => li.classList.toggle('is-selected', li === item));
    close();
    onChange(value);
  });

  return {
    get value() { return value; },
    reset() {
      value = '';
      valueEl.textContent = placeholder;
      list.querySelectorAll('li').forEach((li) => li.classList.remove('is-selected'));
    },
    setOptions(nextOptions) {
      availableOptions = nextOptions;
      this.reset();
      renderOptions();
    },
    get label() {
      return value ? availableOptions.find((option) => option.value === value)?.label || '' : '';
    },
    onChange(fn) { onChange = fn; }
  };
}

function renderStudyBuilder() {
  const stageEl = el('session-stage');
  const topicEl = el('session-topic');
  if (!stageEl || !topicEl) return;
  const unitEl = el('session-unit');
  const unitLabel = el('session-unit-label');
  const resourceStage = (resource) => resource.stage || (String(resource.year || '').startsWith('VCE') ? 'vce' : 'secondary');

  const availableStages = [
    { value: 'primary', label: 'Primary School' },
    { value: 'secondary', label: 'Secondary' },
    { value: 'vce', label: 'VCE' }
  ].filter((stageOption) => ALL.some((resource) => resourceStage(resource) === stageOption.value));
  const stageDropdown = createDropdown(stageEl, availableStages);
  const topicDropdown = createDropdown(topicEl, [{ value: '', label: 'Select a topic' }]);
  const unitDropdown = createDropdown(unitEl, [{ value: '', label: 'Any unit' }]);

  const goalGroup = el('session-goal');
  const timeGroup = el('session-time');

  const topicDefinitions = {
    primary: [{ value: 'Maths', label: 'Maths', resourceSubject: 'Maths' }],
    secondary: CONFIG.subjects.map((name) => ({ value: name, label: name, resourceSubject: name })),
    vce: [
      { value: 'Biology', label: 'VCE Biology' },
      { value: 'Chemistry', label: 'VCE Chemistry' },
      { value: 'Physics', label: 'VCE Physics' },
      { value: 'Maths-general', label: 'VCE General Mathematics' },
      { value: 'Maths-methods', label: 'VCE Mathematical Methods' }
    ]
  };

  const topicsForStage = (stage) => (topicDefinitions[stage] || [])
    .filter((topic) => ALL.some((resource) => resourceStage(resource) === stage && resource.subject === (topic.resourceSubject || topic.value.replace(/^Maths-/, 'Maths'))));
  const unitOptionsFor = (topicValue, topicLabel) => {
    const resourceSubject = topicValue.startsWith('Maths-') ? 'Maths' : topicValue;
    const units = [...new Set(ALL
      .filter((resource) => resourceStage(resource) === 'vce' && resource.subject === resourceSubject)
      .map((resource) => resource.unit || resource.year)
      .filter(Boolean))];
    return [
      { value: '', label: 'Any unit' },
      ...units.map((unit) => ({ value: unit, label: `${topicLabel} ${unit.replace(/^VCE /, '')}` }))
    ];
  };

  let stage = '';
  let subject = '';
  let unit = '';
  let minutes = 30;
  let type = 'all';
  const labels = { all: 'focused study', 'knowledge-sheet': 'understanding', 'practice-questions': 'focused practice', 'practice-exam': 'exam preparation' };
  const details = {
    'knowledge-sheet': 'Read a knowledge sheet, then explain the key idea in your own words.',
    'practice-questions': 'Start with practice questions, then review what you missed.',
    'practice-exam': 'Try a timed exam section and use your mistakes to plan the next session.'
  };

  const formatMinutes = (mins) => {
    if (mins < 60) return `${mins} min`;
    if (mins % 60) return `${Math.floor(mins / 60)} hr ${mins % 60} min`;
    return `${mins / 60} hr`;
  };

  const update = () => {
    el('session-result').textContent = `${formatMinutes(minutes)} of ${labels[type]}`;
    el('session-detail').textContent = details[type];
    const params = new URLSearchParams();
    if (type !== 'all') params.set('type', type);
    if (stage) params.set('stage', stage);
    if (subject) params.set('subject', subject);
    if (unit) params.set('unit', unit);
    params.set('minutes', minutes);
    el('session-start').href = `study-session.html?${params}`;
  };

  stageDropdown.onChange((value) => {
    stage = value;
    subject = '';
    topicDropdown.setOptions([{ value: '', label: 'Select a topic' }, ...topicsForStage(stage)]);
    unit = '';
    unitDropdown.setOptions([{ value: '', label: 'Any unit' }]);
    unitLabel.hidden = true;
    unitEl.hidden = true;
    update();
  });
  topicDropdown.onChange((value) => {
    subject = value.startsWith('Maths-') ? 'Maths' : value;
    if (stage === 'vce') {
      const unitOptions = unitOptionsFor(value, topicDropdown.label);
      unitDropdown.setOptions(unitOptions);
      const hasUnits = unitOptions.length > 1;
      unitLabel.hidden = !hasUnits;
      unitEl.hidden = !hasUnits;
    }
    update();
  });
  unitDropdown.onChange((value) => {
    unit = value;
    update();
  });
  timeGroup.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    minutes = Number(button.dataset.time) || 30;
    timeGroup.querySelectorAll('button').forEach((item) => item.classList.toggle('is-on', item === button));
    update();
  }));
  goalGroup.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
    type = button.dataset.type;
    goalGroup.querySelectorAll('button').forEach((item) => item.classList.toggle('is-on', item === button));
    update();
  }));

  update();
}

/* ---------- library page ---------- */
function matches(r) {
  if (state.type && r.type !== state.type) return false;
  if (state.subject && r.subject !== state.subject) return false;
  if (state.mathsType && mathematicsTypeFor(r) !== state.mathsType) return false;
  if (state.year && r.year !== state.year) return false;
  if (state.solutions && !(r.solutions || r.solutionsVideo)) return false;
  if (state.video && !r.solutionsVideo) return false;
  if (!state.q) return true;
  const type = CONFIG.types[r.type];
  const haystack = [r.title, r.desc, r.subject, r.year, r.level, r.details, type && type.label, (r.tags || []).join(' ')]
    .join(' ')
    .toLowerCase();
  return state.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => haystack.includes(w));
}

function mathematicsTypeFor(resource) {
  if (resource.subject !== 'Maths') return '';
  if (resource.mathsType === 'methods' || resource.mathsType === 'general') return resource.mathsType;
  const haystack = [resource.title, resource.desc, ...(resource.tags || [])].join(' ').toLowerCase();
  if (haystack.includes('method')) return 'methods';
  if (haystack.includes('general mathematics') || haystack.includes('general maths')) return 'general';
  return '';
}

function setFilter(key, value) {
  state[key] = value;
  state.shown = CONFIG.pageSize;
  renderLibrary();
}

function resetFilters() {
  Object.assign(state, { q: '', type: '', subject: '', mathsType: '', year: '', solutions: false, video: false, shown: CONFIG.pageSize });
  searchInput.value = '';
  el('filter-subject').value = '';
  el('filter-maths-type').value = '';
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

  const availabilityWrap = el('filter-availability');
  const availabilityOption = (key, label, count) => {
    const b = option('', label, count);
    b.dataset.feature = key;
    b.addEventListener('click', () => {
      state[key] = !state[key];
      renderLibrary();
    });
    return b;
  };
  availabilityWrap.appendChild(availabilityOption('solutions', 'Solutions provided', ALL.filter((r) => r.solutions || r.solutionsVideo).length));
  availabilityWrap.appendChild(availabilityOption('video', 'Video provided', ALL.filter((r) => r.solutionsVideo).length));

  const fill = (select, values) => values.forEach((v) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
  fill(el('filter-subject'), CONFIG.subjects);
  const mathsTypeFilter = el('maths-type-filter');
  const mathsTypeSelect = el('filter-maths-type');
  const yearSelect = el('filter-year');
  const updateYearOptions = () => {
    const matchingResources = ALL.filter((resource) =>
      (!state.subject || resource.subject === state.subject)
      && (!state.mathsType || mathematicsTypeFor(resource) === state.mathsType)
    );
    const years = [...new Set(matchingResources.map((resource) => resource.year).filter(Boolean))];
    yearSelect.innerHTML = '<option value="">All year levels</option>';
    if (years.length) {
      fill(yearSelect, years);
    } else if (state.mathsType) {
      fill(yearSelect, CONFIG.vceUnits || ['VCE Units 1&2', 'VCE Units 3&4']);
    } else {
      fill(yearSelect, CONFIG.years);
    }
    if (!years.includes(state.year)) {
      state.year = '';
      yearSelect.value = '';
    } else {
      yearSelect.value = state.year;
    }
  };
  const updateMathsFilters = () => {
    const isMaths = state.subject === 'Maths';
    mathsTypeFilter.hidden = !isMaths;
    if (!isMaths) {
      state.mathsType = '';
      mathsTypeSelect.value = '';
    }
    updateYearOptions();
  };
  fill(yearSelect, CONFIG.years);

  el('filter-subject').addEventListener('change', (e) => {
    state.subject = e.target.value;
    state.mathsType = '';
    mathsTypeSelect.value = '';
    updateMathsFilters();
    setFilter('subject', e.target.value);
  });
  mathsTypeSelect.addEventListener('change', (e) => {
    state.mathsType = e.target.value;
    state.year = '';
    updateYearOptions();
    setFilter('mathsType', e.target.value);
  });
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
    state.mathsType = '';
    state.year = '';
    state.solutions = false;
    state.video = false;
    el('filter-subject').value = '';
    mathsTypeSelect.value = '';
    el('filter-year').value = '';
    updateMathsFilters();
    setFilter('q', searchInput.value.trim());
  };
  searchInput.addEventListener('input', runSearch);
  el('resource-search').addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch();
  });
  window.syncLibraryMathsFilters = updateMathsFilters;
  updateMathsFilters();
}

function renderActiveFilters() {
  const wrap = el('active-filters');
  const pills = [];
  if (state.q) pills.push({ key: 'q', label: `“${state.q}”` });
  if (state.type) pills.push({ key: 'type', label: (CONFIG.types[state.type] || {}).label || state.type });
  if (state.subject) pills.push({ key: 'subject', label: state.subject });
  if (state.mathsType) pills.push({ key: 'mathsType', label: state.mathsType === 'methods' ? 'Mathematical Methods' : 'General Mathematics' });
  if (state.year) pills.push({ key: 'year', label: state.year });
  if (state.solutions) pills.push({ key: 'solutions', label: 'Solutions provided' });
  if (state.video) pills.push({ key: 'video', label: 'Video provided' });

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
      if (p.key === 'mathsType') el('filter-maths-type').value = '';
      if (p.key === 'year') el('filter-year').value = '';
      if (p.key === 'solutions' || p.key === 'video') state[p.key] = false;
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
  el('filter-reset').hidden = !(state.q || state.type || state.subject || state.mathsType || state.year || state.solutions || state.video);
  document.querySelectorAll('#filter-type .filter-option').forEach((opt) => {
    const on = opt.dataset.type === state.type;
    opt.classList.toggle('is-on', on);
    opt.setAttribute('aria-pressed', String(on));
  });
  document.querySelectorAll('#filter-availability .filter-option').forEach((opt) => {
    const on = Boolean(state[opt.dataset.feature]);
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
  const subject = params.get('subject');
  const mathsType = params.get('mathsType');
  state.solutions = params.get('solutions') === '1';
  state.video = params.get('video') === '1';
  if (q) {
    state.q = q;
    searchInput.value = q;
  }
  if (type && CONFIG.types[type]) state.type = type;
  if (subject && CONFIG.subjects.includes(subject)) {
    state.subject = subject;
    el('filter-subject').value = subject;
  }
  if (state.subject === 'Maths' && (mathsType === 'methods' || mathsType === 'general')) {
    state.mathsType = mathsType;
    el('filter-maths-type').value = mathsType;
  }
  window.syncLibraryMathsFilters?.();
  renderLibrary();
} else {
  renderHome();
  renderDailyQuote();
  renderStudyBuilder();
}
