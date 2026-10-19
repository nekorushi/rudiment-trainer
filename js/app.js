import { RUDIMENTS, FAMILIES, getRudiment } from './rudiments.js';
import { DrumEngine } from './audio.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---- settings (persisted on the device) ------------------------------------

const STORE_KEY = 'rudiments.settings.v1';
const DEFAULTS = {
  rudiment: 'single-stroke-roll',
  bpm: 80,
  mode: 'loop',
  ocoHigh: 140,
  ocoCycles: 8,
  countIn: 4,
  sessionMin: 0,
  rampMode: 'off',
  rampInc: 4,
  rampEverySec: 30,
  rampEveryReps: 4,
  rampTarget: 120,
  clickOn: true,
  drumOn: true,
  subClick: false,
  clickLevel: 0.7,
  drumLevel: 0.85,
};
const BPM_MIN = 30;
const BPM_MAX = 260;

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch { /* private mode etc. */ }
}
const S = load();

const STEPPERS = {
  ocoHigh: { min: 40, max: 320, step: 5, fmt: (v) => `${v} BPM` },
  ocoCycles: { min: 2, max: 32, step: 1, fmt: (v) => `${v} reps` },
  rampInc: { min: 1, max: 20, step: 1, fmt: (v) => `${v} BPM` },
  rampEverySec: { min: 10, max: 300, step: 10, fmt: (v) => `${v} sec` },
  rampEveryReps: { min: 1, max: 32, step: 1, fmt: (v) => `${v} reps` },
  rampTarget: { min: 30, max: 320, step: 5, fmt: (v) => `${v} BPM` },
  sessionMin: { min: 0, max: 60, step: 1, fmt: (v) => (v ? `${v} min` : 'Off') },
};

// ---- engine ------------------------------------------------------------------

const engine = new DrumEngine();
let playing = false;
let starting = false;
let raf = 0;
let wakeLock = null;
let shownPatternId = null;
let cells = [];
let lastEvent = null;
let lastSecond = -1;

engine.onInterrupted = () => stopPlay('Audio was interrupted');

function seqOptions() {
  return {
    pattern: getRudiment(S.rudiment),
    bpm: S.bpm,
    mode: S.mode,
    oco: { high: S.ocoHigh, cycles: S.ocoCycles },
    ramp: {
      mode: S.mode === 'loop' ? S.rampMode : 'off',
      inc: S.rampInc,
      every: S.rampMode === 'reps' ? S.rampEveryReps : S.rampEverySec,
      target: S.rampTarget,
    },
    countIn: S.countIn,
    durationSec: S.sessionMin * 60,
    subClick: S.subClick,
  };
}

function pushLive() {
  engine.setLevels({ click: S.clickLevel, drum: S.drumLevel });
  engine.setMuted({ click: !S.clickOn, drum: !S.drumOn });
  if (playing) {
    const { countIn, ...rest } = seqOptions(); // count-in only applies at the start
    engine.update(rest);
  }
}

// ---- state changes -----------------------------------------------------------

