// Se inyecta a demanda (desde popup.js), junto con lib/field-catalog.js,
// en la pestaña activa. No corre solo.
(function () {
  const { FIELD_CATALOG } = window.AUTOFILL_UY;

  // Umbral de confianza: exige o bien una señal fuerte sola (autocomplete,
  // o un label corto y específico), o dos señales medias combinadas.
  // Menos que eso, no se toca.
  const CONFIDENCE_THRESHOLD = 3;

  // Para texto humano: labels, placeholders, sinónimos, texto de <option>.
  // OJO: no separa camelCase — "LinkedIn" y "TikTok" son nombres propios,
  // no identificadores de código, y separarlos ("linked in") rompe el match.
  function norm(str) {
    return (str || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Para name/id de atributos HTML, donde SÍ es útil separar camelCase
  // ("firstName" -> "first Name") porque son identificadores de código, no
  // texto escrito por una persona.
  function normIdentifier(str) {
    return norm((str || '').toString().replace(/([a-z0-9])([A-Z])/g, '$1 $2'));
  }

  function hasSynonym(normalizedStr, synonyms) {
    if (!normalizedStr) return false;
    const padded = ' ' + normalizedStr + ' ';
    return synonyms.some((syn) => padded.includes(' ' + norm(syn) + ' '));
  }

  // Un label corto que matchea es casi seguro EL label del campo ("Teléfono").
  // Uno largo que matchea puede ser una frase que solo menciona la palabra de
  // paso ("Nombre de la empresa donde trabajé") — cuenta poco... salvo que lo
  // que matcheó sea una frase específica de varias palabras ("salary
  // expectation" dentro de "What is your monthly salary expectation?") — ahí
  // es difícil que sea casualidad, aunque la pregunta completa sea larga.
  function labelMatchScore(normalizedLabel, synonyms) {
    if (!normalizedLabel) return 0;
    const padded = ' ' + normalizedLabel + ' ';
    const matched = synonyms.find((syn) => padded.includes(' ' + norm(syn) + ' '));
    if (!matched) return 0;
    if (norm(matched).split(' ').filter(Boolean).length >= 2) return 3;
    const wordCount = normalizedLabel.split(' ').filter(Boolean).length;
    return wordCount <= 5 ? 3 : 1;
  }

  function getLabelText(input) {
    let text = '';
    if (input.labels && input.labels.length) {
      text = Array.from(input.labels)
        .map((l) => l.textContent)
        .join(' ');
    }
    if (!text && input.getAttribute('aria-label')) {
      text = input.getAttribute('aria-label');
    }
    if (!text && input.getAttribute('aria-labelledby')) {
      const el = document.getElementById(input.getAttribute('aria-labelledby'));
      if (el) text = el.textContent;
    }
    if (!text) {
      // Patrón común: <div class="label">Teléfono</div><input> como hermanos
      // sueltos, sin contenedor que los envuelva.
      const sib = input.previousElementSibling;
      if (sib && !['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(sib.tagName)) {
        const t = sib.textContent.trim();
        if (t && t.length < 80) text = t;
      }
    }
    if (!text) {
      const container = input.closest('div, li, td, fieldset') || input.parentElement;
      if (container) {
        const candidate = container.querySelector('label, .label, [class*="label"]');
        if (candidate && candidate !== input) text = candidate.textContent;
      }
    }
    return text;
  }

  // Para sinónimos genéricos y ambiguos ("name" solo, sin "full") — cuentan
  // fuerte, pero solo si son TODO el contenido del campo (name/id/label),
  // no si aparecen dentro de algo más largo ("Company name", "Username").
  function exactSynonymScore(input, def) {
    if (!def.exactSynonyms || !def.exactSynonyms.length) return 0;
    const candidates = [normIdentifier(input.name || ''), normIdentifier(input.id || ''), norm(getLabelText(input))];
    const matches = candidates.some((c) => c && def.exactSynonyms.some((syn) => c === norm(syn)));
    return matches ? 3 : 0;
  }

  function scoreField(input, def) {
    let score = 0;
    const autocomplete = norm(input.getAttribute('autocomplete') || '');
    const nameId = normIdentifier((input.name || '') + ' ' + (input.id || ''));
    const placeholder = norm(input.placeholder || '');
    const label = norm(getLabelText(input));

    if (autocomplete && def.autocomplete.includes(autocomplete)) score += 3;
    if (def.htmlInputType && input.type === def.htmlInputType) score += 2;
    if (hasSynonym(nameId, def.synonyms)) score += 2;
    if (hasSynonym(placeholder, def.synonyms)) score += 1;
    score += labelMatchScore(label, def.synonyms);
    score += exactSynonymScore(input, def);
    return score;
  }

  function getCandidateInputs() {
    const skipTypes = ['hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'password', 'image', 'reset'];
    return Array.from(document.querySelectorAll('input, textarea, select')).filter((el) => {
      if (el.tagName === 'INPUT' && skipTypes.includes(el.type)) return false;
      if (el.disabled || el.readOnly) return false;
      if (el.offsetParent === null) return false; // invisible
      if (el.value && el.value.trim()) return false; // ya tiene algo, no lo piso
      return true;
    });
  }

  function ensureStyle() {
    if (document.getElementById('__autofillUY_style')) return;
    const style = document.createElement('style');
    style.id = '__autofillUY_style';
    style.textContent = `
      @keyframes autofillUYFlash { 0% { background-color: #ffe58f; } 100% { background-color: transparent; } }
      .__autofillUY_filled { animation: autofillUYFlash 1.2s ease-out; }
    `;
    document.head.appendChild(style);
  }

  function highlight(input) {
    input.classList.add('__autofillUY_filled');
    setTimeout(() => input.classList.remove('__autofillUY_filled'), 1200);
  }

  function setNativeValue(input, value) {
    // Setter nativo: si no hacemos esto, React/Vue no notan el cambio y el
    // campo se ve lleno pero el formulario lo trata como vacío al enviar.
    const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setSelectValue(select, value) {
    const target = norm(value);
    const options = Array.from(select.options);
    let match = options.find((o) => norm(o.textContent) === target);
    if (!match) match = options.find((o) => norm(o.textContent).includes(target) || target.includes(norm(o.textContent)));
    if (!match) return false;
    select.value = match.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function fillField(input, def, value) {
    input.focus();
    if (input.tagName === 'SELECT') {
      const ok = setSelectValue(input, value);
      if (!ok) {
        input.blur();
        return false;
      }
    } else {
      setNativeValue(input, value);
    }
    input.blur();
    highlight(input);
    return true;
  }

  async function loadData() {
    const state = await window.AUTOFILL_UY_STORAGE.getState();
    const { activeCareerModeId } = await chrome.storage.local.get(['activeCareerModeId']);
    const userProfile = state.userProfile || {};
    const careerModes = state.careerModes || [];
    // Si no se eligió perfil a propósito (activeCareerModeId es null), no
    // usamos ninguno por default — solo se rellena con los datos generales.
    const mode = activeCareerModeId ? careerModes.find((m) => m.id === activeCareerModeId) || {} : {};
    const nombreCompleto = [userProfile.nombre, userProfile.apellido].filter(Boolean).join(' ');
    return { ...userProfile, ...mode, nombreCompleto };
  }

  async function run() {
    const data = await loadData();
    if (!Object.values(data).some((v) => v && v.toString().trim())) {
      chrome.runtime.sendMessage({ type: 'autofillUY:result', count: 0, fields: [], noData: true });
      return;
    }

    ensureStyle();
    const inputs = getCandidateInputs();
    // Cada candidato recibe un índice estable en el DOM: si el panel decide
    // después cómo llenar uno, necesita una forma de volver a encontrarlo
    // (no se pueden pasar referencias de elementos entre content script y
    // panel). Guardamos también name/id/tag: si la página reordena o
    // re-renderiza el formulario (apps React) y el índice termina
    // apuntando a otro campo, esta huella permite detectarlo y abortar en
    // vez de escribir en el campo equivocado.
    inputs.forEach((el, i) => el.setAttribute('data-autofilluy-idx', String(i)));
    const fingerprintOf = (el) => `${el.tagName}|${el.name || ''}|${el.id || ''}`;
    const used = new Set();
    const filled = [];
    // Campo Tipo A que reconocemos con confianza, pero el dato no está
    // cargado en el perfil — no es una pregunta abierta, así que no va a la IA.
    const missingData = [];

    for (const [key, def] of Object.entries(FIELD_CATALOG)) {
      let best = null;
      let bestScore = 0;
      for (const input of inputs) {
        if (used.has(input)) continue;
        if (def.inputKind === 'select' && input.tagName !== 'SELECT') continue;
        if (def.inputKind !== 'select' && input.tagName === 'SELECT') continue;
        const s = scoreField(input, def);
        if (s > bestScore) {
          bestScore = s;
          best = input;
        }
      }
      if (!best || bestScore < CONFIDENCE_THRESHOLD) continue;

      const value = data[key];
      if (value && value.toString().trim()) {
        const ok = fillField(best, def, value);
        if (ok) {
          used.add(best);
          filled.push(key);
        }
      } else {
        used.add(best);
        missingData.push({ idx: Number(best.getAttribute('data-autofilluy-idx')), label: def.label, key, fingerprint: fingerprintOf(best) });
      }
    }

    const unresolved = inputs
      .filter((el) => !used.has(el))
      .map((el) => ({
        idx: Number(el.getAttribute('data-autofilluy-idx')),
        label: (getLabelText(el).trim() || el.placeholder || el.name || el.id || '').slice(0, 120),
        tag: el.tagName,
        type: el.type || null,
        fingerprint: fingerprintOf(el),
      }))
      .filter((c) => c.label)
      .slice(0, 20);

    chrome.runtime.sendMessage({ type: 'autofillUY:result', count: filled.length, fields: filled, unresolved, missingData });
  }

  run();
})();
