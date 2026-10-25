import { track, clamp, lerp, sstep, pulse, inv, noise1, logTable, easeInOut, easeOut } from './util.js';
import { makeWalk } from './interior.js';
import { micro } from './micro.js';
import { massive } from './massive.js';

export const DURATION = 480;
export const STAR_R = 100;
export const KM_PER_UNIT = 696340 / STAR_R;

// ----- chapters (also used for the YouTube description) -----
export const SCENES = [
  { id: 'hook',   t0: 0,   t1: 24,  title: null,                 chapter: 'The sunlight on your skin' },
  { id: 'meet',   t0: 24,  t1: 64,  title: 'MEET THE STAR',      chapter: 'Meet the star' },
  { id: 'atmo',   t0: 64,  t1: 112, title: 'THE ATMOSPHERE',     chapter: 'The corona, chromosphere and surface' },
  { id: 'conv',   t0: 112, t1: 172, title: 'CONVECTION ZONE',    chapter: 'The convection zone' },
  { id: 'tacho',  t0: 172, t1: 190, title: 'THE TACHOCLINE',     chapter: 'The tachocline' },
  { id: 'rad',    t0: 190, t1: 250, title: 'RADIATIVE ZONE',     chapter: 'The radiative zone: 170,000-year journey' },
  { id: 'core',   t0: 250, t1: 285, title: 'THE CORE',           chapter: 'The core' },
  { id: 'fusion', t0: 285, t1: 345, title: 'NUCLEAR FUSION',     chapter: 'Inside the fusion engine' },
  { id: 'balance',t0: 345, t1: 385, title: 'BALANCE & CNO',      chapter: 'Why stars don\'t explode, and the CNO cycle' },
  { id: 'onion',  t0: 385, t1: 425, title: 'THE ONION STAR',     chapter: 'A giant star\'s onion layers' },
  { id: 'collapse',t0: 425, t1: 462, title: 'CORE COLLAPSE',     chapter: 'Core collapse and supernova' },
  { id: 'dust',   t0: 462, t1: 480, title: 'STARDUST',           chapter: 'Stardust' },
];
export const sceneAt = (T) => SCENES.find((s) => T >= s.t0 && T < s.t1) || SCENES[SCENES.length - 1];

// ----- time remapping: hook montage (and Shorts) show other moments of the film -----
const HOOK_CUTS = [
  // [real start, real end, source time]
  [5.6, 7.2, 150],
  [7.2, 8.8, 221],
  [8.8, 10.4, 268],
  [10.4, 12.0, 318],
  [12.0, 13.6, 446],
];
export function effTime(T, mode, shortsMap) {
  if (mode === 'shorts' && shortsMap) return shortsMap(T);
  for (const [a, b, src] of HOOK_CUTS) if (T >= a && T < b) return src + (T - a);
  return T;
}
export const hookCuts = HOOK_CUTS;

// ----- camera -----
const walk = makeWalk();
const WALK_ORIGIN = [0, 0, 46];

const keys = [
  // t,   px, py, pz,     tx, ty, tz,     fov
  [0,    0, 30, 3400,    0, 0, 0,       26],
  [6,    0, 26, 2600,    0, 0, 0,       26],
  [14,   0, 20, 1700,    0, 0, 0,       34],
  [24,   0, 14, 1100,    0, 0, 0,       38],
  [44, 130, 40,  560,    0, 0, 0,       42],
  [64,  70, 22,  330,    0, 0, 0,       44],
  [80,  10,  4,  150,    0, 0, 0,       50],
  [92,   0,  0,  108,    0, 0, 0,       58],
  [100,  0,  0, 101.6,   0, 0, -60,     62],
  [104,  0,  0,  98.8,   0, 0, -100,    66],
  [112,  0,  0,  96.6,   0, 0, -100,    66],
  [124,  5,  3,  92.0,   1, 0.6, -100,  66],
  [136, -4,  5,  87.0,  -0.8, 1, -100,  66],
  [148, -5, -3,  82.0,  -1, -0.6, -100, 66],
  [160,  3, -5,  77.0,   0.6, -1, -100, 66],
  [172,  4,  2,  71.0,   0.8, 0.4, -100, 66],
  [180,  0,  0,  68.6,   0, 0, -100,    68],
  [190,  0,  0,  64.0,   0, 0, -100,    66],
  [210,  0,  0,  52.0,   0, 0, -100,    66],
  [245,  0,  0,  47.5,   0, 0, -100,    66],
  [250,  0,  0,  36.0,   0, 0, -100,    66],
  [262,  0,  0,  19.0,   0, 0, -100,    68],
  [275,  0,  0,   8.0,   0, 0, -100,    72],
  [285,  0,  0,   2.5,   0, 0, -100,    76],
];
const keyTrack = track(keys.map((k) => k.slice()));

