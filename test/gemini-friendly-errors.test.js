// node test/gemini-friendly-errors.test.js
// Un 429 de cuota agotada no debería mostrarle al usuario el JSON crudo de
// la API — debe traducirse a un mensaje entendible.
global.window = {};
global.setTimeout = setTimeout;

function assert(cond, msg) {
  if (!cond) throw new Error('FALLÓ: ' + msg);
  console.log('OK:', msg);
}

global.fetch = () =>
  Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve('{"error":{"code":429,"message":"You exceeded your current quota..."}}') });

eval(require('fs').readFileSync('C:/Users/andle/Desktop/autofill/lib/gemini.js', 'utf8'));

(async () => {
  try {
    await window.AUTOFILL_UY_GEMINI.callGemini({ apiKey: 'x', contents: [], systemInstruction: 's', responseSchema: {} });
    throw new Error('no debería haber llegado acá');
  } catch (err) {
    assert(err.status === 429, 'conserva el status code original');
    assert(err.friendlyMessage && err.friendlyMessage.includes('cuota'), 'trae un mensaje en criollo sobre la cuota agotada');
    assert(!err.friendlyMessage.includes('{"error"'), 'NO expone el JSON crudo en el mensaje amigable');
    console.log('\ngemini-friendly-errors.test.js: todo OK');
  }
})();
