// node test/fill-e2e.test.js
// Escenario A del brief: detecta oferta -> recomienda perfil -> rellena
// Tipo A -> genera respuesta Tipo B con evidencia -> inserta.
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
  userProfile: { nombre: 'Andrés', apellido: 'de León', email: 'andresdeleonuy@gmail.com', telefono: '099123456' },
  careerModes: [
    {
      id: 'cm', modeName: 'Community Manager', targetRoles: ['Community Manager', 'Social Media Manager'],
      descripcionProfesional: 'Gestión de redes sociales y estrategia de contenidos.',
      experiencia: 'Manejo de calendarios de contenido, copywriting y analítica de redes.',
      skills: ['Social Media', 'Content Strategy', 'Copywriting', 'Community Management', 'Analytics'],
      cartaPresentacion: '', pretensionSalarial: '',
    },
    {
      id: 'video', modeName: 'Video Editor', targetRoles: ['Video Editor'],
      descripcionProfesional: 'Editor de video especializado en anuncios cortos.',
      experiencia: 'Edición con Premiere Pro y CapCut, producción de reels.',
      skills: ['Premiere Pro', 'CapCut', 'Video Ads', 'Reels', 'Generative AI'],
      cartaPresentacion: '', pretensionSalarial: '',
    },
  ],
  geminiApiKey: 'FAKE_KEY',
};
function makeChromeStorage() {
  return { local: { get: () => Promise.resolve({ ...store }), set: (obj) => { Object.assign(store, obj); return Promise.resolve(); } } };
}

const pageHtml = `<!DOCTYPE html><html><head><title>Community Manager - RYZ Labs</title></head><body>
<h1>Community Manager</h1>
<div class="job-description"><p>We are looking for a Social Media Content Creator responsible for Instagram, TikTok, Reels, content calendars and community engagement.</p></div>
<label for="fname">Full name</label><input id="fname" name="name" type="text" />
<label for="email">Email</label><input id="email" name="email" type="email" />
<label for="phone">Phone</label><input id="phone" name="phone" type="text" />
<label for="why">Why do you want to work here?</label><textarea id="why" name="why"></textarea>
</body></html>`;

const pageDom = new JSDOM(pageHtml, { url: 'https://jobs.example.com/apply', runScripts: 'outside-only' });
const pageWindow = pageDom.window;
Object.defineProperty(pageWindow.HTMLElement.prototype, 'innerText', {
  get() {
    const clone = this.cloneNode(true);
    clone.querySelectorAll('script, style').forEach((el) => el.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  },
});
Object.defineProperty(pageWindow.HTMLElement.prototype, 'offsetParent', { get() { return pageWindow.document.body; } });

const panelDom = new JSDOM(read('sidepanel.html'), {
  url: 'file://' + ROOT.replace(/\\/g, '/') + 'sidepanel.html',
  resources: 'usable',
  runScripts: 'dangerously',
});

let panelMessageListeners = [];
let capturedFetchBody = null;

const fakeEvidenceAnswer = {
  answer: 'Tengo experiencia gestionando redes sociales y estrategia de contenidos, con foco en copywriting y analítica.',
  confidence: 'high',
  evidence: [{ type: 'skills', reason: 'Skills: Social Media, Copywriting, Analytics' }],
  missingInformation: [],
  safeToSuggest: true,
};

panelDom.window.fetch = (url, opts) => {
  capturedFetchBody = JSON.parse(opts.body);
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: JSON.stringify(fakeEvidenceAnswer) }] } }] }) });
};

panelDom.window.chrome = {
  storage: makeChromeStorage(),
  tabs: { query: () => Promise.resolve([{ id: 1 }]) },
  runtime: {
    openOptionsPage: () => {},
    onMessage: {
      addListener: (fn) => panelMessageListeners.push(fn),
      removeListener: (fn) => { panelMessageListeners = panelMessageListeners.filter((f) => f !== fn); },
    },
  },
  scripting: {
    executeScript: async ({ files }) => {
      if (files.includes('extract-job.js')) {
        pageWindow.chrome = { runtime: { sendMessage: (msg) => panelMessageListeners.slice().forEach((fn) => fn(msg)) } };
        pageWindow.eval(read('extract-job.js'));
      } else if (files.includes('content-script.js')) {
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

  document.getElementById('analyzeBtn').click();
  await new Promise((r) => setTimeout(r, 100));
  const matchCards = document.querySelectorAll('.match-card');
  assert(matchCards.length === 2, 'muestra los 2 perfiles rankeados');
  assert(matchCards[0].querySelector('.match-card-name').textContent === 'Community Manager', 'recomienda Community Manager primero');
  assert(matchCards[0].className.includes('active'), 'el recomendado queda marcado como activo');

  document.getElementById('fillBtn').click();
  await new Promise((r) => setTimeout(r, 150));
  assert(pageWindow.document.getElementById('fname').value === 'Andrés de León', 'nombre completo correcto (no lo pisa el nombre del perfil)');
  assert(pageWindow.document.getElementById('email').value === 'andresdeleonuy@gmail.com', 'email correcto');
  assert(pageWindow.document.getElementById('phone').value === '099123456', 'teléfono correcto');

  const qCards = document.querySelectorAll('.q-card');
  assert(qCards.length === 1, 'detecta la pregunta abierta sin resolver');
  qCards[0].querySelector('button').click();
  await new Promise((r) => setTimeout(r, 100));

  const sentContext = capturedFetchBody.systemInstruction.parts[0].text;
  assert(!sentContext.includes('Andrés'), 'NO manda el nombre/datos personales a Gemini para la pregunta abierta');
  assert(sentContext.includes('Copywriting'), 'sí manda las skills del perfil activo (evidencia)');
  assert(qCards[0].querySelector('.q-confidence').textContent === 'Confianza alta', 'muestra la confianza devuelta');

  const insertBtn = Array.from(qCards[0].querySelectorAll('button')).find((b) => b.textContent === 'Insertar');
  insertBtn.click();
  await new Promise((r) => setTimeout(r, 100));
  assert(pageWindow.document.getElementById('why').value.includes('copywriting'), 'inserta la respuesta generada en la página real');

  console.log('\nfill-e2e.test.js: todo OK');
  process.exit(0);
});
