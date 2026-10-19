// Pure, DOM-free scheduling logic for the rudiment trainer.
//
// A rudiment is written in a tiny notation, one token per grid step:
//   R / L     accented stroke, right / left hand
//   r / l     unaccented stroke (tap)
//   .         rest
//   (l)R      flam: soft grace note (left) just before the main stroke
//   (ll)R     drag: two soft grace notes before the main stroke
//   R~ - - -  buzz (press) roll: starts on R~ and is held across the "-" steps
//
// The Sequencer turns a pattern plus practice settings into a stream of
// "ticks" (one per grid step). Times are in seconds from the start of playback;
// the audio engine adds its own start time. Nothing here touches Web Audio,
// so the whole thing can be unit-tested in Node.

const TOKEN = /^(?:\(([lrLR]{1,2})\))?([RLrl.\-])(~)?$/;

/** Gap in seconds between grace notes (and between the last grace note and its main stroke). */
export function graceGap(stepDur) {
  return Math.min(0.04, Math.max(0.022, stepDur * 0.2));
}

/** Parse a rudiment spec ({ id, name, grid, steps: "R l r r ..." }) into a playable pattern. */
export function parsePattern(spec) {
  const { id, grid } = spec;
  if (!id) throw new Error('pattern needs an id');
  if (!Number.isInteger(grid) || grid < 1) throw new Error(`${id}: grid must be a positive integer`);
  const tokens = String(spec.steps).trim().split(/\s+/);
  if (tokens.length % grid !== 0) {
    throw new Error(`${id}: ${tokens.length} steps is not a whole number of beats (grid ${grid})`);
  }

  const steps = [];
  let openBuzz = -1;
  tokens.forEach((tok, i) => {
    const m = TOKEN.exec(tok);
    if (!m) throw new Error(`${id}: bad token "${tok}" at step ${i}`);
    const [, graces, core, buzz] = m;

    if (core === '.' || core === '-') {
      if (graces || buzz) throw new Error(`${id}: "${tok}" at step ${i} cannot have grace notes or ~`);
      if (core === '.') {
        steps.push({ kind: 'rest' });
        openBuzz = -1;
      } else {
        if (openBuzz < 0) throw new Error(`${id}: "-" at step ${i} has no buzz stroke to extend`);
        steps[openBuzz].span += 1;
        steps.push({ kind: 'tie' });
      }
      return;
    }

    const upper = core.toUpperCase();
    steps.push({
      kind: 'note',
      hand: upper,
      accent: core === upper,
      grace: graces ? [...graces.toUpperCase()] : [],
      buzz: Boolean(buzz),
      span: 1,
    });
    openBuzz = buzz ? steps.length - 1 : -1;
  });

  return { ...spec, notation: spec.steps, steps, grid, beats: steps.length / grid };
}

export class Sequencer {
  /**
   * @param {object} o
   * @param {object} o.pattern            parsed pattern
   * @param {number} o.bpm                tempo (the slow end for open-close-open)
   * @param {'loop'|'oco'} [o.mode]
   * @param {{high:number,cycles:number}} [o.oco]   fast end and length (in repetitions) of one open-close-open
   * @param {{mode:'off'|'time'|'reps',inc:number,every:number,target:number}} [o.ramp]
   * @param {number} [o.countIn]          beats of count-in clicks (0 = none)
   * @param {number} [o.durationSec]      stop after this long (at a repetition boundary); 0 = endless
   * @param {boolean} [o.subClick]        also click on every grid step
   */
  constructor(o) {
    this.pattern = o.pattern;
    this.pending = null;
    this.bpm = o.bpm;
    this.curBpm = o.bpm; // loop tempo, moved by the ramp
    this.mode = o.mode ?? 'loop';
    this.oco = { high: o.oco?.high ?? o.bpm, cycles: Math.max(1, o.oco?.cycles ?? 8) };
    this.ramp = {
      mode: o.ramp?.mode ?? 'off',
      inc: o.ramp?.inc ?? 5,
      every: o.ramp?.every ?? 30,
      target: o.ramp?.target ?? o.bpm,
    };
    this.subClick = Boolean(o.subClick);
    this.durationSec = o.durationSec ?? 0;

    this.countTotal = o.countIn ?? 0;
    this.countDone = 0;
    this.phase = this.countTotal > 0 ? 'count' : 'play';

    this.t = 0;
    this.playStart = 0;
    this.cycle = 0;
    this.step = 0;
    this.ended = false;
    this.minBpm = Infinity;
    this.maxBpm = 0;
    this._resetRamp();
  }

  // ---- live changes -------------------------------------------------------

  setBpm(bpm) {
    this.bpm = bpm;
    this.curBpm = bpm;
    this._resetRamp(true);
  }

  /** Switch pattern at the next repetition boundary. */
  setPattern(pattern) {
    if (pattern.id === this.pattern.id && !this.pending) return;
    this.pending = pattern;
  }

