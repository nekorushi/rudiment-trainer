import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePattern, Sequencer, graceGap } from '../js/sequencer.js';
import { RUDIMENTS } from '../js/rudiments.js';
import { DrumEngine } from '../js/audio.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const singles = parsePattern({ id: 's', name: 's', grid: 4, steps: 'R L R L' }); // 1 beat per rep
const paradiddle = parsePattern({ id: 'p', name: 'p', grid: 4, steps: 'R l r r L r l l' });

function collect(seq, until) {
  const out = [];
  for (let i = 0; i < 100000; i += 1) {
    const ev = seq.next();
    out.push(ev);
    if (ev.phase === 'end' || ev.time > until) break;
  }
  return out;
}

// ---- parsing ---------------------------------------------------------------

test('parses accents, taps and hands', () => {
  const p = paradiddle.steps;
  assert.deepEqual(p.map((s) => s.hand + (s.accent ? '!' : '')), ['R!', 'L', 'R', 'R', 'L!', 'R', 'L', 'L']);
  assert.equal(paradiddle.beats, 2);
});

test('parses flams, drags and buzz rolls', () => {
  const p = parsePattern({ id: 'x', grid: 2, steps: '(l)R (ll)L R~ - . .' });
  assert.deepEqual(p.steps[0].grace, ['L']);
  assert.deepEqual(p.steps[1].grace, ['L', 'L']);
  assert.equal(p.steps[2].buzz, true);
  assert.equal(p.steps[2].span, 2);
  assert.equal(p.steps[3].kind, 'tie');
  assert.equal(p.steps[4].kind, 'rest');
});

test('rejects bad patterns', () => {
  assert.throws(() => parsePattern({ id: 'a', grid: 4, steps: 'R L R' }), /whole number of beats/);
  assert.throws(() => parsePattern({ id: 'a', grid: 2, steps: 'R X' }), /bad token/);
  assert.throws(() => parsePattern({ id: 'a', grid: 2, steps: 'R -' }), /no buzz/);
  assert.throws(() => parsePattern({ id: 'a', grid: 2, steps: '(l). R' }), /bad token|cannot/);
});

test('every library rudiment parses and uses whole beats', () => {
  assert.ok(RUDIMENTS.length >= 1);
  for (const r of RUDIMENTS) assert.equal(r.steps.length % r.grid, 0, r.id);
});

// ---- loop timing -----------------------------------------------------------

test('loop mode ticks evenly at the set tempo', () => {
  const seq = new Sequencer({ pattern: singles, bpm: 120 });
  const evs = collect(seq, 1);
  near(evs[0].time, 0);
  near(evs[1].time, 0.125); // 120 bpm, 16ths
  near(evs[4].time, 0.5);
  assert.equal(evs[0].click.level, 'down');
  assert.equal(evs[1].click, null);
  assert.equal(evs[4].click.level, 'down'); // 1-beat cycle: every cycle starts on the beat
});

test('beats inside a longer pattern click as normal beats', () => {
  const seq = new Sequencer({ pattern: paradiddle, bpm: 60 });
  const evs = collect(seq, 3);
  assert.equal(evs[0].click.level, 'down');
  assert.equal(evs[4].click.level, 'beat');
  assert.equal(evs[8].click.level, 'down');
});

test('sub-click adds clicks on every step', () => {
  const seq = new Sequencer({ pattern: singles, bpm: 100, subClick: true });
  const evs = collect(seq, 0.5);
  assert.equal(evs[1].click.level, 'sub');
});

test('count-in comes first and the pattern starts after it', () => {
  const seq = new Sequencer({ pattern: singles, bpm: 120, countIn: 4 });
  const evs = collect(seq, 3);
  const counts = evs.filter((e) => e.phase === 'count');
  assert.equal(counts.length, 4);
  near(counts[1].time, 0.5);
  assert.equal(counts[0].click.level, 'down');
  assert.equal(counts[1].click.level, 'beat');
  const first = evs.find((e) => e.phase === 'play');
  near(first.time, 2.0);
  near(first.elapsed, 0);
});

// ---- grace notes and buzz --------------------------------------------------

