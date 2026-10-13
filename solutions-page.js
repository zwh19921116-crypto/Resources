const stage = document.querySelector('[data-solution-stage]');
const toggle = document.querySelector('[data-solution-video-toggle]');
const videoPanel = document.querySelector('[data-solution-video-panel]');
const resourceBack = stage?.querySelector('.resource-back');
const pdfButton = stage?.querySelector('.resource-detail-copy .btn-primary');

if (pdfButton) {
  pdfButton.textContent = 'View solutions PDF';
}

if (stage && resourceBack) {
  resourceBack.classList.add('solution-back-top');
  const detailCopy = stage.querySelector('.resource-detail-copy');
  if (detailCopy) {
    detailCopy.insertBefore(resourceBack, detailCopy.firstChild);
    if (!detailCopy.querySelector('.solution-all-resources')) {
      const allResourcesBack = document.createElement('a');
      allResourcesBack.className = 'resource-back solution-all-resources';
      allResourcesBack.href = '../../../resources.html';
      allResourcesBack.textContent = 'Back to all resources';
      detailCopy.appendChild(allResourcesBack);
    }
  }
}

if (stage && toggle && videoPanel) {
  toggle.addEventListener('click', () => {
    stage.classList.add('is-video-open');
    videoPanel.hidden = false;
    toggle.hidden = true;

    if (!stage.querySelector('.solution-return')) {
      const returnLink = resourceBack.cloneNode(true);
      returnLink.classList.add('solution-return');
      stage.insertBefore(returnLink, stage.firstElementChild);
    }
  });
}
