// node test/fill-without-profile.test.js
// Reproduce el pedido: poder rellenar solo con datos generales, sin elegir
// (ni forzar) ningún Career Mode.
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
    { id: 'video', modeName: 'Video Editor', targetRoles: ['Video Editor'], skills: ['Premiere Pro'], descripcionProfesional: 'Editor de video.', experiencia: '', cartaPresentacion: '', pretensionSalarial: '' },
  ],
  activeCareerModeId: 'video', // valor viejo en storage, de un fill anterior — no debería usarse si ahora no elegimos ninguno
  geminiApiKey: 'FAKE_KEY',
};
function makeChromeStorage() {
  return { local: { get: () => Promise.resolve({ ...store }), set: (obj) => { Object.assign(store, obj); return Promise.resolve(); } } };
}

const pageHtml = `<!DOCTYPE html><html><head><title>Senior Graphic Designer - Willow</title></head><body>
<h1>Senior Graphic Designer</h1>
<div class="job-description"><p>We are looking for a Senior Graphic Designer to join our Design team.</p></div>
<label>Name*</label><input id="name" name="name" type="text" />
<label>Email*</label><input id="email" name="email" type="email" />
<label for="titulo">Desired role</label><input id="titulo" name="titulo" type="text" />
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

const panelDom = new JSDOM(read('sidepanel.html'), { url: 'file://' + ROOT.replace(/\\/g, '/') + 'sidepanel.html', resources: 'usable', runScripts: 'dangerously' });
let panelMessageListeners = [];
panelDom.window.chrome = {
  storage: makeChromeStorage(),
  tabs: { query: () => Promise.resolve([{ id: 1 }]) },
  runtime: {
    openOptionsPage: () => {},
    onMessage: { addListener: (fn) => panelMessageListeners.push(fn), removeListener: (fn) => { panelMessageListeners = panelMessageListeners.filter((f) => f !== fn); } },
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
      }
    },
  },
};

panelDom.window.addEventListener('load', async () => {
  const { document } = panelDom.window;
  await new Promise((r) => setTimeout(r, 50));

  document.getElementById('analyzeBtn').click();
  await new Promise((r) => setTimeout(r, 100));

  assert(document.getElementById('fillSection').hidden === false, 'el botón de rellenar está visible aunque no haya match');
  assert(document.getElementById('fillBtn').textContent.includes('sin perfil'), 'el botón avisa que va a rellenar sin perfil');
  assert(!document.querySelectorAll('.match-card').length || !Array.from(document.querySelectorAll('.match-card')).some((c) => c.className.includes('active')), 'no hay ningún perfil marcado activo');

  document.getElementById('fillBtn').click();
  await new Promise((r) => setTimeout(r, 150));

  assert(pageWindow.document.getElementById('name').value.includes('Andrés'), 'nombre completo se rellena solo con datos generales');
  assert(pageWindow.document.getElementById('email').value === 'andresdeleonuy@gmail.com', 'email se rellena');
  assert(pageWindow.document.getElementById('titulo').value === '', 'el campo específico de perfil ("Desired role") queda SIN tocar, no usa el activeCareerModeId viejo de storage');
  assert(store.activeCareerModeId === null, 'storage queda con activeCareerModeId en null, no se filtra el valor viejo');

  console.log('\nfill-without-profile.test.js: todo OK');
  process.exit(0);
});
