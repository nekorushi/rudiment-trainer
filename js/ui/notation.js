// SVG staff view. Draws what js/notation.js laid out and moves a playhead to
// the playing step (from engine events). Same interface as StickingView.

import { layoutPattern } from '../notation.js';

const NS = 'http://www.w3.org/2000/svg';
const SCALE = 1.25; // CSS px per layout unit on roomy screens
const MIN_SCALE = 0.85;

function svg(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? +v.toFixed(2) : v);
  parent?.append(node);
  return node;
}

export class NotationView {
  constructor(root) {
    this.root = root;
    this.pattern = null;
    this.patternId = null;
    this.lay = null;
    this.byStep = new Map(); // step -> elements to light
    this.lit = [];
    this.playhead = null;
    this._width = 0;
    new ResizeObserver(() => {
      const w = this.root.clientWidth;
      if (this.pattern && Math.abs(w - this._width) > 4) this.show(this.pattern);
    }).observe(root);
  }

  show(pattern) {
    this.pattern = pattern;
    this.patternId = pattern.id;
    this._width = this.root.clientWidth;
    const cs = getComputedStyle(this.root);
    const inner = this._width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const avail = Math.max(240, inner || 720);
    let scale = SCALE;
    let lay = layoutPattern(pattern, { width: avail / scale });
    if (lay.lines.length > 1 && scale > MIN_SCALE) {
      // Prefer one line: shrink a little if that is enough.
      const tight = layoutPattern(pattern, { width: avail / MIN_SCALE });
      if (tight.lines.length < lay.lines.length) {
        lay = tight;
        scale = MIN_SCALE;
      }
    }
    this.lay = lay;
    this._draw(lay, scale);
  }

  highlight(step) {
    for (const el of this.lit) el.classList.remove('on');
    this.lit = this.byStep.get(step) ?? [];
    for (const el of this.lit) el.classList.add('on');
    const pos = this.lay?.steps[step];
    if (!pos) {
      this.playhead?.setAttribute('visibility', 'hidden');
      return;
    }
    const M = this.lay.metrics;
    this.playhead.setAttribute('visibility', 'visible');
    this.playhead.setAttribute('transform', `translate(${pos.x.toFixed(2)} ${pos.line * M.lineHeight})`);
  }

  clearHighlight() {
    this.highlight(-1);
  }

  // ---- drawing ---------------------------------------------------------------

  _draw(lay, scale) {
    const M = lay.metrics;
    this.root.textContent = '';
    this.byStep = new Map();
    this.lit = [];
    const root = svg('svg', {
      viewBox: `0 0 ${lay.width} ${lay.height}`,
      width: lay.width * scale,
      height: lay.height * scale,
      class: 'staff',
      'aria-hidden': 'true',
    });
    this.root.append(root);

    // Playhead sits under the notes.
    this.playhead = svg('rect', {
      class: 'playhead', x: -13, y: M.tupletY - 18, width: 26, height: M.stickY - M.tupletY + 28, rx: 9,
      visibility: 'hidden',
    }, root);

    lay.lines.forEach((line) => {
      const g = svg('g', { transform: `translate(0 ${line.y})` }, root);
      this._staff(g, line, M);
      for (const n of line.notes) this._note(g, n, M);
      for (const r of line.rests) this._rest(g, r, M);
      for (const b of line.beams) {
        const y = M.stemTop + b.level * M.beamGap;
        svg('rect', { class: 'beam', x: b.x1 - 0.6, y, width: b.x2 - b.x1 + 1.2, height: M.beamThick }, g);
      }
      for (const t of line.tuplets) {
        svg('text', { class: 'tuplet', x: t.x, y: M.tupletY, 'text-anchor': 'middle' }, g).textContent = String(t.n);
      }
    });
  }

  _light(step, el) {
    if (!this.byStep.has(step)) this.byStep.set(step, []);
    this.byStep.get(step).push(el);
  }

  _staff(g, line, M) {
    const y = M.staffY;
    svg('line', { class: 'staff-line', x1: 2, y1: y, x2: line.x1, y2: y }, g);
    // percussion clef: two short thick bars
    svg('rect', { class: 'clef', x: 8, y: y - 10, width: 3.2, height: 20 }, g);
    svg('rect', { class: 'clef', x: 14, y: y - 10, width: 3.2, height: 20 }, g);
    for (const b of line.bars) {
      if (b.kind === 'end') {
        // closing repeat: two dots, thin line, thick line
        svg('circle', { class: 'bar', cx: b.x - 10, cy: y - 7, r: 2 }, g);
        svg('circle', { class: 'bar', cx: b.x - 10, cy: y + 7, r: 2 }, g);
        svg('rect', { class: 'bar', x: b.x - 6, y: y - 16, width: 1.4, height: 32 }, g);
        svg('rect', { class: 'bar', x: b.x - 3.5, y: y - 16, width: 4, height: 32 }, g);
      } else {
        svg('rect', { class: 'bar', x: b.x - 0.7, y: y - 16, width: 1.4, height: 32 }, g);
      }
    }
  }

