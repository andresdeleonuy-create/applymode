const { FIELD_CATALOG, DEPARTAMENTOS, validarCedulaUY, limpiarCedula } = window.AUTOFILL_UY;

const catalogEntries = Object.entries(FIELD_CATALOG);
const generalEntries = catalogEntries.filter(([, d]) => d.group === 'general' && !d.derived);
const perfilEntries = catalogEntries.filter(([, d]) => d.group === 'perfil');

let userProfile = {};
let careerModes = [];
let activeModeId = null;

function buildInput(def) {
  if (def.inputKind === 'textarea') return document.createElement('textarea');
  if (def.inputKind === 'select') {
    const select = document.createElement('select');
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = '— Elegí —';
    select.appendChild(blank);
    DEPARTAMENTOS.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      select.appendChild(opt);
    });
    return select;
  }
  const input = document.createElement('input');
  input.type = def.htmlInputType || 'text';
  return input;
}

function updateCedulaFeedback(value, el) {
  const digits = limpiarCedula(value);
  if (!digits) {
    el.textContent = '';
    el.className = '';
    return;
  }
  const valid = validarCedulaUY(value);
  el.textContent = valid ? 'Dígito verificador OK' : 'El dígito verificador no cierra — revisá el número';
  el.className = valid ? 'ok' : 'error';
}

function renderFields(entries, containerId, idPrefix) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  entries.forEach(([key, def]) => {
    const wrap = document.createElement('label');
    wrap.className = 'field' + (def.inputKind === 'textarea' ? ' wide' : '');
    const span = document.createElement('span');
    span.textContent = def.label;
    wrap.appendChild(span);

    const input = buildInput(def);
    input.id = idPrefix + key;
    wrap.appendChild(input);

    if (key === 'cedula') {
      const small = document.createElement('small');
      small.id = idPrefix + key + '-feedback';
      wrap.appendChild(small);
      input.addEventListener('input', () => updateCedulaFeedback(input.value, small));
    }

    container.appendChild(wrap);
  });
}