  update(o = {}) {
    if (o.bpm !== undefined && o.bpm !== this.bpm) this.setBpm(o.bpm);
    if (o.mode) this.mode = o.mode;
    if (o.oco) this.oco = { ...this.oco, ...o.oco, cycles: Math.max(1, o.oco.cycles ?? this.oco.cycles) };
    if (o.ramp) {
      this.ramp = { ...this.ramp, ...o.ramp };
      if (this.ramp.mode === 'off') this.curBpm = this.bpm;
      this._resetRamp(true);
    }
    if (o.durationSec !== undefined) this.durationSec = o.durationSec;
    if (o.subClick !== undefined) this.subClick = Boolean(o.subClick);
    if (o.pattern) this.setPattern(o.pattern);
  }

  // ---- ticking ------------------------------------------------------------

  next() {
    if (this.ended) return this._endEvent();

    if (this.phase === 'count') {
      const bpm = this.bpm;
      const idx = this.countDone;
      const ev = {
        phase: 'count',
        time: this.t,
        bpm,
        step: -1,
        cycle: -1,
        patternId: this.pattern.id,
        click: { level: idx % 4 === 0 ? 'down' : 'beat' },
        notes: [],
        countIndex: idx,
        countTotal: this.countTotal,
      };
      this.t += 60 / bpm;
      this.countDone += 1;
      if (this.countDone >= this.countTotal) {
        this.phase = 'play';
        this.playStart = this.t;
        this._resetRamp();
      }
      return ev;
    }

    if (this.step === 0) {
      if (this.cycle > 0) {
        const elapsed = this.t - this.playStart;
        if (this.durationSec > 0 && elapsed >= this.durationSec - 1e-9) {
          this.ended = true;
          return this._endEvent();
        }
        this._applyRamp(elapsed);
      }
      if (this.pending) {
        this.pattern = this.pending;
        this.pending = null;
      }
    }

    const p = this.pattern;
    const tok = p.steps[this.step];
    const bpm = this._tempo(p);
    const stepDur = 60 / (bpm * p.grid);

    let click = null;
    if (this.step % p.grid === 0) click = { level: this.step === 0 ? 'down' : 'beat' };
    else if (this.subClick) click = { level: 'sub' };

    const notes = [];
    if (tok.kind === 'note') {
      const gap = graceGap(stepDur);
      tok.grace.forEach((hand, j) => {
        notes.push({ hand, accent: false, kind: 'grace', offset: -(tok.grace.length - j) * gap, duration: 0 });
      });
      notes.push({
        hand: tok.hand,
        accent: tok.accent,
        kind: tok.buzz ? 'buzz' : 'tap',
        offset: 0,
        duration: tok.buzz ? tok.span * stepDur : 0,
      });
    }

    const ev = {
      phase: 'play',
      time: this.t,
      bpm,
      step: this.step,
      stepsPerCycle: p.steps.length,
      cycle: this.cycle,
      patternId: p.id,
      elapsed: this.t - this.playStart,
      click,
      notes,
    };

    this.minBpm = Math.min(this.minBpm, bpm);
    this.maxBpm = Math.max(this.maxBpm, bpm);
    this.t += stepDur;
    this.step += 1;
    if (this.step >= p.steps.length) {
      this.step = 0;
      this.cycle += 1;
    }
    return ev;
  }

  // ---- internals ----------------------------------------------------------

  _tempo(p) {
    if (this.mode === 'oco' && this.oco.high > this.bpm) {
      const progress = (this.cycle + this.step / p.steps.length) / this.oco.cycles;
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * (progress % 1)); // 0 -> 1 -> 0
      return this.bpm * Math.pow(this.oco.high / this.bpm, w);
    }
    return this.mode === 'loop' ? this.curBpm : this.bpm;
  }

  // `skip`: the settings changed mid-play, so the next repetition boundary must
  // not count as a finished repetition (the new tempo gets N full reps).
  _resetRamp(skip = false) {
    const elapsed = this.phase === 'play' ? this.t - this.playStart : 0;
    this.rampNextAt = elapsed + this.ramp.every;
    this.rampReps = 0;
    this.rampSkip = skip && this.phase === 'play';
  }

  _applyRamp(elapsed) {
    const r = this.ramp;
    if (r.mode === 'off' || this.mode !== 'loop') return;
    if (r.mode === 'time') {
      while (elapsed >= this.rampNextAt - 1e-9) {
        if (this.curBpm === r.target) break;
        this._bump();
        this.rampNextAt += r.every;
      }
    } else {
      if (this.rampSkip) {
        this.rampSkip = false;
        return;
      }
      this.rampReps += 1;
      if (this.rampReps >= r.every) {
        this.rampReps = 0;
        this._bump();
      }
    }
  }

  _bump() {
    const r = this.ramp;
    const inc = Math.abs(r.inc) || 1;
    if (this.curBpm < r.target) this.curBpm = Math.min(r.target, this.curBpm + inc);
    else if (this.curBpm > r.target) this.curBpm = Math.max(r.target, this.curBpm - inc);
  }

  _endEvent() {
    return {
      phase: 'end',
      time: this.t,
      elapsed: this.t - this.playStart,
      cycles: this.cycle,
      minBpm: Number.isFinite(this.minBpm) ? this.minBpm : this.bpm,
      maxBpm: this.maxBpm || this.bpm,
      patternId: this.pattern.id,
    };
  }
}
