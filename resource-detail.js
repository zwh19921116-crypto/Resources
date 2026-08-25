const DETAIL_CONFIG = window.EDG_CONFIG;
const DETAIL_ALL = (window.EDG_RESOURCES || []).filter((resource) => resource.status !== 'draft');
const detailElement = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

function youtubeVideoId(url) {
  const match = String(url).match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  return match ? match[1] : null;
}

function detailPreview(resource) {
  const videoId = youtubeVideoId(resource.url);
  if (videoId) return `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0" title="${escapeHtml(resource.title)}" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  return window.edgThumb(resource.art, resource.image);
}

function buildRelatedCard(resource) {
  const type = DETAIL_CONFIG.types[resource.type];
  const prefix = document.body.dataset.resourceId ? '../' : 'resource-pages/';
  const url = `${prefix}${encodeURIComponent(resource.id)}/index.html`;
  return `<article class="resource-card"><a class="thumb" href="${url}"><span class="badge badge-${type.colour}">${escapeHtml(type.label)}</span>${window.edgThumb(resource.art, resource.image)}</a><a class="card-link" href="${url}"><h3>${escapeHtml(resource.title)}</h3><p class="meta">${escapeHtml(resource.year || '')}</p></a></article>`;
}

function renderResourceDetail() {
  detailElement('year').textContent = new Date().getFullYear();
  const id = document.body.dataset.resourceId || new URLSearchParams(location.search).get('id');
  const resource = DETAIL_ALL.find((item) => item.id === id);
  if (!resource) {
    detailElement('resource-not-found').hidden = false;
    return;
  }

  const type = DETAIL_CONFIG.types[resource.type] || { label: resource.type, colour: 'blue' };
  document.title = `${resource.title} | Edgeducate Resources`;
  document.querySelector('meta[name="description"]').content = resource.desc || type.blurb;
  const canonical = document.createElement('link');
  canonical.rel = 'canonical';
  canonical.href = location.href;
  document.head.appendChild(canonical);

  detailElement('resource-detail').hidden = false;
  detailElement('resource-crumb').textContent = resource.title;
  detailElement('resource-preview').innerHTML = detailPreview(resource);
  detailElement('resource-badge').className = `badge badge-${type.colour}`;
  detailElement('resource-badge').textContent = type.label;
  detailElement('resource-title').textContent = resource.title;
  detailElement('resource-description').textContent = resource.desc || type.blurb;
  detailElement('resource-open').href = resource.url || 'resources.html';
  detailElement('resource-open').removeAttribute('target');
  detailElement('resource-open').removeAttribute('rel');
  detailElement('resource-open').textContent = youtubeVideoId(resource.url) ? 'Watch on YouTube' : 'Open resource';

  const metadata = [['Subject', resource.subject], ['Year level', resource.year], ['Difficulty', resource.level], ['Details', resource.details]].filter(([, value]) => value);
  detailElement('resource-meta').innerHTML = metadata.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');

  const related = DETAIL_ALL.filter((item) => item.id !== resource.id && (item.subject === resource.subject || item.type === resource.type)).slice(0, 3);
  detailElement('related-grid').innerHTML = related.map(buildRelatedCard).join('');

  const schema = document.createElement('script');
  schema.type = 'application/ld+json';
  schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'LearningResource', name: resource.title, description: resource.desc || type.blurb, educationalLevel: resource.year, learningResourceType: type.label, url: location.href });
  document.head.appendChild(schema);
}

renderResourceDetail();