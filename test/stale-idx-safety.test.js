// node test/stale-idx-safety.test.js
// Reproduce el reporte: al completar un campo "sin dato" (ej: Pretensión
// salarial), terminó escribiendo el valor en Name/Email en vez del campo
// correcto — probablemente porque la página re-renderiza el form entre la
// detección y el click en "Completar". Simulamos ese re-render corriendo
// el mismo idx contra un campo distinto y confirmamos que AHORA se aborta
// en vez de escribir en el lugar equivocado.
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
<input id="name" name="name" type="text" data-autofilluy-idx="1" />
<input id="salary" name="salary" type="text" />
</body></html>`;
const dom = new JSDOM(pageHtml, { url: 'https://x.com', runScripts: 'outside-only' });
const { window } = dom;
global.window = window;
global.document = window.document;
global.HTMLInputElement = window.HTMLInputElement;
global.HTMLTextAreaElement = window.HTMLTextAreaElement;

let sentMsg = null;
window.chrome = {
  storage: {
    local: {
      // La huella guardada corresponde al campo "salary" original, pero el
      // idx=1 en la página real ahora apunta a "name" (re-render simulado).
      get: () => Promise.resolve({ chatAnswers: [{ idx: 1, value: '1500', fingerprint: 'INPUT|salary|salary' }] }),
    },
  },
  runtime: { sendMessage: (msg) => { sentMsg = msg; } },
};

window.eval(read('apply-answer.js'));

setTimeout(() => {
  assert(document.getElementById('name').value === '', 'NO escribió el salario en el campo Name (huella no coincide)');
  assert(document.getElementById('salary').value === '', 'tampoco en salary, porque el idx apuntaba a otro lado en este DOM');
  assert(sentMsg.mismatchedIdx.includes(1), 'reporta el mismatch para que el panel avise en vez de mostrar éxito falso');
  assert(!sentMsg.appliedIdx.includes(1), 'NO lo cuenta como aplicado');

  console.log('\nstale-idx-safety.test.js: todo OK');
  process.exit(0);
}, 50);
