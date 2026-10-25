import * as THREE from 'three';
import { NOISE } from './glsl.js';

// GlowRibbons: instanced screen-space ribbons evaluated analytically on the GPU.
// Modes: 0 coronal / prominence loops | 1 magnetic field rings at the tachocline
//        2 explicit path from a texture (photon random walk) | 3 spicules (jets from the surface)
export const RMODE = { LOOPS: 0, FIELD: 1, PATH: 2, SPICULES: 3 };

const VS = /* glsl */ `
precision highp float;
${NOISE}
attribute float aLine;
attribute float aSeg;
uniform float uTime, uMode, uSegs, uWidth, uPx, uR, uSpic, uFieldR;
uniform vec2 uRes;
uniform sampler2D uPath;
uniform vec3 uOffset;
varying float vU, vSide, vLine, vSeg, vW;

vec3 P(float L, float u){
  if (uMode < 0.5) {                               // loops
    vec4 h = hash41(L*7.13 + 1.7);
    vec3 d0 = normalize(hash31(L*3.71)*2.0 - 1.0);
    vec3 tg = normalize(cross(d0, normalize(hash31(L*9.1)*2.0 - 1.0)));
    float sep = mix(0.07, 0.30, h.x);
    vec3 d1 = normalize(d0 + tg*sep);
    float height = uR*mix(0.06, 0.30, h.y);
    vec3 p0 = d0*uR, p1 = d1*uR, c = normalize(d0 + d1)*(uR + height*2.0);
    vec3 b = (1.0-u)*(1.0-u)*p0 + 2.0*(1.0-u)*u*c + u*u*p1;
    b += d0*uR*0.012*sin(uTime*0.7 + L)*sin(3.14159*u);
    return b;
  } else if (uMode < 1.5) {                        // field rings around the star's axis
    float lat = mix(-1.25, 1.25, hash11(L*1.31));
    float phi = u*6.28318;
    float tw = 0.10*sin(2.0*phi + L*5.0 + uTime*0.21) + 0.05*sin(5.0*phi - L*3.0 + uTime*0.33);
    float lat2 = lat + tw*(0.4 + 0.6*abs(sin(lat*2.0)));
    float wob = 1.0 + 0.012*sin(7.0*phi + uTime*0.5 + L) + 0.02*sin(3.0*phi - uTime*0.35 + L*2.0);
    float rr = uFieldR*wob;
    return vec3(cos(lat2)*cos(phi), sin(lat2), cos(lat2)*sin(phi))*rr;
  } else if (uMode < 2.5) {
    return vec3(0.0);
  } else {                                         // spicules
    vec3 d = normalize(hash31(L*5.3)*2.0 - 1.0);
    vec3 tg = normalize(cross(d, vec3(0.3, 1.0, 0.2)));
    float hgt = uSpic*(0.35 + 0.65*hash11(L*2.9));
    float bend = 0.25*hgt*u*u*(hash11(L*1.7) - 0.5)*2.0;
    float pul = 0.65 + 0.35*sin(uTime*1.3 + L*3.1);
    return d*(uR + hgt*pul*u) + tg*bend;
  }
}

void main(){
  float u0 = aSeg/uSegs, u1 = (aSeg + 1.0)/uSegs;
  vec3 a, b;
  if (uMode > 1.5 && uMode < 2.5) {
    a = texelFetch(uPath, ivec2(int(aSeg), 0), 0).xyz + uOffset;
    b = texelFetch(uPath, ivec2(int(aSeg) + 1, 0), 0).xyz + uOffset;
  } else {
    a = P(aLine, u0); b = P(aLine, u1);
  }
  vec4 ca = projectionMatrix*viewMatrix*vec4(a, 1.0);
  vec4 cb = projectionMatrix*viewMatrix*vec4(b, 1.0);
  if (ca.w < 0.05 || cb.w < 0.05) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vU = vSide = vLine = vSeg = vW = 0.0; return; }
  vec2 sa = ca.xy/ca.w*0.5*uRes, sb = cb.xy/cb.w*0.5*uRes;
  vec2 d = sb - sa; float dl = length(d);
  d = dl > 0.001 ? d/dl : vec2(1.0, 0.0);
  vec2 n = vec2(-d.y, d.x);
  float e = position.x;                    // 0 = a, 1 = b
  vec4 c = mix(ca, cb, e);
  float hw = uWidth*uPx*0.5;
  vec2 px = mix(sa, sb, e) + n*position.y*hw + d*(e*2.0 - 1.0)*hw*0.8;
  gl_Position = vec4(px/(0.5*uRes)*c.w, c.z, c.w);
  vU = mix(u0, u1, e); vSide = position.y; vLine = aLine; vSeg = aSeg; vW = c.w;
}
`;

