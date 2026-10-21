const stage = document.querySelector('[data-solution-stage]');
const toggle = document.querySelector('[data-solution-video-toggle]');
const videoPanel = document.querySelector('[data-solution-video-panel]');
const videoSelector = document.querySelector('.solution-video-selector');
const currentVideoLabel = videoPanel?.querySelector('[data-solution-video-current]');
const resourceBack = stage?.querySelector('.resource-back');
const pdfButton = stage?.querySelector('.resource-detail-copy .btn-primary');
const libraryCrumb = stage?.parentElement.querySelector('.crumbs a');

if (libraryCrumb) {
  libraryCrumb.href = '../../../all-resources.html';
  libraryCrumb.textContent = 'All Resources';
      libraryCrumb.dataset.directNavigation = 'true';
}

if (pdfButton) {
  pdfButton.textContent = 'View solutions PDF';
}

if (stage && resourceBack) {
  resourceBack.classList.add('solution-back-top');
  const detailCopy = stage.querySelector('.resource-detail-copy');
  const crumbs = stage.parentElement.querySelector('.crumbs');
  if (crumbs) crumbs.appendChild(resourceBack);
}

if (stage && toggle && videoPanel) {
  toggle.addEventListener('click', () => {
    stage.classList.add('is-video-open');
    videoPanel.hidden = false;
    toggle.hidden = true;

  });
}

if (videoSelector) {
  const selectors = [...videoSelector.querySelectorAll('[data-solution-video-index]')];
  const players = [...videoPanel.querySelectorAll('[data-solution-video-item]')];
  selectors.forEach((selector) => selector.addEventListener('click', () => {
    const index = Number(selector.dataset.solutionVideoIndex);
    if (currentVideoLabel) currentVideoLabel.textContent = `Video ${index + 1} of ${selectors.length}`;
    selectors.forEach((item, itemIndex) => {
      const active = itemIndex === index;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
    players.forEach((player, playerIndex) => {
      player.hidden = playerIndex !== index;
      player.classList.toggle('is-active', playerIndex === index);
    });
  }));
}
