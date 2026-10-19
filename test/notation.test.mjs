import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePattern } from '../js/sequencer.js';
import { RUDIMENTS, getRudiment } from '../js/rudiments.js';
import { spellBeat, layoutPattern, beatsPerBar, METRICS } from '../js/notation.js';

const beat = (grid, steps) => parsePattern({ id: 't', grid, steps }).steps;
// Compact view of a spelled beat: "16 16 8r" etc. ("." = dotted, "r" = rest)
const rhythm = ({ items }) => items.map((i) => `${i.value}${i.dots ? '.' : ''}${i.rest ? 'r' : ''}`).join(' ');

test('straight beats: notes last until the next stroke', () => {
  assert.equal(rhythm(spellBeat(beat(4, 'r l r l'))), '16 16 16 16');
  assert.equal(rhythm(spellBeat(beat(4, 'R . . .'))), '4');
  assert.equal(rhythm(spellBeat(beat(4, 'R . L .'))), '8 8');
  assert.equal(rhythm(spellBeat(beat(4, 'R . . r'))), '8. 16');
  assert.equal(rhythm(spellBeat(beat(4, 'r r L .'))), '16 16 8');
  assert.equal(rhythm(spellBeat(beat(8, 'r r l l R . . .'))), '32 32 32 32 8');
  assert.equal(rhythm(spellBeat(beat(1, 'R'))), '4');
  assert.equal(rhythm(spellBeat(beat(2, 'r L'))), '8 8');
});

test('leading empty steps become rests', () => {
  assert.equal(rhythm(spellBeat(beat(4, '. r l r'))), '16r 16 16 16');
  assert.equal(rhythm(spellBeat(beat(4, '. . R .'))), '8r 8');
});

test('triplet beats get a 3 or 6 and the right values', () => {
  const acc = spellBeat(beat(3, 'R l r'));
  assert.equal(rhythm(acc), '8 8 8');
  assert.deepEqual(acc.tuplets, [{ from: 0, to: 2, n: 3 }]);
  assert.deepEqual(spellBeat(beat(3, 'R . .')).tuplets, [], 'one stroke per beat is a plain quarter');

  const six = spellBeat(beat(6, 'R l r l r r'));
  assert.equal(rhythm(six), '16 16 16 16 16 16');
  assert.deepEqual(six.tuplets, [{ from: 0, to: 5, n: 6 }]);

  // ratamacue: sixteenth triplet, then a plain eighth
  const rata = spellBeat(beat(6, 'r l r L . .'));
  assert.equal(rhythm(rata), '16 16 16 8');
  assert.deepEqual(rata.tuplets, [{ from: 0, to: 2, n: 3 }]);

  // two plain eighths, no tuplet
  const eighths = spellBeat(beat(6, 'r . . r . .'));
  assert.equal(rhythm(eighths), '8 8');
  assert.deepEqual(eighths.tuplets, []);

  // a stroke crossing the half beat makes the whole beat a sextuplet
  const cross = spellBeat(beat(6, 'r l . . r l'));
  assert.equal(rhythm(cross), '16 8. 16 16');
  assert.deepEqual(cross.tuplets, [{ from: 0, to: 3, n: 6 }]);
});

test('unsupported grids are refused', () => {
  assert.throws(() => spellBeat(beat(5, 'r l r l r')), /grid of 5/);
});

test('beats per bar: spec value, else 2 for even beat counts, else one bar', () => {
  assert.equal(beatsPerBar(getRudiment('single-paradiddle')), 2);
  assert.equal(beatsPerBar(getRudiment('ten-stroke-roll')), 3);
  assert.equal(beatsPerBar(parsePattern({ id: 'x', grid: 4, steps: 'r l r l r l r l r l r l' })), 3);
});

test('beams: one group per beat, secondary beams and stubs where needed', () => {
  const lay = layoutPattern(parsePattern({ id: 'x', grid: 4, steps: 'R . . r r r L .' }), { width: 2000 });
  const [line] = lay.lines;
  // beat 1: dotted eighth + sixteenth -> primary beam + a stub pointing left
  // beat 2: 16 16 8 -> primary beam + secondary over the two sixteenths
  const primary = line.beams.filter((b) => b.level === 0);
  const secondary = line.beams.filter((b) => b.level === 1);
  assert.equal(primary.length, 2);
  assert.equal(secondary.length, 2);
  const [n0, n1, n2, n3] = line.notes;
  assert.deepEqual(secondary[0], { x1: n1.stemX - METRICS.stub, x2: n1.stemX, level: 1 });
  assert.deepEqual(secondary[1], { x1: n2.stemX, x2: n3.stemX, level: 1 });
  assert.equal(n0.beams, 1);
});

test('a lone flagged note gets flags instead of a beam; quarters get neither', () => {
  const lay = layoutPattern(parsePattern({ id: 'x', grid: 2, steps: '. r R .' }), { width: 2000 });
  const [rest] = lay.lines[0].rests;
  const [eighth, quarter] = lay.lines[0].notes;
  assert.equal(rest.value, 8);
  assert.equal(eighth.flags, 1);
  assert.equal(eighth.beams, 0);
  assert.equal(quarter.flags, 0);
  assert.equal(lay.lines[0].beams.length, 0);
});

test('grace notes sit to the left of their stroke and keep their hands', () => {
  const lay = layoutPattern(getRudiment('double-drag'), { width: 2000 });
  const first = lay.lines[0].notes[0];
  assert.deepEqual(first.grace.map((g) => g.hand), ['L', 'L']);
  assert.ok(first.grace[0].x < first.grace[1].x && first.grace[1].x < first.x);
  assert.ok(first.grace[0].x > 0);
});

for (const r of RUDIMENTS) {
  test(`${r.id}: every step has a position and lines fit`, () => {
    for (const width of [380, 720, 1100]) {
      const lay = layoutPattern(r, { width });
      assert.equal(lay.steps.length, r.steps.length);
      lay.steps.forEach((p, i) => {
        assert.ok(p, `step ${i} placed`);
        assert.ok(Number.isFinite(p.x));
      });
      // positions move right within a line and lines go in order
      for (let i = 1; i < lay.steps.length; i += 1) {
        const a = lay.steps[i - 1];
        const b = lay.steps[i];
        assert.ok(b.line > a.line || (b.line === a.line && b.x > a.x), `step ${i} after step ${i - 1}`);
      }
      // every stroke is drawn exactly once, at its step's position
      const notes = lay.lines.flatMap((l, li) => l.notes.map((n) => ({ ...n, li })));
      const strokes = r.steps.map((s, i) => (s.kind === 'note' ? i : -1)).filter((i) => i >= 0);
      assert.deepEqual(notes.map((n) => n.step), strokes);
      for (const n of notes) {
        assert.equal(lay.steps[n.step].x, n.x);
        assert.equal(lay.steps[n.step].line, n.li);
      }
      for (const l of lay.lines) assert.ok(l.x1 <= width, `line ends at ${l.x1}, width ${width}`);
      // the last line closes with the repeat sign
      assert.equal(lay.lines.at(-1).bars.at(-1).kind, 'end');
    }
  });
}
