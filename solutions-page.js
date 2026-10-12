const stage = document.querySelector('[data-solution-stage]');
const toggle = document.querySelector('[data-solution-video-toggle]');
const videoPanel = document.querySelector('[data-solution-video-panel]');

if (stage && toggle && videoPanel) {
  toggle.addEventListener('click', () => {
    stage.classList.add('is-video-open');
    videoPanel.hidden = false;
    toggle.hidden = true;

    const resourceBack = stage.querySelector('.resource-back');
    if (resourceBack && !stage.querySelector('.solution-return')) {
      const returnLink = resourceBack.cloneNode(true);
      returnLink.classList.add('solution-return');
      stage.appendChild(returnLink);
    }
  });
}
