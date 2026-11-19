const journal = document.querySelector('#journal-form');
const actionForm = document.querySelector('#action-form');
const historyList = document.querySelector('#week-history');
const status = document.querySelector('#week-status');
const exampleButton = document.querySelector('#journal-example');
const exampleNote = document.querySelector('#journal-example-note');
const importButton = document.querySelector('#week-import');
const legacyStorageKey = 'soul.weekly-actions.v1';
let storageKey = null;
const moneyFields = ['money', 'bills', 'essentials', 'joy', 'goals'];
const formatMoney = cents => new Intl.NumberFormat('ru-RU', {
  style: 'currency', currency: 'RUB', maximumFractionDigits: 2,
  minimumFractionDigits: 0,
}).format(cents / 100);
const guidance = {
  income: {
    title: 'Дохода не хватает на необходимое',
    lesson: 'Когда денег не хватает на обязательные и повседневные расходы, один пересмотр покупок может не решить вопрос. Начать поиск подработки проще, если заранее учесть пары, свободное время и то, что уже умеешь.',
    actions: [
      'Записать, сколько часов я могу выделить на подработку',
      'Выписать свои навыки и два подходящих вида подработки',
      'Посмотреть одну подработку, которая вписывается в расписание',
    ],
  },
  spending: {
    title: 'План превышает бюджет',
    lesson: 'Необходимое уже покрыто. Можно оставить важную для тебя покупку, а другую трату или часть суммы на цель перенести.',
    actions: [
      'Выбрать покупку, которую я готов отложить',
      'Пересмотреть сумму, которую откладываю на цель на этой неделе',
      'Проверить, какие свободные траты для меня важнее',
    ],
  },
  balanced: {
    title: 'План укладывается в бюджет',
    lesson: 'Запланированные траты уже учтены, в том числе на удовольствие. Оставшиеся деньги можно распределить сейчас или оставить на непредвиденное.',
    actions: [
      'Проверить ближайший обязательный платёж',
      'Оставить свободный остаток на непредвиденные расходы',
      'Сверить план с реальными тратами через неделю',
    ],
  },
};

let entries = [];
let selectedGuidance = null;
let isExample = false;
let journalEdited = false;

const emberStream = document.createElement('span');
emberStream.className = 'soul-particles';
emberStream.setAttribute('aria-hidden', 'true');
for (let index = 0; index < 6; index++) emberStream.append(document.createElement('span'));
for (const scene of document.querySelectorAll('.soul-embers > .wrap')) {
  scene.append(emberStream.cloneNode(true));
}

function readEntries(key) {
  if (!key) return [];
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(data)) return [];
    return data.filter(entry => entry && typeof entry.id === 'string' &&
      typeof entry.action === 'string' && Number.isFinite(new Date(entry.date).getTime()) &&
      [null, 'done', 'adjust'].includes(entry.outcome)).slice(0, 12);
  } catch {
    return [];
  }
}

function saveEntries(next, message) {
  if (!storageKey) return false;
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    status.textContent = 'Не удалось записать шаг. Разреши локальное хранение в браузере и попробуй снова.';
    return false;
  }
  entries = next;
  renderHistory();
  status.textContent = message;
  return true;
}

