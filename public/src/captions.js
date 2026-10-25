// Burned-in captions: split each narration line into short readable chunks and time them
// across the line's real audio duration (timing.json from the TTS step) or an estimate.

export function buildCaptions(lines, timing) {
  const out = [];
  for (const L of lines) {
    const tm = timing && timing[L.id];
    const start = tm ? tm.start : L.t;
    const words = L.text.trim().split(/\s+/);
    const dur = tm ? tm.dur : Math.max(1.6, words.length / 2.45 + 0.25);
    const chunks = [];
    let cur = [];
    const len = () => cur.join(' ').length;
    for (let i = 0; i < words.length; i++) {
      cur.push(words[i]);
      const w = words[i];
      const soft = /[,;:—–-]$/.test(w) || /[.?!…]$/.test(w);
      if ((soft && len() >= 16) || len() >= 40 || (len() >= 26 && i + 1 < words.length && words[i + 1].length > 8)) {
        chunks.push(cur.join(' ')); cur = [];
      }
    }
    if (cur.length) { if (chunks.length && cur.join(' ').length < 10) chunks[chunks.length - 1] += ' ' + cur.join(' '); else chunks.push(cur.join(' ')); }
    const total = chunks.reduce((a, c) => a + c.length + 6, 0);
    let t = start;
    for (const c of chunks) {
      const d = ((c.length + 6) / total) * dur;
      out.push({ a: t, b: t + d, text: c.replace(/\s+—\s*$/, ' —') });
      t += d;
    }
  }
  return out;
}

export function captionAt(caps, T) {
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i];
    if (T >= c.a - 0.05 && T < c.b + 0.12) return { text: c.text, k: (T - c.a) / Math.max(0.2, c.b - c.a), age: T - c.a };
  }
  return null;
}
