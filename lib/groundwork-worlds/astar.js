// Copied from design-mockups/groundwork-3d/concept4.js by scripts/sync-groundwork-worlds.mjs.
// Edit the original there, then run: node scripts/sync-groundwork-worlds.mjs
/* eslint-disable */
// Groundwork focus timer: concept 4, "The Gold A*" (v3, outdoor dusk pass).
// A cast, polished gold A* rises from a pale limestone plinth on a small grassy hilltop terrace
// above a sea of evening mist, with low hazy mountain ranges and a soft dusk sky behind. The gold
// mirrors that same sky: its reflections come from a PMREM environment built from the scene's own
// dusk palette (warm sun side, cool sky side), so it reads as solid gold catching a sunset.
// Light moves from early dusk (p = 0) to a deep golden sunset (p = 1).
// The build line (a molten cross section) is a pure function of progress p; the A* is exactly
// complete at p = 1. A small craftsman polishes it, always seen from behind.
//
// mount(canvas, { reduceMotion, quality: 'high' | 'low' }) returns
//   { setProgress(p, { instant }), setPhase(phase), resize(w, h), dispose() }.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { toCreasedNormals, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

// ---------- pacing: draw at most `fps` frames a second (0 = every display frame), and none at all once the scene
// is at rest (paused or finished, after its settle time) or not shown. The last frame stays on the canvas, and
// frame(now, resumed) is told when it follows a stop, so the world can skip the gap instead of fast-forwarding.
// The settle time is counted in frames too (20 a second, the animation's own step cap), so a slow phone still
// plays the sit-down or the finish to the end before it rests. Same block in every world.
const PAUSE_REST = 6, DONE_REST = 24; // seconds of drawing after a pause or a finish, before the scene rests
function makePacer(fps, frame) {
  const gap = fps > 0 ? 1000 / fps - 4 : 0; // the slack keeps 60, 90 and 120 Hz screens on an even beat
  let raf = 0, last = -1e9, restAt = Infinity, need = 0, drawn = 0, shown = true, dead = false, resumed = true;
  const resting = (now) => now >= restAt && drawn >= need;
  const loop = (now) => {
    raf = 0;
    if (dead || !shown || resting(now)) { resumed = true; return; }
    raf = requestAnimationFrame(loop);
    if (now - last < gap) return;
    last = now; const r = resumed; resumed = false; drawn++; frame(now, r);
  };
  const run = () => { if (!raf && !dead && shown && !resting(performance.now())) raf = requestAnimationFrame(loop); };
  return {
    start: run,
    // draw on for `sec` seconds, then rest (null: no rest)
    restIn(sec) { restAt = sec == null ? Infinity : performance.now() + sec * 1000; need = sec == null ? 0 : sec * 20; drawn = 0; run(); },
    // something changed while resting (or about to): draw it and let it settle
    poke(sec = 1.5) { if (restAt !== Infinity) { restAt = Math.max(restAt, performance.now() + sec * 1000); need = Math.max(need, drawn + sec * 20); } run(); },
    show(v) { shown = !!v; run(); },
    stop() { dead = true; cancelAnimationFrame(raf); raf = 0; },
  };
}

// ---------------------------------------------------------------- constants
const DRUM_TOP = 0.38; // world y of the plinth top (letter base)
const DISC_R = 1.132; // radius of the polished top
const K = 0.8; // letter scale (A cap height is 1.8 * K)
const LX = -0.06; // letter x offset (balances the star)
const MAN = 0.64; // craftsman height in world units
const A_DEPTH = 0.22;
const A_BEVEL_T = 0.034;
const A_BEVEL_S = 0.026;
const STAR_DEPTH = 0.17;
const STAR_BEVEL_T = 0.028;
const STAR_BEVEL_S = 0.02;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
const wrapA = (d) => { while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const dampAngle = (a, b, k, dt) => a + wrapA(b - a) * (1 - Math.exp(-k * dt));

// ---------------------------------------------------------------- letterforms
// Refined geometric-sans "A": parallel stroke edges, narrow flat apex, slim low crossbar.
function aOutline() {
  const W = 1.0; // half width at baseline
  const H = 1.8;
  const sl = 0.85 / 1.8; // edge slope (dx per dy)
  const leg = 0.37; // horizontal leg width at the baseline (lighter stroke)
  const cb0 = 0.5; // crossbar bottom
  const cb1 = 0.71; // crossbar top
  const xi = (y) => -(W - leg) + sl * y; // inner edge of the left leg
  const top = W - sl * H; // half width of the flat apex
  const outer = [
    [-W, 0], [-(W - leg), 0], [xi(cb0), cb0], [-xi(cb0), cb0], [W - leg, 0], [W, 0], [top, H], [-top, H],
  ].map(([x, y]) => new THREE.Vector2(x * K, y * K));
  const ya = (W - leg) / sl; // counter apex
  const hole = [[xi(cb1), cb1], [-xi(cb1), cb1], [0, ya]].map(([x, y]) => new THREE.Vector2(x * K, y * K));
  return { outer, hole };
}

function starOutline(R, ratio, cx, cy) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? R * ratio : R;
    pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

function shapeFrom(outer, holes = []) {
  const s = new THREE.Shape(outer);
  for (const h of holes) s.holes.push(new THREE.Path(h));
  return s;
}

// cast-object bevel: small radius, enough segments for a crisp rolling highlight
function extrude(shape, depth, bt, bs, segs) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelOffset: -bs, bevelSegments: segs, steps: 1, curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  const c = toCreasedNormals(g, 0.5);
  g.dispose();
  return c;
}

// x-crossings of a polygon set at height y (even-odd rule)
function crossings(polys, y) {
  const xs = [];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
  }
  return xs.sort((p, q) => p - q);
}

// ---------------------------------------------------------------- procedural textures
function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// tileable value-noise fbm on a grid (period in cells)
function makeNoise(seed) {
  const rnd = seeded(seed);
  const N = 256;
  const tbl = new Float32Array(N * N);
  for (let i = 0; i < tbl.length; i++) tbl[i] = rnd();
  const at = (x, y, P) => tbl[((((y % P) + P) % P) % N) * N + ((((x % P) + P) % P) % N)];
  const vn = (x, y, P) => {
    const xi = Math.floor(x); const yi = Math.floor(y);
    let fx = x - xi; let fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi, P); const b = at(xi + 1, yi, P); const c = at(xi, yi + 1, P); const d = at(xi + 1, yi + 1, P);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  return (x, y, P, oct = 5) => {
    let s = 0; let amp = 0.5; let f = 1; let norm = 0;
    for (let o = 0; o < oct; o++) { s += amp * vn(x * f, y * f, P * f); norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
}

// pale warm limestone with soft clouding, faint veins and travertine pores; returns { map, rough }
function stoneTextures(size) {
  const fbm = makeNoise(11);
  const rnd = seeded(17);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const r = document.createElement('canvas'); r.width = r.height = size;
  const g = c.getContext('2d'); const gr = r.getContext('2d');
  const img = g.createImageData(size, size); const ir = gr.createImageData(size, size);
  const P = 8;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * P; const v = (y / size) * P;
      const n1 = fbm(u, v, P, 5);
      const n2 = fbm(u * 2 + 3.1, v * 2 + 7.7, P * 2, 4);
      const w = Math.abs(Math.sin((u * 0.9 + v * 0.45) * Math.PI + n1 * 8.0));
      const vein = Math.pow(1 - Math.min(1, w / 0.05), 2.0) * 0.45;
      const pit = rnd() < 0.01 ? 1 : 0;
      const base = 200 + (n2 - 0.5) * 34 + (n1 - 0.5) * 20 - vein * 30 - pit * 42;
      const i = (y * size + x) * 4;
      img.data[i] = base + 6; img.data[i + 1] = base; img.data[i + 2] = base - 12; img.data[i + 3] = 255;
      const rv = 175 + (n2 - 0.5) * 50 + pit * 60;
      ir.data[i] = ir.data[i + 1] = ir.data[i + 2] = rv; ir.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0); gr.putImageData(ir, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const rough = new THREE.CanvasTexture(r);
  for (const t of [map, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  return { map, rough };
}

// brushed-metal micro roughness: fine horizontal streaks plus faint handling smudges
function brushedTexture(size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const rnd = seeded(5);
  g.fillStyle = 'rgb(150,150,150)';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 5; i++) {
    const y = rnd() * size; const x = rnd() * size; const len = 20 + rnd() * size * 0.8;
    const v = rnd() < 0.5 ? 110 : 200;
    g.strokeStyle = `rgba(${v},${v},${v},${0.04 + rnd() * 0.1})`;
    g.lineWidth = 0.5 + rnd() * 1.1;
    for (const ox of [-size, 0, size]) { g.beginPath(); g.moveTo(x + ox, y); g.lineTo(x + ox + len, y); g.stroke(); }
  }
  for (let i = 0; i < 14; i++) {
    const x = rnd() * size; const y = rnd() * size; const rr = size * (0.06 + rnd() * 0.12);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, 'rgba(215,215,215,0.16)'); grd.addColorStop(1, 'rgba(215,215,215,0)');
    g.fillStyle = grd;
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) g.fillRect(x - rr + ox, y - rr + oy, rr * 2, rr * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// soft black blob for contact shadows (alpha in the red channel via alphaMap)
function blobTexture(size, inner = 0.0) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, size * 0.5 * inner, size / 2, size / 2, size / 2);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.45, '#9a9a9a'); grd.addColorStop(1, '#000000');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- dusk palette (a pure function of progress)
// p = 0: early dusk, cool and soft. p = 1: deep golden sunset. Sky, fog, lights and the gold's reflections share it.
const PAL_KEYS = ['zen', 'mid', 'hor', 'glow', 'mist', 'gnd', 'cool', 'sun', 'hemiS', 'hemiG', 'fog', 'r0', 'r1', 'r2'];
const PAL = [
  { p: 0.0, zen: '#090c14', mid: '#161b2a', hor: '#4d5470', glow: '#cfa184', mist: '#3a3f56', gnd: '#5b5236', cool: '#7d90c2', sun: '#ffd8ae', hemiS: '#7d8bae', hemiG: '#2a2620', fog: '#454a62',
    r0: '#323850', r1: '#40455e', r2: '#525469', sunI: 2.5, el: 0.36, az: 1.0, hemiI: 0.62 },
  { p: 0.55, zen: '#0a0c15', mid: '#1b1b2a', hor: '#76616f', glow: '#eaa273', mist: '#4a4352', gnd: '#64553a', cool: '#8590c2', sun: '#ffc888', hemiS: '#8c8ca8', hemiG: '#2e2720', fog: '#5a4f5e',
    r0: '#35344a', r1: '#45425a', r2: '#5b5266', sunI: 2.8, el: 0.27, az: 1.25, hemiI: 0.58 },
  { p: 1.0, zen: '#0b0c14', mid: '#201b26', hor: '#ae735a', glow: '#ffa65a', mist: '#5a4749', gnd: '#6a5536', cool: '#8a8cc0', sun: '#ffb062', hemiS: '#9a8ea6', hemiG: '#30261f', fog: '#6c5555',
    r0: '#3a3242', r1: '#4d4150', r2: '#67525d', sunI: 3.1, el: 0.2, az: 1.45, hemiI: 0.55 },
].map((k) => { const o = { ...k }; for (const n of PAL_KEYS) o[n] = new THREE.Color(k[n]); return o; });
function samplePal(t, out) {
  let i = 0; while (i < PAL.length - 2 && t > PAL[i + 1].p) i++;
  const a = PAL[i]; const b = PAL[i + 1];
  const u = smooth(0, 1, clamp((t - a.p) / (b.p - a.p), 0, 1));
  for (const n of PAL_KEYS) out[n].lerpColors(a[n], b[n], u);
  for (const n of ['sunI', 'el', 'az', 'hemiI']) out[n] = lerp(a[n], b[n], u);
  return out;
}

// sky dome seen by the camera: dark calm zenith (clock), dusk band at a virtual horizon behind the plinth,
// faint high cloud streaks, and a sea of mist below
const SKY_FRAG = `uniform vec3 uZen, uMid, uHor, uGlow, uMist, uSunD; uniform float uHv; uniform vec2 uRes; uniform vec3 uBand; varying vec3 vD;
  float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hh(i), hh(i + vec2(1.0, 0.0)), f.x), mix(hh(i + vec2(0.0, 1.0)), hh(i + vec2(1.0, 1.0)), f.x), f.y); }
  void main(){ vec3 d = normalize(vD); float h = d.y - uHv;
    vec2 hz = normalize(d.xz + 1e-5); vec2 sz = normalize(uSunD.xz + 1e-5); float w = 0.5 + 0.5 * dot(hz, sz);
    vec3 hor = mix(uHor, uGlow, 0.12 + 0.5 * w * w);
    vec3 c = mix(hor, uMid, smoothstep(0.0, 0.13, h));
    c = mix(c, uZen, smoothstep(0.08, 0.36, h));
    c += uGlow * 0.16 * exp(-abs(h - 0.012) * 16.0) * (0.35 + 0.65 * w);
    // thin streaks of high cloud catching the last light, low in the sky only
    float n = vn(vec2(hz.x * 9.0, hz.y * 9.0 + h * 70.0)) * 0.6 + vn(vec2(hz.x * 19.0 + 3.0, hz.y * 19.0 + h * 140.0)) * 0.4;
    float band = exp(-pow((h - 0.07) / 0.03, 2.0)) + 0.6 * exp(-pow((h - 0.13) / 0.025, 2.0));
    c = mix(c, mix(uMid, uGlow * 0.8, 0.25 + 0.5 * w), smoothstep(0.45, 0.9, n) * band * 0.22);
    // below the virtual horizon: a soft sea of mist
    float m2 = vn(vec2(hz.x * 4.0, hz.y * 4.0 + h * 22.0));
    vec3 mist = mix(mix(hor, uMist, 0.45), uMist * 0.8, smoothstep(0.0, -0.2, h)) * (0.94 + 0.12 * m2);
    c = mix(c, mist, smoothstep(0.006, -0.016, h));
    // calmer, darker band where the clock sits (fraction from the top of the screen)
    float fy = 1.0 - gl_FragCoord.y / uRes.y;
    c *= 1.0 - uBand.z * exp(-pow((fy - uBand.x) / uBand.y, 2.0));
    c += (hh(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// what the gold reflects (rendered into a PMREM): the same dusk, but around a true horizon, with the sun,
// a warm haze band just under the horizon, lit cloud strips on the sun side and a cool sky panel opposite
const ENV_FRAG = `uniform vec3 uZen, uMid, uHor, uGlow, uGnd, uCool, uSunC, uSunD; varying vec3 vD;
  void main(){ vec3 d = normalize(vD); float h = d.y;
    vec2 hz = normalize(d.xz + 1e-5); vec2 sz = normalize(uSunD.xz + 1e-5); float az = dot(hz, sz); float w = 0.5 + 0.5 * az;
    vec3 hor = mix(uHor, uGlow, 0.2 + 0.7 * w * w);
    vec3 c = mix(hor * 1.5, uMid * 1.6, smoothstep(0.0, 0.32, h));
    c = mix(c, uZen * 1.5 + uCool * 0.08, smoothstep(0.3, 0.85, h));
    vec3 g = mix(hor * 2.0 + uGlow * 0.45, uGnd, smoothstep(-0.005, -0.1, h));
    g = mix(g, uGnd * 0.28, smoothstep(-0.14, -0.34, h));
    c = mix(c, g, smoothstep(0.004, -0.004, h));
    float s = max(dot(d, normalize(uSunD)), 0.0);
    c += uSunC * (pow(s, 6.0) * 0.5 + pow(s, 48.0) * 2.4 + pow(s, 900.0) * 40.0);
    float strip = exp(-pow((h - 0.09) / 0.016, 2.0)) * smoothstep(0.15, 0.95, w) + 0.7 * exp(-pow((h - 0.19) / 0.012, 2.0)) * smoothstep(0.35, 1.0, w);
    c += uGlow * strip * 2.6;
    c += uCool * smoothstep(0.1, 0.9, -az) * exp(-pow((h - 0.28) / 0.2, 2.0)) * 0.9;
    gl_FragColor = vec4(c, 1.0); }`;

// world-space height mist: blends a material into the fog colour below a given height
function mistPatch(mat, key, y0, y1, local = false) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying float vMY;\n' + sh.vertexShader.replace('#include <fog_vertex>', `#include <fog_vertex>
      vMY = ${local ? 'transformed.y' : '(modelMatrix * vec4(transformed, 1.0)).y'};`);
    if (local) sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, diffuseColor.rgb * 0.8, 0.55);\n#include <opaque_fragment>'); // soft, hazy facets
    sh.fragmentShader = 'varying float vMY;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
      #ifdef USE_FOG
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, (1.0 - smoothstep(${y0.toFixed(3)}, ${y1.toFixed(3)}, vMY)) * 0.96);
      #endif`);
  };
  mat.customProgramCacheKey = () => 'astar-mist-' + key;
  return mat;
}

