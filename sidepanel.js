const jobStatusEl = document.getElementById('jobStatus');
const matchSection = document.getElementById('matchSection');
const matchList = document.getElementById('matchList');
const fillSection = document.getElementById('fillSection');
const fillBtn = document.getElementById('fillBtn');
const fillStatus = document.getElementById('fillStatus');
const questionsSection = document.getElementById('questionsSection');
const questionsList = document.getElementById('questionsList');
const missingSection = document.getElementById('missingSection');
const missingList = document.getElementById('missingList');

let userProfile = {};
let careerModes = [];
let activeModeId = null;
let jobSignals = null; // { title, text } — se cachea mientras el panel sigue abierto
let ranked = [];

document.getElementById('optionsLink').addEventListener('click', () => chrome.runtime.openOptionsPage());

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function activeMode() {
  return careerModes.find((m) => m.id === activeModeId) || null;
}

async function init() {
  const state = await window.AUTOFILL_UY_STORAGE.getState();
  userProfile = state.userProfile || {};
  careerModes = state.careerModes || [];
  if (careerModes.length === 0) {
    jobStatusEl.textContent = 'Todavía no cargaste ningún perfil. Andá a "Editar mis datos".';
    document.getElementById('analyzeBtn').disabled = true;
  }
}

// ---- Paso 1: detectar y analizar la oferta ----

document.getElementById('analyzeBtn').addEventListener('click', async () => {
  matchSection.hidden = true;
  fillSection.hidden = true;
  questionsSection.hidden = true;
  questionsList.innerHTML = '';
  jobStatusEl.textContent = 'Leyendo la oferta de esta página...';

  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    jobStatusEl.textContent = 'No se encontró la pestaña activa.';
    return;
  }

  chrome.runtime.onMessage.addListener(function onJobExtracted(msg) {
    if (!msg || msg.type !== 'autofillUY:jobExtracted') return;
    chrome.runtime.onMessage.removeListener(onJobExtracted);
    jobSignals = { title: msg.title, text: msg.text };
    jobStatusEl.textContent = msg.lowConfidence
      ? `No estoy seguro de haber encontrado la descripción completa ("${msg.title}"). El match puede ser menos preciso.`
      : `Oferta detectada: "${msg.title}"`;
    runMatching();
  });

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract-job.js'] });
  } catch (e) {
    jobStatusEl.textContent = 'No se pudo leer esta página: ' + e.message;
    console.error('[ApplyMode] executeScript(extract-job.js) falló', e);
  }
});

// Por debajo de esto, ningún perfil coincide de verdad con la oferta — mejor
// no asumir ninguno que forzar uno que no tiene nada que ver (ej: 2% match).
const MIN_CONFIDENT_MATCH = 15;

function runMatching() {
  const result = window.AUTOFILL_UY_MATCHER.recommendCareerMode(jobSignals, careerModes);
  ranked = result.ranked;
  const confident = result.recommended && result.recommended.score >= MIN_CONFIDENT_MATCH;
  activeModeId = confident ? result.recommended.id : null;
  renderMatches();

  const matchHeading = document.querySelector('#matchSection h2');
  matchHeading.textContent = confident ? 'Perfil recomendado' : 'Ningún perfil coincide claramente — elegí uno';

  matchSection.hidden = false;
  fillSection.hidden = false;
  updateFillButtonLabel();
}

function updateFillButtonLabel() {
  const mode = activeMode();
  fillBtn.textContent = mode ? `Rellenar con perfil: ${mode.modeName}` : 'Rellenar con mis datos básicos (sin perfil)';
}

