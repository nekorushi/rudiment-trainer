// Pure notation layout: turns a parsed pattern into positioned staff symbols
// (notes, rests, beams, tuplet numbers, bar lines, sticking) that the SVG view
// draws as-is. No DOM, so rhythm spelling and geometry are tested in Node.
//
// Rhythm: a stroke lasts until the next stroke, cut at the beat line; leftover
// time inside a note is spelled as rests. Grids 1/2/4/8 are straight; 3 is an
// eighth-note triplet; 6 is split into two sixteenth triplets (or a plain
// eighth per half), or one sextuplet when a note crosses the half beat.
//
// Units are abstract (≈ CSS px at scale 1); the view sets the SVG viewBox.

export const METRICS = {
  lineHeight: 132,
  accentY: 16,     // accent marks
  tupletY: 32,     // tuplet numbers (baseline)
  stemTop: 46,     // top of normal stems = primary beam
  staffY: 88,      // the single staff line; noteheads sit on it
  stickY: 120,     // sticking letters (baseline)
  beamGap: 7,      // distance between beam levels
  beamThick: 4.5,
  headRx: 6.4,
  stemDx: 5.6,     // stem x relative to its notehead
  graceDx: 13,     // spacing between grace notes and their main note
  graceStem: 24,   // grace stem length
  stub: 8,         // length of a partial (stub) beam
  clefW: 30,       // space for the clef at the start of every line
  barPad: 14,      // space after a bar line
  endW: 18,        // space for the closing repeat sign
};

export const SUPPORTED_GRIDS = [1, 2, 3, 4, 6, 8];

const BEAMS = { 4: 0, 8: 1, 16: 2, 32: 3 };
const MAX_STRETCH = 2.2;

// ---- rhythm spelling ---------------------------------------------------------

// Note values available in a context: `steps` long -> value (4 = quarter, 8, 16, 32) and dots.
function binaryTable(g) {
  return [[1, 4, 0], [0.75, 8, 1], [0.5, 8, 0], [0.375, 16, 1], [0.25, 16, 0], [0.125, 32, 0]]
    .map(([q, value, dots]) => ({ steps: q * g, value, dots }))
    .filter((e) => Number.isInteger(e.steps));
}
const TRIPLET_8TH = [{ steps: 2, value: 4, dots: 0 }, { steps: 1, value: 8, dots: 0 }];
const TRIPLET_16TH = [{ steps: 2, value: 8, dots: 0 }, { steps: 1, value: 16, dots: 0 }];
const SEXTUPLET = [
  { steps: 4, value: 4, dots: 0 }, { steps: 3, value: 8, dots: 1 },
  { steps: 2, value: 8, dots: 0 }, { steps: 1, value: 16, dots: 0 },
];

/** Split one beat's tokens into a leading rest (if any) and one segment per stroke. */
function segments(tokens) {
  const g = tokens.length;
  const onsets = [];
  tokens.forEach((t, i) => { if (t.kind === 'note') onsets.push(i); });
  const segs = [];
  if (!onsets.length || onsets[0] > 0) segs.push({ pos: 0, len: onsets[0] ?? g, rest: true });
  onsets.forEach((p, j) => segs.push({ pos: p, len: (onsets[j + 1] ?? g) - p, rest: false }));
  return segs;
}

/**
 * In a 6-step beat: is every third of the beat either one 2-step segment or
 * two 1-step segments, with at least one 2-step segment? (All 1-step is a
 * plain sextuplet.)
 */
function isSplitTriplet(segs) {
  let whole = 0;
  for (let cell = 0; cell < 3; cell += 1) {
    const inCell = segs.filter((s) => s.pos >= cell * 2 && s.pos < cell * 2 + 2);
    if (inCell.length === 1 && inCell[0].pos === cell * 2 && inCell[0].len === 2) whole += 1;
    else if (!(inCell.length === 2 && inCell.every((s) => s.len === 1))) return false;
  }
  return whole > 0;
}

/** Greedy spelling of segments: the stroke takes the longest value that fits, rests fill the rest. */
function spell(segs, table) {
  const out = [];
  for (const seg of segs) {
    let pos = seg.pos;
    let left = seg.len;
    let rest = seg.rest;
    while (left > 0) {
      const e = table.find((x) => x.steps <= left);
      if (!e) throw new Error(`cannot spell ${left} steps`);
      out.push({ pos, len: e.steps, rest, value: e.value, dots: e.dots });
      pos += e.steps;
      left -= e.steps;
      rest = true;
    }
  }
  return out;
}

