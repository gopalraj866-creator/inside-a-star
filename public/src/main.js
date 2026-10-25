import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SpaceWorld } from './space.js';
import { InteriorWorld } from './interior.js';
import { MicroWorld, micro } from './micro.js';
import { MassiveWorld, massive } from './massive.js';
import { DURATION, cameraAt, stateAt, effTime, sceneAt, SCENES } from './timeline.js';
import { HUD, txt } from './hud.js';
import { LINES } from './script.js';
import { buildCaptions, captionAt } from './captions.js';
import { buildShorts } from './shorts.js';
import { clamp, sstep, lerp } from './util.js';

const Q = new URLSearchParams(location.search);
const FORMATS = { '4k': [3840, 2160], '1080p': [1920, 1080], '720p': [1280, 720], shorts: [1080, 1920], preview: [960, 540] };
const FORMAT = Q.get('format') || 'preview';
const [W, H] = FORMATS[FORMAT] || FORMATS.preview;
const MODE = FORMAT === 'shorts' ? 'shorts' : 'main';
const FPS = 30;
const RENDER = Q.get('render') === '1';

// ---------- narration timing (written by the TTS step; optional) ----------
async function loadTiming() {
  try { const r = await fetch('/build/audio/timing.json', { cache: 'no-store' }); if (r.ok) return await r.json(); } catch (e) { /* none yet */ }
  return null;
}
const timing = await loadTiming();
const caps = buildCaptions(LINES, timing);
const shorts = buildShorts(timing);
const DUR = MODE === 'shorts' ? shorts.total : DURATION;

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 20000);
const space = new SpaceWorld(scene);
const interior = new InteriorWorld(scene);
const microW = new MicroWorld(scene);
const massiveW = new MassiveWorld(scene);

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: H >= 2000 ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.7, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const out = document.createElement('canvas'); out.width = W; out.height = H;
const og = out.getContext('2d');
const hud = new HUD(W, H, MODE);
const px = hud.u;

