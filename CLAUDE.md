# Rudiment Trainer: project notes for Claude Code

Personal drum-rudiments practice PWA for the owner's iPad. Installed via Safari "Add to Home Screen" from GitHub Pages, never published to the App Store. Vanilla HTML/CSS/JS, ES modules, **no build step and no runtime dependencies**. Keep it that way.

## Decisions already made (from the brainstorm)

- **Purpose:** practice tool first (metronome + play-along), not a reference book.
- **Content:** the 26 essential (NARD) rudiments. A starter set of 6 is in `js/rudiments.js` and must be replaced.
- **Display per rudiment:** sticking letters (R/L), standard notation as **custom SVG** (no VexFlow), animated playhead synced to the audio, audio playback.
- **Audio:** Web Audio **synthesis** only (no sample files). Accents, taps and grace notes at different volumes. No stereo panning.
- **Playback:** continuous loop, open-close-open, count-in, timed session. All four exist.
- **Tempo ramp:** both by timer (every N sec) and by repetitions.
- **Routines:** ordered list, each item with its own rudiment, BPM, duration and mode; the app steps through them.
- **Practice log:** best clean tempo per rudiment, session history (date, rudiment, duration, BPM range), daily time and streak, plus JSON export/import (iPad Safari can clear site data).
- **UI:** one practice screen with drawers (rudiment list, routines, log), dark and high contrast, responsive for portrait and landscape.
- **Hosting:** GitHub Pages (HTTPS needed for the service worker).

## Status

- **Stage 1 DONE:** sequencer, audio engine, shell UI, loop/OCO/count-in/timed/ramp, PWA + offline. 19 unit tests pass, plus a jsdom UI smoke test (not in the repo).
- **Stage 2 TODO:** full 26 rudiments in `rudiments.js`, standard notation as SVG with a playhead synced to `ev.step`, notation/sticking toggle if it helps.
- **Stage 3 TODO:** routines runner, practice log (best tempo, history, streak), export/import, polish.

## Architecture rules

- `js/sequencer.js` is **pure** (no DOM, no Web Audio) and fully unit tested. Put timing logic there, with tests.
- `js/audio.js` schedules on the audio clock with a look-ahead (150 ms, pumped every 25 ms from a Worker timer, setInterval fallback). Never schedule sounds from `setTimeout` or `requestAnimationFrame`.
- The UI only learns what is playing from `engine.pollVisual()` events (each has `step`, `cycle`, `bpm`, `elapsed`, `patternId`, `phase`). Use these to drive the notation playhead; do not compute positions separately.
- Pattern changes apply at the next repetition boundary. Grace notes are scheduled *before* the main stroke by `graceGap()`; keep total pre-offset under the look-ahead (tested).
- Settings persist in `localStorage` under `rudiments.settings.v1`. Wrap storage access in try/catch.
- iOS: audio must be unlocked from a user gesture (done in `DrumEngine.unlock`); playback stops when the page is hidden.
- When shipping changes, bump `CACHE` in `sw.js` and add any new files to its `SHELL` list.

## Commands

```sh
npm test                      # node --test test/*.test.mjs
python3 -m http.server 8080   # local preview (service worker works on localhost)
python3 make_icons.py         # regenerate icons (Pillow)
```

## Testing gotchas

- Real audio can't be verified in CI; the engine test uses a fake `AudioContext` (`autoPump: false`, advance `currentTime` manually).
- Final check of feel and timing must be done on the actual iPad.
