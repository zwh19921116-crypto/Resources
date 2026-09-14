const BUILDER_CONFIG = window.EDG_CONFIG;
const BUILDER_ALL = (window.EDG_RESOURCES || []).filter((resource) => resource.status !== 'draft');
const builderEl = (id) => document.getElementById(id);

const stageSelect = builderEl('builder-stage');
const topicSelect = builderEl('builder-topic');
const unitSelect = builderEl('builder-unit');
const unitField = builderEl('builder-unit-field');
const startButton = builderEl('builder-start');
const result = builderEl('builder-result');
const detail = builderEl('builder-detail');
const resourceStatus = builderEl('builder-resource-status');
const timeSelect = builderEl('builder-time');
const goalPurpose = builderEl('builder-goal-purpose');

timeSelect.innerHTML = Array.from({ length: 48 }, (_, index) => {
  const minutes = (index + 1) * 30;
  const baseLabel = minutes < 60 ? `${minutes} min` : minutes % 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min` : `${minutes / 60} hr`;
  const label = baseLabel;
  return `<option value="${minutes}"${minutes === 30 ? ' selected' : ''}>${label}</option>`;
}).join('');

const topicDefinitions = {
  primary: [{ value: 'Maths', label: 'Maths', resourceSubject: 'Maths' }],
  secondary: BUILDER_CONFIG.subjects.map((name) => ({ value: name, label: name, resourceSubject: name })),
  vce: [
    { value: 'Biology', label: 'VCE Biology' },
    { value: 'Chemistry', label: 'VCE Chemistry' },
    { value: 'Physics', label: 'VCE Physics' },
    { value: 'Maths-general', label: 'VCE General Mathematics' },
    { value: 'Maths-methods', label: 'VCE Mathematical Methods' }
  ]
};

const resourceStage = (resource) => resource.stage || (String(resource.year || '').startsWith('VCE') ? 'vce' : 'secondary');
const resourceSubject = (value) => value.startsWith('Maths-') ? 'Maths' : value;
const topicsForStage = (stage) => (topicDefinitions[stage] || []).filter((topic) =>
  BUILDER_ALL.some((resource) => resourceStage(resource) === stage && resource.subject === (topic.resourceSubject || resourceSubject(topic.value)))
);
const unitOptionsFor = (subject) => [...new Set(BUILDER_ALL
  .filter((resource) => resourceStage(resource) === 'vce' && resource.subject === subject)
  .map((resource) => resource.unit || resource.year)
  .filter(Boolean))];

const fill = (select, options, placeholder) => {
  select.innerHTML = `<option value="">${placeholder}</option>`;
  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    select.appendChild(item);
  });
  select.disabled = options.length === 0;
};

const availableStages = [
  { value: 'primary', label: 'Primary School' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'vce', label: 'VCE' }
].filter((stageOption) => BUILDER_ALL.some((resource) => resourceStage(resource) === stageOption.value));
fill(stageSelect, availableStages, 'Select level');

let stage = '';
let subject = '';
let unit = '';
let minutes = 30;
let type = 'all';

const labels = {
  all: 'focused study',
  'knowledge-sheet': 'understanding',
  'practice-questions': 'focused practice',
  'practice-exam': 'exam preparation'
};

const goalPurposes = {
  all: 'Mix resource types for a balanced study session.',
  'knowledge-sheet': 'Build understanding with concise notes and key ideas.',
  'practice-questions': 'Strengthen skills by working through targeted questions.',
  'practice-exam': 'Test your readiness with exam-style tasks under time pressure.'
};

const formatMinutes = (value) => value < 60 ? `${value} min` : value % 60 ? `${Math.floor(value / 60)} hr ${value % 60} min` : `${value / 60} hr`;

function update() {
  const matches = BUILDER_ALL.filter((resource) => {
    if (resourceStage(resource) !== stage || resource.subject !== subject) return false;
    if (unit && (resource.unit || resource.year) !== unit) return false;
    return type === 'all' || resource.type === type;
  });
  const ready = Boolean(stage && subject && matches.length);
  startButton.disabled = !ready;
  result.textContent = `${formatMinutes(minutes)} of ${labels[type]}`;
  if (goalPurpose) goalPurpose.textContent = goalPurposes[type] || '';
  if (!stage || !subject) {
    detail.textContent = '';
    resourceStatus.textContent = 'Choose a topic';
    resourceStatus.className = 'builder-resource-status';
  } else if (!matches.length) {
    detail.textContent = 'No matching resources are available for these choices.';
    resourceStatus.textContent = 'No matches';
    resourceStatus.className = 'builder-resource-status is-empty';
  } else {
    detail.textContent = `${matches.length} matching resource${matches.length === 1 ? '' : 's'} available.`;
    resourceStatus.textContent = `${matches.length} resource${matches.length === 1 ? '' : 's'} ready`;
    resourceStatus.className = 'builder-resource-status is-ready';
  }
}

stageSelect.addEventListener('change', () => {
  stage = stageSelect.value;
  subject = '';
  unit = '';
  fill(topicSelect, topicsForStage(stage), 'Select a topic');
  unitField.hidden = true;
  fill(unitSelect, [], 'Any unit');
  update();
});

topicSelect.addEventListener('change', () => {
  subject = resourceSubject(topicSelect.value);
  unit = '';
  const units = stage === 'vce' ? unitOptionsFor(subject) : [];
  fill(unitSelect, units.map((value) => ({ value, label: `${topicSelect.selectedOptions[0].textContent} ${value.replace(/^VCE /, '')}` })), 'Any unit');
  unitField.hidden = units.length === 0;
  update();
});

unitSelect.addEventListener('change', () => {
  unit = unitSelect.value;
  update();
});
timeSelect.addEventListener('change', (event) => {
  minutes = Number(event.target.value);
  update();
});

document.querySelectorAll('#builder-goal button').forEach((button) => button.addEventListener('click', () => {
  type = button.dataset.type;
  document.querySelectorAll('#builder-goal button').forEach((item) => item.classList.toggle('is-on', item === button));
  update();
}));

startButton.addEventListener('click', () => {
  if (startButton.disabled) return;
  const params = new URLSearchParams({ stage, subject, minutes });
  if (type !== 'all') params.set('type', type);
  if (unit) params.set('unit', unit);
  window.location.href = `study-session.html?${params}`;
});

builderEl('year').textContent = new Date().getFullYear();
update();
