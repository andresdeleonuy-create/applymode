document.getElementById('printBtn').addEventListener('click', () => window.print());

function el(tag, props, children) {
  const node = document.createElement(tag);
  Object.assign(node, props || {});
  (children || []).forEach((c) => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return node;
}

async function render() {
  const { cvPreviewData } = await chrome.storage.local.get(['cvPreviewData']);
  const content = document.getElementById('content');
  content.innerHTML = '';

  if (!cvPreviewData) {
    content.appendChild(el('p', { id: 'empty', textContent: 'No hay datos para generar el CV. Volvé a Opciones e intentá de nuevo.' }));
    return;
  }

  const d = cvPreviewData;
  const nombreCompleto = [d.nombre, d.apellido].filter(Boolean).join(' ') || '(sin nombre)';

  content.appendChild(el('h1', { textContent: nombreCompleto }));
  if (d.modeName || (d.targetRoles || []).length) {
    content.appendChild(el('p', { className: 'rol', textContent: d.modeName || d.targetRoles[0] }));
  }

  const contactoParts = [d.email, d.telefono, [d.ciudad, d.departamento, d.pais].filter(Boolean).join(', '), d.linkedin, d.portfolio].filter(Boolean);
  const contacto = el('div', { className: 'contacto' });
  contactoParts.forEach((c) => contacto.appendChild(el('span', { textContent: c })));
  content.appendChild(contacto);

  if (d.descripcionProfesional) {
    content.appendChild(el('h2', { textContent: 'Perfil profesional' }));
    content.appendChild(el('p', { textContent: d.descripcionProfesional }));
  }

  if (d.experiencia) {
    content.appendChild(el('h2', { textContent: 'Experiencia' }));
    content.appendChild(el('p', { textContent: d.experiencia }));
  }

  if ((d.skills || []).length) {
    content.appendChild(el('h2', { textContent: 'Skills' }));
    const skillsWrap = el('div', { className: 'skills' });
    d.skills.forEach((s) => skillsWrap.appendChild(el('span', { className: 'skill', textContent: s })));
    content.appendChild(skillsWrap);
  }
}

render();
