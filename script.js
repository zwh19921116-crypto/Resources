document.getElementById('year').textContent = new Date().getFullYear();

const toggle = document.querySelector('.nav-toggle');
const nav = document.getElementById('primary-nav');
toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('is-open');
  toggle.setAttribute('aria-expanded', String(open));
});

document.querySelectorAll('.save').forEach((btn) => {
  btn.addEventListener('click', () => {
    const saved = btn.getAttribute('aria-pressed') === 'true';
    btn.setAttribute('aria-pressed', String(!saved));
    btn.textContent = saved ? '\u2661' : '\u2665';
  });
});

const cards = Array.from(document.querySelectorAll('.resource-card'));
const noResults = document.getElementById('no-results');
const input = document.getElementById('q');

function filter(term) {
  const q = term.trim().toLowerCase();
  let visible = 0;
  cards.forEach((card) => {
    const haystack = `${card.dataset.title} ${card.dataset.tags}`.toLowerCase();
    const match = !q || haystack.includes(q);
    card.hidden = !match;
    if (match) visible++;
  });
  noResults.hidden = visible > 0;
}

input.addEventListener('input', () => filter(input.value));

document.getElementById('resource-search').addEventListener('submit', (e) => {
  e.preventDefault();
  filter(input.value);
  document.getElementById('latest').scrollIntoView({ behavior: 'smooth' });
});

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    input.value = chip.textContent;
    filter(chip.textContent);
    document.getElementById('latest').scrollIntoView({ behavior: 'smooth' });
  });
});
