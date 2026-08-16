// node test/revert-detection.test.js
// Reproduce el reporte: "What is your salary expectation in USD/month?"
// (un campo numérico) recibe texto no numérico ("A convenir"), el sitio lo
// limpia en su propio validador de onBlur, y antes esto se contaba como
// "completado" sin volver a chequear. Simulamos ese onBlur que limpia el
// valor y confirmamos que ahora se reclasifica como pendiente.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const ROOT = 'C:/Users/andle/Desktop/autofill/';
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error('FALLÓ: ' + msg);
  console.log('OK:', msg);
}

const pageHtml = `<!DOCTYPE html><html><body>
<label for="fname">Full name</label><input id="fname" name="name" type="text" />
<label for="salary">What is your salary expectation in USD/month?</label>
<input id="salary" name="salary" type="text" placeholder="Type here..." />
</body></html>`;
const dom = new JSDOM(pageHtml, { url: 'https://x.com', runScripts: 'outside-only' });
const { window } = dom;
global.window = window;
global.document = window.document;
global.HTMLInputElement = window.HTMLInputElement;
global.HTMLTextAreaElement = window.HTMLTextAreaElement;
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return document.body; } });

// El sitio simula un validador propio: si el valor no es 100% numérico,
// lo limpia apenas se le va el foco (blur) — igual que rechazaría "A convenir".
document.getElementById('salary').addEventListener('blur', function () {
  if (this.value && !/^\d+$/.test(this.value)) this.value = '';
});

const store = {
  userProfile: { nombre: 'Andrés', apellido: 'de León' },
  careerModes: [{ id: 'cm', modeName: 'Community Manager', targetRoles: [], skills: [], descripcionProfesional: '', experiencia: '', cartaPresentacion: '', pretensionSalarial: 'A convenir', cv: undefined }],
  activeCareerModeId: 'cm',
};
let received = null;
window.chrome = {
  storage: { local: { get: () => Promise.resolve(store) } },
  runtime: { sendMessage: (msg) => { received = msg; } },
};

window.eval(read('lib/field-catalog.js'));
window.eval(read('lib/storage.js'));
window.eval(read('content-script.js'));

setTimeout(() => {
  assert(document.getElementById('salary').value === '', 'el sitio efectivamente limpió el valor no numérico (simulado)');
  assert(!received.fields.includes('pretensionSalarial'), 'YA NO se cuenta como completado');
  assert(received.unresolved.some((u) => u.label.includes('salary expectation')), 'se reclasifica como pendiente en vez de darse por hecho en silencio');

  console.log('\nrevert-detection.test.js: todo OK');
  process.exit(0);
}, 500);