// fonts
const FONTS = [
  ['Rajdhani', '/node_modules/@fontsource/rajdhani/files/rajdhani-latin-500-normal.woff2', 500],
  ['Rajdhani', '/node_modules/@fontsource/rajdhani/files/rajdhani-latin-600-normal.woff2', 600],
  ['Rajdhani', '/node_modules/@fontsource/rajdhani/files/rajdhani-latin-700-normal.woff2', 700],
  ['Inter', '/node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2', 500],
  ['Inter', '/node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2', 700],
  ['Inter', '/node_modules/@fontsource/inter/files/inter-latin-800-normal.woff2', 800],
];
for (const [fam, url, w] of FONTS) { const f = new FontFace(fam, `url(${url})`, { weight: String(w) }); await f.load(); document.fonts.add(f); }
await document.fonts.ready;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
function applyCamera(c) {
  camera.position.set(...c.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(_v.set(...c.tgt));
  if (c.roll) camera.rotateZ(c.roll);
  let fov = c.fov;
  if (MODE === 'shorts') fov = Math.min(100, fov * 1.45);
  camera.fov = fov; camera.aspect = W / H;
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}
function project(v) {
  const p = new THREE.Vector3(v[0], v[1], v[2]).project(camera);
  if (p.z > 1) return null;
  return { x: (p.x * 0.5 + 0.5) * W, y: (1 - (p.y * 0.5 + 0.5)) * H };
}

export function bloomFor(T, S) {
  let s = 0.5, r = 0.7, th = 0.85;
  if (T < 24) { s = 0.55; }
  else if (T < 84) { s = 0.5; }
  else if (T < 112) { s = 0.28; th = 0.95; }
  else if (T < 190) { s = 0.62; th = 0.8; }
  else if (T < 250) { s = 0.7; th = 0.75; }
  else if (T < 285) { s = 0.55; th = 0.8; r = 0.8; }
  else if (T < 385) { s = 0.45; th = 0.8; }
  else { s = 0.32 + 0.9 * (S.massive ? S.massive.flash : 0); th = 0.9; }
  return [s, r, th];
}

let last = { T: -1 };
function renderAt(Tout, opt = {}) {
  let Teff, Thud, Tcap, flash = 0;
  if (MODE === 'shorts') {
    const m = shorts.map(Tout);
    Teff = m.src; Thud = Teff; Tcap = Teff;
    flash = m.seg === 0 ? 0 : 1 - clamp(m.tin / 0.22);
  } else { Teff = effTime(Tout, 'main'); Thud = Tout; Tcap = Tout; }

  const cam = cameraAt(Teff, MODE);
  const cam0 = cameraAt(Math.max(0, Teff - 1 / 60), MODE);
  applyCamera(cam);
  const camPos = _v2.set(...cam.pos).clone();
  const camVel = new THREE.Vector3(cam.pos[0] - cam0.pos[0], cam.pos[1] - cam0.pos[1], cam.pos[2] - cam0.pos[2]).multiplyScalar(60);
  const camR = camPos.length();
  const S = stateAt(Teff, camR);
  const ctx = { camera, camPos, camVel, width: W, height: H, px, camR };

  space.update(Teff, ctx, S);
  interior.update(Teff, ctx, S);
  microW.update(Teff, ctx, S);
  massiveW.update(Teff, ctx, S);

  for (const k of window.__hide || []) { const o = interior[k] || space[k] || microW[k] || massiveW[k]; if (o) (o.mesh || o).visible = false; }
  const [bs, br, bt] = bloomFor(Teff, S);
  bloom.strength = bs; bloom.radius = br; bloom.threshold = bt;
  composer.render();

  og.drawImage(renderer.domElement, 0, 0, W, H);

  const info = { project, caption: captionAt(caps, Tcap), flash, extra: [micro.drawHud, massive.drawHud] };
  if (S.space) {
    const c = project([0, 0, 0]);
    const D = camR, R = 100;
    if (c && D > R * 1.01) info.starScreen = { x: c.x, y: c.y, r: (H / 2) / Math.tan((camera.fov * Math.PI) / 360) * R / Math.sqrt(D * D - R * R) };
  }
  info.nsScreen = project([0, 0, 0]);
  if (opt.hud !== false) hud.draw(og, Thud, Teff, S, info);
  last = { T: Tout, Teff, S };
}

// ---------- API for the render script ----------
window.__info = () => ({ duration: DUR, fps: FPS, width: W, height: H, mode: MODE, frames: Math.round(DUR * FPS), segs: MODE === 'shorts' ? shorts.segs : null, timing: !!timing });
window.__frame = (n, type = 'image/jpeg', q = 0.93) => { renderAt(n / FPS); return out.toDataURL(type, q); };
window.__at = (T, type = 'image/png') => { renderAt(T); return out.toDataURL(type); };
window.__thumb = (T = 399.5, type = 'image/jpeg') => {
  renderAt(T, { hud: false });
  const g = og, u = hud.u;
  const gr = g.createLinearGradient(0, 0, W * 0.62, 0); gr.addColorStop(0, 'rgba(0,0,0,0.78)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const x = W * 0.045;
  txt(g, 'WHAT IS REALLY', x, H * 0.30, { size: 78 * u, weight: 700, spacing: 6 * u, stroke: 10 * u });
  const grad = g.createLinearGradient(x, 0, x + W * 0.4, 0); grad.addColorStop(0, '#ffe08a'); grad.addColorStop(1, '#ff7a30');
  txt(g, 'INSIDE', x, H * 0.52, { size: 190 * u, weight: 700, color: grad, stroke: 14 * u, spacing: 4 * u });
  txt(g, 'A STAR?', x, H * 0.76, { size: 190 * u, weight: 700, color: grad, stroke: 14 * u, spacing: 4 * u });
  txt(g, 'SURFACE  →  CORE  →  SUPERNOVA', x, H * 0.88, { size: 40 * u, weight: 700, spacing: 5 * u, stroke: 8 * u, color: '#cfe6ff' });
  txt(g, 'TECHNICAL TALK INDIA', W - x, H * 0.95, { size: 30 * u, weight: 700, spacing: 6 * u, align: 'right', stroke: 7 * u, color: '#ffcf66' });
  return out.toDataURL(type, 0.92);
};
window.__ready = true;

// ---------- interactive preview ----------
if (!RENDER) {
  document.body.style.cssText = 'margin:0;background:#05070d;color:#dfe8ff;font:14px Inter,sans-serif;display:flex;flex-direction:column;align-items:center;min-height:100vh';
  const wrap = document.createElement('div');
  wrap.style.cssText = `width:min(96vw,${MODE === 'shorts' ? '420px' : '1280px'});margin:12px auto 0`;
  out.style.cssText = 'width:100%;height:auto;display:block;border-radius:8px;box-shadow:0 8px 40px #000a';
  wrap.appendChild(out);
  const ui = document.createElement('div');
  ui.style.cssText = 'display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap';
  const btn = document.createElement('button'); btn.textContent = '▶ Play'; btn.style.cssText = 'padding:6px 14px;border-radius:6px;border:0;background:#ffcf66;font-weight:700;cursor:pointer';
  const sl = document.createElement('input'); sl.type = 'range'; sl.min = 0; sl.max = String(DUR); sl.step = '0.05'; sl.value = '0'; sl.style.flex = '1';
  const lab = document.createElement('span'); lab.style.minWidth = '230px';
  ui.append(btn, sl, lab); wrap.appendChild(ui);
  const ch = document.createElement('div'); ch.style.cssText = 'margin-top:8px;display:flex;gap:6px;flex-wrap:wrap';
  if (MODE !== 'shorts') for (const s of SCENES) { const b = document.createElement('button'); b.textContent = s.chapter.slice(0, 26); b.style.cssText = 'font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid #345;background:#0b1224;color:#cde;cursor:pointer'; b.onclick = () => { T0 = s.t0; sl.value = T0; draw(); }; ch.appendChild(b); }
  wrap.appendChild(ch);
  document.body.appendChild(wrap);
  let playing = false, T0 = Number(Q.get('t') || 0), tStart = 0, rafId = 0;
  const draw = () => { renderAt(T0); sl.value = T0; lab.textContent = `${T0.toFixed(1)} s / ${DUR.toFixed(0)} s  ·  ${sceneAt(last.Teff || T0).chapter}`; };
  btn.onclick = () => { playing = !playing; btn.textContent = playing ? '❚❚ Pause' : '▶ Play'; if (playing) { tStart = performance.now() - T0 * 1000; loop(); } else cancelAnimationFrame(rafId); };
  sl.oninput = () => { T0 = Number(sl.value); draw(); };
  const loop = () => { T0 = (performance.now() - tStart) / 1000; if (T0 >= DUR) { T0 = DUR - 0.01; playing = false; btn.textContent = '▶ Play'; } draw(); if (playing) rafId = requestAnimationFrame(loop); };
  draw();
}
