import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { mulberry32 } from './util.js';

// FlowParticles: GPU motion-streak particles whose positions are pure analytic functions of time.
// Streaks come from evaluating the position at (t - dt) and projecting both ends.
// Modes: 0 corona outflow | 1 convection | 2 radiative photon hops | 3 core swirl
//        4 neutrinos (radial, fast) | 5 floating motes | 6 explosion / ejecta
export const MODE = { CORONA: 0, CONVECTION: 1, RADIATIVE: 2, CORE: 3, NEUTRINO: 4, MOTES: 5, EXPLODE: 6 };

const VS = /* glsl */ `
precision highp float;
${NOISE}
attribute vec4 aSeed;
attribute vec4 aSeed2;
uniform float uTime, uMode, uBox, uPx, uSizeWorld, uMinPx, uMaxPx, uStreak, uStreakGain, uMaxLen, uSoft, uAlpha, uT0, uFade;
uniform vec3 uCam, uCamVel, uColA, uColB, uColC, uOrigin;
uniform vec2 uRes, uRange;
uniform vec4 uAux;     // mode specific
uniform vec4 uAux2;
varying vec3 vCol;
varying float vA, vAlong, vSide, vLen, vHalf;

vec3 wrapBox(vec3 b){
  vec3 base = b*uBox;
  return uCam + mod(base - uCam + 0.5*uBox, uBox) - 0.5*uBox;
}
mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

// returns position; heat in [0,1]; a = particle-intrinsic alpha
void particle(float t, vec3 w0, out vec3 pos, out float heat, out float a){
  heat = 0.5; a = 1.0; pos = w0;
  if (uMode < 0.5) {                       // CORONA outflow (radial, looping)
    vec3 n = normalize(w0);
    float L = uAux.x;
    float ph = fract(aSeed.w + t*uAux.y*(0.6+0.8*aSeed2.x));
    pos = w0 + n*(ph-0.5)*L;
    a = sin(3.14159*ph); heat = ph;
  } else if (uMode < 1.5) {                // CONVECTION: rising hot plumes, sinking cool lanes
    vec3 n = normalize(w0);
    float om = uAux.y*(0.6+0.8*aSeed2.x);
    float ph = aSeed2.y*6.2832;
    float cell = snoise(w0*uAux.z + vec3(0.0,0.0,t*0.03));      // coherent large-scale cell
    float dir = sign(cell+0.0001);
    vec3 tg = normalize(cross(n, vec3(aSeed2.z-0.5, aSeed2.w-0.5, 0.7)));
    float s = sin(t*om + ph);
    pos = w0 + n*uAux.x*(0.55*s + 0.9*cell) + tg*uAux.x*0.8*cos(t*om*0.7+ph*1.3);
    heat = clamp(0.5 + 0.5*(cell*1.6 + 0.6*cos(t*om+ph)), 0.0, 1.0);
  } else if (uMode < 2.5) {                // RADIATIVE: photon hops
    float rate = uAux.z;
    float x = t*rate + aSeed2.x*10.0;
    float k = floor(x), f = fract(x);
    vec3 h0 = hash31(aSeed.w*131.0 + k) - 0.5;
    vec3 h1 = hash31(aSeed.w*131.0 + k + 1.0) - 0.5;
    float s = 1.0 - pow(1.0 - f, 5.0);
    pos = w0 + mix(h0, h1, s)*uAux.x*2.0;
    heat = 0.4 + 0.6*aSeed2.z;
  } else if (uMode < 3.5) {                // CORE: fast swirl around z axis
    float r = length(w0);
    float om = uAux.y/(1.0 + r*uAux.z);
    vec2 xy = rot(t*om*(0.7+0.6*aSeed2.x)) * w0.xy;
    vec3 jit = (hash31(aSeed.w*57.0 + floor(t*6.0)) - 0.5)*uAux.x;
    pos = vec3(xy, w0.z) + jit*0.3;
    pos += vec3(0.0,0.0,1.0)*uAux.x*0.6*sin(t*1.7 + aSeed2.y*6.28);
    heat = clamp(1.0 - r/uRange.y, 0.0, 1.0);
  } else if (uMode < 4.5) {                // NEUTRINO: radial from center, very fast
    vec3 d = normalize(aSeed.xyz - 0.5 + 1e-4);
    float L = uAux.x;
    float s = mod(aSeed.w*L + t*uAux.y*(0.7+0.6*aSeed2.x), L);
    pos = uOrigin + d*s; a = 1.0; heat = 0.5;
  } else if (uMode < 5.5) {                // MOTES: slow floating
    pos = w0 + vec3(sin(t*0.31+aSeed2.x*6.28), cos(t*0.27+aSeed2.y*6.28), sin(t*0.23+aSeed2.z*6.28))*uAux.x;
    heat = aSeed2.w;
  } else {                                 // EXPLODE: ejecta from origin
    vec3 d = normalize(aSeed.xyz - 0.5 + 1e-4);
    float tau = max(t - uT0, 0.0);
    float sp = uAux.x*mix(0.25, 1.0, aSeed.w)*(0.6+0.8*aSeed2.x);
    float k = uAux.y;
    float rr = sp*(1.0 - exp(-tau*k))/k;
    vec3 sw = vec3(snoise(d*3.0+aSeed2.y*10.0), snoise(d*3.0+7.0+aSeed2.z*10.0), snoise(d*3.0+13.0))*0.18*rr;
    pos = uOrigin + d*rr + sw;
    a = step(0.0, t - uT0) * exp(-tau*uAux.z);
    heat = aSeed2.w;
  }
}

void main(){
  vec3 w0 = wrapBox(aSeed.xyz);
  vec3 pos, posPrev; float heat, a, h2, a2;
  particle(uTime, w0, pos, heat, a);
  particle(uTime - uStreak, w0, posPrev, h2, a2);
  posPrev += uCamVel*uStreak;

  float r = length(pos);
  float m = smoothstep(uRange.x - uFade, uRange.x + uFade, r) * (1.0 - smoothstep(uRange.y - uFade, uRange.y + uFade, r));
  vec3 rel = w0 - uCam;
  float edge = max(max(abs(rel.x), abs(rel.y)), abs(rel.z))/(0.5*uBox);
  float ef = (uMode > 3.5 && uMode < 4.5) || uMode > 5.5 ? 1.0 : 1.0 - smoothstep(0.72, 1.0, edge);
  float dist = length(pos - uCam);
  float nf = smoothstep(uAux2.x, uAux2.x + uAux2.y, dist);

  vec4 c  = projectionMatrix*viewMatrix*vec4(pos, 1.0);
  vec4 cp = projectionMatrix*viewMatrix*vec4(posPrev, 1.0);
  if (c.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.); vA = 0.; vAlong = vSide = vLen = 0.; vHalf = 1.; return; }

  float halfW = uSizeWorld*projectionMatrix[1][1]/c.w*0.5*uRes.y*mix(0.55, 1.45, aSeed2.w);
  halfW = clamp(halfW, uMinPx*uPx, uMaxPx*uPx);

  vec2 sc = c.xy/c.w*0.5*uRes;
  vec2 sp = cp.w > 0.05 ? cp.xy/cp.w*0.5*uRes : sc;
  vec2 d2 = sc - sp;
  float rawLen = length(d2);
  float len = min(rawLen*uStreakGain, uMaxLen*uPx);
  vec2 dir = rawLen > 0.01 ? d2/rawLen : vec2(1.0, 0.0);
  if (uSoft > 0.5) { len = 0.0; dir = vec2(1.0, 0.0); }
  vec2 nrm = vec2(-dir.y, dir.x);
  float ax = position.x*0.5 + 0.5;
  vec2 base = sc - dir*len*(1.0 - ax);
  vec2 px = base + nrm*position.y*halfW + dir*position.x*halfW;
  gl_Position = vec4(px/(0.5*uRes)*c.w, c.z, c.w);

  vAlong = ax*len + position.x*halfW;
  vSide = position.y*halfW;
  vLen = len;
  vHalf = halfW;

  vec3 col = heat < 0.5 ? mix(uColA, uColB, heat*2.0) : mix(uColB, uColC, heat*2.0 - 1.0);
  if (uMode > 5.5) { // ejecta: color by layer (aSeed2.w) from outer(red) to inner(blue-white)
    float L = aSeed2.w;
    col = L < 0.5 ? mix(uColA, uColB, L*2.0) : mix(uColB, uColC, L*2.0 - 1.0);
  }
  vCol = col*(0.55 + 0.9*aSeed2.z);
  vA = a*m*ef*nf*uAlpha;
}
`;