/**
 * Spell one beat. Returns items ({pos, len, rest, value, dots}, pos/len in grid
 * steps) and tuplets ({from, to, n}: item index range and the number to print).
 */
export function spellBeat(tokens) {
  const g = tokens.length;
  if (!SUPPORTED_GRIDS.includes(g)) throw new Error(`notation can't draw a grid of ${g}`);
  const segs = segments(tokens);
  if (segs.length === 1) return { items: [{ ...segs[0], value: 4, dots: 0 }], tuplets: [] };
  if (g % 3 !== 0) return { items: spell(segs, binaryTable(g)), tuplets: [] };

  if (g === 3) {
    const items = spell(segs, TRIPLET_8TH);
    return { items, tuplets: [{ from: 0, to: items.length - 1, n: 3 }] };
  }

  // g === 6
  // An eighth-note triplet with some eighths split into two sixteenths (e.g.
  // the flam drag) reads best as a plain "3" over the beat.
  if (isSplitTriplet(segs)) {
    const items = spell(segs, TRIPLET_16TH);
    return { items, tuplets: [{ from: 0, to: items.length - 1, n: 3 }] };
  }
  if (segs.some((s) => s.pos < 3 && s.pos + s.len > 3)) {
    const items = spell(segs, SEXTUPLET);
    return { items, tuplets: [{ from: 0, to: items.length - 1, n: 6 }] };
  }
  const items = [];
  const tuplets = [];
  for (const half of [segs.filter((s) => s.pos < 3), segs.filter((s) => s.pos >= 3)]) {
    const from = items.length;
    if (half.length === 1) {
      items.push({ ...half[0], value: 8, dots: 0 });
    } else {
      items.push(...spell(half, TRIPLET_16TH));
      tuplets.push({ from, to: items.length - 1, n: 3 });
    }
  }
  if (tuplets.length === 2) return { items, tuplets: [{ from: 0, to: items.length - 1, n: 6 }] };
  return { items, tuplets };
}

// ---- layout ------------------------------------------------------------------

function itemWidth(item, g) {
  return 16 + 26 * Math.sqrt(item.len / g);
}

function graceSpace(n) {
  return n ? n * METRICS.graceDx + 6 : 0;
}

/** Beats per bar for a pattern (spec `bar`, else 2 for an even beat count, else one bar). */
export function beatsPerBar(pattern) {
  if (pattern.bar) return pattern.bar;
  return pattern.beats % 2 === 0 ? 2 : pattern.beats;
}

/**
 * Lay out a parsed pattern.
 * @param {object} pattern  from parsePattern
 * @param {{width?: number}} [opts]  available width in units
 */
