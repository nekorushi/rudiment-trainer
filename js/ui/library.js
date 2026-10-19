// Rudiment list for the library drawer, grouped by family.

import { $$, el } from './dom.js';

/**
 * @param {HTMLElement} root
 * @param {object[]} rudiments  parsed patterns
 * @param {string[]} families   display order of families
 * @param {(id: string) => void} onPick
 */
export function renderLibrary(root, rudiments, families, onPick) {
  root.textContent = '';
  for (const family of families) {
    const items = rudiments.filter((r) => r.family === family);
    if (!items.length) continue;
    root.append(el('div', 'lib-family', family));
    for (const r of items) {
      const b = el('button', 'r-item');
      b.type = 'button';
      b.dataset.id = r.id;
      b.append(el('span', 'r-name', r.name), el('span', 'r-stick', r.notation));
      b.addEventListener('click', () => onPick(r.id));
      root.append(b);
    }
  }
}

export function markLibrary(root, currentId) {
  $$('.r-item', root).forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === currentId)));
}