const FS = /* glsl */ `
precision highp float;
varying vec3 vCol;
varying float vA, vAlong, vSide, vLen, vHalf;
void main(){
  float dseg = max(0.0, max(-vAlong, vAlong - vLen));
  float d = length(vec2(dseg, vSide))/vHalf;
  float I = exp(-d*d*3.2);
  float tail = vLen < 1.0 ? 1.0 : mix(0.12, 1.0, clamp(vAlong/vLen, 0.0, 1.0));
  gl_FragColor = vec4(vCol, I*tail*vA);
}
`;

export class FlowParticles {
  constructor(opts) {
    const o = Object.assign({
      count: 6000, mode: 1, seed: 1, box: 120, sizeWorld: 0.2, minPx: 0.8, maxPx: 30,
      streak: 0.05, streakGain: 1.0, maxLen: 220, soft: 0, alpha: 1,
      range: [0, 1e6], fade: 3, colA: [1, 0.2, 0.02], colB: [1, 0.6, 0.15], colC: [1, 0.95, 0.7],
      aux: [1, 1, 1, 1], aux2: [0.3, 2.5, 0, 0], t0: 0,
    }, opts);
    this.opts = o;
    const rnd = mulberry32(o.seed);
    const n = o.count;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const s1 = new Float32Array(n * 4), s2 = new Float32Array(n * 4);
    for (let i = 0; i < n * 4; i++) { s1[i] = rnd(); s2[i] = rnd(); }
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s1, 4));
    g.setAttribute('aSeed2', new THREE.InstancedBufferAttribute(s2, 4));
    g.instanceCount = n;
    const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uMode: { value: o.mode }, uBox: { value: o.box }, uPx: { value: 1 },
        uSizeWorld: { value: o.sizeWorld }, uMinPx: { value: o.minPx }, uMaxPx: { value: o.maxPx },
        uStreak: { value: o.streak }, uStreakGain: { value: o.streakGain }, uMaxLen: { value: o.maxLen },
        uSoft: { value: o.soft }, uAlpha: { value: o.alpha }, uT0: { value: o.t0 }, uFade: { value: o.fade },
        uCam: { value: new THREE.Vector3() }, uCamVel: { value: new THREE.Vector3() }, uOrigin: { value: new THREE.Vector3() },
        uColA: { value: V3(o.colA) }, uColB: { value: V3(o.colB) }, uColC: { value: V3(o.colC) },
        uRes: { value: new THREE.Vector2(1920, 1080) }, uRange: { value: new THREE.Vector2(o.range[0], o.range[1]) },
        uAux: { value: new THREE.Vector4(...o.aux) }, uAux2: { value: new THREE.Vector4(...o.aux2) },
      },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }
  update(T, ctx, patch = {}) {
    const u = this.mat.uniforms;
    u.uTime.value = T;
    u.uCam.value.copy(ctx.camPos);
    u.uCamVel.value.copy(ctx.camVel);
    u.uRes.value.set(ctx.width, ctx.height);
    u.uPx.value = ctx.px;
    for (const k in patch) {
      if (u[k] === undefined) continue;
      const v = patch[k];
      if (Array.isArray(v)) u[k].value.set(...v); else u[k].value = v;
    }
  }
}