function set(key, value) {
  S[key] = value;
  if (key === 'bpm' && S.mode === 'oco' && S.ocoHigh <= S.bpm) {
    S.ocoHigh = Math.min(STEPPERS.ocoHigh.max, S.bpm + 20);
  }
  save();
  render();
  pushLive();
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

// ---- rendering ---------------------------------------------------------------

function render() {
  const r = getRudiment(S.rudiment);
  $('#r-name').textContent = r.name;
  $('#r-family').textContent = r.family ?? '';
  // While playing, the sticking row follows the engine (a new rudiment starts at the next rep).
  if (playing ? shownPatternId === null : shownPatternId !== r.id) renderSticking(r);

  $('#bpm-value').textContent = S.bpm;
  $('#bpm-range').value = S.bpm;

  $$('[data-seg]').forEach((seg) => {
    const key = seg.dataset.seg;
    $$('button', seg).forEach((b) => b.setAttribute('aria-checked', String(String(S[key]) === b.dataset.v)));
  });
  $$('[data-stepper]').forEach((el) => {
    const key = el.dataset.stepper;
    $('output', el).textContent = STEPPERS[key].fmt(S[key]);
  });
  $$('[data-toggle]').forEach((el) => { el.checked = Boolean(S[el.dataset.toggle]); });
  $$('[data-slider]').forEach((el) => { el.value = S[el.dataset.slider]; });

  const oco = S.mode === 'oco';
  const rampOn = !oco && S.rampMode !== 'off';
  $$('.only-oco').forEach((el) => { el.hidden = !oco; });
  $$('.only-ramp').forEach((el) => { el.hidden = !rampOn; });
  $$('.only-time').forEach((el) => { el.hidden = !(rampOn && S.rampMode === 'time'); });
  $$('.only-reps').forEach((el) => { el.hidden = !(rampOn && S.rampMode === 'reps'); });
  $('#ramp-card').classList.toggle('dim', oco);
  $$('#ramp-card [data-seg] button').forEach((b) => { b.disabled = oco; });

  $('#mode-hint').textContent = oco
    ? `Sweeps from ${S.bpm} up to ${S.ocoHigh} BPM and back down, once every ${S.ocoCycles} repetitions.`
    : 'Repeats the rudiment at a steady tempo.';
  $('#ramp-hint').textContent = oco
    ? 'The ramp only applies in Loop mode.'
    : rampOn
      ? `Starts at ${S.bpm} BPM and ${S.rampTarget >= S.bpm ? 'speeds up' : 'slows down'} toward ${S.rampTarget} BPM.`
      : '';
}

function renderSticking(r) {
  shownPatternId = r.id;
  const root = $('#sticking');
  root.textContent = '';
  cells = [];
  let beatEl = null;
  let cellsEl = null;
  r.steps.forEach((s, i) => {
    if (i % r.grid === 0) {
      beatEl = document.createElement('div');
      beatEl.className = 'beat';
      const no = document.createElement('div');
      no.className = 'beat-no';
      no.textContent = String(i / r.grid + 1);
      cellsEl = document.createElement('div');
      cellsEl.className = 'beat-cells';
      beatEl.append(no, cellsEl);
      root.append(beatEl);
    }
    const c = document.createElement('div');
    c.className = 'cell';
    if (s.kind === 'note') {
      c.classList.add(s.hand, s.accent ? 'accent' : 'tap');
      if (s.grace.length) {
        const g = document.createElement('span');
        g.className = `grace ${s.grace[0]}`;
        g.textContent = s.grace.join('');
        c.append(g);
      }
      c.append(document.createTextNode(s.accent ? s.hand : s.hand.toLowerCase()));
      if (s.buzz) {
        const z = document.createElement('span');
        z.className = 'buzz-mark';
        z.textContent = '≈';
        c.append(z);
      }
    } else if (s.kind === 'tie') {
      c.classList.add('tie');
      c.textContent = '–';
    } else {
      c.classList.add('rest');
      c.textContent = '·';
    }
    cellsEl.append(c);
    cells.push(c);
  });
  lastHighlight = -1;
}

let lastHighlight = -1;
function highlight(step) {
  if (lastHighlight >= 0) cells[lastHighlight]?.classList.remove('on');
  cells[step]?.classList.add('on');
  lastHighlight = step;
}

function renderLibrary() {
  const root = $('#library');
  root.textContent = '';
  for (const family of FAMILIES) {
    const items = RUDIMENTS.filter((r) => r.family === family);
    if (!items.length) continue;
    const h = document.createElement('div');
    h.className = 'lib-family';
    h.textContent = family;
    root.append(h);
    for (const r of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'r-item';
      b.dataset.id = r.id;
      b.innerHTML = '<span class="r-name"></span><span class="r-stick"></span>';
      $('.r-name', b).textContent = r.name;
      $('.r-stick', b).textContent = r.notation;
      b.addEventListener('click', () => {
        set('rudiment', r.id);
        markLibrary();
        closeDrawer();
      });
      root.append(b);
    }
  }
  markLibrary();
}
function markLibrary() {
  $$('.r-item').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === S.rudiment)));
}

// ---- drawer ------------------------------------------------------------------

function openDrawer() {
  $('#drawer').classList.add('open');
  $('#drawer').removeAttribute('inert');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('open');
  $('#open-library').setAttribute('aria-expanded', 'true');
}
function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('inert', '');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#scrim').classList.remove('open');
  $('#open-library').setAttribute('aria-expanded', 'false');
}

// ---- playback ----------------------------------------------------------------

async function togglePlay() {
  if (starting) return;
  if (playing) {
    stopPlay('Stopped');
    return;
  }
  starting = true;
  try {
    engine.setLevels({ click: S.clickLevel, drum: S.drumLevel });
    engine.setMuted({ click: !S.clickOn, drum: !S.drumOn });
    await engine.start(seqOptions());
    playing = true;
    shownPatternId = null; // force the sticking row to follow the engine
    lastSecond = -1;
    lastEvent = null;
    setPlayUi(true);
    $('#live').textContent = S.countIn ? 'Count-in…' : 'Playing';
    requestWake();
    raf = requestAnimationFrame(frame);
  } catch (err) {
    $('#live').textContent = `Couldn't start audio: ${err.message}`;
  } finally {
    starting = false;
  }
}

function stopPlay(message) {
  const wasPlaying = playing;
  playing = false;
  cancelAnimationFrame(raf);
  engine.stop();
  releaseWake();
  setPlayUi(false);
  if (lastHighlight >= 0) cells[lastHighlight]?.classList.remove('on');
  lastHighlight = -1;
  if (wasPlaying) $('#live').textContent = message ?? 'Stopped';
  render();
}