// ---------------------------------------------------------------- the hilltop terrace
const HILL_R = 3.7;
function makeHill(HIGH) {
  const fbm = makeNoise(41);
  const SEG = HIGH ? 112 : 64; const RINGS = HIGH ? 20 : 12;
  const edgeR = (a) => {
    const u = ((a / (Math.PI * 2)) % 1 + 1) % 1;
    return HILL_R * (1 + 0.16 * (fbm(u * 8, 0.5, 8, 3) - 0.5) + 0.03 * Math.sin(a * 3 + 1));
  };
  const bump = (x, z) => (fbm(x * 0.9 + 20, z * 0.9 + 20, 64, 3) - 0.5);
  const heightAt = (x, z) => {
    const r = Math.hypot(x, z); const a = Math.atan2(x, z);
    const t = r / edgeR(a);
    const crown = -0.34 * Math.pow(smooth(0.5, 1.0, t), 1.4) - 0.1 * smooth(0.9, 1.0, t);
    return crown + 0.09 * bump(x, z) * smooth(1.85, 2.4, r);
  };
  // grass top: smooth, gently domed, flat around the terrace
  const pos = []; const col = []; const idx = [];
  const cA = new THREE.Color('#77834b'); const cB = new THREE.Color('#5f6d3c'); const cC = new THREE.Color('#938b58'); const cD = new THREE.Color('#4b5833');
  const tc = new THREE.Color();
  for (let j = 0; j <= RINGS; j++) {
    const t = j / RINGS;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const r = t * edgeR(a); const x = Math.sin(a) * r; const z = Math.cos(a) * r;
      pos.push(x, heightAt(x, z), z);
      const n = fbm(x * 0.7 + 5, z * 0.7 + 5, 64, 3);
      tc.lerpColors(cB, cA, smooth(0.3, 0.7, n)).lerp(cC, smooth(0.6, 0.85, fbm(x * 0.4 + 9, z * 0.4, 64, 2)) * 0.6).lerp(cD, smooth(0.8, 1.0, t) * 0.7);
      col.push(tc.r, tc.g, tc.b);
    }
  }
  for (let j = 0; j < RINGS; j++) for (let i = 0; i < SEG; i++) {
    const a = j * SEG + i; const b = j * SEG + ((i + 1) % SEG); const c = a + SEG; const d = b + SEG;
    idx.push(a, c, b, b, c, d);
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  top.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  top.setIndex(idx);
  top.computeVertexNormals();
  // rocky flank falling away into the mist: faceted strata
  const rows = [[1.0, 0], [1.012, -0.13], [0.95, -0.5], [0.84, -1.0], [0.68, -1.6], [0.48, -2.2], [0.27, -2.75], [0.07, -3.2]];
  const fp = []; const fc = []; const fi = [];
  const strata = ['#3b3027', '#6c6256', '#5a5148', '#796d5f', '#5e554b', '#4a433c', '#3c3631', '#302b27'].map((h) => new THREE.Color(h));
  const rr = seeded(9);
  const FS = Math.round(SEG * 0.5);
  for (let j = 0; j < rows.length; j++) {
    const [rf, dy] = rows[j];
    for (let i = 0; i < FS; i++) {
      const a = (i / FS) * Math.PI * 2;
      const er = edgeR(a); const ex = Math.sin(a) * er; const ez = Math.cos(a) * er;
      const y0 = heightAt(ex * 0.999, ez * 0.999);
      const jit = j === 0 ? 0 : (rr() - 0.5);
      const r = er * rf * (1 + jit * 0.08);
      fp.push(Math.sin(a) * r, y0 + dy + (j === 0 ? 0 : (rr() - 0.5) * 0.14), Math.cos(a) * r);
      const sc = strata[j].clone().multiplyScalar(0.9 + rr() * 0.2);
      fc.push(sc.r, sc.g, sc.b);
    }
  }
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < FS; i++) {
    const a = j * FS + i; const b = j * FS + ((i + 1) % FS); const c = a + FS; const d = b + FS;
    fi.push(a, b, c, b, d, c);
  }
  const flank = new THREE.BufferGeometry();
  flank.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  flank.setAttribute('color', new THREE.Float32BufferAttribute(fc, 3));
  flank.setIndex(fi);
  const flankFlat = flank.toNonIndexed(); flank.dispose();
  flankFlat.computeVertexNormals();
  return { top, flank: flankFlat, heightAt, edgeR };
}

// a distant low-poly range: an arc of peaks around the origin (centre of the arc on +z, rotate to place)
function rangeGeometry(R, span, segs, hLo, hHi, seed) {
  const fbm = makeNoise(seed); const rnd = seeded(seed + 3);
  const d = R * 0.1;
  const rows = [];
  for (let i = 0; i <= segs; i++) {
    const a = -span / 2 + (span * i) / segs;
    const n = fbm((i / segs) * 7, 0.5, 64, 4);
    const peak = lerp(hLo, hHi, Math.pow(smooth(0.2, 0.85, n), 1.2)) * (i % 2 ? 0.72 + 0.2 * rnd() : 0.95 + 0.15 * rnd());
    rows.push([a, peak]);
  }
  const pos = [];
  const P = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
  for (let i = 0; i < segs; i++) {
    const [a0, h0] = rows[i]; const [a1, h1] = rows[i + 1];
    const am = (a0 + a1) / 2;
    const r0 = P(a0, R, h0); const r1 = P(a1, R, h1);
    const m0 = P(a0, R - d, h0 * 0.42); const m1 = P(a1, R - d, h1 * 0.42); const mm = P(am, R - d * 0.6, (h0 + h1) * 0.33);
    const b0 = P(a0, R - 2 * d, -hHi * 0.5); const b1 = P(a1, R - 2 * d, -hHi * 0.5);
    pos.push(...r0, ...m0, ...mm, ...r0, ...mm, ...r1, ...r1, ...mm, ...m1, ...m0, ...m1, ...mm, ...m0, ...b0, ...b1, ...m0, ...b1, ...m1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// one grass tuft: a few slim leaning blades
function tuftGeometry() {
  const parts = [];
  const rnd = seeded(13);
  for (let k = 0; k < 5; k++) {
    const h = 0.06 + rnd() * 0.06; const w = 0.012;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, (rnd() - 0.5) * 0.03, h, 0.012 + rnd() * 0.02], 3));
    g.rotateY((k / 5) * Math.PI * 2 + rnd());
    g.translate((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.04);
    parts.push(g);
  }
  const m = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  m.computeVertexNormals();
  // normals point up (soft, grass-like shading)
  const n = m.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
  n.needsUpdate = true;
  return m;
}

// ---------------------------------------------------------------- the craftsman (one skinned mesh)
const SKIN_COLORS = {
  shirt: 0xe4ddd0, shirtShade: 0xcfc6b7, apron: 0x664a33, strap: 0x523a28, trouser: 0x2c3036, boot: 0x1b1714,
  sole: 0x0d0b0a, skin: 0x9a6848, cap: 0x3a4148, hair: 0x15110f, cloth: 0xe0d6c3, belt: 0x2a1f17, brass: 0xc79a4a,
};

function taper(r0, r1, len, segs = 12, rings = 4) {
  const pts = [];
  for (let i = 0; i <= rings; i++) { const a = -Math.PI / 2 + (i / rings) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r1), -len + Math.sin(a) * r1)); }
  for (let i = 1; i <= rings; i++) { const a = (i / rings) * (Math.PI / 2); pts.push(new THREE.Vector2(Math.max(1e-4, Math.cos(a) * r0), Math.sin(a) * r0)); }
  return new THREE.LatheGeometry(pts, segs);
}
const lathe = (pts, segs = 20) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(1e-4, x), y)), segs);