function renderMatches() {
  matchList.innerHTML = '';
  ranked.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'match-card' + (r.id === activeModeId ? ' active' : '');

    const top = document.createElement('div');
    top.className = 'match-card-top';
    const name = document.createElement('span');
    name.className = 'match-card-name';
    name.textContent = r.modeName;
    const score = document.createElement('span');
    score.className = 'match-card-score';
    score.textContent = `${r.score}% match`;
    top.appendChild(name);
    top.appendChild(score);
    card.appendChild(top);

    if (r.reasons.length) {
      const reasons = document.createElement('div');
      reasons.className = 'match-card-reasons';
      reasons.textContent = 'Coincide en: ' + r.reasons.join(', ');
      card.appendChild(reasons);
    }

    const actions = document.createElement('div');
    actions.className = 'match-card-actions';
    const btn = document.createElement('button');
    btn.className = 'secondary';
    if (r.id === activeModeId) {
      btn.textContent = 'En uso';
      btn.disabled = true;
    } else {
      btn.textContent = 'Usar este perfil';
      btn.addEventListener('click', () => {
        activeModeId = r.id;
        renderMatches();
        updateFillButtonLabel();
      });
    }
    actions.appendChild(btn);
    card.appendChild(actions);

    matchList.appendChild(card);
  });

  if (activeModeId) {
    matchList.appendChild(makeButton('No usar ningún perfil — solo mis datos básicos', () => {
      activeModeId = null;
      renderMatches();
      updateFillButtonLabel();
    }));
  }
}

// ---- Paso 2: rellenar Tipo A, listar Tipo B ----

fillBtn.addEventListener('click', async () => {
  const mode = activeMode();
  fillStatus.textContent = 'Buscando campos...';
  questionsSection.hidden = true;
  questionsList.innerHTML = '';
  missingSection.hidden = true;
  missingList.innerHTML = '';

  // null explícito, no undefined: si no hay perfil elegido, content-script
  // no debe usar ningún perfil por default (antes usaba el primero sin que
  // el usuario lo pidiera).
  await chrome.storage.local.set({ activeCareerModeId: mode ? mode.id : null });
  const tab = await getActiveTab();
  if (!tab || !tab.id) {
    fillStatus.textContent = 'No se encontró la pestaña activa.';
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/field-catalog.js', 'lib/storage.js', 'content-script.js'] });
  } catch (e) {
    fillStatus.textContent = 'No se pudo acceder a esta página: ' + e.message;
    console.error('[ApplyMode] executeScript(content-script.js) falló', e);
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'autofillUY:result') {
    if (msg.noData) {
      fillStatus.textContent = 'Este perfil todavía no tiene datos suficientes.';
      return;
    }
    fillStatus.textContent = msg.count > 0 ? `Completé ${msg.count} campo(s) automáticamente.` : 'No encontré campos que pudiera completar solo.';

    const missing = msg.missingData || [];
    if (missing.length > 0) {
      missingSection.hidden = false;
      missing.forEach(renderMissingCard);
    }

    const unresolved = msg.unresolved || [];
    if (unresolved.length > 0) {
      questionsSection.hidden = false;
      unresolved.forEach(renderQuestionCard);
    }
  }
});

function renderMissingCard(field) {
  const card = document.createElement('div');
  card.className = 'q-card';

  const label = document.createElement('div');
  label.className = 'q-label';
  label.textContent = field.label;
  card.appendChild(label);

  if (field.key === 'cv') {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Este perfil todavía no tiene un CV generado/subido. Andá a Opciones para armarlo — de ahí en más se adjunta solo.';
    card.appendChild(hint);
    const actions = document.createElement('div');
    actions.className = 'q-actions';
    actions.appendChild(makeButton('Ir a Opciones', () => chrome.runtime.openOptionsPage()));
    actions.appendChild(makeButton('Saltar', () => card.remove()));
    card.appendChild(actions);
    missingList.appendChild(card);
    return;
  }

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'q-answer';
  input.placeholder = `Escribí tu ${field.label.toLowerCase()}...`;
  card.appendChild(input);

  const actions = document.createElement('div');
  actions.className = 'q-actions';
  actions.appendChild(makeButton('Completar', () => insertAnswer(field, input.value, card)));
  actions.appendChild(makeButton('Saltar', () => card.remove()));
  card.appendChild(actions);

  missingList.appendChild(card);
}

// ---- Paso 3: preguntas abiertas con evidencia ----

