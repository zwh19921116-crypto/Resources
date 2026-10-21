document.querySelectorAll('[data-carousel]').forEach((carousel) => {
  const track = carousel.querySelector('.related-carousel');
  const previous = carousel.querySelector('[data-carousel-prev]');
  const next = carousel.querySelector('[data-carousel-next]');
  const cards = [...carousel.querySelectorAll('.related-track > .resource-card')];

  if (track && cards.length > 3) {
    const expandableCards = cards.slice(3, 5);
    cards.slice(3).forEach((card) => {
      card.hidden = true;
    });

    const viewMore = document.createElement('button');
    viewMore.type = 'button';
    viewMore.className = 'related-view-more';
    viewMore.textContent = 'View more';
    viewMore.setAttribute('aria-expanded', 'false');
    viewMore.addEventListener('click', () => {
      const expanded = viewMore.getAttribute('aria-expanded') === 'true';
      expandableCards.forEach((card) => {
        card.hidden = expanded;
      });
      viewMore.setAttribute('aria-expanded', String(!expanded));
      viewMore.textContent = expanded ? 'View more' : 'View less';
    });
    track.after(viewMore);
  }

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
