import * as THREE from 'three';
import { NOISE, FULLSCREEN_VS } from './glsl.js';
import { FlowParticles, MODE } from './flow.js';
import { clamp, lerp, sstep, pulse, inv, easeOut, easeIn, easeInOut, mulberry32, noise1, fmt } from './util.js';
import { txt, tag, rrect, measure } from './hud.js';

// ======================================================================================
// MASSIVE WORLD (385-480): a 25-solar-mass star's onion layers -> iron-core collapse -> supernova -> stardust.
// Stage numbers (temperatures, durations) are from the 25 M_sun model table in Universe (Freedman & Kaufmann).
// ======================================================================================
export const T_ONION = 385, T_COLLAPSE0 = 425, T_BOOM = 445.6, T_END = 480;

export const LAYERS = [
  { id: 'H',  name: 'HYDROGEN',  sub: 'outer envelope',        R: 10.0, col: [0.25, 0.45, 1.0],  t: 386.2, temp: '4×10⁷ K',   dur: '7 million years' },
  { id: 'He', name: 'HELIUM',    sub: 'helium → carbon',       R: 8.2,  col: [1.0, 0.85, 0.35],  t: 392.6, temp: '2×10⁸ K',   dur: '500,000 years' },
  { id: 'C',  name: 'CARBON',    sub: 'carbon → neon, Mg',     R: 6.6,  col: [1.0, 0.52, 0.15],  t: 401.4, temp: '6×10⁸ K',   dur: '600 years' },
  { id: 'Ne', name: 'NEON',      sub: 'neon → oxygen, Mg',     R: 5.2,  col: [1.0, 0.30, 0.58],  t: 402.8, temp: '1.2×10⁹ K', dur: '1 year' },
  { id: 'O',  name: 'OXYGEN',    sub: 'oxygen → silicon, S',   R: 4.0,  col: [0.2, 0.92, 0.62],  t: 404.2, temp: '1.5×10⁹ K', dur: '6 months' },
  { id: 'Si', name: 'SILICON',   sub: 'silicon → iron-group',  R: 2.9,  col: [0.72, 0.52, 1.0],  t: 405.6, temp: '2.7×10⁹ K', dur: '1 day' },
  { id: 'Fe', name: 'IRON CORE', sub: 'no more energy to gain', R: 1.7, col: [0.82, 0.84, 0.92], t: 407.8, temp: '→ 5×10⁹ K', dur: 'collapses in ~0.2 s' },
];
const KFAC = [0.0, 0.02, 0.05, 0.10, 0.20, 0.35, 0.97];

export function collapseAt(T) { return Math.pow(sstep(433.3, T_BOOM - 0.15, T), 2.6); }
export function radiiAt(T) {
  const c = collapseAt(T);
  const grow = sstep(T_COLLAPSE0, 433, T);
  return LAYERS.map((L, i) => {
    let r = L.R;
    if (i === 6) r *= lerp(0.86, 1.0, grow);                      // iron core grows as silicon ash lands on it
    if (i === 5) r *= lerp(0.97, 1.0, grow);
    return r * (1 - c * KFAC[i]);
  });
}

export function ironMass(T) { return lerp(1.0, 1.4, sstep(T_COLLAPSE0 + 0.5, 433, T)); }

// ----- camera -----
function camera(T) {
  const sw = (s, a) => noise1(T * s, a);
  if (T < T_COLLAPSE0) {
    // orbit the cutaway onion: far -> mid -> close on the cut face
    const u1 = sstep(385, 393, T), u2 = sstep(409, 424, T);
    const dist = lerp(lerp(70, 27, u1), 13.5, u2);
    const az = 0.78 + 0.35 * Math.sin((T - 385) * 0.045) + 0.35 * u2;
    const el = 0.58 - 0.22 * u2 + 0.05 * Math.sin((T - 385) * 0.06);
    return { pos: [Math.cos(el) * Math.sin(az) * dist, Math.sin(el) * dist, Math.cos(el) * Math.cos(az) * dist], tgt: [0, 0.0, 0], fov: lerp(40, 46, u1), roll: sw(0.2, 3) * 0.006 };
  }
  if (T < T_BOOM) {
    // push into the wedge, toward the iron core
    const k = sstep(T_COLLAPSE0, T_BOOM - 0.2, T);
    const dist = lerp(13.5, 4.6, easeInOut(k));
    const az = 1.13 + 0.14 * Math.sin((T - 425) * 0.2), el = 0.36 + 0.05 * k;
    const shake = sstep(436, T_BOOM, T) * 0.05 * dist;
    return { pos: [Math.cos(el) * Math.sin(az) * dist + sw(23, 1) * shake, Math.sin(el) * dist + sw(29, 2) * shake, Math.cos(el) * Math.cos(az) * dist + sw(31, 3) * shake], tgt: [0, 0, 0], fov: 50, roll: sw(17, 4) * 0.02 * sstep(436, T_BOOM, T) };
  }
  // after the blast: slow pull-back
  const tau = T - T_BOOM;
  const dist = lerp(36, 160, easeOut(clamp(tau / 34))) + 90 * sstep(462, 480, T);
  const az = 0.6 + 0.012 * tau;
  return { pos: [Math.sin(az) * dist * 0.96, dist * 0.26, Math.cos(az) * dist * 0.96], tgt: [0, 0, 0], fov: 52, roll: 0 };
}

