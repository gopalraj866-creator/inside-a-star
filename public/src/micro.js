import * as THREE from 'three';
import { NOISE, FULLSCREEN_VS } from './glsl.js';
import { FlowParticles, MODE } from './flow.js';
import { clamp, lerp, sstep, pulse, inv, easeOut, easeInOut, mulberry32, noise1 } from './util.js';
import { txt, tag, rrect, arrow, measure } from './hud.js';

// ======================================================================================
// MICRO WORLD: proton-proton chain at nuclear scale (285-345), then thermostat / CNO / lifetimes (345-385).
// Nucleons are drawn as shaded spheres (instanced). Everything is a pure function of time.
// ======================================================================================
const P_COL = [1.0, 0.30, 0.18];   // proton
const N_COL = [0.35, 0.58, 1.0];   // neutron
const POS_COL = [0.4, 1.0, 0.55];  // positron
const R_N = 1.0;                   // nucleon radius (world units)

export const T_PP = { start: 285, repel: 292, step1: 300, step2: 312, step3: 324, mass: 336, end: 345 };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const mix3 = (a, b, t) => a.clone().lerp(b, t);

// nucleon cluster offsets (so He-3 / He-4 look like small clumps)
const OFF_D = [V(-0.55, 0, 0), V(0.55, 0, 0)];
const OFF_HE3 = [V(-0.55, -0.32, 0.0), V(0.55, -0.32, 0.0), V(0.0, 0.62, 0.15)];
const OFF_HE4 = [V(-0.55, -0.5, -0.3), V(0.55, -0.5, -0.3), V(0.0, 0.55, -0.3), V(0.0, -0.05, 0.75)];

export const MICRO_TEXT = [
  { t0: 286.0, t1: 297, text: 'PROTONS  ·  HYDROGEN NUCLEI', col: [255, 120, 80] },
  { t0: 292.5, t1: 299, text: 'SAME CHARGE → THEY REPEL', col: [255, 200, 120] },
  { t0: 300.0, t1: 312, text: 'STEP 1:  p + p → deuteron + positron + neutrino', col: [120, 220, 255] },
  { t0: 312.5, t1: 324, text: 'STEP 2:  deuteron + p → helium-3 + gamma ray', col: [255, 240, 160] },
  { t0: 324.5, t1: 336, text: 'STEP 3:  He-3 + He-3 → helium-4 + 2 protons', col: [255, 200, 120] },
];

class Actors {
  constructor(max = 96) {
    this.max = max;
    this.n = 0;
    this.pos = Array.from({ length: max }, () => new THREE.Vector3());
    this.col = Array.from({ length: max }, () => [1, 1, 1]);
    this.sc = new Float32Array(max);
    this.glow = new Float32Array(max);
  }
  reset() { this.n = 0; }
  add(p, c, s = 1, glow = 0) {
    if (this.n >= this.max) return;
    this.pos[this.n].copy(p); this.col[this.n] = c; this.sc[this.n] = s; this.glow[this.n] = glow; this.n++;
  }
}

