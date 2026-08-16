// node test/salary-numeric-extraction.test.js
// Un campo que pide explícitamente un número ("USD/month") debe recibir
// solo el número extraído de Pretensión salarial, no el texto completo. Un
// campo de texto libre para lo mismo debe seguir recibiendo el texto tal
// cual (no perder información donde sí hay lugar para ella).
const fs = require('fs');
const { JSDOM } = require('jsdom');
const ROOT = 'C:/Users/andle/Desktop/autofill/';
const read = (p) => fs.readFileSync(ROOT + p, 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error('FALLÓ: ' + msg);
  console.log('OK:', msg);
}

const pageHtml = `<!DOCTYPE html><html><body>
<label for="salaryNum">What is your salary expectation in USD/month?</label>
<input id="salaryNum" name="salaryNum" type="text" />
</body></html>`;
const dom = new JSDOM(pageHtml, { url: 'https://x.com', runScripts: 'outside-only' });
const { window } = dom;
global.window = window;
global.document = window.document;
global.HTMLInputElement = window.HTMLInputElement;
global.HTMLTextAreaElement = window.HTMLTextAreaElement;
Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return document.body; } });

const store = {
  userProfile: { nombre: 'Andrés', apellido: 'de León' },
  careerModes: [{ id: 'cm', modeName: 'Community Manager', targetRoles: [], skills: [], descripcionProfesional: '', experiencia: '', cartaPresentacion: '', pretensionSalarial: 'USD 1200 mensuales, a convenir' }],
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
  assert(document.getElementById('salaryNum').value === '1200', 'un campo "USD/month" recibe SOLO el número extraído, no el texto completo');
  assert(received.fields.includes('pretensionSalarial'), 'se cuenta como completado (el número sigue ahí, no lo rechazó nada)');

  console.log('\nsalary-numeric-extraction.test.js: todo OK');
  process.exit(0);
}, 500);