const FS = /* glsl */ `
precision highp float;
${NOISE}
uniform float uTime, uMode, uAlpha, uFlowFreq, uFlowSpeed, uHead, uTrail, uFloor;
uniform vec3 uColA, uColB;
varying float vU, vSide, vLine, vSeg, vW;
void main(){
  float core = exp(-vSide*vSide*3.5);
  float flow;
  vec3 col = uColA;
  if (uMode > 1.5 && uMode < 2.5) {
    float behind = uHead - vSeg;
    float vis = step(0.0, behind);
    float f = exp(-max(behind, 0.0)/uTrail);
    flow = vis*mix(uFloor, 1.0, f);
    col = mix(uColA, uColB, f);
  } else {
    float ph = vU*uFlowFreq - uTime*uFlowSpeed + hash11(vLine*3.7);
    flow = 0.45 + 0.55*sin(ph*6.28318);
    flow *= smoothstep(0.0, 0.12, vU)*smoothstep(1.0, 0.88, vU);
    col = mix(uColA, uColB, 0.5 + 0.5*sin(ph*3.14159));
  }
  gl_FragColor = vec4(col, core*flow*uAlpha);
}
`;

export class GlowRibbons {
  constructor(opts) {
    const o = Object.assign({
      lines: 20, segs: 24, mode: 0, width: 3, alpha: 1, R: 100, spic: 1.4, fieldR: 70,
      colA: [1, 0.35, 0.08], colB: [1, 0.8, 0.4], flowFreq: 2, flowSpeed: 0.3, head: 0, trail: 40, floor: 0.2, pathTex: null,
    }, opts);
    const n = o.lines * o.segs;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const aL = new Float32Array(n), aS = new Float32Array(n);
    for (let l = 0, k = 0; l < o.lines; l++) for (let s = 0; s < o.segs; s++, k++) { aL[k] = l + 1; aS[k] = s; }
    g.setAttribute('aLine', new THREE.InstancedBufferAttribute(aL, 1));
    g.setAttribute('aSeg', new THREE.InstancedBufferAttribute(aS, 1));
    g.instanceCount = n;
    const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 }, uMode: { value: o.mode }, uSegs: { value: o.segs }, uWidth: { value: o.width }, uPx: { value: 1 },
        uR: { value: o.R }, uSpic: { value: o.spic }, uFieldR: { value: o.fieldR }, uRes: { value: new THREE.Vector2(1920, 1080) },
        uPath: { value: o.pathTex }, uOffset: { value: new THREE.Vector3() }, uAlpha: { value: o.alpha }, uFlowFreq: { value: o.flowFreq }, uFlowSpeed: { value: o.flowSpeed },
        uHead: { value: o.head }, uTrail: { value: o.trail }, uFloor: { value: o.floor },
        uColA: { value: V3(o.colA) }, uColB: { value: V3(o.colB) },
      },
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
  update(T, ctx, patch = {}) {
    const u = this.mat.uniforms;
    u.uTime.value = T;
    u.uRes.value.set(ctx.width, ctx.height);
    u.uPx.value = ctx.px;
    for (const k in patch) { if (u[k] !== undefined) u[k].value = patch[k]; }
  }
}
