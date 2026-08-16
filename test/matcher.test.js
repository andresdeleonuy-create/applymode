// node test/matcher.test.js  (correr desde la carpeta test/ con jsdom instalado)
// Casos: los dos ejemplos worked del brief de ApplyMode.
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, '../lib/matcher.js'), 'utf8'));
const { recommendCareerMode } = window.AUTOFILL_UY_MATCHER;

const careerModes = [
  {
    id: 'video', modeName: 'Video Editor',
    targetRoles: ['Video Editor'],
    descripcionProfesional: 'Editor de video especializado en anuncios cortos.',
    experiencia: 'Edición con Premiere Pro y CapCut, producción de reels, uso de IA generativa de video.',
    skills: ['Premiere Pro', 'CapCut', 'Video Ads', 'Reels', 'Generative AI'],
  },
  {
    id: 'cm', modeName: 'Community Manager',
    targetRoles: ['Community Manager', 'Social Media Manager'],
    descripcionProfesional: 'Gestión de redes sociales y estrategia de contenidos.',
    experiencia: 'Manejo de calendarios de contenido, copywriting y analítica de redes.',
    skills: ['Social Media', 'Content Strategy', 'Copywriting', 'Community Management', 'Analytics'],
  },
];

function assert(cond, msg) {
  if (!cond) throw new Error('FALLÓ: ' + msg);
  console.log('OK:', msg);
}

// Ejemplo 1 del brief
const job1 = {
  title: 'Social Media Content Creator',
  text: 'We are looking for a Social Media Content Creator responsible for Instagram, TikTok, Reels, content calendars and community engagement.',
};
const r1 = recommendCareerMode(job1, careerModes);
assert(r1.recommended.modeName === 'Community Manager', 'Ejemplo 1 recomienda Community Manager');
assert(r1.recommended.score > r1.ranked[1].score, 'Ejemplo 1: hay margen claro entre el 1° y el 2°');

// Ejemplo 2 del brief
const job2 = {
  title: 'Video Editor',
  text: 'Video Editor — Create short-form ads for Meta and TikTok. Experience with Premiere and AI tools preferred.',
};
const r2 = recommendCareerMode(job2, careerModes);
assert(r2.recommended.modeName === 'Video Editor', 'Ejemplo 2 recomienda Video Editor');
assert(r2.ranked.find((r) => r.modeName === 'Community Manager').score === 0, 'Ejemplo 2: Community Manager no matchea nada');

console.log('\nmatcher.test.js: todo OK');
