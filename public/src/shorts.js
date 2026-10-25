// Builds the YouTube Short edit: whole narration lines from the master film, cut together.
// Pure functions (no DOM) so the render script, the audio mixer and the page share one definition.
import { LINES, SHORT_IDS, WORDS_PER_SEC } from './script.js';

export function lineTimes(timing) {
  const out = {};
  let prevEnd = 0;
  for (const L of LINES) {
    const tm = timing && timing[L.id];
    if (tm) { out[L.id] = { start: tm.start, dur: tm.dur }; continue; }
    const words = L.text.trim().split(/\s+/).length;
    const dur = Math.max(1.6, words / WORDS_PER_SEC + 0.25);
    const start = Math.max(L.t, prevEnd + 0.1);
    out[L.id] = { start, dur }; prevEnd = start + dur;
  }
  return out;
}

export function buildShorts(timing, ids = SHORT_IDS, pre = 0.3, post = 0.45) {
  const lt = lineTimes(timing);
  const wins = ids.map((id) => ({ a: Math.max(0, lt[id].start - pre), b: lt[id].start + lt[id].dur + post }));
  wins.sort((x, y) => x.a - y.a);
  const merged = [];
  for (const w of wins) {
    const last = merged[merged.length - 1];
    if (last && w.a - last.b < 0.8) last.b = Math.max(last.b, w.b); else merged.push({ a: w.a, b: w.b });
  }
  let out0 = 0;
  const segs = merged.map((w) => { const s = { src0: w.a, src1: w.b, out0, len: w.b - w.a }; out0 += s.len; return s; });
  const total = out0;
  const map = (T) => {
    for (let i = segs.length - 1; i >= 0; i--) {
      if (T >= segs[i].out0) {
        const s = segs[i], tin = Math.min(T - s.out0, s.len);
        return { src: s.src0 + tin, seg: i, tin, remain: s.len - tin };
      }
    }
    return { src: segs[0].src0, seg: 0, tin: 0, remain: segs[0].len };
  };
  return { segs, total, map };
}
