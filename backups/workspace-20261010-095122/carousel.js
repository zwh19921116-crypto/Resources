document.querySelectorAll('[data-carousel]').forEach((carousel) => {
  const track = carousel.querySelector('.related-carousel');
  const previous = carousel.querySelector('[data-carousel-prev]');
  const next = carousel.querySelector('[data-carousel-next]');
  if (!track || !previous || !next) return;

  const update = () => {
    const max = track.scrollWidth - track.clientWidth;
    previous.disabled = track.scrollLeft <= 1;
    next.disabled = track.scrollLeft >= max - 1;
  };
  const move = (direction) => {
    const distance = Math.max(240, track.clientWidth * 0.8);
    track.scrollTo({ left: track.scrollLeft + direction * distance, behavior: 'auto' });
    update();
  };

  previous.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  track.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
});
