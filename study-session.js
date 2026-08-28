const SS_CONFIG = window.EDG_CONFIG;
const SS_ALL = (window.EDG_RESOURCES || []).filter((r) => r.status !== 'draft');
const ss = (id) => document.getElementById(id);
const ssEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ssYoutubeId(url) {
  const m = String(url).match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function ssDriveId(url) {
  const m = String(url).match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  return m ? m[1] : null;
}
const ssIsPdf = (url) => /\.pdf(\?|#|$)/i.test(String(url));

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
  if (mins >= 120) return 'over 1 hr';
  return `${mins / 60} hr`;
}

function renderStudySession() {
  ss('year').textContent = new Date().getFullYear();
  const params = new URLSearchParams(location.search);
  const type = params.get('type') || '';
  const subject = params.get('subject') || '';
  const minutes = Number(params.get('minutes')) || 0;

  const typeInfo = SS_CONFIG.types[type];
  const summaryParts = [formatMinutes(minutes), typeInfo ? `of ${typeInfo.label.toLowerCase()}` : null, subject ? `in ${subject}` : null].filter(Boolean);
  ss('session-summary').textContent = summaryParts.length ? `Your session: ${summaryParts.join(' ')}` : 'Your study session';

  const byType = type ? SS_ALL.filter((r) => r.type === type) : SS_ALL.slice();
  const bySubject = subject ? byType.filter((r) => r.subject === subject) : byType;
  const list = (bySubject.length ? bySubject : byType).sort((a, b) => new Date(b.added) - new Date(a.added));

  if (!list.length) {
    ss('session-empty').hidden = false;
    return;
  }
  ss('session-workspace').hidden = false;

  const tiles = ss('session-tiles');
  tiles.innerHTML = list
    .map((r, i) => {
      const t = SS_CONFIG.types[r.type] || { label: r.type, colour: 'blue' };
      return `<button type="button" class="session-tile${i === 0 ? ' is-on' : ''}" data-id="${ssEsc(r.id)}">
        <span class="badge badge-${t.colour}">${ssEsc(t.label)}</span>
        <strong>${ssEsc(r.title)}</strong>
        <span class="session-tile-meta">${[r.subject, r.year].filter(Boolean).map(ssEsc).join(' · ')}</span>
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
    ss('session-viewer-open').href = r.url || '#';
  };

  tiles.querySelectorAll('.session-tile').forEach((tile) => tile.addEventListener('click', () => {
    tiles.querySelectorAll('.session-tile').forEach((item) => item.classList.toggle('is-on', item === tile));
    const r = list.find((item) => item.id === tile.dataset.id);
    showResource(r);
  }));

  showResource(list[0]);
}

renderStudySession();