function state(T) {
  const inM = T >= 385 && T < 480.5;
  const preBoom = T < T_BOOM;
  const tau = Math.max(0, T - T_BOOM);
  const c = collapseAt(T);
  return {
    show: inM ? 1 : 0,
    onion: inM && preBoom ? 1 : 0,
    collapse: c,
    heat: sstep(425, 433, T) * 0.35 + c * 0.9,
    boom: inM && !preBoom ? 1 : 0,
    tau,
    flash: Math.exp(-tau * 3.2) * (T >= T_BOOM ? 1 : 0),
    haze: preBoom ? 1 : 0,
    nebula: sstep(T_BOOM + 1.0, T_BOOM + 5, T),
    remnant: sstep(T_BOOM + 2, T_BOOM + 6, T),
  };
}

export class MassiveWorld {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // ---------- space: deep background + stars ----------
    this.bgMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 1080) }, uAmt: { value: 1 }, uFlash: { value: 0 }, uNeb: { value: 0 } },
      vertexShader: FULLSCREEN_VS,
      fragmentShader: `precision highp float; ${NOISE} varying vec2 vUv; uniform float uTime, uAmt, uFlash, uNeb; uniform vec2 uRes;
        void main(){
          vec2 p = (vUv-0.5)*vec2(uRes.x/uRes.y,1.0);
          float n = fbm3(vec3(p*1.4, uTime*0.02))*0.5+0.5;
          vec3 col = mix(vec3(0.004,0.006,0.016), vec3(0.03,0.04,0.09), n*(1.0-length(vUv-0.5)*0.9));
          col += uNeb*vec3(0.20,0.07,0.04)*n*n*0.6;
          col += uFlash*vec3(1.0,0.9,0.75)*0.9;
          gl_FragColor = vec4(col*uAmt, 1.0); }`,
    });
    this.bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    this.bg.frustumCulled = false; this.bg.renderOrder = -100;
    this.group.add(this.bg);

    const rnd = mulberry32(99), ns = 5500;
    const sp = new Float32Array(ns * 3), sc = new Float32Array(ns * 3), ss = new Float32Array(ns);
    for (let i = 0; i < ns; i++) {
      let x, y, z, l;
      do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.01);
      l = Math.sqrt(l); sp.set([x / l * 4000, y / l * 4000, z / l * 4000], i * 3);
      const b = Math.pow(rnd(), 3.2) * 1.5 + 0.2, t = rnd();
      const c = t < 0.2 ? [1, 0.75, 0.55] : t < 0.75 ? [1, 1, 1] : [0.7, 0.8, 1];
      sc.set([c[0] * b, c[1] * b, c[2] * b], i * 3); ss[i] = 1 + Math.pow(rnd(), 6) * 2.4;
    }
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sgeo.setAttribute('aCol', new THREE.BufferAttribute(sc, 3)); sgeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uPx: { value: 1 }, uAmt: { value: 1 } },
      vertexShader: `attribute vec3 aCol; attribute float aSize; uniform float uPx; varying vec3 vC; void main(){ vC = aCol; gl_PointSize = aSize*uPx; gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision highp float; varying vec3 vC; uniform float uAmt; void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = smoothstep(1.0,0.0,d); gl_FragColor = vec4(vC*uAmt, a*a); }`,
    });
    this.stars = new THREE.Points(sgeo, this.starMat); this.stars.frustumCulled = false; this.stars.renderOrder = -90;
    this.group.add(this.stars);

    // ---------- cutaway onion (analytic ray - sphere / octant intersection, full-screen) ----------
    const radii = LAYERS.map((l) => l.R);
    this.onionMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false, transparent: true,
      uniforms: {
        uInvProj: { value: new THREE.Matrix4() }, uCamW: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
        uRad: { value: radii.slice() }, uCol: { value: LAYERS.map((l) => new THREE.Vector3(...l.col)) },
        uTime: { value: 0 }, uHeat: { value: 0 }, uCollapse: { value: 0 }, uAmt: { value: 1 },
      },
      vertexShader: FULLSCREEN_VS,
      fragmentShader: `precision highp float; ${NOISE}
        varying vec2 vUv; uniform mat4 uInvProj, uCamW; uniform vec3 uCamPos; uniform float uRad[7]; uniform vec3 uCol[7];
        uniform float uTime, uHeat, uCollapse, uAmt;
        vec3 layerCol(int i){ for(int k=0;k<7;k++){ if(k==i) return uCol[k]; } return vec3(1.0); }
        int layerAt(float r){
          int idx = 6;
          for(int k=0;k<6;k++){ if (r > uRad[k+1] && r <= uRad[k]) idx = k; }
          if (r <= uRad[6]) idx = 6;
          return idx;
        }
        void main(){
          vec2 ndc = vUv*2.0-1.0;
          vec4 vp = uInvProj*vec4(ndc, 1.0, 1.0);
          vec3 d = normalize((uCamW*vec4(vp.xyz/vp.w, 0.0)).xyz);
          vec3 o = uCamPos;
          float R = uRad[0];
          float b = dot(o,d), c = dot(o,o)-R*R, h = b*b-c;
          if (h < 0.0) discard;
          h = sqrt(h);
          float t0 = max(-b-h, 0.0), t1 = -b+h;
          if (t1 < 0.0) discard;
          vec3 p0 = o + d*t0;
          bool inOct = p0.x>0.0 && p0.y>0.0 && p0.z>0.0;
          vec3 p; vec3 n; bool cutFace = false;
          if (!inOct) { p = p0; n = normalize(p0); if (t0 <= 0.0) n = -d; }
          else {
            float tl = 1e9; int ax = 0;
            if (d.x < 0.0) { float t = -o.x/d.x; if (t < tl) { tl = t; ax = 0; } }
            if (d.y < 0.0) { float t = -o.y/d.y; if (t < tl) { tl = t; ax = 1; } }
            if (d.z < 0.0) { float t = -o.z/d.z; if (t < tl) { tl = t; ax = 2; } }
            if (tl > t1 || tl < t0 - 1e-3) discard;
            p = o + d*tl; cutFace = true;
            n = ax==0 ? vec3(1,0,0) : (ax==1 ? vec3(0,1,0) : vec3(0,0,1));
          }
          float r = length(p);
          int li = layerAt(r);
          vec3 base = layerCol(li);
          float turb = fbm3(p*1.3 + vec3(0.0, uTime*0.12, 0.0))*0.5 + 0.5;
          float turb2 = fbm3(p*4.0 - vec3(uTime*0.2, 0.0, 0.0))*0.5 + 0.5;
          float depth01 = 1.0 - clamp(r/uRad[0], 0.0, 1.0);
          vec3 col;
          if (!cutFace) {
            // outer envelope surface: roiling convective photosphere of the supergiant
            float gr = smoothstep(0.25, 0.8, fbm3(normalize(p)*9.0 + uTime*0.05)*0.5+0.5);
            col = mix(base*0.55, base*1.5 + vec3(0.15), gr);
            float mu = clamp(dot(n, -d), 0.0, 1.0);
            col *= 0.35 + 0.9*pow(mu, 0.6);
          } else {
            float edge = min(min(abs(p.x), abs(p.y)), abs(p.z));
            // edge distance on the face = min of the two other coords
            float e2 = 1e9; if (n.x < 0.5) e2 = min(e2, p.x); if (n.y < 0.5) e2 = min(e2, p.y); if (n.z < 0.5) e2 = min(e2, p.z);
            float ao = 0.55 + 0.45*smoothstep(0.0, 0.9, e2);
            float emit = 0.55 + 1.35*pow(depth01, 1.8);
            col = base*(0.45 + 0.8*turb)*(0.8 + 0.45*turb2)*emit*ao;
            // burning shells: thin white-hot lines at each layer boundary (not the outer edge)
            float shell = 0.0;
            for (int k = 1; k < 7; k++) { shell += exp(-pow((r - uRad[k])/(0.06 + 0.012*float(k)), 2.0)); }
            col += vec3(1.0, 0.92, 0.75)*shell*(0.5 + 0.5*uHeat);
            // iron core: hot dense metal
            if (li == 6) { col = mix(col, vec3(1.0, 0.75, 0.55)*(1.2+2.5*uHeat), 0.35 + 0.5*uHeat); }
            float lit = 0.75 + 0.25*clamp(dot(n, normalize(vec3(0.5,0.7,0.6))), 0.0, 1.0);
            col *= lit;
            // dark seam where the cut meets the outer skin
            col *= 0.55 + 0.45*smoothstep(0.0, 0.25, uRad[0] - r);
          }
          float rr = length(p);
          col += vec3(1.0, 0.8, 0.55)*uHeat*0.55*exp(-rr*rr*0.9);
          gl_FragColor = vec4(col*uAmt, uAmt);
        }`,
    });
    this.onion = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.onionMat);
    this.onion.frustumCulled = false; this.onion.renderOrder = -20;
    this.group.add(this.onion);

    // infall streaks near the collapsing core (matter streaming inward)
    this.infall = new FlowParticles({
      count: 2500, mode: MODE.NEUTRINO, seed: 61, box: 10, sizeWorld: 0.05, minPx: 0.8, maxPx: 6, streak: 0.05, streakGain: 1.0, maxLen: 200,
      range: [0, 1e6], fade: 1, colA: [1.0, 0.6, 0.3], colB: [1.0, 0.9, 0.7], colC: [1.0, 1.0, 1.0], aux: [30, -12, 0, 0], aux2: [0, 0.1, 0, 0], alpha: 0.9,
    });
    // reverse the neutrino outward motion for infall: reuse the outward mode but with negative speed
    this.group.add(this.infall.mesh);

    // ---------- explosion ----------
    this.ejecta = new FlowParticles({
      count: 12000, mode: MODE.EXPLODE, seed: 33, box: 10, sizeWorld: 0.22, minPx: 1.0, maxPx: 10, streak: 0.18, streakGain: 1.0, maxLen: 120,
      range: [0, 1e6], fade: 1, colA: [1.0, 0.25, 0.12], colB: [1.0, 0.75, 0.3], colC: [0.5, 0.85, 1.0], aux: [58, 0.33, 0.035, 0], aux2: [0, 0.1, 0, 0], t0: T_BOOM, alpha: 1.15,
    });
    this.ejecta.mat.uniforms.uOrigin.value.set(0, 0, 0);
    this.nuBurst = new FlowParticles({
      count: 700, mode: MODE.EXPLODE, seed: 34, box: 10, sizeWorld: 0.12, minPx: 1.0, maxPx: 6, streak: 0.06, streakGain: 1.0, maxLen: 600,
      range: [0, 1e6], fade: 1, colA: [0.3, 0.6, 1.0], colB: [0.5, 0.85, 1.0], colC: [0.85, 0.95, 1.0], aux: [260, 0.6, 0.45, 0], aux2: [0, 0.1, 0, 0], t0: T_BOOM, alpha: 1.0,
    });
    this.group.add(this.ejecta.mesh, this.nuBurst.mesh);

    // expanding remnant cloud + shock ring (billboards)
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: 700 }, uR: { value: 10 }, uAmt: { value: 0 }, uRing: { value: 0 }, uRingR: { value: 10 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision highp float; ${NOISE} varying vec2 vUv; uniform float uTime, uSize, uR, uAmt, uRing, uRingR;
        void main(){
          vec2 q = (vUv-0.5)*uSize; float r = length(q); float a = atan(q.y,q.x);
          float nz = fbm3(vec3(cos(a)*2.0, sin(a)*2.0, r*0.02 + uTime*0.04))*0.5+0.5;
          float nz2 = fbm3(vec3(q*0.025, uTime*0.03))*0.5+0.5;
          float f = r/max(uR, 1.0);
          float body = smoothstep(1.15, 0.2, f) * (0.35 + 0.8*nz2);
          float skin = exp(-pow((f-0.95)/0.16, 2.0))*(0.6+0.9*nz);
          vec3 inner = vec3(0.25, 0.75, 0.85), outer = vec3(1.0, 0.32, 0.18), mid = vec3(1.0, 0.7, 0.3);
          vec3 col = mix(inner, mix(mid, outer, smoothstep(0.55, 1.0, f)), smoothstep(0.1, 0.8, f));
          float I = (body*0.5 + skin*0.9)*uAmt;
          float ring = exp(-pow((r-uRingR)/(2.0 + uRingR*0.012), 2.0))*uRing;
          gl_FragColor = vec4(col*I + vec3(1.0,0.95,0.85)*ring*1.4, I + ring); }`,
    });
    this.cloud = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).scale(700, 700, 1), this.cloudMat);
    this.cloud.renderOrder = 3;
    this.group.add(this.cloud);

    // neutron star: tiny blue-white glow + two lighthouse beams
    this.nsMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uAmt: { value: 0 }, uSize: { value: 40 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision highp float; varying vec2 vUv; uniform float uAmt; void main(){ float r = length(vUv-0.5)*2.0; float I = exp(-r*r*40.0)*2.2 + exp(-r*4.5)*0.35; gl_FragColor = vec4(vec3(0.7,0.85,1.0)*I*uAmt, I*uAmt); }`,
    });
    this.ns = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).scale(40, 40, 1), this.nsMat);
    this.ns.renderOrder = 10;
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uAmt: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision highp float; varying vec2 vUv; uniform float uAmt; void main(){ float w = exp(-pow((vUv.x-0.5)*7.0, 2.0)); float l = pow(1.0-abs(vUv.y-0.5)*2.0, 1.4); gl_FragColor = vec4(vec3(0.6,0.8,1.0)*w*l*uAmt*0.9, w*l*uAmt*0.6); }`,
    });
    this.beams = new THREE.Group();
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(14, 260), this.beamMat); bm.renderOrder = 9;
    this.beams.add(bm);
    const bm2 = bm.clone(); bm2.rotation.z = 0; this.beams.add(bm2);
    this.beams.rotation.x = 0.5;
    this.group.add(this.ns, this.beams);
  }

  update(T, ctx, S) {
    const M = S.massive;
    this.group.visible = M.show > 0.001;
    if (!this.group.visible) return;
    const preBoom = M.onion > 0.5;

    const bu = this.bgMat.uniforms; bu.uTime.value = T; bu.uRes.value.set(ctx.width, ctx.height); bu.uFlash.value = M.flash; bu.uNeb.value = M.nebula;
    this.starMat.uniforms.uPx.value = ctx.px; this.starMat.uniforms.uAmt.value = 1 - 0.6 * M.flash;
    this.stars.position.copy(ctx.camPos);

    this.onion.visible = preBoom;
    if (preBoom) {
      const u = this.onionMat.uniforms;
      u.uInvProj.value.copy(ctx.camera.projectionMatrixInverse); u.uCamW.value.copy(ctx.camera.matrixWorld);
      u.uCamPos.value.copy(ctx.camPos);
      u.uRad.value = radiiAt(T);
      u.uTime.value = T; u.uHeat.value = M.heat;
    }
    this.infall.mesh.visible = preBoom && T > 436 && T < T_BOOM;
    if (this.infall.mesh.visible) {
      const k = sstep(436, 444, T);
      this.infall.update(T, ctx, { uAlpha: 0.28 * k, uAux: [26 * (1 - 0.5 * k), -(30 + 120 * k), 0, 0] });
      this.infall.mat.uniforms.uTime.value = T;
    }

    const ex = M.boom > 0.5;
    this.ejecta.mesh.visible = ex; this.nuBurst.mesh.visible = ex && M.tau < 4.5;
    if (ex) {
      this.ejecta.update(T, ctx, { uAlpha: 1.15 }); this.nuBurst.update(T, ctx, { uAlpha: 1.0 });
      const tau = M.tau;
      const rr = (58 * 0.75) * (1 - Math.exp(-tau * 0.33)) / 0.33; // mean ejecta radius
      this.cloud.visible = true;
      this.cloud.quaternion.copy(ctx.camera.quaternion);
      const cu = this.cloudMat.uniforms; cu.uTime.value = T; cu.uR.value = Math.max(rr, 2); cu.uAmt.value = M.nebula * (0.85 + 0.0);
      cu.uRingR.value = 40 * Math.pow(tau + 0.01, 0.9) * 2.4; cu.uRing.value = Math.exp(-tau * 0.55) * sstep(0, 0.04, tau);
      this.ns.visible = M.remnant > 0.01; this.ns.quaternion.copy(ctx.camera.quaternion); this.nsMat.uniforms.uAmt.value = M.remnant;
      this.beams.visible = M.remnant > 0.01; this.beamMat.uniforms.uAmt.value = M.remnant * 0.9;
      this.beams.rotation.y = 0.0; this.beams.rotation.z = T * 5.2;
      const sc = 1.0 + 0.0 * tau; this.ns.scale.setScalar(sc);
    } else { this.cloud.visible = false; this.ns.visible = false; this.beams.visible = false; }
  }
}

// ======================================================================================
// HUD for 385-480
// ======================================================================================
const rgb = (c, a = 1) => `rgba(${c.map((v) => Math.round(clamp(v) * 255)).join(',')},${a})`;

function drawHud(g, hud, T, Teff, S, info) {
  if (Teff < 385 || Teff >= 480.5) return;
  const { W, H, u, land } = hud;
  const proj = info.project;

  // ---- onion labels ----
  const onionA = Teff < T_COLLAPSE0 ? 1 - sstep(422.5, 424.5, Teff) : 0;
  if (onionA > 0.01 && proj) {
    const R = radiiAt(Teff);
    g.save(); g.globalAlpha = onionA;
    const colX = W - (land ? 70 : 26) * u;
    const y0 = H * (land ? 0.2 : 0.17), rowH = (land ? 76 : 66) * u;
    LAYERS.forEach((L, i) => {
      const a = sstep(L.t, L.t + 0.8, Teff);
      if (a <= 0.001) return;
      const rc = i === 6 ? R[6] * 0.55 : (R[i] + R[i + 1]) / 2;
      const s = proj([0, rc * 0.62, rc * 0.62]);
      const y = y0 + i * rowH;
      const fs = (land ? 26 : 22) * u;
      const wName = measure(g, L.name, fs, 700, 'Rajdhani, sans-serif', 2 * u);
      const dur = Teff >= 413.6 + i * 0.7 ? L.dur : '';
      const sub = Teff >= 413.6 + i * 0.7 ? `${L.temp}  ·  ${L.dur}` : L.sub;
      const wSub = measure(g, sub, fs * 0.74, 500, 'Inter, sans-serif');
      const w = Math.max(wName, wSub) + 38 * u;
      const x = colX - w;
      // leader line
      if (s && s.x > 0 && s.x < W && s.y > 0 && s.y < H) {
        g.strokeStyle = rgb(L.col, 0.85 * a); g.lineWidth = 2 * u; g.beginPath(); g.moveTo(x, y + 26 * u); g.lineTo(s.x, s.y); g.stroke();
        g.fillStyle = rgb(L.col, a); g.beginPath(); g.arc(s.x, s.y, 6 * u, 0, 7); g.fill();
      }
      g.globalAlpha = onionA * a;
      rrect(g, x, y, w, 58 * u, 9 * u); g.fillStyle = 'rgba(6,10,22,0.66)'; g.fill(); g.strokeStyle = rgb(L.col, 0.9); g.lineWidth = 2 * u; g.stroke();
      g.fillStyle = rgb(L.col, 1); rrect(g, x, y, 6 * u, 58 * u, 3 * u); g.fill();
      txt(g, L.name, x + 20 * u, y + 25 * u, { size: fs, weight: 700, spacing: 2 * u, shadow: 6 * u });
      txt(g, sub, x + 20 * u, y + 47 * u, { size: fs * 0.74, weight: 500, font: 'Inter, sans-serif', color: 'rgba(215,228,255,0.95)' });
      g.globalAlpha = onionA;
    });
    g.restore();

    // headline tags
    const head = [
      { t0: 386.2, t1: 392, text: 'A MASSIVE STAR: ≥ 8 SUNS  ·  HERE, 25 SUNS', col: [140, 190, 255] },
      { t0: 392.5, t1: 400.5, text: 'EACH ASH BECOMES THE NEXT FUEL', col: [255, 220, 130] },
      { t0: 407.6, t1: 413, text: 'THE ONION STAR  ·  IRON AT THE CENTER', col: [215, 220, 240] },
      { t0: 413.6, t1: 424, text: 'BURNING TIME OF EACH FUEL  (25 SUN MODEL)', col: [255, 160, 110] },
    ];
    for (const t of head) { const a = pulse(Teff, t.t0, t.t1, 0.6); if (a > 0) tag(g, u, t.text, land ? W * 0.4 : W / 2, H * (land ? 0.075 : 0.1), { size: land ? 25 : 20, color: t.col, alpha: a * onionA }); }
  }

  // ---- collapse panels ----
  if (Teff >= T_COLLAPSE0 && Teff < T_BOOM + 0.2) {
    const a = sstep(T_COLLAPSE0 + 0.4, T_COLLAPSE0 + 1.2, Teff) * (1 - sstep(T_BOOM - 0.4, T_BOOM, Teff));
    g.save(); g.globalAlpha = a;
    const x = 60 * u, y = H * (land ? 0.16 : 0.15), w = (land ? 520 : 560) * u;
    rrect(g, x, y, w, 230 * u, 16 * u); g.fillStyle = 'rgba(6,10,22,0.62)'; g.fill(); g.strokeStyle = 'rgba(200,215,255,0.5)'; g.lineWidth = 2 * u; g.stroke();
    txt(g, 'IRON CORE', x + 26 * u, y + 44 * u, { size: 22 * u, weight: 700, spacing: 6 * u, color: '#cfd6ee' });
    const m = ironMass(Teff);
    txt(g, m.toFixed(2) + ' M☉', x + 26 * u, y + 108 * u, { size: 70 * u, weight: 700, shadow: 14 * u, color: m > 1.38 ? '#ff9d6a' : '#fff' });
    txt(g, 'CHANDRASEKHAR LIMIT ≈ 1.4 M☉', x + 26 * u, y + 146 * u, { size: 20 * u, weight: 600, spacing: 3 * u, color: 'rgba(225,235,255,0.95)' });
    // limit bar
    rrect(g, x + 26 * u, y + 168 * u, w - 52 * u, 18 * u, 9 * u); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fill();
    rrect(g, x + 26 * u, y + 168 * u, Math.max(10 * u, (w - 52 * u) * clamp((m - 1.0) / 0.4)), 18 * u, 9 * u); g.fillStyle = m > 1.38 ? '#ff7a4a' : '#9bb3ff'; g.fill();
    txt(g, 'Core diameter before collapse ≈ 3,000 km', x + 26 * u, y + 214 * u, { size: 18 * u, weight: 500, font: 'Inter, sans-serif', color: 'rgba(210,222,250,0.95)' });
    g.restore();

    const sa = pulse(Teff, 433.6, 445.2, 0.8);
    if (sa > 0) {
      tag(g, u, 'ELECTRON DEGENERACY PRESSURE FAILS', W / 2, H * (land ? 0.075 : 0.1), { size: land ? 26 : 21, color: [255, 150, 110], alpha: sa * sstep(433.6, 436, Teff) });
      // slowed-down note + collapse stats
      const ca = pulse(Teff, 436.2, 445.4, 0.6);
      g.save(); g.globalAlpha = ca;
      const sx = W - (land ? 70 : 30) * u, sy = H * (land ? 0.2 : 0.28);
      const rows = [['INFALL SPEED', 'up to 15 % of light speed'], ['CORE TEMPERATURE', '> 5 billion K'], ['DENSITY AT BOUNCE', '4×10¹⁷ kg/m³']];
      const wid = (land ? 480 : 520) * u;
      rows.forEach(([k, v], i) => {
        const yy = sy + i * 84 * u;
        rrect(g, sx - wid, yy, wid, 70 * u, 10 * u); g.fillStyle = 'rgba(6,10,22,0.62)'; g.fill(); g.strokeStyle = 'rgba(255,170,120,0.55)'; g.lineWidth = 2 * u; g.stroke();
        txt(g, k, sx - wid + 20 * u, yy + 27 * u, { size: 17 * u, weight: 600, spacing: 4 * u, color: 'rgba(255,200,170,0.95)' });
        txt(g, v, sx - wid + 20 * u, yy + 58 * u, { size: 28 * u, weight: 700, shadow: 8 * u });
      });
      g.restore();
      tag(g, u, 'SLOWED DOWN — THE REAL COLLAPSE TAKES ABOUT 0.2 SECONDS', W / 2, H * (land ? 0.82 : 0.82), { size: land ? 24 : 19, color: [255, 235, 190], alpha: ca * 0.95 });
    }
  }

  // ---- supernova ----
  if (Teff >= T_BOOM && Teff < 462.4) {
    const tg = [
      { t0: 446.4, t1: 451.6, text: 'CORE BOUNCE  →  SHOCKWAVE  +  A BURST OF NEUTRINOS', col: [150, 200, 255] },
      { t0: 451.6, t1: 456.4, text: 'TYPE II SUPERNOVA  ·  SHOCK REACHES THE SURFACE IN HOURS', col: [255, 215, 140] },
      { t0: 456.6, t1: 462.4, text: 'REMNANT:  NEUTRON STAR  (OR A BLACK HOLE FOR THE HEAVIEST STARS)', col: [170, 205, 255] },
    ];
    for (const t of tg) { const a = pulse(Teff, t.t0, t.t1, 0.6); if (a > 0) tag(g, u, t.text, W / 2, H * (land ? 0.075 : 0.1), { size: land ? 25 : 19, color: t.col, alpha: a }); }
    const ba = pulse(Teff, 451.2, 456.2, 0.7);
    if (ba > 0) {
      g.save(); g.globalAlpha = ba;
      txt(g, 'OUTSHINES BILLIONS OF STARS', W / 2, H * (land ? 0.2 : 0.3), { size: (land ? 58 : 48) * u, weight: 700, align: 'center', spacing: 4 * u, shadow: 20 * u, color: '#ffe9b0' });
      txt(g, 'FOR A SHORT TIME', W / 2, H * (land ? 0.2 : 0.3) + 44 * u, { size: 26 * u, weight: 600, align: 'center', spacing: 8 * u, shadow: 8 * u });
      g.restore();
    }
    const na = pulse(Teff, 457.4, 462.2, 0.6);
    if (na > 0 && info.nsScreen) {
      const s = info.nsScreen;
      g.save(); g.globalAlpha = na;
      g.strokeStyle = 'rgba(170,205,255,0.9)'; g.lineWidth = 2 * u; g.beginPath(); g.arc(s.x, s.y, 46 * u, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(s.x + 46 * u * 0.7, s.y - 46 * u * 0.7); g.lineTo(s.x + 130 * u, s.y - 130 * u); g.stroke();
      txt(g, 'NEUTRON STAR', s.x + 138 * u, s.y - 134 * u, { size: 30 * u, weight: 700, spacing: 4 * u, shadow: 10 * u, color: '#cfe0ff' });
      txt(g, 'a city-sized ball of neutrons', s.x + 138 * u, s.y - 104 * u, { size: 20 * u, weight: 600, font: 'Inter, sans-serif', shadow: 8 * u });
      g.restore();
    }
  }

  // ---- stardust ----
  if (Teff >= 462.4 && Teff < 480.5) {
    const els = [['IRON', 'Fe', 463.2], ['SILICON', 'Si', 464.2], ['OXYGEN', 'O', 465.2], ['CARBON', 'C', 466.2], ['CALCIUM', 'Ca', 467.2]];
    const ea = pulse(Teff, 463, 472, 0.9);
    if (ea > 0) {
      const cw = (land ? 220 : 190) * u, gap = 18 * u, n = els.length;
      const x0 = W / 2 - (n * cw + (n - 1) * gap) / 2, y = H * (land ? 0.12 : 0.18);
      els.forEach(([nm, sym, t0], i) => {
        const a = ea * sstep(t0, t0 + 0.6, Teff);
        if (a <= 0) return;
        const x = x0 + i * (cw + gap);
        g.save(); g.globalAlpha = a; rrect(g, x, y, cw, 150 * u, 14 * u); g.fillStyle = 'rgba(6,10,22,0.58)'; g.fill(); g.strokeStyle = 'rgba(255,225,170,0.5)'; g.lineWidth = 2 * u; g.stroke();
        txt(g, sym, x + cw / 2, y + 86 * u, { size: 76 * u, weight: 700, align: 'center', color: '#ffe3a8', shadow: 14 * u });
        txt(g, nm, x + cw / 2, y + 126 * u, { size: 20 * u, weight: 600, align: 'center', spacing: 5 * u });
        g.restore();
      });
      txt(g, 'SCATTERED ACROSS SPACE', W / 2, y + 196 * u, { size: 26 * u, weight: 700, align: 'center', spacing: 8 * u, alpha: ea, shadow: 10 * u });
    }
    const sd = pulse(Teff, 473.6, 480, 0.8);
    if (sd > 0 && Teff < 471.4 + 3) {
      txt(g, 'WE ARE MADE OF STARDUST', W / 2, H * (land ? 0.46 : 0.44), { size: (land ? 84 : 66) * u, weight: 700, align: 'center', spacing: 8 * u, shadow: 26 * u, alpha: sd * (1 - sstep(479.2, 480, Teff)), color: '#fff3d0' });
    }
  }
}

export const massive = { camera, state, drawHud };
