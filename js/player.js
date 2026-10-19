// Playback controller: owns the DrumEngine and the browser-side plumbing around
// it (animation-frame polling, screen wake lock, stopping when the app is hidden).
// The UI hears about playback only through `onEvent` (each engine visual event,
// on its audio time) and `onStop`.

import { DrumEngine } from './audio.js';

export class Player {
  /**
   * @param {object} o
   * @param {(ev: object) => void} o.onEvent     a visual event is due (see engine.pollVisual)
   * @param {(message: string) => void} o.onStop playback stopped, with a status message
   * @param {DrumEngine} [o.engine]
   */
  constructor({ onEvent, onStop, engine = new DrumEngine() }) {
    this.engine = engine;
    this.onEvent = onEvent;
    this.onStop = onStop;
    this.playing = false;
    this.starting = false;
    this.raf = 0;
    this.wakeLock = null;
    this._frame = this._frame.bind(this);

    engine.onInterrupted = () => this.stop('Audio was interrupted');
    // Timers and audio get throttled in the background; stop cleanly instead of drifting.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.playing) this.stop('Paused while the app was in the background');
    });
  }

  setSound({ clickLevel, drumLevel, clickOn, drumOn }) {
    this.engine.setLevels({ click: clickLevel, drum: drumLevel });
    this.engine.setMuted({ click: !clickOn, drum: !drumOn });
  }

  /** Start playing. Call from a user gesture (iOS audio unlock). Throws if audio can't start. */
  async start(seqOptions) {
    if (this.starting || this.playing) return;
    this.starting = true;
    try {
      await this.engine.start(seqOptions);
      this.playing = true;
      this._requestWake();
      this.raf = requestAnimationFrame(this._frame);
    } finally {
      this.starting = false;
    }
  }

  stop(message = 'Stopped') {
    if (!this.playing) return;
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.engine.stop();
    this._releaseWake();
    this.onStop(message);
  }

  /** Apply changed settings to the running sequence (count-in only applies at the start). */
  update(seqOptions) {
    if (!this.playing) return;
    const { countIn, ...rest } = seqOptions;
    this.engine.update(rest);
  }

  _frame() {
    if (!this.playing) return;
    for (const ev of this.engine.pollVisual()) {
      this.onEvent(ev);
      if (!this.playing) return; // the handler may have stopped us (e.g. session end)
    }
    this.raf = requestAnimationFrame(this._frame);
  }

  async _requestWake() {
    try {
      if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* not allowed or unsupported */ }
  }

  _releaseWake() {
    try { this.wakeLock?.release(); } catch { /* ignore */ }
    this.wakeLock = null;
  }
}
