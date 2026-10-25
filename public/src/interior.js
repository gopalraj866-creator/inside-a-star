import * as THREE from 'three';
import { NOISE, FULLSCREEN_VS } from './glsl.js';
import { FlowParticles, MODE } from './flow.js';
import { GlowRibbons } from './ribbons.js';
import { mulberry32, clamp, lerp, sstep } from './util.js';
import { STAR_R } from './space.js';

// Background colours as a function of the camera's distance from the star centre (HDR-ish values).
const HAZE = [
  [105, [0.01, 0.003, 0.0], [0.05, 0.012, 0.0]],
  [100.5, [0.55, 0.22, 0.06], [0.95, 0.55, 0.22]],
  [97, [0.42, 0.12, 0.02], [0.75, 0.30, 0.06]],
  [90, [0.22, 0.05, 0.008], [0.45, 0.14, 0.02]],
  [76, [0.16, 0.04, 0.01], [0.38, 0.14, 0.03]],
  [66, [0.20, 0.09, 0.03], [0.45, 0.23, 0.08]],
  [45, [0.20, 0.13, 0.07], [0.48, 0.34, 0.18]],
  [28, [0.30, 0.22, 0.12], [0.70, 0.55, 0.35]],
  [20, [0.26, 0.19, 0.11], [0.52, 0.40, 0.26]],
  [0, [0.34, 0.27, 0.19], [0.62, 0.50, 0.37]],
];
export function hazeColors(r) {
  if (r >= HAZE[0][0]) return [HAZE[0][1], HAZE[0][2]];
  for (let i = 0; i < HAZE.length - 1; i++) {
    const a = HAZE[i], b = HAZE[i + 1];
    if (r <= a[0] && r >= b[0]) {
      const s = (a[0] - r) / (a[0] - b[0]);
      return [a[1].map((v, k) => lerp(v, b[1][k], s)), a[2].map((v, k) => lerp(v, b[2][k], s))];
    }
  }
  const l = HAZE[HAZE.length - 1];
  return [l[1], l[2]];
}

// A deterministic 3D random walk used for the photon.
export function makeWalk(n = 640, meanStep = 2.0, seed = 42) {
  const rnd = mulberry32(seed);
  const pts = new Float32Array((n + 1) * 4);
  let x = 0, y = 0, z = 0, len = 0;
  const ext = new Float32Array(n + 1);
  let mx = 0;
  for (let i = 0; i <= n; i++) {
    pts[i * 4] = x; pts[i * 4 + 1] = y; pts[i * 4 + 2] = z; pts[i * 4 + 3] = len;
    mx = Math.max(mx, Math.hypot(x, y, z)); ext[i] = mx;
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const l = -Math.log(1 - rnd() * 0.97) * meanStep;
    x += s * Math.cos(th) * l; y += u * l; z += s * Math.sin(th) * l; len += l;
  }
  return { pts, ext, n };
}

