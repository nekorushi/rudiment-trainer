import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, BPM_MAX, sanitizeSettings, applySetting, toSeqOptions } from '../js/settings.js';
import { RUDIMENTS } from '../js/rudiments.js';

const IDS = RUDIMENTS.map((r) => r.id);

test('missing or garbage settings fall back to defaults', () => {
  assert.deepEqual(sanitizeSettings(null, IDS), DEFAULTS);
  assert.deepEqual(sanitizeSettings('nope', IDS), DEFAULTS);
  assert.deepEqual(sanitizeSettings([], IDS), DEFAULTS);
});

test('valid stored values are kept, unknown keys dropped', () => {
  const s = sanitizeSettings({ bpm: 96, mode: 'oco', subClick: true, rudiment: IDS[1], junk: 1 }, IDS);
  assert.equal(s.bpm, 96);
  assert.equal(s.mode, 'oco');
  assert.equal(s.subClick, true);
  assert.equal(s.rudiment, IDS[1]);
  assert.equal('junk' in s, false);
});

test('wrong types, bad choices and out-of-range numbers are repaired', () => {
  const s = sanitizeSettings({
    bpm: 999, mode: 'disco', countIn: 3, rampMode: 7, ocoCycles: NaN,
    clickLevel: -2, rampInc: '5', sessionMin: 600, rudiment: 'no-such-rudiment',
  }, IDS);
  assert.equal(s.bpm, BPM_MAX);
  assert.equal(s.mode, DEFAULTS.mode);
  assert.equal(s.countIn, DEFAULTS.countIn);
  assert.equal(s.rampMode, DEFAULTS.rampMode);
  assert.equal(s.ocoCycles, DEFAULTS.ocoCycles);
  assert.equal(s.clickLevel, 0);
  assert.equal(s.rampInc, DEFAULTS.rampInc);
  assert.equal(s.sessionMin, 60);
  assert.equal(s.rudiment, IDS[0]);
});

test('raising the tempo in open-close-open keeps the top tempo above it', () => {
  const s = { ...DEFAULTS, mode: 'oco', ocoHigh: 120 };
  applySetting(s, 'bpm', 130);
  assert.equal(s.ocoHigh, 150);
  applySetting(s, 'bpm', 100);
  assert.equal(s.ocoHigh, 150, 'lowering the tempo leaves the top alone');
});

test('sequencer options follow mode and ramp settings', () => {
  const pattern = RUDIMENTS[0];
  const loop = toSeqOptions({ ...DEFAULTS, rampMode: 'reps', rampEveryReps: 6, sessionMin: 2 }, pattern);
  assert.equal(loop.pattern, pattern);
  assert.deepEqual(loop.ramp, { mode: 'reps', inc: DEFAULTS.rampInc, every: 6, target: DEFAULTS.rampTarget });
  assert.equal(loop.durationSec, 120);

  const oco = toSeqOptions({ ...DEFAULTS, mode: 'oco', rampMode: 'time' }, pattern);
  assert.equal(oco.ramp.mode, 'off', 'the ramp only runs in loop mode');
  assert.deepEqual(oco.oco, { high: DEFAULTS.ocoHigh, cycles: DEFAULTS.ocoCycles });
});
