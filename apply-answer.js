// Se inyecta cuando el chat ya decidió qué poner en uno o más campos
// marcados con data-autofilluy-idx (puestos ahí por content-script.js en la
// misma pestaña, en la corrida anterior). Lee el mapeo idx -> valor desde
// storage y lo aplica.
(function () {
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

  function highlight(el) {
    el.classList.add('__autofillUY_filled');
    setTimeout(() => el.classList.remove('__autofillUY_filled'), 1200);
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function norm(str) {
    return (str || '')
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
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

  function fingerprintOf(el) {
    return `${el.tagName}|${el.name || ''}|${el.id || ''}`;
  }

  async function run() {
    const { chatAnswers } = await chrome.storage.local.get(['chatAnswers']);
    ensureStyle();
    const appliedIdx = [];
    const mismatchedIdx = [];
    (chatAnswers || []).forEach(({ idx, value, fingerprint }) => {
      const el = document.querySelector(`[data-autofilluy-idx="${idx}"]`);
      if (!el || !value) return;
      // La página pudo haber re-renderizado el formulario (apps React) y
      // que el índice haya quedado apuntando a OTRO campo. Antes de
      // escribir nada, confirmamos que sigue siendo el mismo campo que
      // detectamos — si no, abortamos: mejor no completar nada a
      // completar el campo equivocado.
      if (fingerprint && fingerprintOf(el) !== fingerprint) {
        mismatchedIdx.push(idx);
        return;
      }
      const ok = el.tagName === 'SELECT' ? setSelectValue(el, value) : (setNativeValue(el, value), true);
      if (ok) {
        highlight(el);
        appliedIdx.push(idx);
      }
    });
    chrome.runtime.sendMessage({ type: 'autofillUY:applyAnswers', appliedIdx, mismatchedIdx });
  }

  run();
})();
