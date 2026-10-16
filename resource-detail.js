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
  const url = `${prefix}${encodeURIComponent(resource.id)}/`;
  return `<article class="resource-card"><a class="thumb" href="${url}"><span class="badge badge-${type.colour}">${escapeHtml(type.label)}</span>${window.edgThumb(resource.art, resource.image)}</a><a class="card-link" href="${url}"><h3>${escapeHtml(resource.title)}</h3><p class="meta">${escapeHtml(resource.year || '')}</p></a></article>`;
}

function relatedResourcesFor(resource) {
  const explicitIds = Array.isArray(resource.relatedIds) ? resource.relatedIds : [];
  const explicitlyLinked = DETAIL_ALL.filter((item) => item.id !== resource.id
    && (explicitIds.includes(item.id) || (Array.isArray(item.relatedIds) && item.relatedIds.includes(resource.id))));
  if (Array.isArray(resource.relatedIds)) return explicitlyLinked.slice(0, 6);
  return DETAIL_ALL.filter((item) => item.id !== resource.id
    && (item.subject === resource.subject || item.type === resource.type)).slice(0, 3);
}

function buildQuestionPaperLinks(resource) {
  if (resource.viewType !== 'question-paper') return '';
  const pairs = Array.isArray(resource.questionVideoPairs) ? resource.questionVideoPairs : [];
  if (pairs.length) {
    const pairMarkup = pairs.map((pair, index) => {
      const question = DETAIL_ALL.find((item) => item.id === pair.questionResourceId);
      const video = DETAIL_ALL.find((item) => item.id === pair.videoResourceId);
      if (!question && !video) return '';
      const questionUrl = question ? `${question.url || ''}${pair.page ? `#page=${encodeURIComponent(pair.page)}` : ''}` : '';
      const videoId = video ? youtubeVideoId(video.url) : null;
      const questionViewer = question ? `<div class="question-region" data-pdf-url="${escapeHtml(question.url)}" data-pdf-page="${escapeHtml(pair.page || 1)}" data-pdf-top="${escapeHtml(pair.top ?? 0)}" data-pdf-bottom="${escapeHtml(pair.bottom ?? 100)}"><canvas></canvas><span>Loading question</span></div><a class="btn btn-light btn-sm" href="${escapeHtml(questionUrl)}" target="_blank" rel="noopener">Open question</a>` : '<p>Question resource not selected.</p>';
      return `<article class="question-video-pair"><div class="question-video-question"><span class="question-video-label">Question ${index + 1}${pair.page ? ` · Page ${escapeHtml(pair.page)}` : ''}</span>${question ? `<h3>${escapeHtml(question.title)}</h3>${questionViewer}` : questionViewer}</div><div class="question-video-viewer">${videoId ? `<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?rel=0" title="${escapeHtml(video.title)}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : video ? `<a class="btn btn-light btn-sm" href="${escapeHtml(video.url)}" target="_blank" rel="noopener">Watch ${escapeHtml(video.title)}</a>` : '<p>Video not selected.</p>'}</div></article>`;
    }).filter(Boolean).join('');
    if (pairMarkup) return `<section class="question-paper-links" aria-labelledby="question-paper-links-title"><p class="section-eyebrow">Exam support</p><h2 id="question-paper-links-title">Questions and videos</h2><div class="question-video-pairs">${pairMarkup}</div></section>`;
  }
  const question = DETAIL_ALL.find((item) => item.id === resource.questionResourceId);
  const video = DETAIL_ALL.find((item) => item.id === resource.videoResourceId);
  const links = [
    question ? `<a class="question-paper-link" href="resource-pages/${encodeURIComponent(question.id)}/"><span>Question resource</span><strong>${escapeHtml(question.title)}</strong></a>` : '',
    video ? `<a class="question-paper-link" href="resource-pages/${encodeURIComponent(video.id)}/"><span>Associated video</span><strong>${escapeHtml(video.title)}</strong></a>` : ''
  ].filter(Boolean).join('');
  return links ? `<section class="question-paper-links" aria-labelledby="question-paper-links-title"><p class="section-eyebrow">Exam support</p><h2 id="question-paper-links-title">Use this paper with</h2><div class="question-paper-link-grid">${links}</div></section>` : '';
}

function renderResourceDetail() {
  const yearNode = detailElement('year');
  if (yearNode) yearNode.textContent = new Date().getFullYear();
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
  detailElement('resource-open').href = resource.url || 'all-resources.html';
  detailElement('resource-open').removeAttribute('target');
  detailElement('resource-open').removeAttribute('rel');
  detailElement('resource-open').textContent = youtubeVideoId(resource.url) ? 'Watch on YouTube' : 'Open resource';

  const solutions = detailElement('resource-solutions');
  if (solutions) {
    solutions.hidden = !resource.solutions;
    if (resource.solutions) solutions.href = resource.solutions;
    solutions.innerHTML = 'View Solutions <svg class="ico" aria-hidden="true"><use href="#i-arrow"/></svg>';
  }

  const metadata = [['Subject', resource.subject], ['Year level', resource.year], ['Difficulty', resource.level], ['Details', resource.details]].filter(([, value]) => value);
  detailElement('resource-meta').innerHTML = metadata.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');

  const questionPaperLinks = detailElement('question-paper-links');
  if (questionPaperLinks) {
    questionPaperLinks.innerHTML = buildQuestionPaperLinks(resource);
    questionPaperLinks.hidden = !questionPaperLinks.innerHTML;
  }

  const related = relatedResourcesFor(resource);
  const relatedTitle = detailElement('related-title');
  if (relatedTitle) relatedTitle.textContent = `More ${resource.subject || ''} resources`.trim();
  detailElement('related-grid').innerHTML = related.map(buildRelatedCard).join('');

  const schema = document.createElement('script');
  schema.type = 'application/ld+json';
  schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'LearningResource', name: resource.title, description: resource.desc || type.blurb, educationalLevel: resource.year, learningResourceType: type.label, url: location.href });
  document.head.appendChild(schema);
}

renderResourceDetail();