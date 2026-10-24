const stage = document.querySelector('[data-solution-stage]');
const toggle = document.querySelector('[data-solution-video-toggle]');
const videoPanel = document.querySelector('[data-solution-video-panel]');
const videoSelector = document.querySelector('.solution-video-selector');
const currentVideoLabel = videoPanel?.querySelector('[data-solution-video-current]');
const resourceBack = stage?.querySelector('.resource-back');
const pdfButton = stage?.querySelector('.resource-detail-copy .btn-primary');
const libraryCrumb = stage?.parentElement.querySelector('.crumbs a');
const solutionPdf = stage?.querySelector('.solution-pdf-panel iframe');

const syncSolutionPdfZoom = () => {
  if (!solutionPdf) return;
  const mobile = window.matchMedia('(max-width: 900px)').matches;
  const zoom = mobile ? 'page-fit' : '130';
  const nextSrc = solutionPdf.src.replace(/([#&]zoom=)[^&]*/, `$1${zoom}`);
  if (nextSrc !== solutionPdf.src) solutionPdf.src = nextSrc;
};

syncSolutionPdfZoom();
window.matchMedia('(max-width: 900px)').addEventListener('change', syncSolutionPdfZoom);

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

const tuitionPromo = document.querySelector('[data-tuition-promo]');
if (tuitionPromo) {
  const slideContent = [
    {
      className: 'is-intro',
      title: 'Build confidence beyond the worksheet.',
      text: 'Turn practice into progress with structured, face-to-face support from experienced tutors.',
      bullets: ['Personalised guidance for every learner', 'Clear foundations, stronger problem-solving']
    },
    {
      className: 'is-primary',
      title: 'Primary school',
      text: 'Build strong foundations with support that makes learning feel clear, achievable and rewarding.',
      bullets: ['Confidence with core skills', 'Encouragement at every step']
    },
    {
      className: 'is-secondary',
      title: 'Secondary school',
      text: 'Stay on track through changing subjects, increasing demands and the next big academic goals.',
      bullets: ['Targeted subject support', 'Better routines and study habits']
    },
    {
      className: 'is-selective',
      title: 'Selective school',
      text: 'Prepare with purpose for selective entry tests and the skills needed to perform under pressure.',
      bullets: ['Focused test preparation', 'Strategy, speed and confidence']
    },
    {
      className: 'is-vce',
      title: 'VCE preparation',
      text: 'Make every study session count with structured support for assessments, exams and the final result.',
      bullets: ['Subject-specific guidance', 'Exam preparation that builds momentum']
    }
  ];
  const track = tuitionPromo.querySelector('.solution-tuition-promo__track');
  const dotsContainer = tuitionPromo.querySelector('.solution-tuition-promo__dots');
  if (track && dotsContainer) {
    track.innerHTML = slideContent.map((slide, index) => `<div class="solution-tuition-promo__slide ${slide.className}${index === 0 ? ' is-active' : ''}" data-tuition-slide${index === 0 ? '' : ' hidden'}><h2${index === 0 ? ' id="solution-tuition-title"' : ''}>${slide.title}</h2><p>${slide.text}</p><ul>${slide.bullets.map((bullet) => `<li>${bullet}</li>`).join('')}</ul></div>`).join('');
    dotsContainer.innerHTML = slideContent.map((slide, index) => `<button type="button"${index === 0 ? ' class="is-active"' : ''} data-tuition-dot="${index}" role="tab" aria-selected="${index === 0 ? 'true' : 'false'}" aria-label="Show ${slide.title} message"></button>`).join('');
  }
  const slides = [...tuitionPromo.querySelectorAll('[data-tuition-slide]')];
  const dots = [...tuitionPromo.querySelectorAll('[data-tuition-dot]')];
  const themeClasses = slideContent.map((slide) => slide.className);
  let currentSlide = 0;
  let paused = false;

  const showTuitionSlide = (index) => {
    currentSlide = (index + slides.length) % slides.length;
    tuitionPromo.classList.remove(...themeClasses);
    tuitionPromo.classList.add(themeClasses[currentSlide]);
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === currentSlide;
      slide.hidden = !active;
      slide.classList.toggle('is-active', active);
    });
    dots.forEach((dot, dotIndex) => {
      const active = dotIndex === currentSlide;
      dot.classList.toggle('is-active', active);
      dot.setAttribute('aria-selected', String(active));
    });
  };

  dots.forEach((dot) => dot.addEventListener('click', () => {
    showTuitionSlide(Number(dot.dataset.tuitionDot) || 0);
  }));
  showTuitionSlide(0);
  tuitionPromo.addEventListener('mouseenter', () => { paused = true; });
  tuitionPromo.addEventListener('mouseleave', () => { paused = false; });
  tuitionPromo.addEventListener('focusin', () => { paused = true; });
  tuitionPromo.addEventListener('focusout', () => { paused = false; });

  if (slides.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.setInterval(() => {
      if (!paused && !document.hidden) showTuitionSlide(currentSlide + 1);
    }, 4000);
  }
}
