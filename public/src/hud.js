import { clamp, lerp, sstep, pulse, inv, easeOut, easeInOut, fmt } from './util.js';
import { SCENES, sceneAt, hudLayer, T_CROSS, photonProgress, hookCuts, STAR_R } from './timeline.js';

const FONT = 'Rajdhani, Inter, "DejaVu Sans", sans-serif';
const FONT2 = 'Inter, "DejaVu Sans", sans-serif';
const rgba = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
export const bump = (T, c, rise, fall) => sstep(c - rise, c, T) * (1 - sstep(c, c + fall, T));

export function txt(g, s, x, y, o = {}) {
  const { size = 24, weight = 600, color = '#fff', align = 'left', base = 'alphabetic', alpha = 1, font = FONT, stroke = 0, shadow = 0, spacing = 0, strokeColor = 'rgba(0,0,0,0.85)' } = o;
  g.save();
  g.globalAlpha *= alpha;
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align; g.textBaseline = base;
  try { g.letterSpacing = spacing ? `${spacing}px` : '0px'; } catch (e) { /* older browsers */ }
  if (shadow) { g.shadowColor = 'rgba(0,0,0,0.75)'; g.shadowBlur = shadow; g.shadowOffsetY = shadow * 0.25; }
  if (stroke) { g.lineJoin = 'round'; g.lineWidth = stroke; g.strokeStyle = strokeColor; g.strokeText(s, x, y); g.shadowColor = 'transparent'; }
  g.fillStyle = color; g.fillText(s, x, y);
  g.restore();
}
export function measure(g, s, size, weight = 600, font = FONT, spacing = 0) {
  g.save(); g.font = `${weight} ${size}px ${font}`; try { g.letterSpacing = spacing ? `${spacing}px` : '0px'; } catch (e) {}
  const w = g.measureText(s).width; g.restore(); return w;
}
export function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// glass tag / pill
export function tag(g, u, text, x, y, o = {}) {
  const { size = 26, color = [255, 255, 255], alpha = 1, align = 'center', sub = null, weight = 600 } = o;
  const fs = size * u;
  const w = Math.max(measure(g, text, fs, weight, FONT, 1.2 * u), sub ? measure(g, sub, fs * 0.72, 500, FONT2) : 0) + fs * 1.6;
  const h = fs * (sub ? 2.5 : 1.7);
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  g.save(); g.globalAlpha *= alpha;
  rrect(g, x0, y, w, h, 10 * u); g.fillStyle = 'rgba(6,10,20,0.55)'; g.fill();
  g.lineWidth = 1.5 * u; g.strokeStyle = rgba(color, 0.55); g.stroke();
  g.fillStyle = rgba(color, 1); rrect(g, x0, y, 5 * u, h, 3 * u); g.fill();
  txt(g, text, x0 + fs * 0.85, y + (sub ? fs * 1.05 : h / 2), { size: fs, weight, base: sub ? 'alphabetic' : 'middle', spacing: 1.2 * u, shadow: 6 * u });
  if (sub) txt(g, sub, x0 + fs * 0.85, y + fs * 1.85, { size: fs * 0.72, weight: 500, font: FONT2, color: 'rgba(210,225,255,0.9)' });
  g.restore();
  return { x: x0, y, w, h };
}
export function arrow(g, x0, y0, x1, y1, w, col, alpha = 1) {
  const a = Math.atan2(y1 - y0, x1 - x0), hl = w * 3.2;
  g.save(); g.globalAlpha *= alpha; g.strokeStyle = col; g.fillStyle = col; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - Math.cos(a) * hl * 0.6, y1 - Math.sin(a) * hl * 0.6); g.stroke();
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - Math.cos(a - 0.45) * hl, y1 - Math.sin(a - 0.45) * hl); g.lineTo(x1 - Math.cos(a + 0.45) * hl, y1 - Math.sin(a + 0.45) * hl); g.closePath(); g.fill();
  g.restore();
}

