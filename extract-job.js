// Se inyecta a demanda para leer la oferta laboral de la página actual.
// Heurístico: no hay un estándar de HTML para "acá está la descripción del
// puesto". Si falla, el panel debe ofrecer que el usuario seleccione el
// texto a mano (ver options del lado del panel).
(function () {
  function textOf(el) {
    return (el && el.innerText ? el.innerText : '').trim();
  }

  function guessTitle() {
    const h1 = document.querySelector('h1');
    if (h1 && textOf(h1).length > 3 && textOf(h1).length < 150) return textOf(h1);
    return document.title || '';
  }

  // Prioriza contenedores que suelen envolver la descripción del puesto en
  // portales de empleo / ATS (Lever, Greenhouse, Computrabajo, genéricos).
  const CANDIDATE_SELECTORS = [
    '[class*="job-description" i]',
    '[class*="jobdescription" i]',
    '[id*="job-description" i]',
    '[class*="posting-description" i]',
    '[class*="description" i]',
    '[class*="vacancy" i]',
    '[class*="oferta" i]',
    'main article',
    'article',
    'main',
  ];

  function guessDescription() {
    let best = '';
    for (const sel of CANDIDATE_SELECTORS) {
      const el = document.querySelector(sel);
      const text = textOf(el);
      // Un candidato razonable tiene texto sustancial pero no toda la página.
      if (text.length > 200 && text.length > best.length) {
        best = text;
      }
      if (best.length > 400) break; // ya alcanza, no sigas bajando en prioridad
    }
    if (!best) {
      // Último recurso: el body entero, recortado.
      best = textOf(document.body);
    }
    return best.slice(0, 6000);
  }

  function extract() {
    const title = guessTitle();
    const text = guessDescription();
    chrome.runtime.sendMessage({
      type: 'autofillUY:jobExtracted',
      title,
      text,
      lowConfidence: text.length < 200,
    });
  }

  extract();
})();