function setPlayUi(on) {
  const btn = $('#play');
  btn.setAttribute('aria-pressed', String(on));
  btn.textContent = on ? 'Stop' : 'Start';
}

function frame() {
  if (!playing) return;
  for (const ev of engine.pollVisual()) handleEvent(ev);
  if (playing) raf = requestAnimationFrame(frame);
}

function handleEvent(ev) {
  if (ev.phase === 'end') {
    finishSession(ev);
    return;
  }
  if (ev.click && ev.click.level !== 'sub') pulse();
  if (ev.phase === 'count') {
    $('#live').textContent = `Count-in  ${ev.countIndex + 1} / ${ev.countTotal}`;
    return;
  }
  lastEvent = ev;
  if (ev.patternId !== shownPatternId) renderSticking(getRudiment(ev.patternId));
  highlight(ev.step);

  const sec = Math.floor(ev.elapsed);
  if (sec !== lastSecond || ev.step === 0) {
    lastSecond = sec;
    const parts = [`${Math.round(ev.bpm)} BPM`, `Rep ${ev.cycle + 1}`, fmtTime(ev.elapsed)];
    if (S.sessionMin > 0) parts.push(`${fmtTime(Math.max(0, S.sessionMin * 60 - ev.elapsed))} left`);
    $('#live').textContent = parts.join('  ·  ');
  }
}

function finishSession(ev) {
  const lo = Math.round(ev.minBpm);
  const hi = Math.round(ev.maxBpm);
  const range = lo === hi ? `${lo} BPM` : `${lo}–${hi} BPM`;
  stopPlay(`Session complete  ·  ${fmtTime(ev.elapsed)}  ·  ${range}  ·  ${ev.cycles} reps`);
}

function pulse() {
  const el = $('#bpm-value');
  if (!el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.animate([{ transform: 'scale(1.045)' }, { transform: 'scale(1)' }], { duration: 140, easing: 'ease-out' });
}

function fmtTime(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function requestWake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch { /* not allowed or unsupported */ }
}
function releaseWake() {
  try { wakeLock?.release(); } catch { /* ignore */ }
  wakeLock = null;
}

// ---- input wiring ------------------------------------------------------------

/** Call fn on press, then keep repeating while the button is held. */
function holdRepeat(button, fn) {
  let delay = 0;
  let interval = 0;
  const clear = () => { clearTimeout(delay); clearInterval(interval); };
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    clear();
    fn();
    delay = setTimeout(() => { interval = setInterval(fn, 80); }, 420);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => button.addEventListener(t, clear));
  button.addEventListener('contextmenu', (e) => e.preventDefault());
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  });
}

function nudgeBpm(d) { set('bpm', clamp(S.bpm + d, BPM_MIN, BPM_MAX)); }

function wire() {
  holdRepeat($('#bpm-down'), () => nudgeBpm(-1));
  holdRepeat($('#bpm-up'), () => nudgeBpm(1));
  $('#bpm-range').addEventListener('input', (e) => set('bpm', clamp(Number(e.target.value), BPM_MIN, BPM_MAX)));
  $('#play').addEventListener('click', togglePlay);

  $$('[data-seg]').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      const raw = b.dataset.v;
      set(seg.dataset.seg, raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw);
    });
  });

  $$('[data-stepper]').forEach((el) => {
    const key = el.dataset.stepper;
    const cfg = STEPPERS[key];
    el.innerHTML = '<button type="button" aria-label="Decrease">−</button><output></output><button type="button" aria-label="Increase">+</button>';
    const [down, , up] = el.children;
    const bump = (d) => set(key, clamp(S[key] + d * cfg.step, cfg.min, cfg.max));
    holdRepeat(down, () => bump(-1));
    holdRepeat(up, () => bump(1));
  });

  $$('[data-toggle]').forEach((el) => el.addEventListener('change', () => set(el.dataset.toggle, el.checked)));
  $$('[data-slider]').forEach((el) => el.addEventListener('input', () => set(el.dataset.slider, Number(el.value))));

  $('#open-library').addEventListener('click', openDrawer);
  $('#close-library').addEventListener('click', closeDrawer);
  $('#scrim').addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, button, select, textarea')) return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); nudgeBpm(e.shiftKey ? 5 : 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); nudgeBpm(e.shiftKey ? -5 : -1); }
    else if (e.key === 'Escape') closeDrawer();
  });

  // Timers and audio get throttled in the background; stop cleanly instead of drifting.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && playing) stopPlay('Paused while the app was in the background');
  });
}

// ---- boot --------------------------------------------------------------------

if (!RUDIMENTS.some((r) => r.id === S.rudiment)) S.rudiment = RUDIMENTS[0].id;
S.bpm = clamp(Number(S.bpm) || DEFAULTS.bpm, BPM_MIN, BPM_MAX);
renderLibrary();
wire();
render();
engine.setLevels({ click: S.clickLevel, drum: S.drumLevel });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}
