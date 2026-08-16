// node test/evidence.test.js
// Caso: Ejemplo 3 del brief — sin evidencia, ApplyMode NO debe inventar.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..') + path.sep;
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error('FALLÓ: ' + msg);
  console.log('OK:', msg);
}

const store = {
  userProfile: { nombre: 'Andrés', apellido: 'de León' },
  careerModes: [{ id: 'cm', modeName: 'Community Manager', targetRoles: [], skills: ['Social Media'], descripcionProfesional: '', experiencia: '', cartaPresentacion: '', pretensionSalarial: '' }],
  geminiApiKey: 'FAKE_KEY',
};

const panelDom = new JSDOM(read('sidepanel.html'), {
  url: 'file://' + ROOT.replace(/\\/g, '/') + 'sidepanel.html',
  resources: 'usable',
  runScripts: 'dangerously',
});

// Respuesta "sin evidencia" tal cual el Ejemplo 3 del brief.
const fakeInsufficientAnswer = {
  answer: '',
  confidence: 'insufficient',
  evidence: [],
  missingInformation: ['No encontré información que confirme experiencia gestionando equipos de más de 30 personas.'],
  safeToSuggest: false,
  suggestedOptions: [
    'No tengo experiencia gestionando equipos de ese tamaño puntualmente.',
    'No dirigí un equipo de más de 30 personas, aunque sí coordiné campañas con equipos multidisciplinarios más chicos.',
  ],
};

panelDom.window.fetch = () =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: JSON.stringify(fakeInsufficientAnswer) }] } }] }) });
panelDom.window.chrome = {
  storage: { local: { get: () => Promise.resolve({ ...store }), set: (o) => { Object.assign(store, o); return Promise.resolve(); } } },
  tabs: { query: () => Promise.resolve([{ id: 1 }]) },
  runtime: { openOptionsPage: () => {}, onMessage: { addListener: () => {}, removeListener: () => {} } },
  scripting: { executeScript: async () => {} },
};

panelDom.window.addEventListener('load', async () => {
  const { document } = panelDom.window;
  await new Promise((r) => setTimeout(r, 50));

  const field = { idx: 0, label: 'Have you managed teams of more than 30 people?', tag: 'TEXTAREA' };
  const qCard = panelDom.window.eval(`(function() { renderQuestionCard(${JSON.stringify(field)}); return document.querySelector('.q-card'); })()`);

  qCard.querySelector('button').click();
  await new Promise((r) => setTimeout(r, 100));

  assert(qCard.querySelector('.q-warning') !== null, 'muestra el aviso de información insuficiente');
  assert(qCard.querySelector('.q-answer').value === '', 'NO inventa una respuesta afirmativa');
  assert(Array.from(qCard.querySelectorAll('button')).some((b) => b.textContent === 'Saltar'), 'ofrece la opción de saltar la pregunta');
  assert(qCard.querySelector('.q-answer') !== null, 'ofrece escribir la respuesta a mano');

  const optionButtons = qCard.querySelectorAll('.q-option');
  assert(optionButtons.length === 2, 'muestra las 2 opciones honestas sugeridas por Gemini');
  optionButtons[1].click();
  assert(qCard.querySelector('.q-answer').value === fakeInsufficientAnswer.suggestedOptions[1], 'clickear una opción la carga en el textarea para editar');

  console.log('\nevidence.test.js: todo OK');
  process.exit(0);
});
