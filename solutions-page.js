const stage = document.querySelector('[data-solution-stage]');
const toggle = document.querySelector('[data-solution-video-toggle]');
const videoPanel = document.querySelector('[data-solution-video-panel]');
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