function renderQuestionCard(field) {
  const card = document.createElement('div');
  card.className = 'q-card';
  card.dataset.idx = field.idx;

  const label = document.createElement('div');
  label.className = 'q-label';
  label.textContent = field.label;
  card.appendChild(label);

  const body = document.createElement('div');
  body.className = 'q-body';
  card.appendChild(body);

  const genBtn = document.createElement('button');
  genBtn.className = 'secondary';
  genBtn.textContent = 'Generar respuesta';
  genBtn.addEventListener('click', async () => {
    genBtn.disabled = true;
    genBtn.textContent = 'Pensando...';
    try {
      const result = await generateAnswer(field);
      renderAnswer(card, body, field, result);
    } catch (err) {
      body.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = err.friendlyMessage || 'Error: ' + err.message;
      body.appendChild(p);
    }
    genBtn.remove();
  });
  card.appendChild(genBtn);

  questionsList.appendChild(card);
}

function confidenceLabel(c) {
  return { high: 'Confianza alta', medium: 'Confianza media', low: 'Confianza baja', insufficient: 'Información insuficiente' }[c] || c;
}

function renderAnswer(card, body, field, result) {
  body.innerHTML = '';

  if (!result.safeToSuggest) {
    const warn = document.createElement('div');
    warn.className = 'q-warning';
    warn.textContent =
      '⚠️ Información insuficiente. ' + (result.missingInformation[0] || 'No encontré evidencia suficiente en tu perfil para responder esta pregunta.');
    body.appendChild(warn);

    const manual = document.createElement('textarea');
    manual.className = 'q-answer';
    manual.placeholder = 'Escribí la respuesta a mano...';

    if (result.suggestedOptions && result.suggestedOptions.length) {
      const optsLabel = document.createElement('div');
      optsLabel.className = 'hint';
      optsLabel.style.marginBottom = '4px';
      optsLabel.textContent = 'Opciones honestas (no inventan experiencia) — elegí una para editarla, o escribí la tuya abajo:';
      body.appendChild(optsLabel);

      result.suggestedOptions.slice(0, 3).forEach((opt) => {
        const optBtn = document.createElement('button');
        optBtn.className = 'secondary q-option';
        optBtn.textContent = opt;
        optBtn.addEventListener('click', () => {
          manual.value = opt;
          manual.focus();
        });
        body.appendChild(optBtn);
      });
    }

    body.appendChild(manual);

    const actions = document.createElement('div');
    actions.className = 'q-actions';
    actions.appendChild(makeButton('Usar este texto', () => insertAnswer(field, manual.value, card)));
    actions.appendChild(makeButton('Saltar', () => card.remove()));
    body.appendChild(actions);
    return;
  }

  const badge = document.createElement('span');
  badge.className = 'q-confidence ' + result.confidence;
  badge.textContent = confidenceLabel(result.confidence);
  body.appendChild(badge);

  const answerBox = document.createElement('textarea');
  answerBox.className = 'q-answer';
  answerBox.value = result.answer || '';
  body.appendChild(answerBox);

  if (result.evidence && result.evidence.length) {
    const ev = document.createElement('div');
    ev.className = 'q-evidence';
    ev.innerHTML = '<strong>Evidencia:</strong>';
    const ul = document.createElement('ul');
    result.evidence.forEach((e) => {
      const li = document.createElement('li');
      li.textContent = e.reason;
      ul.appendChild(li);
    });
    ev.appendChild(ul);
    body.appendChild(ev);
  }

  const actions = document.createElement('div');
  actions.className = 'q-actions';
  actions.appendChild(makeButton('Insertar', () => insertAnswer(field, answerBox.value, card)));
  actions.appendChild(
    makeButton('Regenerar', async (btn) => {
      btn.disabled = true;
      btn.textContent = 'Pensando...';
      try {
        const fresh = await generateAnswer(field);
        renderAnswer(card, body, field, fresh);
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Regenerar';
      }
    })
  );
  body.appendChild(actions);
}

function makeButton(text, onClick) {
  const btn = document.createElement('button');
  btn.className = 'secondary';
  btn.textContent = text;
  btn.addEventListener('click', () => onClick(btn));
  return btn;
}

