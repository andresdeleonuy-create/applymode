// Migra el shape viejo (general/perfiles) al nuevo (userProfile/careerModes)
// sin borrar nada. Idempotente: si ya migró, no vuelve a tocar storage.
// Todo el proyecto lee/escribe career modes a través de este archivo.
(function () {
  async function migrate() {
    const stored = await chrome.storage.local.get(['general', 'perfiles', 'userProfile', 'careerModes']);
    const updates = {};

    if (!stored.userProfile && stored.general) {
      updates.userProfile = stored.general;
    }
    if (!stored.careerModes && stored.perfiles && stored.perfiles.length) {
      updates.careerModes = stored.perfiles.map((p) => ({
        id: p.id,
        modeName: p.nombrePerfil || 'Sin nombre',
        targetRoles: p.tituloProfesional ? [p.tituloProfesional] : [],
        descripcionProfesional: p.descripcionProfesional || '',
        experiencia: p.experiencia || '',
        skills: [],
        cartaPresentacion: p.cartaPresentacion || '',
        pretensionSalarial: p.pretensionSalarial || '',
        portfolioUrl: '',
        idiomaPreferido: 'es',
      }));
    }

    if (Object.keys(updates).length) {
      await chrome.storage.local.set(updates);
    }
    return {
      userProfile: updates.userProfile || stored.userProfile || stored.general || {},
      careerModes: updates.careerModes || stored.careerModes || stored.perfiles || [],
    };
  }

  async function getState() {
    return migrate();
  }

  async function saveState({ userProfile, careerModes }) {
    await chrome.storage.local.set({ userProfile, careerModes });
  }

  window.AUTOFILL_UY_STORAGE = { getState, saveState, migrate };
})();
