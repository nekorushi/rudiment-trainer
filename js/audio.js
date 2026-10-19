// Web Audio engine: a look-ahead scheduler that pulls ticks from the Sequencer
// and turns them into synthesized click and snare sounds.
//
// Timing is done on the audio clock (not setTimeout), so tempo stays tight even
// if the page is busy drawing. Visual events are queued with their audio time
// and the UI polls them once per animation frame.

import { Sequencer } from './sequencer.js';

const LOOKAHEAD = 0.15; // seconds of audio scheduled ahead of "now"
const PUMP_MS = 25;     // how often the scheduler wakes up
const START_DELAY = 0.12;

export class DrumEngine {
  /**
   * @param {object} [opts]
   * @param {Function} [opts.AudioContextClass]  inject a fake in tests
   * @param {boolean} [opts.autoPump=true]       set false in tests to pump manually
   */
  constructor(opts = {}) {
    this.AudioContextClass = opts.AudioContextClass ?? null;
    this.autoPump = opts.autoPump ?? true;
    this.ctx = null;
    this.seq = null;
    this.playing = false;
    this.peek = null;
    this.visual = [];
    this.levels = { click: 0.7, drum: 0.85 };
    this.muted = { click: false, drum: false };
    this.onInterrupted = null;
    this.worker = null;
    this.timer = null;
  }

  // ---- lifecycle ----------------------------------------------------------

  /** Create/resume the AudioContext. Must be called from a user gesture on iOS. */
  async unlock() {
    if (!this.ctx) {
      const AC =
        this.AudioContextClass ??
        globalThis.AudioContext ??
        globalThis.webkitAudioContext;
      if (!AC) throw new Error('Web Audio is not supported in this browser');
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.noise = makeNoise(this.ctx);
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -12;
      this.comp.knee.value = 12;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.12;
      this.comp.connect(this.ctx.destination);
      this.ctx.addEventListener?.('statechange', () => {
        if (this.playing && this.ctx.state !== 'running') {
          this.stop();
          this.onInterrupted?.();
        }
      });
    }
    // Make sure iOS plays through the speaker even with the silent switch on.
    try {
      if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = 'playback';
    } catch { /* not supported */ }

    if (this.ctx.state !== 'running') await this.ctx.resume();

    // Play one silent sample: some iOS versions only fully unlock this way.
    const silent = this.ctx.createBuffer(1, 1, 22050);
    const src = this.ctx.createBufferSource();
    src.buffer = silent;
    src.connect(this.ctx.destination);
    src.start(0);
  }

  async start(seqOptions) {
    await this.unlock();
    this._silence();

    this.out = this.ctx.createGain();
    this.out.connect(this.comp);
    this.clickBus = this.ctx.createGain();
    this.drumBus = this.ctx.createGain();
    this.clickBus.connect(this.out);
    this.drumBus.connect(this.out);
    this._applyLevels(true);

    this.seq = new Sequencer(seqOptions);
    this.t0 = this.ctx.currentTime + START_DELAY;
    this.peek = null;
    this.visual.length = 0;
    this.playing = true;
    this._pump();
    if (this.autoPump) this._startTimer();
  }

  stop() {
    this.playing = false;
    this._stopTimer();
    this._silence();
    this.visual.length = 0;
    this.peek = null;
    this.seq = null;
  }

  /** Apply a partial settings change to the running sequence. */
  update(o) {
    this.seq?.update(o);
  }

  setLevels(levels) {
    Object.assign(this.levels, levels);
    this._applyLevels();
  }

  setMuted(muted) {
    Object.assign(this.muted, muted);
    this._applyLevels();
  }

  /** Visual events whose audio time has arrived (call from requestAnimationFrame). */
  pollVisual() {
    if (!this.ctx || !this.visual.length) return [];
    const latency = this.ctx.outputLatency || this.ctx.baseLatency || 0;
    const now = this.ctx.currentTime - latency;
    const due = [];
    while (this.visual.length && this.visual[0].when <= now) due.push(this.visual.shift());
    return due;
  }

  // ---- scheduling ---------------------------------------------------------

  _pump() {
    if (!this.playing || !this.seq) return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    for (let guard = 0; guard < 256; guard += 1) {
      if (!this.peek) this.peek = this.seq.next();
      const ev = this.peek;
      const when = this.t0 + ev.time;
      if (when > horizon) break;
      this.peek = null;
      this._schedule(ev, when);
      if (ev.phase === 'end') {
        this._stopTimer(); // nothing left to schedule; the UI stops us when the end event is due
        break;
      }
    }
  }

