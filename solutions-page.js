const stage = document.querySelector('[data-solution-stage]');
const toggle = document.querySelector('[data-solution-video-toggle]');
const videoPanel = document.querySelector('[data-solution-video-panel]');
const resourceBack = stage?.querySelector('.resource-back');

if (stage && resourceBack) {
  resourceBack.classList.add('solution-back-top');
  stage.parentElement.insertBefore(resourceBack, stage);
}

if (stage && toggle && videoPanel) {
  toggle.addEventListener('click', () => {
    stage.classList.add('is-video-open');
    videoPanel.hidden = false;
    toggle.hidden = true;
  });
}
