// Builds the GitHub Actions matrix: which frame ranges to render in which job.
//   node scripts/plan.mjs --formats 1080p,4k,shorts
import fs from 'node:fs';
import { buildShorts } from '../public/src/shorts.js';
const a = Object.fromEntries(process.argv.slice(2).map((v, i, arr) => (v.startsWith('--') ? [v.slice(2), arr[i + 1]] : null)).filter(Boolean));
const formats = (a.formats || '1080p').split(',').filter(Boolean);
const timing = fs.existsSync('build/audio/timing.json') ? JSON.parse(fs.readFileSync('build/audio/timing.json')) : null;
const FPS = 30;
// frames per job. Measured on a 2-core box with software WebGL: ~2.5-3 s/frame at 1080p, ~9-11 s/frame at 4K.
const CHUNK = { '1080p': Number(a.chunk1080 || 400), '4k': Number(a.chunk4k || 240), shorts: Number(a.chunkshorts || 340) };
const include = [];
for (const f of formats) {
  const frames = f === 'shorts' ? Math.round(buildShorts(timing).total * FPS) : 480 * FPS;
  const n = Math.ceil(frames / CHUNK[f]);
  for (let i = 0; i < n; i++) include.push({ format: f, chunk: i, start: i * CHUNK[f], end: Math.min(frames, (i + 1) * CHUNK[f]), name: `${f}_${String(i).padStart(3, '0')}` });
}
const out = { include };
console.log(JSON.stringify(out));
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(out)}\nformats=${JSON.stringify(formats)}\ncount=${include.length}\n`);