async function insertAnswer(field, value, card) {
  if (!value || !value.trim()) return;
  const tab = await getActiveTab();
  if (!tab || !tab.id) return;

  await chrome.storage.local.set({ chatAnswers: [{ idx: field.idx, value, fingerprint: field.fingerprint || null }] });

  const result = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 4000);
    chrome.runtime.onMessage.addListener(function onApplied(msg) {
      if (!msg || msg.type !== 'autofillUY:applyAnswers') return;
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(onApplied);
      resolve(msg);
    });
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['apply-answer.js'] }).catch(() => resolve(null));
  });

  if (result && result.appliedIdx.includes(field.idx)) {
    card.innerHTML = '';
    const done = document.createElement('span');
    done.className = 'q-done';
    done.textContent = '✓ Insertado';
    card.appendChild(done);
  } else if (result && result.mismatchedIdx.includes(field.idx)) {
    const warn = document.createElement('p');
    warn.className = 'hint';
    warn.style.color = '#ff8a8a';
    warn.textContent = '⚠️ La página cambió y no pude confirmar que sea el campo correcto — no escribí nada. Completalo a mano en la página.';
    card.appendChild(warn);
  } else {
    const warn = document.createElement('p');
    warn.className = 'hint';
    warn.style.color = '#ff8a8a';
    warn.textContent = '⚠️ No pude confirmar que se haya completado. Revisá la página.';
    card.appendChild(warn);
  }
}

async function generateAnswer(field) {
  const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
  if (!geminiApiKey) throw new Error('Cargá tu Gemini API key en Opciones.');

  const mode = activeMode() || {};
  const systemInstruction = [
    'Sos el motor de respuestas de ApplyMode, una extensión que ayuda a completar postulaciones laborales.',
    'REGLA MÁS IMPORTANTE: nunca inventes experiencia, empresas, clientes, años, métricas, tecnologías ni títulos.',
    'Solo podés usar como evidencia: la descripción del Career Mode activo, su experiencia y sus skills — nada más.',
    'Si esa información no alcanza para responder con confianza, "safeToSuggest" debe ser false, "answer" un string vacío, y listá en "missingInformation" qué falta.',
    'En ese caso, además generá 2 o 3 "suggestedOptions": formas honestas de responder SIN inventar experiencia — por ejemplo, admitir directamente que no tenés esa experiencia puntual, u ofrecer una versión que mencione algo relacionado que sí figura en el Career Mode, sin exagerarlo como si fuera lo mismo que se pregunta. La persona va a elegir una y editarla, así que no hace falta que sean perfectas.',
    'Podés mejorar la redacción y adaptar el tono al formulario, pero nunca cambiar los hechos.',
    'Respondé en el mismo idioma de la pregunta del formulario.',
    '',
    `Pregunta del formulario: "${field.label}"`,
    '',
    `Career Mode activo: ${mode.modeName || ''}`,
    `Cargos objetivo: ${(mode.targetRoles || []).join(', ') || '(sin datos)'}`,
    `Skills: ${(mode.skills || []).join(', ') || '(sin datos)'}`,
    `Descripción profesional: ${mode.descripcionProfesional || '(sin datos)'}`,
    `Experiencia: ${mode.experiencia || '(sin datos)'}`,
    '',
    jobSignals ? `Contexto de la oferta (para adaptar el tono, no para inventar hechos):\n${jobSignals.text.slice(0, 2000)}` : '',
  ].join('\n');

  return window.AUTOFILL_UY_GEMINI.callGemini({
    apiKey: geminiApiKey,
    contents: [{ role: 'user', parts: [{ text: `Generá la respuesta para: "${field.label}"` }] }],
    systemInstruction,
    responseSchema: {
      type: 'OBJECT',
      properties: {
        answer: { type: 'STRING' },
        confidence: { type: 'STRING', enum: ['high', 'medium', 'low', 'insufficient'] },
        evidence: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: { type: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['type', 'reason'] },
        },
        missingInformation: { type: 'ARRAY', items: { type: 'STRING' } },
        safeToSuggest: { type: 'BOOLEAN' },
        suggestedOptions: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['confidence', 'evidence', 'missingInformation', 'safeToSuggest'],
    },
  });
}

init();
