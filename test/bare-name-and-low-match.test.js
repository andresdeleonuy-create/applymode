// node test/bare-name-and-low-match.test.js
// Reproduce el reporte: (1) un campo "Name" a secas no se llenaba solo,
// (2) con match bajo (2%) igual se forzaba un perfil como activo.
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
  userProfile: { nombre: 'Andrés', apellido: 'de León', email: 'andresdeleonuy@gmail.com', pais: 'Uruguay' },
  careerModes: [
    { id: 'video', modeName: 'Video Editor', targetRoles: ['Video Editor'], skills: ['Premiere Pro', 'CapCut', 'Reels'], descripcionProfesional: '', experiencia: '', cartaPresentacion: '', pretensionSalarial: '' },
    { id: 'cm', modeName: 'Community Manager', targetRoles: ['Community Manager'], skills: ['Social Media', 'Copywriting'], descripcionProfesional: '', experiencia: '', cartaPresentacion: '', pretensionSalarial: '' },
  ],
  geminiApiKey: 'FAKE_KEY',
};
function makeChromeStorage() {
  return { local: { get: () => Promise.resolve({ ...store }), set: (obj) => { Object.assign(store, obj); return Promise.resolve(); } } };
}

// La misma forma que "Name" a secas + "Company name" señuelo, para confirmar
// que no empieza a confundirlas.
const pageHtml = `<!DOCTYPE html><html><head><title>Senior Graphic Designer - Willow</title></head><body>
<h1>Senior Graphic Designer</h1>
<div class="job-description"><p>We are looking for a Senior Graphic Designer to join our Design &amp; Creatives team, remote across Latin America.</p></div>
<label>Name*</label><input id="name" name="name" type="text" />
<label>Company name</label><input id="company" name="company_name" type="text" />
<label>Email*</label><input id="email" name="email" type="email" />
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

  const cards = document.querySelectorAll('.match-card');
  console.log('scores:', Array.from(cards).map((c) => c.querySelector('.match-card-score').textContent));
  assert(!Array.from(cards).some((c) => c.className.includes('active')), 'con match bajo, NINGÚN perfil queda marcado como activo/en uso');
  assert(document.getElementById('fillSection').hidden === false, 'la sección de rellenar sigue visible aunque no haya match (se puede rellenar sin perfil)');
  assert(document.getElementById('fillBtn').textContent.includes('sin perfil'), 'el botón deja claro que rellenaría sin perfil si no elegís uno');
  assert(document.querySelector('#matchSection h2').textContent.includes('elegí uno'), 'el título avisa que no hay match claro');

  // Elegimos uno a mano, como pediría el flujo real.
  const useBtn = Array.from(cards[0].querySelectorAll('button')).find((b) => b.textContent === 'Usar este perfil');
  useBtn.click();
  document.getElementById('fillBtn').click();
  await new Promise((r) => setTimeout(r, 500)); // content-script espera 350ms para re-chequear valores

  assert(pageWindow.document.getElementById('name').value !== '', '"Name" a secas SÍ se completa solo una vez elegido el perfil');
  assert(pageWindow.document.getElementById('name').value.includes('Andrés'), 'y con el valor correcto (nombre completo)');
  assert(pageWindow.document.getElementById('company').value === '', '"Company name" (señuelo) sigue sin tocarse');
  assert(pageWindow.document.getElementById('email').value === 'andresdeleonuy@gmail.com', 'email sigue andando bien');

  console.log('\nbare-name-and-low-match.test.js: todo OK');
  process.exit(0);
});