test('grace notes land just before the main stroke and stay inside the look-ahead', () => {
  const p = parsePattern({ id: 'd', grid: 2, steps: '(ll)R .' });
  for (const bpm of [30, 60, 120, 200, 300]) {
    const ev = new Sequencer({ pattern: p, bpm }).next();
    assert.equal(ev.notes.length, 3);
    assert.deepEqual(ev.notes.map((n) => n.kind), ['grace', 'grace', 'tap']);
    assert.ok(ev.notes[0].offset < ev.notes[1].offset && ev.notes[1].offset < 0);
    assert.ok(-ev.notes[0].offset <= 0.09 + 1e-9, `offset too early at ${bpm} bpm`);
  }
  near(graceGap(10), 0.04);
  near(graceGap(0.01), 0.022);
});

test('buzz roll lasts for its whole span', () => {
  const p = parsePattern({ id: 'b', grid: 4, steps: 'R~ - - - L~ - - -' });
  const ev = new Sequencer({ pattern: p, bpm: 60 }).next();
  assert.equal(ev.notes[0].kind, 'buzz');
  near(ev.notes[0].duration, 1.0); // four 16ths at 60 bpm
});

// ---- open-close-open -------------------------------------------------------

test('open-close-open sweeps slow -> fast -> slow and repeats', () => {
  const seq = new Sequencer({ pattern: singles, bpm: 60, mode: 'oco', oco: { high: 120, cycles: 4 } });
  const evs = [];
  while (evs.length < 4 * 4 * 2) evs.push(seq.next()); // two full sweeps
  near(evs[0].bpm, 60);
  near(evs[8].bpm, 120, 1e-6); // halfway through the sweep (cycle 2, step 0)
  near(evs[16].bpm, 60, 1e-6); // sweep restarts
  const max = Math.max(...evs.map((e) => e.bpm));
  assert.ok(max <= 120 + 1e-9);
  // tempo rises monotonically on the way up
  for (let i = 1; i <= 8; i += 1) assert.ok(evs[i].bpm >= evs[i - 1].bpm - 1e-9);
});

// ---- tempo ramp ------------------------------------------------------------

test('timer ramp raises tempo every N seconds until the target', () => {
  const seq = new Sequencer({
    pattern: singles, bpm: 120,
    ramp: { mode: 'time', inc: 10, every: 2, target: 140 },
  });
  const evs = collect(seq, 12);
  const bpms = [...new Set(evs.map((e) => e.bpm))];
  assert.deepEqual(bpms, [120, 130, 140]);
  const first130 = evs.find((e) => e.bpm === 130);
  assert.ok(first130.elapsed >= 2 - 1e-9 && first130.elapsed < 2.6);
});

test('timer ramp can also slow down', () => {
  const seq = new Sequencer({
    pattern: singles, bpm: 100,
    ramp: { mode: 'time', inc: 10, every: 1, target: 80 },
  });
  const bpms = [...new Set(collect(seq, 6).map((e) => e.bpm))];
  assert.deepEqual(bpms, [100, 90, 80]);
});

test('rep ramp raises tempo every N repetitions', () => {
  const seq = new Sequencer({
    pattern: singles, bpm: 100,
    ramp: { mode: 'reps', inc: 5, every: 2, target: 110 },
  });
  const perCycle = {};
  for (let i = 0; i < 4 * 8; i += 1) {
    const ev = seq.next();
    perCycle[ev.cycle] = ev.bpm;
  }
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6, 7].map((c) => perCycle[c]),
    [100, 100, 105, 105, 110, 110, 110, 110],
  );
});

test('changing the tempo mid-play restarts the ramp from the new tempo', () => {
  const seq = new Sequencer({
    pattern: singles, bpm: 100,
    ramp: { mode: 'reps', inc: 10, every: 1, target: 200 },
  });
  for (let i = 0; i < 8; i += 1) seq.next(); // 2 reps -> now at 110/120
  seq.update({ bpm: 90 });
  const ev = seq.next();
  near(ev.bpm, 90);
});

// ---- timed sessions and pattern changes -------------------------------------

