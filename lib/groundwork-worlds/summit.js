// Copied from design-mockups/groundwork-3d/concept3.js by scripts/sync-groundwork-worlds.mjs.
// Edit the original there, then run: node scripts/sync-groundwork-worlds.mjs
/* eslint-disable */
// Groundwork 3D concept 3: "The Summit" (v2)
// A sculpted mountain in pre-dawn mist. A small climber walks a switchback trail of stepping stones that
// light up gold as the focus session progresses; at the end they plant a gold flag on the summit as the sun crests.
// Procedural only: no external assets.
//
// Time contract (v2):
//  - The climber's distance along the trail and the number of lit stones are a pure function of progress p.
//    The summit is reached exactly at p = 1; setPhase('done') then plays the flag plant.
//  - setProgress(p) is expected about once a second. Between calls the climber walks at a steady pace from the
//    previous value to the new one, finishing before the next call (never more than ~1 s behind p).
//  - setProgress(p, { instant: true }) (e.g. the student returns after minutes away) jumps straight there.
//  - 'paused' freezes the world clock: no walking, drift, mist or particles. Same p, same picture.
//  - mount(canvas, { reduceMotion, quality: 'high' | 'low' }). 'low' = no shadows, no bloom, pixel ratio 1.25,
//    fewer particles. reduceMotion = no camera drift, no particles, no mist drift.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// ---------- warm up: where the browser can compile shaders off the main thread (KHR_parallel_shader_compile),
// compile every shader before the first frame, so the page never stalls on it. Elsewhere (software rendering,
// some older GPUs) this would only add work, so the first frame compiles as before. Settles within 5 s.
function warmUp(renderer, scene, camera) {
  return new Promise((done) => {
    let over = false;
    const end = () => { if (!over) { over = true; clearTimeout(cap); done(); } };
    const cap = setTimeout(end, 5000);
    try {
      if (!renderer.extensions.has('KHR_parallel_shader_compile')) { end(); return; }
      // like renderer.compileAsync, but a material without a program (it can happen) counts as ready
      const mats = renderer.compile(scene, camera);
      const poll = () => {
        if (over) return;
        mats.forEach((m) => { const pr = renderer.properties.get(m).currentProgram; if (!pr || pr.isReady()) mats.delete(m); });
        if (mats.size) setTimeout(poll, 16); else end();
      };
      poll();
    } catch (e) { end(); }
  });
}

