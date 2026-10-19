# Rudiment Trainer

A drum-rudiment practice app for iPad (and any browser), built as an installable web app (PWA). No build step, no dependencies, works offline once installed.

**Stage 1 (this version):** audio engine, metronome, tempo control, loop and open-close-open modes, count-in, timed sessions, tempo ramping (timer or reps), routines-ready architecture, dark responsive UI, offline support. Ships with a small starter set of 6 rudiments.

## Run it locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

Service workers (offline mode) work on `localhost` and on HTTPS, but **not** on a plain `http://192.168.x.x` address, so test on the iPad via the hosted version below.

## Put it on your iPad (GitHub Pages)

1. Create a new GitHub repository and upload everything in this folder (keep the folder structure).
2. Repo **Settings → Pages**, set the source to the `main` branch, root folder.
3. After a minute your app is live at `https://<your-username>.github.io/<repo-name>/`.
4. On the iPad open that URL in **Safari**, tap **Share → Add to Home Screen**. It then launches full-screen like a native app and works offline.

A free GitHub account makes a public repo; the app contains nothing private. Updates: push new files, then open the app twice (the first launch fetches the update in the background, the second runs it).

## Tests

```sh
npm test      # sequencer + engine tests (Node 20+), no install needed
```

## Layout

```
index.html            UI skeleton
css/styles.css        dark, responsive styles
js/sequencer.js       pure timing logic (patterns, tempo ramp, open-close-open, count-in)
js/audio.js           Web Audio engine: look-ahead scheduler, synthesized click and snare
js/rudiments.js       rudiment library (starter set for now)
js/app.js             UI wiring and persistence (localStorage)
sw.js, manifest.webmanifest, icons/   PWA / offline
test/                 unit tests
make_icons.py         regenerates the PNG icons (Pillow)
```

## Rudiment notation

One token per grid step; `grid` steps make one beat (4 = sixteenths, 2 = eighths, 3 = triplets). A pattern must fill whole beats.

| Token | Meaning |
|---|---|
| `R` `L` | accented stroke, right / left hand |
| `r` `l` | unaccented tap |
| `.` | rest |
| `(l)R` | flam: soft grace note before the stroke |
| `(ll)R` | drag: two grace notes |
| `R~ - - -` | buzz (press) roll held across the `-` steps |

Example: single paradiddle = `{ id: 'single-paradiddle', grid: 4, steps: 'R l r r L r l l' }`

## iPad notes

- Audio only starts after a tap (iOS rule), so the first Start press unlocks it.
- The screen stays awake while playing (Wake Lock). Playback stops if you switch apps, to avoid timing drift.
- If sound is missing, check the iPad isn't muted in Control Center.
