// node test/cv-autofill.test.js
//
// OJO: jsdom no implementa DataTransfer (necesario para el truco de adjuntar
// el PDF al <input type=file>), así que no se puede probar acá el adjuntado
// real — eso hay que confirmarlo a mano en Chrome. Lo que SÍ se prueba:
// - que el input de "Resume" se detecte como campo de tipo cv;
// - que sin CV cargado en el perfil caiga en "Te falta cargar esto", no
//   como pregunta abierta de IA (no tendría sentido pedirle a Gemini que
//   "conteste" un campo de subir archivo).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..') + path.sep;
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error('FALLÓ: ' + msg);
  console.log('OK:', msg);
}

const pageHtml = `<!DOCTYPE html><html><body>
<label for="fname">Full name</label><input id="fname" name="name" type="text" />
<label for="resume">Resume</label><input id="resume" name="resume" type="file" />
</body></html>`;
const dom = new JSDOM(pageHtml, { url: 'https://x.com', runScripts: 'outside-only' });
const { window } = dom;
global.window = window;
global.document = window.document;
global.HTMLInputElement = window.HTMLInputElement;
global.HTMLTextAreaElement = window.HTMLTextAreaElement;
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return document.body; } });

// Perfil activo SIN cv cargado.
const store = {
  userProfile: { nombre: 'Andrés', apellido: 'de León' },
  careerModes: [{ id: 'cm', modeName: 'Community Manager', targetRoles: [], skills: [], descripcionProfesional: '', experiencia: '', cartaPresentacion: '', pretensionSalarial: '' }],
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
  // content-script espera 350ms internamente para re-chequear valores.
  assert(document.getElementById('resume').files.length === 0, 'sin CV cargado, el input de resume queda vacío (no rompe nada)');
  assert(received.missingData.some((m) => m.key === 'cv'), 'el campo "Resume" se detecta como cv y cae en "Te falta cargar esto"');
  assert(!received.unresolved.some((u) => u.label.toLowerCase().includes('resume')), 'NO aparece como pregunta abierta de IA (no tiene sentido pedirle a Gemini un archivo)');

  console.log('\ncv-autofill.test.js: todo OK (el adjuntado real con DataTransfer requiere probarse en Chrome, jsdom no lo soporta)');
  process.exit(0);
}, 500);
