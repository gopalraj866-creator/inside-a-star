# Validation report — what was actually tested

Tested in the build environment (2-core Linux container, headless Chromium with SwiftShader software WebGL2):

| Check | Result |
|---|---|
| All shaders compile and run, no console/page errors across the whole timeline | ✅ |
| Contact-sheet review of every chapter at 960×540, 1080p stills of ~20 moments, 4K stills (8–11 s/frame), portrait Shorts stills | ✅ looked at by eye; several white-out/overexposure problems were found and fixed |
| Automated brightness scan, one frame every 6 s for the full 480 s | ✅ after fixes no frame flagged white/black |
| Real 30-frame chunk: render → ffmpeg H.264 → assemble → mux AAC → SRT → thumbnail | ✅ produced a valid 1920×1080 30 fps clip |
| Render planner: chunks contiguous and cover 14,400 frames (1080p, 4K) and 1,927 frames (Short) | ✅ |
| Audio pipeline: line placement, atempo fit, ducking mix, Short audio cut | ✅ *with placeholder tones as the voice* |
| Workflow YAML parses | ✅ |
| Measured speed | ≈2.7 s/frame at 1080p, ≈8–11 s/frame at 4K on 2 cores |

**Not tested / not claimed:**
- ❌ **The complete 8-minute video was not rendered here** (it would take ~11 h at 1080p on this box). Nothing was verified about GitHub's runners beyond the workflow being syntactically valid; the first run is the real test. If a job fails, the log shows the page errors.
- ❌ **The real narration voice was not generated here** (the sandbox has no access to the neural-voice service). The audio job does it on GitHub; if it cannot, it falls back to espeak-ng (robotic) and prints a warning.
- ❌ Captions/HUD in the Short were checked on 6 frames only.
- The music is an original synthesized score; it was composed from the code but not listened to here. Level and taste are unverified.
- Sizing of GitHub jobs is an estimate from the timings above (36 × 1080p jobs, 60 × 4K jobs, 6 Short jobs; 4K takes roughly 40 min per job).