// ----- choreography: returns events for time T -----
// Hero stage objects live around the origin; each stage is a pure function of time.
export function choreography(T, out) {
  // returns { nucleons: [...], flashes: [{p, a, size, col}], rays: [{p, d, a, col, len}], label }
  out.nuc.length = 0; out.fl.length = 0; out.pts.length = 0;
  const nuc = (p, c, s = 1) => out.nuc.push({ p, c, s });
  const fl = (p, a, size, col) => { if (a > 0.003) out.fl.push({ p, a: a * 0.4, size, col }); };
  const pt = (p, c, s) => out.pts.push({ p, c, s });

  // ---- Stage A (285-300): approach, Coulomb repulsion ----
  if (T < T_PP.step1) {
    const u = clamp((T - 286) / 14);
    const wob = (k, ax) => Math.sin(T * (1.7 + k * 0.31) + k * 2.1 + ax) * 0.28;
    // two hero protons drifting toward each other, decelerating as they near each other
    const d = lerp(15, 3.4, easeOut(u));
    nuc(V(-d / 2 + wob(1, 0), wob(2, 1), wob(3, 2)), P_COL);
    nuc(V(d / 2 + wob(4, 3), wob(5, 4), wob(6, 5)), P_COL);
    // repulsion glow appears between them
    fl(V(0, 0, 0), sstep(292.5, 297, T) * (1 - sstep(299, 300, T)), 3.4, [1.0, 0.8, 0.35]);
  }

  // ---- Stage B (300-312): p + p -> d + e+ + nu ----
  if (T >= T_PP.step1 && T < T_PP.step2) {
    const u = (T - T_PP.step1) / 12;
    const hit = 0.38;
    if (u < hit) {
      const s = easeInOut(u / hit);
      const d = lerp(3.4, 1.1, s);
      nuc(V(-d / 2, 0, 0), P_COL); nuc(V(d / 2, 0, 0), P_COL);
      fl(V(0, 0, 0), 0.5 * s, 3.0, [1.0, 0.8, 0.4]);
    } else {
      const v = (u - hit) / (1 - hit);
      const bind = sstep(0, 0.12, v);
      // transformation: right proton blends P_COL -> N_COL
      const k = sstep(0.0, 0.14, v);
      const col = [lerp(P_COL[0], N_COL[0], k), lerp(P_COL[1], N_COL[1], k), lerp(P_COL[2], N_COL[2], k)];
      const drift = V(0.9 * v, 0.1 * v, 0);
      nuc(OFF_D[0].clone().add(drift), P_COL); nuc(OFF_D[1].clone().add(drift), col);
      fl(V(0, 0, 0), (1 - sstep(0, 0.22, v)) * 2.4, 6.0, [1.0, 0.95, 0.8]);
      // positron and neutrino leave
      const pe = easeOut(clamp(v * 1.35));
      pt(V(-2 - 11 * pe, 1.0 + 7 * pe, 1.2 * pe), POS_COL, 1.0 * (1 - sstep(0.85, 1, v)));
      const nv = v * v * 0.4 + v * 1.2;
      pt(V(2 + 34 * nv, -1.0 - 12 * nv, 3.0 * nv), [0.35, 0.7, 1.0], 1.1);
    }
  }

  // ---- Stage C (312-324): d + p -> He-3 + gamma ----
  if (T >= T_PP.step2 && T < T_PP.step3) {
    const u = (T - T_PP.step2) / 12;
    const hit = 0.46;
    const base = V(0.9, 0.1, 0);
    if (u < hit) {
      const s = easeInOut(u / hit);
      const px = lerp(-12, -1.9, s);
      nuc(OFF_D[0].clone().add(base), P_COL); nuc(OFF_D[1].clone().add(base), N_COL);
      nuc(V(px, 0.1, 0), P_COL);
    } else {
      const v = (u - hit) / (1 - hit);
      const k = easeOut(clamp(v * 3));
      const ctr = base.clone().lerp(V(0.2, 0, 0), k);
      const off3 = [OFF_HE3[0], OFF_HE3[1], OFF_HE3[2]];
      const cols = [P_COL, N_COL, P_COL];
      const from = [OFF_D[0].clone().add(base), OFF_D[1].clone().add(base), V(-1.9, 0.1, 0)];
      off3.forEach((o, i) => nuc(from[i].clone().lerp(o.clone().add(ctr), k), cols[i]));
      fl(V(0, 0, 0), (1 - sstep(0, 0.2, v)) * 2.0, 6.5, [1.0, 1.0, 0.9]);
      // gamma ray: bright streak shooting out
      const g = clamp(v * 1.6);
      pt(V(-4 - 28 * g, 4 + 12 * g, 2), [1.0, 1.0, 0.95], 1.4 * (1 - sstep(0.7, 1.0, v)));
    }
  }

  // ---- Stage D (324-336): He-3 + He-3 -> He-4 + 2p ----
  if (T >= T_PP.step3 && T < T_PP.mass) {
    const u = (T - T_PP.step3) / 12;
    const hit = 0.45;
    const cols3 = [P_COL, N_COL, P_COL];
    if (u < hit) {
      const s = easeInOut(u / hit);
      const dx = lerp(11, 2.4, s);
      OFF_HE3.forEach((o, i) => { nuc(o.clone().add(V(-dx, 0, 0)), cols3[i]); nuc(V(-o.x, o.y, o.z).add(V(dx, 0, 0)), i === 2 ? P_COL : cols3[i]); });
    } else {
      const v = (u - hit) / (1 - hit);
      const k = easeOut(clamp(v * 2.4));
      const e = easeOut(clamp(v * 1.2));
      // helium-4 forms (2p + 2n); two protons fly off
      const heSrc = [V(-2.4 + OFF_HE3[0].x, OFF_HE3[0].y, 0), V(-2.4 + OFF_HE3[1].x, OFF_HE3[1].y, 0), V(2.4 - OFF_HE3[0].x, OFF_HE3[0].y, 0), V(2.4 - OFF_HE3[1].x, OFF_HE3[1].y, 0)];
      const heCols = [P_COL, N_COL, P_COL, N_COL];
      heSrc.forEach((s, i) => nuc(s.clone().lerp(OFF_HE4[i], k), heCols[i]));
      // the two spare protons
      nuc(V(-2.4 + OFF_HE3[2].x - 9.5 * e, OFF_HE3[2].y + 5.5 * e, 0.4 * e), P_COL);
      nuc(V(2.4 - OFF_HE3[2].x + 9.5 * e, OFF_HE3[2].y - 5.5 * e, -0.4 * e), P_COL);
      fl(V(0, 0, 0), (1 - sstep(0, 0.2, v)) * 2.8, 8.0, [1.0, 1.0, 0.85]);
    }
  }

  // ---- Stage E (336-345): He-4 sits at center, energy radiates ----
  if (T >= T_PP.mass) {
    const v = clamp((T - T_PP.mass) / 9);
    OFF_HE4.forEach((o, i) => nuc(o.clone().multiplyScalar(1 + 0.02 * Math.sin(T * 5 + i)), i % 2 ? N_COL : P_COL));
    fl(V(0, 0, 0), 0.55 + 0.3 * Math.sin(T * 3), 5.0, [1.0, 0.9, 0.6]);
  }
  return out;
}

