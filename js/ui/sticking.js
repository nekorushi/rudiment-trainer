// Sticking row: one cell per grid step, grouped by beat, with the playing step lit.

import { el } from './dom.js';

export class StickingView {
  constructor(root) {
    this.root = root;
    this.cells = [];
    this.patternId = null;
    this.lit = -1;
  }

  show(pattern) {
    this.patternId = pattern.id;
    this.root.textContent = '';
    this.cells = [];
    this.lit = -1;
    let cellsEl = null;
    pattern.steps.forEach((s, i) => {
      if (i % pattern.grid === 0) {
        const beatEl = el('div', 'beat');
        cellsEl = el('div', 'beat-cells');
        beatEl.append(el('div', 'beat-no', String(i / pattern.grid + 1)), cellsEl);
        this.root.append(beatEl);
      }
      const c = cell(s);
      cellsEl.append(c);
      this.cells.push(c);
    });
  }

  highlight(step) {
    if (this.lit >= 0) this.cells[this.lit]?.classList.remove('on');
    this.cells[step]?.classList.add('on');
    this.lit = step;
  }

  clearHighlight() {
    this.highlight(-1);
  }
}

function cell(s) {
  const c = el('div', 'cell');
  if (s.kind === 'note') {
    c.classList.add(s.hand, s.accent ? 'accent' : 'tap');
    if (s.grace.length) c.append(el('span', `grace ${s.grace[0]}`, s.grace.join('')));
    c.append(document.createTextNode(s.accent ? s.hand : s.hand.toLowerCase()));
    if (s.buzz) c.append(el('span', 'buzz-mark', '≈'));
  } else if (s.kind === 'tie') {
    c.classList.add('tie');
    c.textContent = '–';
  } else {
    c.classList.add('rest');
    c.textContent = '·';
  }
  return c;
}
