(() => {
  const STORAGE_KEY = 'edgeducate-learning-session-v1';
  const MAX_ITEMS = 20;
  const SESSION_MAX_AGE = 1000 * 60 * 60 * 6;
  const typePartners = {
    video: ['practice-questions', 'knowledge-sheet'],
    'practice-questions': ['video', 'knowledge-sheet'],
    'knowledge-sheet': ['video', 'practice-questions'],
    'practice-exam': ['knowledge-sheet', 'video'],
    'interactive-app': ['practice-questions', 'video']
  };

  const readHistory = () => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(stored)) return [];
      return stored.filter((item) => item && item.id && Date.now() - Number(item.viewedAt) < SESSION_MAX_AGE).slice(0, MAX_ITEMS);
    } catch (error) {
      return [];
    }
  };

  const record = (resource) => {
    if (!resource?.id) return;
    const next = [
      { id: resource.id, subject: resource.subject || '', year: resource.year || '', type: resource.type || '', tags: Array.isArray(resource.tags) ? resource.tags.slice(0, 10) : [], viewedAt: Date.now() },
      ...readHistory().filter((item) => item.id !== resource.id)
    ].slice(0, MAX_ITEMS);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      // Recommendations remain content-based when browser storage is unavailable.
    }
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const resourceUrl = (prefix, resource) => `${prefix}resource-pages/${encodeURIComponent(resource.id)}/`;
  const subjectArt = {
    physics: 'physics',
    maths: 'maths',
    mathematics: 'maths',
    chemistry: 'chemistry',
    biology: 'biology',
    english: 'english'
  };

  const recommend = (resource, resources) => {
    const history = readHistory();
    const recentIds = new Set(history.map((item) => item.id));
    const recentSubjects = new Set(history.map((item) => item.subject).filter(Boolean));
    const recentTags = new Set(history.flatMap((item) => item.tags || []).map((tag) => String(tag).toLowerCase()));
    const explicitIds = Array.isArray(resource.relatedIds) ? resource.relatedIds : [];
    const currentTags = new Set((resource.tags || []).map((tag) => String(tag).toLowerCase()));

    return resources
      .filter((candidate) => candidate.id !== resource.id && candidate.status !== 'draft')
      .map((candidate) => {
        const candidateTags = (candidate.tags || []).map((tag) => String(tag).toLowerCase());
        const sharedTags = candidateTags.filter((tag) => currentTags.has(tag)).length;
        const sharedRecentTags = candidateTags.filter((tag) => recentTags.has(tag)).length;
        let score = 0;
        if (explicitIds.includes(candidate.id)) score += 10;
        if (Array.isArray(candidate.relatedIds) && candidate.relatedIds.includes(resource.id)) score += 8;
        if (candidate.subject && candidate.subject === resource.subject) score += 5;
        if (candidate.year && candidate.year === resource.year) score += 2;
        score += Math.min(sharedTags * 2, 6);
        if ((typePartners[resource.type] || []).includes(candidate.type)) score += 3;
        if (recentSubjects.has(candidate.subject)) score += 2;
        score += Math.min(sharedRecentTags, 3);
        if (recentIds.has(candidate.id)) score -= 4;
        return { resource: candidate, score };
      })
      .sort((left, right) => right.score - left.score || String(right.resource.added || '').localeCompare(String(left.resource.added || '')))
      .slice(0, 3)
      .map(({ resource: candidate }) => candidate);
  };

  const render = (resource, resources, container, prefix) => {
    const recommendations = recommend(resource, resources);
    if (!recommendations.length) {
      const subject = resource.subject ? `?subject=${encodeURIComponent(resource.subject)}` : '';
      const subjectLabel = resource.subject ? `${escapeHtml(resource.subject)} ` : '';
      container.innerHTML = `<p class="section-eyebrow">Keep learning</p><h2 id="learning-recommendations-title">Continue learning</h2><p class="recommendation-note">More ${subjectLabel}resources will appear here as suitable activities become available.</p><a class="btn btn-light" href="${prefix}all-resources.html${subject}">Browse ${subjectLabel}resources</a>`;
      container.hidden = false;
      return;
    }
    container.innerHTML = `<p class="section-eyebrow">Based on this session</p><h2 id="learning-recommendations-title">Continue learning</h2><p class="recommendation-note">These suggestions use this browser session only and are not sent to Edgeducate.</p><div class="resource-grid">${recommendations.map((candidate) => {
      const type = window.EDG_CONFIG?.types?.[candidate.type] || {};
      const art = subjectArt[String(candidate.subject || '').toLowerCase()] || candidate.art;
      const thumbnail = typeof window.edgThumb === 'function'
        ? window.edgThumb(art, candidate.image)
        : candidate.image
          ? `<img class="art" src="${escapeHtml(candidate.image)}" alt="" loading="lazy" />`
          : '';
      const summary = candidate.desc || candidate.details || 'Explore this resource next.';
          const videoUrls = Array.isArray(candidate.solutionsVideos) ? candidate.solutionsVideos : [candidate.solutionsVideo];
          const hasVideo = videoUrls.some((url) => String(url || '').trim());
          const hasSolutions = Boolean(String(candidate.solutions || '').trim() || hasVideo);
          const availability = hasSolutions || hasVideo ? `<span class="resource-availability" aria-label="Available materials">${hasSolutions ? '<span class="availability-item availability-solutions"><svg class="ico" aria-hidden="true"><use href="#i-doc"/></svg>Solutions</span>' : ''}${hasVideo ? '<span class="availability-item availability-video"><svg class="ico" aria-hidden="true"><use href="#i-play"/></svg>Video</span>' : ''}</span>` : '';
          return `<article class="resource-card"><a class="thumb" href="${resourceUrl(prefix, candidate)}"><span class="badge badge-${escapeHtml(type.colour || 'blue')}">${escapeHtml(type.label || candidate.type)}</span>${thumbnail}</a><a class="card-link" href="${resourceUrl(prefix, candidate)}"><span class="card-title-row"><h3>${escapeHtml(candidate.title)}</h3>${availability}</span><p class="meta">${escapeHtml(candidate.subject || '')}${candidate.year ? ` · ${escapeHtml(candidate.year)}` : ''}</p><p class="recommendation-summary">${escapeHtml(summary)}</p></a></article>`;
    }).join('')}</div>`;
    container.hidden = false;
  };

  window.EDG_LEARNING_RECOMMENDATIONS = { record, recommend, render };
})();