function parseTags(str) {
  return (str || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function renderTabs() {
  const tabs = document.getElementById('perfilTabs');
  tabs.innerHTML = '';
  careerModes.forEach((m) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'perfil-tab' + (m.id === activeModeId ? ' active' : '');
    btn.textContent = m.modeName || '(sin nombre)';
    btn.addEventListener('click', () => {
      commitCurrentModeForm();
      selectMode(m.id);
    });
    tabs.appendChild(btn);
  });
}

function selectMode(id) {
  activeModeId = id;
  const mode = careerModes.find((m) => m.id === id);
  document.getElementById('perfilForm').hidden = !mode;
  if (mode) {
    document.getElementById('perfilNombre').value = mode.modeName || '';
    document.getElementById('perfilTargetRoles').value = (mode.targetRoles || []).join(', ');
    document.getElementById('perfilSkills').value = (mode.skills || []).join(', ');
    perfilEntries.forEach(([key]) => {
      const el = document.getElementById('perfil-' + key);
      if (el) el.value = mode[key] || '';
    });
  }
  renderTabs();
}

function commitCurrentModeForm() {
  const mode = careerModes.find((m) => m.id === activeModeId);
  if (!mode) return;
  mode.modeName = document.getElementById('perfilNombre').value.trim() || 'Sin nombre';
  mode.targetRoles = parseTags(document.getElementById('perfilTargetRoles').value);
  mode.skills = parseTags(document.getElementById('perfilSkills').value);
  perfilEntries.forEach(([key]) => {
    const el = document.getElementById('perfil-' + key);
    if (el) mode[key] = el.value;
  });
}

document.getElementById('addPerfilBtn').addEventListener('click', () => {
  commitCurrentModeForm();
  const nuevo = { id: crypto.randomUUID(), modeName: 'Nuevo perfil', targetRoles: [], skills: [] };
  careerModes.push(nuevo);
  selectMode(nuevo.id);
});

document.getElementById('deletePerfilBtn').addEventListener('click', () => {
  if (careerModes.length <= 1) {
    alert('Necesitás al menos un perfil.');
    return;
  }
  careerModes = careerModes.filter((m) => m.id !== activeModeId);
  selectMode(careerModes[0].id);
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  commitCurrentModeForm();
  const profileData = {};
  generalEntries.forEach(([key]) => {
    const el = document.getElementById('general-' + key);
    if (el) profileData[key] = el.value.trim();
  });
  userProfile = profileData;
  const geminiApiKey = document.getElementById('geminiApiKey').value.trim();
  await window.AUTOFILL_UY_STORAGE.saveState({ userProfile, careerModes });
  await chrome.storage.local.set({ geminiApiKey });
  const status = document.getElementById('saveStatus');
  status.textContent = 'Guardado ✓';
  setTimeout(() => (status.textContent = ''), 2000);
});

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.getElementById('importCvBtn').addEventListener('click', async () => {
  const importStatus = document.getElementById('importStatus');
  const file = document.getElementById('cvFile').files[0];
  if (!file) {
    importStatus.textContent = 'Elegí un archivo PDF primero.';
    return;
  }

  const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
  if (!geminiApiKey) {
    importStatus.textContent = 'Cargá tu Gemini API key arriba y guardá antes de importar.';
    return;
  }

  importStatus.textContent = 'Leyendo el CV...';
  try {
    // Carta de presentación y pretensión salarial no salen de un CV: son
    // específicas de cada postulación, no datos del candidato.
    const importablePerfil = perfilEntries.filter(([key]) => key !== 'cartaPresentacion' && key !== 'pretensionSalarial');
    const allImportable = [...generalEntries, ...importablePerfil];

    const schemaProps = { skills: { type: 'ARRAY', items: { type: 'STRING' } } };
    allImportable.forEach(([key]) => {
      schemaProps[key] = { type: 'STRING' };
    });

    const fieldsDoc = allImportable.map(([key, def]) => `${key}: ${def.label}`).join('\n');
    const systemInstruction = [
      'Sos un extractor de datos de currículums (CV). Te paso un PDF.',
      'Devolvé SOLO los campos que puedas leer con certeza del documento, usando esta correspondencia clave: etiqueta',
      fieldsDoc,
      'skills: lista corta de herramientas/tecnologías/habilidades concretas que aparezcan en el CV (ej: "Meta Ads", "Premiere Pro", "Copywriting"), como array de strings cortos, no oraciones.',
      'Si un dato no aparece en el CV, devolvé ese campo como string vacío ("") o array vacío. No inventes ni completes con supuestos.',
      'Para "experiencia" y "descripcionProfesional", resumí en un párrafo breve basado en el CV, no copies el documento entero.',
    ].join('\n\n');

    const base64 = await fileToBase64(file);
    const result = await window.AUTOFILL_UY_GEMINI.callGemini({
      apiKey: geminiApiKey,
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Extraé los datos de este CV.' }, { inlineData: { mimeType: file.type || 'application/pdf', data: base64 } }],
        },
      ],
      systemInstruction,
      responseSchema: { type: 'OBJECT', properties: schemaProps },
    });

    let count = 0;
    generalEntries.forEach(([key]) => {
      const el = document.getElementById('general-' + key);
      if (el && result[key]) {
        el.value = result[key];
        count++;
      }
    });
    if (result.cedula) {
      updateCedulaFeedback(result.cedula, document.getElementById('general-cedula-feedback'));
    }
    importablePerfil.forEach(([key]) => {
      const el = document.getElementById('perfil-' + key);
      if (el && result[key]) {
        el.value = result[key];
        count++;
      }
    });
    if (Array.isArray(result.skills) && result.skills.length) {
      document.getElementById('perfilSkills').value = result.skills.join(', ');
      count++;
    }

    importStatus.textContent = `Importé ${count} campo(s). Revisalos y guardá.`;
  } catch (err) {
    importStatus.textContent = 'Error importando: ' + err.message;
  }
});

async function init() {
  renderFields(generalEntries, 'generalFields', 'general-');
  renderFields(perfilEntries, 'perfilFields', 'perfil-');

  const state = await window.AUTOFILL_UY_STORAGE.getState();
  const { geminiApiKey } = await chrome.storage.local.get(['geminiApiKey']);
  userProfile = state.userProfile || {};
  careerModes = state.careerModes && state.careerModes.length ? state.careerModes : [{ id: crypto.randomUUID(), modeName: 'Perfil 1', targetRoles: [], skills: [] }];

  generalEntries.forEach(([key]) => {
    const el = document.getElementById('general-' + key);
    if (el && userProfile[key]) el.value = userProfile[key];
  });
  if (userProfile.cedula) {
    updateCedulaFeedback(userProfile.cedula, document.getElementById('general-cedula-feedback'));
  }
  if (geminiApiKey) {
    document.getElementById('geminiApiKey').value = geminiApiKey;
  }

  selectMode(careerModes[0].id);
}

init();
