// Un solo lugar para hablar con la API de Gemini. Lo usan sidepanel.js (chat)
// y options.js (importar desde CV).
(function () {
  // Alias que Google mantiene apuntando siempre al Flash más nuevo, así no
  // se rompe cada vez que discontinúan una versión puntual (nos pasó con
  // gemini-2.0-flash). Si algún día tampoco existe, poner acá el nombre
  // concreto que diga la consola de Gemini.
  const GEMINI_MODEL = 'gemini-flash-latest';

  const RETRYABLE_STATUS = [429, 503];
  const MAX_ATTEMPTS = 3;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function callGeminiOnce({ apiKey, contents, systemInstruction, responseSchema }) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema,
          // Sin esto, los modelos 2.5+ "piensan" antes de contestar — para
          // extraer datos o mapear un campo no hace falta, y tarda más
          // (más chance de pegar contra el límite de tiempo del lado de Gemini).
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`${res.status} ${body.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('Respuesta vacía de Gemini');
    return JSON.parse(raw);
  }

  // Gemini a veces devuelve 429 (rate limit) o 503 (sobrecarga momentánea)
  // sin que sea un error real nuestro — reintenta unas pocas veces antes
  // de darle el error al usuario.
  async function callGemini(args) {
    let lastErr;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await callGeminiOnce(args);
      } catch (err) {
        lastErr = err;
        const isRetryable = RETRYABLE_STATUS.includes(err.status);
        if (!isRetryable || attempt === MAX_ATTEMPTS) throw err;
        await sleep(attempt * 1000);
      }
    }
    throw lastErr;
  }

  window.AUTOFILL_UY_GEMINI = { callGemini, GEMINI_MODEL };
})();