export function photonProgress(T) { return sstep(209.5, 241, T); }
export const photonBlend = (T) => sstep(206.5, 211, T) * (1 - sstep(243, 248, T));
// camera framing data for the photon: running centroid + bounding radius of the path so far
const framing = (() => {
  const n = walk.n, c = [], rad = [];
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i <= n; i++) {
    sx += walk.pts[i * 4]; sy += walk.pts[i * 4 + 1]; sz += walk.pts[i * 4 + 2];
    const cx = sx / (i + 1), cy = sy / (i + 1), cz = sz / (i + 1);
    let m = 0;
    for (let j = 0; j <= i; j += 2) m = Math.max(m, Math.hypot(walk.pts[j * 4] - cx, walk.pts[j * 4 + 1] - cy, walk.pts[j * 4 + 2] - cz));
    c.push([cx, cy, cz]); rad.push(m);
  }
  return { c, rad };
})();

function photonCam(T) {
  const p = photonProgress(T);
  const i = Math.max(1, Math.min(walk.n, Math.round(clamp(p + 0.03) * walk.n)));
  const c = framing.c[i], r = framing.rad[i];
  const dist = clamp(2.1 * r + 15, 22, 80);
  const a = 0.18 * (T - 205) + 0.4;
  const el = 0.22 + 0.1 * Math.sin(0.11 * (T - 205));
  const o = WALK_ORIGIN;
  const tg = [o[0] + c[0], o[1] + c[1], o[2] + c[2]];
  return {
    pos: [tg[0] + Math.sin(a) * dist * Math.cos(el), tg[1] + Math.sin(el) * dist, tg[2] + Math.cos(a) * dist * Math.cos(el)],
    tgt: tg, fov: 52,
  };
}

export function cameraAt(T, mode = 'main') {
  let pos, tgt, fov;
  if (T < 285) {
    const v = keyTrack(T);
    pos = [v[0], v[1], v[2]]; tgt = [v[3], v[4], v[5]]; fov = v[6];
    const pb = photonBlend(T);
    if (pb > 0) {
      const pc = photonCam(T);
      pos = pos.map((x, i) => lerp(x, pc.pos[i], pb));
      const pl = Math.hypot(...pos);
      if (pl > 92) pos = pos.map((x) => (x * 92) / pl);   // the camera stays physically inside the star
      tgt = tgt.map((x, i) => lerp(x, pc.tgt[i], pb));
      fov = lerp(fov, pc.fov, pb);
    }
    // gentle hand-held sway
    const sw = T > 100 ? 1 : 0.35;
    tgt = [tgt[0] + noise1(T * 0.21, 1) * 1.1 * sw, tgt[1] + noise1(T * 0.19, 2) * 0.8 * sw, tgt[2]];
    // sway needs scale with distance to the target: apply as angle offset instead
    const toT = [tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]];
    const d = Math.hypot(...toT);
    const k = (T > 100 ? 0.006 : 0.0015) * d;
    tgt = [tgt[0] + noise1(T * 0.23, 5) * k, tgt[1] + noise1(T * 0.17, 6) * k * 0.7, tgt[2]];
    return { pos, tgt, fov, roll: noise1(T * 0.13, 3) * 0.008 };
  }
  if (T < 385) return micro.camera(T, mode);
  return massive.camera(T, mode);
}

// ----- crossing the photosphere (camera radius == star radius) -----
export const T_CROSS = (() => {
  let t = 92;
  for (; t < 110; t += 0.01) { const c = cameraAt(t).pos; if (Math.hypot(...c) <= STAR_R) return t; }
  return 102;
})();

// ----- physical tables for the HUD (approximate model values; anchors from NASA/ESA) -----
const tempC = logTable([[0, 15e6], [25, 7e6], [70, 2e6], [100, 5500]]);
const densW = logTable([[0, 150], [25, 20], [70, 0.2], [100, 2e-7]]);

