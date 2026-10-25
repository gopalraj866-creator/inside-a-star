# Journey Inside a Star — Technical Talk India

An 8-minute (480 s, 30 fps) 3D documentary: dive from the Sun's corona to its core, watch hydrogen fuse, then see a 25-solar-mass star's onion layers collapse into a supernova. Built with **Three.js / WebGL**, rendered on **GitHub Actions** in **4K**, **1080p** and a vertical **YouTube Short**.

> Status: the code, scenes, audio pipeline and workflow were built and tested piece by piece (see `docs/VALIDATION.md`). **The full 8-minute render has not been run yet** — that is your first GitHub run.

## Render it on GitHub (no installs)
1. Create a new GitHub repository and upload everything in this zip (keep the `.github` folder).
2. Open **Actions → "Render Inside a Star" → Run workflow**.
3. Choose `1080p`, `4k`, `shorts` or `all` (and optionally the narration voice).
4. When it finishes, download the artifacts **inside-a-star-1080p / -4k / -shorts**. Each contains the MP4, `captions.srt`, and (1080p/4k) `thumbnail.jpg` + `YOUTUBE_DESCRIPTION.md`.

How it works: an **audio** job makes the voice-over (edge-tts, `en-IN-PrabhatNeural` by default) and an original synthesized score → a **plan** job splits the film into frame ranges → many **render** jobs run in parallel (software WebGL is ~3 s/frame at 1080p, ~10 s at 4K) → **assemble** joins the chunks, adds audio and captions.
Approximate job counts: 1080p = 36 jobs (~20 min each), 4K = 60 jobs (~40 min each), Short = 6 jobs. Public repos get free minutes; private repos use your quota — start with `1080p` or `shorts`.

## Preview on your own computer
```bash
npm ci
npm run preview          # then open http://127.0.0.1:8080/?format=preview
```
Use the slider/chapter buttons. `&format=1080p|4k|shorts` changes resolution (slow without a GPU).

Render locally (needs ffmpeg):
```bash
node scripts/render.mjs --format 1080p --start 0 --end 300 --out build/test.mp4   # 10 seconds
node scripts/render.mjs --format 1080p --stills 100,221,318,446                    # PNG stills
python3 scripts/music.py && node scripts/export-script.mjs && python3 scripts/tts.py && python3 scripts/mix.py
```

## Where things are
| Path | What |
|---|---|
| `public/src/script.js` | **Narration text + timing** — edit lines here |
| `public/src/timeline.js` | Chapters, camera path, what is visible when |
| `public/src/space.js`, `interior.js`, `micro.js`, `massive.js` | The four 3D worlds (star exterior; Sun interior; fusion; massive star) |
| `public/src/hud.js` | Labels, gauges, quiz, captions, end card |
| `public/src/shorts.js` | Which narration lines make up the Short |
| `scripts/` | Renderer, planner, assembler, voice, music, mixer |
| `docs/` | YouTube text with chapters, sources, storyboard, validation report |

Customise: change `VOICE` (workflow input), edit narration in `script.js` (timings re-fit automatically; keep each line before the next one's start), change `SHORT_IDS` to pick other Short moments.

## Notes
- All frames are pure functions of time (no randomness at render time), so chunks from different machines join seamlessly.
- Captions are burned into the video; `captions.srt` is also provided if you prefer YouTube's own captions (then you may want to hide the burned-in ones).
- Facts and their sources: `docs/SOURCES.md` (includes which figures are general knowledge rather than fetched).