  _note(g, n, M) {
    const y = M.staffY;
    const el = svg('g', { class: `note ${n.hand}${n.accent ? ' accent' : ''}` }, g);
    this._light(n.step, el);

    for (const gr of n.grace) {
      svg('ellipse', {
        class: 'head grace', cx: gr.x, cy: y, rx: M.headRx * 0.62, ry: M.headRx * 0.45,
        transform: `rotate(-20 ${gr.x.toFixed(2)} ${y})`,
      }, el);
      svg('line', { class: 'stem', x1: gr.x + 3.4, y1: y - 1, x2: gr.x + 3.4, y2: y - M.graceStem }, el);
      svg('text', { class: `stick small ${gr.hand}`, x: gr.x, y: M.stickY - 2, 'text-anchor': 'middle' }, el)
        .textContent = gr.hand;
    }
    if (n.grace.length === 1) {
      const gx = n.grace[0].x + 3.4;
      const top = y - M.graceStem;
      svg('path', { class: 'flag', d: `M${gx} ${top} q 6 5 5 12` }, el);
      svg('line', { class: 'stem', x1: gx - 4, y1: top + 13, x2: gx + 5, y2: top + 4 }, el); // flam slash
    } else if (n.grace.length > 1) {
      const x1 = n.grace[0].x + 3.4;
      const x2 = n.grace.at(-1).x + 3.4;
      for (let k = 0; k < 2; k += 1) {
        svg('rect', { class: 'beam', x: x1 - 0.5, y: y - M.graceStem + k * 4.5, width: x2 - x1 + 1, height: 2.6 }, el);
      }
    }

    svg('ellipse', {
      class: 'head', cx: n.x, cy: y, rx: M.headRx, ry: M.headRx * 0.72,
      transform: `rotate(-20 ${n.x.toFixed(2)} ${y})`,
    }, el);
    svg('line', { class: 'stem', x1: n.stemX, y1: y - 1.5, x2: n.stemX, y2: M.stemTop }, el);
    for (let f = 0; f < n.flags; f += 1) {
      const fy = M.stemTop + f * M.beamGap;
      svg('path', { class: 'flag', d: `M${n.stemX} ${fy} c 2 6 11 8 8 18 c 1 -7 -4 -10 -8 -12` }, el);
    }
    if (n.dots) svg('circle', { class: 'dot', cx: n.x + 11, cy: y - 4, r: 1.9 }, el);
    if (n.buzz) {
      const zy = (y + M.stemTop) / 2;
      svg('path', { class: 'stem', d: `M${n.stemX - 5} ${zy - 4} h10 l-10 8 h10` }, el);
    }
    if (n.accent) {
      svg('path', { class: 'accent-mark', d: `M${n.x - 5} ${M.accentY - 4} L${n.x + 6} ${M.accentY} L${n.x - 5} ${M.accentY + 4}` }, el);
    }
    svg('text', { class: `stick ${n.hand}`, x: n.x, y: M.stickY, 'text-anchor': 'middle' }, el).textContent = n.hand;
  }

  _rest(g, r, M) {
    const y = M.staffY;
    const x = r.x;
    const el = svg('g', { class: 'rest' }, g);
    this._light(r.step, el);
    if (r.value === 4) {
      svg('path', {
        class: 'rest-q',
        d: `M${x - 2} ${y - 13} l6 7 l-5 6 l6 7 c-4 -2 -8 0 -4 6 c-6 -3 -5 -10 1 -8 l-5 -6 l5 -6 z`,
      }, el);
    } else {
      const count = Math.log2(r.value) - 2; // 8 -> 1, 16 -> 2, 32 -> 3
      const top = y - 8;
      svg('line', { class: 'rest-stem', x1: x + 4, y1: top - (count - 1) * 3, x2: x - 1, y2: y + 9 }, el);
      for (let k = 0; k < count; k += 1) {
        const ky = top + k * 6 - (count - 1) * 3;
        const kx = x + 4 - k * 1.6;
        svg('circle', { class: 'rest-dot', cx: kx - 5.5, cy: ky + 1, r: 2.2 }, el);
        svg('path', { class: 'rest-stem', d: `M${kx - 5.5} ${ky + 2.5} q 3 1.5 5.5 -2` }, el);
      }
    }
    if (r.dots) svg('circle', { class: 'dot', cx: x + 9, cy: y - 4, r: 1.9 }, el);
  }
}
