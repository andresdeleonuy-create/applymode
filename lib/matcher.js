// Motor de matching entre una oferta laboral y los Career Modes del usuario.
// A propósito NO usa IA: es determinístico y explicable — mismo input,
// mismo score, siempre, y se puede mostrar por qué.
(function () {
  const STOPWORDS = new Set([
    // es
    'para', 'con', 'los', 'las', 'una', 'uno', 'del', 'que', 'por', 'como', 'más', 'mas', 'sus', 'este', 'esta',
    'estos', 'estas', 'somos', 'buscamos', 'trabajo', 'empresa', 'persona', 'años', 'nivel', 'sobre', 'entre',
    'todo', 'toda', 'todos', 'todas', 'será', 'sera', 'tener', 'debe', 'deberá', 'debera', 'puesto', 'cargo',
    // en
    'the', 'and', 'for', 'with', 'you', 'your', 'are', 'will', 'have', 'this', 'that', 'from', 'our', 'we',
    'team', 'work', 'able', 'role', 'job', 'about', 'looking', 'experience', 'years',
  ]);

  // Sin split de camelCase: acá solo se normaliza texto humano (ofertas,
  // skills, cargos) — "TikTok" es un nombre propio, no un identificador de
  // código, y separarlo ("tik tok") rompe el match contra la oferta.
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

  function tokenize(str) {
    return norm(str)
      .split(' ')
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  }

  function phraseInText(normalizedText, phrase) {
    const p = norm(phrase);
    if (!p) return false;
    return (' ' + normalizedText + ' ').includes(' ' + p + ' ');
  }

  // Las ofertas casi nunca repiten tu skill palabra por palabra ("Community
  // Management" vs. "community engagement" en la oferta) — dan crédito
  // parcial por palabra en vez de exigir la frase exacta. Sigue siendo
  // determinístico: mismo input, mismo resultado, y se puede explicar
  // ("matcheó 1 de 2 palabras").
  function wordsOf(phrase) {
    return norm(phrase).split(' ').filter(Boolean);
  }

  function overlapScore(normalizedText, phrase) {
    const words = wordsOf(phrase);
    if (words.length === 0) return 0;
    if (phraseInText(normalizedText, phrase)) return 1; // frase completa: señal fuerte
    const jobWords = new Set(normalizedText.split(' ').filter(Boolean));
    const matchedWords = words.filter((w) => jobWords.has(w)).length;
    return Math.min(0.7, matchedWords / words.length); // parcial: techo más bajo que un match exacto
  }

  function analyzeJob({ title, text }) {
    const normalizedTitle = norm(title);
    const normalizedText = norm(text);
    return {
      normalizedTitle,
      normalizedText,
      combined: (normalizedTitle + ' ' + normalizedText).trim(),
    };
  }

  function scoreByOverlap(jobSignals, phrases) {
    const list = (phrases || []).filter(Boolean);
    if (list.length === 0) return { score: 0, matched: [] };
    const scored = list.map((p) => ({ phrase: p, overlap: overlapScore(jobSignals.combined, p) }));
    const total = scored.reduce((acc, s) => acc + s.overlap, 0);
    const matched = scored.filter((s) => s.overlap > 0).map((s) => s.phrase);
    return { score: total / list.length, matched };
  }

  // Si "reels" ya sumó por estar en la lista de skills, no debería sumar
  // otra vez porque la palabra también aparece en el texto de experiencia —
  // es el mismo dato real contado dos veces, e infla el eje equivocado.
  function scoreExperience(jobSignals, mode, alreadyCreditedTokens) {
    const excluded = new Set(alreadyCreditedTokens.flatMap((s) => tokenize(s)));
    const modeTokens = Array.from(new Set(tokenize((mode.experiencia || '') + ' ' + (mode.descripcionProfesional || ''))))
      .filter((t) => !excluded.has(t))
      .slice(0, 15);
    if (modeTokens.length === 0) return { score: 0, matched: [] };
    const jobTokens = new Set(tokenize(jobSignals.combined));
    const matched = modeTokens.filter((t) => jobTokens.has(t));
    return { score: matched.length / modeTokens.length, matched };
  }

  // Pesos: Skills 50% + Rol 25% + Experiencia/Descripción 25%.
  // Las skills pesan más porque el usuario las carga a propósito para esto
  // — es la señal más confiable. El resto es texto libre, más ruidoso.
  // (En la propuesta original había un cuarto eje de "seniority", pero no
  // tenemos ese dato guardado por career mode todavía — lo dejamos para P1
  // en vez de inventar un valor. Ver auditoría.)
  const WEIGHTS = { rol: 0.25, skills: 0.5, experiencia: 0.25 };

  function scoreOne(jobSignals, mode) {
    const rol = scoreByOverlap(jobSignals, mode.targetRoles);
    const skills = scoreByOverlap(jobSignals, mode.skills);
    const experiencia = scoreExperience(jobSignals, mode, [...rol.matched, ...skills.matched]);

    const score = Math.round((rol.score * WEIGHTS.rol + skills.score * WEIGHTS.skills + experiencia.score * WEIGHTS.experiencia) * 100);

    const reasons = [...skills.matched, ...rol.matched, ...experiencia.matched].slice(0, 6);

    return {
      id: mode.id,
      modeName: mode.modeName,
      score,
      breakdown: { rol: Math.round(rol.score * 100), skills: Math.round(skills.score * 100), experiencia: Math.round(experiencia.score * 100) },
      matchedSkills: skills.matched,
      matchedRoles: rol.matched,
      reasons,
    };
  }

  function compareCareerModes(jobSignals, careerModes) {
    return careerModes.map((mode) => scoreOne(jobSignals, mode));
  }

  function recommendCareerMode(jobText, careerModes) {
    const jobSignals = analyzeJob(jobText);
    const ranked = compareCareerModes(jobSignals, careerModes).sort((a, b) => b.score - a.score);
    return { recommended: ranked[0] || null, ranked };
  }

  window.AUTOFILL_UY_MATCHER = { analyzeJob, compareCareerModes, recommendCareerMode, tokenize, norm };
})();