// ---- timed "tags" (small explanatory pills at the top of the frame) ----
const TAGS = [
  { t0: 72.5, t1: 82.5, text: 'CORONA  >1,000,000 °C', sub: 'vs. surface ≈ 5,500 °C — why is the atmosphere hotter? Still debated.', col: [150, 190, 255] },
  { t0: 84.0, t1: 91.0, text: 'SPICULES: JETS UP TO 10,000 KM', col: [255, 120, 130] },
  { t0: 92.5, t1: 100.0, text: 'PHOTOSPHERE · BOILING PLASMA, NOT SOLID', col: [255, 215, 120] },
  { t0: 101.5, t1: 108.5, text: 'HELIOSEISMOLOGY: MAPPING THE INSIDE WITH SOUND WAVES', col: [180, 220, 255] },
  { t0: 113.0, t1: 120.0, text: 'OUTER ~30% OF THE SUN · ~200,000 KM DEEP', col: [255, 150, 70] },
  { t0: 121.0, t1: 131.0, text: 'HOT PLASMA RISES  ·  COOL PLASMA SINKS', sub: 'like a boiling pot of water', col: [255, 170, 80] },
  { t0: 141.0, t1: 148.0, text: 'THE BUBBLING CELLS YOU SEE ON THE SURFACE', col: [255, 200, 110] },
  { t0: 149.5, t1: 158.0, text: 'MOVING CHARGED PLASMA  →  MAGNETIC FIELDS', col: [120, 200, 255] },
  { t0: 173.0, t1: 180.0, text: 'TACHOCLINE · WHERE THE MAGNETIC FIELD IS THOUGHT TO BE BORN', col: [120, 210, 255] },
  { t0: 181.5, t1: 189.0, text: 'ABOVE: LATITUDE-DEPENDENT FLOW  ·  BELOW: SOLID-BODY ROTATION', col: [255, 140, 220] },
  { t0: 191.0, t1: 198.5, text: 'TOO DENSE TO BOIL  →  ENERGY MUST TRAVEL AS LIGHT', col: [255, 225, 150] },
  { t0: 199.5, t1: 207.5, text: 'ABSORBED  →  RE-EMITTED  →  RANDOM DIRECTION', col: [255, 235, 170] },
  { t0: 276.0, t1: 284.0, text: 'NUCLEI ARE FORCED TO COLLIDE', col: [255, 240, 210] },
];

export class HUD {
  constructor(W, H, mode) {
    this.W = W; this.H = H; this.mode = mode;
    this.land = W >= H;
    this.u = this.land ? H / 1080 : W / 1080;
  }

  draw(g, T, Teff, S, info) {
    const { W, H, u, land } = this;
    const sc = sceneAt(T);
    const isShort = this.mode === 'shorts';

    // legibility gradient under captions
    const gr = g.createLinearGradient(0, H * (land ? 0.72 : 0.6), 0, H);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)');
    g.fillStyle = gr; g.fillRect(0, H * (land ? 0.72 : 0.6), W, H * (land ? 0.28 : 0.4));

    if (!isShort || true) this.channelMark(g, T);

    // Hook title
    this.hookTitle(g, T);
    this.chapterCard(g, T, sc);

    if (!isShort) {
      this.tags(g, T);
      this.earthCounter(g, T);
      this.balanceArrows(g, T, info);
      this.compare(g, T);
      this.gauge(g, T, Teff, S);
      this.quiz(g, T);
      this.core(g, T);
    } else {
      this.gauge(g, T, Teff, S, true);
    }
    // module HUDs (micro / massive)
    for (const fn of info.extra || []) fn(g, this, T, Teff, S, info);