export function hudLayer(T, camR) {
  // atmosphere is scheduled in time (its real thickness is far too thin to dive through at this scale)
  if (camR > 100 || T < T_CROSS) {
    if (T < 64) return null;
    if (T < 80) return { name: 'CORONA', temp: '1,000,000+ °C', dens: 'near-vacuum', col: [150, 190, 255], depthKm: null, frac: 1 + (camR - 100) / 400 };
    if (T < 84) return { name: 'TRANSITION REGION', temp: '25,000 → 1,000,000 °C', dens: 'near-vacuum', col: [180, 170, 255], depthKm: null, frac: 1.06 };
    if (T < 91) return { name: 'CHROMOSPHERE', temp: '4,000 → 25,000 °C', dens: 'very thin', col: [255, 110, 120], depthKm: null, frac: 1.02 };
    return { name: 'PHOTOSPHERE', temp: '≈ 5,500 °C', dens: '≈ 0.0000002 × water', col: [255, 215, 120], depthKm: 0, frac: 1.0 };
  }
  const r = camR;
  const depth = (STAR_R - r) * KM_PER_UNIT;
  let name, col;
  if (r > 70.5) { name = 'CONVECTION ZONE'; col = [255, 140, 50]; }
  else if (r > 69.2) { name = 'TACHOCLINE'; col = [90, 190, 255]; }
  else if (r > 25) { name = 'RADIATIVE ZONE'; col = [255, 225, 150]; }
  else { name = 'CORE'; col = [255, 250, 235]; }
  const tc = tempC(Math.max(r, 0.01));
  const dw = densW(Math.max(r, 0.01));
  const tStr = tc >= 1e6 ? '≈ ' + (tc / 1e6).toFixed(tc >= 1e7 ? 0 : 1) + ' million °C' : '≈ ' + Math.round(tc / 100) * 100 + ' °C';
  const dStr = dw >= 1 ? '≈ ' + (dw >= 100 ? Math.round(dw / 10) * 10 : Math.round(dw)) + ' × water' : '≈ ' + dw.toPrecision(1) + ' × water';
  return { name, temp: tStr, dens: dStr, col, depthKm: depth, frac: r / STAR_R };
}

// ----- world state per (effective) time -----
export function stateAt(T, camR) {
  const lr = lerp(camR, 46, photonBlend(T));   // radius of the layer we are *talking about*
  const S = { T, camR, hudR: lr };
  const dive = T < 285.6;
  const outside = dive && camR > 98.8;
  S.space = (T < 108 && outside) ? 1 : 0;
  S.star = S.space;
  S.sky = S.space;
  S.corona = S.space * (1 - sstep(78, 99, T));
  S.loops = S.space * sstep(0, 4, T) * (1 - sstep(76, 92, T)) * (0.6 + 0.4 * sstep(24, 40, T));
  S.spicules = S.space * pulse(T, 82, 104, 5);
  S.wind = S.space * pulse(T, 62, 101, 6);
  S.earths = { show: S.space * pulse(T, 39.5, 63, 3), progress: sstep(40.5, 52, T) };

  const I = { show: 0, conv: 0, tacho: 0, rad: 0, core: 0, coreNu: 0, coreShell: 0, coreGlow: 0, nuRace: 0, noise: 1.6, glow: 1, photon: { show: 0, progress: 0 } };
  if (dive && camR < 100.6) {
    I.show = 1;
    I.conv = sstep(100.2, 98.0, camR) * (1 - sstep(68.5, 64.5, lr));
    I.tacho = 1 - sstep(3.5, 11, Math.abs(lr - 70));
    I.rad = sstep(76, 70, lr) * (1 - sstep(25, 20, camR));
    I.core = sstep(31, 26, camR);
    I.coreNu = pulse(T, 251, 286, 2);
    I.coreShell = sstep(72, 52, camR) * (1 - sstep(27.5, 25.2, camR));
    I.coreGlow = sstep(64, 30, camR) * (1 - sstep(16, 5, camR));
    I.nuRace = pulse(T, 233.4, 249, 0.8);
    I.noise = lerp(1.6, 2.4, sstep(98, 80, lr));
    I.photon = { show: pulse(T, 207.5, 248, 2.5), progress: photonProgress(T) };
  }
  S.interior = I;
  S.micro = micro.state(T);
  S.massive = massive.state(T);
  return S;
}