// ---------------------------------------------------------------- small helpers
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
function angleDiff(a, b) { return ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; }
function angleLerp(a, b, t) { return a + angleDiff(a, b) * t; }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const grad = (h, x, y) => { const a = h * 2.39996323; return Math.cos(a) * x + Math.sin(a) * y; };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y, xi = X & 255, yi = Y & 255;
    const aa = p[p[xi] + yi], ab = p[p[xi] + yi + 1], ba = p[p[xi + 1] + yi], bb = p[p[xi + 1] + yi + 1];
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u), lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u), v) * 1.4;
  };
}
function radialTexture(stops, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// tileable rock grain: periodic value-noise fbm with faint horizontal layering (reads as strata on cliffs)
function rockGrainTexture(size = 256) {
  const rnd = mulberry32(1234);
  const lat = (P) => { const a = new Float32Array(P * P); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
  const octs = [[4, 4, 0.34], [8, 8, 0.26], [16, 16, 0.18], [32, 32, 0.12], [64, 64, 0.06], [4, 48, 0.16]].map(([px, py, w]) => ({ px, py, w, l: lat(Math.max(px, py)), P: Math.max(px, py) }));
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const img = g.createImageData(size, size);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, wsum = 0;
    for (const o of octs) {
      const fx = (x / size) * o.px, fy = (y / size) * o.py;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
      const at = (i, j) => o.l[((j % o.py) * o.P + (i % o.px)) % o.l.length];
      v += lerp(lerp(at(x0, y0), at(x0 + 1, y0), tx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty) * o.w; wsum += o.w;
    }
    v /= wsum; v = clamp((v - 0.5) * 1.6 + 0.5, 0, 1);
    const k = Math.round(lerp(196, 255, v)); const i = (y * size + x) * 4;
    img.data[i] = k; img.data[i + 1] = k; img.data[i + 2] = k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- palette across the session (pre-dawn -> sunrise)
const KEYS = [
  { p: 0.0, skyTop: '#090d16', skyHor: '#26304a', skyLow: '#1a2030', fog: '#222c42', haze: '#2c3a5c', hemiSky: '#6a7fae', hemiGround: '#15181f', hemiI: 0.8,
    key: '#a9bfea', keyI: 1.05, keyDir: [0.55, 0.75, 0.42], fill: '#45598a', fillI: 0.45, rim: '#8ea2d6', rimI: 0.95, glow: 0.0, warm: 0.0, trail: 1.0, stars: 1.0 },
  { p: 0.5, skyTop: '#0d1322', skyHor: '#585d7c', skyLow: '#33374b', fog: '#3f4560', haze: '#4f5b82', hemiSky: '#7c8bb0', hemiGround: '#221f24', hemiI: 0.85,
    key: '#f2bd8f', keyI: 1.7, keyDir: [-0.8, 0.38, 0.1], fill: '#4d5d86', fillI: 0.42, rim: '#e7b28e', rimI: 0.9, glow: 0.3, warm: 0.45, trail: 0.8, stars: 0.35 },
  { p: 1.0, skyTop: '#0f1524', skyHor: '#c98a64', skyLow: '#6c5a5e', fog: '#7a6f78', haze: '#6d7699', hemiSky: '#98a4c6', hemiGround: '#2e2629', hemiI: 0.85,
    key: '#ffd39c', keyI: 3.0, keyDir: [-0.55, 0.42, -0.55], fill: '#6a7aa3', fillI: 0.55, rim: '#ffc58e', rimI: 1.2, glow: 1.0, warm: 1.0, trail: 0.5, stars: 0.0 },
];
const KEY_COLORS = ['skyTop', 'skyHor', 'skyLow', 'fog', 'haze', 'hemiSky', 'hemiGround', 'key', 'fill', 'rim'];
const KEY_NUMS = ['hemiI', 'keyI', 'fillI', 'rimI', 'glow', 'warm', 'trail', 'stars'];
const KEYS_C = KEYS.map((k) => { const o = { ...k }; KEY_COLORS.forEach((n) => { o[n] = new THREE.Color(k[n]); }); o.keyDir = new V3(...k.keyDir).normalize(); return o; });
function samplePalette(p, out) {
  let i = 0; while (i < KEYS_C.length - 2 && p > KEYS_C[i + 1].p) i++;
  const a = KEYS_C[i], b = KEYS_C[i + 1];
  const t = easeInOut(clamp((p - a.p) / (b.p - a.p), 0, 1));
  KEY_COLORS.forEach((n) => out[n].copy(a[n]).lerp(b[n], t));
  KEY_NUMS.forEach((n) => { out[n] = lerp(a[n], b[n], t); });
  out.keyDir.copy(a.keyDir).lerp(b.keyDir, t).normalize();
  return out;
}

// ---------------------------------------------------------------- climber poses
const PK = ['hipY', 'hipX', 'hipYaw', 'hipRoll', 'torsoX', 'torsoY', 'torsoZ', 'headX', 'headY', 'thL', 'thLz', 'shL', 'ftL', 'thR', 'thRz', 'shR', 'ftR', 'uaLx', 'uaLz', 'laL', 'uaRx', 'uaRz', 'laR'];
const pose = (o = {}) => { const p = {}; PK.forEach((k) => { p[k] = o[k] ?? 0; }); return p; };
const mixPose = (a, b, t, out) => { PK.forEach((k) => { out[k] = a[k] + (b[k] - a[k]) * t; }); return out; };
const STAND = pose({ torsoX: 0.06, headX: -0.08, thLz: 0.03, thRz: -0.03, uaLx: -0.18, uaLz: 0.16, laL: -0.5, uaRx: 0.05, uaRz: -0.14, laR: -0.2 });
const SIT = pose({ hipY: -0.43, thL: -1.42, thLz: 0.14, shL: 1.45, ftL: 0.05, thR: -1.5, thRz: -0.1, shR: 1.35, ftR: 0.1,
  torsoX: 0.3, headX: -0.22, headY: 0.45, uaLx: -0.75, uaLz: 0.12, laL: -0.9, uaRx: -0.6, uaRz: -0.2, laR: -1.1 });
// flag plant keyframes (times in seconds since arriving on the summit)
const PLANT = [
  [0.0, STAND],
  [0.6, pose({ ...STAND, torsoY: -0.32, headY: -0.42, headX: 0.05, uaRx: 0.55, uaRz: -0.4, laR: -1.75 })], // reach back to the pack
  [1.15, pose({ ...STAND, hipY: -0.035, thL: -0.18, shL: 0.36, thR: -0.18, shR: 0.36, torsoX: -0.14, torsoY: 0.08, headX: -0.38, uaRx: -2.75, uaRz: -0.18, laR: -0.25 })], // raise, anticipation
  [1.32, pose({ ...STAND, hipY: -0.1, thL: -0.48, shL: 0.92, thR: -0.42, shR: 0.84, torsoX: 0.55, torsoY: -0.12, headX: 0.22, uaRx: -1.05, uaRz: -0.36, laR: -0.12 })], // strike (weight drops)
  [1.75, pose({ ...STAND, hipY: -0.06, thL: -0.28, shL: 0.54, thR: -0.24, shR: 0.48, torsoX: 0.3, torsoY: -0.05, headX: 0.05, uaRx: -0.7, uaRz: -0.3, laR: -0.5 })], // follow-through
  [2.9, pose({ ...STAND, torsoX: -0.04, headX: -0.3, headY: 0.12, uaRx: 0.0, uaRz: -0.16, laR: -0.25 })], // settle, look at the sunrise
];
const PLANT_EASE = [easeInOut, easeInOut, easeIn, easeOut, easeInOut];

// ---------------------------------------------------------------- framing per screen shape
// Fractions are measured from the top of the screen. Portrait: clock in the top third. Landscape: clock centre-top.
const LAYOUT = {
  portrait: { fov: 42, peakY: 0.41, climbY: 0.83, doneY: 0.525, doneSize: 0.105, band: 0.29, bandW: 0.14, maxClimber: 0.1 },
  landscape: { fov: 30, peakY: 0.47, climbY: 0.87, doneY: 0.64, doneSize: 0.15, band: 0.3, bandW: 0.15, maxClimber: 0.13 },
};
const CLIMBER_H = 1.42; // world units, beanie to sole

// ---------------------------------------------------------------- mount
function mount(canvas, { reduceMotion = false, quality = 'high' } = {}) {
  const LOW = quality === 'low';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: LOW, powerPreference: LOW ? 'default' : 'high-performance' });
  const DPR = window.devicePixelRatio || 1;
  const PR = LOW ? Math.min(DPR, 1.25) : Math.min(DPR, 2);
  renderer.setPixelRatio(PR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !LOW;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 390 / 844, 0.1, 1200);
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // ---- fog: exponential distance fog plus a low valley mist that pools in the valleys; distant ranges get a blue haze
  scene.fog = new THREE.FogExp2(0x222c42, 0.0122);
  const fogU = { uHFBase: { value: 0.0 }, uHFFall: { value: 0.62 }, uHFAmt: { value: 0.95 }, uHaze: { value: new THREE.Color('#2c3a5c') } };
  function patchFog(mat, { extra = null, haze = 0 } = {}) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fogU);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vHFY;')
        .replace('#include <fog_vertex>', `#include <fog_vertex>
          vec4 hfP = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            hfP = instanceMatrix * hfP;
          #endif
          vHFY = (modelMatrix * hfP).y;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vHFY;\nuniform float uHFBase, uHFFall, uHFAmt;\nuniform vec3 uHaze;')
        .replace('#include <fog_fragment>', `#ifdef USE_FOG
          float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
          float hf = uHFAmt * exp( - max( vHFY - uHFBase, 0.0 ) * uHFFall ) * smoothstep( 5.0, 42.0, vFogDepth );
          fogFactor = clamp( fogFactor + hf * ( 1.0 - fogFactor ), 0.0, 1.0 );
          vec3 fogC = fogColor;
          ${haze > 0 ? `fogC = mix( fogColor, uHaze, ${haze.toFixed(2)} * smoothstep( 20.0, 90.0, vFogDepth ) );
          fogFactor = clamp( fogFactor * 1.08 + 0.12 * smoothstep( 25.0, 110.0, vFogDepth ), 0.0, 0.97 );` : ''}
          gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
        #endif`);
      if (extra) extra(sh);
    };
    mat.customProgramCacheKey = () => 'summit2-hf' + (extra ? '-x' : '') + (haze ? '-h' + haze : '');
    return track(mat);
  }

  // ---- sky dome (with a calm darker band behind the clock, in screen space)
  const skyU = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uLow: { value: new THREE.Color() },
    uSun: { value: new THREE.Color('#ffc98a') }, uWarm: { value: new THREE.Color('#f0a066') },
    uSunDir: { value: new V3(0, 0, -1) }, uGlow: { value: 0 }, uWarmAmt: { value: 0 },
    uRes: { value: new THREE.Vector2(390, 844) }, uBand: { value: new THREE.Vector3(0.29, 0.13, 0.2) },
  };
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(600, 32, 16)), track(new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uTop, uHor, uLow, uSun, uWarm, uSunDir; uniform float uGlow, uWarmAmt; uniform vec2 uRes; uniform vec3 uBand; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 col = mix(uHor, uTop, pow(smoothstep(-0.01, 0.16, h), 0.7));
        col = mix(uLow, col, smoothstep(-0.3, 0.0, h));
        vec3 s = normalize(uSunDir);
        float az = max(dot(normalize(d.xz + 1e-5), normalize(s.xz + 1e-5)), 0.0);
        col += uWarm * exp(-abs(h - 0.005) * 11.0) * pow(az, 5.0) * uWarmAmt;
        float c = max(dot(d, s), 0.0);
        col += uSun * (pow(c, 28.0) * 0.07 + pow(c, 180.0) * 0.32 + pow(c, 2400.0) * 1.5) * uGlow;
        // darker, calmer band where the clock sits (fraction from the top of the screen)
        float fy = 1.0 - gl_FragCoord.y / uRes.y;
        float band = exp(-pow((fy - uBand.x) / uBand.y, 2.0));
        col *= 1.0 - uBand.z * band;
        col += (hash(gl_FragCoord.xy) - 0.5) * 0.006;
        gl_FragColor = vec4(col, 1.0);
      }`,
  })));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  // stars (fade out as dawn comes)
  const starGeo = track(new THREE.BufferGeometry());
  { const rnd = mulberry32(7); const a = [];
    for (let i = 0; i < 160; i++) { const az = (rnd() - 0.5) * 2.2 + Math.PI; const el = 0.12 + Math.pow(rnd(), 0.8) * 0.9; a.push(Math.sin(az) * Math.cos(el) * 500, Math.sin(el) * 500, Math.cos(az) * Math.cos(el) * 500); }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); }
  const starMat = track(new THREE.PointsMaterial({ color: 0xdfe6f5, size: 1.4 * PR, sizeAttenuation: false, transparent: true, opacity: 0.6, fog: false, depthWrite: false }));
  const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; stars.renderOrder = -9; scene.add(stars);

  // ---- terrain: the mountain
  const nA = makeNoise(11), nB = makeNoise(29), nC = makeNoise(53), nD = makeNoise(71);
  const fbm = (n, x, y) => n(x, y) * 0.6 + n(x * 2.03, y * 2.03) * 0.28 + n(x * 4.1, y * 4.1) * 0.12;
  const PEAK_H = 9.0;
  function terrainBase(x, z) {
    const r = Math.hypot(x * 0.92, z);
    let h = PEAK_H * Math.pow(Math.max(0, 1 - r / 8.8), 1.3);
    h += 0.9 * Math.exp(-(x * x + z * z) / 1.6);
    const ridged = 1 - Math.abs(nA(x * 0.2, z * 0.2));
    const mid = sstep(0.0, 3.5, h) * (1 - sstep(7.5, 9.5, h));
    h += (ridged * ridged - 0.45) * 1.5 * mid;
    // gullies and buttresses for a carved, weathered look
    const gul = 1 - Math.abs(nD(Math.atan2(x, z) * 4.6, r * 0.35));
    h -= gul * gul * gul * 0.32 * mid;
    // shoulders that frame the main peak
    const s1 = Math.hypot((x + 5.2) * 0.9, z + 3.6); h = Math.max(h, 6.1 * Math.pow(Math.max(0, 1 - s1 / 6.0), 1.25) + nB(x * 0.3, z * 0.3) * 0.5);
    const s2 = Math.hypot((x - 5.8) * 0.85, z + 5.5); h = Math.max(h, 5.2 * Math.pow(Math.max(0, 1 - s2 / 6.2), 1.2) + nC(x * 0.3, z * 0.3) * 0.5);
    // foothills, valley floor and fine rock detail
    h += fbm(nB, x * 0.06, z * 0.06) * 1.4 * (1 - sstep(4, 8, h)) + 0.35;
    h += fbm(nC, x * 0.9, z * 0.9) * 0.09 * sstep(1.5, 4, h);
    const crag = 1 - Math.abs(nD(x * 0.85 + 3.1, z * 0.85 - 2.3));
    h += (crag * crag - 0.42) * 0.42 * mid;
    return h;
  }

  // ---- the switchback trail: polar zig-zag around the peak, legs narrowing toward the top
  const PATH_N = 700, LEGS = 5;
  const pathPts = [];
  for (let i = 0; i < PATH_N; i++) {
    const u = i / (PATH_N - 1);
    const r = 8.1 * Math.pow(1 - u, 1.18);
    const ph = u * LEGS;
    const tri = Math.asin(0.985 * Math.cos(Math.PI * ph)) / Math.asin(0.985); // rounded triangle wave, starts at +1
    const lateral = lerp(2.3, 1.15, u) * (1 - sstep(0.9, 1.0, u));
    const ang = clamp(lateral / Math.max(r, 0.6), 0, 1.2) * -tri; // start on the left
    pathPts.push(new V3(Math.sin(ang) * r, 0, Math.cos(ang) * r));
  }
  const rawH = pathPts.map((p) => terrainBase(p.x, p.z));
  const pathH = rawH.map((_, i) => { let s = 0, w = 0; for (let k = -14; k <= 14; k++) { const j = clamp(i + k, 0, PATH_N - 1); s += rawH[j]; w++; } return s / w; });
  for (let i = 1; i < PATH_N; i++) pathH[i] = Math.max(pathH[i], pathH[i - 1] + 0.001);
  const SUMMIT_H = pathH[PATH_N - 1];
  pathPts.forEach((p, i) => { p.y = pathH[i]; });
  const pathS = [0];
  for (let i = 1; i < PATH_N; i++) pathS.push(pathS[i - 1] + pathPts[i].distanceTo(pathPts[i - 1]));
  const PATH_L = pathS[PATH_N - 1];
  function samplePath(s, outP, outT) {
    s = clamp(s, 0, PATH_L);
    let lo = 0, hi = PATH_N - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pathS[m] <= s) lo = m; else hi = m; }
    const t = (s - pathS[lo]) / Math.max(1e-6, pathS[hi] - pathS[lo]);
    if (outP) outP.copy(pathPts[lo]).lerp(pathPts[hi], t);
    if (outT) { const a = Math.max(0, lo - 3), b = Math.min(PATH_N - 1, hi + 3); outT.copy(pathPts[b]).sub(pathPts[a]).setY(0).normalize(); }
    return outP;
  }
  const coarse = []; for (let i = 0; i < PATH_N; i += 2) coarse.push(i);
  function nearestPath(x, z) {
    let best = 1e9, bi = 0;
    for (const i of coarse) { const p = pathPts[i]; const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; bi = i; } }
    return [Math.sqrt(best), bi];
  }
  function heightAt(x, z, info) {
    let h = terrainBase(x, z);
    const [d, i] = nearestPath(x, z);
    const ledge = 1 - sstep(0.3, 0.85, d);
    h = lerp(h, pathH[i] - 0.03, ledge);
    // a natural pointed summit: a small platform for the climber, then rock falling away like a cone tip
    const r = Math.hypot(x, z);
    const cone = SUMMIT_H + 0.02 - 1.25 * Math.pow(Math.max(0, r - 0.42), 1.05) + nC(x * 2.1, z * 2.1) * 0.06 * sstep(0.5, 1.2, r);
    h = Math.min(h, cone);
    h = lerp(h, SUMMIT_H - 0.02, 1 - sstep(0.3, 0.5, r));
    if (info) { info.trail = 1 - sstep(0.24, 0.5, d); info.d = d; }
    return h;
  }

  const grainTex = track(rockGrainTexture(LOW ? 128 : 256));

  // sculpted terrain: smooth normals, rock strata, slope snow, scrub, and baked cavity occlusion in the vertex colours
  const terrainGeo = (() => {
    const SEG = LOW ? 110 : 170, HALF = 40;
    const map = (g) => HALF * (0.4 * g + 0.6 * g * g * g);
    const N1 = SEG + 1;
    const xs = new Float32Array(N1 * N1), zs = new Float32Array(N1 * N1), hs = new Float32Array(N1 * N1), trs = new Float32Array(N1 * N1);
    const info = {};
    for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) {
      const k = j * N1 + i;
      const x = map((i / SEG) * 2 - 1), z = map((j / SEG) * 2 - 1) + 4;
      xs[k] = x; zs[k] = z; hs[k] = heightAt(x, z, info); trs[k] = info.trail;
    }
    const pos = new Float32Array(N1 * N1 * 3), uv = new Float32Array(N1 * N1 * 2);
    for (let k = 0; k < N1 * N1; k++) {
      pos[k * 3] = xs[k]; pos[k * 3 + 1] = hs[k]; pos[k * 3 + 2] = zs[k];
      uv[k * 2] = xs[k] * 0.8 + zs[k] * 0.3; uv[k * 2 + 1] = hs[k] * 1.0 + zs[k] * 0.55;
    }
    const idx = [];
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
      if ((i + j) % 2) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const nor = g.attributes.normal;
    const col = new Float32Array(N1 * N1 * 3);
    const rockA = new THREE.Color('#646a78'), rockB = new THREE.Color('#77716d'), rockC = new THREE.Color('#4a505d'), rockD = new THREE.Color('#857b72');
    const scrub = new THREE.Color('#38463f'), scrub2 = new THREE.Color('#465042'), snow = new THREE.Color('#eeedea'), snowB = new THREE.Color('#d5dae3');
    const earth = new THREE.Color('#6a615a'), trailSnow = new THREE.Color('#cbc7c0');
    const c = new THREE.Color(), t2 = new THREE.Color();
    for (let j = 0; j <= SEG; j++) for (let i = 0; i <= SEG; i++) {
      const k = j * N1 + i; const x = xs[k], y = hs[k], z = zs[k]; const ny = nor.getY(k);
      // strata: tilted bands of warm and cool rock, stronger on steep faces
      const band = y * 1.55 + nA(x * 0.13, z * 0.13) * 1.7 + x * 0.06;
      const sb = 0.5 + 0.5 * Math.sin(band * TAU * 0.5);
      const sb2 = 0.5 + 0.5 * Math.sin(band * TAU * 1.37 + 1.1);
      c.copy(rockA).lerp(rockB, sstep(0.35, 0.75, sb)).lerp(rockC, sstep(0.6, 0.95, sb2) * 0.75);
      c.lerp(rockD, sstep(0.82, 0.98, sb) * 0.5 * (1 - ny));
      const fine = nC(x * 1.7, z * 1.7 + y); c.multiplyScalar(0.93 + fine * 0.1);
      // scrub and alpine grass on the gentle lower slopes
      const grass = sstep(0.62, 0.82, ny) * (1 - sstep(2.2, 3.6 + nB(x * 0.4, z * 0.4) * 0.8, y));
      c.lerp(t2.copy(scrub).lerp(scrub2, 0.5 + 0.5 * nD(x * 0.5, z * 0.5)), grass * 0.85);
      // snow: settles on gentle slopes above a noisy snow line, thins on steep faces
      const snowLine = 4.5 + nB(x * 0.35, z * 0.35) * 1.0;
      let sn = sstep(snowLine - 0.25, snowLine + 0.35, y) * sstep(0.3, 0.52, ny);
      if (y > 7.8) sn = Math.max(sn, sstep(0.18, 0.4, ny) * sstep(7.8, 8.6, y));
      sn = clamp(sn + (y > snowLine ? sstep(0.45, 0.55, ny) * 0.2 * (0.5 + nC(x * 2.3, z * 2.3)) : 0), 0, 1);
      c.lerp(t2.copy(snow).lerp(snowB, 0.4 + 0.3 * nC(x, z)), sn);
      // trail: packed earth, or trodden snow up high
      const tr = trs[k] * sstep(0.4, 0.6, ny);
      c.lerp(sn > 0.5 ? trailSnow : earth, tr * 0.85);
      // cavity occlusion from the height field, plus brighter ridges
      const at = (ii, jj) => hs[clamp(jj, 0, SEG) * N1 + clamp(ii, 0, SEG)];
      const lap = (at(i - 1, j) + at(i + 1, j) + at(i, j - 1) + at(i, j + 1)) / 4 - y;
      const lap2 = (at(i - 3, j) + at(i + 3, j) + at(i, j - 3) + at(i, j + 3)) / 4 - y;
      const ao = clamp(1 - Math.max(0, lap) * 1.6 - Math.max(0, lap2) * 0.45, 0.5, 1) * (1 + clamp(-lap2, 0, 0.5) * 0.35);
      c.multiplyScalar(ao * lerp(0.82, 1.0, sstep(0.4, 3.0, y)));
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return track(g);
  })();
  const terrainMat = patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.93, metalness: 0, map: grainTex, bumpMap: grainTex, bumpScale: 3.0 }));
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);

  // ---- layered distant ranges (smooth, snow-capped, sinking into a blue haze)
  const rangeMat = patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, map: grainTex }), { haze: 0.55 });
  function makeRange({ z, x = 0, width, depth, amp, base, seed, segX, segZ, freq, tint }) {
    const n = makeNoise(seed), n2 = makeNoise(seed + 7);
    const g = new THREE.PlaneGeometry(width, depth, segX, segZ); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position; const uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), pz = p.getZ(i);
      const ridge = 1 - Math.abs(n(px * freq, 0.37)); const ridge2 = 1 - Math.abs(n(px * freq * 2.3, 4.1)); const ridge3 = 1 - Math.abs(n(px * freq * 5.1, 8.3));
      const prof = base + amp * (0.22 + 0.58 * ridge * ridge + 0.14 * ridge2 + 0.06 * ridge3);
      const fall = Math.pow(Math.max(0, 1 - Math.abs(pz + (n(px * 0.05, 9) * depth * 0.15)) / (depth * 0.5)), 1.15);
      const gully = (1 - Math.abs(n2(px * freq * 3.0, pz * 0.15))) * amp * 0.08 * fall;
      p.setY(i, lerp(-4, prof, fall) - gully + n(px * 0.4, pz * 0.4) * 0.5 + n2(px * 1.3, pz * 1.3) * 0.18);
      uv.setXY(i, px * 0.12, p.getY(i) * 0.25);
    }
    g.computeVertexNormals();
    const nor = g.attributes.normal; const col = new Float32Array(p.count * 3);
    const cR = new THREE.Color(tint), cS = new THREE.Color('#e2e4e8'); const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), ny = nor.getY(i), px = p.getX(i);
      const sl = base + amp * (0.58 + n2(px * 0.08, 2.0) * 0.12);
      const sn = sstep(sl - 0.6, sl + 0.6, y) * sstep(0.45, 0.68, ny);
      c.copy(cR).multiplyScalar(0.9 + n(px * 0.6, y * 0.6) * 0.12).lerp(cS, sn);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(track(g), rangeMat); m.position.set(x, 0, z); scene.add(m);
    return m;
  }
  makeRange({ z: -34, x: 4, width: 170, depth: 28, amp: 7.5, base: -1, seed: 101, segX: LOW ? 110 : 200, segZ: LOW ? 10 : 22, freq: 0.07, tint: '#55617a' });
  makeRange({ z: -62, x: -10, width: 240, depth: 34, amp: 12.5, base: -1.5, seed: 202, segX: LOW ? 90 : 150, segZ: LOW ? 8 : 14, freq: 0.05, tint: '#5a6683' });
  makeRange({ z: -105, x: 15, width: 340, depth: 44, amp: 21, base: -3, seed: 303, segX: LOW ? 80 : 120, segZ: LOW ? 6 : 10, freq: 0.035, tint: '#5e6a88' });

  // ---- drifting mist sheets in the valleys (lapping at the mountain's base)
  const mistU = { uColor: { value: new THREE.Color() }, uTime: { value: 0 } };
  function makeMistMat(opacity, inner) {
    return track(new THREE.ShaderMaterial({
      uniforms: { uColor: mistU.uColor, uTime: mistU.uTime, uOpacity: { value: opacity }, uInner: { value: inner } }, transparent: true, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity, uTime, uInner; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 q = vW.xz * vec2(0.035, 0.06) + vec2(uTime * 0.006, uTime * 0.002);
          float f = n(q) * 0.55 + n(q * 2.1 + 3.7) * 0.3 + n(q * 4.3 + 1.3) * 0.15;
          float r = length(vW.xz - vec2(0.0, 1.5));
          float a = uOpacity * smoothstep(0.28, 0.72, f) * smoothstep(uInner, uInner + 5.0, r) * (1.0 - smoothstep(70.0, 140.0, r));
          gl_FragColor = vec4(uColor, a);
        }`,
    }));
  }
  const mistGeo = track(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2));
  const mist1 = new THREE.Mesh(mistGeo, makeMistMat(0.62, 7.0)); mist1.position.y = 0.9; mist1.renderOrder = 2; scene.add(mist1);
  const mist2 = new THREE.Mesh(mistGeo, makeMistMat(0.42, 9.0)); mist2.position.set(13, 2.1, 0); mist2.rotation.y = 0.6; mist2.renderOrder = 3; scene.add(mist2);

  // ---- a soft cloud bank around the mountain's base (camera-facing puffs; one draw call)
  const cloudTex = (() => {
    const size = 256; const c = document.createElement('canvas'); c.width = size; c.height = size / 2;
    const g = c.getContext('2d'); const r = mulberry32(404);
    for (let i = 0; i < 46; i++) {
      const t = r(); const x = size * (0.12 + 0.76 * t), y = size / 2 * (0.72 - 0.42 * Math.sin(Math.PI * t) * (0.55 + 0.45 * r()));
      const rad = size * (0.06 + 0.1 * Math.sin(Math.PI * t) * (0.5 + r() * 0.6));
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    // soft flat base
    const fade = g.createLinearGradient(0, size * 0.36, 0, size / 2);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, size, size / 2);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx;
  })();
  track(cloudTex);
  const CLOUDS = LOW ? 12 : 24;
  const cloudMat = track(new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, color: '#ffffff', opacity: 0.9 }));
  const clouds = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(1, 0.5)), cloudMat, CLOUDS);
  clouds.renderOrder = 6; clouds.frustumCulled = false; scene.add(clouds);
  const cloudData = [];
  { const r = mulberry32(505);
    // valley clouds behind and beside the mountain; never in the corridor between the camera and the trail
    for (let tries = 0; tries < 400 && cloudData.length < CLOUDS; tries++) {
      const x = (r() - 0.5) * 80, z = -34 + r() * 31;
      if (Math.hypot(x * 0.9, z) < 8.5) continue;
      const w = 6 + r() * 9;
      cloudData.push({ x, z, y: 0.5 + r() * 1.8 + Math.max(0, -z) * 0.02, w, h: w * (0.42 + r() * 0.18), sp: 0.04 + r() * 0.05, shade: 0.85 + r() * 0.25 });
    } }
  const cloudM = new THREE.Matrix4(), cloudS = new V3(), cloudP = new V3();

  // ---- trail stones: individual, uneven flagstones (InstancedMesh). Unlit + lit (gold emissive) + soft glow rings
  const STONES = 66;
  const stoneGeo = (() => {
    const g = new THREE.DodecahedronGeometry(1, 0); const p = g.attributes.position; const n = makeNoise(5);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + n(x * 1.7 + 3, z * 1.7 - y) * 0.16; p.setXYZ(i, x * k, Math.max(y, -0.35) * k, z * k); }
    const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals(); return track(ng);
  })();
  const stoneDarkMat = patchFog(new THREE.MeshStandardMaterial({ color: '#9a9ca3', roughness: 0.9, flatShading: true, map: grainTex }));
  const stoneLitMat = patchFog(new THREE.MeshStandardMaterial({ color: '#a07c50', emissive: '#FBC159', emissiveIntensity: 0.55, roughness: 0.6, flatShading: true }),
    { extra: (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#if defined(USE_INSTANCING_COLOR)\n totalEmissiveRadiance *= vColor;\n diffuseColor.rgb = mix(vec3(0.45, 0.46, 0.5), diffuseColor.rgb, clamp(vColor.r, 0.0, 1.0));\n#endif'); } });
  const stonesDark = new THREE.InstancedMesh(stoneGeo, stoneDarkMat, STONES);
  const stonesLit = new THREE.InstancedMesh(stoneGeo, stoneLitMat, STONES);
  stonesDark.receiveShadow = true; stonesLit.receiveShadow = true; stonesDark.castShadow = true;
  // glow ring: soft centre, brighter ring, feathered edge
  const ringTex = track(radialTexture([[0, 'rgba(255,255,255,0.35)'], [0.38, 'rgba(255,255,255,0.22)'], [0.62, 'rgba(255,255,255,0.55)'], [0.78, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]));
  const haloMat = track(new THREE.MeshBasicMaterial({ map: ringTex, color: '#FBC159', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const halos = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), haloMat, STONES);
  halos.renderOrder = 4;
  const stoneS = [], stoneM = [], haloBase = [];
  {
    const r = mulberry32(77); const P = new V3(), T = new V3(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3(), ahead = new V3();
    const s0 = 0.3, s1 = PATH_L - 0.55;
    for (let i = 0; i < STONES; i++) {
      const s = lerp(s0, s1, i / (STONES - 1)) + (r() - 0.5) * 0.06; stoneS.push(s);
      samplePath(s, P, T); samplePath(s + 0.25, ahead);
      const pitch = Math.atan2(ahead.y - P.y, Math.hypot(ahead.x - P.x, ahead.z - P.z)) * 0.85;
      const side = new V3(T.z, 0, -T.x);
      const lat = side.clone().multiplyScalar(((i % 2) ? 1 : -1) * (0.04 + r() * 0.06));
      e.set((r() - 0.5) * 0.12, Math.atan2(T.x, T.z) + (r() - 0.5) * 0.9, (r() - 0.5) * 0.12, 'YXZ'); q.setFromEuler(e);
      const pq = new THREE.Quaternion().setFromAxisAngle(side, -pitch); q.premultiply(pq);
      const kx = 0.14 + r() * 0.05, kz = 0.11 + r() * 0.05; sc.set(kx, 0.07 + r() * 0.04, kz);
      const at = P.clone().add(lat); at.y += 0.015;
      stoneM.push(new THREE.Matrix4().compose(at, q, sc));
      haloBase.push({ pos: at.clone().add(new V3(0, 0.05, 0)), q: pq.clone() });
    }
    for (let i = 0; i < STONES; i++) { stonesLit.setMatrixAt(i, stoneM[i]); stonesLit.setColorAt(i, new THREE.Color(1, 1, 1)); halos.setColorAt(i, new THREE.Color(0, 0, 0)); }
    for (let i = 0; i < STONES; i++) stonesDark.setMatrixAt(i, stoneM[STONES - 1 - i]); // reversed so `count` hides lit ones
  }
  stonesLit.count = 0; halos.count = 0;
  scene.add(stonesDark, stonesLit, halos);
  const litAt = new Float32Array(STONES).fill(-1);
  const haloMtx = new THREE.Matrix4(), haloScale = new V3();

  // ---- boulders (scenery, rest rocks, and foreground rocks for parallax)
  const boulderGeo = (() => { const g = new THREE.IcosahedronGeometry(1, 2); const p = g.attributes.position; const n = makeNoise(9), n2 = makeNoise(19);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      let k = 1 + n(x * 1.3 + 2, z * 1.3 + y) * 0.2 + n2(x * 3.1, y * 3.1 + z) * 0.06;
      // flatten into planes for a fractured, blocky rock read
      const fx = Math.round(x * 2.2) / 2.2, fz = Math.round(z * 2.2) / 2.2; k *= 1 - 0.05 * Math.hypot(x - fx, z - fz);
      p.setXYZ(i, x * k, Math.max(y * k * 0.72, -0.35), z * k); }
    const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals(); return track(ng); })();
  const boulderMat = patchFog(new THREE.MeshStandardMaterial({ color: '#80858f', roughness: 0.92, flatShading: true, map: grainTex, bumpMap: grainTex, bumpScale: 1.5 }));
  const rests = []; const boulderMs = []; const boulderCs = [];
  {
    const r = mulberry32(31); const P = new V3(), T = new V3();
    for (let i = 0; i < 17; i++) {
      const s = lerp(1.0, PATH_L - 2.0, i / 16) + (r() - 0.5) * 0.25;
      samplePath(s, P, T);
      const out = new V3(P.x, 0, P.z).normalize();
      const side = new V3(T.z, 0, -T.x); if (side.dot(out) < 0) side.negate();
      const bp = P.clone().addScaledVector(side, 0.7);
      const rad = 0.2 + r() * 0.07;
      const gy = heightAt(bp.x, bp.z);
      const top = Math.max(gy + rad * 0.5, P.y + 0.12);
      bp.y = top - rad * 0.72 * 0.95;
      boulderMs.push(new THREE.Matrix4().compose(bp, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, 0)), new V3(rad, rad, rad)));
      boulderCs.push(0.9 + r() * 0.2);
      rests.push({ s, seat: new V3(bp.x, top, bp.z) });
    }
    for (let i = 0; i < 34; i++) { // scattered scenery boulders and scree
      const a = r() * TAU, rr = 2.5 + r() * 10; const x = Math.sin(a) * rr, z = Math.cos(a) * rr + 1;
      if (nearestPath(x, z)[0] < 1.4) continue;
      const rad = (r() < 0.6 ? 0.08 + r() * 0.15 : 0.25 + r() * 0.4); const y = heightAt(x, z) + rad * 0.15;
      boulderMs.push(new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 0.5, r() * 6, r() * 0.4)), new V3(rad, rad * (0.8 + r() * 0.4), rad)));
      boulderCs.push(0.8 + r() * 0.3);
    }
    // foreground rocks near the trailhead (they slide out of frame as the camera climbs: parallax)
    [[-5.6, 12.6, 1.3], [-4.2, 13.6, 0.75], [4.6, 12.2, 1.1], [5.8, 11.2, 0.6], [3.4, 13.4, 0.5]].forEach(([x, z, rad]) => {
      const y = heightAt(x, z) + rad * 0.1;
      boulderMs.push(new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 0.3, r() * 6, r() * 0.3)), new V3(rad * 1.2, rad, rad)));
      boulderCs.push(0.62);
    });
  }
  const boulders = new THREE.InstancedMesh(boulderGeo, boulderMat, boulderMs.length);
  boulderMs.forEach((m, i) => { boulders.setMatrixAt(i, m); boulders.setColorAt(i, new THREE.Color().setScalar(boulderCs[i])); });
  boulders.castShadow = true; boulders.receiveShadow = true; scene.add(boulders);

  // ---- conifers (irregular tiers) and low alpine shrubs for scale and texture on the lower slopes
  const pineGeo = (() => {
    const r = mulberry32(8);
    const parts = [new THREE.CylinderGeometry(0.03, 0.05, 0.36, 5).translate(0, 0.18, 0)];
    [[0.44, 0.5, 0.36], [0.38, 0.48, 0.6], [0.31, 0.45, 0.83], [0.23, 0.42, 1.04], [0.14, 0.36, 1.24]].forEach(([rad, h, y]) => {
      const c = new THREE.ConeGeometry(rad, h, 7, 2, true); const p = c.attributes.position; const jn = makeNoise(17 + Math.round(y * 10));
      for (let i = 0; i < p.count; i++) { const k = 1 + jn(p.getX(i) * 9 + 0.5, p.getZ(i) * 9 + 0.5) * 0.22; if (p.getY(i) < h / 2 - 0.01) { p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, p.getY(i) - (k - 1) * 0.15); } }
      c.translate(0, y, 0); parts.push(c);
    });
    const g = mergeGeometries(parts.map((p) => { const q = p.toNonIndexed(); q.deleteAttribute('uv'); return q; })); parts.forEach((p) => p.dispose()); g.computeVertexNormals(); return track(g);
  })();
  const pineMat = patchFog(new THREE.MeshStandardMaterial({ color: '#2d3c38', roughness: 0.88, flatShading: true, side: THREE.DoubleSide }));
  const pineMs = [];
  { const r = mulberry32(41);
    for (let tries = 0; tries < 2400 && pineMs.length < (LOW ? 90 : 150); tries++) {
      const x = (r() - 0.5) * 38, z = -6 + r() * 28;
      const h = heightAt(x, z); if (h > 3.6 || h < 0.2) continue;
      const dx = heightAt(x + 0.3, z) - h, dz = heightAt(x, z + 0.3) - h; if (Math.hypot(dx, dz) / 0.3 > 1.15) continue;
      if (nearestPath(x, z)[0] < 0.95) continue;
      if (Math.abs(x + 1.5) < 2.6 && z > 6.0 && z < 10.5) continue; // keep the trailhead clear
      // clumps: favour spots near other trees
      if (pineMs.length > 10 && r() < 0.45) { let near = false; for (let q = 0; q < pineMs.length; q += 3) { const e = pineMs[q].elements; if ((e[12] - x) ** 2 + (e[14] - z) ** 2 < 2.2) { near = true; break; } } if (!near) continue; }
      const k = 0.55 + r() * 0.85;
      pineMs.push(new THREE.Matrix4().compose(new V3(x, h - 0.06, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.08, r() * 6, (r() - 0.5) * 0.06)), new V3(k, k * (0.85 + r() * 0.45), k)));
    }
    // foreground conifers framing the bottom corners at the start
    [[-6.6, 13.2, 1.9], [-5.0, 14.6, 1.5], [6.4, 12.8, 1.8], [7.4, 14.2, 1.4]].forEach(([x, z, k]) => {
      pineMs.push(new THREE.Matrix4().compose(new V3(x, heightAt(x, z) - 0.08, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, 0)), new V3(k, k * 1.15, k)));
    }); }
  const pines = new THREE.InstancedMesh(pineGeo, pineMat, pineMs.length);
  pineMs.forEach((m, i) => { pines.setMatrixAt(i, m); pines.setColorAt(i, new THREE.Color().setHSL(0.42 + (i % 3) * 0.02, 0.14, 0.62 + ((i * 7) % 5) * 0.07)); });
  pines.castShadow = true; pines.receiveShadow = true; scene.add(pines);

  const shrubGeo = (() => { const g = new THREE.IcosahedronGeometry(1, 1); const p = g.attributes.position; const n = makeNoise(77);
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 1 + n(x * 2 + 1, z * 2 + y) * 0.3; p.setXYZ(i, x * k, Math.max(y, -0.2) * 0.55 * k, z * k); }
    const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals(); return track(ng); })();
  const shrubMat = patchFog(new THREE.MeshStandardMaterial({ color: '#3d4a3e', roughness: 0.95, flatShading: true }));
  const shrubMs = [];
  { const r = mulberry32(55);
    for (let tries = 0; tries < 3000 && shrubMs.length < (LOW ? 60 : 140); tries++) {
      const a = r() * TAU, rr = 2 + Math.sqrt(r()) * 11; const x = Math.sin(a) * rr, z = Math.cos(a) * rr + 2;
      const h = heightAt(x, z); if (h > 4.6 || h < 0.25) continue;
      const d = nearestPath(x, z)[0]; if (d < 0.5 || d > 3.5 && r() < 0.6) continue; // hug the trail edges a little
      const k = 0.08 + r() * 0.12;
      shrubMs.push(new THREE.Matrix4().compose(new V3(x, h - 0.02, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, 0)), new V3(k * 1.3, k, k * 1.1)));
    } }
  const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, shrubMs.length);
  shrubMs.forEach((m, i) => { shrubs.setMatrixAt(i, m); shrubs.setColorAt(i, new THREE.Color().setHSL(0.25 + (i % 4) * 0.03, 0.18, 0.55 + (i % 5) * 0.08)); });
  shrubs.receiveShadow = true; scene.add(shrubs);

  // ---- base camp: a few lit tents and campfire glints at the foot of the mountain
  const camps = [[-4.3, 5.9], [-3.6, 6.4], [3.9, 6.6], [-8.6, 2.6], [8.4, 3.2], [1.8, 10.8]];
  const tentGeo = (() => {
    const parts = []; const r = mulberry32(61);
    camps.forEach(([x, z], i) => {
      if (i === 1) return; // second spot is the campfire of the first camp
      const t = new THREE.ConeGeometry(0.2, 0.26, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 1.5);
      t.rotateY(r() * 6); t.translate(x, heightAt(x, z) + 0.12, z); parts.push(t.toNonIndexed());
    });
    const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; })); parts.forEach((p) => p.dispose()); g.computeVertexNormals(); return track(g);
  })();
  const tentMat = patchFog(new THREE.MeshStandardMaterial({ color: '#5a4a3c', emissive: '#ff9f4f', emissiveIntensity: 0.32, roughness: 0.8, flatShading: true }));
  const tents = new THREE.Mesh(tentGeo, tentMat); scene.add(tents);

  // ---- lights
  const hemi = new THREE.HemisphereLight(0x6378a6, 0x14171d, 0.8); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.castShadow = !LOW; key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 75 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.035; key.shadow.radius = 4;
  key.target.position.set(0, 4, 2); scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0x41557c, 0.4); fill.position.set(-4, 6, 30); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x7f93c8, 0.7); rim.target.position.set(0, 4, 2); scene.add(rim, rim.target);
  const lantern = new THREE.PointLight(0xffc06a, 2.5, 5, 2); scene.add(lantern);
  const campLight = new THREE.PointLight(0xff9a4a, 3, 6, 2); campLight.position.set(-3.9, heightAt(-3.9, 6.2) + 0.5, 6.2); scene.add(campLight);

  // environment for a soft sheen on the climber and flag only
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // ---- the climber: hand-modelled from lathed and rounded parts, merged into one mesh per bone
  const climberMat = patchFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, envMap: envTex, envMapIntensity: 0.35 }));
  const goldMat = patchFog(new THREE.MeshStandardMaterial({ color: '#FBC159', roughness: 0.55, emissive: '#FBC159', emissiveIntensity: 0.22, side: THREE.DoubleSide, envMap: envTex, envMapIntensity: 0.4 }));
  const metalMat = patchFog(new THREE.MeshStandardMaterial({ color: '#a8adb4', roughness: 0.35, metalness: 0.7, envMap: envTex, envMapIntensity: 0.8 }));
  const CC = { jacket: '#d4cdc0', jacketShade: '#b3ab9e', trousers: '#2b2f36', pack: '#3c4a54', pack2: '#2f3a42', strap: '#22272c', roll: '#7d6855',
    beanie: '#d6a04a', beanieFold: '#c08a3b', skin: '#b4856a', glove: '#2b2e33', boot: '#4a3b30', sole: '#1c1d20', metal: '#9aa0a8', gaiter: '#38404a' };
  const Mx = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
  const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), seg);
  function piece(geo, color, m) {
    let g = geo.index ? geo.toNonIndexed() : geo; if (g !== geo) geo.dispose();
    ['uv', 'uv1', 'uv2'].forEach((a) => { if (g.attributes[a]) g.deleteAttribute(a); });
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const c = new THREE.Color(color); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  }
  const R = (() => {
    const root = new THREE.Group();
    const meshes = [];
    const bone = (parent, x = 0, y = 0, z = 0) => { const b = new THREE.Group(); b.position.set(x, y, z); parent.add(b); return b; };
    const skin = (b, parts) => { const g = mergeGeometries(parts); parts.forEach((p) => p.dispose()); const m = new THREE.Mesh(track(g), climberMat); m.castShadow = true; b.add(m); meshes.push(m); return m; };
    const hips = bone(root, 0, 0.5, 0);
    skin(hips, [
      piece(lathe([[0, -0.075], [0.07, -0.07], [0.097, -0.035], [0.104, 0.01], [0.1, 0.05], [0, 0.062]]), CC.trousers, Mx(0, 0, 0, 0, 0, 0, 1, 1, 0.82)),
      piece(new THREE.TorusGeometry(0.1, 0.012, 6, 22).rotateX(Math.PI / 2), CC.strap, Mx(0, 0.035, 0, 0, 0, 0, 1.02, 1, 0.84)),
    ]);
    const torso = bone(hips, 0, 0.035, 0);
    skin(torso, [
      // jacket body: waisted, broad at the shoulders
      piece(lathe([[0, -0.035], [0.112, -0.032], [0.122, -0.005], [0.119, 0.06], [0.115, 0.13], [0.126, 0.2], [0.139, 0.255], [0.136, 0.29], [0.108, 0.322], [0.062, 0.343], [0, 0.35]], 18), CC.jacket, Mx(0, 0, 0, 0, 0, 0, 1.12, 1, 0.8)),
      piece(new THREE.TorusGeometry(0.117, 0.013, 6, 24).rotateX(Math.PI / 2), CC.jacketShade, Mx(0, -0.025, 0, 0, 0, 0, 1.12, 1, 0.8)), // hem band
      piece(lathe([[0.058, 0.32], [0.062, 0.35], [0.056, 0.385], [0.05, 0.39]], 14), CC.jacketShade), // collar
      // hood, bunched behind the neck
      piece(new THREE.TorusGeometry(0.058, 0.03, 8, 16, Math.PI * 1.25), CC.jacketShade, Mx(0, 0.36, -0.03, Math.PI / 2 - 0.35, 0, Math.PI * 0.38)),
      piece(new THREE.SphereGeometry(1, 12, 8), CC.jacketShade, Mx(0, 0.335, -0.082, 0.3, 0, 0, 0.072, 0.045, 0.05)),
      // backpack: body, lid, front pocket, side bottles, sleeping roll with straps, shoulder straps, hip belt
      piece(new RoundedBoxGeometry(0.235, 0.3, 0.13, 3, 0.045), CC.pack, Mx(0, 0.19, -0.142)),
      piece(new RoundedBoxGeometry(0.228, 0.065, 0.152, 2, 0.026), CC.pack2, Mx(0, 0.345, -0.142, 0.1)),
      piece(new RoundedBoxGeometry(0.165, 0.12, 0.045, 2, 0.018), CC.pack2, Mx(0, 0.12, -0.215)),
      piece(new RoundedBoxGeometry(0.11, 0.012, 0.01, 1, 0.004), CC.strap, Mx(0, 0.165, -0.239)),
      piece(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10), CC.pack2, Mx(0.126, 0.1, -0.14)),
      piece(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10), CC.pack2, Mx(-0.126, 0.1, -0.14)),
      piece(new THREE.CylinderGeometry(0.05, 0.05, 0.27, 14), CC.roll, Mx(0, 0.405, -0.13, 0, 0, Math.PI / 2)),
      piece(new THREE.TorusGeometry(0.052, 0.006, 5, 16), CC.strap, Mx(0.075, 0.405, -0.13, 0, Math.PI / 2, 0)),
      piece(new THREE.TorusGeometry(0.052, 0.006, 5, 16), CC.strap, Mx(-0.075, 0.405, -0.13, 0, Math.PI / 2, 0)),
      piece(new THREE.TorusGeometry(0.08, 0.014, 6, 14, Math.PI), CC.strap, Mx(0.085, 0.262, -0.02, 0, Math.PI / 2, 0, 1, 1, 0.95)),
      piece(new THREE.TorusGeometry(0.08, 0.014, 6, 14, Math.PI), CC.strap, Mx(-0.085, 0.262, -0.02, 0, Math.PI / 2, 0, 1, 1, 0.95)),
      piece(new THREE.TorusGeometry(0.118, 0.016, 6, 24).rotateX(Math.PI / 2), CC.strap, Mx(0, 0.035, -0.008, 0, 0, 0, 1.14, 1, 0.86)),
    ]);
    const pack = bone(torso, 0, 0.2, -0.125);
    const flagAnchor = new THREE.Object3D(); flagAnchor.position.set(-0.122, -0.15, -0.01); flagAnchor.rotation.set(-0.12, 0, 0.12); pack.add(flagAnchor);
    const neck = bone(torso, 0, 0.355, 0);
    const head = bone(neck, 0, 0.02, 0);
    skin(head, [
      piece(new THREE.SphereGeometry(0.082, 18, 14), CC.skin, Mx(0, 0.072, 0.01, 0, 0, 0, 0.95, 1.05, 1)),
      piece(new THREE.SphereGeometry(0.09, 20, 10, 0, TAU, 0, Math.PI * 0.5), CC.beanie, Mx(0, 0.088, -0.004, 0, 0, 0, 1, 1.12, 1)),
      piece(new THREE.TorusGeometry(0.088, 0.022, 8, 26).rotateX(Math.PI / 2), CC.beanieFold, Mx(0, 0.088, -0.004, -0.06, 0, 0, 1, 1.25, 1)), // folded cuff
      piece(new THREE.TorusGeometry(0.092, 0.007, 6, 26).rotateX(Math.PI / 2), CC.beanie, Mx(0, 0.108, -0.004, -0.06)), // fold edge
      piece(new THREE.SphereGeometry(0.031, 12, 10), CC.beanie, Mx(0, 0.193, -0.012, 0, 0, 0, 1, 0.9, 1)), // pompom
    ]);
    const mkArm = (side) => {
      const sh = bone(torso, 0.148 * side, 0.29, 0);
      skin(sh, [piece(lathe([[0, -0.178], [0.039, -0.174], [0.042, -0.14], [0.046, -0.07], [0.051, -0.01], [0.04, 0.022], [0, 0.03]]), CC.jacket)]); // tapered sleeve
      const el = bone(sh, 0, -0.165, 0);
      skin(el, [
        piece(lathe([[0, -0.15], [0.036, -0.148], [0.041, -0.134], [0.038, -0.11], [0.04, -0.03], [0.04, 0.0], [0, 0.012]]), CC.jacket),
        piece(new THREE.TorusGeometry(0.037, 0.008, 6, 14).rotateX(Math.PI / 2), CC.jacketShade, Mx(0, -0.136, 0)),
      ]);
      const hand = bone(el, 0, -0.155, 0);
      const parts = [
        piece(lathe([[0.03, 0.005], [0.038, 0.02], [0.036, 0.032], [0, 0.034]], 12), CC.glove), // gauntlet cuff
        piece(new THREE.SphereGeometry(1, 12, 10), CC.glove, Mx(0, -0.02, 0.004, 0, 0, 0, 0.03, 0.044, 0.026)),
        piece(new THREE.CapsuleGeometry(0.011, 0.024, 3, 8), CC.glove, Mx(-0.02 * side, -0.008, 0.02, 0.7, 0, 0.3 * side)), // thumb
      ];
      if (side === 1) { // trekking pole in the left hand
        const pm = Mx(0, 0, 0, 0.28);
        parts.push(piece(new THREE.CylinderGeometry(0.008, 0.007, 0.6, 6), CC.metal, pm.clone().multiply(Mx(0, -0.27, 0))));
        parts.push(piece(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 8), CC.sole, pm.clone()));
        parts.push(piece(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 10), CC.sole, pm.clone().multiply(Mx(0, -0.52, 0))));
      }
      skin(hand, parts);
      return { sh, el, hand };
    };
    const mkLeg = (side) => {
      const hip = bone(hips, 0.066 * side, -0.02, 0);
      skin(hip, [piece(lathe([[0, -0.238], [0.05, -0.232], [0.056, -0.18], [0.064, -0.08], [0.066, 0.0], [0.05, 0.03], [0, 0.036]]), CC.trousers)]);
      const knee = bone(hip, 0, -0.225, 0);
      skin(knee, [
        piece(lathe([[0, -0.135], [0.047, -0.13], [0.052, -0.06], [0.051, 0.0], [0, 0.022]]), CC.trousers),
        piece(lathe([[0, -0.218], [0.049, -0.214], [0.053, -0.17], [0.05, -0.135], [0, -0.125]]), CC.gaiter),
      ]);
      const ankle = bone(knee, 0, -0.21, 0);
      skin(ankle, [
        piece(new RoundedBoxGeometry(0.084, 0.078, 0.125, 2, 0.03), CC.boot, Mx(0, -0.012, 0.012)),
        piece(new RoundedBoxGeometry(0.08, 0.05, 0.07, 2, 0.022), CC.boot, Mx(0, -0.03, 0.072)),
        piece(new THREE.TorusGeometry(0.043, 0.01, 6, 14).rotateX(Math.PI / 2), CC.boot, Mx(0, 0.026, 0.004)),
        piece(new RoundedBoxGeometry(0.094, 0.024, 0.178, 1, 0.009), CC.sole, Mx(0, -0.059, 0.026)),
      ]);
      return { hip, knee, ankle };
    };
    const armL = mkArm(1), armR = mkArm(-1), legL = mkLeg(1), legR = mkLeg(-1);
    return { root, hips, torso, neck, pack, flagAnchor, armL, armR, legL, legR, meshes };
  })();
  const CLIMBER_SCALE = 1.3;
  R.root.scale.setScalar(CLIMBER_SCALE);
  scene.add(R.root);
  function applyPose(P) {
    R.hips.position.y = 0.5 + P.hipY;
    R.hips.rotation.set(P.hipX, P.hipYaw, P.hipRoll);
    R.torso.rotation.set(P.torsoX, P.torsoY, P.torsoZ);
    R.neck.rotation.set(P.headX, P.headY, 0, 'YXZ');
    R.legL.hip.rotation.set(P.thL, 0, P.thLz); R.legL.knee.rotation.x = P.shL; R.legL.ankle.rotation.x = P.ftL;
    R.legR.hip.rotation.set(P.thR, 0, P.thRz); R.legR.knee.rotation.x = P.shR; R.legR.ankle.rotation.x = P.ftR;
    R.armL.sh.rotation.set(P.uaLx, 0, P.uaLz); R.armL.el.rotation.x = P.laL;
    R.armR.sh.rotation.set(P.uaRx, 0, P.uaRz); R.armR.el.rotation.x = P.laR;
  }
  // uphill walk with weight: hips drop on each footfall, torso leans into the slope and lags the stride a touch.
  // amp scales stride length so that slow real-time steps stay planted (no foot sliding).
  function walkPose(ph, amp, out) {
    const sL = Math.sin(ph), cL = Math.cos(ph), sR = -sL, cR = -cL;
    const land = Math.pow(Math.abs(Math.sin(ph)), 3); // 1 at each footfall
    out.hipY = -0.03 - 0.02 * land * (0.4 + 0.6 * amp) + 0.012 * Math.cos(2 * ph) * amp;
    out.hipX = 0.04; out.hipYaw = -0.1 * sL * amp; out.hipRoll = 0.045 * cL;
    out.torsoX = 0.3 + 0.03 * land; out.torsoY = 0.15 * Math.sin(ph - 0.25) * amp; out.torsoZ = -0.03 * cL;
    out.headX = -0.22 - 0.025 * land; out.headY = -0.05 * sL;
    const lift = 0.45 + 0.55 * amp; // knees still lift on tiny steps (steep ground)
    out.thL = (-0.52 * sL) * amp - 0.24; out.shL = 0.15 + 1.0 * lift * Math.pow(Math.max(0, cL), 1.4); out.ftL = -0.25 * Math.max(0, cL) * lift + 0.1 * Math.max(0, -sL) * amp; out.thLz = 0.03;
    out.thR = (-0.52 * sR) * amp - 0.24; out.shR = 0.15 + 1.0 * lift * Math.pow(Math.max(0, cR), 1.4); out.ftR = -0.25 * Math.max(0, cR) * lift + 0.1 * Math.max(0, -sR) * amp; out.thRz = -0.03;
    // left arm plants the pole with the right foot; right arm swings
    out.uaLx = 0.48 * sL * (0.4 + 0.6 * amp) - 0.25; out.uaLz = 0.14; out.laL = -0.55 - 0.25 * Math.max(0, -sL);
    out.uaRx = 0.42 * sR * (0.4 + 0.6 * amp) + 0.05; out.uaRz = -0.12; out.laR = -0.3 - 0.3 * Math.max(0, -sR);
    return out;
  }

  // soft contact shadow under the climber (grounds him even where the shadow map is soft)
  const blobTex = track(radialTexture([[0, 'rgba(0,0,0,0.55)'], [0.45, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0)']], 64));
  const blob = new THREE.Mesh(track(new THREE.PlaneGeometry(0.75, 0.75).rotateX(-Math.PI / 2)), track(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4 })));
  blob.renderOrder = 3; scene.add(blob);

  // ---- the summit flag (lives in world space; rides the backpack until planted)
  const flag = new THREE.Group(); scene.add(flag);
  const FLAG_H = 0.9, CLOTH_W = 0.44, CLOTH_H = 0.27;
  const flagPole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.011, 0.011, FLAG_H, 8).translate(0, FLAG_H / 2, 0)), metalMat); flagPole.castShadow = true; flag.add(flagPole);
  const finial = new THREE.Mesh(track(new THREE.SphereGeometry(0.022, 10, 8)), goldMat); finial.position.y = FLAG_H + 0.01; flag.add(finial);
  const clothGeo = track(new THREE.PlaneGeometry(CLOTH_W, CLOTH_H, 14, 6).translate(CLOTH_W / 2, -CLOTH_H / 2, 0));
  const clothBase = clothGeo.attributes.position.array.slice();
  const cloth = new THREE.Mesh(clothGeo, goldMat); cloth.position.set(0.008, FLAG_H - 0.02, 0); cloth.castShadow = true; flag.add(cloth);
  function updateCloth(t, amp) {
    const a = clothGeo.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = clothBase[i], y = clothBase[i + 1], u = x / CLOTH_W;
      a[i + 2] = (Math.sin(x * 11 - t * 4.2 + y * 3) * 0.045 + Math.sin(x * 23 - t * 7.3) * 0.012) * u * amp;
      a[i + 1] = y - 0.035 * u * u * (1.2 - amp * 0.6);
      a[i] = x - Math.abs(a[i + 2]) * 0.25;
    }
    clothGeo.attributes.position.needsUpdate = true; clothGeo.computeVertexNormals();
  }
  updateCloth(0, 0.3);

  // ---- particles: footstep puffs, summit glints, campfire embers
  function makeParticles(max, color, blending) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3), al = new Float32Array(max), sz = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: 800 } }, transparent: true, depthWrite: false, blending, fog: false,
      vertexShader: `attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
        void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / -mv.z; }`,
      fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(uColor, a * vA); }`,
    });
    const pts = new THREE.Points(track(g), track(mat)); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
    const items = Array.from({ length: max }, () => ({ life: 0, age: 1, p: new V3(), v: new V3(), s: 0, a: 0 }));
    return { pts, g, mat, items, pos, al, sz };
  }
  const PARTICLES = !reduceMotion;
  const puffs = makeParticles(LOW ? 20 : 48, '#d9d6d0', THREE.NormalBlending);
  const glints = makeParticles(LOW ? 6 : 14, '#ffd38a', THREE.AdditiveBlending);
  const embers = makeParticles(camps.length * 2, '#ffb066', THREE.AdditiveBlending);
  puffs.pts.visible = PARTICLES; glints.pts.visible = PARTICLES;
  let puffCursor = 0;
  function spawnPuff(at, snowy) {
    if (!PARTICLES) return;
    puffs.mat.uniforms.uColor.value.set(snowy ? '#eef0f4' : '#b9b1a6');
    for (let k = 0; k < (LOW ? 3 : 5); k++) {
      const it = puffs.items[puffCursor]; puffCursor = (puffCursor + 1) % puffs.items.length;
      it.p.copy(at).add(new V3((Math.random() - 0.5) * 0.06, 0.02, (Math.random() - 0.5) * 0.06));
      it.v.set((Math.random() - 0.5) * 0.35, 0.12 + Math.random() * 0.15, (Math.random() - 0.5) * 0.35);
      it.life = 0.7 + Math.random() * 0.5; it.age = 0; it.s = 0.05 + Math.random() * 0.04; it.a = snowy ? 0.5 : 0.35;
    }
  }
  glints.items.forEach((it, i) => { const r = mulberry32(900 + i); it.p.set((r() - 0.5) * 2.6, SUMMIT_H - 0.6 + r() * 1.5, -0.8 + (r() - 0.5) * 2); it.v.set(r() * TAU, 0.06 + r() * 0.08, r()); it.s = 0.025 + r() * 0.025; });
  camps.forEach(([x, z], i) => {
    const y = heightAt(x, z);
    const a = embers.items[i * 2], b = embers.items[i * 2 + 1];
    const fire = i === 1 || i === 3 || i === 5; // campfires beside some tents
    a.p.set(x + 0.28, y + 0.08, z + 0.1); a.s = fire ? 0.5 : 0.32; a.a = fire ? 0.95 : 0.55;
    b.p.set(x + 0.28, y + 0.11, z + 0.1); b.s = fire ? 0.16 : 0.0; b.a = fire ? 1 : 0;
  });

  // sunrise flare behind the peak
  const flareTex = track(radialTexture([[0, 'rgba(255,236,200,1)'], [0.1, 'rgba(255,200,130,0.5)'], [0.35, 'rgba(251,160,90,0.1)'], [1, 'rgba(251,150,80,0)']], 256));
  const flare = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: flareTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 })));
  flare.scale.setScalar(18); flare.renderOrder = -5; scene.add(flare);

  // ---- post (high only): MSAA HDR target -> soft bloom -> ACES + sRGB. Low renders straight to the canvas.
  let composer = null, bloom = null, rt = null;
  if (!LOW) {
    rt = new THREE.WebGLRenderTarget(390, 844, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(PR);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(390, 844), 0.36, 0.6, 0.9);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  }

  // ---------------------------------------------------------------- state
  let phase = 'idle', first = true, snapNext = true;
  // progress timeline: the climber walks from segFrom to segTo (distances along the trail) over segDur seconds
  let segFrom = 0, segTo = 0, segT0 = 0, segDur = 1, lastCallT = -1, callIv = 1;
  let dispS = 0, prevRoot = new V3(), gait = 0, walkW = 0, speedSm = 0, ampSm = 0.3;
  let yaw = Math.PI, sitAmt = 0, rest = null, standT = 0, lookSide = 1, lookAmt = 0;
  let doneT = -1, worldT = 0, doneGlow = 0;
  const plantPos = new V3(); const flagFromPos = new V3(), flagFromQ = new THREE.Quaternion();
  const pal = { keyDir: new V3() }; KEY_COLORS.forEach((n) => { pal[n] = new THREE.Color(); });
  const tmpP = new V3(), tmpT = new V3(), tmpV = new V3(), tmpQ = new THREE.Quaternion(); const tmpC = new THREE.Color();
  const curPose = pose(), wp = pose(), sp = pose(), dp = pose(), tmpPose = pose();
  let raf = 0, last = performance.now(), W = 390, Hh = 844, alive = true;
  const lay = { ...LAYOUT.portrait };
  // ?dtmax= lets slow headless capture advance animation time; normal use keeps a 50 ms cap
  const DT_MAX = parseFloat(new URLSearchParams(location.search).get('dtmax')) || 0.05;
  const nowS = () => performance.now() / 1000;
  const goalS = (t) => lerp(segFrom, segTo, clamp((t - segT0) / segDur, 0, 1));

  // ---- camera: a pure function of the climber's distance, the screen shape and the done timeline
  const fr = { C: new V3(), top: new V3(), M: new V3(), pos: new V3(), f: new V3(), r: new V3(), u: new V3() };
  const UP = new V3(0, 1, 0);
  function ndcY(X, camPos, look, tanH) {
    fr.f.copy(look).sub(camPos).normalize(); fr.r.crossVectors(fr.f, UP).normalize(); fr.u.crossVectors(fr.r, fr.f);
    tmpV.copy(X).sub(camPos); const vz = tmpV.dot(fr.f), vy = tmpV.dot(fr.u);
    return vy / (vz * tanH);
  }
  const SUMMIT = new V3(0, SUMMIT_H, 0);
  function placeCam(M, az, el, d, out) { out.set(M.x + Math.sin(az) * Math.cos(el) * d, M.y + Math.sin(el) * d, M.z + Math.cos(az) * Math.cos(el) * d); }
  // returns { pos, look, shift } where shift is the vertical lens shift in NDC
  const camA = { pos: new V3(), look: new V3(), shift: 0 }, camB = { pos: new V3(), look: new V3(), shift: 0 };
  function frameClimb(ss, out) {
    const tanH = Math.tan(THREE.MathUtils.degToRad(lay.fov) / 2);
    samplePath(ss * PATH_L, fr.C);
    const f = easeInOut(ss);
    fr.top.copy(SUMMIT).add(tmpP.set(0, lerp(0.25, 1.55, sstep(0.5, 1, ss)), 0));
    fr.M.set(lerp(fr.C.x, 0, 0.45), (fr.C.y + fr.top.y) / 2, lerp(fr.C.z, 0, 0.5));
    const az = lerp(0.07, 0.04, f), el = lerp(0.085, 0.045, f);
    const want = 2 * (lay.climbY - lay.peakY);
    const dMin = CLIMBER_H / (lay.maxClimber * 2 * tanH);
    let d = 22;
    for (let k = 0; k < 4; k++) {
      placeCam(fr.M, az, el, d, out.pos);
      const span = ndcY(fr.top, out.pos, fr.M, tanH) - ndcY(fr.C, out.pos, fr.M, tanH);
      d = clamp(d * span / want, dMin, 60);
    }
    placeCam(fr.M, az, el, d, out.pos); out.look.copy(fr.M);
    // lens shift so the summit top sits on peakY (keeps the clock's sky clear)
    out.shift = (1 - 2 * lay.peakY) - ndcY(fr.top, out.pos, fr.M, tanH);
  }
  function frameDone(out) {
    const tanH = Math.tan(THREE.MathUtils.degToRad(lay.fov) / 2);
    const d = CLIMBER_H / (lay.doneSize * 2 * tanH);
    fr.M.copy(SUMMIT).add(tmpP.set(0.05, 0.7, 0));
    placeCam(fr.M, 0.06, -0.01, d, out.pos); out.look.copy(fr.M);
    out.shift = (1 - 2 * lay.doneY) - ndcY(SUMMIT, out.pos, fr.M, tanH);
  }
  const camPos = new V3(), camLook = new V3(); let camShift = 0;
  function frameCamera(ss, t) {
    frameClimb(ss, camA);
    let k = 0;
    if (phase === 'done' && doneT >= 0) { frameDone(camB); k = reduceMotion ? 1 : easeInOut(clamp(doneT / 5, 0, 1)); }
    camPos.copy(camA.pos); camLook.copy(camA.look); camShift = camA.shift;
    if (k > 0) { camPos.lerp(camB.pos, k); camLook.lerp(camB.look, k); camShift = lerp(camA.shift, camB.shift, k); }
    if (!reduceMotion) { camPos.x += Math.sin(t * 0.071) * 0.35; camPos.y += Math.sin(t * 0.053 + 1.3) * 0.14; camLook.x += Math.sin(t * 0.047) * 0.08; }
  }

  function update(dt, realDt = dt) {
    const paused = phase === 'paused';
    if (!paused) worldT += dt;
    const t = nowS();

    // --- climber distance: follows the progress timeline (pure function of p once the walk segment completes)
    const goal = phase === 'done' ? PATH_L : goalS(t);
    if (snapNext) { dispS = goal; segFrom = segTo = goal; }
    else if (!paused) {
      if (goal < dispS - 0.02 || Math.abs(goal - dispS) > 1.6) dispS = goal; // reset or a big jump: no rubber-banding
      else dispS = Math.min(goal, dispS + Math.max(0, goal - dispS) * (1 - Math.exp(-14 * realDt)) + (goal > dispS ? 0.0004 : 0)); // real time, so slow devices never fall behind
    }
    const snapping = snapNext; snapNext = false;
    if (phase !== 'done') doneT = -1;
    frameCamera(dispS / PATH_L, worldT);

    // --- rest rock while paused (nearest rock at or just behind the climber)
    const pausedRest = paused && !reduceMotion;
    if (pausedRest && !rest) { let best = null, bd = 0.9; for (const r of rests) { const d = dispS - r.s; if (d > -0.15 && Math.abs(d) < bd) { bd = Math.abs(d); best = r; } } rest = best; }
    const sitTarget = pausedRest && rest ? 1 : 0;
    sitAmt = snapping ? sitTarget : damp(sitAmt, sitTarget, sitTarget ? 2.6 : 3.4, dt);
    if (!paused && sitAmt < 0.01) rest = null;

    // --- root position and heading (always turned away from the camera)
    samplePath(dispS, tmpP, tmpT);
    const trailPos = tmpP.clone();
    const awayYaw = Math.atan2(trailPos.x - camPos.x, trailPos.z - camPos.z);
    const pathYaw = Math.atan2(tmpT.x, tmpT.z);
    let wantYaw = angleLerp(pathYaw, awayYaw, 0.42);
    const lim = 0.95; const dd = angleDiff(awayYaw, wantYaw); if (Math.abs(dd) > lim) wantYaw = awayYaw + Math.sign(dd) * lim;
    if (phase === 'idle' || (phase === 'done' && dispS >= PATH_L - 0.01)) wantYaw = awayYaw;
    const root = R.root.position;
    let sitW = 0;
    if (rest && sitAmt > 0.001) {
      const m = easeInOut(clamp(sitAmt * 1.15, 0, 1));
      sitW = sstep(0.45, 1.0, sitAmt);
      const seatSide = Math.sign(rest.seat.x - trailPos.x) || 1;
      wantYaw = angleLerp(wantYaw, awayYaw - 0.7 * seatSide, sstep(0.25, 0.85, sitAmt));
      root.x = lerp(trailPos.x, rest.seat.x, m); root.z = lerp(trailPos.z, rest.seat.z, m);
      root.y = lerp(trailPos.y + 0.06, rest.seat.y, sitW);
    } else { root.copy(trailPos); root.y += 0.06; }
    yaw = snapping ? wantYaw : angleLerp(yaw, wantYaw, 1 - Math.exp(-5 * dt));
    R.root.rotation.y = yaw;

    // --- gait: cadence from real ground distance; slow sessions take small steady steps about once a second
    const moved = snapping ? 0 : Math.hypot(root.x - prevRoot.x, root.z - prevRoot.z) + Math.abs(root.y - prevRoot.y) * 0.5;
    prevRoot.copy(root);
    const speed = dt > 0 ? moved / dt : 0;
    if (!paused) speedSm = damp(speedSm, speed, 6, dt);
    const walking = (phase === 'building' || phase === 'done') && sitW < 0.5 && speedSm > 0.0015;
    if (!paused) walkW = snapping ? (walking ? 1 : 0) : damp(walkW, walking ? 1 : 0, walking ? 5 : 3, dt);
    const amp = clamp(speedSm / 0.5, 0.22, 1); ampSm = damp(ampSm, amp, 3, dt);
    const prevG = gait;
    if (!paused && walking) gait += Math.max((moved / 0.64) * TAU, Math.PI * dt * 1.0); // at least one step per second
    if (walkW > 0.4 && !paused) {
      const hit = (a) => Math.floor((prevG - a) / TAU) !== Math.floor((gait - a) / TAU);
      const snowy = root.y > 5.6;
      if (hit(Math.PI / 2)) { R.legL.ankle.getWorldPosition(tmpV); spawnPuff(tmpV.setY(root.y - 0.03), snowy); }
      if (hit(1.5 * Math.PI)) { R.legR.ankle.getWorldPosition(tmpV); spawnPuff(tmpV.setY(root.y - 0.03), snowy); }
    }

    // --- standing: breathe, and now and then look out at the view
    if (walkW < 0.1 && !paused && phase !== 'done') standT += dt; else if (!paused) standT = 0;
    const wantLook = standT > 1.6 && phase === 'building' ? 1 : 0;
    if (standT > 0 && standT < dt * 1.5) lookSide = -lookSide;
    if (!paused) lookAmt = damp(lookAmt, wantLook, 1.6, dt);
    const breathe = reduceMotion ? 0 : Math.sin(worldT * 1.7);
    Object.assign(sp, STAND);
    sp.torsoX += 0.012 * breathe; sp.uaLz += 0.01 * breathe; sp.uaRz -= 0.01 * breathe;
    if (phase === 'idle') sp.headX = -0.32; // gazing up at the summit
    sp.headY = 0.75 * lookSide * lookAmt; sp.headX += -0.1 * lookAmt; sp.torsoY = 0.18 * lookSide * lookAmt;
    walkPose(gait, ampSm, wp);
    mixPose(sp, wp, walkW, curPose);
    if (sitW > 0) { Object.assign(tmpPose, SIT); tmpPose.torsoX += 0.015 * breathe; mixPose(curPose, tmpPose, sitW, curPose); }

    // --- done: arrive, reach back, raise, plant, follow-through, look at the sunrise
    const arrived = phase === 'done' && dispS >= PATH_L - 0.01;
    if (arrived) {
      if (doneT < 0) {
        doneT = (snapping || reduceMotion) ? 10 : 0;
        const fwd = tmpV.set(Math.sin(awayYaw), 0, Math.cos(awayYaw));
        const right = new V3(-fwd.z, 0, fwd.x);
        plantPos.copy(root).addScaledVector(right, 0.38).addScaledVector(fwd, 0.08); plantPos.y = SUMMIT_H - 0.03;
      } else doneT += dt;
      let k = 0; while (k < PLANT.length - 2 && doneT > PLANT[k + 1][0]) k++;
      const [ta, pa] = PLANT[k], [tb, pb] = PLANT[k + 1];
      mixPose(pa, pb, PLANT_EASE[k](clamp((doneT - ta) / (tb - ta), 0, 1)), dp);
      if (doneT > 2.9) { dp.torsoX += 0.012 * breathe; dp.headY = 0.12 + (reduceMotion ? 0 : 0.12 * Math.sin(worldT * 0.25)); }
      mixPose(curPose, dp, sstep(0, 0.3, doneT), curPose);
    }
    applyPose(curPose);
    R.root.updateMatrixWorld(true);
    blob.position.set(root.x, (rest && sitW > 0.5 ? heightAt(root.x, root.z) : trailPos.y) + 0.035, root.z);
    blob.scale.setScalar(sitW > 0.5 ? 1.25 : 1);

    // --- flag
    const flagScaleStored = 0.62;
    if (!arrived || doneT < 0.6) {
      R.flagAnchor.getWorldPosition(flag.position); R.flagAnchor.getWorldQuaternion(flag.quaternion);
      flag.scale.setScalar(flagScaleStored); cloth.scale.set(0.07, 1, 1); updateCloth(worldT, 0.15);
      flagFromPos.copy(flag.position); flagFromQ.copy(flag.quaternion);
    } else if (doneT < 1.32) {
      R.armR.hand.getWorldPosition(tmpV);
      const heldPos = tmpV.clone().add(new V3(0, -0.42 * flag.scale.x, 0));
      const heldQ = tmpQ.setFromEuler(new THREE.Euler(0.05, -0.3, -0.06, 'YXZ'));
      const fb = clamp((doneT - 0.6) / 0.2, 0, 1);
      flag.position.copy(flagFromPos).lerp(heldPos, fb);
      flag.quaternion.copy(flagFromQ).slerp(heldQ, fb);
      flag.scale.setScalar(lerp(flagScaleStored, 1, sstep(0.6, 0.95, doneT)));
      if (doneT > 1.18) flag.position.lerp(plantPos, sstep(1.18, 1.32, doneT));
      cloth.scale.set(0.07, 1, 1); updateCloth(worldT, 0.15);
    } else {
      const tau = doneT - 1.32;
      flag.position.copy(plantPos); flag.scale.setScalar(1);
      const wob = reduceMotion ? 0 : 0.16 * Math.exp(-tau * 3.0) * Math.sin(tau * 13);
      flag.quaternion.setFromEuler(new THREE.Euler(wob * 0.4, -0.3, -wob, 'YXZ'));
      const u = Math.max(0, tau - 0.08);
      const unf = reduceMotion ? 1 : clamp(1 - Math.exp(-u * 3.2) * Math.cos(u * 5.5), 0, 1.06);
      cloth.scale.set(lerp(0.07, 1, unf), lerp(0.8, 1, Math.min(1, unf)), 1);
      updateCloth(reduceMotion ? 1.3 : worldT, lerp(0.2, 1, Math.min(1, unf)));
    }

    // --- stones: lit count is a pure function of the climber's distance; each lights slowly with a soft ring pulse
    let lit = 0;
    while (lit < STONES && stoneS[lit] <= dispS + 0.06) lit++;
    for (let i = 0; i < STONES; i++) {
      if (i < lit && litAt[i] < 0) litAt[i] = (snapping || first) ? -100 : worldT;
      if (i >= lit) litAt[i] = -1;
    }
    stonesLit.count = lit; halos.count = lit; stonesDark.count = STONES - lit;
    const c = tmpC;
    for (let i = 0; i < lit; i++) {
      const age = worldT - litAt[i];
      const on = sstep(0, 1.6, age); // slow warm-up
      const pulse = Math.exp(-Math.pow((age - 0.6) / 0.45, 2));
      stonesLit.setColorAt(i, c.setScalar(0.12 + 0.88 * on + 0.9 * pulse));
      const ringK = 0.42 + 0.22 * on + 0.35 * sstep(0.2, 1.8, age) * (1 - sstep(1.8, 3.0, age));
      const hb = haloBase[i]; haloScale.set(ringK, 1, ringK);
      haloMtx.compose(hb.pos, hb.q, haloScale); halos.setMatrixAt(i, haloMtx);
      halos.setColorAt(i, c.setScalar((0.32 * on + 0.75 * pulse) * pal.trail));
    }
    if (lit) { stonesLit.instanceColor.needsUpdate = true; halos.instanceColor.needsUpdate = true; halos.instanceMatrix.needsUpdate = true; }

    // --- light and sky follow the climber's progress
    const lightP = dispS / PATH_L;
    if (!paused) doneGlow = arrived ? (snapping || reduceMotion ? 1 : damp(doneGlow, sstep(1.2, 3.8, doneT), 1.5, dt)) : (phase === 'done' ? doneGlow : 0);
    samplePalette(lightP, pal);
    skyU.uTop.value.copy(pal.skyTop); skyU.uHor.value.copy(pal.skyHor); skyU.uLow.value.copy(pal.skyLow);
    skyU.uGlow.value = pal.glow * (0.45 + 0.3 * doneGlow); skyU.uWarmAmt.value = pal.warm * 0.42;
    skyU.uBand.value.set(lay.band, lay.bandW, 0.2 + 0.38 * sstep(0.4, 1, lightP) + 0.08 * doneGlow);
    scene.fog.color.copy(pal.fog); fogU.uHaze.value.copy(pal.haze);
    mistU.uColor.value.copy(pal.fog).lerp(pal.skyHor, 0.22).lerp(pal.haze, 0.2);
    hemi.color.copy(pal.hemiSky); hemi.groundColor.copy(pal.hemiGround); hemi.intensity = pal.hemiI;
    key.color.copy(pal.key); key.intensity = pal.keyI * (1 + 0.15 * doneGlow);
    key.position.copy(key.target.position).addScaledVector(pal.keyDir, 34);
    // camera-side fill: lifts the climber's back and the mountain's base out of pure silhouette at sunrise
    fill.color.copy(pal.fill); fill.intensity = pal.fillI * (1 + 0.5 * sstep(0.6, 1, lightP) + 0.9 * doneGlow);
    fill.position.copy(camPos).add(tmpV.set(-3, 4, 0));
    rim.color.copy(pal.rim); rim.intensity = pal.rimI;
    rim.position.set(-pal.keyDir.x * 8 - 6, 9, -34).add(rim.target.position);
    starMat.opacity = 0.55 * pal.stars;
    lantern.position.copy(root).add(tmpV.set(0, 1.5, 0)).addScaledVector(tmpT.set(camPos.x - root.x, 0, camPos.z - root.z).normalize(), 0.9);
    lantern.intensity = (1.4 * pal.trail + 0.9 * doneGlow) * (phase === 'idle' ? 0.35 : 1);
    tentMat.emissiveIntensity = 0.32 * lerp(1, 0.5, lightP);
    campLight.intensity = 2.6 * lerp(1, 0.4, lightP);
    if (bloom) { bloom.strength = lerp(0.36, 0.2, doneGlow); bloom.threshold = lerp(0.9, 1.0, doneGlow); }

    // --- camera (framed earlier in this frame)
    camera.position.copy(camPos); camera.lookAt(camLook);
    camera.updateProjectionMatrix();
    camera.projectionMatrix.elements[9] = -camShift;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    sky.position.copy(camera.position); stars.position.copy(camera.position);

    // sun: below the far ridges at the start, cresting beside the peak at the end (kept low, below the clock)
    const rise = easeInOut(lightP);
    const sunPoint = tmpP.set(-14, lerp(-25, 6.5, rise) + doneGlow * 3.0, -110);
    skyU.uSunDir.value.copy(sunPoint).sub(camera.position).normalize();
    flare.position.copy(sunPoint); flare.material.opacity = sstep(0.6, 1, lightP) * (0.12 + 0.2 * doneGlow);

    // --- cloud bank: faces the camera, drifts slowly (frozen when paused or with reduced motion)
    const cdr = reduceMotion ? 0 : worldT;
    for (let i = 0; i < CLOUDS; i++) {
      const cd = cloudData[i];
      let x = cd.x + cdr * cd.sp; x = ((x + 45) % 90 + 90) % 90 - 45;
      cloudP.set(x, cd.y, cd.z); cloudS.set(cd.w, cd.h * 2, 1);
      cloudM.compose(cloudP, camera.quaternion, cloudS); clouds.setMatrixAt(i, cloudM);
      const edge = 1 - 0.6 * sstep(36, 45, Math.abs(x)); // dimmer at the wrap (far off-screen)
      clouds.setColorAt(i, tmpC.copy(pal.fog).lerp(pal.skyHor, 0.5).lerp(pal.haze, 0.15).lerp(pal.key, 0.15).multiplyScalar(cd.shade * edge * lerp(1.0, 1.12, lightP)));
    }
    clouds.instanceMatrix.needsUpdate = true; clouds.instanceColor.needsUpdate = true;

    // --- particles (frozen while paused)
    if (PARTICLES) {
      let n = 0;
      for (const it of puffs.items) {
        if (it.age < it.life && !paused) { it.age += dt; it.p.addScaledVector(it.v, dt); it.v.multiplyScalar(Math.exp(-3 * dt)); }
        const live = it.age < it.life; const k = live ? it.age / it.life : 1;
        puffs.pos[n * 3] = it.p.x; puffs.pos[n * 3 + 1] = it.p.y; puffs.pos[n * 3 + 2] = it.p.z;
        puffs.al[n] = live ? it.a * Math.pow(1 - k, 1.6) * Math.min(1, k * 8) : 0; puffs.sz[n] = it.s * (1 + k * 1.8); n++;
      }
      puffs.g.attributes.position.needsUpdate = true; puffs.g.attributes.aAlpha.needsUpdate = true; puffs.g.attributes.aSize.needsUpdate = true;
      glints.items.forEach((it, i) => {
        const tt = worldT * it.v.y + it.v.x; const cyc = (tt * 1.2) % 2.6;
        glints.pos[i * 3] = it.p.x + Math.sin(tt * 1.3 + i) * 0.25; glints.pos[i * 3 + 1] = it.p.y + cyc; glints.pos[i * 3 + 2] = it.p.z;
        glints.al[i] = doneGlow * sstep(0, 0.6, cyc) * (1 - sstep(1.9, 2.6, cyc)) * (0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(worldT * 3 + i * 2.1), 3)); glints.sz[i] = it.s;
      });
      glints.g.attributes.position.needsUpdate = true; glints.g.attributes.aAlpha.needsUpdate = true; glints.g.attributes.aSize.needsUpdate = true;
    }
    const campK = lerp(1, 0.55, lightP);
    embers.items.forEach((it, i) => {
      embers.pos[i * 3] = it.p.x; embers.pos[i * 3 + 1] = it.p.y; embers.pos[i * 3 + 2] = it.p.z;
      const fl = reduceMotion ? 1 : 0.82 + 0.18 * Math.sin(worldT * 7.3 + i * 1.7) * Math.sin(worldT * 3.1 + i);
      embers.al[i] = it.a * fl * campK; embers.sz[i] = it.s;
    });
    embers.g.attributes.position.needsUpdate = true; embers.g.attributes.aAlpha.needsUpdate = true; embers.g.attributes.aSize.needsUpdate = true;
    if (!paused && !reduceMotion) mistU.uTime.value = worldT;

    first = false;
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const realDt = Math.max(0, (now - last) / 1000); last = now;
    const dt = Math.min(DT_MAX, realDt);
    update(dt, realDt);
    renderer.info.reset();
    if (warm) { if (composer) composer.render(dt); else renderer.render(scene, camera); }
  }

  let sizedAt = '';
  function resize(w, h) {
    // each resize reallocates the drawing buffers: skip calls that change nothing
    const key = Math.round(w) + 'x' + Math.round(h) + '@' + (window.devicePixelRatio || 1);
    if (key === sizedAt) return; sizedAt = key;
    W = w; Hh = h;
    renderer.setSize(w, h, false);
    if (composer) { composer.setSize(w, h); bloom.setSize(w * PR, h * PR); }
    const a = w / h; const k = sstep(0.8, 1.45, a);
    const P = LAYOUT.portrait, L = LAYOUT.landscape;
    Object.keys(P).forEach((n) => { lay[n] = lerp(P[n], L[n], k); });
    camera.fov = lay.fov; camera.aspect = a; camera.updateProjectionMatrix();
    skyU.uRes.value.set(w * PR, h * PR);
    const sc = (h * PR) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    puffs.mat.uniforms.uScale.value = sc; glints.mat.uniforms.uScale.value = sc; embers.mat.uniforms.uScale.value = sc;
  }
  resize(390, 844);
  // nothing is drawn until the shaders are compiled (the page shows its placeholder meanwhile)
  let warm = false;
  const ready = warmUp(renderer, scene, camera).then(() => { warm = true; });
  raf = requestAnimationFrame(frame);

  // debug hook for the test harness (draw calls / triangles)
  canvas.__summitInfo = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, pathLength: PATH_L, dispS, lit: stonesLit.count, quality: LOW ? 'low' : 'high' });

  return {
    setProgress(p, opts = {}) {
      p = clamp(+p || 0, 0, 1);
      const t = nowS();
      const toS = p * PATH_L;
      const cur = goalS(t);
      if (lastCallT >= 0) callIv = clamp(t - lastCallT, 0.05, 1.0);
      lastCallT = t;
      if (opts.instant || first || toS < cur - 0.02 || Math.abs(toS - cur) > 1.6) {
        segFrom = segTo = toS; segT0 = t; snapNext = true; dispS = toS;
      } else if (Math.abs(toS - segTo) > 1e-6) {
        // walk from where we are now to the new value, finishing just before the next expected call
        segFrom = cur; segTo = toS; segT0 = t; segDur = clamp(callIv * 0.95, 0.05, 0.95);
      }
    },
    setPhase(ph) {
      if (!['idle', 'building', 'paused', 'done'].includes(ph) || ph === phase) return;
      phase = ph;
      if (ph === 'done') { segFrom = segTo = PATH_L; if (PATH_L - dispS > 1.6) snapNext = true; }
    },
    resize,
    dispose() {
      alive = false; cancelAnimationFrame(raf);
      disposables.forEach((d) => d.dispose && d.dispose());
      envTex.dispose(); pmrem.dispose();
      if (composer) { composer.dispose(); rt.dispose(); }
      [stonesDark, stonesLit, halos, boulders, pines, shrubs, clouds].forEach((m) => m.dispose());
      renderer.dispose();
      delete canvas.__summitInfo;
    },
  };
}

export default {
  id: 'summit',
  title: 'The Summit',
  blurb: 'A small climber walks a switchback trail up a misty mountain as you focus, each stone lighting gold behind them, and plants a gold flag on the summit as the sun crests.',
  mount,
};
