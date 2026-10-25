import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { GlowRibbons } from './ribbons.js';
import { FlowParticles, MODE } from './flow.js';
import { mulberry32, sstep, clamp } from './util.js';

export const STAR_R = 100;            // 1 unit = 6,963 km (so R = 696,340 km)
export const EARTH_R = STAR_R / 109.2; // Earth drawn to true scale

export class SpaceWorld {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const R = STAR_R;

    // ---------- deep-space sky (faint galactic band) + stars ----------
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 1 } },
      vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision highp float; ${NOISE} varying vec3 vD; uniform float uAmt;
        void main(){
          vec3 d = normalize(vD);
          vec3 bn = normalize(vec3(0.25, 0.9, 0.35));
          float band = exp(-pow(dot(d, bn)*3.2, 2.0));
          float dust = fbm3(d*3.0)*0.5 + 0.5;
          float clouds = fbm3(d*7.0 + 11.0)*0.5 + 0.5;
          vec3 col = vec3(0.10, 0.12, 0.22)*band*(0.35 + 0.9*dust)*(0.5 + clouds);
          col += vec3(0.20, 0.08, 0.05)*pow(band, 3.0)*clouds*0.7;
          col *= smoothstep(0.1, 0.7, dust + band*0.4);
          gl_FragColor = vec4(col*0.55*uAmt, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 48, 32), skyMat);
    this.sky.renderOrder = -50;
    this.group.add(this.sky);

    const rnd = mulberry32(7);
    const ns = 7000;
    const sp = new Float32Array(ns * 3), sc = new Float32Array(ns * 3), ss = new Float32Array(ns);
    const bn = new THREE.Vector3(0.25, 0.9, 0.35).normalize();
    for (let i = 0; i < ns; i++) {
      let v;
      do { v = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.01);
      v.normalize();
      // thicken toward the galactic band
      if (rnd() < 0.45) { const k = v.dot(bn); v.addScaledVector(bn, -k * 0.85).normalize(); }
      sp.set([v.x * 5500, v.y * 5500, v.z * 5500], i * 3);
      const temp = rnd();
      const c = temp < 0.2 ? [1.0, 0.75, 0.55] : temp < 0.75 ? [1.0, 1.0, 1.0] : [0.7, 0.8, 1.0];
      const br = Math.pow(rnd(), 3.2) * 1.6 + 0.2;
      sc.set([c[0] * br, c[1] * br, c[2] * br], i * 3);
      ss[i] = 1.0 + Math.pow(rnd(), 6) * 2.6;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aCol', new THREE.BufferAttribute(sc, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uPx: { value: 1 }, uAmt: { value: 1 } },
      vertexShader: `attribute vec3 aCol; attribute float aSize; uniform float uPx; varying vec3 vC;
        void main(){ vC = aCol; gl_PointSize = aSize*uPx; gl_Position = projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision highp float; varying vec3 vC; uniform float uAmt;
        void main(){ vec2 q = gl_PointCoord-0.5; float d = length(q)*2.0; float a = smoothstep(1.0,0.0,d); gl_FragColor = vec4(vC*uAmt, a*a); }`,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -40;
    this.group.add(this.stars);

    // ---------- the star: granulated photosphere ----------
    this.starMatSurf = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vP; varying vec3 vW;
        void main(){ vP = position; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `precision highp float; ${NOISE}
        varying vec3 vP; varying vec3 vW; uniform float uTime;
        float gcell(vec3 p){ return smoothstep(0.03, 0.42, abs(snoise(p))); }
        void main(){
          vec3 n = normalize(vP);
          vec3 V = normalize(cameraPosition - vW);
          float mu = clamp(dot(n, V), 0.0, 1.0);
          float px = length(fwidth(n));
          float t = uTime;
          vec3 dr = vec3(sin(t*0.05), cos(t*0.043), sin(t*0.037))*0.8;
          float g1 = gcell(n*14.0 + dr);
          float w2 = 1.0 - smoothstep(0.18, 0.5, 70.0*px);
          float g2 = gcell(n*70.0 + dr*2.0 + vec3(0.0, 0.0, t*0.1));
          float w3 = 1.0 - smoothstep(0.18, 0.5, 380.0*px);
          float g3 = gcell(n*380.0 + dr*4.0 + vec3(t*0.15, 0.0, 0.0));
          float gran = g1*0.42 + mix(0.5, g2, w2)*0.36 + mix(0.5, g3, w3)*0.22;
          vec3 dark = vec3(0.50, 0.10, 0.012);
          vec3 bright = vec3(1.10, 0.70, 0.28);
          vec3 col = mix(dark, bright, smoothstep(0.18, 0.88, gran));
          float lat = abs(n.y);
          float spot = smoothstep(0.50, 0.68, snoise(n*2.4 + 3.0)*0.55 + fbm3(n*6.0)*0.45) * smoothstep(0.05, 0.25, lat) * (1.0 - smoothstep(0.45, 0.62, lat));
          col *= 1.0 - 0.88*spot;
          float ld = 0.32 + 0.68*pow(mu, 0.55);
          col *= mix(vec3(1.0, 0.5, 0.2), vec3(1.0), pow(mu, 0.35));
          gl_FragColor = vec4(col*ld, 1.0);
        }`,
    });
    this.star = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 192), this.starMatSurf);
    this.group.add(this.star);

    // ---------- corona billboard ----------
    this.coronaMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: 2600 }, uR: { value: R }, uOpacity: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `precision highp float; ${NOISE} varying vec2 vUv; uniform float uTime, uSize, uR, uOpacity;
        void main(){
          vec2 q = (vUv - 0.5)*uSize;
          float r = length(q)/uR;
          float ang = atan(q.y, q.x);
          vec2 cs = vec2(cos(ang), sin(ang))*3.2;
          float st = fbm3(vec3(cs, r*0.22 + uTime*0.012))*0.5 + 0.5;
          float st2 = fbm3(vec3(cs*2.3, r*0.4 - uTime*0.02 + 5.0))*0.5 + 0.5;
          float rr = max(r - 0.97, 0.0);
          float core = exp(-rr*4.2)*1.5 + exp(-rr*1.15)*0.16;
          float streamers = pow(st, 1.7)*exp(-rr*0.50)*0.95 + pow(st2, 2.2)*exp(-rr*0.9)*0.5;
          float I = (core + streamers)*smoothstep(0.96, 1.0, r)*(1.0 - smoothstep(6.0, 12.0, r));
          vec3 col = mix(vec3(1.0, 0.62, 0.30), vec3(0.62, 0.74, 1.0), smoothstep(1.2, 4.5, r));
          gl_FragColor = vec4(col, I*uOpacity);
        }`,
    });
    this.corona = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).scale(2600, 2600, 1), this.coronaMat);
    this.corona.renderOrder = 1;
    this.group.add(this.corona);

    // ---------- magnetic loops / prominences ----------
    this.loops = new GlowRibbons({ lines: 30, segs: 28, mode: 0, width: 3.4, R, colA: [1.0, 0.28, 0.06], colB: [1.0, 0.75, 0.35], flowFreq: 2.2, flowSpeed: 0.35, alpha: 1.2 });
    this.group.add(this.loops.mesh);
    // ---------- spicules ----------
    this.spic = new GlowRibbons({ lines: 1100, segs: 2, mode: 3, width: 2.2, R, spic: 1.5, colA: [1.0, 0.25, 0.3], colB: [1.0, 0.55, 0.45], flowFreq: 1, flowSpeed: 0.2, alpha: 0.9 });
    this.group.add(this.spic.mesh);

    // ---------- coronal outflow streaks (only while diving through the corona) ----------
    this.wind = new FlowParticles({
      count: 2600, mode: MODE.CORONA, seed: 11, box: 560, sizeWorld: 0.5, minPx: 0.8, maxPx: 6,
      streak: 0.35, streakGain: 1.0, maxLen: 260, range: [R * 1.003, R * 5.5], fade: 6,
      colA: [1.0, 0.45, 0.15], colB: [1.0, 0.85, 0.6], colC: [0.7, 0.85, 1.0], aux: [160, 0.18, 0, 0], aux2: [4, 20, 0, 0], alpha: 0.9,
    });
    this.group.add(this.wind.mesh);

    // ---------- 109 Earths across the star ----------
    const eg = new THREE.SphereGeometry(EARTH_R, 18, 12);
    const em = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.28, 1.6) });
    this.earths = new THREE.InstancedMesh(eg, em, 109);
    this.earths.frustumCulled = false;
    this.earths.renderOrder = 8;
    this.group.add(this.earths);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
  }

  update(T, ctx, S) {
    const vis = S.space > 0.001;
    this.group.visible = vis;
    if (!vis) return;
    const u = this.starMatSurf.uniforms; u.uTime.value = T;
    this.coronaMat.uniforms.uTime.value = T;
    this.corona.quaternion.copy(ctx.camera.quaternion);
    this.coronaMat.uniforms.uOpacity.value = S.corona;
    this.corona.visible = S.corona > 0.002;
    this.sky.visible = S.sky > 0.002;
    this.sky.position.copy(ctx.camPos);
    this.sky.material.uniforms.uAmt.value = S.sky;
    this.stars.visible = S.sky > 0.002;
    this.stars.position.copy(ctx.camPos);
    this.starMat.uniforms.uPx.value = ctx.px;
    this.starMat.uniforms.uAmt.value = S.sky;
    this.star.visible = S.star > 0.5;

    this.loops.mesh.visible = S.loops > 0.01;
    this.loops.update(T, ctx, { uAlpha: 1.2 * S.loops });
    this.spic.mesh.visible = S.spicules > 0.01;
    this.spic.update(T, ctx, { uAlpha: 0.9 * S.spicules });
    this.wind.mesh.visible = S.wind > 0.01;
    this.wind.update(T, ctx, { uAlpha: 0.9 * S.wind });

    // Earth row reveal
    this.earths.visible = S.earths.show > 0.001;
    if (this.earths.visible) {
      const d = EARTH_R * 2;
      for (let i = 0; i < 109; i++) {
        const k = clamp((S.earths.progress * 120 - i) / 8);
        const sc = sstep(0, 1, k) * S.earths.show;
        this._p.set(-STAR_R + EARTH_R + i * d, 0, STAR_R + 3.5);
        this._s.set(sc, sc, sc);
        this._m.compose(this._p, this._q, this._s);
        this.earths.setMatrixAt(i, this._m);
      }
      this.earths.instanceMatrix.needsUpdate = true;
    }
  }
}