  _schedule(ev, when) {
    this.visual.push({ ...ev, when });
    if (ev.phase === 'end') return;
    if (ev.click) this._click(when, ev.click.level);
    const floor = this.ctx.currentTime;
    for (const n of ev.notes) {
      const t = Math.max(when + n.offset, floor);
      if (n.kind === 'buzz') this._buzz(t, n);
      else this._stroke(t, n);
    }
  }

  _startTimer() {
    this._stopTimer();
    try {
      const src = `let id;onmessage=e=>{clearInterval(id);if(e.data==='start')id=setInterval(()=>postMessage(0),${PUMP_MS})}`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
      this.worker.onmessage = () => this._pump();
      this.worker.postMessage('start');
    } catch {
      this.worker = null;
      this.timer = setInterval(() => this._pump(), PUMP_MS);
    }
  }

  _stopTimer() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Fade out and detach the current output so already-scheduled sounds are cut. */
  _silence() {
    if (!this.out) return;
    const out = this.out;
    const now = this.ctx.currentTime;
    out.gain.cancelScheduledValues(now);
    out.gain.setTargetAtTime(0, now, 0.01);
    setTimeout(() => {
      try { out.disconnect(); } catch { /* already gone */ }
    }, 200);
    this.out = null;
  }

  _applyLevels(immediate = false) {
    if (!this.clickBus) return;
    const now = this.ctx.currentTime;
    const click = this.muted.click ? 0 : this.levels.click;
    const drum = this.muted.drum ? 0 : this.levels.drum;
    if (immediate) {
      this.clickBus.gain.value = click;
      this.drumBus.gain.value = drum;
    } else {
      this.clickBus.gain.setTargetAtTime(click, now, 0.015);
      this.drumBus.gain.setTargetAtTime(drum, now, 0.015);
    }
  }

  // ---- voices -------------------------------------------------------------

  _click(t, level) {
    const ctx = this.ctx;
    const freq = level === 'down' ? 1650 : level === 'beat' ? 1150 : 780;
    const peak = level === 'down' ? 1 : level === 'beat' ? 0.7 : 0.32;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g);
    g.connect(this.clickBus);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  /** A single stick stroke: accent, tap or grace note. */
  _stroke(t, n) {
    const jitter = 0.94 + Math.random() * 0.06;
    if (n.kind === 'grace') this._hit(t, 0.3 * jitter, { decay: 0.07, hp: 1500, bodyHz: 190, body: 0.45 });
    else if (n.accent) this._hit(t, 1.0 * jitter, { decay: 0.17, hp: 1900, bodyHz: 175, body: 0.6 });
    else this._hit(t, 0.5 * jitter, { decay: 0.12, hp: 1500, bodyHz: 185, body: 0.5 });
  }

  /** Press/buzz roll: a dense run of tiny hits that decay a little. */
  _buzz(t, n) {
    const spacing = 0.03;
    const count = Math.min(240, Math.max(1, Math.floor(n.duration / spacing)));
    const base = n.accent ? 0.85 : 0.5;
    for (let i = 0; i < count; i += 1) {
      const v = base * (i === 0 ? 1 : 0.5 + Math.random() * 0.12);
      this._hit(t + i * spacing, v, { decay: 0.06, hp: 1700, bodyHz: 180, body: i === 0 ? 0.5 : 0.18 });
    }
  }

  _hit(t, vel, o) {
    const ctx = this.ctx;

    // snare wires: high-passed noise with a bright bump
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = o.hp;
    const bump = ctx.createBiquadFilter();
    bump.type = 'peaking';
    bump.frequency.value = 4200;
    bump.gain.value = 6;
    bump.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(vel, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + o.decay);
    src.connect(hp);
    hp.connect(bump);
    bump.connect(ng);
    ng.connect(this.drumBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.decay + 0.02);

    // shell/body: a quick pitch-dropping tone
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(o.bodyHz * 1.5, t);
    osc.frequency.exponentialRampToValueAtTime(o.bodyHz, t + 0.04);
    const og = ctx.createGain();
    og.gain.setValueAtTime(vel * o.body, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(og);
    og.connect(this.drumBus);
    osc.start(t);
    osc.stop(t + 0.12);
  }
}

function makeNoise(ctx) {
  const length = Math.floor(ctx.sampleRate * 0.8);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}