    this.endCard(g, T, isShort);
    this.captions(g, T, info);
    this._flash = info.flash || 0;
    this.overlays(g, T, Teff);
  }

  channelMark(g, T) {
    const { W, H, u } = this; const a = sstep(1, 2.2, T) * (1 - sstep(468, 470, T));
    if (a <= 0) return;
    g.save(); g.globalAlpha = 0.85 * a;
    const x = 44 * u, y = 46 * u;
    g.fillStyle = '#ffcf66'; g.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 * u : 14 * u; const an = -Math.PI / 2 + (i * Math.PI) / 5; g.lineTo(x + 14 * u + Math.cos(an) * r, y + Math.sin(an) * r); }
    g.closePath(); g.fill();
    txt(g, 'TECHNICAL TALK INDIA', x + 40 * u, y + 7 * u, { size: 22 * u, weight: 700, spacing: 3 * u, shadow: 6 * u });
    g.restore();
  }

  hookTitle(g, T) {
    const { W, H, u, land } = this;
    if (T < 13.9 || T > 23.2) return;
    const k = sstep(13.9, 14.7, T), out = 1 - sstep(22.2, 23.2, T);
    const sc = 1 + (1 - easeOut(k)) * 0.35;
    g.save(); g.globalAlpha = k * out; g.translate(W / 2, H * (land ? 0.42 : 0.38)); g.scale(sc, sc);
    const s1 = (land ? 86 : 78) * u, s2 = (land ? 150 : 128) * u;
    txt(g, "WHAT'S REALLY", 0, -s2 * 0.45, { size: s1, weight: 700, align: 'center', spacing: 10 * u, shadow: 24 * u, color: '#fff' });
    const grad = g.createLinearGradient(-W * 0.3, 0, W * 0.3, 0); grad.addColorStop(0, '#ffe08a'); grad.addColorStop(0.5, '#ff9d3c'); grad.addColorStop(1, '#ff5a2a');
    txt(g, 'INSIDE A STAR?', 0, s2 * 0.62, { size: s2, weight: 700, align: 'center', spacing: 6 * u, shadow: 30 * u, color: grad });
    if (T > 17) txt(g, 'A 3D JOURNEY FROM THE SURFACE TO THE CORE', 0, s2 * 0.62 + 66 * u, { size: 30 * u, weight: 600, align: 'center', spacing: 6 * u, shadow: 8 * u, alpha: sstep(17, 18.2, T), color: 'rgba(235,240,255,0.95)' });
    g.restore();
  }

  chapterCard(g, T, sc) {
    const { W, H, u, land } = this;
    if (!sc.title) return;
    const a = sstep(sc.t0 + 0.5, sc.t0 + 1.2, T) * (1 - sstep(sc.t0 + 4.2, sc.t0 + 5.0, T));
    if (a <= 0) return;
    const idx = SCENES.indexOf(sc);
    const x = 60 * u, y = H * (land ? 0.16 : 0.2);
    const slide = (1 - easeOut(sstep(sc.t0 + 0.5, sc.t0 + 1.4, T))) * -40 * u;
    g.save(); g.globalAlpha = a; g.translate(slide, 0);
    txt(g, `CHAPTER ${String(idx).padStart(2, '0')}`, x, y, { size: 22 * u, weight: 600, spacing: 6 * u, color: '#ffcf66', shadow: 6 * u });
    txt(g, sc.title, x, y + 62 * u, { size: 62 * u, weight: 700, spacing: 4 * u, shadow: 16 * u });
    g.fillStyle = '#ffcf66'; g.fillRect(x, y + 78 * u, 150 * u * easeOut(sstep(sc.t0 + 0.6, sc.t0 + 1.6, T)), 4 * u);
    g.restore();
  }

  tags(g, T) {
    const { W, H, u, land } = this;
    for (const t of TAGS) {
      const a = pulse(T, t.t0, t.t1, 0.6);
      if (a <= 0) continue;
      tag(g, u, t.text, W / 2, H * (land ? 0.075 : 0.28) + (1 - a) * -10 * u, { size: land ? 25 : 24, color: t.col, alpha: a, sub: t.sub });
    }
  }

  earthCounter(g, T) {
    const { W, H, u, land } = this;
    const a = pulse(T, 40.5, 58, 0.8);
    if (a <= 0) return;
    const n = Math.round(109 * sstep(41, 51, T));
    g.save(); g.globalAlpha = a;
    txt(g, String(n), W / 2 - 12 * u, H * (land ? 0.19 : 0.2), { size: 112 * u, weight: 700, align: 'right', shadow: 18 * u, color: '#7fc4ff' });
    txt(g, 'EARTHS', W / 2 + 6 * u, H * (land ? 0.19 : 0.2) - 44 * u, { size: 38 * u, weight: 700, spacing: 6 * u, shadow: 10 * u });
    txt(g, 'LINED UP ACROSS THE SUN', W / 2 + 6 * u, H * (land ? 0.19 : 0.2) - 6 * u, { size: 24 * u, weight: 600, spacing: 4 * u, shadow: 8 * u, color: 'rgba(220,235,255,0.95)' });
    g.restore();
  }

  balanceArrows(g, T, info) {
    const a = pulse(T, 50.5, 62, 1.0);
    if (a <= 0 || !info.starScreen) return;
    const { u, W, H } = this; const s = info.starScreen;
    const R = s.r; if (R < 30) return;
    const N = 16, p = 0.5 + 0.5 * Math.sin(T * 1.7);
    g.save(); g.globalAlpha = a * 0.95;
    for (let i = 0; i < N; i++) {
      const an = (i / N) * Math.PI * 2 + T * 0.05;
      const c = Math.cos(an), sn = Math.sin(an);
      const rIn0 = R * (1.62 + 0.04 * p), rIn1 = R * (1.30 + 0.05 * p);
      arrow(g, s.x + c * rIn0, s.y + sn * rIn0, s.x + c * rIn1, s.y + sn * rIn1, 4 * u, 'rgba(110,170,255,0.95)');
      const an2 = an + Math.PI / N;
      const c2 = Math.cos(an2), s2 = Math.sin(an2);
      const rOut0 = R * (1.05), rOut1 = R * (1.28 - 0.05 * p);
      arrow(g, s.x + c2 * rOut0, s.y + s2 * rOut0, s.x + c2 * rOut1, s.y + s2 * rOut1, 4 * u, 'rgba(255,150,60,0.95)');
    }
    const ly = Math.max(H * 0.9, s.y + R * 1.7);
    if (a > 0.02) {
      txt(g, 'GRAVITY ↓ pulls inward', W * 0.3, H * 0.31, { size: 30 * u, weight: 700, color: '#9fc4ff', align: 'center', stroke: 8 * u, spacing: 2 * u });
      txt(g, 'FUSION HEAT ↑ pushes outward', W * 0.7, H * 0.31, { size: 30 * u, weight: 700, color: '#ffc080', align: 'center', stroke: 8 * u, spacing: 2 * u });
    }
    g.restore();
  }

  compare(g, T) {
    const { W, H, u, land } = this;
    const a = pulse(T, 74, 82.5, 0.7);
    if (a <= 0) return;
    const y = H * (land ? 0.2 : 0.4);
    g.save(); g.globalAlpha = a;
    txt(g, '>1,000,000 °C', W * 0.5 - 40 * u, y, { size: 64 * u, weight: 700, align: 'right', color: '#9cc4ff', shadow: 16 * u });
    txt(g, 'CORONA', W * 0.5 - 40 * u, y - 62 * u, { size: 24 * u, weight: 600, align: 'right', spacing: 5 * u, color: '#cfe0ff', shadow: 8 * u });
    txt(g, 'VS', W * 0.5, y - 10 * u, { size: 28 * u, weight: 700, align: 'center', color: '#fff', shadow: 8 * u });
    txt(g, '≈ 5,500 °C', W * 0.5 + 40 * u, y, { size: 64 * u, weight: 700, align: 'left', color: '#ffd878', shadow: 16 * u });
    txt(g, 'SURFACE BELOW IT', W * 0.5 + 40 * u, y - 62 * u, { size: 24 * u, weight: 600, align: 'left', spacing: 5 * u, color: '#ffe9b3', shadow: 8 * u });
    if (T > 78.4) txt(g, 'WHY?', W * 0.5, y + 70 * u, { size: 48 * u * (1 + 0.04 * Math.sin(T * 6)), weight: 700, align: 'center', color: '#fff', shadow: 20 * u, alpha: sstep(78.4, 79.2, T), spacing: 8 * u });
    g.restore();
  }

  // depth gauge + live readouts
  gauge(g, T, Teff, S, compact = false) {
    const { W, H, u, land } = this;
    const lay = hudLayer(Teff, S.hudR === undefined ? S.camR : S.hudR);
    const a = sstep(64, 66, Teff) * (1 - sstep(285, 285.8, Teff)) * (T >= 24 ? 1 : 0);
    if (!lay || a <= 0) return;
    const barX = W - (land ? 70 : 50) * u, bw = 12 * u;
    const top = H * (land ? 0.2 : 0.14), bh = H * (land ? 0.6 : 0.4);
    const F0 = 1.12;
    const yOf = (f) => top + ((F0 - f) / F0) * bh;
    g.save(); g.globalAlpha = a * 0.95;
    const seg = (f0, f1, c0, c1) => { const gr = g.createLinearGradient(0, yOf(f0), 0, yOf(f1)); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(barX, yOf(f0), bw, yOf(f1) - yOf(f0)); };
    seg(1.12, 1.0, 'rgba(120,170,255,0.25)', 'rgba(150,190,255,0.7)');
    seg(1.0, 0.7, '#ffb347', '#ff6a00');
    seg(0.7, 0.25, '#ffe9a8', '#ffd479');
    seg(0.25, 0.0, '#fff7e0', '#ffffff');
    g.fillStyle = 'rgba(255,255,255,0.9)';
    for (const f of [1.0, 0.7, 0.25, 0.0]) g.fillRect(barX - 8 * u, yOf(f) - 1 * u, bw + 16 * u, 2 * u);
    if (!compact) {
      const lab = (s, f, c) => txt(g, s, barX - 18 * u, yOf(f) + 5 * u, { size: 15 * u, weight: 600, align: 'right', spacing: 2 * u, color: c, shadow: 6 * u });
      lab('ATMOSPHERE', 1.06, '#bcd4ff'); lab('CONVECTION', 0.85, '#ffb066'); lab('RADIATIVE', 0.47, '#ffe9a8'); lab('CORE', 0.12, '#ffffff');
    }
    // marker
    const frac = clamp(lay.frac, 0, 1.12);
    const my = yOf(frac);
    g.fillStyle = '#fff'; g.shadowColor = rgba(lay.col, 1); g.shadowBlur = 16 * u;
    g.beginPath(); g.moveTo(barX - 4 * u, my); g.lineTo(barX - 20 * u, my - 11 * u); g.lineTo(barX - 20 * u, my + 11 * u); g.closePath(); g.fill();
    g.beginPath(); g.arc(barX + bw / 2, my, 8 * u, 0, 7); g.fill();
    g.restore();

    // readout block
    const x = (land ? 60 : 40) * u, y = H * (land ? 0.58 : 0.16);
    g.save(); g.globalAlpha = a;
    const col = rgba(lay.col, 1);
    txt(g, 'YOU ARE IN', x, y, { size: 17 * u, weight: 600, spacing: 5 * u, color: 'rgba(200,215,240,0.85)', shadow: 6 * u });
    txt(g, lay.name, x, y + 46 * u * (compact ? 0.85 : 1), { size: (compact ? 38 : 46) * u, weight: 700, spacing: 3 * u, color: col, shadow: 14 * u });
    const row = (k, v, yy) => { txt(g, k, x, yy, { size: 15 * u, weight: 600, spacing: 4 * u, color: 'rgba(190,205,235,0.8)', shadow: 6 * u }); txt(g, v, x, yy + 28 * u, { size: 28 * u, weight: 700, shadow: 10 * u }); };
    row('TEMPERATURE', lay.temp, y + 92 * u);
    row('DENSITY', lay.dens, y + 154 * u);
    if (lay.depthKm !== null && !compact) row(lay.depthKm <= 0 ? 'DEPTH' : 'DEPTH BELOW SURFACE', lay.depthKm <= 0 ? 'surface' : fmt(lay.depthKm) + ' km', y + 216 * u);
    g.restore();
  }

  quiz(g, T) {
    const { W, H, u, land } = this;
    const a = pulse(T, 208.4, 246, 0.8);
    if (a <= 0) return;
    const x = 60 * u, y = H * 0.17, w = 600 * u;
    const reveal = sstep(225.5, 226.6, T);
    g.save(); g.globalAlpha = a;
    rrect(g, x, y, w, 360 * u, 16 * u); g.fillStyle = 'rgba(6,10,22,0.62)'; g.fill(); g.strokeStyle = 'rgba(255,225,150,0.5)'; g.lineWidth = 2 * u; g.stroke();
    txt(g, 'QUICK QUESTION', x + 28 * u, y + 46 * u, { size: 20 * u, weight: 700, spacing: 6 * u, color: '#ffcf66' });
    txt(g, 'How long does ONE photon take', x + 28 * u, y + 94 * u, { size: 34 * u, weight: 700, shadow: 8 * u });
    txt(g, 'to escape the Sun?', x + 28 * u, y + 132 * u, { size: 34 * u, weight: 700, shadow: 8 * u });
    const opts = [['A', '8 minutes'], ['B', 'About 100 years'], ['C', '10,000 – 170,000 years']];
    opts.forEach(([k, v], i) => {
      const oy = y + 164 * u + i * 62 * u;
      const correct = i === 2;
      const hi = correct ? reveal : 0;
      rrect(g, x + 24 * u, oy, w - 48 * u, 50 * u, 10 * u);
      g.fillStyle = hi ? `rgba(60,200,120,${0.18 + 0.4 * hi})` : (reveal && !correct ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)'); g.fill();
      g.strokeStyle = hi ? `rgba(90,255,160,${hi})` : 'rgba(255,255,255,0.2)'; g.lineWidth = 2 * u; g.stroke();
      txt(g, k, x + 46 * u, oy + 26 * u, { size: 26 * u, weight: 700, base: 'middle', color: hi ? '#7dffb0' : '#ffcf66' });
      txt(g, v, x + 92 * u, oy + 26 * u, { size: 28 * u, weight: 600, base: 'middle', alpha: reveal && !correct ? 0.4 : 1 });
    });
    g.restore();

    // years counter
    const p = photonProgress(T);
    const ca = pulse(T, 210, 244, 0.8);
    if (ca > 0) {
      g.save(); g.globalAlpha = ca;
      const cx = land ? W * 0.5 : W * 0.5, cy = H * 0.12;
      txt(g, 'AGE OF THIS PHOTON SINCE IT WAS CREATED', cx, cy, { size: 18 * u, weight: 600, spacing: 5 * u, align: 'center', color: 'rgba(210,225,250,0.9)', shadow: 6 * u });
      txt(g, fmt(170000 * p) + ' YEARS', cx, cy + 66 * u, { size: 70 * u, weight: 700, align: 'center', color: '#ffe3a0', shadow: 18 * u });
      g.restore();
    }
    const na = pulse(T, 233.4, 247, 0.6);
    if (na > 0) {
      tag(g, u, 'NEUTRINO: LEAVES THE SUN IN ~2 SECONDS', W / 2, H * 0.22, { size: 28, color: [120, 190, 255], alpha: na });
      tag(g, u, 'PHOTON: TENS OF THOUSANDS OF YEARS', W / 2, H * 0.22 + 70 * u, { size: 24, color: [255, 225, 150], alpha: na * sstep(236, 237, T) });
    }
  }

  core(g, T) {
    const { W, H, u, land } = this;
    const cards = [
      { t: 254.4, big: '3%', lab: "OF THE SUN'S VOLUME" },
      { t: 258.2, big: '34%', lab: 'OF ITS MASS' },
      { t: 261.4, big: '99%', lab: 'OF ITS FUSION POWER' },
    ];
    const ga = pulse(T, 254, 265.5, 0.6);
    if (ga > 0) {
      const cw = 270 * u, gap = 24 * u, x0 = W / 2 - (3 * cw + 2 * gap) / 2, y = H * (land ? 0.1 : 0.3);
      cards.forEach((c, i) => {
        const a = ga * sstep(c.t, c.t + 0.6, T);
        if (a <= 0) return;
        const x = x0 + i * (cw + gap);
        g.save(); g.globalAlpha = a; rrect(g, x, y, cw, 150 * u, 14 * u); g.fillStyle = 'rgba(6,10,20,0.55)'; g.fill(); g.strokeStyle = 'rgba(255,240,200,0.5)'; g.lineWidth = 2 * u; g.stroke();
        txt(g, c.big, x + cw / 2, y + 88 * u, { size: 84 * u, weight: 700, align: 'center', color: '#fff3c9', shadow: 16 * u });
        txt(g, c.lab, x + cw / 2, y + 126 * u, { size: 19 * u, weight: 600, align: 'center', spacing: 3 * u, color: 'rgba(230,238,255,0.95)' });
        g.restore();
      });
    }
    const pa = pulse(T, 266.5, 275.5, 0.7);
    if (pa > 0) tag(g, u, '≈ 250 BILLION ATMOSPHERES OF PRESSURE', W / 2, H * (land ? 0.1 : 0.3), { size: 30, color: [255, 235, 190], alpha: pa });
  }

  endCard(g, T, isShort) {
    const { W, H, u, land } = this;
    const a = this.endAlpha = sstep(471.5, 473, T) * (1 - sstep(479.4, 480, T));
    if (a <= 0 || isShort) return;
    g.save(); g.globalAlpha = a;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H);
    txt(g, 'WHICH STAR SHOULD WE EXPLORE NEXT?', W / 2, H * 0.4, { size: 58 * u, weight: 700, align: 'center', spacing: 4 * u, shadow: 20 * u });
    txt(g, 'Tell us in the comments', W / 2, H * 0.4 + 62 * u, { size: 34 * u, weight: 600, align: 'center', color: '#ffcf66', shadow: 10 * u, spacing: 3 * u });
    const bw = 360 * u, bh = 84 * u, bx = W / 2 - bw / 2, by = H * 0.58;
    rrect(g, bx, by, bw, bh, 14 * u); g.fillStyle = '#e62117'; g.fill();
    txt(g, 'SUBSCRIBE', W / 2, by + bh / 2 + 2 * u, { size: 40 * u, weight: 700, align: 'center', base: 'middle', spacing: 5 * u });
    txt(g, 'TECHNICAL TALK INDIA', W / 2, by + bh + 64 * u, { size: 34 * u, weight: 700, align: 'center', spacing: 8 * u, shadow: 10 * u, color: '#ffe08a' });
    g.restore();
  }

  captions(g, T, info) {
    const { W, H, u, land } = this;
    const c = info.caption;
    if (!c || T < 0.5) return;
    if (this.endAlpha > 0.5 && !(this.mode === 'shorts')) return;
    const size = (land ? 40 : 56) * u;
    const maxW = W * (land ? 0.72 : 0.9);
    const words = c.text.split(' ');
    const lines = []; let cur = '';
    g.save(); g.font = `700 ${size}px ${FONT2}`;
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    g.restore();
    const a = sstep(0, 0.12, c.age);
    const y0 = H * (land ? 0.925 : 0.72) - (lines.length - 1) * size * 1.25;
    lines.forEach((ln, i) => txt(g, ln, W / 2, y0 + i * size * 1.25 + (1 - a) * 8 * u, { size, weight: 700, font: FONT2, align: 'center', alpha: a, stroke: 9 * u, shadow: 0 }));
  }

  overlays(g, T, Teff) {
    const { W, H } = this;
    let white = 0, black = 0, tint = [255, 255, 255];
    black = Math.max(black, this.mode === 'shorts' ? 0 : 1 - sstep(0, 1.3, T), this.mode === 'shorts' ? 0 : sstep(479.0, 480, T));
    if (this.mode !== 'shorts') for (const [a, b] of hookCuts) white = Math.max(white, 0.85 * (1 - sstep(a, a + 0.16, T)) * sstep(a - 0.001, a, T));
    white = Math.max(white, (this._flash || 0) * 0.8);
    const cr = bump(T, T_CROSS + 0.05, 0.25, 0.9);
    if (cr > white) { white = cr * 0.85; tint = [255, 190, 110]; }
    const z = bump(T, 285.0, 1.3, 0.9);
    if (z > white) { white = z; tint = [255, 250, 235]; }
    const m = bump(T, 385.3, 0.9, 0.8);
    if (m > white) { white = m * 0.9; tint = [200, 220, 255]; }
    const sn = bump(T, 445.6, 0.25, 1.6);
    if (sn > white) { white = sn; tint = [255, 245, 225]; }
    if (white > 0.002) { g.fillStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${clamp(white)})`; g.fillRect(0, 0, W, H); }
    if (black > 0.002) { g.fillStyle = `rgba(0,0,0,${clamp(black)})`; g.fillRect(0, 0, W, H); }
  }
}
