// node test/missing-data.test.js
// Reproduce el bug reportado: un campo que SÍ reconocemos (LinkedIn) pero
// sin dato cargado en el perfil no debe terminar en el pipeline de IA como
// si fuera una pregunta abierta — debe pedirse aparte, sin llamar a Gemini.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..') + path.sep;
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error('FALLÓ: ' + msg);
  console.log('OK:', msg);
}

// userProfile SIN linkedin a propósito.
const store = {
  userProfile: { nombre: 'Andrés', apellido: 'de León', email: 'a@x.com' },
  careerModes: [{ id: 'cm', modeName: 'Community Manager', targetRoles: [], skills: ['Social Media'], descripcionProfesional: '', experiencia: '', cartaPresentacion: '', pretensionSalarial: '' }],
  geminiApiKey: 'FAKE_KEY',
};
function makeChromeStorage() {
  return { local: { get: () => Promise.resolve({ ...store }), set: (obj) => { Object.assign(store, obj); return Promise.resolve(); } } };
}

const pageHtml = `<!DOCTYPE html><html><body>
<label for="fname">Full name</label><input id="fname" name="name" type="text" />
<label for="linkedin">LinkedIn</label><input id="linkedin" name="linkedin" type="text" />
</body></html>`;
const pageDom = new JSDOM(pageHtml, { url: 'https://jobs.example.com/apply', runScripts: 'outside-only' });
const pageWindow = pageDom.window;
Object.defineProperty(pageWindow.HTMLElement.prototype, 'offsetParent', { get() { return pageWindow.document.body; } });

const panelDom = new JSDOM(read('sidepanel.html'), {
  url: 'file://' + ROOT.replace(/\\/g, '/') + 'sidepanel.html',
  resources: 'usable',
  runScripts: 'dangerously',
});

let panelMessageListeners = [];
let geminiWasCalled = false;
panelDom.window.fetch = () => {
  geminiWasCalled = true;
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) });
};
panelDom.window.chrome = {
  storage: makeChromeStorage(),
  tabs: { query: () => Promise.resolve([{ id: 1 }]) },
  runtime: {
    openOptionsPage: () => {},
    onMessage: { addListener: (fn) => panelMessageListeners.push(fn), removeListener: () => {} },
  },
  scripting: {
    executeScript: async ({ files }) => {
      if (files.includes('content-script.js')) {
        pageWindow.chrome = { storage: makeChromeStorage(), runtime: { sendMessage: (msg) => panelMessageListeners.slice().forEach((fn) => fn(msg)) } };
        pageWindow.eval(read('lib/field-catalog.js'));
        pageWindow.eval(read('lib/storage.js'));
        pageWindow.eval(read('content-script.js'));
        await new Promise((r) => setTimeout(r, 20));
      } else if (files.includes('apply-answer.js')) {
        pageWindow.chrome = { storage: makeChromeStorage(), runtime: { sendMessage: (msg) => panelMessageListeners.slice().forEach((fn) => fn(msg)) } };
        pageWindow.eval(read('apply-answer.js'));
        await new Promise((r) => setTimeout(r, 20));
      }
    },
  },
};

panelDom.window.addEventListener('load', async () => {
  const { document } = panelDom.window;
  await new Promise((r) => setTimeout(r, 50));

  // Nos saltamos "Analizar oferta" (ya probado en fill-e2e.test.js) y vamos directo a rellenar.
  panelDom.window.eval("activeModeId = 'cm';");
  document.getElementById('fillBtn').click();
  await new Promise((r) => setTimeout(r, 150));

  assert(document.querySelectorAll('#questionsList .q-card').length === 0, 'LinkedIn NO aparece en "Preguntas abiertas"');
  const missingCards = document.querySelectorAll('#missingList .q-card');
  assert(missingCards.length === 1, 'LinkedIn aparece en "Te falta cargar esto"');
  assert(missingCards[0].querySelector('.q-label').textContent === 'LinkedIn', 'con el label correcto');
  assert(!geminiWasCalled, 'NO se llamó a Gemini para un campo objetivo sin dato');

  const input = missingCards[0].querySelector('.q-answer');
  input.value = 'linkedin.com/in/andresdeleon';
  const completarBtn = Array.from(missingCards[0].querySelectorAll('button')).find((b) => b.textContent === 'Completar');
  completarBtn.click();
  await new Promise((r) => setTimeout(r, 100));
  assert(pageWindow.document.getElementById('linkedin').value === 'linkedin.com/in/andresdeleon', 'completar a mano lo escribe en la página real');

  console.log('\nmissing-data.test.js: todo OK');
  process.exit(0);
});