function buildCraftsman() {
  const bones = {};
  const list = [];
  const bone = (name, parent, pos) => {
    const b = new THREE.Bone(); b.name = name; b.position.set(...pos);
    if (parent) parent.add(b);
    bones[name] = b; list.push(b); return b;
  };
  const hips = bone('hips', null, [0, 0.5, 0]);
  const torso = bone('torso', hips, [0, 0.03, 0]);
  const head = bone('head', torso, [0, 0.315, 0]);
  const skirt = bone('skirt', hips, [0, 0.03, 0.0]);
  for (const [s, n] of [[1, 'l'], [-1, 'r']]) {
    const sh = bone(n + 'Sh', torso, [0.118 * s, 0.268, -0.004]);
    const el = bone(n + 'El', sh, [0, -0.162, 0]);
    bone(n + 'Hand', el, [0, -0.148, 0]);
    const th = bone(n + 'Th', hips, [0.054 * s, -0.02, 0]);
    const kn = bone(n + 'Kn', th, [0, -0.215, 0]);
    bone(n + 'Ft', kn, [0, -0.222, 0]);
  }

  const parts = [];
  const e = new THREE.Euler(); const q = new THREE.Quaternion(); const m4 = new THREE.Matrix4();
  const add = (geo, color, b, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) => {
    e.set(...rot); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(...pos), q, new THREE.Vector3(...scl));
    geo.applyMatrix4(m4);
    parts.push({ geo, color: SKIN_COLORS[color] ?? color, b });
  };

  // pelvis, belt
  add(lathe([[0.001, -0.08], [0.07, -0.078], [0.09, -0.035], [0.092, 0.02], [0.086, 0.06], [0.001, 0.062]]), 'trouser', 'hips', [0, 0, 0], [0, 0, 0], [1, 1, 0.74]);
  add(new THREE.TorusGeometry(0.089, 0.009, 6, 30), 'belt', 'hips', [0, 0.05, 0], [Math.PI / 2, 0, 0], [1, 0.74, 1]);

  // torso: shirt with shoulder blades and a yoke seam
  add(lathe([[0.001, -0.03], [0.085, -0.03], [0.089, 0.05], [0.098, 0.14], [0.108, 0.215], [0.106, 0.262], [0.086, 0.298], [0.045, 0.32], [0.001, 0.326]], 24), 'shirt', 'torso', [0, 0, 0], [0, 0, 0], [1, 1, 0.66]);
  add(new THREE.SphereGeometry(0.045, 12, 8), 'shirt', 'torso', [0.045, 0.2, -0.042], [0, 0, 0], [1, 1.25, 0.5]); // shoulder blades
  add(new THREE.SphereGeometry(0.045, 12, 8), 'shirt', 'torso', [-0.045, 0.2, -0.042], [0, 0, 0], [1, 1.25, 0.5]);
  add(new THREE.CylinderGeometry(0.1, 0.104, 0.006, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76), 'shirtShade', 'torso', [0, 0.25, 0], [0, 0, 0], [1, 1, 0.67]); // yoke seam
  add(new THREE.TorusGeometry(0.036, 0.01, 6, 18), 'shirt', 'torso', [0, 0.312, 0.002], [Math.PI / 2 + 0.15, 0, 0]); // collar
  // apron bib (front) and crossed straps on the back
  add(new THREE.CylinderGeometry(0.106, 0.095, 0.2, 18, 1, true, -1.0, 2.0), 'apron', 'torso', [0, 0.1, 0.003], [0, 0, 0], [1, 1, 0.72]);
  for (const s of [1, -1]) {
    add(new THREE.BoxGeometry(0.017, 0.3, 0.006), 'strap', 'torso', [0, 0.152, -0.073], [0.12, 0, 0.43 * s]);
    add(new THREE.BoxGeometry(0.017, 0.07, 0.007), 'strap', 'torso', [0.05 * s, 0.29, 0.0], [0, 0, 0], [1, 1, 1]); // over the shoulders
    add(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 8), 'brass', 'torso', [0.062 * s, 0.03, -0.07], [Math.PI / 2, 0, 0]); // rivets
  }
  // waist tie with a bow and two tails at the back
  add(new THREE.TorusGeometry(0.092, 0.0075, 6, 30), 'strap', 'torso', [0, 0.004, 0], [Math.PI / 2, 0, 0], [1, 0.72, 1]);
  add(new THREE.SphereGeometry(0.022, 10, 8), 'strap', 'torso', [0.021, 0.008, -0.068], [0, 0, 0.5], [1.15, 0.6, 0.4]);
  add(new THREE.SphereGeometry(0.022, 10, 8), 'strap', 'torso', [-0.021, 0.008, -0.068], [0, 0, -0.5], [1.15, 0.6, 0.4]);
  add(new THREE.SphereGeometry(0.009, 8, 6), 'strap', 'torso', [0, 0.008, -0.07]);
  add(new THREE.BoxGeometry(0.012, 0.08, 0.004), 'strap', 'torso', [0.013, -0.036, -0.068], [0.08, 0, 0.16]);
  add(new THREE.BoxGeometry(0.012, 0.068, 0.004), 'strap', 'torso', [-0.015, -0.032, -0.068], [0.08, 0, -0.22]);

  // apron skirt with pleated folds
  {
    const g = new THREE.CylinderGeometry(0.097, 0.128, 0.29, 40, 5, true, -1.2, 2.4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
      const th = Math.atan2(x, z); const t = 0.5 - y / 0.29; // 0 top, 1 hem
      const r = Math.hypot(x, z) + (0.0025 + 0.008 * t) * Math.sin(th * 12 + t * 0.8) + 0.004 * t * Math.sin(th * 5.0 + 1.0);
      p.setXYZ(i, Math.sin(th) * r, y, Math.cos(th) * r);
    }
    g.computeVertexNormals();
    add(g, 'apron', 'skirt', [0, -0.145, 0.004], [0, 0, 0], [1, 1, 0.8]);
    add(new THREE.BoxGeometry(0.075, 0.05, 0.004), 'strap', 'skirt', [0, -0.11, 0.104], [0.08, 0, 0]); // pocket
  }

  // head: neck, skull, hair, ears, flat cap
  add(new THREE.CylinderGeometry(0.026, 0.031, 0.06, 12), 'skin', 'head', [0, 0.024, 0]);
  add(new THREE.SphereGeometry(0.062, 22, 16), 'skin', 'head', [0, 0.1, 0.006], [0, 0, 0], [0.93, 1.06, 1.0]);
  add(new THREE.SphereGeometry(0.066, 22, 14, Math.PI * 0.95, Math.PI * 1.1, 0.35, 1.7), 'hair', 'head', [0, 0.1, 0.0], [0, 0, 0], [0.96, 1.04, 1.02]);
  add(new THREE.SphereGeometry(0.03, 12, 8), 'hair', 'head', [0, 0.062, -0.03], [0.4, 0, 0], [1.25, 0.6, 0.8]); // nape
  add(new THREE.SphereGeometry(0.015, 8, 6), 'skin', 'head', [0.059, 0.094, 0.004], [0, 0, 0], [0.42, 1, 0.7]);
  add(new THREE.SphereGeometry(0.015, 8, 6), 'skin', 'head', [-0.059, 0.094, 0.004], [0, 0, 0], [0.42, 1, 0.7]);
  add(new THREE.SphereGeometry(0.073, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), 'cap', 'head', [0, 0.127, 0.01], [-0.14, 0, 0], [1.03, 0.52, 1.12]);
  add(new THREE.CylinderGeometry(0.069, 0.068, 0.024, 24), 'cap', 'head', [0, 0.127, 0.004], [-0.12, 0, 0]);
  add(new THREE.CylinderGeometry(0.062, 0.062, 0.006, 18, 1, false, -0.95, 1.9), 'cap', 'head', [0, 0.117, 0.04], [-0.06, 0, 0], [1, 1, 1.3]);
  add(new THREE.SphereGeometry(0.008, 8, 6), 'cap', 'head', [0, 0.168, 0.02]); // button

  // arms: tapered sleeve, double-rolled cuff, bare forearm, hand
  for (const n of ['l', 'r']) {
    add(taper(0.036, 0.03, 0.135, 14), 'shirt', n + 'Sh', [0, 0, 0], [0, 0, 0], [1, 1, 0.9]);
    add(new THREE.TorusGeometry(0.03, 0.011, 8, 16), 'shirt', n + 'Sh', [0, -0.13, 0], [Math.PI / 2, 0, 0]);
    add(new THREE.TorusGeometry(0.028, 0.01, 8, 16), 'shirtShade', n + 'Sh', [0, -0.146, 0], [Math.PI / 2, 0, 0]);
    add(taper(0.025, 0.017, 0.132, 12), 'skin', n + 'El', [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
    // hand: palm, curled fingers, thumb
    add(new THREE.SphereGeometry(0.024, 12, 8), 'skin', n + 'Hand', [0, -0.016, 0.002], [0, 0, 0], [0.82, 1.15, 0.5]);
    add(taper(0.016, 0.012, 0.028, 10, 3), 'skin', n + 'Hand', [0, -0.03, 0.006], [0.45, 0, 0], [1.1, 1, 0.6]);
    add(taper(0.007, 0.006, 0.024, 8, 2), 'skin', n + 'Hand', [n === 'l' ? -0.016 : 0.016, -0.01, 0.01], [0.5, 0, n === 'l' ? -0.5 : 0.5]);
  }
  // polishing cloth: a wad in the right hand plus a draped, rippled tail
  {
    const wad = new THREE.IcosahedronGeometry(0.03, 2);
    const p = wad.attributes.position; const rnd = seeded(3);
    for (let i = 0; i < p.count; i++) { const f = 0.85 + rnd() * 0.3; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.75, p.getZ(i) * f * 1.15); }
    wad.computeVertexNormals();
    add(wad, 'cloth', 'rHand', [0, -0.036, 0.016]);
    const tail = new THREE.PlaneGeometry(0.07, 0.11, 6, 10);
    const tp = tail.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i); const y = tp.getY(i); const t = 0.5 - y / 0.11;
      tp.setXYZ(i, x * (1 - 0.25 * t), y - 0.055, 0.008 * Math.sin(x * 120 + t * 3) * t + 0.02 * t * t);
    }
    tail.computeVertexNormals();
    add(tail, 'cloth', 'rHand', [0.006, -0.045, 0.01], [0.12, 0.3, 0.12]);
  }

  // legs: tapered trousers, turned-up cuffs, boots with soles
  for (const n of ['l', 'r']) {
    add(taper(0.047, 0.038, 0.205, 14), 'trouser', n + 'Th', [0, 0, 0], [0, 0, 0], [1, 1, 0.92]);
    add(taper(0.038, 0.031, 0.205, 14), 'trouser', n + 'Kn', [0, 0, 0], [0, 0, 0], [1, 1, 0.92]);
    add(new THREE.TorusGeometry(0.032, 0.008, 6, 16), 'trouser', n + 'Kn', [0, -0.198, 0], [Math.PI / 2, 0, 0]);
    const boot = taper(0.031, 0.029, 0.06, 12, 3);
    add(boot, 'boot', n + 'Ft', [0, -0.016, 0.052], [Math.PI / 2, 0, 0], [0.95, 1, 0.72]);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 12), 'boot', n + 'Ft', [0, -0.004, 0.0]); // ankle shaft
    add(new THREE.BoxGeometry(0.058, 0.01, 0.125), 'sole', n + 'Ft', [0, -0.042, 0.035]);
  }

  // bind-pose merge into a single skinned mesh
  const root = new THREE.Group();
  root.add(hips);
  root.updateMatrixWorld(true);
  const col = new THREE.Color();
  const geos = parts.map(({ geo, color, b }) => {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(bones[b].matrixWorld);
    const n = g.attributes.position.count;
    col.setHex(color);
    const cArr = new Float32Array(n * 3); const si = new Uint16Array(n * 4); const sw = new Float32Array(n * 4);
    const bi = list.indexOf(bones[b]);
    for (let i = 0; i < n; i++) { cArr[i * 3] = col.r; cArr[i * 3 + 1] = col.g; cArr[i * 3 + 2] = col.b; si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('color', new THREE.BufferAttribute(cArr, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.55 });
  const mesh = new THREE.SkinnedMesh(merged, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  mesh.bind(new THREE.Skeleton(list), mesh.matrixWorld);
  root.scale.setScalar(MAN);
  const B = (n) => bones[n];
  return {
    root, mesh, geo: merged, mat, hips, torso, head, skirt,
    L: { sh: B('lSh'), el: B('lEl'), hand: B('lHand') }, R: { sh: B('rSh'), el: B('rEl'), hand: B('rHand') },
    LL: { th: B('lTh'), kn: B('lKn'), ft: B('lFt') }, RL: { th: B('rTh'), kn: B('rKn'), ft: B('rFt') },
  };
}

// pose channels; right-side y/z are mirrored when applied
const POSE_KEYS = ['hipY', 'hipX', 'hipZ', 'hipRx', 'hipRy', 'hipRz', 'toRx', 'toRy', 'toRz', 'hdRx', 'hdRy', 'hdRz',
  'lShx', 'lShy', 'lShz', 'lElx', 'lElz', 'rShx', 'rShy', 'rShz', 'rElx', 'rElz',
  'lThx', 'lThz', 'lKnx', 'lFtx', 'rThx', 'rThz', 'rKnx', 'rFtx', 'skirt'];
const STIFF = { hip: 9, to: 6.5, hd: 4.2, Sh: 8, El: 8, Th: 13, Kn: 13, Ft: 13, skirt: 5 };
const stiffOf = (k) => {
  if (k.startsWith('hd')) return STIFF.hd;
  if (k.startsWith('to')) return STIFF.to;
  if (k.startsWith('hip')) return STIFF.hip;
  if (k === 'skirt') return STIFF.skirt;
  for (const s of ['Sh', 'El', 'Th', 'Kn', 'Ft']) if (k.includes(s)) return STIFF[s];
  return 8;
};
const basePose = () => ({
  hipY: 0.5, hipX: 0, hipZ: 0, hipRx: 0, hipRy: 0, hipRz: 0, toRx: 0.02, toRy: 0, toRz: 0, hdRx: 0, hdRy: 0, hdRz: 0,
  lShx: 0.02, lShy: 0, lShz: 0.08, lElx: -0.16, lElz: 0, rShx: 0.02, rShy: 0, rShz: 0.08, rElx: -0.16, rElz: 0,
  lThx: 0, lThz: 0.03, lKnx: 0.03, lFtx: 0, rThx: 0, rThz: 0.03, rKnx: 0.03, rFtx: 0, skirt: 0,
});

// ---------------------------------------------------------------- module
export default {
  id: 'astar',
  title: 'The Gold A*',
  blurb: 'A polished gold A* rises from a limestone plinth on a quiet hilltop at dusk while a small craftsman polishes it; the build line tracks your session to the second.',
  mount(canvas, { reduceMotion = false, quality = 'high', fps = 0, maxDpr = 0 } = {}) {
    const HIGH = quality !== 'low';
    const disposables = [];
    const track = (o) => { disposables.push(o); return o; };

    // ---------- renderer and post
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: !HIGH, powerPreference: 'high-performance' });
    const pr = Math.min(window.devicePixelRatio || 1, maxDpr > 0 ? maxDpr : HIGH ? 2 : 1.25);
    renderer.setPixelRatio(pr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = HIGH;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.info.autoReset = false;

    let W = canvas.clientWidth || 390;
    let H = canvas.clientHeight || 844;
    const scene = new THREE.Scene();
    const pal = samplePal(0, { ...PAL[0], ...Object.fromEntries(PAL_KEYS.map((n) => [n, new THREE.Color()])) });
    scene.fog = new THREE.FogExp2(0x30364a, 0.0135);
    const camera = new THREE.PerspectiveCamera(24, W / H, 0.1, 400);

    let composer = null; let bloom = null; let rt = null;
    if (HIGH) {
      rt = new THREE.WebGLRenderTarget(W * pr, H * pr, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.32, 0.42, 0.92); // highlights only
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      // tiny dither after tone mapping: no banding in the dusk gradients
      composer.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          void main(){ vec4 c = texture2D(tDiffuse, vUv); c.rgb += (h(gl_FragCoord.xy) + h(gl_FragCoord.yx + 7.1) - 1.0) / 255.0; gl_FragColor = c; }`,
      }));
    }

    // ---------- sky dome (follows the camera) and the reflection environment built from the same palette
    const sunDir = new THREE.Vector3(1, 0.3, 0.3).normalize();
    const skyU = {
      uZen: { value: pal.zen }, uMid: { value: pal.mid }, uHor: { value: pal.hor }, uGlow: { value: pal.glow }, uMist: { value: pal.mist },
      uSunD: { value: sunDir }, uHv: { value: -0.12 }, uRes: { value: new THREE.Vector2(W * pr, H * pr) }, uBand: { value: new THREE.Vector3(0.28, 0.14, 0.3) },
    };
    const skyVert = 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
    const sky = new THREE.Mesh(track(new THREE.SphereGeometry(300, 48, 24)), track(new THREE.ShaderMaterial({
      uniforms: skyU, vertexShader: skyVert, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    })));
    sky.renderOrder = -10; sky.frustumCulled = false;
    scene.add(sky);

    const envU = {
      uZen: { value: pal.zen }, uMid: { value: pal.mid }, uHor: { value: pal.hor }, uGlow: { value: pal.glow }, uGnd: { value: pal.gnd },
      uCool: { value: pal.cool }, uSunC: { value: new THREE.Color() }, uSunD: { value: sunDir },
    };
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(track(new THREE.SphereGeometry(10, 64, 32)), track(new THREE.ShaderMaterial({
      uniforms: envU, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: ENV_FRAG,
    }))));
    const pmrem = new THREE.PMREMGenerator(renderer);
    let envRT = null; let envT = -1; let envAt = -99;
    const refreshEnv = (t, now, force = false) => {
      if (!force && Math.abs(t - envT) < 0.012) return;
      if (!force && now - envAt < (HIGH ? 1.2 : 5)) return;
      const next = pmrem.fromScene(envScene, 0, 0.1, 100);
      scene.environment = next.texture;
      if (envRT) envRT.dispose();
      envRT = next; envT = t; envAt = now;
    };

    // ---------- distant low-poly ranges in haze (placed on the virtual horizon in frame())
    const RANGES = [
      { R: 34, span: 2.7, segs: 44, lo: 0.6, hi: 2.8, seed: 61, key: 'r0' },
      { R: 56, span: 2.5, segs: 40, lo: 1.2, hi: 5.0, seed: 67, key: 'r1' },
      { R: 88, span: 2.3, segs: 34, lo: 2.5, hi: 9.5, seed: 73, key: 'r2' },
    ].map((L, i) => {
      const mat = track(mistPatch(new THREE.MeshStandardMaterial({ color: pal[L.key], flatShading: true, roughness: 1, metalness: 0, envMapIntensity: 0.25, side: THREE.DoubleSide }), 'rng' + i, -L.hi * 0.25, L.hi * 0.4, true));
      const mesh = new THREE.Mesh(track(rangeGeometry(L.R, L.span, L.segs, L.lo, L.hi, L.seed)), mat);
      mesh.renderOrder = -5 + i;
      scene.add(mesh);
      return { ...L, mesh, mat };
    });

    // ---------- the hilltop: smooth grass crown over a faceted rocky flank that dissolves into mist
    const hill = makeHill(HIGH);
    const grassMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.3 }));
    const hillTop = new THREE.Mesh(track(hill.top), grassMat);
    hillTop.receiveShadow = true;
    scene.add(hillTop);
    const flankMat = track(mistPatch(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.3 }), 'flank', -3.0, -0.6));
    const flank = new THREE.Mesh(track(hill.flank), flankMat);
    flank.receiveShadow = true;
    scene.add(flank);

    // contact shadow under the plinth (ambient-occlusion feel), both tiers
    const blob = track(blobTexture(128));
    const aoMat = track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.7, alphaMap: blob, depthWrite: false, fog: false }));
    const plinthAO = new THREE.Mesh(track(new THREE.PlaneGeometry(4.2, 4.2)), aoMat);
    plinthAO.rotation.x = -Math.PI / 2;
    plinthAO.position.y = 0.045;
    plinthAO.renderOrder = 1;
    scene.add(plinthAO);

    // ---------- stone: limestone plinth on a ring of paving slabs, stepping stones through the grass
    const stoneTex = stoneTextures(HIGH ? 512 : 256);
    track(stoneTex.map); track(stoneTex.rough);
    const sideMap = stoneTex.map.clone(); sideMap.repeat.set(3, 0.35); sideMap.needsUpdate = true; track(sideMap);
    const sideRough = stoneTex.rough.clone(); sideRough.repeat.set(3, 0.35); sideRough.needsUpdate = true; track(sideRough);
    const stone = track(new THREE.MeshStandardMaterial({ color: 0xe3d9c8, map: sideMap, roughness: 0.82, roughnessMap: sideRough, metalness: 0, envMapIntensity: 0.55 }));
    const prof = [
      [1.3, 0], [1.326, 0.006], [1.336, 0.018], [1.336, 0.074], [1.324, 0.088], [1.31, 0.092],
      [1.15, 0.092], [1.15, 0.098], [1.132, 0.103], [1.132, 0.113], [1.15, 0.118],
      [1.15, 0.36], [DISC_R + 0.004, 0.378], [DISC_R, DRUM_TOP],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const plGeo0 = new THREE.LatheGeometry(prof, HIGH ? 160 : 96);
    const plinth = new THREE.Mesh(track(toCreasedNormals(plGeo0, 0.45)), stone);
    plGeo0.dispose();
    plinth.rotation.y = Math.PI; // seam to the back
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const slabMat = track(new THREE.MeshStandardMaterial({ color: 0xbcb2a3, map: stoneTex.map, roughness: 0.88, roughnessMap: stoneTex.rough, metalness: 0, envMapIntensity: 0.45 }));
    {
      const parts = []; const NSL = 18; const r0 = 1.37; const r1 = 1.8; const gap = 0.012;
      for (let k = 0; k < NSL; k++) {
        const a0 = (k / NSL) * Math.PI * 2 + gap; const a1 = ((k + 1) / NSL) * Math.PI * 2 - gap;
        const s = new THREE.Shape();
        const rOut = r1 - (k % 3 === 1 ? 0.06 : 0) + (k % 4 === 2 ? 0.05 : 0);
        s.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
        s.absarc(0, 0, rOut, a0, a1, false);
        s.absarc(0, 0, r0, a1, a0, true);
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 6 });
        g.rotateX(-Math.PI / 2);
        g.translate(0, -0.012 + (k % 5) * 0.002, 0);
        parts.push(g.index ? (() => { const n = g.toNonIndexed(); g.dispose(); return n; })() : g);
      }
      const rs = seeded(21);
      for (const [x, z, r] of [[0.42, 2.1, 0.15], [0.62, 2.52, 0.135], [0.5, 2.95, 0.125]]) {
        const g = new THREE.CylinderGeometry(r, r * 1.04, 0.035, 7, 1);
        g.scale(1.15, 1, 0.85);
        g.rotateY(rs() * 3);
        g.translate(x, hill.heightAt(x, z) + 0.008, z);
        parts.push(g.index ? (() => { const n = g.toNonIndexed(); g.dispose(); return n; })() : g);
      }
      const slabs = new THREE.Mesh(track(mergeGeometries(parts, false)), slabMat);
      for (const p of parts) p.dispose();
      slabs.receiveShadow = true;
      slabs.castShadow = HIGH;
      scene.add(slabs);
    }

    // honed limestone top: a soft real reflection on 'high', plain honed stone on 'low'
    const topMat = track(new THREE.MeshPhysicalMaterial({
      color: 0xe8dfcf, map: stoneTex.map, roughness: 0.42, roughnessMap: stoneTex.rough, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.16, envMapIntensity: 0.6,
    }));
    const discGeo = track(new THREE.CircleGeometry(DISC_R, 96));
    let disc; let reflector = null;
    const reflU = { uReflTex: { value: null }, uTexMat: { value: new THREE.Matrix4() }, uReflAmt: { value: 1 }, uBlur: { value: new THREE.Vector2(0.002, 0.002) } };
    if (HIGH) {
      reflector = new Reflector(discGeo, { textureWidth: Math.round(W * pr * 0.5), textureHeight: Math.round(H * pr * 0.5), clipBias: 0.002, multisample: 0 });
      reflU.uReflTex.value = reflector.getRenderTarget().texture;
      reflU.uTexMat.value = reflector.material.uniforms.textureMatrix.value;
      reflector.material.dispose();
      reflector.material = topMat;
      topMat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, reflU);
        sh.vertexShader = 'uniform mat4 uTexMat; varying vec4 vRefl;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvRefl = uTexMat * vec4(transformed, 1.0);');
        sh.fragmentShader = 'uniform sampler2D uReflTex; uniform float uReflAmt; uniform vec2 uBlur; varying vec4 vRefl;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
          vec2 ruv = vRefl.xy / vRefl.w;
          vec3 rc = vec3(0.0);
          for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) rc += texture2D(uReflTex, ruv + vec2(float(i), float(j)) * uBlur).rgb;
          rc /= 9.0;
          float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
          float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, rc, clamp(mix(0.05, 0.6, fres) * uReflAmt, 0.0, 1.0));`);
      };
      topMat.customProgramCacheKey = () => 'astar-top-refl';
      disc = reflector;
    } else {
      disc = new THREE.Mesh(discGeo, topMat);
    }
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = DRUM_TOP;
    disc.receiveShadow = true;
    scene.add(disc);

    // light lines that wake up at 'done'
    const ringMat = track(new THREE.MeshBasicMaterial({ color: 0xffc86e, transparent: true, opacity: 0, depthWrite: false }));
    const edgeRing = new THREE.Mesh(track(new THREE.TorusGeometry(DISC_R + 0.006, 0.0035, 6, 180)), ringMat);
    edgeRing.rotation.x = Math.PI / 2;
    edgeRing.position.y = DRUM_TOP - 0.003;
    scene.add(edgeRing);
    const grooveMat = track(new THREE.MeshBasicMaterial({ color: 0xffc86e, transparent: true, opacity: 0, depthWrite: false }));
    const groove = new THREE.Mesh(track(new THREE.TorusGeometry(1.135, 0.005, 6, 180)), grooveMat);
    groove.rotation.x = Math.PI / 2;
    groove.position.y = 0.108;
    scene.add(groove);

    // ---------- the A*
    const A = aOutline();
    const starR = 0.3 * K;
    const starC = new THREE.Vector2(0.76 * K, 1.8 * K - starR * 0.62);
    const starPts = starOutline(starR, 0.45, starC.x, starC.y);
    const aGeo = track(extrude(shapeFrom(A.outer, [A.hole]), A_DEPTH, A_BEVEL_T, A_BEVEL_S, 4));
    const sGeo = track(extrude(shapeFrom(starPts), STAR_DEPTH, STAR_BEVEL_T, STAR_BEVEL_S, 4));
    const letterTop = Math.max(1.8 * K, starC.y + starR);
    const buildMin = DRUM_TOP;
    const buildMax = DRUM_TOP + letterTop + 0.002; // fully complete exactly at p = 1
    const cutAt = (p) => lerp(buildMin, buildMax, clamp(p, 0, 1));

    const clipBelow = new THREE.Plane(new THREE.Vector3(0, -1, 0), buildMin);
    const clipAbove = new THREE.Plane(new THREE.Vector3(0, 1, 0), -buildMin);
    const fx = { uCut: { value: buildMin }, uHeat: { value: 0 }, uSweep: { value: -10 }, uSweepAmt: { value: 0 } };
    const brushed = track(brushedTexture(256));
    brushed.repeat.set(1.6, 1.6);
    // polished solid gold: warm saturated base, metalness 1, brushed micro roughness under a crisp clear coat
    const goldOpts = {
      color: 0xf9c255, metalness: 1, roughness: 0.3, roughnessMap: brushed, envMapIntensity: 2.0, clippingPlanes: [clipBelow], clipShadows: true,
    };
    const gold = track(HIGH
      ? new THREE.MeshPhysicalMaterial({ ...goldOpts, clearcoat: 1, clearcoatRoughness: 0.05 })
      : new THREE.MeshStandardMaterial(goldOpts));
    gold.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fx);
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uCut, uHeat, uSweep, uSweepAmt;\nvarying vec3 vWP;\n' + sh.fragmentShader
        // a cast face is never perfectly flat: a gentle roll in the big faces sweeps the reflection through
        // ground, horizon haze and sky, giving clear light and dark bands (the clear coat stays flat and crisp)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 nW = inverseTransformDirection(normal, viewMatrix);
          float face = smoothstep(0.55, 0.85, abs(nW.z));
          float b = 0.26 * sin(vWP.y * 5.6 - vWP.x * 1.9 + 0.2) + 0.08 * sin(vWP.y * 12.5 + vWP.x * 2.6 + 1.3);
          nW.y += (b + 0.06) * face;
          nW.x += 0.06 * sin(vWP.x * 4.4 + vWP.y * 1.7) * face;
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        float below = uCut - vWP.y;
        float heat = uHeat * exp(-max(below, 0.0) * 34.0);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.6 + vec3(1.0, 0.42, 0.1) * 2.6, clamp(heat, 0.0, 1.0) * 0.85);
        float sd = dot(vWP, normalize(vec3(0.62, 1.0, 0.0))) + 0.2 * normal.y - 0.1 * normal.x - uSweep;
        float band = exp(-sd * sd * 30.0) + 0.3 * exp(-sd * sd * 4.0);
        gl_FragColor.rgb += vec3(1.0, 0.86, 0.62) * band * uSweepAmt;`);
    };
    gold.customProgramCacheKey = () => (HIGH ? 'astar-gold-h' : 'astar-gold-l');
    // the molten cross-section: interior faces seen through the cut, hottest at the cut
    const hotU = { uCut: fx.uCut, uHot: { value: 1 }, uT: { value: 0 } };
    const hot = track(new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, clippingPlanes: [clipBelow], polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    hot.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, hotU);
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uCut, uHot, uT;\nvarying vec3 vWP;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
        float dd = max(uCut - vWP.y, 0.0);
        float sh1 = 0.5 + 0.25 * sin(vWP.x * 61.0 + uT * 1.7) * sin(vWP.z * 47.0 - uT * 1.3) + 0.25 * sin(vWP.x * 23.0 - vWP.z * 31.0 + uT * 0.9);
        vec3 hc = mix(vec3(1.1, 0.3, 0.04), vec3(2.6, 1.05, 0.22), exp(-dd * 14.0)) * (0.75 + 0.5 * sh1);
        hc += vec3(1.7, 0.95, 0.4) * exp(-dd * 220.0);
        outgoingLight = hc * uHot;
        #include <opaque_fragment>`);
    };
    hot.customProgramCacheKey = () => 'astar-hot';

    const letter = new THREE.Group();
    letter.position.set(LX, DRUM_TOP, 0);
    scene.add(letter);
    const aMesh = new THREE.Mesh(aGeo, gold);
    const sMesh = new THREE.Mesh(sGeo, gold);
    aMesh.castShadow = sMesh.castShadow = true;
    aMesh.receiveShadow = sMesh.receiveShadow = true;
    letter.add(aMesh, sMesh);
    const aHot = new THREE.Mesh(aGeo, hot);
    const sHot = new THREE.Mesh(sGeo, hot);
    letter.add(aHot, sHot);

    // contact shadow where the legs meet the stone
    const footTex = (() => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128);
      const sx = (x) => (x / 2.4 + 0.5) * 256; const sz = (z) => (z / 1.2 + 0.5) * 128;
      const zA0 = A_DEPTH / 2 + A_BEVEL_T;
      for (const [blur, a, grow] of [[14, 0.5, 0.06], [4, 0.85, 0.0]]) {
        g.filter = `blur(${blur}px)`;
        g.fillStyle = `rgba(255,255,255,${a})`;
        for (const s of [-1, 1]) {
          const x0 = s < 0 ? -1.0 * K : (1.0 - 0.37) * K; const x1 = s < 0 ? -(1.0 - 0.37) * K : 1.0 * K;
          g.fillRect(sx(x0 - grow), sz(-zA0 - grow), sx(x1 + grow) - sx(x0 - grow), sz(zA0 + grow) - sz(-zA0 - grow));
        }
      }
      return new THREE.CanvasTexture(c);
    })();
    track(footTex);
    const footMat = track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8, alphaMap: footTex, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    const foot = new THREE.Mesh(track(new THREE.PlaneGeometry(2.4, 1.2)), footMat);
    foot.rotation.x = -Math.PI / 2;
    foot.position.set(LX, DRUM_TOP + 0.0015, 0);
    foot.renderOrder = 2;
    scene.add(foot);

    // ghost outline of the unbuilt part (one merged line set and one fill)
    const ghostMat = track(new THREE.LineBasicMaterial({ color: 0xf3cf8a, transparent: true, opacity: 0.1, depthWrite: false, clippingPlanes: [clipAbove] }));
    const ghostFillMat = track(new THREE.MeshBasicMaterial({ color: 0xf3cf8a, transparent: true, opacity: 0.02, depthWrite: false, clippingPlanes: [clipAbove] }));
    {
      const gs = [];
      for (const [shape, d] of [[shapeFrom(A.outer, [A.hole]), A_DEPTH + 2 * A_BEVEL_T], [shapeFrom(starPts), STAR_DEPTH + 2 * STAR_BEVEL_T]]) {
        const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
        g.translate(0, 0, -d / 2);
        g.deleteAttribute('uv');
        gs.push(g.index ? g.toNonIndexed() : g);
      }
      const merged = mergeGeometries(gs, false);
      const edges = track(new THREE.EdgesGeometry(merged, 25));
      letter.add(new THREE.LineSegments(edges, ghostMat));
      letter.add(new THREE.Mesh(track(merged), ghostFillMat));
    }

    // ---------- build line: glow hugging each slice of the letter at the cut (one draw call)
    const polysA = [A.outer, A.hole];
    const polysS = [starPts];
    const zA = A_DEPTH / 2 + A_BEVEL_T;
    const zS = STAR_DEPTH / 2 + STAR_BEVEL_T;
    const intervalsAt = (yW) => {
      const yl = yW - DRUM_TOP; const out = [];
      const a = crossings(polysA, yl); for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i] + LX, a[i + 1] + LX, zA]);
      const s = crossings(polysS, yl); for (let i = 0; i + 1 < s.length; i += 2) out.push([s[i] + LX, s[i + 1] + LX, zS]);
      return out;
    };
    const GS = 4; // interval slots
    const glowGeo = track(new THREE.BufferGeometry());
    const gPos = new Float32Array(GS * 2 * 4 * 3);
    const gP = new Float32Array(GS * 2 * 4 * 2);
    const gHalf = new Float32Array(GS * 2 * 4 * 2);
    const gKind = new Float32Array(GS * 2 * 4);
    const gIdx = [];
    for (let q = 0; q < GS * 2; q++) { const b = q * 4; gIdx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); gKind.fill(q % 2, q * 4, q * 4 + 4); }
    glowGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3));
    glowGeo.setAttribute('aP', new THREE.BufferAttribute(gP, 2));
    glowGeo.setAttribute('aHalf', new THREE.BufferAttribute(gHalf, 2));
    glowGeo.setAttribute('aKind', new THREE.BufferAttribute(gKind, 1));
    glowGeo.setIndex(gIdx);
    const glowMat = track(new THREE.ShaderMaterial({
      uniforms: { uInt: { value: 0 }, uCol: { value: new THREE.Color(1.0, 0.62, 0.27) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: `attribute vec2 aP; attribute vec2 aHalf; attribute float aKind; varying vec2 vP; varying vec2 vHalf; varying float vKind;
        void main(){ vP = aP; vHalf = aHalf; vKind = aKind; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uInt; uniform vec3 uCol; varying vec2 vP; varying vec2 vHalf; varying float vKind;
        void main(){ vec2 d = max(abs(vP) - vHalf, 0.0); float dd2 = dot(d, d); float a;
          if (vKind < 0.5) { a = exp(-dd2 * 9000.0) * 1.25 + exp(-dd2 * 700.0) * 0.35; }
          else { float inside = 1.0 - step(1e-6, dd2); a = (exp(-dd2 * 420.0) * 0.45 + exp(-dd2 * 110.0) * 0.12) * mix(1.0, 0.15, inside); }
          gl_FragColor = vec4(uCol * a * uInt, 1.0); }`,
    }));
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.frustumCulled = false;
    glow.renderOrder = 5;
    scene.add(glow);
    const setQuad = (q, corners, ps, half, ) => {
      for (let k = 0; k < 4; k++) {
        gPos.set(corners[k], (q * 4 + k) * 3);
        gP.set(ps[k], (q * 4 + k) * 2);
        gHalf.set(half, (q * 4 + k) * 2);
      }
    };
    let glowSpan = [0, 0]; // x-extent of the current slice (for the melt light)
    const updateGlow = (yW) => {
      const iv = intervalsAt(yW);
      gPos.fill(0); gP.fill(0); gHalf.fill(0);
      let mn = Infinity; let mx = -Infinity;
      for (let s = 0; s < Math.min(GS, iv.length); s++) {
        const [x0, x1, zH] = iv[s];
        const cx = (x0 + x1) / 2; const hx = (x1 - x0) / 2;
        mn = Math.min(mn, x0); mx = Math.max(mx, x1);
        const m = 0.04; const hy = 0.05; const zf = zH + 0.004;
        setQuad(s * 2, [[cx - hx - m, yW - hy, zf], [cx + hx + m, yW - hy, zf], [cx - hx - m, yW + hy, zf], [cx + hx + m, yW + hy, zf]],
          [[-hx - m, -hy], [hx + m, -hy], [-hx - m, hy], [hx + m, hy]], [hx, 0]);
        const ms = 0.26; const zz = zH + ms; const y = yW + 0.003;
        setQuad(s * 2 + 1, [[cx - hx - ms, y, -zz], [cx + hx + ms, y, -zz], [cx - hx - ms, y, zz], [cx + hx + ms, y, zz]],
          [[-hx - ms, -zz], [hx + ms, -zz], [-hx - ms, zz], [hx + ms, zz]], [hx, zH]);
      }
      if (iv.length) glowSpan = [mn, mx];
      glowGeo.attributes.position.needsUpdate = true;
      glowGeo.attributes.aP.needsUpdate = true;
      glowGeo.attributes.aHalf.needsUpdate = true;
      return iv;
    };

    // ---------- sparks: velocity-aligned streaks with real gravity, drag, bounce and cooling
    const NS = HIGH ? 96 : 40;
    const sp = { pos: new Float32Array(NS * 3), vel: new Float32Array(NS * 3), life: new Float32Array(NS), max: new Float32Array(NS) };
    const sparkGeo = track(new THREE.BufferGeometry());
    const sPos = new Float32Array(NS * 4 * 3); const sVel = new Float32Array(NS * 4 * 3); const sLife = new Float32Array(NS * 4); const sCorner = new Float32Array(NS * 4 * 2);
    const sIdx = [];
    for (let i = 0; i < NS; i++) {
      const b = i * 4;
      sCorner.set([-1, 0, 1, 0, -1, 1, 1, 1], b * 2);
      sIdx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    }
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    sparkGeo.setAttribute('aVel', new THREE.BufferAttribute(sVel, 3));
    sparkGeo.setAttribute('aLife', new THREE.BufferAttribute(sLife, 1));
    sparkGeo.setAttribute('aCorner', new THREE.BufferAttribute(sCorner, 2));
    sparkGeo.setIndex(sIdx);
    const sparkMat = track(new THREE.ShaderMaterial({
      uniforms: { uRes: { value: new THREE.Vector2(W * pr, H * pr) }, uWidth: { value: 0.95 * pr }, uStreak: { value: 0.07 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
      vertexShader: `attribute vec3 aVel; attribute float aLife; attribute vec2 aCorner; uniform vec2 uRes; uniform float uWidth; uniform float uStreak;
        varying float vL; varying vec2 vC;
        void main(){
          vec4 h = projectionMatrix * viewMatrix * vec4(position, 1.0);
          vec4 t = projectionMatrix * viewMatrix * vec4(position - aVel * uStreak, 1.0);
          vec2 hs = h.xy / h.w * uRes * 0.5; vec2 ts = t.xy / t.w * uRes * 0.5;
          vec2 dir = hs - ts; float len = length(dir);
          dir = len > 1e-3 ? dir / len : vec2(0.0, 1.0);
          vec2 nrm = vec2(-dir.y, dir.x);
          float w = uWidth * (0.7 + 0.5 * aLife);
          vec4 base = aCorner.y > 0.5 ? h : t;
          vec2 off = nrm * aCorner.x * w + dir * (aCorner.y > 0.5 ? w : -w);
          base.xy += off / (uRes * 0.5) * base.w;
          gl_Position = aLife > 0.001 ? base : vec4(2.0, 2.0, 2.0, 1.0);
          vL = aLife; vC = aCorner; }`,
      fragmentShader: `varying float vL; varying vec2 vC;
        void main(){ float across = 1.0 - abs(vC.x); across *= across; float along = mix(0.08, 1.0, vC.y * vC.y);
          vec3 c = mix(vec3(0.9, 0.22, 0.03), vec3(1.0, 0.62, 0.22), smoothstep(0.15, 0.55, vL));
          c = mix(c, vec3(1.0, 0.93, 0.78), smoothstep(0.6, 0.95, vL));
          float e = (0.6 + 3.2 * vL * vL) * across * along * smoothstep(0.0, 0.12, vL);
          gl_FragColor = vec4(c * e, 1.0); }`,
    }));
    const sparks = new THREE.Mesh(sparkGeo, sparkMat);
    sparks.frustumCulled = false;
    sparks.renderOrder = 6;
    scene.add(sparks);
    const rnd = seeded(1);
    const emitSpark = (iv, yW, burst = false) => {
      if (!iv.length) return;
      let i = -1;
      for (let k = 0; k < NS; k++) if (sp.life[k] <= 0) { i = k; break; }
      if (i < 0) return;
      const [x0, x1, zH] = iv[Math.floor(rnd() * iv.length)];
      const edge = rnd() < 0.55; // molten edges throw most sparks
      const x = edge ? (rnd() < 0.5 ? x0 : x1) + (rnd() - 0.5) * 0.02 : lerp(x0, x1, rnd());
      const front = rnd() < 0.82;
      const z = front ? zH : (rnd() - 0.5) * 2 * zH;
      sp.pos[i * 3] = x; sp.pos[i * 3 + 1] = yW + 0.004; sp.pos[i * 3 + 2] = z;
      const outX = edge ? (x === x0 || x < (x0 + x1) / 2 ? -1 : 1) : (rnd() - 0.5);
      const k = burst ? 1.6 : 1.0;
      sp.vel[i * 3] = (outX * (0.12 + rnd() * 0.4) + (rnd() - 0.5) * 0.25) * k;
      sp.vel[i * 3 + 1] = (0.35 + rnd() * 0.9) * k;
      sp.vel[i * 3 + 2] = (front ? 0.2 + rnd() * 0.6 : (rnd() - 0.5) * 0.5) * k;
      sp.max[i] = sp.life[i] = 0.3 + rnd() * (burst ? 1.1 : 0.6);
    };
    const GRAV = 3.6;
    const stepSparks = (dt) => {
      for (let i = 0; i < NS; i++) {
        if (sp.life[i] <= 0) continue;
        sp.life[i] -= dt;
        const o = i * 3;
        sp.vel[o + 1] -= GRAV * dt;
        const drag = Math.exp(-1.4 * dt);
        sp.vel[o] *= drag; sp.vel[o + 2] *= drag; sp.vel[o + 1] *= Math.exp(-0.5 * dt);
        sp.pos[o] += sp.vel[o] * dt; sp.pos[o + 1] += sp.vel[o + 1] * dt; sp.pos[o + 2] += sp.vel[o + 2] * dt;
        const r = Math.hypot(sp.pos[o], sp.pos[o + 2]);
        const floorY = r < DISC_R ? DRUM_TOP : r < 1.33 ? 0.092 : 0;
        if (sp.pos[o + 1] < floorY && sp.vel[o + 1] < 0) {
          sp.pos[o + 1] = floorY + 0.001;
          sp.vel[o + 1] *= -0.32; sp.vel[o] *= 0.55; sp.vel[o + 2] *= 0.55;
          sp.life[i] -= 0.12; // a bounce cools it quickly
        }
      }
      for (let i = 0; i < NS; i++) {
        const l = Math.max(0, sp.life[i] / (sp.max[i] || 1));
        for (let v = 0; v < 4; v++) {
          const b = (i * 4 + v);
          sPos[b * 3] = sp.pos[i * 3]; sPos[b * 3 + 1] = sp.pos[i * 3 + 1]; sPos[b * 3 + 2] = sp.pos[i * 3 + 2];
          sVel[b * 3] = sp.vel[i * 3]; sVel[b * 3 + 1] = sp.vel[i * 3 + 1]; sVel[b * 3 + 2] = sp.vel[i * 3 + 2];
          sLife[b] = l;
        }
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.aVel.needsUpdate = true;
      sparkGeo.attributes.aLife.needsUpdate = true;
    };

    // ---------- atmosphere: a few warm motes drifting in the low sun (kept out of the clock zone)
    const ND = HIGH ? 70 : 24;
    const dustGeo = track(new THREE.BufferGeometry());
    {
      const r = seeded(77); const p = new Float32Array(ND * 3); const s = new Float32Array(ND);
      for (let i = 0; i < ND; i++) { p[i * 3] = (r() - 0.5) * 4.4; p[i * 3 + 1] = 0.3 + r() * 2.2; p[i * 3 + 2] = -1.6 + r() * 4.0; s[i] = r(); }
      dustGeo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
    }
    const dustU = { uTime: { value: 0 }, uSize: { value: 5.0 * pr }, uInt: { value: 1 }, uCol: { value: new THREE.Color(1, 0.8, 0.55) } };
    const dustMat = track(new THREE.ShaderMaterial({
      uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute float aSeed; uniform float uTime, uSize; varying float vB;
        void main(){ vec3 p = position;
          float t = uTime * (0.6 + aSeed * 0.8);
          p.x += sin(t * 0.13 + aSeed * 40.0) * 0.2; p.z += cos(t * 0.11 + aSeed * 23.0) * 0.16;
          p.y = 0.3 + mod(p.y - 0.3 + t * 0.012, 2.2);
          float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed) + aSeed * 60.0);
          vB = tw * smoothstep(0.3, 0.6, p.y) * (1.0 - smoothstep(1.9, 2.5, p.y));
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vB *= 1.0 - smoothstep(0.05, 0.35, gl_Position.y / gl_Position.w);
          gl_PointSize = uSize * (0.5 + aSeed) / -mv.z * 7.0; }`,
      fragmentShader: `uniform float uInt; uniform vec3 uCol; varying float vB;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a;
          gl_FragColor = vec4(uCol * a * vB * uInt * 0.7, 1.0); }`,
    }));
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.frustumCulled = false;
    dust.renderOrder = 4;
    scene.add(dust);

    // ---------- foliage: cypresses at the terrace edge, low shrubs, grass tufts, a few stones
    {
      const fr = seeded(29);
      const ni = (g) => { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; };
      // cypresses (one merged mesh, flat shaded, like the Tower's)
      const cyp = [];
      for (const [x, z, h] of [[-2.2, -1.6, 2.3], [-2.95, -0.55, 1.5], [2.5, -1.45, 1.95], [2.92, -0.82, 1.3], [-2.9, 0.9, 1.1]]) {
        const pts = [[0.001, 0], [0.11, 0.06], [0.2, 0.22], [0.215, 0.4], [0.17, 0.66], [0.09, 0.88], [0.001, 1.0]].map(([px, py]) => new THREE.Vector2(px * h * 0.55, py * h));
        const g = new THREE.LatheGeometry(pts, 7);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const f = 0.9 + fr() * 0.2; p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); }
        g.rotateY(fr() * 3);
        g.translate(x, hill.heightAt(x, z) - 0.03, z);
        cyp.push(ni(g));
        const tr = new THREE.CylinderGeometry(0.025, 0.035, 0.12, 6);
        tr.translate(x, hill.heightAt(x, z) + 0.03, z);
        cyp.push(ni(tr));
      }
      const cg = mergeGeometries(cyp, false); for (const g of cyp) g.dispose();
      cg.computeVertexNormals();
      const cypMat = track(new THREE.MeshStandardMaterial({ color: 0x2c3a2a, roughness: 0.9, flatShading: true, metalness: 0, envMapIntensity: 0.35 }));
      const cypMesh = new THREE.Mesh(track(cg), cypMat);
      cypMesh.castShadow = HIGH; cypMesh.receiveShadow = true;
      scene.add(cypMesh);
      // low shrubs and stones
      const sh = []; const st = [];
      for (const [x, z, s] of [[-1.02, 2.38, 0.2], [-1.3, 2.05, 0.14], [1.22, 2.25, 0.16], [2.05, 1.2, 0.22], [-2.2, 1.6, 0.2], [1.75, -2.1, 0.24], [-1.6, -2.2, 0.2]]) {
        const g = new THREE.IcosahedronGeometry(s, 1);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const f = 0.85 + fr() * 0.3; p.setXYZ(i, p.getX(i) * f, Math.max(-s * 0.2, p.getY(i)) * 0.8 * f, p.getZ(i) * f); }
        g.translate(x, hill.heightAt(x, z) + s * 0.28, z);
        sh.push(g);
      }
      for (const [x, z, s] of [[1.05, 2.7, 0.07], [-0.55, 2.9, 0.06], [2.3, 0.4, 0.09], [-2.45, -0.1, 0.08], [0.95, 3.15, 0.05]]) {
        const g = new THREE.DodecahedronGeometry(s, 0);
        g.scale(1.3, 0.6, 1.0); g.rotateY(fr() * 3);
        g.translate(x, hill.heightAt(x, z) + s * 0.25, z);
        st.push(ni(g));
      }
      const shrubGeo = mergeGeometries(sh.map(ni), false);
      shrubGeo.computeVertexNormals();
      const shrub = new THREE.Mesh(track(shrubGeo), track(new THREE.MeshStandardMaterial({ color: 0x3a4732, roughness: 0.95, flatShading: true, metalness: 0, envMapIntensity: 0.3 })));
      shrub.castShadow = HIGH; shrub.receiveShadow = true;
      scene.add(shrub);
      const stoneGeo = mergeGeometries(st, false); for (const g of st) g.dispose();
      const stones = new THREE.Mesh(track(stoneGeo), track(new THREE.MeshStandardMaterial({ color: 0xa79d90, roughness: 0.85, flatShading: true, metalness: 0, envMapIntensity: 0.4 })));
      stones.castShadow = HIGH; stones.receiveShadow = true;
      scene.add(stones);
      // grass tufts (one instanced mesh), kept off the stepping stones
      const NT = HIGH ? 900 : 220;
      const tuft = track(tuftGeometry());
      const tuftMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.3 }));
      const tufts = new THREE.InstancedMesh(tuft, tuftMat, NT);
      const m4 = new THREE.Matrix4(); const q = new THREE.Quaternion(); const v = new THREE.Vector3(); const sc = new THREE.Vector3();
      const tc = new THREE.Color(); const tA = new THREE.Color('#7c8a48'); const tB = new THREE.Color('#9a9058'); const tCc = new THREE.Color('#5c6a3a');
      let n = 0; let guard = 0;
      while (n < NT && guard++ < NT * 8) {
        const a = fr() * Math.PI * 2; const r = 1.82 + Math.pow(fr(), 0.8) * (hill.edgeR(a) - 2.0);
        const x = Math.sin(a) * r; const z = Math.cos(a) * r;
        if (x > 0.1 && x < 0.95 && z > 1.85 && z < 3.3) continue;
        v.set(x, hill.heightAt(x, z) - 0.005, z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), fr() * 6.28);
        const s = 0.45 + fr() * 0.5; sc.set(s, s * (0.7 + fr() * 0.5), s);
        tufts.setMatrixAt(n, m4.compose(v, q, sc));
        tufts.setColorAt(n, tc.lerpColors(tCc, tA, fr()).lerp(tB, fr() * fr()));
        n++;
      }
      tufts.count = n;
      tufts.receiveShadow = true;
      scene.add(tufts);
    }

    // screen vignette and a calmer, darker top for the clock (a clip-space quad)
    const vigU = { uAspect: { value: W / H }, uTopDark: { value: 0.5 } };
    const vigMat = track(new THREE.ShaderMaterial({
      uniforms: vigU, transparent: true, depthWrite: false, depthTest: false, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform float uAspect, uTopDark; varying vec2 vUv;
        void main(){ vec2 p = vUv * 2.0 - 1.0;
          vec2 q = p * (uAspect < 1.0 ? vec2(1.0, 0.82) : vec2(0.82, 1.0));
          float v = smoothstep(0.62, 1.45, length(q));
          float top = smoothstep(0.15, 1.0, p.y) * uTopDark;
          float bot = smoothstep(-0.55, -1.0, p.y) * 0.22;
          gl_FragColor = vec4(0.0, 0.0, 0.0, clamp(v * 0.62 + top * 0.5 + bot, 0.0, 0.88)); }`,
    }));
    const vignette = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), vigMat);
    vignette.frustumCulled = false;
    vignette.renderOrder = 1000;
    scene.add(vignette);

    // keep screen-space layers out of the mirror render
    if (reflector) {
      const orig = reflector.onBeforeRender;
      reflector.onBeforeRender = function (r, s, c, ...rest) {
        vignette.visible = false; dust.visible = false;
        orig.call(this, r, s, c, ...rest);
        vignette.visible = true; dust.visible = true;
      };
    }

    // ---------- lights: low sun with real shadows, dusk sky fill, a cool rim from the far side
    const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.6);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.6);
    key.castShadow = HIGH;
    key.shadow.mapSize.set(2048, 2048);
    const sc = key.shadow.camera;
    sc.left = -4.0; sc.right = 4.0; sc.top = 4.0; sc.bottom = -4.0; sc.near = 1; sc.far = 30;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    scene.add(key, key.target);
    key.target.position.set(0, 0.5, 0);
    const rim = new THREE.DirectionalLight(0xffffff, 0.9);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(-3, 2, 6);
    scene.add(fill);
    const melt = new THREE.PointLight(0xff9a48, 0, 1.8, 2); // the molten line lights its surroundings
    scene.add(melt);

    // early dusk to golden sunset, a pure function of progress
    const sunC = new THREE.Color();
    const applyTimeOfDay = (t) => {
      samplePal(t, pal);
      sunDir.set(Math.sin(pal.az) * Math.cos(pal.el), Math.sin(pal.el), Math.cos(pal.az) * Math.cos(pal.el));
      key.position.copy(sunDir).multiplyScalar(12);
      key.color.copy(pal.sun);
      key.intensity = pal.sunI;
      rim.position.set(-sunDir.x * 8, 5, -sunDir.z * 8 - 4);
      rim.color.copy(pal.cool);
      rim.intensity = lerp(0.9, 0.7, t);
      fill.color.copy(pal.glow).lerp(pal.cool, 0.4);
      hemi.color.copy(pal.hemiS);
      hemi.groundColor.copy(pal.hemiG);
      hemi.intensity = pal.hemiI;
      scene.fog.color.copy(pal.fog);
      envU.uSunC.value.copy(pal.sun).multiplyScalar(pal.sunI * 0.9);
      for (const L of RANGES) L.mat.color.copy(pal[L.key]);
      dustU.uCol.value.copy(pal.glow).lerp(pal.sun, 0.5);
    };

    // ---------- craftsman
    const man = buildCraftsman();
    disposables.push(man.geo, man.mat, man.mesh.skeleton);
    scene.add(man.root);
    const manAO = new THREE.Mesh(track(new THREE.PlaneGeometry(0.34, 0.34)), track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, alphaMap: blob, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
    manAO.rotation.x = -Math.PI / 2;
    manAO.renderOrder = 2;
    scene.add(manAO);
    const pose = basePose();
    const SZ = 0.385; // polishing distance from the letter face
    const STATIONS = [[-0.7, SZ], [-0.26, SZ + 0.02], [0.2, SZ + 0.02], [0.58, SZ]];
    const ORDER = [1, 0, 2, 3, 1, 0, 2, 3];
    const IDLE_SPOT = [-0.82, 0.62];
    const DONE_SPOT = [0.12, 0.84];
    const B = { st: 'wait', t: 0, x: IDLE_SPOT[0], z: IDLE_SPOT[1], yaw: 2.6, ph: 0, walking: 0, dir: 1, station: 1 };
    const stationFor = (p) => ORDER[Math.min(ORDER.length - 1, Math.floor(p * ORDER.length))];
    const FACE_LETTER = Math.PI; // facing -z: back to the camera
    // never let him turn towards the camera: clamp yaw to a cone around "away from camera"
    const awayYaw = () => Math.atan2(B.x - camera.position.x, B.z - camera.position.z);
    const safeYaw = (y) => { const aw = awayYaw(); const d = wrapA(y - aw); return aw + clamp(d, -1.15, 1.15); };
    const goTo = (tx, tz, speed, dt, face = 'move') => {
      const dx = tx - B.x; const dz = tz - B.z; const d = Math.hypot(dx, dz);
      if (d < 0.01) { B.walking = damp(B.walking, 0, 9, dt); return true; }
      const ease = Math.min(1, d / 0.06); // slow into the last step
      const step = Math.min(d, speed * dt * (0.45 + 0.55 * ease));
      B.x += (dx / d) * step; B.z += (dz / d) * step;
      const want = face === 'move' ? Math.atan2(dx, dz) : face;
      B.yaw = dampAngle(B.yaw, safeYaw(want), 6, dt);
      const fwd = Math.sign(Math.sin(B.yaw) * dx + Math.cos(B.yaw) * dz) || 1;
      B.dir = fwd;
      B.ph += (step / (0.11 * MAN / 0.6)) * fwd;
      B.walking = damp(B.walking, 1, 9, dt);
      return false;
    };

    // ---------- pose library (local: +z is the craftsman's front)
    const P = {
      walk(o, ph, amt) {
        const s = Math.sin(ph); const c = Math.cos(ph);
        o.lThx += -0.44 * s * amt; o.rThx += 0.44 * s * amt;
        o.lKnx += (0.1 + 0.72 * Math.pow(Math.max(0, c), 1.4)) * amt;
        o.rKnx += (0.1 + 0.72 * Math.pow(Math.max(0, -c), 1.4)) * amt;
        o.lFtx += (-0.25 * Math.max(0, c) + 0.18 * s) * amt;
        o.rFtx += (-0.25 * Math.max(0, -c) - 0.18 * s) * amt;
        o.hipY += (-0.012 + 0.012 * Math.cos(2 * ph)) * amt;
        o.hipRy += 0.08 * s * amt; o.toRy += -0.12 * s * amt; o.hipRz += 0.03 * s * amt;
        o.hipX += 0.009 * s * amt;
        o.lShx += 0.3 * s * amt; o.rShx += -0.3 * s * amt;
        o.lElx += (-0.18 - 0.12 * Math.max(0, -s)) * amt; o.rElx += (-0.18 - 0.12 * Math.max(0, s)) * amt;
        o.toRx += 0.05 * amt; o.hdRx += -0.03 * amt;
        o.skirt += -0.1 * Math.abs(s) * amt;
      },
      wait(o, t) { // hands clasped behind the back, gentle weight shift
        const sw = Math.sin(t * 0.55);
        o.hipX = 0.012 * sw; o.hipRz = 0.03 * sw; o.toRz = -0.035 * sw;
        o.lKnx = 0.03 + 0.07 * Math.max(0, -sw); o.rKnx = 0.03 + 0.07 * Math.max(0, sw);
        o.lShx = 0.3; o.lShy = -1.2; o.lShz = 0.12; o.lElx = -1.4;
        o.rShx = 0.3; o.rShy = -1.2; o.rShz = 0.12; o.rElx = -1.4;
        o.hdRx = -0.12 - 0.12 * smooth(-0.2, 0.6, Math.sin(t * 0.21)); o.hdRy = 0.08 * Math.sin(t * 0.33);
      },
      work(o, t) { // circular polishing strokes, left hand braced on the metal, short pauses to inspect
        const cyc = t % 7.4;
        const env = smooth(0.15, 0.7, cyc) * (1 - smooth(5.6, 6.2, cyc));
        const ins = 1 - env;
        const w = (Math.PI * 2) / 1.15;
        const a = w * t;
        const s = Math.sin(a); const c = Math.cos(a);
        o.hipY = 0.476; o.lThx = -0.2; o.rThx = 0.16; o.lKnx = 0.24; o.rKnx = 0.12; o.lFtx = -0.04; o.rFtx = -0.12;
        o.hipX = 0.01 * s * env; o.hipRy = -0.07 + 0.03 * c * env; o.hipZ = 0.006 * c * env;
        o.toRx = 0.28 + 0.04 * c * env + 0.1 * ins;
        o.toRy = -0.1 + 0.07 * Math.sin(a - 0.6) * env;
        o.toRz = 0.03 * s * env;
        o.rShx = lerp(-0.8, -1.22 + 0.15 * s, env); o.rShz = lerp(0.2, 0.1 + 0.15 * c, env); o.rShy = -0.25 * env;
        o.rElx = lerp(-1.2, -0.6 - 0.2 * Math.cos(a + 0.9), env);
        o.lShx = -0.95 + 0.04 * ins; o.lShz = 0.2; o.lElx = -0.7; o.lShy = 0.1;
        o.hdRx = 0.2 + 0.15 * ins; o.hdRy = 0.07 * Math.sin(a - 1.2) * env - 0.12 * ins; o.hdRz = 0.14 * ins;
      },
      look(o, t, upAmt = 1) { // stepped back, hand on hip, cloth hand at the side, head up
        const sw = Math.sin(t * 0.8);
        o.hipY = 0.497; o.hipX = 0.016; o.hipRz = 0.045; o.toRz = -0.03; o.toRx = -0.04;
        o.lKnx = 0.17; o.rKnx = 0.02; o.lThx = -0.05;
        o.lShx = 0.22; o.lShz = 0.8; o.lElx = -0.25; o.lElz = -1.7; o.lShy = 0.1;
        o.rShx = 0.06 + 0.02 * sw; o.rShz = 0.12; o.rElx = -0.4;
        o.hdRx = -0.38 * upAmt + 0.02 * sw; o.hdRz = 0.08; o.hdRy = 0.05;
      },
      sit(o) { // resting on the plinth top, leaning back on the hands, admiring
        o.hipY = 0.095; o.hipRx = -0.12;
        o.lThx = -1.84; o.rThx = -1.76; o.lThz = 0.16; o.rThz = 0.12;
        o.lKnx = 1.02; o.rKnx = 1.12; o.lFtx = 0.5; o.rFtx = 0.5;
        o.toRx = -0.3; o.toRz = 0.02;
        o.lShx = 0.34; o.lShz = 0.3; o.lElx = -0.06; o.rShx = 0.3; o.rShz = 0.3; o.rElx = -0.08;
        o.hdRx = -0.22; o.hdRz = -0.06; o.skirt = -0.9;
      },
    };

    // ---------- state
    let phase = 'idle';
    let progress = 0; // last value the app sent
    let pShown = 0; // eased display value (never more than ~1 s behind)
    let seg = { from: 0, to: 0, u: 1, dur: 1 };
    let lastCall = -1;
    let hCur = buildMin;
    let tod = 0;
    let lineInt = 0;
    let doneT = -1;
    let ringAmt = 0;
    let ghostAmt = 0.1;
    let orbitT = 0;
    let fxTime = 0;
    let mountT = 0;
    let firstSnap = true;
    let raf = 0;
    let disposed = false;
    let last = performance.now();
    let elapsed = 0;
    let sparkVis = 1;
    let sparkAcc = 0;
    let iv = [];
    const stats = { calls: 0, triangles: 0 };
    canvas.__astarStats = () => ({ ...stats });

    const targetCut = () => (phase === 'idle' ? buildMin : phase === 'done' ? buildMax : cutAt(pShown));

    const snapTo = () => {
      pShown = phase === 'done' ? 1 : progress;
      seg = { from: pShown, to: pShown, u: 1, dur: 1 };
      hCur = targetCut();
      tod = phase === 'idle' ? 0 : phase === 'done' ? 1 : pShown;
      if (phase === 'building') {
        B.station = stationFor(pShown);
        const [x, z] = STATIONS[B.station];
        B.x = x; B.z = z; B.yaw = FACE_LETTER; B.st = 'work'; B.t = 0;
      } else if (phase === 'paused') {
        B.station = stationFor(pShown);
        B.x = STATIONS[B.station][0]; B.z = 0.74; B.yaw = FACE_LETTER; B.st = 'sit'; B.t = 0;
      } else if (phase === 'done') {
        B.x = DONE_SPOT[0]; B.z = DONE_SPOT[1]; B.yaw = FACE_LETTER + 0.06; B.st = 'proud'; B.t = 0;
      } else {
        B.x = IDLE_SPOT[0]; B.z = IDLE_SPOT[1]; B.yaw = 2.6; B.st = 'wait';
      }
      lineInt = phase === 'building' ? 1 : phase === 'paused' ? 0.3 : 0;
      ghostAmt = phase === 'idle' ? 0.13 : phase === 'done' ? 0 : 0.07;
      Object.assign(pose, basePose());
      evalPose(0, true);
    };

    // ---------- behaviour
    const updateBehaviour = (dt) => {
      B.t += dt;
      if (phase === 'idle') {
        if (goTo(IDLE_SPOT[0], IDLE_SPOT[1], 0.28, dt)) { B.yaw = dampAngle(B.yaw, safeYaw(2.6), 3, dt); B.st = 'wait'; } else B.st = 'walk';
      } else if (phase === 'paused') {
        if (B.st !== 'sit') {
          if (goTo(B.x, 0.74, 0.2, dt, FACE_LETTER)) { B.st = 'sit'; B.t = 0; } else B.st = 'toSit';
        } else { B.walking = damp(B.walking, 0, 9, dt); B.yaw = dampAngle(B.yaw, safeYaw(FACE_LETTER), 4, dt); }
      } else if (phase === 'building') {
        const want = stationFor(pShown);
        const [sx] = STATIONS[B.station];
        switch (B.st) {
          case 'work':
            B.walking = damp(B.walking, 0, 9, dt);
            B.yaw = dampAngle(B.yaw, safeYaw(FACE_LETTER), 5, dt);
            if (want !== B.station && B.t > 2.5) { B.station = want; B.st = 'walk'; B.t = 0; } else if (B.t > 14.6) { B.st = 'back'; B.t = 0; }
            break;
          case 'back': // a few unhurried steps back to judge the work
            if (goTo(sx + 0.05, 0.8, 0.17, dt, FACE_LETTER)) { B.st = 'look'; B.t = 0; }
            break;
          case 'look':
            B.walking = damp(B.walking, 0, 9, dt);
            if (B.t > 3.2) { B.st = 'fwd'; B.t = 0; B.station = want; }
            break;
          default: { // walk, fwd, sit, toSit
            if (B.st !== 'fwd') B.station = want;
            const [tx, tz] = STATIONS[B.station];
            const far = Math.hypot(tx - B.x, tz - B.z) > 0.22;
            if (goTo(tx, tz, 0.24, dt, far ? 'move' : FACE_LETTER)) { B.st = 'work'; B.t = 0; } else if (B.st !== 'fwd') B.st = 'walk';
          }
        }
      } else if (phase === 'done') {
        if (B.st === 'doneBack') {
          const far = Math.hypot(DONE_SPOT[0] - B.x, DONE_SPOT[1] - B.z) > 0.35;
          if (goTo(DONE_SPOT[0], DONE_SPOT[1], 0.22, dt, far ? 'move' : FACE_LETTER + 0.06)) { B.st = 'nod'; B.t = 0; }
        } else {
          B.walking = damp(B.walking, 0, 9, dt);
          B.yaw = dampAngle(B.yaw, safeYaw(FACE_LETTER + 0.06), 4, dt);
          if (B.st === 'nod' && B.t > 2.6) { B.st = 'proud'; B.t = 0; }
        }
      }
    };

    const tgt = basePose();
    const evalPose = (dt, snap = false) => {
      Object.assign(tgt, basePose());
      const t = elapsed;
      const st = B.st;
      if (st === 'wait') P.wait(tgt, t);
      else if (st === 'work') P.work(tgt, B.t + 0.3);
      else if (st === 'look' || st === 'proud') P.look(tgt, t, st === 'proud' ? 0.7 : 1);
      else if (st === 'nod') {
        P.look(tgt, t, 0.85);
        const n = B.t - 0.35;
        const nod = n > 0 && n < 1.5 ? Math.sin(n * Math.PI * 2 / 0.75) * Math.exp(-n * 1.2) * 0.3 : 0;
        tgt.hdRx += Math.max(nod, -0.05);
        tgt.toRx += Math.max(nod, 0) * 0.15;
      } else if (st === 'sit') P.sit(tgt);
      else if (st === 'back' || st === 'toSit') P.look(tgt, t, 0.35);
      if (B.walking > 0.01 && st !== 'sit') P.walk(tgt, B.ph, B.walking);
      if (phase !== 'paused') { const br = Math.sin(t * 1.6); tgt.toRx += 0.012 * br; tgt.lShz += 0.01 * br; tgt.rShz += 0.01 * br; }
      for (const k of POSE_KEYS) pose[k] = snap ? tgt[k] : damp(pose[k], tgt[k], stiffOf(k), dt);
      const m = man;
      m.root.position.set(B.x, DRUM_TOP, B.z);
      m.root.rotation.y = B.yaw;
      m.hips.position.set(pose.hipX, pose.hipY, pose.hipZ);
      m.hips.rotation.set(pose.hipRx, pose.hipRy, pose.hipRz);
      m.torso.rotation.set(pose.toRx, pose.toRy, pose.toRz);
      m.head.rotation.set(pose.hdRx, pose.hdRy, pose.hdRz);
      m.L.sh.rotation.set(pose.lShx, pose.lShy, pose.lShz);
      m.R.sh.rotation.set(pose.rShx, -pose.rShy, -pose.rShz);
      m.L.el.rotation.set(pose.lElx, 0, pose.lElz);
      m.R.el.rotation.set(pose.rElx, 0, -pose.rElz);
      m.LL.th.rotation.set(pose.lThx, 0, pose.lThz);
      m.RL.th.rotation.set(pose.rThx, 0, -pose.rThz);
      m.LL.kn.rotation.x = pose.lKnx; m.RL.kn.rotation.x = pose.rKnx;
      m.LL.ft.rotation.x = pose.lFtx; m.RL.ft.rotation.x = pose.rFtx;
      m.skirt.rotation.x = Math.min(pose.lThx, pose.rThx) * 0.55 + pose.skirt * 0.3;
      manAO.position.set(B.x, DRUM_TOP + 0.0012, B.z - 0.01);
      manAO.material.opacity = st === 'sit' ? 0.7 : 0.55;
    };

    // ---------- camera framing: fit the plinth and A* into the middle band for any screen shape
    const camTarget = new THREE.Vector3(0, 0.9, 0);
    let camDist = 9;
    const CAM_AZ = 0.27; const CAM_EL = 0.2;
    const fitPts = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; fitPts.push(new THREE.Vector3(Math.sin(a) * 1.336, 0, Math.cos(a) * 1.336)); }
    for (const x of [-0.8 + LX, 0.8 + LX, starC.x + starR + LX]) fitPts.push(new THREE.Vector3(x, DRUM_TOP + letterTop, 0));
    fitPts.push(new THREE.Vector3(starC.x + starR + LX, DRUM_TOP + starC.y, 0));
    const tv = new THREE.Vector3();
    const setCam = (az) => {
      camera.position.set(camTarget.x + Math.sin(az) * Math.cos(CAM_EL) * camDist, camTarget.y + Math.sin(CAM_EL) * camDist, camTarget.z + Math.cos(az) * Math.cos(CAM_EL) * camDist);
      camera.lookAt(camTarget);
      camera.updateMatrixWorld();
    };
    const bandFor = (aspect) => {
      if (aspect >= 1.15) return { top: 0.37, bot: 0.87, wMax: 0.64 };
      const k = smooth(0.46, 0.72, aspect);
      return { top: lerp(0.405, 0.38, k), bot: lerp(0.79, 0.8, k), wMax: lerp(0.94, 0.86, k) };
    };
    const frame = () => {
      const { top, bot, wMax } = bandFor(W / H);
      const nTop = 1 - 2 * top; const nBot = 1 - 2 * bot; const nMid = (nTop + nBot) / 2; const nH = nTop - nBot;
      const tanH = Math.tan((camera.fov * Math.PI) / 360);
      camTarget.set(0.05, 0.9, 0);
      camDist = 9;
      for (let it = 0; it < 6; it++) {
        setCam(CAM_AZ);
        let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
        for (const p of fitPts) { tv.copy(p).project(camera); x0 = Math.min(x0, tv.x); x1 = Math.max(x1, tv.x); y0 = Math.min(y0, tv.y); y1 = Math.max(y1, tv.y); }
        const s = Math.max((y1 - y0) / nH, (x1 - x0) / 2 / wMax);
        const visH = 2 * camDist * tanH;
        // move the target so the bbox centre lands in the band centre
        const cy = (y0 + y1) / 2 - nMid; const cx = (x0 + x1) / 2;
        camTarget.y += cy * visH / 2 * 0.9;
        tv.set(Math.cos(CAM_AZ), 0, -Math.sin(CAM_AZ));
        camTarget.addScaledVector(tv, cx * visH * camera.aspect / 2 * 0.9);
        camDist *= s;
      }
      setCam(CAM_AZ);
    };

    // virtual horizon just behind the plinth: the dusk band frames the A* and the top stays dark for the clock;
    // the distant ranges sit on that horizon
    const HZ_ANCHOR = 1.05;
    const hv = new THREE.Vector3();
    const placeBackdrop = () => {
      sky.position.copy(camera.position);
      hv.set(0, HZ_ANCHOR, 0).project(camera);
      hv.set(0, hv.y, 0.5).unproject(camera).sub(camera.position).normalize();
      skyU.uHv.value = hv.y;
      const slope = hv.y / Math.sqrt(Math.max(1e-4, 1 - hv.y * hv.y));
      const camH = Math.hypot(camera.position.x, camera.position.z);
      for (const L of RANGES) { L.mesh.position.y = camera.position.y + (L.R + camH) * slope; L.mesh.rotation.y = CAM_AZ + Math.PI; }
    };
    const placeCamera = () => {
      const swing = reduceMotion ? 0 : Math.sin(orbitT * Math.PI * 2 / 52) * 0.05;
      setCam(CAM_AZ + swing);
      placeBackdrop();
    };

    // ---------- frame loop
    const tick = (_t, resumed) => {
      if (disposed) return;
      const now = performance.now();
      if (resumed) last = now - 1000 / 60; // after a rest: carry on from here, no catch-up
      const rawDt = Math.min(1, Math.max(0, (now - last) / 1000)); // wall-clock, for time-true progress
      const dt = Math.min(0.05, rawDt); // capped, for animation
      last = now;
      elapsed += dt;
      mountT += dt;
      const paused = phase === 'paused';

      // progress: linear segments between the app's calls, so the line glides and is never > 1 s behind
      if (!paused) {
        if (seg.u < 1) { seg.u = Math.min(1, seg.u + rawDt / seg.dur); pShown = lerp(seg.from, seg.to, seg.u); } else pShown = seg.to;
        fxTime += dt;
      }
      if (phase === 'done') { if (pShown < 1 && seg.to < 1) seg = { from: pShown, to: 1, u: 0, dur: 0.8 }; }
      hCur = targetCut();
      const todT = phase === 'idle' ? 0 : phase === 'done' ? 1 : pShown;
      tod = phase === 'building' || paused ? todT : damp(tod, todT, 1.5, dt);
      applyTimeOfDay(tod);
      clipBelow.constant = hCur;
      clipAbove.constant = -hCur;
      fx.uCut.value = hCur;

      // build line intensity
      const visible = hCur > buildMin + 0.002 && hCur < buildMax - 0.003;
      let lineT = phase === 'building' ? 1 : paused ? 0.3 : 0;
      if (phase === 'done' && doneT >= 0) {
        const d = doneT;
        lineT = d < 0.22 ? 1 + 2.4 * (d / 0.22) : Math.max(0, 3.4 * (1 - (d - 0.22) / 0.75));
      }
      if (!paused) lineInt = phase === 'done' ? lineT : damp(lineInt, lineT, 4, dt);
      else lineInt = damp(lineInt, lineT, 6, dt);
      const lineVis = phase === 'done' ? lineInt : visible ? lineInt : 0;
      const flick = paused || reduceMotion ? 1 : 0.94 + 0.06 * Math.sin(fxTime * 23.0) * Math.sin(fxTime * 7.3);
      const glowY = phase === 'done' ? Math.min(hCur, buildMax - 0.03) : hCur;
      iv = updateGlow(glowY);
      glowMat.uniforms.uInt.value = lineVis * flick;
      fx.uHeat.value = phase === 'done' ? Math.max(0, 1 - Math.max(doneT, 0) * 1.4) : visible ? (paused ? 0.35 : 1) : 0;
      hotU.uHot.value = paused ? 0.45 : 1;
      hotU.uT.value = fxTime;
      const started = hCur > buildMin + 0.002; // nothing cast yet: hide the metal (no z-fight at the base)
      aMesh.visible = sMesh.visible = started;
      aHot.visible = sHot.visible = started && (hCur < buildMax - 0.003 || (phase === 'done' && doneT < 0.7));
      melt.intensity = lineVis * 0.55 * flick * (HIGH ? 1 : 0.8);
      melt.position.set((glowSpan[0] + glowSpan[1]) / 2, glowY + 0.05, zA + 0.18);

      // done sequence: flare, sweep, light lines
      if (phase === 'done') {
        if (doneT < 0 && hCur >= buildMax - 0.003) doneT = 0;
        if (doneT >= 0) doneT += dt;
        const s1 = doneT - 0.55;
        if (doneT >= 0 && s1 >= 0 && s1 < 2.2) { fx.uSweep.value = lerp(-1.2, 3.4, smooth(0, 2.0, s1)); fx.uSweepAmt.value = reduceMotion ? 0.5 : 1.15; }
        else if (doneT >= 2.75) {
          const per = (doneT - 2.75) % 9.0;
          fx.uSweep.value = lerp(-1.2, 3.4, smooth(0, 2.8, per));
          fx.uSweepAmt.value = reduceMotion ? 0 : 0.4;
        } else fx.uSweepAmt.value = 0;
        ringAmt = damp(ringAmt, doneT > 0.35 ? 1 : 0, 2.2, dt);
      } else {
        fx.uSweepAmt.value = 0;
        if (!paused) ringAmt = damp(ringAmt, phase === 'idle' ? 0.12 : 0.0, 3, dt);
      }
      ringMat.opacity = ringAmt * 0.95;
      grooveMat.opacity = ringAmt * 0.75;
      ringMat.color.setRGB(2.4, 1.5, 0.6);
      grooveMat.color.setRGB(1.8, 1.0, 0.38);

      // ghost outline
      if (!paused) ghostAmt = damp(ghostAmt, phase === 'idle' ? 0.13 : phase === 'done' ? 0 : 0.07, 3, dt);
      ghostMat.opacity = ghostAmt;
      ghostFillMat.opacity = ghostAmt * 0.22;

      // sparks (frozen and hidden while paused; none with reduced motion)
      sparkVis = damp(sparkVis, paused || reduceMotion ? 0 : 1, 10, dt);
      sparks.visible = sparkVis > 0.02;
      if (!paused && !reduceMotion) {
        if (phase === 'building' && visible) {
          sparkAcc += dt * 28; // steady trickle, plus an occasional small burst
          while (sparkAcc >= 1) { emitSpark(iv, hCur); sparkAcc -= 1; }
          if (rnd() < dt * 0.3) for (let i = 0; i < 5; i++) emitSpark(iv, hCur, true);
        }
        stepSparks(dt);
      }

      // atmosphere
      if (!paused && !reduceMotion) dustU.uTime.value += dt;
      dustU.uInt.value = lerp(0.8, 1.1, tod);
      refreshEnv(tod, elapsed, envT < 0);

      // craftsman
      // paused: he steps back and sits; once settled the whole scene is still
      const resting = paused && B.st === 'sit';
      updateBehaviour(resting ? 0 : dt);
      if (resting) B.t += dt;
      if (!(resting && B.t > 1.5)) evalPose(dt);

      // camera
      if (!paused) orbitT += dt;
      placeCamera();

      renderer.info.reset();
      if (warm) { if (composer) composer.render(dt); else renderer.render(scene, camera); }
      stats.calls = renderer.info.render.calls;
      stats.triangles = renderer.info.render.triangles;
      stats.f = (stats.f || 0) + 1; stats.sparks = sp.life.reduce((n, l) => n + (l > 0 ? 1 : 0), 0); stats.iv = iv.length; stats.p = pShown; stats.cut = hCur; stats.cutAtP = cutAt(progress); stats.phase = phase;
    };

    // ---------- api
    let warm = false;
    let sizedAt = '';
    let pace = null; // made once the frame loop exists (api.resize runs before that)
    const api = {
      ready: null,
      setProgress(p, opts = {}) {
        const v = clamp(+p || 0, 0, 1);
        if (v !== progress || opts.instant) pace?.poke();
        const now = performance.now() / 1000;
        const first = lastCall < 0 || (firstSnap && mountT < 0.6);
        if (opts.instant || first) {
          pShown = v; seg = { from: v, to: v, u: 1, dur: 1 };
          if (phase !== 'idle' && phase !== 'done') hCur = cutAt(v);
          if (opts.instant && phase === 'building') { B.station = stationFor(v); }
        } else if (v !== seg.to) {
          const gap = clamp(now - lastCall, 0.05, 1.0);
          seg = { from: pShown, to: v, u: 0, dur: gap };
        }
        lastCall = now;
        progress = v;
      },
      setPhase(ph) {
        if (!['idle', 'building', 'paused', 'done'].includes(ph) || ph === phase) {
          if (firstSnap && mountT < 0.6) snapTo();
          return;
        }
        const prev = phase;
        phase = ph;
        pace?.restIn(ph === 'paused' ? PAUSE_REST : ph === 'done' ? DONE_REST : null);
        if (firstSnap && mountT < 0.6) { snapTo(); if (phase === 'done') { doneT = 3.2; ringAmt = 1; } return; }
        firstSnap = false;
        if (ph === 'done') {
          doneT = hCur >= buildMax - 0.003 ? 0 : -1; B.st = 'doneBack'; B.t = 0;
          if (!reduceMotion) { const ivd = intervalsAt(Math.min(hCur, buildMax - 0.1)); for (let i = 0; i < 22; i++) emitSpark(ivd, Math.min(hCur, buildMax - 0.1), true); }
        } else if (ph === 'building') {
          if (prev !== 'building') { B.st = prev === 'paused' ? 'fwd' : 'walk'; B.station = stationFor(pShown); B.t = 0; }
        } else if (ph === 'paused') {
          B.st = 'toSit'; B.t = 0;
        } else if (ph === 'idle') {
          doneT = -1;
        }
      },
      resize(w, h) {
        // each resize reallocates the drawing buffers: skip calls that change nothing
        const key = Math.round(w) + 'x' + Math.round(h) + '@' + (window.devicePixelRatio || 1);
        if (key === sizedAt) return; sizedAt = key;
        pace?.poke();
        W = Math.max(1, w); H = Math.max(1, h);
        renderer.setSize(W, H, false);
        if (composer) { composer.setPixelRatio(pr); composer.setSize(W, H); bloom.resolution.set(W / 2, H / 2); }
        if (reflector) reflector.getRenderTarget().setSize(Math.round(W * pr * 0.5), Math.round(H * pr * 0.5));
        reflU.uBlur.value.set(1.6 / (W * pr * 0.5), 1.6 / (H * pr * 0.5));
        camera.aspect = W / H;
        camera.updateProjectionMatrix();
        sparkMat.uniforms.uRes.value.set(W * pr, H * pr);
        skyU.uRes.value.set(W * pr, H * pr);
        vigU.uAspect.value = W / H;
        vigU.uTopDark.value = W / H >= 1.15 ? 0.35 : 0.55;
        frame();
        placeBackdrop();
      },
      // false while the page isn't showing the world (hidden tab, scrolled away): nothing is drawn
      setShown(v) { pace?.show(v); },
      dispose() {
        disposed = true;
        pace?.stop();
        cancelAnimationFrame(raf);
        for (const d of disposables) d.dispose?.();
        if (envRT) envRT.dispose();
        pmrem.dispose();
        if (reflector) reflector.dispose?.();
        if (composer) { composer.dispose?.(); rt.dispose(); bloom.dispose?.(); }
        renderer.dispose();
        delete canvas.__astarStats;
      },
    };
    api.resize(W, H);
    applyTimeOfDay(0);
    snapTo();
    setTimeout(() => { firstSnap = false; }, 700);
    // nothing is drawn until the shaders are compiled (the page shows its placeholder meanwhile)
    pace = makePacer(fps, tick);
    api.ready = warmUp(renderer, scene, camera).then(() => { warm = true; pace.poke(3); });
    pace.start();
    return api;
  },
};
