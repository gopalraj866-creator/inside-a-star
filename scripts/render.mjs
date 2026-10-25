// Deterministic frame renderer: headless Chromium (software WebGL2) -> JPEG frames -> ffmpeg -> mp4.
//   node scripts/render.mjs --format 1080p --start 0 --end 600 --out build/chunks/1080p_000.mp4
//   node scripts/render.mjs --format 1080p --stills 14,100,221,318,446     (PNG stills for review)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { startServer } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']] : a), []));
const FORMAT = args.format || '1080p';
const CRF = args.crf || (FORMAT === '4k' ? '15' : '14');
const PRESET = args.preset || 'veryfast';
const QUALITY = Number(args.jpegq || 0.93);

async function findChrome() {
  // The bundled Chromium (@sparticuz/chromium + SwiftShader) is what this project was tested with; override with CHROME_PATH.
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return { exe: process.env.CHROME_PATH, bundled: false };
  const mod = await import('@sparticuz/chromium');
  return { exe: await mod.default.executablePath(), bundled: true };
}

const { exe, bundled } = await findChrome();
const { srv, port } = await startServer(0);
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: bundled ? 'shell' : true,
  protocolTimeout: 30 * 60 * 1000,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--allow-file-access-from-files',
    ...(bundled ? ['--single-process', '--no-zygote'] : []),
  ],
});
const page = await browser.newPage();
const [vw, vh] = { '4k': [3840, 2160], '1080p': [1920, 1080], '720p': [1280, 720], shorts: [1080, 1920], preview: [960, 540] }[FORMAT];
await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || /error|shader|GL/i.test(t)) console.log('[page]', t.slice(0, 1200)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack || e).slice(0, 1500)));
await page.goto(`http://127.0.0.1:${port}/public/index.html?render=1&format=${FORMAT}`, { waitUntil: 'load', timeout: 10 * 60 * 1000 });
await page.waitForFunction('window.__ready === true', { timeout: 10 * 60 * 1000 });
const info = await page.evaluate('window.__info()');
console.log(`format=${FORMAT} ${info.width}x${info.height} duration=${info.duration.toFixed(2)}s frames=${info.frames} timing=${info.timing ? 'tts' : 'estimated'} chrome=${bundled ? 'bundled' : exe}`);

async function done(code = 0) { await browser.close(); srv.close(); process.exit(code); }

if (args.info) { console.log(JSON.stringify(info)); await done(); }

if (args.thumb) {
  const f = path.resolve(ROOT, args.thumb === 'true' ? 'dist/thumbnail.jpg' : args.thumb); fs.mkdirSync(path.dirname(f), { recursive: true });
  const url = await page.evaluate((tt) => window.__thumb(tt), Number(args.thumbT || 399.5));
  fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log('thumbnail ->', f);
  await done();
}

if (args.stills) {
  const dir = path.resolve(ROOT, args.stillsdir || 'build/stills'); fs.mkdirSync(dir, { recursive: true });
  for (const t of String(args.stills).split(',').map(Number)) {
    const t0 = Date.now();
    const url = await page.evaluate((tt) => window.__at(tt, 'image/png'), t);
    const f = path.join(dir, `${FORMAT}_${String(t).replace('.', '_')}.png`);
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`still t=${t}s -> ${f}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  await done();
}

const start = Number(args.start || 0);
const end = Math.min(Number(args.end || info.frames), info.frames);
const outFile = path.resolve(ROOT, args.out || `build/${FORMAT}.mp4`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
if (args.segs) fs.writeFileSync(path.resolve(ROOT, args.segs), JSON.stringify({ segs: info.segs, duration: info.duration }));

const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(info.fps), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', PRESET, '-crf', CRF, '-pix_fmt', 'yuv420p', '-r', String(info.fps), '-movflags', '+faststart', outFile], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res) => ff.on('close', res));
ff.stdin.on('error', () => {});

const t0 = Date.now();
for (let n = start; n < end; n++) {
  const url = await page.evaluate((i, q) => window.__frame(i, 'image/jpeg', q), n, QUALITY);
  const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  const k = n - start + 1;
  if (k % 20 === 0 || n === end - 1) {
    const el = (Date.now() - t0) / 1000, per = el / k, eta = per * (end - start - k);
    console.log(`frame ${n + 1}/${end}  ${per.toFixed(2)} s/frame  elapsed ${(el / 60).toFixed(1)} min  eta ${(eta / 60).toFixed(1)} min`);
  }
}
ff.stdin.end();
await ffDone;
console.log(`wrote ${outFile}  (${((fs.statSync(outFile).size) / 1e6).toFixed(1)} MB)`);
await done();