export function layoutPattern(pattern, opts = {}) {
  const M = METRICS;
  const g = pattern.grid;
  const width = opts.width ?? 720;

  // 1. Spell every beat and give each item its natural width.
  const beats = [];
  for (let b = 0; b < pattern.beats; b += 1) {
    const tokens = pattern.steps.slice(b * g, (b + 1) * g);
    const { items, tuplets } = spellBeat(tokens);
    for (const it of items) {
      it.step = b * g + it.pos;
      it.token = it.rest ? null : pattern.steps[it.step];
      it.lead = it.rest ? 0 : graceSpace(it.token.grace.length);
      it.w = it.lead + itemWidth(it, g);
    }
    beats.push({ items, tuplets, w: items.reduce((s, it) => s + it.w, 0) });
  }

  // 2. Group beats into bars, and bars (or beats of an over-wide bar) into lines.
  const per = beatsPerBar(pattern);
  const room = width - M.clefW - M.endW;
  const chunks = []; // { beats: [index], endsBar }
  for (let b0 = 0; b0 < beats.length; b0 += per) {
    const idx = [];
    for (let b = b0; b < Math.min(b0 + per, beats.length); b += 1) idx.push(b);
    const w = idx.reduce((s, b) => s + beats[b].w, 0);
    if (w <= room) chunks.push({ beats: idx, endsBar: true });
    else idx.forEach((b, i) => chunks.push({ beats: [b], endsBar: i === idx.length - 1 }));
  }
  const chunkW = (c) => c.beats.reduce((s, b) => s + beats[b].w, 0) + (c.endsBar ? M.barPad : 0);
  const lineChunks = [];
  let cur = [];
  let curW = 0;
  for (const c of chunks) {
    const w = chunkW(c);
    if (cur.length && curW + w > room) {
      lineChunks.push(cur);
      cur = [];
      curW = 0;
    }
    cur.push(c);
    curW += w;
  }
  if (cur.length) lineChunks.push(cur);

  // 3. Position everything, stretching each line toward the full width.
  const steps = new Array(pattern.steps.length);
  const lines = lineChunks.map((chunksOfLine, li) => {
    const isLast = li === lineChunks.length - 1;
    const natural = chunksOfLine.reduce((s, c) => s + chunkW(c), 0);
    const stretch = Math.min(MAX_STRETCH, room / natural);
    const line = {
      y: li * M.lineHeight,
      x0: 0,
      x1: 0,
      notes: [],
      rests: [],
      beams: [],
      tuplets: [],
      bars: [],
    };
    let x = M.clefW;
    const placed = []; // items on this line in order, for step interpolation
    chunksOfLine.forEach((c, ci) => {
      for (const b of c.beats) {
        const beat = beats[b];
        for (const it of beat.items) {
          it.x = x + it.lead + M.headRx + 4;
          x += it.w * stretch;
          placed.push(it);
        }
        layoutBeat(beat, line);
      }
      const lastChunk = ci === chunksOfLine.length - 1;
      if (c.endsBar && !(lastChunk && isLast)) {
        line.bars.push({ x: x + M.barPad * 0.35, kind: 'single' });
        x += M.barPad;
      }
    });
    line.x1 = isLast ? x + M.endW * 0.6 : x;
    if (isLast) line.bars.push({ x: line.x1, kind: 'end' });

    placed.forEach((it, i) => {
      const nextX = placed[i + 1]?.x ?? line.x1;
      for (let k = 0; k < it.len; k += 1) {
        steps[it.step + k] = { line: li, x: it.x + ((nextX - it.x) * k) / it.len };
      }
    });
    return line;
  });

  return {
    width: Math.max(...lines.map((l) => l.x1 + 2)), // content width; may exceed opts.width if one beat cannot fit
    height: lines.length * M.lineHeight,
    metrics: M,
    lines,
    steps,
  };
}

/** Notes, rests, beams and tuplet numbers of one beat (items already have x). */
function layoutBeat(beat, line) {
  const M = METRICS;
  const group = [];
  const flush = () => {
    if (group.length === 1) {
      group[0].flags = BEAMS[group[0].value];
    } else if (group.length > 1) {
      for (const n of group) n.beams = BEAMS[n.value];
      addBeams(group, line);
    }
    group.length = 0;
  };

  for (const it of beat.items) {
    if (it.rest) {
      flush();
      line.rests.push({ step: it.step, x: it.x, value: it.value, dots: it.dots });
      continue;
    }
    const t = it.token;
    const n = Object.assign(it, {
      stemX: it.x + M.stemDx,
      hand: t.hand,
      accent: t.accent,
      buzz: t.buzz,
      grace: t.grace.map((hand, k) => ({ hand, x: it.x - M.graceDx * (t.grace.length - k) - 2 })),
      beams: 0,
      flags: 0,
    });
    line.notes.push(n);
    if (BEAMS[n.value] > 0) group.push(n);
    else flush();
  }
  flush();

  for (const tp of beat.tuplets) {
    const a = beat.items[tp.from];
    const b = beat.items[tp.to];
    line.tuplets.push({ x: (a.x + b.x) / 2 + M.stemDx, n: tp.n });
  }
}

function addBeams(group, line) {
  const M = METRICS;
  line.beams.push({ x1: group[0].stemX, x2: group[group.length - 1].stemX, level: 0 });
  const deepest = Math.max(...group.map((n) => n.beams));
  for (let level = 1; level < deepest; level += 1) {
    let i = 0;
    while (i < group.length) {
      if (group[i].beams <= level) { i += 1; continue; }
      let j = i;
      while (j + 1 < group.length && group[j + 1].beams > level) j += 1;
      if (j > i) {
        line.beams.push({ x1: group[i].stemX, x2: group[j].stemX, level });
      } else {
        const x = group[i].stemX;
        const left = i === group.length - 1;
        line.beams.push({ x1: left ? x - M.stub : x, x2: left ? x : x + M.stub, level });
      }
      i = j + 1;
    }
  }
}