test('timed session ends at a repetition boundary and reports stats', () => {
  const seq = new Sequencer({ pattern: singles, bpm: 120, durationSec: 3 });
  const evs = collect(seq, 100);
  const end = evs[evs.length - 1];
  assert.equal(end.phase, 'end');
  near(end.time, 3.0, 1e-6);
  assert.equal(end.cycles, 6);
  near(end.minBpm, 120);
  near(end.maxBpm, 120);
  assert.equal(seq.next().phase, 'end'); // stays ended
});

test('a pattern change waits for the next repetition boundary', () => {
  const seq = new Sequencer({ pattern: paradiddle, bpm: 100 });
  for (let i = 0; i < 3; i += 1) seq.next();
  seq.update({ pattern: singles });
  const ids = [];
  for (let i = 0; i < 8; i += 1) ids.push(seq.next().patternId);
  assert.deepEqual(ids, ['p', 'p', 'p', 'p', 'p', 's', 's', 's']);
});

// ---- audio engine smoke test with a fake AudioContext ------------------------

function fakeParam() {
  return {
    value: 0,
    setValueAtTime() {},
    exponentialRampToValueAtTime() {},
    linearRampToValueAtTime() {},
    setTargetAtTime() {},
    cancelScheduledValues() {},
  };
}

function fakeNode(extra = {}) {
  return {
    connect(n) { return n; },
    disconnect() {},
    start() { this.started = true; },
    stop() {},
    ...extra,
  };
}

function makeFakeContext(stats) {
  return class FakeContext {
    constructor() {
      this.currentTime = 0;
      this.state = 'running';
      this.sampleRate = 44100;
      this.destination = fakeNode();
    }
    addEventListener() {}
    resume() { return Promise.resolve(); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    createGain() { stats.gains += 1; return fakeNode({ gain: fakeParam() }); }
    createOscillator() { stats.oscs += 1; return fakeNode({ frequency: fakeParam(), type: '' }); }
    createBufferSource() { stats.sources += 1; return fakeNode({}); }
    createBiquadFilter() { return fakeNode({ frequency: fakeParam(), gain: fakeParam(), Q: fakeParam(), type: '' }); }
    createDynamicsCompressor() {
      return fakeNode({ threshold: fakeParam(), knee: fakeParam(), ratio: fakeParam(), attack: fakeParam(), release: fakeParam() });
    }
  };
}

test('engine schedules clicks and strokes, delivers visual events and ends a timed session', async () => {
  const stats = { gains: 0, oscs: 0, sources: 0 };
  const FakeContext = makeFakeContext(stats);
  const engine = new DrumEngine({ AudioContextClass: FakeContext, autoPump: false });
  await engine.start({ pattern: paradiddle, bpm: 120, countIn: 4, durationSec: 2 });

  const seen = [];
  for (let i = 0; i < 400 && !seen.some((e) => e.phase === 'end'); i += 1) {
    engine.ctx.currentTime += 0.02;
    engine._pump();
    seen.push(...engine.pollVisual());
  }
  assert.equal(seen.filter((e) => e.phase === 'count').length, 4);
  assert.ok(seen.filter((e) => e.phase === 'play').length >= 8);
  assert.equal(seen[seen.length - 1].phase, 'end');
  assert.ok(stats.oscs > 20 && stats.sources > 8, 'sounds were created');

  // visual events arrive in time order
  for (let i = 1; i < seen.length; i += 1) assert.ok(seen[i].when >= seen[i - 1].when);

  engine.stop();
  assert.equal(engine.playing, false);
});

test('engine handles buzz rolls, live updates, muting and restart', async () => {
  const stats = { gains: 0, oscs: 0, sources: 0 };
  const FakeContext = makeFakeContext(stats);
  const engine = new DrumEngine({ AudioContextClass: FakeContext, autoPump: false });
  const buzz = parsePattern({ id: 'b', grid: 4, steps: 'R~ - - - L~ - - -' });
  await engine.start({ pattern: buzz, bpm: 90 });
  engine.setMuted({ drum: true });
  engine.setLevels({ click: 0.5 });
  engine.update({ bpm: 100, subClick: true, pattern: paradiddle });
  for (let i = 0; i < 100; i += 1) {
    engine.ctx.currentTime += 0.02;
    engine._pump();
    engine.pollVisual();
  }
  engine.stop();
  await engine.start({ pattern: paradiddle, bpm: 80 });
  assert.equal(engine.playing, true);
  engine.stop();
});
