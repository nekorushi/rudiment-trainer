// Rudiment list for the library drawer: one collapsible section per
// collection, grouped by family inside.

import { $$, el } from './dom.js';

/**
 * @param {HTMLElement} root
 * @param {object[]} groups  from groupRudiments()
 * @param {(id: string) => void} onPick
 */
export function renderLibrary(root, groups, onPick) {
  root.textContent = '';
  for (const { collection, families } of groups) {
    const section = el('details', 'lib-collection');
    section.open = true;
    const summary = el('summary');
    summary.append(el('span', 'lib-collection-name', collection.name), el('span', 'lib-collection-title', collection.title));
    section.append(summary);
    for (const family of families) {
      section.append(el('div', 'lib-family', family.name));
      for (const r of family.rudiments) {
        const b = el('button', 'r-item');
        b.type = 'button';
        b.dataset.id = r.id;
        b.append(el('span', 'r-name', r.name), el('span', 'r-stick', r.notation));
        b.addEventListener('click', () => onPick(r.id));
        section.append(b);
      }
    }
    root.append(section);
  }
}

export function markLibrary(root, currentId) {
  $$('.r-item', root).forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === currentId)));
}