export class MicroWorld {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // background haze (white-hot plasma)
    this.hazeMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 1080) }, uDim: { value: 1 }, uTint: { value: new THREE.Vector3(1, 0.7, 0.4) } },
      vertexShader: FULLSCREEN_VS,
      fragmentShader: `precision highp float; ${NOISE} varying vec2 vUv; uniform float uTime, uDim; uniform vec2 uRes; uniform vec3 uTint;
        void main(){ vec2 p = (vUv-0.5)*vec2(uRes.x/uRes.y,1.0);
          float n = fbm3(vec3(p*1.8, uTime*0.09))*0.5+0.5;
          float v = 1.0 - length(vUv-0.5)*1.3;
          float k = clamp(v + (n-0.5)*0.8, 0.0, 1.0);
          vec3 col = uTint*mix(0.025, 0.36, k*k);
          gl_FragColor = vec4(col*uDim, 1.0); }`,
    });
    this.haze = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hazeMat);
    this.haze.frustumCulled = false; this.haze.renderOrder = -100;
    this.group.add(this.haze);

    // background plasma swarm (the rest of the core, always jittering)
    this.swarm = new FlowParticles({
      count: 5200, mode: MODE.CORE, seed: 21, box: 90, sizeWorld: 0.12, minPx: 0.8, maxPx: 10, streak: 0.08, streakGain: 1.0, maxLen: 60,
      range: [0, 400], fade: 2, colA: [1.0, 0.4, 0.12], colB: [1.0, 0.8, 0.45], colC: [1.0, 0.95, 0.85], aux: [1.6, 1.4, 0.015, 0], aux2: [6, 14, 0, 0], alpha: 0.9,
    });
    this.group.add(this.swarm.mesh);
    this.swarmFar = new FlowParticles({
      count: 700, mode: MODE.MOTES, seed: 22, box: 100, sizeWorld: 2.4, minPx: 5, maxPx: 300, soft: 1, range: [0, 1e4], fade: 1,
      colA: [0.5, 0.18, 0.05], colB: [1.0, 0.55, 0.2], colC: [1.0, 0.9, 0.6], aux: [2.2, 0, 0, 0], aux2: [10, 25, 0, 0], alpha: 0.05,
    });
    this.group.add(this.swarmFar.mesh);

    // nucleon spheres
    this.act = new Actors(40);
    const sg = new THREE.SphereGeometry(R_N, 32, 20);
    this.nucMat = new THREE.ShaderMaterial({
      uniforms: { uBoost: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vC; varying vec3 vV;
        void main(){ vC = instanceColor; vec4 mv = modelViewMatrix*instanceMatrix*vec4(position,1.0); vN = normalize(mat3(modelViewMatrix)*mat3(instanceMatrix)*normal); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `precision highp float; varying vec3 vN; varying vec3 vC; varying vec3 vV; uniform float uBoost;
        void main(){ vec3 n = normalize(vN); vec3 v = normalize(vV);
          float ndl = clamp(dot(n, normalize(vec3(-0.4,0.7,0.6)))*0.5+0.5, 0.0, 1.0);
          float rim = pow(1.0-clamp(dot(n,v),0.0,1.0), 2.6);
          vec3 col = vC*(0.28 + 1.05*ndl*ndl) + vC*rim*1.8 + vec3(1.0)*pow(clamp(dot(reflect(-normalize(vec3(-0.4,0.7,0.6)), n), v),0.0,1.0), 40.0)*0.6;
          gl_FragColor = vec4(col*uBoost, 1.0); }`,
    });
    this.nuc = new THREE.InstancedMesh(sg, this.nucMat, 40);
    this.nuc.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(40 * 3), 3);
    this.nuc.frustumCulled = false; this.nuc.renderOrder = 7;
    this.group.add(this.nuc);

    // glows (flashes) and points (positron / neutrino / gamma) as billboard sprites
    this.glowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `attribute vec3 aCol; attribute float aA; varying vec3 vC; varying float vAA; varying vec2 vQ;
        void main(){ vC = aCol; vAA = aA; vQ = position.xy; vec4 mv = modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0); float s = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2])); mv.xy += position.xy*s; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `precision highp float; varying vec3 vC; varying float vAA; varying vec2 vQ;
        void main(){ float r = length(vQ); if (r > 1.0) discard; float I = exp(-r*r*4.5) + 0.25*exp(-r*2.0); gl_FragColor = vec4(vC*I*vAA, I*vAA); }`,
    });
    const quad = new THREE.PlaneGeometry(2, 2);
    const ig = new THREE.InstancedBufferGeometry(); ig.index = quad.index; ig.attributes.position = quad.attributes.position;
    this.nGlow = 24;
    ig.setAttribute('aCol', new THREE.InstancedBufferAttribute(new Float32Array(this.nGlow * 3), 3));
    ig.setAttribute('aA', new THREE.InstancedBufferAttribute(new Float32Array(this.nGlow), 1));
    ig.instanceCount = this.nGlow;
    this.glow = new THREE.InstancedMesh(ig, this.glowMat, this.nGlow);
    this.glow.frustumCulled = false; this.glow.renderOrder = 9;
    this.group.add(this.glow);

    // energy rings for the bounce moments
    this.out = { nuc: [], fl: [], pts: [] };
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
  }

  update(T, ctx, S) {
    const M = S.micro;
    this.group.visible = M.show > 0.001;
    if (!this.group.visible) return;
    const hu = this.hazeMat.uniforms; hu.uTime.value = T; hu.uRes.value.set(ctx.width, ctx.height); hu.uDim.value = M.haze;
    this.swarm.update(T, ctx, { uAlpha: 0.9 * M.swarm }); this.swarmFar.update(T, ctx, { uAlpha: 0.05 * M.swarm });
    this.swarm.mesh.visible = M.swarm > 0.01; this.swarmFar.mesh.visible = M.swarm > 0.01;

    const fuse = M.fusion > 0.001;
    this.nuc.visible = fuse; this.glow.visible = fuse;
    if (!fuse) return;
    choreography(T, this.out);
    const o = this.out;
    let k = 0;
    for (const n of o.nuc) {
      if (k >= 40) break;
      this._s.setScalar(n.s * M.fusion); this._m.compose(n.p, this._q, this._s);
      this.nuc.setMatrixAt(k, this._m); this.nuc.instanceColor.setXYZ(k, n.c[0], n.c[1], n.c[2]); k++;
    }
    this.nuc.count = k; this.nuc.instanceMatrix.needsUpdate = true; this.nuc.instanceColor.needsUpdate = true;

    const ca = this.glow.geometry.attributes.aCol, aa = this.glow.geometry.attributes.aA;
    let g = 0;
    const put = (p, a, size, col) => {
      if (g >= this.nGlow) return;
      this._s.setScalar(size); this._m.compose(p, this._q, this._s); this.glow.setMatrixAt(g, this._m);
      ca.setXYZ(g, col[0], col[1], col[2]); aa.setX(g, a * M.fusion); g++;
    };
    for (const f of o.fl) put(f.p, f.a, f.size, f.col);
    for (const p of o.pts) put(p.p, p.s > 0 ? 1.4 : 0, 1.1 + (p.s || 0) * 0.5, p.c);
    // nucleon halo (soft glow behind each nucleon)
    for (const n of o.nuc) put(n.p, 0.22, 2.3, n.c);
    for (; g < this.nGlow;) { aa.setX(g, 0); this._s.setScalar(0.0001); this._m.compose(V(), this._q, this._s); this.glow.setMatrixAt(g, this._m); g++; }
    this.glow.instanceMatrix.needsUpdate = true; ca.needsUpdate = true; aa.needsUpdate = true;
  }
}

// ----- camera for 285-385 -----
function camera(T) {
  if (T < T_PP.end) {
    const a = 0.45 * Math.sin((T - 285) * 0.09) + 0.1;
    const dist = lerp(30, 17.5, sstep(285.2, 292, T)) + (T > 336 ? lerp(0, 4, sstep(336, 345, T)) : 0);
    const el = 0.12 + 0.06 * Math.sin((T - 285) * 0.07);
    return { pos: [Math.sin(a) * dist * Math.cos(el), Math.sin(el) * dist, Math.cos(a) * dist * Math.cos(el)], tgt: [0, 0, 0], fov: 50, roll: 0 };
  }
  // 345-385: pull back, diagrams take the stage over a dim plasma
  const s = sstep(345, 352, T);
  return { pos: [0, 0, lerp(21.5, 60, s)], tgt: [0, 0, 0], fov: 50, roll: 0 };
}

function state(T) {
  const inM = T >= 285 && T < 385.5;
  const fusion = T >= 285.6 && T < 346 ? sstep(285.6, 287.4, T) * (1 - sstep(344.5, 346, T)) : 0;
  return {
    show: inM ? 1 : 0, fusion, swarm: inM ? 1 : 0,
    haze: lerp(1.0, 0.55, sstep(300, 345, T)) * (1 - 0.45 * sstep(346, 349, T)),
  };
}

// ======================================================================================
// HUD: fusion captions, mass-defect counter, thermostat diagram, CNO cycle, lifetime chart
// ======================================================================================
function drawHud(g, hud, T, Teff, S, info) {
  if (Teff < 285 || Teff >= 385.8) return;
  const { W, H, u, land } = hud;
  // step labels
  for (const t of MICRO_TEXT) {
    const a = pulse(Teff, t.t0, t.t1, 0.6);
    if (a > 0) tag(g, u, t.text, W / 2, H * (land ? 0.075 : 0.2), { size: land ? 26 : 22, color: t.col, alpha: a });
  }
  // legend
  const la = pulse(Teff, 286.5, 337, 0.8);
  if (la > 0) {
    const items = [['PROTON', P_COL], ['NEUTRON', N_COL], ['POSITRON', POS_COL], ['NEUTRINO', [90, 180, 255].map((x) => x / 255)], ['GAMMA RAY', [1, 1, 0.9]]];
    const x0 = (land ? 60 : 40) * u, y0 = H * (land ? 0.34 : 0.3);
    g.save(); g.globalAlpha = la;
    items.forEach(([nm, c], i) => {
      const y = y0 + i * 40 * u;
      g.fillStyle = `rgb(${c.map((v) => Math.round(clamp(v) * 255)).join(',')})`; g.shadowColor = g.fillStyle; g.shadowBlur = 12 * u;
      g.beginPath(); g.arc(x0 + 10 * u, y, 10 * u, 0, 7); g.fill(); g.shadowBlur = 0;
      txt(g, nm, x0 + 34 * u, y + 7 * u, { size: 20 * u, weight: 600, spacing: 3 * u, shadow: 6 * u });
    });
    g.restore();
  }
  // mass defect panel
  const ma = pulse(Teff, 334.8, 345.2, 0.6);
  if (ma > 0) {
    const w = (land ? 760 : 920) * u, h = 250 * u, x = W / 2 - w / 2, y = H * (land ? 0.16 : 0.32);
    g.save(); g.globalAlpha = ma;
    rrect(g, x, y, w, h, 16 * u); g.fillStyle = 'rgba(6,10,22,0.62)'; g.fill(); g.strokeStyle = 'rgba(255,225,150,0.55)'; g.lineWidth = 2 * u; g.stroke();
    const p = sstep(336, 340, Teff);
    txt(g, '4 HYDROGEN NUCLEI', x + w * 0.27, y + 70 * u, { size: 24 * u, weight: 600, spacing: 3 * u, align: 'center' });
    txt(g, '1.0000', x + w * 0.27, y + 128 * u, { size: 66 * u, weight: 700, align: 'center', color: '#ff9d80' });
    txt(g, '→', x + w * 0.5, y + 118 * u, { size: 60 * u, weight: 700, align: 'center' });
    txt(g, '1 HELIUM NUCLEUS', x + w * 0.73, y + 70 * u, { size: 24 * u, weight: 600, spacing: 3 * u, align: 'center' });
    txt(g, (1 - 0.007 * p).toFixed(4), x + w * 0.73, y + 128 * u, { size: 66 * u, weight: 700, align: 'center', color: '#9cc4ff' });
    const k = sstep(339, 341, Teff);
    txt(g, 'E = m c²', x + w / 2, y + 196 * u, { size: 54 * u, weight: 700, align: 'center', color: '#ffe08a', alpha: k, shadow: 14 * u });
    txt(g, '0.7 % of the mass becomes energy  ·  26.7 MeV per helium nucleus', x + w / 2, y + 232 * u, { size: 19 * u, weight: 600, align: 'center', alpha: k, color: 'rgba(225,235,255,0.95)' });
    g.restore();
  }

  // ---- 346-364: thermostat (balance) ----
  const ba = pulse(Teff, 346.2, 365.2, 0.8);
  if (ba > 0) {
    g.save(); g.globalAlpha = ba;
    const cx = W / 2, cy = H * (land ? 0.47 : 0.45), R = (land ? 150 : 170) * u;
    const t = Teff;
    // energy production counter
    if (Teff < 354) {
      txt(g, '≈ 4,000,000 TONNES', cx, H * (land ? 0.2 : 0.26), { size: 70 * u, weight: 700, align: 'center', color: '#ffe08a', shadow: 16 * u });
      txt(g, 'OF MASS CONVERTED TO ENERGY — EVERY SECOND', cx, H * (land ? 0.2 : 0.26) + 44 * u, { size: 24 * u, weight: 600, align: 'center', spacing: 4 * u, shadow: 8 * u });
    }
    // breathing core (thermostat): radius oscillates; fusion rate follows inversely
    const ph = Math.sin((t - 355.8) * 1.6);
    const showT = Teff > 355.5;
    const rr = R * (1 + (showT ? 0.14 * ph : 0));
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rr * 1.8);
    const heat = showT ? 0.5 - 0.5 * ph : 0.5;
    gr.addColorStop(0, `rgba(255,${Math.round(235 - 60 * heat)},${Math.round(190 - 120 * heat)},0.95)`);
    gr.addColorStop(0.55, 'rgba(255,150,60,0.55)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr * 1.8, 0, 7); g.fill();
    g.lineWidth = 4 * u; g.strokeStyle = 'rgba(255,230,170,0.9)'; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.stroke();
    // arrows: gravity in (blue), pressure out (orange)
    const N = 12;
    for (let i = 0; i < N; i++) {
      const an = (i / N) * Math.PI * 2 + 0.2;
      const c = Math.cos(an), s = Math.sin(an);
      const gi = 1 + (showT ? 0.0 : 0);
      arrow(g, cx + c * (R * 2.15), cy + s * (R * 2.15), cx + c * (rr * 1.5), cy + s * (rr * 1.5), 5 * u, 'rgba(110,170,255,0.95)');
      arrow(g, cx + c * (rr * 0.55), cy + s * (rr * 0.55), cx + c * (rr * 1.28 + (showT ? 14 * u * ph : 0)), cy + s * (rr * 1.28 + (showT ? 14 * u * ph : 0)), 5 * u, 'rgba(255,170,70,0.95)');
    }
    txt(g, 'GRAVITY', cx - R * 2.55, cy - R * 1.05, { size: 28 * u, weight: 700, color: '#8fb8ff', align: 'center', spacing: 4 * u, shadow: 8 * u });
    txt(g, 'FUSION PRESSURE', cx + R * 2.55, cy - R * 1.05, { size: 28 * u, weight: 700, color: '#ffb066', align: 'center', spacing: 4 * u, shadow: 8 * u });
    if (showT) {
      const fast = ph < 0;
      const msg1 = fast ? 'CORE TOO COOL → SHRINKS → HEATS UP → MORE FUSION' : 'CORE TOO HOT → EXPANDS → COOLS → LESS FUSION';
      tag(g, u, 'SELF-REGULATING THERMOSTAT', cx, H * (land ? 0.075 : 0.2), { size: 28, color: [255, 220, 150], alpha: 1 });
      txt(g, msg1, cx, cy + R * 2.55, { size: (land ? 28 : 24) * u, weight: 700, align: 'center', spacing: 3 * u, shadow: 10 * u, color: fast ? '#ffd28a' : '#a9cdff' });
    }
    g.restore();
  }

  // ---- 364-377: CNO cycle ----
  const ca = pulse(Teff, 364.2, 377.6, 0.9);
  if (ca > 0) {
    g.save(); g.globalAlpha = ca;
    const cx = W / 2, cy = H * (land ? 0.52 : 0.48), R = (land ? 250 : 330) * u;
    const nodes = [
      ['¹²C', 0, [255, 235, 210]], ['¹³N', 1, [140, 220, 255]], ['¹³C', 2, [255, 235, 210]],
      ['¹⁴N', 3, [140, 220, 255]], ['¹⁵O', 4, [255, 190, 140]], ['¹⁵N', 5, [140, 220, 255]],
    ];
    const ang = (i) => -Math.PI / 2 + (i / 6) * Math.PI * 2;
    const lab = [
      '+ proton → γ', 'decays: e⁺ + ν', '+ proton → γ', '+ proton → γ', 'decays: e⁺ + ν', '+ proton → ⁴He + ¹²C',
    ];
    // ring
    g.lineWidth = 6 * u; g.strokeStyle = 'rgba(255,200,130,0.35)'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    const prog = ((Teff - 365) / 11) * 6;       // 0..6 around the loop
    const pa = ang(0) + (prog / 6) * Math.PI * 2;
    g.fillStyle = '#fff'; g.shadowColor = '#ffcf66'; g.shadowBlur = 24 * u;
    if (Teff > 365 && Teff < 376.5) { g.beginPath(); g.arc(cx + Math.cos(pa) * R, cy + Math.sin(pa) * R, 12 * u, 0, 7); g.fill(); }
    g.shadowBlur = 0;
    nodes.forEach(([nm, i, col]) => {
      const a = ang(i), x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      g.beginPath(); g.arc(x, y, 44 * u, 0, 7); g.fillStyle = 'rgba(8,12,24,0.88)'; g.fill(); g.lineWidth = 3 * u; g.strokeStyle = `rgb(${col.join(',')})`; g.stroke();
      txt(g, nm, x, y + 11 * u, { size: 34 * u, weight: 700, align: 'center' });
      const am = a + Math.PI / 6, lx = cx + Math.cos(am) * (R + 92 * u), ly = cy + Math.sin(am) * (R + 92 * u);
      txt(g, lab[i], lx, ly + 6 * u, { size: 19 * u, weight: 600, align: 'center', color: 'rgba(235,240,255,0.95)', shadow: 6 * u });
    });
    txt(g, 'CNO CYCLE', cx, cy - 8 * u, { size: 44 * u, weight: 700, align: 'center', spacing: 6 * u, color: '#ffd28a', shadow: 14 * u });
    txt(g, 'carbon is a catalyst — it comes back', cx, cy + 30 * u, { size: 22 * u, weight: 600, align: 'center', color: 'rgba(225,235,255,0.95)' });
    txt(g, 'net result: 4 H → 1 He', cx, cy + 62 * u, { size: 22 * u, weight: 600, align: 'center', color: 'rgba(225,235,255,0.95)' });
    tag(g, u, 'DOMINANT IN STARS HEAVIER THAN ≈ 1.3 SUNS  ·  < 10 % OF THE SUN’S ENERGY', cx, H * (land ? 0.075 : 0.2), { size: land ? 24 : 20, color: [255, 200, 140], alpha: 1 });
    g.restore();
  }

  // ---- 376-385: lifetimes ----
  const la2 = pulse(Teff, 376.4, 385.3, 0.8);
  if (la2 > 0) {
    g.save(); g.globalAlpha = la2;
    const w = (land ? 1000 : 940) * u, x = W / 2 - w / 2, y0 = H * (land ? 0.2 : 0.3);
    txt(g, 'HOW LONG DOES THE FUEL LAST?', W / 2, y0, { size: 34 * u, weight: 700, spacing: 6 * u, align: 'center', shadow: 12 * u });
    const rows = [
      { nm: 'RED DWARF  (~0.1 SUN)', val: 'TRILLIONS OF YEARS', f: 1.0, col: '#ff8a6a', t: 377.0 },
      { nm: 'THE SUN', val: '≈ 10 BILLION YEARS', f: 0.62, col: '#ffd070', t: 379.0 },
      { nm: 'GIANT  (25 SUNS)', val: '≈ 7 MILLION YEARS', f: 0.14, col: '#7fb8ff', t: 381.0 },
    ];
    rows.forEach((r, i) => {
      const y = y0 + 70 * u + i * 106 * u;
      const k = easeOut(sstep(r.t, r.t + 1.2, Teff));
      txt(g, r.nm, x, y, { size: 22 * u, weight: 700, spacing: 3 * u, shadow: 8 * u, alpha: k });
      rrect(g, x, y + 16 * u, w, 40 * u, 8 * u); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fill();
      rrect(g, x, y + 16 * u, Math.max(14 * u, w * r.f * k), 40 * u, 8 * u); g.fillStyle = r.col; g.fill();
      txt(g, r.val, x + w, y, { size: 22 * u, weight: 700, spacing: 2 * u, align: 'right', alpha: k, shadow: 8 * u, color: r.col });
    });
    txt(g, 'Heavier star → hotter core → far faster fusion (CNO ∝ T¹⁶)', W / 2, y0 + 70 * u + 3 * 106 * u + 6 * u, { size: 22 * u, weight: 600, align: 'center', color: 'rgba(225,235,255,0.95)', shadow: 8 * u, alpha: sstep(382.5, 383.5, Teff) });
    g.restore();
  }
}

export const micro = { camera, state, drawHud };
