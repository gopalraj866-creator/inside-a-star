// Joins the rendered chunks, muxes the soundtrack, writes SRT captions.
//   node scripts/assemble.mjs --format 1080p [--chunks build/chunks] [--out dist]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { LINES } from '../public/src/script.js';
import { buildCaptions } from '../public/src/captions.js';
import { buildShorts } from '../public/src/shorts.js';

const a = Object.fromEntries(process.argv.slice(2).map((v, i, arr) => (v.startsWith('--') ? [v.slice(2), arr[i + 1]] : null)).filter(Boolean));
const format = a.format || '1080p';
const chunksDir = a.chunks || 'build/chunks';
const outDir = a.out || 'dist';
fs.mkdirSync(outDir, { recursive: true });
const files = fs.readdirSync(chunksDir).filter((f) => f.startsWith(format + '_') && f.endsWith('.mp4')).sort();
if (!files.length) { console.error(`no chunks for ${format} in ${chunksDir}`); process.exit(1); }
const list = path.join(chunksDir, `${format}_list.txt`);
fs.writeFileSync(list, files.map((f) => `file '${path.resolve(chunksDir, f)}'`).join('\n'));
const timing = fs.existsSync('build/audio/timing.json') ? JSON.parse(fs.readFileSync('build/audio/timing.json')) : null;
const audio = format === 'shorts' ? 'build/audio/shorts.wav' : 'build/audio/master.wav';
const name = { '1080p': 'inside_a_star_1080p.mp4', '4k': 'inside_a_star_4k.mp4', shorts: 'inside_a_star_short_1080x1920.mp4' }[format] || `inside_a_star_${format}.mp4`;
const target = path.join(outDir, name);
const args = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
if (fs.existsSync(audio)) args.push('-i', audio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest');
else { console.warn('WARNING: no audio found, writing silent video'); args.push('-c:v', 'copy'); }
args.push('-movflags', '+faststart', target);
const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
if (r.status) process.exit(r.status);
console.log('wrote', target, (fs.statSync(target).size / 1e6).toFixed(1), 'MB');

// ---- SRT ----
const caps = buildCaptions(LINES, timing);
const ts = (s) => { const ms = Math.max(0, Math.round(s * 1000)); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
let rows = [];
if (format === 'shorts') {
  const { segs } = buildShorts(timing);
  for (const c of caps) for (const s of segs) if (c.a >= s.src0 - 0.01 && c.b <= s.src1 + 0.2) rows.push({ a: c.a - s.src0 + s.out0, b: Math.min(c.b, s.src1) - s.src0 + s.out0, text: c.text });
} else rows = caps;
fs.writeFileSync(path.join(outDir, format === 'shorts' ? 'captions_short.srt' : 'captions.srt'), rows.map((c, i) => `${i + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.text}\n`).join('\n'));
console.log('captions written');