export class InteriorWorld {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    // ---------- background haze ----------
    this.hazeMat = new THREE.ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1920, 1080) }, uNoise: { value: 1.6 }, uCamZ: { value: 0 }, uGlow: { value: 1 } },
      vertexShader: FULLSCREEN_VS,
      fragmentShader: `precision highp float; ${NOISE} varying vec2 vUv; uniform vec3 uA, uB; uniform float uTime, uNoise, uCamZ, uGlow; uniform vec2 uRes;
        void main(){
          vec2 p = (vUv - 0.5)*vec2(uRes.x/uRes.y, 1.0);
          float n = fbm3(vec3(p*uNoise, uCamZ*0.045 + uTime*0.04))*0.5 + 0.5;
          float v = 1.0 - length(vUv - 0.5)*1.25;
          float k = clamp(v + (n - 0.5)*0.85, 0.0, 1.0);
          gl_FragColor = vec4(mix(uA, uB, k)*uGlow, 1.0);
        }`,
    });
    this.haze = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hazeMat);
    this.haze.frustumCulled = false; this.haze.renderOrder = -100;
    this.group.add(this.haze);

    // ---------- convection zone ----------
    this.conv = new FlowParticles({
      count: 11000, mode: MODE.CONVECTION, seed: 3, box: 80, sizeWorld: 0.11, minPx: 0.7, maxPx: 12, streak: 0.12, streakGain: 1.2, maxLen: 160,
      range: [66, 103], fade: 3, colA: [0.75, 0.10, 0.01], colB: [1.0, 0.42, 0.07], colC: [1.0, 0.92, 0.55], aux: [4.2, 0.55, 0.045, 0], aux2: [0.6, 3, 0, 0], alpha: 1.1,
    });
    this.convPuff = new FlowParticles({
      count: 520, mode: MODE.CONVECTION, seed: 31, box: 100, sizeWorld: 2.8, minPx: 6, maxPx: 400, soft: 1, streak: 0.1,
      range: [66, 103], fade: 4, colA: [0.45, 0.05, 0.0], colB: [0.9, 0.3, 0.04], colC: [1.0, 0.75, 0.3], aux: [5.0, 0.35, 0.04, 0], aux2: [3, 8, 0, 0], alpha: 0.05,
    });
    this.group.add(this.conv.mesh, this.convPuff.mesh);

    // ---------- tachocline: shell + magnetic field rings ----------
    this.tachoMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 1 } },
      vertexShader: `varying vec3 vP; varying vec3 vW; void main(){ vP = position; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `precision highp float; ${NOISE} varying vec3 vP; varying vec3 vW; uniform float uTime, uAmt;
        void main(){
          vec3 n = normalize(vP);
          float camR = length(cameraPosition);
          float prox = exp(-abs(camR - 70.0)*0.28);
          float shear = n.y*26.0 + fbm3(n*3.0 + vec3(0.0, uTime*0.05, 0.0))*5.0;
          float bands = 0.5 + 0.5*sin(shear);
          bands = pow(bands, 3.0);
          float flick = 0.6 + 0.4*snoise(n*10.0 + uTime*0.2);
          vec3 col = mix(vec3(0.15, 0.55, 1.0), vec3(1.0, 0.25, 0.75), 0.5 + 0.5*snoise(n*2.0 + uTime*0.06));
          float I = (0.10 + bands*0.8)*flick*prox;
          gl_FragColor = vec4(col*I*1.6, I*uAmt);
        }`,
    });
    this.tacho = new THREE.Mesh(new THREE.SphereGeometry(70, 96, 64), this.tachoMat);
    this.tacho.renderOrder = 4;
    this.field = new GlowRibbons({ lines: 70, segs: 72, mode: 1, width: 3.2, fieldR: 70, colA: [0.15, 0.6, 1.0], colB: [1.0, 0.3, 0.8], flowFreq: 3, flowSpeed: 0.5, alpha: 1.4 });
    this.group.add(this.tacho, this.field.mesh);

    // ---------- radiative zone ----------
    this.rad = new FlowParticles({
      count: 15000, mode: MODE.RADIATIVE, seed: 5, box: 64, sizeWorld: 0.085, minPx: 0.7, maxPx: 7, streak: 0.07, streakGain: 1.0, maxLen: 80,
      range: [21, 74], fade: 4, colA: [1.0, 0.55, 0.15], colB: [1.0, 0.82, 0.45], colC: [1.0, 0.98, 0.85], aux: [1.3, 0, 2.6, 0], aux2: [0.5, 2.5, 0, 0], alpha: 1.15,
    });
    this.radPuff = new FlowParticles({
      count: 420, mode: MODE.MOTES, seed: 51, box: 90, sizeWorld: 3.2, minPx: 8, maxPx: 500, soft: 1,
      range: [18, 76], fade: 6, colA: [0.5, 0.3, 0.1], colB: [0.9, 0.65, 0.3], colC: [1.0, 0.9, 0.6], aux: [3.0, 0, 0, 0], aux2: [2, 8, 0, 0], alpha: 0.05,
    });
    this.group.add(this.rad.mesh, this.radPuff.mesh);

    // ---------- photon random walk ----------
    this.walk = makeWalk();
    const tex = new THREE.DataTexture(this.walk.pts, this.walk.n + 1, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
    this.walkGroup = new THREE.Group();
    this.path = new GlowRibbons({ lines: 1, segs: this.walk.n, mode: 2, width: 6.5, pathTex: tex, colA: [1.0, 0.6, 0.25], colB: [2.6, 2.1, 1.4], head: 0, trail: 45, floor: 0.55, alpha: 2.2 });
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 6, 4.5) }));
    this.walkGroup.add(this.path.mesh, this.head);
    this.group.add(this.walkGroup);
    this.walkOrigin = new THREE.Vector3(0, 0, 46);
    this.path.mat.uniforms.uOffset.value.copy(this.walkOrigin);

    // neutrinos for the "race" (origin = walk origin) and for the core
    this.nuRace = new FlowParticles({
      count: 26, mode: MODE.NEUTRINO, seed: 77, box: 10, sizeWorld: 0.22, minPx: 1.5, maxPx: 10, streak: 0.09, streakGain: 1.0, maxLen: 900,
      range: [0, 1e6], fade: 1, colA: [0.2, 0.55, 1.0], colB: [0.4, 0.8, 1.0], colC: [0.8, 0.95, 1.0], aux: [260, 130, 0, 0], aux2: [0.0, 0.1, 0, 0], alpha: 1.3,
    });
    this.nuRace.mat.uniforms.uOrigin.value.copy(this.walkOrigin);
    this.group.add(this.nuRace.mesh);

    // ---------- core ----------
    this.core = new FlowParticles({
      count: 11000, mode: MODE.CORE, seed: 9, box: 44, sizeWorld: 0.07, minPx: 0.7, maxPx: 8, streak: 0.09, streakGain: 1.2, maxLen: 140,
      range: [0, 30], fade: 3, colA: [1.0, 0.45, 0.10], colB: [1.0, 0.85, 0.5], colC: [1.0, 1.0, 1.0], aux: [0.8, 1.1, 0.06, 0], aux2: [0.4, 2.5, 0, 0], alpha: 1.2,
    });
    this.coreNu = new FlowParticles({
      count: 90, mode: MODE.NEUTRINO, seed: 91, box: 10, sizeWorld: 0.16, minPx: 1.2, maxPx: 8, streak: 0.06, streakGain: 1.0, maxLen: 700,
      range: [0, 1e6], fade: 1, colA: [0.2, 0.55, 1.0], colB: [0.4, 0.8, 1.0], colC: [0.85, 0.95, 1.0], aux: [140, 150, 0, 0], aux2: [0.0, 0.1, 0, 0], alpha: 1.1,
    });
    this.group.add(this.core.mesh, this.coreNu.mesh);

    // core boundary shell (glowing orb seen from the radiative zone) + glow billboard
    this.coreShellMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 1 } },
      vertexShader: `varying vec3 vP; varying vec3 vW; void main(){ vP = position; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `precision highp float; ${NOISE} varying vec3 vP; varying vec3 vW; uniform float uTime, uAmt;
        void main(){
          vec3 n = normalize(vP); vec3 V = normalize(cameraPosition - vW);
          float mu = clamp(dot(n, V), 0.0, 1.0);
          float sw = fbm3(n*3.0 + vec3(uTime*0.08, 0.0, uTime*0.05))*0.5 + 0.5;
          float I = (0.18 + 1.0*pow(mu, 1.8))*(0.7 + 0.5*sw);
          vec3 col = mix(vec3(1.0, 0.55, 0.18), vec3(1.0, 0.92, 0.75), pow(mu, 2.0));
          gl_FragColor = vec4(col*I*0.30*uAmt, 1.0);
        }`,
    });
    this.coreShell = new THREE.Mesh(new THREE.SphereGeometry(25, 96, 64), this.coreShellMat);
    this.coreShell.renderOrder = 4;
    this.coreGlowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uAmt: { value: 1 }, uSize: { value: 140 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision highp float; varying vec2 vUv; uniform float uAmt, uSize;
        void main(){ float r = length(vUv - 0.5)*2.0; float I = exp(-r*r*14.0)*0.45 + exp(-r*4.0)*0.05; gl_FragColor = vec4(vec3(1.0, 0.82, 0.5)*I*uAmt, I*uAmt); }`,
    });
    this.coreGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).scale(70, 70, 1), this.coreGlowMat);
    this.coreGlow.renderOrder = 3;
    this.group.add(this.coreShell, this.coreGlow);
  }

  update(T, ctx, S) {
    const I = S.interior;
    this.group.visible = I.show > 0.001;
    if (!this.group.visible) return;
    const [A, B] = hazeColors(I.haze === undefined ? ctx.camR : I.haze);
    const hu = this.hazeMat.uniforms;
    hu.uA.value.set(...A); hu.uB.value.set(...B);
    hu.uTime.value = T; hu.uRes.value.set(ctx.width, ctx.height);
    hu.uCamZ.value = ctx.camPos.z; hu.uNoise.value = I.noise;
    hu.uGlow.value = I.glow * I.show;

    const vis = (m, a) => { m.visible = a > 0.01; };
    vis(this.conv.mesh, I.conv); vis(this.convPuff.mesh, I.conv);
    this.conv.update(T, ctx, { uAlpha: 1.1 * I.conv });
    this.convPuff.update(T, ctx, { uAlpha: 0.05 * I.conv });

    vis(this.tacho, I.tacho); vis(this.field.mesh, I.tacho);
    this.tachoMat.uniforms.uTime.value = T; this.tachoMat.uniforms.uAmt.value = I.tacho;
    this.field.update(T, ctx, { uAlpha: 1.4 * I.tacho });

    vis(this.rad.mesh, I.rad); vis(this.radPuff.mesh, I.rad);
    this.rad.update(T, ctx, { uAlpha: 0.7 * I.rad * (1 - 0.7 * I.photon.show) });
    this.radPuff.update(T, ctx, { uAlpha: 0.012 * I.rad });

    const P = I.photon;
    this.walkGroup.visible = P.show > 0.01;
    if (this.walkGroup.visible) {
      this.walkGroup.position.copy(this.walkOrigin);
      const head = P.progress * this.walk.n;
      this.path.update(T, ctx, { uHead: head, uAlpha: 2.2 * P.show });
      const i = Math.min(Math.floor(head), this.walk.n - 1), f = head - i;
      const w = this.walk.pts;
      this.head.position.set(
        lerp(w[i * 4], w[(i + 1) * 4], f), lerp(w[i * 4 + 1], w[(i + 1) * 4 + 1], f), lerp(w[i * 4 + 2], w[(i + 1) * 4 + 2], f));
      this.head.scale.setScalar(P.show);
    }
    vis(this.nuRace.mesh, I.nuRace);
    this.nuRace.update(T, ctx, { uAlpha: 1.3 * I.nuRace });

    vis(this.core.mesh, I.core); vis(this.coreNu.mesh, I.coreNu);
    this.core.update(T, ctx, { uAlpha: 0.42 * I.core });
    this.coreNu.update(T, ctx, { uAlpha: 1.1 * I.coreNu });

    this.coreShell.visible = I.coreShell > 0.01 && ctx.camR > 25;
    this.coreShellMat.uniforms.uTime.value = T; this.coreShellMat.uniforms.uAmt.value = I.coreShell;
    this.coreGlow.visible = I.coreGlow > 0.01;
    this.coreGlow.quaternion.copy(ctx.camera.quaternion);
    this.coreGlowMat.uniforms.uAmt.value = I.coreGlow;
  }
}
