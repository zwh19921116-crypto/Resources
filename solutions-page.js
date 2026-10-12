const stage = document.querySelector('[data-solution-stage]');
const toggle = document.querySelector('[data-solution-video-toggle]');
const videoPanel = document.querySelector('[data-solution-video-panel]');

if (stage && toggle && videoPanel) {
  toggle.addEventListener('click', () => {
    stage.classList.add('is-video-open');
    videoPanel.hidden = false;
    toggle.hidden = true;
  });
}
