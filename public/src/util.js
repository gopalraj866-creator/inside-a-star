// Small deterministic helpers. Nothing in this project uses Math.random() or Date.now():
// every frame is a pure function of time, so render chunks can run on different machines.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;
export const pulse = (t, a, b, fade = 0.5) => sstep(a, a + fade, t) * (1 - sstep(b - fade, b, t));

export function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// C1-continuous Hermite track through keys [[t, v0, v1, ...], ...] (finite-difference tangents).
// Repeating a key value twice gives a smooth "hold".
export function track(keys) {
  const n = keys.length;
  const d = keys[0].length - 1;
  const tan = keys.map((k, i) => {
    const a = keys[Math.max(0, i - 1)];
    const b = keys[Math.min(n - 1, i + 1)];
    const dt = b[0] - a[0] || 1;
    return Array.from({ length: d }, (_, j) => (b[j + 1] - a[j + 1]) / dt);
  });
  return function (t) {
    if (t <= keys[0][0]) return keys[0].slice(1);
    if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
    let i = 0;
    while (keys[i + 1][0] < t) i++;
    const k0 = keys[i], k1 = keys[i + 1];
    const h = k1[0] - k0[0];
    const s = (t - k0[0]) / h, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    return Array.from({ length: d }, (_, j) =>
      h00 * k0[j + 1] + h10 * h * tan[i][j] + h01 * k1[j + 1] + h11 * h * tan[i + 1][j]);
  };
}

// Piecewise-linear lookup in log space for physical tables: rows [[x, value], ...] ascending x.
export function logTable(rows) {
  return function (x) {
    if (x <= rows[0][0]) return rows[0][1];
    if (x >= rows[rows.length - 1][0]) return rows[rows.length - 1][1];
    let i = 0;
    while (rows[i + 1][0] < x) i++;
    const [x0, y0] = rows[i], [x1, y1] = rows[i + 1];
    const s = (x - x0) / (x1 - x0);
    return Math.exp(Math.log(y0) * (1 - s) + Math.log(y1) * s);
  };
}

// cheap smooth value noise (1D) for camera sway, deterministic
export function noise1(x, seed = 0) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

export const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
