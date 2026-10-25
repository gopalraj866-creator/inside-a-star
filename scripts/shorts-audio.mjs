// Builds the Short's soundtrack by cutting the master mix at the Short's segment list (same cuts as the video).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { buildShorts } from '../public/src/shorts.js';
const timing = fs.existsSync('build/audio/timing.json') ? JSON.parse(fs.readFileSync('build/audio/timing.json')) : null;
const { segs, total } = buildShorts(timing);
const fade = 0.06;
const parts = segs.map((s, i) => `[0:a]atrim=${s.src0.toFixed(3)}:${s.src1.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=${fade},afade=t=out:st=${(s.len - fade).toFixed(3)}:d=${fade}[s${i}]`);
const fc = parts.join(';') + ';' + segs.map((_, i) => `[s${i}]`).join('') + `concat=n=${segs.length}:v=0:a=1[out]`;
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', 'build/audio/master.wav', '-filter_complex', fc, '-map', '[out]', '-t', total.toFixed(3), 'build/audio/shorts.wav'], { stdio: 'inherit' });
if (r.status) process.exit(r.status);
console.log(`shorts.wav: ${segs.length} segments, ${total.toFixed(1)} s`);