function renderHistory() {
  importButton.hidden = !storageKey || !readEntries(legacyStorageKey).length;
  document.querySelector('#week-history-empty').hidden = entries.length > 0;
  historyList.replaceChildren(...entries.map(entry => {
    const row = document.createElement('li');
    const content = document.createElement('div');
    const action = document.createElement('strong');
    action.textContent = entry.action;
    const date = document.createElement('small');
    date.textContent = new Intl.DateTimeFormat('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(entry.date));
    if (entry.example) date.textContent += ' · Учебный пример';
    content.append(action, date);
    const label = document.createElement('label');
    label.textContent = 'Результат шага';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Результат шага: ' + entry.action);
    select.append(new Option('В плане', ''), new Option('Получилось', 'done'), new Option('Хочу пересмотреть', 'adjust'));
    select.value = entry.outcome ?? '';
    select.addEventListener('change', () => {
      const next = entries.map(item => item.id === entry.id ? {...item, outcome: select.value || null} : item);
      if (saveEntries(next, 'Результат сохранён.')) {
        historyList.children[entries.indexOf(next.find(item => item.id === entry.id))].querySelector('select').focus();
      } else {
        select.value = entry.outcome ?? '';
      }
    });
    label.append(select);
    row.append(content, label);
    return row;
  }));
}

function showAnalysis() {
  const [money, bills, essentials, joy, goals] = moneyFields.map(name => Math.round(journal.elements[name].valueAsNumber * 100));
  const required = bills + essentials;
  const planned = required + joy + goals;
  const remaining = money - planned;
  selectedGuidance = money < required ? guidance.income : remaining < 0 ? guidance.spending : guidance.balanced;
  document.querySelector('#week-result-heading').textContent = selectedGuidance.title;
  document.querySelector('#week-result').textContent = money < required
    ? 'На обязательные и повседневные расходы не хватает ' + formatMoney(required - money) + '.'
    : remaining < 0
      ? 'На все запланированные траты не хватает ' + formatMoney(-remaining) + '.'
      : 'После запланированных трат останется ' + formatMoney(remaining) + '.';
  document.querySelector('#week-total-available').textContent = formatMoney(money);
  document.querySelector('#week-total-planned').textContent = formatMoney(planned);
  document.querySelector('#week-lesson').textContent = selectedGuidance.lesson;
  actionForm.elements.action.replaceChildren(new Option('Выбери действие', ''), ...selectedGuidance.actions.map(action => new Option(action)));
  document.querySelector('#journal-result').hidden = false;
  document.querySelector('#journal-empty').hidden = true;
  document.querySelector('#week-result-heading').focus();
}

journal.addEventListener('submit', event => {
  event.preventDefault();
  if (!storageKey) return;
  showAnalysis();
});

function clearAnalysis() {
  selectedGuidance = null;
  document.querySelector('#journal-result').hidden = true;
  document.querySelector('#journal-empty').hidden = false;
}

journal.addEventListener('input', () => {
  journalEdited = true;
  exampleButton.hidden = true;
  clearAnalysis();
});

exampleButton.addEventListener('click', () => {
  if (!storageKey || journalEdited) return;
  isExample = true;
  const sample = [7800, 2900, 2600, 1100, 400];
  moneyFields.forEach((name, index) => { journal.elements[name].value = sample[index]; });
  exampleNote.hidden = false;
  location.hash = 'journal';
  showAnalysis();
});

function resetJournal() {
  journal.reset();
  isExample = false;
  journalEdited = false;
  exampleButton.hidden = false;
  exampleNote.hidden = true;
  clearAnalysis();
  actionForm.elements.action.replaceChildren();
  for (const id of ['week-result-heading', 'week-result', 'week-total-available', 'week-total-planned', 'week-lesson']) {
    document.getElementById(id).textContent = '';
  }
}

document.querySelector('#journal-example-clear').addEventListener('click', () => {
  resetJournal();
  journal.elements.money.focus();
});

importButton.addEventListener('click', () => {
  const merged = new Map([...readEntries(legacyStorageKey), ...entries].map(entry => [entry.id, entry]));
  const next = [...merged.values()].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);
  if (saveEntries(next, 'Старые шаги перенесены в профиль.')) {
    localStorage.removeItem(legacyStorageKey);
    importButton.hidden = true;
  }
});

actionForm.addEventListener('submit', event => {
  event.preventDefault();
  const action = actionForm.elements.action.value;
  if (!selectedGuidance?.actions.includes(action)) return;
  const entry = {id: crypto.randomUUID(), action, date: new Date().toISOString(), outcome: null, example: isExample};
  if (saveEntries([entry, ...entries].slice(0, 12), 'Шаг сохранён в этом браузере.')) {
    actionForm.reset();
    status.scrollIntoView({block: 'nearest'});
  }
});

const inflation = document.querySelector('#inflation-form');
function showInflation() {
  const before = inflation.elements.before.valueAsNumber;
  const after = inflation.elements.after.valueAsNumber;
  const official = inflation.elements.official.valueAsNumber;
  const personal = (after - before) / before * 100;
  const diff = Math.round((personal - official) * 100) / 100;
  const format = new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2});
  document.querySelector('#inflation-value').value = format.format(personal) + '%';
  document.querySelector('#inflation-reference').textContent = format.format(official) + '%';
  document.querySelector('#inflation-comparison').textContent = diff === 0
    ? 'Совпадает с введённым показателем'
    : 'На ' + format.format(Math.abs(diff)) + ' п. п. ' + (diff > 0 ? 'выше' : 'ниже') + ' введённого показателя';
}
inflation.addEventListener('submit', event => {
  event.preventDefault();
  if (storageKey) showInflation();
});

window.addEventListener('skebalance:profile', ({ detail: { userId } }) => {
  storageKey = userId ? `${legacyStorageKey}:${userId}` : null;
  entries = readEntries(storageKey);
  status.textContent = '';
  resetJournal();
  inflation.reset();
  showInflation();
  renderHistory();
});
