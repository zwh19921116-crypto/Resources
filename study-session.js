const SS_CONFIG = window.EDG_CONFIG;
const SS_ALL = (window.EDG_RESOURCES || []).filter((r) => r.status !== 'draft');
const SS_LOADING_MS = 2600;
const SS_HISTORY_KEY = 'edgeducate-study-session-history-v1';
const ss = (id) => document.getElementById(id);
const ssEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const resourceStage = (resource) => resource.stage || (String(resource.year || '').startsWith('VCE') ? 'vce' : 'secondary');
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

function edgTimezoneParts(date) {
  const pieces = edgTimezoneFormatter.formatToParts(date);
  const out = {};
  pieces.forEach((piece) => {
    if (piece.type !== 'literal') out[piece.type] = piece.value;
  });
  return {
    ymd: `${out.year}-${out.month}-${out.day}`,
    minutes: (Number(out.hour) * 60) + Number(out.minute)
  };
}

function ssYoutubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function ssDriveId(url) {
  const m = String(url).match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  return m ? m[1] : null;
}
const ssIsPdf = (url) => /\.pdf(\?|#|$)/i.test(String(url));
const ssIsVideoFile = (url) => /\.(mp4|webm|ogg)(\?|#|$)/i.test(String(url));

function ssAdMediaMarkup(ad) {
  if (ad.mediaType === 'image' && ad.image) {
    return `<img src="${ssEsc(ad.image)}" alt="" />`;
  }
  if (ad.mediaType === 'video' && ad.videoUrl) {
    const yt = ssYoutubeId(ad.videoUrl);
    if (yt) {
      return `<iframe src="https://www.youtube-nocookie.com/embed/${yt}?rel=0&autoplay=1&mute=1" title="${ssEsc(ad.title)}"
        allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    }
    if (ssIsVideoFile(ad.videoUrl)) {
      return `<video src="${ssEsc(ad.videoUrl)}" autoplay muted loop playsinline></video>`;
    }
  }
  return '';
}

function ssPreviewMarkup(r) {
  const yt = ssYoutubeId(r.url);
  if (yt) {
    return `<iframe src="https://www.youtube-nocookie.com/embed/${yt}?rel=0" title="${ssEsc(r.title)}"
      allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }
  const drive = ssDriveId(r.url);
  if (drive) return `<iframe src="https://drive.google.com/file/d/${drive}/preview" title="${ssEsc(r.title)}" allow="autoplay"></iframe>`;
  if (ssIsPdf(r.url)) return `<iframe src="${ssEsc(r.url)}#view=FitH" title="${ssEsc(r.title)}"></iframe>`;
  return window.edgThumb(r.art, r.image);
}

function formatMinutes(mins) {
  if (!mins) return '';
  if (mins < 60) return `${mins} min`;
  if (mins % 60) return `${Math.floor(mins / 60)} hr ${mins % 60} min`;
  return `${mins / 60} hr`;
}

function planResources(candidates, availableMinutes) {
  if (!availableMinutes) return candidates;
  const best = Array.from({ length: availableMinutes + 1 }, () => null);
  best[0] = [];
  candidates.forEach((resource) => {
    const duration = Number(resource.estimatedMinutes) || 30;
    for (let total = availableMinutes; total >= duration; total -= 1) {
      if (!best[total - duration]) continue;
      const option = [...best[total - duration], resource];
      if (!best[total] || option.length < best[total].length) best[total] = option;
    }
  });
  for (let total = availableMinutes; total >= 0; total -= 1) {
    if (best[total]) return best[total];
  }
  return [];
}

function shuffledResources(resources) {
  const result = resources.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function recentSessionResourceIds() {
  try {
    const history = JSON.parse(localStorage.getItem(SS_HISTORY_KEY) || '[]');
    return new Set(Array.isArray(history) ? history.flat().filter(Boolean) : []);
  } catch (error) {
    return new Set();
  }
}

function rememberSessionResources(resources) {
  try {
    const history = JSON.parse(localStorage.getItem(SS_HISTORY_KEY) || '[]');
    const sessions = Array.isArray(history) ? history.filter(Array.isArray) : [];
    sessions.push(resources.map((resource) => resource.id));
    localStorage.setItem(SS_HISTORY_KEY, JSON.stringify(sessions.slice(-5)));
  } catch (error) {
    // Storage may be unavailable in private browsing; random selection still works.
  }
}

function sessionBreakdown(resources) {
  const counts = new Map();
  resources.forEach((resource) => {
    const minutes = Number(resource.estimatedMinutes) || 30;
    counts.set(minutes, (counts.get(minutes) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([minutes, count]) => `${count} x ${formatMinutes(minutes)}`)
    .join(' + ');
}

function setupStudyTimer(minutes) {
  const timer = ss('session-timer');
  if (!timer || !minutes) return;
  const display = ss('timer-display');
  const startButton = ss('timer-start');
  const resetButton = ss('timer-reset');
  const dialog = ss('break-dialog');
  const reminderTiming = ss('reminder-timing');
  const totalSeconds = minutes * 60;
  let remaining = totalSeconds;
  let interval = null;
  let nextReminder = reminderTiming.value === 'end' ? totalSeconds : Math.min(7200, totalSeconds);

  const clock = (seconds) => [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((value) => String(value).padStart(2, '0')).join(':');
  const elapsed = () => totalSeconds - remaining;
  const render = () => { display.textContent = clock(remaining); };
  const stop = () => {
    clearInterval(interval);
    interval = null;
    startButton.textContent = remaining <= 0 ? 'Session complete' : 'Start timer';
  };
  const remind = () => {
    stop();
    if (typeof dialog.showModal === 'function') dialog.showModal();
  };
  const tick = () => {
    remaining = Math.max(0, remaining - 1);
    render();
    if (elapsed() >= nextReminder || remaining <= 0) {
      if (reminderTiming.value === 'hourly' && remaining > 0) nextReminder = elapsed() + 3600;
      else nextReminder = Infinity;
      remind();
    }
  };

  reminderTiming.addEventListener('change', () => {
    nextReminder = reminderTiming.value === 'end' ? totalSeconds : Math.min(7200, totalSeconds);
    if (nextReminder <= elapsed()) nextReminder = reminderTiming.value === 'hourly' ? elapsed() + 3600 : totalSeconds;
  });

  startButton.addEventListener('click', () => {
    if (remaining <= 0) return;
    if (interval) {
      stop();
      return;
    }
    interval = setInterval(tick, 1000);
    startButton.textContent = 'Pause timer';
  });
  resetButton.addEventListener('click', () => {
    stop();
    remaining = totalSeconds;
    nextReminder = reminderTiming.value === 'end' ? totalSeconds : Math.min(7200, totalSeconds);
    render();
  });
  ss('break-pause').addEventListener('click', () => dialog.close());
  ss('break-snooze-button').addEventListener('click', () => {
    const snoozeMinutes = Number(ss('break-snooze').value);
    nextReminder = elapsed() + snoozeMinutes * 60;
    dialog.close();
    startButton.click();
  });
  timer.hidden = false;
  render();
  startButton.click();
}

/** True when now falls inside the ad's date period and daily time slot (blank = no restriction). */
function ssAdIsEligible(ad, now) {
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
    const inSlot = start <= end ? nowMinutes >= start && nowMinutes <= end : nowMinutes >= start || nowMinutes <= end;
    if (!inSlot) return false;
  }
  return true;
}

/** Guaranteed fallback so the loading screen always has something to show, even with no ads configured. */
const SS_DEFAULT_AD = {
  title: 'Get exam-ready with Edgeducate classes',
  body: 'Small-group VCE and secondary tuition led by top-performing tutors — book a free consultation to find your class.',
  ctaLabel: 'Explore our classes',
  ctaUrl: '#',
  duration: 4
};

/** Shows a random ad eligible right now (or the default Edgeducate ad if nothing is scheduled) and returns how long (ms) it should stay on screen. */
function renderLoadingAd() {
  const block = ss('session-loading-ad');
  if (window.EDG_ADS_ENABLED === false) return SS_LOADING_MS;
  const now = new Date();
  const eligible = (window.EDG_ADS || []).filter((ad) => ad.status !== 'draft' && ssAdIsEligible(ad, now));
  const ad = eligible.length ? eligible[Math.floor(Math.random() * eligible.length)] : SS_DEFAULT_AD;
  const media = ss('session-loading-ad-media');
  const mediaMarkup = ssAdMediaMarkup(ad);
  media.innerHTML = mediaMarkup;
  media.hidden = !mediaMarkup;
  ss('session-loading-ad-title').textContent = ad.title || '';
  ss('session-loading-ad-body').textContent = ad.body || '';
  const cta = ss('session-loading-ad-cta');
  cta.textContent = ad.ctaLabel || 'Learn more';
  cta.href = ad.ctaUrl || '#';
  block.hidden = false;
  return Math.max(2, Number(ad.duration) || 4) * 1000;
}

function renderStudySession() {
  const yearNode = ss('year');
  if (yearNode) yearNode.textContent = new Date().getFullYear();
  const loadingMs = renderLoadingAd();
  const params = new URLSearchParams(location.search);
  const requestedType = params.get('type') || '';
  const type = ({ learn: 'knowledge-sheet', practice: 'practice-questions', test: 'practice-exam' })[requestedType] || requestedType;
  const stage = params.get('stage') || '';
  const subject = params.get('subject') || '';
  const unit = params.get('unit') || '';
  const level = params.get('level') || '';
  const minutes = Number(params.get('minutes')) || 0;

  const typeInfo = SS_CONFIG.types[type];
  const stageLabel = stage === 'primary' ? 'Primary School' : stage === 'secondary' ? 'Secondary' : stage === 'vce' ? 'VCE' : '';
  const goalLabel = type === 'knowledge-sheet'
    ? 'learning videos'
    : type === 'practice-questions'
      ? 'video lessons and questions'
      : type === 'practice-exam'
        ? 'test practice'
        : typeInfo ? typeInfo.label.toLowerCase() : null;
  const summaryParts = [formatMinutes(minutes), goalLabel ? `of ${goalLabel}` : null, subject ? `in ${subject}` : null, stageLabel ? `for ${stageLabel}` : null, unit ? `(${unit})` : null].filter(Boolean);
  ss('session-summary').textContent = summaryParts.length ? `Your session: ${summaryParts.join(' ')}` : 'Your study session';

  const byType = SS_ALL;
  const bySubject = subject ? byType.filter((r) => r.subject === subject) : byType;
  const subjectPool = subject ? bySubject : byType;
  const byStage = stage ? subjectPool.filter((r) => resourceStage(r) === stage) : subjectPool;
  const byUnit = unit ? byStage.filter((r) => (r.unit || r.year) === unit) : byStage;
  const practiceCandidates = byUnit.filter((r) => r.type === 'video' || r.type === 'practice-questions');
  const hasPracticeLinks = practiceCandidates.some((resource) =>
    Array.isArray(resource.relatedIds) && resource.relatedIds.some((id) =>
      practiceCandidates.some((candidate) => candidate.id === id && candidate.type !== resource.type))
  );
  const linkedPractice = hasPracticeLinks
    ? practiceCandidates.filter((resource) => practiceCandidates.some((candidate) =>
      candidate.id !== resource.id
      && candidate.type !== resource.type
      && ((Array.isArray(resource.relatedIds) && resource.relatedIds.includes(candidate.id))
        || (Array.isArray(candidate.relatedIds) && candidate.relatedIds.includes(resource.id)))
    ))
    : practiceCandidates;
  const goalPool = type === 'knowledge-sheet'
    ? byUnit.filter((r) => r.type === 'video')
    : type === 'practice-questions'
      ? linkedPractice
      : type === 'practice-exam'
        ? byUnit.filter((r) => r.type === 'practice-exam')
        : byUnit;
  const fallbackPool = type === 'knowledge-sheet'
    ? byUnit.filter((r) => r.type === 'knowledge-sheet')
    : type === 'practice-questions'
      ? byUnit.filter((r) => r.type === 'practice-questions')
      : goalPool;
  const candidates = shuffledResources(level ? (goalPool.length ? goalPool : fallbackPool).filter((r) => r.level === level) : (goalPool.length ? goalPool : fallbackPool));
  const recentIds = recentSessionResourceIds();
  const freshCandidates = candidates.filter((resource) => !recentIds.has(resource.id));
  const recentCandidates = candidates.filter((resource) => recentIds.has(resource.id));
  let list = planResources(freshCandidates, minutes);
  if (list.reduce((total, resource) => total + (Number(resource.estimatedMinutes) || 30), 0) < minutes) {
    list = planResources([...freshCandidates, ...recentCandidates], minutes);
  }
  const plannedMinutes = list.reduce((total, resource) => total + (Number(resource.estimatedMinutes) || 30), 0);
  const breakdown = sessionBreakdown(list);
  const summary = summaryParts.length ? `Your session: ${summaryParts.join(' ')}${minutes ? ` (${formatMinutes(plannedMinutes)} planned${breakdown ? `: ${breakdown}` : ''})` : ''}` : 'Your study session';
  ss('session-summary').textContent = summary;
  if (list.length) rememberSessionResources(list);

  // Reveal the matched content only once the mandatory loading screen has finished.
  const reveal = () => {
    const loading = ss('session-loading');
    loading.classList.add('is-done');
    loading.addEventListener('transitionend', () => loading.remove(), { once: true });
    setupStudyTimer(minutes);

    if (!list.length) {
      ss('session-empty').hidden = false;
      return;
    }
    ss('session-workspace').hidden = false;
  };

  if (!list.length) {
    setTimeout(reveal, loadingMs);
    return;
  }

  const tiles = ss('session-tiles');
  tiles.innerHTML = list
    .map((r, i) => {
      const t = SS_CONFIG.types[r.type] || { label: r.type, colour: 'blue' };
      return `<button type="button" class="session-tile${i === 0 ? ' is-on' : ''}" data-id="${ssEsc(r.id)}">
        <span class="badge badge-${t.colour}">${ssEsc(t.label)}</span>
        <strong>${ssEsc(r.title)}</strong>
        <span class="session-tile-meta">${[r.subject, r.year, formatMinutes(Number(r.estimatedMinutes) || 30)].filter(Boolean).map(ssEsc).join(' · ')}</span>
      </button>`;
    })
    .join('');

  const showResource = (r) => {
    const t = SS_CONFIG.types[r.type] || { label: r.type, colour: 'blue' };
    ss('session-viewer-preview').innerHTML = ssPreviewMarkup(r);
    ss('session-viewer-badge').className = `badge badge-${t.colour}`;
    ss('session-viewer-badge').textContent = t.label;
    ss('session-viewer-title').textContent = r.title;
    ss('session-viewer-desc').textContent = r.desc || t.blurb || '';
  };

  tiles.querySelectorAll('.session-tile').forEach((tile) => tile.addEventListener('click', () => {
    tiles.querySelectorAll('.session-tile').forEach((item) => item.classList.toggle('is-on', item === tile));
    const r = list.find((item) => item.id === tile.dataset.id);
    showResource(r);
  }));

  showResource(list[0]);
  setTimeout(reveal, loadingMs);
}

renderStudySession();
