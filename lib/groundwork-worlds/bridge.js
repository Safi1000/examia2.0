// Copied from design-mockups/groundwork-3d/concept2.js by scripts/sync-groundwork-worlds.mjs.
// Edit the original there, then run: node scripts/sync-groundwork-worlds.mjs
/* eslint-disable */
// Groundwork focus timer, concept 2 (v2): "The Bridge".
// A small builder lays a timber bridge between two sheer headlands above a sea of mist,
// one plank per stretch of focus, from clear blue dawn to a rich gold evening.
//
// Contract: default export { id, title, blurb, mount(canvas, { reduceMotion, quality }) }
// mount returns { setProgress(p, { instant }), setPhase(phase), resize(w, h), dispose() }.
// Time is truth: plank k (0-based) is built exactly when p >= (k + 1) / N. The builder's
// work loop is decoration around that truth; it never decides what is built.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

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

// ---------- constants ----------
const N = 40, PITCH = 0.34, SPAN = N * PITCH, ARCH = 0.45, POST_Z = 0.55, POST_EVERY = 4;
const LANE = 0.1, KNEEL_BACK = 0.24, SLED_BACK = 0.66, SLED_Z = -0.31, SEAT_H = 0.235;
const HIP_H = 0.485;
const MIST_Y = -3.6; // top of the sea of mist

// ---------- math ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const easeOutBack = (t, s = 1.5) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const noise1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash1(i), hash1(i + 1), u) * 2 - 1; };
const fbm1 = (x, o = 4) => { let a = 0.5, s = 0, f = 1; for (let i = 0; i < o; i++) { s += a * noise1(x * f + i * 17.3); f *= 2.03; a *= 0.5; } return s; };

const deckY = (x) => (x > 0 && x < SPAN ? ARCH * Math.sin((Math.PI * x) / SPAN) : 0);
const deckSlope = (x) => (x > 0 && x < SPAN ? Math.atan(((ARCH * Math.PI) / SPAN) * Math.cos((Math.PI * x) / SPAN)) : 0);

// ---------- palette (clear blue dawn -> soft day -> rich gold evening) ----------
const PAL = {
  skyTop: ['#070d17', '#091019', '#0f0a10'],
  skyMid: ['#16304f', '#1c2f41', '#5a2a22'],
  horizon: ['#86acd4', '#a6b6c0', '#ffa94f'],
  sun: ['#ffe0b8', '#fff1d8', '#ffbb55'],
  fog: ['#2a3c52', '#323f4a', '#2e1c2c'],
  mist: ['#557aa6', '#647a8f', '#b8743c'],
  mistLow: ['#0f1826', '#141b23', '#1a0e16'],
  ridge: ['#0f1a28', '#121b24', '#120a18'],
  key: ['#ffcf9e', '#fff2e0', '#ffa74c'],
  hemiSky: ['#5f82ad', '#8597a8', '#8c6458'],
  hemiGround: ['#10151c', '#16181b', '#1e120c'],
};
const PALC = {};
for (const k in PAL) PALC[k] = PAL[k].map((h) => new THREE.Color(h));
function pal(k, t, out) {
  const a = PALC[k]; const u = clamp(t) * 2; const i = Math.min(1, Math.floor(u));
  return out.copy(a[i]).lerp(a[i + 1], u - i);
}

// ---------- geometry helpers ----------
function prep(g, hex, mult = 1, keepUV = false) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUV && k === 'uv')) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (keepUV && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  const c = new THREE.Color(hex).multiplyScalar(mult);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const prepW = (g, hex, mult = 1) => prep(g, hex, mult, true);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function xf(g, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  _m4.compose(_v.set(...p), _q.setFromEuler(_e.set(...r)), _s.set(...s)); g.applyMatrix4(_m4); return g;
}
const rbox = (w, h, d, r = 0.012, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}
function radialTex(stops, size = 128) {
  return canvasTex(size, size, (g) => { const m = size / 2; const gr = g.createRadialGradient(m, m, 0, m, m, m); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, size, size); });
}
// weathered timber: long grain streaks, a few knots, sun-bleached edges
function woodTexture() {
  const t = canvasTex(128, 512, (g, w, h) => {
    g.fillStyle = '#f2ece4'; g.fillRect(0, 0, w, h);
    const r = rng(17);
    for (let i = 0; i < 260; i++) {
      let x = r() * w; const a = 0.03 + r() * 0.13; g.strokeStyle = `rgba(${50 + r() * 30},${30 + r() * 20},${16},${a})`; g.lineWidth = 0.4 + r() * 1.8;
      g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= h; y += 12) { x += (r() - 0.5) * 1.4; g.lineTo(x, y); } g.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const x = r() * w, y = r() * h, rx = 3 + r() * 5, ry = 8 + r() * 10;
      const gr = g.createRadialGradient(x, y, 0, x, y, ry); gr.addColorStop(0, 'rgba(60,35,18,0.55)'); gr.addColorStop(0.5, 'rgba(70,45,25,0.2)'); gr.addColorStop(1, 'rgba(70,45,25,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx * 1.8, ry * 1.6, 0, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,250,240,${0.04 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 1 + r() * 3, 20 + r() * 80); }
  });
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
// tileable soft cloud texture for the mist sea
function cloudTexture(seed) {
  const t = canvasTex(256, 256, (g, w, h) => {
    const r = rng(seed);
    for (let i = 0; i < 140; i++) {
      const x = r() * w, y = r() * h, rr = 14 + r() * 52, a = 0.08 + r() * 0.2;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rr);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x + ox - rr, y + oy - rr, rr * 2, rr * 2);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

// ---------- terrain: stratified headland with a sheer front face ----------
function mesa({ cx, cz, rx, rz, top, bottom, seed, frontDir = null, tint = 1, M = 44, warmTop = true }) {
  const r = rng(seed); const pos = [], col = [];
  const cTop = new THREE.Color(warmTop ? '#7f6b4c' : '#6a6556'), cMoss = new THREE.Color(warmTop ? '#87865a' : '#6b6e58');
  const sides = [new THREE.Color('#353c47'), new THREE.Color('#3e4550'), new THREE.Color('#2f3540'), new THREE.Color('#444a52'), new THREE.Color('#393f49')];
  const ledge = new THREE.Color('#7b7468');
  const tmp = new THREE.Color();
  const push = (p, c) => { pos.push(p[0], p[1], p[2]); col.push(c.r * tint, c.g * tint, c.b * tint); };
  const tri = (a, b, c, color) => { push(a, color); push(b, color); push(c, color); };
  const ring = (y, grow, s, salt) => {
    const out = [];
    for (let i = 0; i < M; i++) {
      const th = (i / M) * Math.PI * 2;
      const cs = Math.cos(th), sn = Math.sin(th);
      const ex = Math.sign(cs) * Math.pow(Math.abs(cs), 0.42), ez = Math.sign(sn) * Math.pow(Math.abs(sn), 0.6);
      let amp = 0.16;
      if (frontDir !== null) { const d = Math.abs(angDiff(th, frontDir)); amp *= sstep(0.1, 0.5, d) * 0.8 + 0.2; }
      const n = amp * noise1(th * 6 + seed * 3.1 + s * 1.7 + salt) + amp * 0.45 * noise1(th * 17 + s * 2.3) + grow;
      out.push([cx + ex * (rx + n), y, cz + ez * (rz + n)]);
    }
    return out;
  };
  let y = top, s = 0;
  while (y > bottom) {
    const h = s === 0 ? 0.45 + r() * 0.25 : 0.55 + r() * 1.5; const yb = Math.max(bottom, y - h);
    const g = -s * 0.02 - r() * 0.04;
    const R0 = ring(y, g - 0.03, s, 0), R1 = ring((y + yb) / 2, g + 0.015, s, 0.5), R2 = ring(yb, g, s, 1);
    const base = sides[s % sides.length];
    const dark = clamp(1 + (y - top) * 0.012, 0.75, 1);
    for (const [A, B] of [[R0, R1], [R1, R2]]) {
      for (let i = 0; i < M; i++) {
        const j = (i + 1) % M; tmp.copy(base).multiplyScalar(dark * (0.9 + r() * 0.2));
        tri(A[i], B[i], B[j], tmp); tri(A[i], B[j], A[j], tmp);
      }
    }
    const cc = [cx, y, cz];
    if (s === 0) for (let i = 0; i < M; i++) {
      const j = (i + 1) % M;
      const c2 = s === 0 ? cTop : tmp.copy(ledge).multiplyScalar(dark * (0.85 + r() * 0.2));
      tri(cc, R0[j], R0[i], c2);
    }
    y = yb; s++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- refined vegetation (smooth, gradient-shaded, same finish as the builder) ----------
function gradientColors(g, low, high, y0, y1, jitter = 0, seed = 1) {
  const p = g.attributes.position, n = p.count, arr = new Float32Array(n * 3);
  const a = new THREE.Color(low), b = new THREE.Color(high), c = new THREE.Color(); const r = rng(seed);
  for (let i = 0; i < n; i++) { const t = clamp((p.getY(i) - y0) / (y1 - y0)); c.copy(a).lerp(b, t * t * (3 - 2 * t)).multiplyScalar(1 + (r() - 0.5) * jitter); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
}
function clean(g) { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; }
function cypress(x, y, z, h, seed) {
  const r = rng(seed); const w = h * (0.15 + r() * 0.04); const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; const rad = w * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.96 + 0.04)), 0.75) * (1 - 0.35 * t) + 0.002; pts.push(new THREE.Vector2(rad, t * h)); }
  const g = new THREE.LatheGeometry(pts, 20);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i); const a = Math.atan2(pz, px);
    const k = 1 + 0.09 * Math.sin(a * 5 + py * 7 / h * 3 + seed) * Math.sin(py / h * 11 + seed) + 0.04 * Math.sin(a * 11 + py * 13);
    p.setXYZ(i, px * k, py, pz * k);
  }
  g.computeVertexNormals();
  gradientColors(g, '#16261f', '#4d6b4a', 0, h, 0.06, seed);
  const trunk = gradientColors(new THREE.CylinderGeometry(w * 0.12, w * 0.18, h * 0.12, 8), '#3a2c22', '#3a2c22', 0, 1);
  xf(trunk, [0, h * 0.02, 0]);
  return [xf(clean(g), [x, y, z], [0, r() * 6, (r() - 0.5) * 0.06]), xf(clean(trunk), [x, y, z])];
}
function umbrellaPine(x, y, z, h, seed, lean = 0.25) {
  const r = rng(seed); const parts = []; const cy = r() * 6;
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(lean * 0.25 * h, h * 0.35, 0.02), new THREE.Vector3(lean * 0.7 * h, h * 0.72, -0.03), new THREE.Vector3(lean * h, h * 0.9, 0)]);
  const trunk = new THREE.TubeGeometry(curve, 14, h * 0.028, 8, false);
  const tp = trunk.attributes.position; // taper toward the crown
  for (let i = 0; i < tp.count; i++) { const yy = tp.getY(i) / h; const c = curve.getPointAt(clamp(yy / 0.9)); const k = 1.3 - 0.6 * yy; tp.setXYZ(i, c.x + (tp.getX(i) - c.x) * k, tp.getY(i), c.z + (tp.getZ(i) - c.z) * k); }
  trunk.computeVertexNormals(); gradientColors(trunk, '#2e231b', '#4b3a2c', 0, h);
  parts.push(xf(clean(trunk), [x, y, z], [0, cy, 0]));
  const top = curve.getPointAt(1); const rot = new THREE.Euler(0, cy, 0);
  const lobes = [[0, 0, 0, 1], [0.3, -0.04, 0.18, 0.62], [-0.28, -0.06, -0.1, 0.66], [0.05, 0.05, -0.3, 0.55], [-0.1, 0.07, 0.22, 0.5]];
  for (const [lx, ly, lz, ls] of lobes) {
    const g = new THREE.SphereGeometry(h * 0.36 * ls, 28, 14);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), pz = p.getZ(i); let py = p.getY(i); const a = Math.atan2(pz, px);
      py *= py > 0 ? 0.42 : 0.2; const k = 1 + 0.05 * Math.sin(a * 7 + seed) + 0.03 * Math.sin(a * 15);
      p.setXYZ(i, px * k, py, pz * k);
    }
    g.computeVertexNormals();
    gradientColors(g, '#1a2b22', '#5e7a50', -h * 0.07 * ls, h * 0.14 * ls, 0.05, seed + lx * 10);
    _v.set(top.x + lx * h, top.y + ly * h, top.z + lz * h).applyEuler(rot);
    parts.push(xf(clean(g), [x + _v.x, y + _v.y, z + _v.z]));
  }
  return parts;
}
function shrub(x, y, z, s, seed) {
  const g = new THREE.SphereGeometry(s, 18, 10); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const py = p.getY(i); p.setY(i, py > 0 ? py * 0.7 : py * 0.25); }
  g.computeVertexNormals(); gradientColors(g, '#22331f', '#6b7c4a', -s * 0.2, s * 0.7, 0.08, seed);
  return xf(clean(g), [x, y + s * 0.12, z]);
}
function grassTuft(seed) {
  const r = rng(seed); const parts = [];
  for (let i = 0; i < 7; i++) {
    const h = 0.12 + r() * 0.12; const g = new THREE.ConeGeometry(0.012, h, 4, 1, true);
    xf(g, [0, h / 2, 0]); xf(g, [(r() - 0.5) * 0.06, 0, (r() - 0.5) * 0.06], [(r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7]);
    gradientColors(g, '#4a5130', '#c7b57a', 0, 0.22, 0.1, seed + i); parts.push(clean(g));
  }
  return mergeGeometries(parts);
}

// ---------- bridge parts ----------
function panelGeoms() {
  const wood = [], gold = [];
  const shades = ['#8f6a48', '#7f5c3e', '#98744f'];
  [-0.112, 0, 0.112].forEach((x, i) => wood.push(prepW(xf(rbox(0.104, 0.045, 1.12, 0.012), [x, -0.0225, 0]), shades[i])));
  [-0.4, 0.4].forEach((z) => wood.push(prepW(xf(rbox(0.34, 0.07, 0.06, 0.01), [0, -0.08, z]), '#5a4232')));
  [-0.45, 0.45].forEach((z) => {
    gold.push(prep(xf(rbox(0.33, 0.007, 0.036, 0.003), [0, 0.003, z]), '#ffffff'));
    [-0.112, 0, 0.112].forEach((x) => gold.push(prep(xf(new THREE.CylinderGeometry(0.009, 0.009, 0.01, 8), [x, 0.008, z]), '#ffffff')));
  });
  return { wood: mergeGeometries(wood), gold: mergeGeometries(gold) };
}

// ---------- builder rig ----------
function makeBuilder(M) {
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = HIP_H; root.add(hips);
  const meshes = [];
  const mesh = (geo, mat, p = [0, 0, 0], s = null) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (s) m.scale.set(...s); m.castShadow = true; m.receiveShadow = true; meshes.push(m); return m; };
  hips.add(mesh(rbox(0.19, 0.12, 0.13, 0.05, 3), M.trousers, [0, 0.0, 0]));
  hips.add(mesh(rbox(0.205, 0.045, 0.14, 0.02, 2), M.leather, [0, 0.045, 0]));
  hips.add(mesh(rbox(0.06, 0.07, 0.04, 0.015, 2), M.leather, [-0.095, 0.0, -0.03]));
  const spine = new THREE.Group(); spine.position.y = 0.05; hips.add(spine);
  spine.add(mesh(new THREE.CapsuleGeometry(0.088, 0.14, 6, 16), M.jacket, [0, 0.165, 0], [1.22, 1, 0.86]));
  spine.add(mesh(new THREE.TorusGeometry(0.048, 0.016, 8, 16), M.jacket, [0, 0.305, -0.005], null)).rotation.x = Math.PI / 2;
  // small canvas satchel on the back (reads as a working traveller from behind)
  spine.add(mesh(rbox(0.15, 0.17, 0.07, 0.03, 3), M.satchel, [0, 0.17, -0.105]));
  spine.add(mesh(rbox(0.152, 0.05, 0.075, 0.02, 2), M.leather, [0, 0.245, -0.106]));
  const neck = new THREE.Group(); neck.position.y = 0.315; spine.add(neck);
  neck.add(mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.06, 12), M.skin, [0, 0.02, 0]));
  const head = new THREE.Group(); head.position.y = 0.05; neck.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.07, 24, 16), M.skin, [0, 0.07, 0.005], [0.95, 1.06, 1]));
  head.add(mesh(new THREE.SphereGeometry(0.073, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), M.hair, [0, 0.072, -0.01], [0.97, 1.0, 1.0])).rotation.x = -0.55;
  const hat = mergeGeometries([
    prep(new THREE.SphereGeometry(0.082, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff'),
    prep(xf(new THREE.CylinderGeometry(0.096, 0.1, 0.012, 28), [0, 0.003, 0.018]), '#ffffff'),
    prep(xf(rbox(0.022, 0.03, 0.16, 0.01), [0, 0.07, 0]), '#ffffff'),
  ]);
  head.add(mesh(hat, M.hat, [0, 0.102, 0]));
  const arm = (side) => {
    const sh = new THREE.Group(); sh.position.set(0.122 * side, 0.27, 0); spine.add(sh);
    sh.add(mesh(new THREE.CapsuleGeometry(0.036, 0.15, 6, 12), M.jacket, [0, -0.1, 0]));
    const el = new THREE.Group(); el.position.y = -0.2; sh.add(el);
    el.add(mesh(new THREE.CapsuleGeometry(0.031, 0.14, 6, 12), M.jacket, [0, -0.09, 0]));
    const hand = new THREE.Group(); hand.position.y = -0.195; el.add(hand);
    hand.add(mesh(new THREE.SphereGeometry(0.036, 14, 10), M.leather, [0, -0.01, 0], [0.9, 1.1, 1]));
    return { sh, el, hand };
  };
  const leg = (side) => {
    const hp = new THREE.Group(); hp.position.set(0.058 * side, -0.02, 0); hips.add(hp);
    hp.add(mesh(new THREE.CapsuleGeometry(0.05, 0.14, 6, 12), M.trousers, [0, -0.11, 0]));
    const kn = new THREE.Group(); kn.position.y = -0.225; hp.add(kn);
    kn.add(mesh(new THREE.CapsuleGeometry(0.042, 0.15, 6, 12), M.trousers, [0, -0.1, 0]));
    const an = new THREE.Group(); an.position.y = -0.215; kn.add(an);
    an.add(mesh(rbox(0.082, 0.07, 0.15, 0.03, 3), M.boots, [0, -0.02, 0.03]));
    return { hp, kn, an };
  };
  const L = arm(1), R = arm(-1), LL = leg(1), RL = leg(-1);
  const hammer = new THREE.Group();
  hammer.add(mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.2, 8), M.handle, [0, 0, 0.08])).rotation.x = Math.PI / 2;
  hammer.add(mesh(rbox(0.03, 0.09, 0.03, 0.006), M.steel, [0, 0.01, 0.17]));
  hammer.position.set(0, -0.02, 0);
  const carry = new THREE.Group(); carry.position.set(0, 0.16, 0.2); spine.add(carry);
  return { root, hips, spine, neck, head, L, R, LL, RL, hammer, carry, meshes };
}

const POSE_KEYS = ['hipY', 'hipX', 'hipPitch', 'hipYaw', 'hipRoll', 'spPitch', 'spYaw', 'spRoll', 'hdPitch', 'hdYaw',
  'lShF', 'lShA', 'lEl', 'rShF', 'rShA', 'rEl', 'lHipF', 'lHipA', 'lKnee', 'lAnk', 'rHipF', 'rHipA', 'rKnee', 'rAnk'];
const zeroPose = () => { const p = {}; POSE_KEYS.forEach((k) => (p[k] = 0)); return p; };
const lerpPose = (a, b, t, out) => { POSE_KEYS.forEach((k) => (out[k] = lerp(a[k], b[k], t))); return out; };
function standPose(t, breathe = 1) {
  const p = zeroPose(); const b = Math.sin(t * 1.6) * breathe;
  p.spPitch = 0.02 + b * 0.012; p.lShA = 0.08; p.rShA = 0.08; p.lEl = 0.15; p.rEl = 0.15; p.lKnee = 0.04; p.rKnee = 0.04;
  p.hipY = -0.004; p.lShF = 0.03 + b * 0.01; p.rShF = 0.03 + b * 0.01; return p;
}
const carryArms = () => ({ lShF: 0.62, rShF: 0.62, lShA: 0.16, rShA: 0.16, lEl: 1.05, rEl: 1.05 });
function walkPose(ph, amp, carry, t) {
  const p = standPose(t, 0.5); const s = Math.sin(ph), c = Math.cos(ph);
  const A = (carry ? 0.32 : 0.42) * amp;
  p.lHipF = A * s; p.rHipF = -A * s;
  p.lKnee = 0.06 + amp * 0.7 * Math.pow(Math.max(0, Math.cos(ph - 0.25)), 1.6);
  p.rKnee = 0.06 + amp * 0.7 * Math.pow(Math.max(0, -Math.cos(ph - 0.25)), 1.6);
  p.lAnk = amp * 0.25 * Math.max(0, c); p.rAnk = amp * 0.25 * Math.max(0, -c);
  p.hipY = -0.012 * amp + (carry ? 0.018 : 0.013) * amp * Math.cos(2 * ph) - (carry ? 0.01 : 0);
  p.hipYaw = 0.1 * amp * s; p.spYaw = -0.13 * amp * s; p.hipRoll = 0.035 * amp * c; p.spRoll = -0.02 * amp * c;
  p.spPitch = carry ? -0.05 : 0.06 * amp; p.hdPitch = carry ? 0.08 : 0;
  if (carry) Object.assign(p, carryArms());
  else { p.lShF = -0.42 * amp * s; p.rShF = 0.42 * amp * s; p.lEl = 0.25 + 0.25 * amp * Math.max(0, -s); p.rEl = 0.25 + 0.25 * amp * Math.max(0, s); }
  return p;
}
function kneelPose(t) {
  const p = zeroPose(); const b = Math.sin(t * 1.5);
  p.hipY = -0.205; p.hipPitch = 0.1; p.lHipF = 1.45; p.lKnee = 1.5; p.lAnk = -0.05; p.rHipF = -0.12; p.rKnee = 1.62; p.rAnk = 0.6;
  p.lHipA = 0.08; p.rHipA = -0.04;
  p.spPitch = 0.42 + b * 0.01; p.hdPitch = 0.15; p.lShF = 0.95; p.lShA = 0.15; p.lEl = 0.5; p.rShF = 0.75; p.rShA = 0.1; p.rEl = 0.9; return p;
}
function sitPose(t, breathe) {
  const p = zeroPose(); const b = Math.sin(t * 1.1) * breathe;
  p.hipY = -0.43; p.lHipF = 1.42; p.rHipF = 1.5; p.lHipA = 0.1; p.rHipA = 0.14;
  p.lKnee = 1.2; p.rKnee = 1.32;
  p.spPitch = 0.16 + b * 0.008; p.hdPitch = -0.06; p.hdYaw = 0.1;
  // forearms resting on the knees, looking across the gap
  p.lShF = 0.42; p.rShF = 0.38; p.lShA = 0.16; p.rShA = 0.2; p.lEl = 1.05; p.rEl = 1.12; return p;
}

function applyPose(B, p) {
  B.hips.position.y = HIP_H + p.hipY; B.hips.position.z = p.hipX;
  B.hips.rotation.set(p.hipPitch, p.hipYaw, p.hipRoll, 'YXZ');
  B.spine.rotation.set(p.spPitch, p.spYaw, p.spRoll, 'YXZ');
  B.head.rotation.set(p.hdPitch, p.hdYaw, 0, 'YXZ');
  B.L.sh.rotation.set(-p.lShF, 0, p.lShA); B.L.el.rotation.x = -p.lEl;
  B.R.sh.rotation.set(-p.rShF, 0, -p.rShA); B.R.el.rotation.x = -p.rEl;
  B.LL.hp.rotation.set(-p.lHipF, 0, p.lHipA); B.LL.kn.rotation.x = p.lKnee; B.LL.an.rotation.x = -p.lKnee + p.lHipF + p.lAnk;
  B.RL.hp.rotation.set(-p.rHipF, 0, -p.rHipA); B.RL.kn.rotation.x = p.rKnee; B.RL.an.rotation.x = -p.rKnee + p.rHipF + p.rAnk;
}

// shared GLSL value noise
const NOISE_GLSL = `
float gwH3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gwN3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gwH3(i), gwH3(i + vec3(1,0,0)), f.x), mix(gwH3(i + vec3(0,1,0)), gwH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(gwH3(i + vec3(0,0,1)), gwH3(i + vec3(1,0,1)), f.x), mix(gwH3(i + vec3(0,1,1)), gwH3(i + vec3(1,1,1)), f.x), f.y), f.z); }`;

// the sea of mist: one function shared by the mist floor, the cliffs and the trees, so rock dissolves seamlessly into cloud
const mistGLSL = (oct) => `
#define GW_OCT ${oct}
uniform vec3 uDeep, uMistC, uFarC, uSunC, uSunD, uCamP, uGlowC; uniform float uMT, uFocusD, uGlow, uSpan; uniform vec2 uMistY;
float gwFbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < GW_OCT; i++) { s += a * gwN3(vec3(p, uMT * 0.035 + float(i) * 3.7)); p = p * 2.07 + 1.3; a *= 0.5; } return s; }
vec3 gwMist(vec3 wp){
  vec2 d = wp.xz - uCamP.xz; float dist = max(length(d), 1e-3);
  float n = gwFbm(wp.xz * 0.085 + vec2(uMT * 0.012, uMT * 0.005));
  float bill = smoothstep(0.34, 0.74, n);
  float rd = dist / uFocusD; float mid = smoothstep(0.12, 0.8, rd), far = max(smoothstep(0.95, 3.2, rd), smoothstep(22.0, 40.0, dist)); // fully hazed before the first ridge, so no seam
  vec3 c = mix(uDeep, uMistC, clamp(0.1 + 0.3 * mid + 0.55 * bill * (1.0 - 0.3 * mid), 0.0, 1.0));
  vec2 sd = normalize(uSunD.xz + 1e-5); float sg = pow(max(dot(d / dist, sd), 0.0), 6.0) * mid;
  c += uSunC * sg * (0.18 + 0.4 * bill);
  c += uSunC * pow(max(dot(d / dist, sd), 0.0), 2.0) * 0.1 * mid; // broad dawn-side light for depth
  c = mix(c, uFarC, far);
  // warm light spilling down from the lit bridge onto the mist (evening and finish)
  vec2 q = vec2(wp.x - clamp(wp.x, 0.0, uSpan), wp.z);
  return c + uGlowC * uGlow * exp(-dot(q, q) * 0.12) * (0.55 + 0.45 * bill);
}
float gwMistAmt(float y){ return 1.0 - smoothstep(uMistY.x, uMistY.y, y); }`;

// =====================================================================
export default {
  id: 'bridge',
  title: 'The Bridge',
  blurb: 'A small builder lays a timber bridge between two misty headlands, one plank per stretch of focus, from clear blue dawn to a gold evening.',
  mount(canvas, { reduceMotion = false, quality = 'high', fps = 0, maxDpr = 0 } = {}) {
    const HIGH = quality !== 'low';
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    const DPR = Math.min(window.devicePixelRatio || 1, maxDpr > 0 ? maxDpr : HIGH ? 2 : 1.25);
    renderer.setPixelRatio(DPR);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = HIGH; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(renderer), 0.04); scene.environment = envRT.texture;
    scene.fog = new THREE.Fog(0x8296a3, 9, 85);
    const camera = new THREE.PerspectiveCamera(40, 390 / 844, 0.1, 1400);

    // post: bloom on the sun and lanterns (high tier only)
    let composer = null, bloom = null;
    if (HIGH) {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.6, 1.35);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }

    const disposables = [];
    const track = (o) => { disposables.push(o); return o; };

    // ---- sky ----
    const skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(1, 0.05, -0.2).normalize() }, uSunAmt: { value: 1 } };
    const sky = new THREE.Mesh(track(new THREE.SphereGeometry(600, 32, 20)), track(new THREE.ShaderMaterial({
      uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p; gl_Position.z = p.w * 0.99999; }',
      fragmentShader: `uniform vec3 uTop,uMid,uHor,uSun,uFog,uSunDir; uniform float uSunAmt; varying vec3 vDir;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.22, h)); col = mix(col, uTop, smoothstep(0.16, 0.62, h));
          col = mix(col, uFog, smoothstep(0.0, -0.08, h));
          vec3 sd3 = normalize(uSunDir); float sd = max(dot(d, sd3), 0.0);
          vec2 hd = normalize(d.xz + 1e-5); float az = max(dot(hd, normalize(sd3.xz)), 0.0);
          col += uSun * uSunAmt * (pow(sd, 6.0) * 0.32 + pow(sd, 60.0) * 0.6 + exp(-abs(h - 0.02) * 12.0) * pow(az, 5.0) * 0.36);
          col += uSun * uSunAmt * smoothstep(0.99955, 0.99975, sd) * 3.2;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 180.0; }`,
    })));
    sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);

    // ---- distant ridges: layered silhouettes on arcs around the valley ----
    const ridgeMats = [];
    const CX = SPAN * 0.5;
    const farC = new THREE.Color(); // one haze colour shared by the far mist, the ridge bases and the sky below the horizon (no seams)
    const ridgeDefs = [[42, 1.6, 3.5, 0.18, 0.09], [70, 4.0, 5.5, 0.4, 0.06], [110, 7.5, 9, 0.6, 0.04], [170, 13, 13, 0.76, 0.026], [260, 22, 19, 0.87, 0.016]];
    ridgeDefs.forEach(([R, base, amp, fogT, freq], li) => {
      const S = 160; const pos = [], at = [], idx = [];
      for (let i = 0; i <= S; i++) {
        const ph = lerp(-1.4, 2.6, i / S); const arc = ph * R;
        const top = base + amp * (0.55 + fbm1(arc * freq + li * 9.1, 5)) * (1 + 0.3 * Math.sin(arc * 0.015 + li));
        const x = CX + Math.cos(ph) * R, z = -Math.sin(ph) * R;
        pos.push(x, top, z, x, top - 2.0 - li * 1.5, z, x, MIST_Y, z, x, -40, z); at.push(0, 0.3, 1, 1);
      }
      for (let i = 0; i < S; i++) { const a = i * 4; for (let r = 0; r < 3; r++) idx.push(a + r, a + r + 1, a + r + 4, a + r + 4, a + r + 1, a + r + 5); }
      const g = track(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1)); g.setIndex(idx);
      const m = track(new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color() }, uMist: { value: farC } }, side: THREE.DoubleSide, fog: false, depthWrite: true,
        vertexShader: 'attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 uCol; uniform vec3 uMist; varying float vT; void main(){ gl_FragColor = vec4(mix(uCol, uMist, smoothstep(0.0, 1.0, vT)), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}' }));
      m.userData.fogT = fogT; ridgeMats.push(m);
      const mesh = new THREE.Mesh(g, m); mesh.renderOrder = -5 - li * 0.1; mesh.frustumCulled = false; scene.add(mesh);
    });

    // ---- sea of mist below the deck (stacked soft layers) ----
    const MIST_GLSL = mistGLSL(HIGH ? 4 : 2);
    const mistU = { uGlowC: { value: new THREE.Color('#ff9a3c') }, uGlow: { value: 0 }, uFocusD: { value: 12 }, uSpan: { value: SPAN }, uDeep: { value: new THREE.Color() }, uMistC: { value: new THREE.Color() }, uFarC: { value: farC }, uSunC: { value: new THREE.Color() }, uSunD: { value: new THREE.Vector3(1, 0, 0) }, uCamP: { value: new THREE.Vector3() }, uMT: { value: 0 }, uMistY: { value: new THREE.Vector2(-3.6, -0.35) } };
    const MIST_FLOOR_Y = MIST_Y;
    const mistFloor = new THREE.Mesh(track(new THREE.PlaneGeometry(420, 420).rotateX(-Math.PI / 2)), track(new THREE.ShaderMaterial({
      uniforms: mistU, fog: false,
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: NOISE_GLSL + MIST_GLSL + '\nvarying vec3 vW; void main(){ gl_FragColor = vec4(gwMist(vW), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    })));
    mistFloor.position.set(CX, MIST_FLOOR_Y, -20); mistFloor.renderOrder = -1; scene.add(mistFloor);
    // one faint drifting veil above the floor for parallax
    const veilTex = track(cloudTexture(61)); veilTex.repeat.set(10, 10);
    const veilMat = track(new THREE.MeshBasicMaterial({ map: veilTex, color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false, fog: true }));
    const veil = new THREE.Mesh(track(new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2)), veilMat); veil.position.set(CX, -1.25, -20); veil.renderOrder = 3; scene.add(veil);
    const injectMist = (sh) => {
      Object.assign(sh.uniforms, mistU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;').replace('#include <project_vertex>', '#include <project_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\nvGW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;\n#endif');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;' + NOISE_GLSL + MIST_GLSL)
        .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = mix(gl_FragColor.rgb, gwMist(vGW), gwMistAmt(vGW.y));\n#include <tonemapping_fragment>');
    };

    // ---- terrain (single merged mesh, stone grain + strata in the shader) ----
    const terrainMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 }));
    terrainMat.onBeforeCompile = (sh) => {
      injectMist(sh);
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          vec3 gwN = normalize(cross(dFdx(vGW), dFdy(vGW)));
          float upF = smoothstep(0.55, 0.9, abs(gwN.y));
          float strata = gwN3(vGW * vec3(0.9, 9.0, 0.9)) * 0.6 + gwN3(vGW * vec3(4.0, 30.0, 4.0)) * 0.4;
          float grain = gwN3(vGW * 6.0) * 0.5 + gwN3(vGW * 19.0) * 0.5;
          diffuseColor.rgb *= mix(0.68 + 0.55 * strata, 0.86 + 0.26 * grain, upF);
          float moss = smoothstep(0.36, 0.6, gwN3(vec3(vGW.xz * 0.7, 3.0)) * 0.7 + gwN3(vec3(vGW.xz * 2.6, 7.0)) * 0.3);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.72, 0.84, 0.52), moss * upF * step(-0.05, vGW.y));
          diffuseColor.rgb *= 0.62 + 0.38 * smoothstep(-3.5, -0.2, vGW.y);
          diffuseColor.rgb *= 1.0 - (1.0 - upF) * 0.25 * smoothstep(0.55, 0.8, gwN3(vec3(vGW.x * 3.0 + vGW.z * 3.0, vGW.y * 0.25, 1.0)));`);
    };
    const tparts = [];
    // the two hero headlands: long, narrow, sheer faces toward the gap
    tparts.push(mesa({ cx: -8.6, cz: 0.2, rx: 8.6, rz: 1.75, top: 0, bottom: -24, seed: 3, frontDir: 0 }));
    tparts.push(mesa({ cx: SPAN + 7.2, cz: -0.25, rx: 7.2, rz: 1.9, top: 0, bottom: -24, seed: 11, frontDir: Math.PI }));
    // lower shoulder under the near headland adds depth to the near wall
    tparts.push(mesa({ cx: -4.5, cz: 2.4, rx: 3.4, rz: 1.3, top: -1.3, bottom: -24, seed: 41, tint: 0.92 }));
    tparts.push(mesa({ cx: SPAN + 3.5, cz: -2.6, rx: 2.6, rz: 1.2, top: -1.0, bottom: -24, seed: 43, tint: 0.92 }));
    // mid-distance spires and headlands (aerial perspective handles their tone)
    // [bearing (rad, 0 = +x, toward -z), distance from the valley centre, rx, rz, top, seed]; kept off the portrait and desktop sight lines
    const bgDefs = [[0.05, 22, 2.6, 1.8, 0.6, 21], [-0.2, 36, 4, 2.6, 2.4, 27], [1.5, 19, 2.2, 1.6, -0.6, 33], [1.72, 31, 3.5, 2.4, 1.6, 37], [1.25, 48, 5, 3, 0.8, 45], [0.72, 62, 6, 3.5, -1.8, 47], [0.25, 55, 5, 3, 2.2, 49]]
      .map(([b, d, rx, rz, top, seed]) => [CX + Math.cos(b) * d, -Math.sin(b) * d, rx, rz, top, seed]);
    // sea stacks rising out of the mist in the gap: vertical scale and depth cues
    tparts.push(mesa({ cx: SPAN * 0.36, cz: -5.6, rx: 0.9, rz: 0.8, top: -2.4, bottom: -24, seed: 51, M: 26 }));
    tparts.push(mesa({ cx: SPAN * 0.66, cz: -4.4, rx: 1.1, rz: 0.95, top: -2.6, bottom: -24, seed: 53, M: 28 }));
    tparts.push(mesa({ cx: SPAN * 0.86, cz: 2.8, rx: 0.8, rz: 0.75, top: -2.3, bottom: -24, seed: 55, M: 24 }));
    tparts.push(mesa({ cx: SPAN * 0.12, cz: 3.4, rx: 1.0, rz: 0.9, top: -2.9, bottom: -24, seed: 57, M: 24 }));
    bgDefs.forEach(([x, z, rx, rz, top, seed]) => tparts.push(mesa({ cx: x, cz: z, rx, rz, top, bottom: -24, seed, tint: 0.95, M: 30 })));
    // rocks on the headland tops
    const rr = rng(99);
    for (let i = 0; i < 30; i++) {
      const far = i % 2 === 0; const x = far ? SPAN + 0.6 + rr() * 7 : -0.8 - rr() * 8; const z = (rr() - 0.5) * 2.6;
      if (Math.abs(z) < 0.85 && (far ? x < SPAN + 2.2 : x > -2.6)) continue;
      const g = new THREE.DodecahedronGeometry(0.06 + rr() * 0.14, 1);
      const p = g.attributes.position; for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (1 + (hash1(k + i * 7) - 0.5) * 0.3), p.getY(k), p.getZ(k) * (1 + (hash1(k * 3 + i) - 0.5) * 0.3));
      xf(g, [x, 0.02, z], [rr() * 3, rr() * 3, 0], [1, 0.55, 1]); tparts.push(prep(g, '#6c675f', 0.85 + rr() * 0.25));
    }
    // stone abutments
    [0, SPAN].forEach((x) => { const sx = x === 0 ? -1 : 1; [-0.45, 0, 0.45].forEach((z, i) => tparts.push(prep(xf(rbox(0.36, 0.26, 0.44, 0.05), [x + sx * 0.17, -0.12 + i * 0.005, z], [0, (i - 1) * 0.06, 0]), '#4d4943', 0.9 + i * 0.08))); });
    const terrain = new THREE.Mesh(track(mergeGeometries(tparts)), terrainMat); terrain.castShadow = true; terrain.receiveShadow = true; scene.add(terrain);
    tparts.forEach((g) => g.dispose());

    // ---- vegetation (smooth, one mesh) ----
    const vparts = [];
    // near headland: a stand of cypresses behind the work area, umbrella pine on the lip
    vparts.push(...cypress(-2.8, 0, -0.95, 2.2, 1), ...cypress(-3.35, 0, -0.7, 1.7, 2), ...cypress(-5.6, 0, 0.9, 2.5, 3), ...cypress(-6.2, 0, 1.1, 1.8, 4), ...cypress(-9.5, 0, -0.6, 2.4, 5));
    vparts.push(...umbrellaPine(-2.1, 0, -1.25, 1.9, 6, 0.35));
    // far headland: the destination grove
    vparts.push(...umbrellaPine(SPAN + 2.5, 0, 1.15, 2.3, 7, -0.2), ...cypress(SPAN + 3.4, 0, 0.95, 2.6, 8), ...cypress(SPAN + 3.9, 0, 1.25, 1.9, 9), ...cypress(SPAN + 6.5, 0, -0.9, 2.8, 10), ...cypress(SPAN + 7.1, 0, -0.5, 2.0, 11));
    vparts.push(shrub(SPAN * 0.66, -2.6, -4.3, 0.35, 21));
    { const [ax, az, , , at] = bgDefs[0]; const [bx, bz, , , bt] = bgDefs[2]; vparts.push(...umbrellaPine(ax + 0.3, at, az - 0.2, 1.8, 12, 0.2), ...cypress(bx + 0.4, bt, bz, 2.0, 13), ...cypress(bx - 0.3, bt, bz + 0.5, 1.5, 14)); }
    const vr = rng(5);
    for (let i = 0; i < 16; i++) { const far = i % 2; const x = far ? SPAN + 1 + vr() * 6.5 : -1.2 - vr() * 8; const z = (vr() < 0.5 ? -1 : 1) * (0.75 + vr() * 0.7); vparts.push(shrub(x, 0, z, 0.12 + vr() * 0.16, 30 + i)); }
    const vegMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.35 }));
    vegMat.onBeforeCompile = injectMist;
    const veg = new THREE.Mesh(track(mergeGeometries(vparts)), vegMat); veg.castShadow = true; veg.receiveShadow = true; scene.add(veg);
    vparts.forEach((g) => g.dispose());
    // grass tufts (instanced)
    const tuftGeo = track(grassTuft(3));
    const TUFTS = HIGH ? 160 : 50; const tufts = new THREE.InstancedMesh(tuftGeo, vegMat, TUFTS); tufts.receiveShadow = true;
    { const tr = rng(77); const d = new THREE.Object3D(); let n = 0;
      while (n < TUFTS) { const far = n % 2; const x = far ? SPAN + 0.4 + tr() * 6 : -0.4 - tr() * 7; const z = (tr() - 0.5) * 2.9; if (Math.abs(z) < 0.7 && Math.abs(far ? x - SPAN : x) < 2.2) continue; d.position.set(x, 0, z); d.rotation.set(0, tr() * 6, 0); d.scale.setScalar(0.7 + tr() * 0.8); d.updateMatrix(); tufts.setMatrixAt(n++, d.matrix); } }
    scene.add(tufts);

    // ---- materials ----
    const woodTex = track(woodTexture());
    const goldMat = track(new THREE.MeshStandardMaterial({ color: '#FBC159', metalness: 1, roughness: 0.42, envMapIntensity: 0.7 }));
    const woodMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, map: woodTex, roughness: 0.84, metalness: 0, envMapIntensity: 0.3 }));
    const ropeMat = track(new THREE.MeshStandardMaterial({ color: '#b39c78', roughness: 0.95, envMapIntensity: 0.3 }));
    const M = {
      jacket: track(new THREE.MeshStandardMaterial({ color: '#e9e3d8', roughness: 0.75, envMapIntensity: 0.4 })),
      trousers: track(new THREE.MeshStandardMaterial({ color: '#2b3036', roughness: 0.85, envMapIntensity: 0.3 })),
      boots: track(new THREE.MeshStandardMaterial({ color: '#4a3324', roughness: 0.6 })),
      leather: track(new THREE.MeshStandardMaterial({ color: '#6c4a31', roughness: 0.6 })),
      satchel: track(new THREE.MeshStandardMaterial({ color: '#8a7a62', roughness: 0.9 })),
      skin: track(new THREE.MeshStandardMaterial({ color: '#b88262', roughness: 0.6 })),
      hair: track(new THREE.MeshStandardMaterial({ color: '#2a1f19', roughness: 0.8 })),
      hat: track(new THREE.MeshStandardMaterial({ color: '#FBC159', metalness: 0.0, roughness: 0.62, envMapIntensity: 0.45 })),
      handle: track(new THREE.MeshStandardMaterial({ color: '#8a6544', roughness: 0.7 })),
      steel: track(new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.85, roughness: 0.35 })),
    };

    // ---- near-cliff props: supply stack, crate, rope coil (wood, one mesh) ----
    const props = [];
    for (let i = 0; i < 6; i++) props.push(prepW(xf(rbox(0.33, 0.045, 1.12, 0.01), [-1.55 + (i % 2) * 0.02, 0.025 + i * 0.047, -0.95 + (i % 3) * 0.015], [0, (i % 2 ? 0.04 : -0.03) + Math.PI / 2, 0]), i % 2 ? '#8a6544' : '#7d5b3d'));
    props.push(prepW(xf(rbox(0.3, 0.26, 0.3, 0.02), [-2.15, 0.13, -0.62], [0, 0.3, 0]), '#6e5238'));
    props.push(prepW(xf(new THREE.TorusGeometry(0.11, 0.035, 8, 20), [-2.12, 0.3, -0.6], [Math.PI / 2, 0, 0]), '#b39b78'));
    const propMesh = new THREE.Mesh(track(mergeGeometries(props)), woodMat); propMesh.castShadow = true; propMesh.receiveShadow = true; scene.add(propMesh);

    // ---- contact shadows (soft occlusion blobs, one instanced mesh) ----
    const blobTex = track(radialTex([[0, 'rgba(0,0,0,0.6)'], [0.45, 'rgba(0,0,0,0.28)'], [1, 'rgba(0,0,0,0)']]));
    const blobMat = track(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, color: 0x0b0d10, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const blobSpots = [[0, 0, 0, 0.9, 0.5], [-1.55, 0.005, -0.95, 1.4, 0.7], [-2.15, 0.005, -0.62, 0.7, 0.7], [-2.8, 0.005, -0.95, 1.0, 1.0], [-3.35, 0.005, -0.7, 0.8, 0.8], [-2.0, 0.005, -1.25, 1.6, 1.6], [SPAN + 2.4, 0.005, 1.15, 1.9, 1.9], [SPAN + 3.4, 0.005, 0.95, 1.1, 1.1], [SPAN + 3.9, 0.005, 1.25, 0.9, 0.9], [-5.6, 0.005, 0.9, 1.1, 1.1], [SPAN + 6.5, 0.005, -0.9, 1.2, 1.2], [0, 0, 0, 1.4, 0.55]];
    const blobs = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), blobMat, blobSpots.length); blobs.renderOrder = 1;
    const dummy = new THREE.Object3D();
    blobSpots.forEach(([x, y, z, sx, sz], i) => { dummy.position.set(x, y + 0.006, z); dummy.scale.set(sx, 1, sz); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); blobs.setMatrixAt(i, dummy.matrix); });
    scene.add(blobs);

    // ---- bridge: panels ----
    const PG = panelGeoms(); track(PG.wood); track(PG.gold);
    const panels = new THREE.InstancedMesh(PG.wood, woodMat, N); panels.castShadow = true; panels.receiveShadow = true;
    const panelsGold = new THREE.InstancedMesh(PG.gold, goldMat, N); panelsGold.receiveShadow = true;
    const pr = rng(4); const ic = new THREE.Color();
    for (let i = 0; i < N; i++) { const k = 0.88 + pr() * 0.22; panels.setColorAt(i, ic.setRGB(k, k * (0.96 + pr() * 0.05), k * (0.93 + pr() * 0.07))); }
    scene.add(panels, panelsGold);
    // posts (k = 0..10 per side; gate posts at k = 0 and 10)
    const postGeo = track(prepW(xf(rbox(0.07, 0.68, 0.07, 0.015), [0, 0.2, 0]), '#6a4c34'));
    const capGeo = track(mergeGeometries([prep(xf(new THREE.SphereGeometry(0.032, 14, 10), [0, 0.57, 0]), '#fff'), prep(xf(new THREE.CylinderGeometry(0.042, 0.042, 0.03, 14), [0, 0.53, 0]), '#fff')]));
    const posts = []; for (let k = 0; k <= 10; k++) for (const s of [1, -1]) posts.push({ k, s, x: k * PITCH * POST_EVERY, gate: k === 0 || k === 10, scale: 0 });
    const postMesh = new THREE.InstancedMesh(postGeo, woodMat, posts.length); postMesh.castShadow = true; postMesh.receiveShadow = true;
    const capMesh = new THREE.InstancedMesh(capGeo, goldMat, posts.length);
    for (let i = 0; i < posts.length; i++) postMesh.setColorAt(i, ic.setRGB(1, 1, 1));
    scene.add(postMesh, capMesh);
    const ropeGeo = track(xf(new THREE.CylinderGeometry(0.011, 0.011, 1, 6, 1, true), [0, 0.5, 0]));
    const ropes = new THREE.InstancedMesh(ropeGeo, ropeMat, N * 4); ropes.castShadow = HIGH; scene.add(ropes);
    // lanterns
    const lanternGold = track(mergeGeometries([
      prep(xf(rbox(0.012, 0.012, 0.15, 0.004), [0, 0.5, 0.07]), '#fff'),
      prep(xf(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 4), [0, 0.475, 0.14]), '#fff'),
      prep(xf(new THREE.ConeGeometry(0.05, 0.04, 4), [0, 0.43, 0.14], [0, Math.PI / 4, 0]), '#fff'),
      prep(xf(rbox(0.07, 0.012, 0.07, 0.004), [0, 0.32, 0.14]), '#fff'),
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => prep(xf(new THREE.CylinderGeometry(0.004, 0.004, 0.09, 4), [a * 0.03, 0.365, 0.14 + b * 0.03]), '#fff')),
    ]));
    const glassGeo = track(xf(new THREE.BoxGeometry(0.052, 0.08, 0.052), [0, 0.37, 0.14]));
    const lanterns = [];
    posts.forEach((p, i) => { if (p.gate || (p.k % 2 === 0 && ((p.k / 2) % 2 === 1 ? p.s === 1 : p.s === -1))) lanterns.push({ post: i, x: p.x, s: p.s, lit: 0 }); });
    lanterns.sort((a, b) => a.x - b.x);
    const lanternMesh = new THREE.InstancedMesh(lanternGold, goldMat, lanterns.length); lanternMesh.castShadow = HIGH;
    const glassMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const glassMesh = new THREE.InstancedMesh(glassGeo, glassMat, lanterns.length);
    for (let i = 0; i < lanterns.length; i++) glassMesh.setColorAt(i, ic.set('#3a2c1e'));
    scene.add(lanternMesh, glassMesh);
    const glowTex = track(radialTex([[0, 'rgba(255,255,255,1)'], [0.16, 'rgba(255,232,196,0.55)'], [0.5, 'rgba(255,196,130,0.1)'], [1, 'rgba(255,190,120,0)']]));
    const glowGeo = track(new THREE.BufferGeometry());
    glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(lanterns.length * 3), 3));
    glowGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(lanterns.length * 3), 3));
    const glowMat = track(new THREE.PointsMaterial({ size: 1.3, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const glow = new THREE.Points(glowGeo, glowMat); glow.frustumCulled = false; glow.renderOrder = 5; scene.add(glow);
    const poolMat = track(new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    const pools = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2)), poolMat, lanterns.length); pools.renderOrder = 4; scene.add(pools);
    for (let i = 0; i < lanterns.length; i++) pools.setColorAt(i, ic.setRGB(0, 0, 0));
    const lampLights = [0.18, 0.5, 0.82].map((f) => { const l = new THREE.PointLight(0xffb15c, 0, 5, 2); l.position.set(SPAN * f, 0.9, 0); scene.add(l); return l; });

    // ---- sled with planks (towed along beside the builder) ----
    const sled = new THREE.Group();
    const sledGeo = track(mergeGeometries([
      prepW(xf(rbox(1.15, 0.03, 0.06, 0.012), [0, 0.015, -0.13]), '#5c4330'), prepW(xf(rbox(1.15, 0.03, 0.06, 0.012), [0, 0.015, 0.13]), '#5c4330'),
      prepW(xf(rbox(0.06, 0.04, 0.32, 0.01), [-0.45, 0.05, 0]), '#6a4c34'), prepW(xf(rbox(0.06, 0.04, 0.32, 0.01), [0.45, 0.05, 0]), '#6a4c34'),
      ...[0, 1, 2].map((i) => prepW(xf(rbox(1.12, 0.044, 0.33, 0.01), [0, 0.094 + i * 0.047, 0], [0, i * 0.02 - 0.02, 0]), i % 2 ? '#8a6544' : '#7d5b3d')),
    ]));
    const sledBase = new THREE.Mesh(sledGeo, woodMat); sledBase.castShadow = true; sledBase.receiveShadow = true; sled.add(sledBase);
    const sledTop = new THREE.Group(); sledTop.position.set(0, 0.235, 0); sledTop.rotation.y = Math.PI / 2; sled.add(sledTop);
    const mkPanel = () => { const g = new THREE.Group(); const a = new THREE.Mesh(PG.wood, woodMat), b = new THREE.Mesh(PG.gold, goldMat); a.castShadow = true; a.receiveShadow = true; g.add(a, b); return g; };
    const sledTopPanel = mkPanel(); sledTop.add(sledTopPanel);
    scene.add(sled);
    // the plank being fitted at the front (work in progress, never counted as built)
    const loosePanel = mkPanel(); loosePanel.visible = false; scene.add(loosePanel);

    // ---- builder ----
    const B = makeBuilder(M); scene.add(B.root);
    const carried = mkPanel(); carried.rotation.y = Math.PI / 2; carried.visible = false; B.carry.add(carried);
    B.R.hand.add(B.hammer); B.hammer.visible = false;
    const beltHammer = B.hammer.clone(); beltHammer.position.set(-0.11, -0.02, 0.02); beltHammer.rotation.set(Math.PI / 2 + 0.2, 0, 0); B.hips.add(beltHammer);

    // ---- birds: a few slow silhouettes over the far valley ----
    const BIRDS = HIGH && !reduceMotion ? 6 : 0;
    const birdGeo = track(new THREE.BufferGeometry());
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.05, -0.5, 0.22, -0.06, 0, 0, -0.08, 0, 0, 0.05, 0, 0, -0.08, 0.5, 0.22, -0.06], 3));
    birdGeo.computeVertexNormals();
    const birdMat = track(new THREE.MeshBasicMaterial({ color: 0x1b2026, side: THREE.DoubleSide, fog: true }));
    const birds = new THREE.InstancedMesh(birdGeo, birdMat, Math.max(1, BIRDS)); birds.visible = BIRDS > 0; birds.frustumCulled = false; scene.add(birds);

    // ---- particles: hammer dust + sunlit motes ----
    const DUST = reduceMotion ? 0 : HIGH ? 60 : 24; const dustTex = track(radialTex([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.4)'], [1, 'rgba(255,255,255,0)']]));
    const dustGeo = track(new THREE.BufferGeometry());
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(Math.max(1, DUST) * 3), 3));
    dustGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(Math.max(1, DUST) * 4), 4));
    const dust = new THREE.Points(dustGeo, track(new THREE.PointsMaterial({ size: 0.05, map: dustTex, vertexColors: true, transparent: true, depthWrite: false })));
    dust.frustumCulled = false; dust.visible = DUST > 0; scene.add(dust);
    const dustP = Array.from({ length: DUST }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3() }));
    let dustI = 0;
    const spawnDust = (x, y, z, n, spread = 0.5, up = 0.25) => {
      if (!DUST) return;
      for (let i = 0; i < n; i++) { const d = dustP[dustI++ % DUST]; d.life = d.max = 0.8 + Math.random() * 0.7; d.p.set(x + (Math.random() - 0.5) * 0.12, y + 0.01, z + (Math.random() - 0.5) * spread * 2); d.v.set((Math.random() - 0.5) * 0.25, up * (0.4 + Math.random()), (Math.random() - 0.5) * 0.3); }
    };
    const MOTES = reduceMotion ? 0 : HIGH ? 60 : 20; const moteGeo = track(new THREE.BufferGeometry());
    const moteBase = new Float32Array(Math.max(1, MOTES) * 3); const mr = rng(42);
    for (let i = 0; i < MOTES; i++) { moteBase[i * 3] = -3 + mr() * 6; moteBase[i * 3 + 1] = -1.0 + mr() * 3; moteBase[i * 3 + 2] = -2.5 + mr() * 5; }
    moteGeo.setAttribute('position', new THREE.Float32BufferAttribute(moteBase.slice(), 3));
    moteGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(Math.max(1, MOTES) * 3), 3));
    const motes = new THREE.Points(moteGeo, track(new THREE.PointsMaterial({ size: 0.04, map: dustTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    motes.frustumCulled = false; motes.visible = MOTES > 0; scene.add(motes);

    // ---- vignette + calm band for the clock ----
    const vigU = { uTopDark: { value: 0.42 }, uTopStart: { value: 0.55 }, uClock: { value: new THREE.Vector3(0.5, 0.76, 0.46) } };
    const vig = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), track(new THREE.ShaderMaterial({
      uniforms: vigU, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform float uTopDark, uTopStart; uniform vec3 uClock; varying vec2 vUv; void main(){ vec2 d = (vUv - vec2(0.5, 0.5)) * vec2(1.15, 1.0); float v = smoothstep(0.38, 0.9, length(d)); float top = smoothstep(uTopStart, 1.0, vUv.y) * uTopDark; float bot = smoothstep(0.24, 0.0, vUv.y) * 0.45; vec2 cd = (vUv - uClock.xy) * vec2(uClock.z, 1.0); float clk = (1.0 - smoothstep(0.0, 0.24, length(cd))) * 0.36; gl_FragColor = vec4(0.03, 0.035, 0.045, clamp(v * 0.45 + top + bot + clk, 0.0, 0.85)); }',
    })));
    vig.frustumCulled = false; vig.renderOrder = 100; scene.add(vig);

    // ---- lights ----
    const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.0); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.5); key.castShadow = HIGH;
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 60 });
    scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8); scene.add(rim, rim.target);

    // =================== state ===================
    // built: the number of planks that are in place. Pure function of progress (and 'done').
    let progress = 0, built = 0, phase = 'idle', started = false;
    let now = 0, wt = 0, tod = 0, frontS = 0, doneT0 = -1;
    const land = Array.from({ length: N }, () => ({ t0: -1e9, from: null, fromQ: null, dusted: true }));
    const loose = { on: false, t0: -1e9, from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), pos: new THREE.Vector3(), q: new THREE.Quaternion() };
    const clock = () => performance.now() / 1000; // wall clock: landings never lag, even at low frame rates
    const front = () => built * PITCH;
    const complete = () => built >= N;
    const swayA = reduceMotion ? 0 : 0.02;
    const deckPos = (x, z, out) => {
      let y = deckY(x), dz = 0, dy = 0;
      if (x > 0 && x < SPAN && swayA) {
        const reach = complete() ? Math.sin((Math.PI * x) / SPAN) : Math.pow(x / Math.max(front(), 0.3), 2) * Math.min(1, front() / 4);
        dz = swayA * reach * Math.sin(wt * 0.45); dy = swayA * 0.4 * reach * Math.sin(wt * 0.45 + 1.3);
      }
      return out.set(x, y + dy, z + dz);
    };
    const looseRest = (pos, q) => {
      const F = front(); const x = F + 0.07; deckPos(Math.max(0.001, F - 0.01), 0.03, pos); pos.x = x; pos.y += 0.028;
      q.setFromEuler(_e.set(0, 0.07, deckSlope(F) - 0.08)); return pos;
    };
    function setBuilt(nb, instant) {
      nb = clamp(Math.floor(nb), 0, N);
      if (nb < built) { built = nb; for (let i = nb; i < N; i++) land[i].t0 = -1e9; if (loose.on) loose.on = false; return; }
      if (instant) for (let i = 0; i < nb; i++) { land[i].t0 = -1e9; land[i].dusted = true; }
      if (nb === built) return;
      const count = nb - built; const stagger = Math.min(0.1, 0.35 / count); // a long catch-up still lands within ~0.8 s
      for (let i = built; i < nb; i++) {
        const L = land[i];
        if (instant || reduceMotion || !started) { L.t0 = -1e9; L.from = null; L.dusted = true; continue; }
        L.t0 = clock() + (i - built) * stagger; L.dusted = false; L.from = null;
        if (loose.on && i === built) { L.from = loose.pos.clone(); L.fromQ = loose.q.clone(); }
      }
      loose.on = false;
      built = nb;
      if (started && !instant) {
        // the builder notices: stop idling over a plank that is no longer there
        if (act && (act.kind === 'hammer' || act.kind === 'look')) { actT = act.dur; queue = []; }
      }
    }

    // ---- builder controller ----
    const bs = { x: -0.6, z: LANE, y: 0, h: Math.PI / 2, posture: 'stand', carrying: false, stride: 0, speed: 1 };
    let pose = standPose(0), snap = zeroPose(), blendT = 1, blendD = 0.25;
    let queue = [], act = null, actT = 0, loopCount = 0, lastStrike = -1, carryBlend = 1;
    const startAct = (a) => { act = a; actT = 0; snap = { ...pose }; blendT = 0; blendD = a.blend ?? 0.25; a.start && a.start(); };
    const hideHammer = () => ({ dur: 0, start() { B.hammer.visible = false; beltHammer.visible = true; }, update() { return pose; } });
    const camDir2 = new THREE.Vector2(-0.8, 0.5);
    const A = {
      walk(tx, tz, o = {}) {
        let sx, sz, dist, dur, h0, h1, dir;
        return { blend: 0.2, start() {
          sx = bs.x; sz = bs.z; dist = Math.hypot(tx - sx, tz - sz); const sp = o.carry ? 0.55 : 0.75; dur = Math.max(0.3, dist / sp + 0.2); h0 = bs.h;
          h1 = o.face ?? (dist > 1e-3 ? Math.atan2(tx - sx, tz - sz) : bs.h);
          // never turn toward the camera: side-step instead
          if (Math.sin(h1) * camDir2.x + Math.cos(h1) * camDir2.y > 0.1) h1 = Math.PI / 2;
          const fwd = Math.sin(h1) * (tx - sx) + Math.cos(h1) * (tz - sz); dir = fwd >= -1e-4 ? 1 : -1; this.dur = dur; },
          update(t) { const u = t / dur; const e = easeInOut(clamp(u)); const d = dist * e; bs.x = lerp(sx, tx, e); bs.z = lerp(sz, tz, e);
            bs.h = h0 + angDiff(h0, h1) * easeOut(clamp(u * 3)); const strideLen = o.carry ? 0.56 : 0.74; bs.stride = (d / strideLen) * Math.PI * 2 * dir;
            const amp = Math.min(1, u * 5, (1 - u) * 5, dist * 3 + 0.2); return walkPose(bs.stride, amp, !!o.carry, now); } };
      },
      turn(h1, carry) { let h0; return { dur: 0.6, start() { h0 = bs.h; }, update(t) { const u = t / 0.6; bs.h = h0 + angDiff(h0, h1) * easeInOut(clamp(u)); return walkPose(u * Math.PI * 2, 0.35 * Math.sin(Math.PI * u), !!carry, now); } }; },
      waitIdle() { return { dur: 5, update(t) { const p = standPose(now); p.lShF = 0.15; p.rShF = 0.15; p.lShA = 0.62; p.rShA = 0.62; p.lEl = 1.75; p.rEl = 1.75; const w = Math.sin(t * 0.9); p.hipRoll = 0.03 * w; p.hipY -= 0.005; p.lKnee = 0.05 + 0.08 * Math.max(0, w); p.rKnee = 0.05 + 0.08 * Math.max(0, -w); p.hdYaw = 0.35 * sstep(1.5, 2.3, t) * (1 - sstep(3.4, 4.2, t)); p.hdPitch = -0.05; return p; } }; },
      pickSide() {
        return { dur: 1.5, blend: 0.3,
          update(t) {
            const crouch = zeroPose(); Object.assign(crouch, { hipY: -0.17, hipPitch: 0.15, lHipF: 0.95, rHipF: 0.85, lKnee: 1.45, rKnee: 1.35, lAnk: -0.45, rAnk: -0.4, spPitch: 0.55, lShF: 1.0, rShF: 1.0, lShA: 0.22, rShA: 0.22, lEl: 0.3, rEl: 0.3, hdPitch: 0.2 });
            const upP = standPose(now); Object.assign(upP, carryArms()); upP.spPitch = -0.06; upP.hipY = -0.012;
            if (t > 0.62 && !bs.carrying) { bs.carrying = true; carried.visible = true; sledTopPanel.visible = false; carryBlend = 0; }
            if (t < 0.5) return lerpPose(standPose(now), crouch, easeInOut(t / 0.5), zeroPose());
            if (t < 0.7) return crouch;
            if (t < 1.25) { const u = easeInOut((t - 0.7) / 0.55); const p = lerpPose(crouch, upP, u, zeroPose()); p.hipY -= 0.02 * Math.sin(Math.PI * u); return p; }
            const u = (t - 1.25) / 0.25; const p = { ...upP }; p.hipY -= 0.018 * Math.sin(Math.PI * u); return p;
          } };
      },
      kneel(carry) { return { dur: 0.6, blend: 0.05, update(t) { const u = easeInOut(clamp(t / 0.55)); const p = lerpPose(carry ? Object.assign(standPose(now), carryArms()) : standPose(now), kneelPose(now), u, zeroPose()); p.hipY -= 0.015 * Math.sin(Math.PI * clamp(t / 0.6)); if (carry) Object.assign(p, { lShF: 0.75, rShF: 0.75, lShA: 0.16, rShA: 0.16, lEl: 0.9, rEl: 0.9 }); return p; }, end() { bs.posture = 'kneel'; } }; },
      lay() {
        return { dur: 0.9, update(t) {
          const p = kneelPose(now); const reach = Math.sin(Math.PI * clamp(t / 0.8));
          p.spPitch += 0.18 * reach; p.lShF = p.rShF = 0.75 + 0.6 * reach; p.lShA = p.rShA = 0.16; p.lEl = p.rEl = 0.9 - 0.6 * reach;
          if (t > 0.42 && bs.carrying) releaseToLoose();
          if (t > 0.6) { B.hammer.visible = true; beltHammer.visible = false; }
          return p; } };
      },
      hammer(n) {
        const cyc = 0.78; return { kind: 'hammer', dur: n * cyc + 0.35, start() { B.hammer.visible = true; beltHammer.visible = false; }, update(t) {
          const p = kneelPose(now); const k = Math.floor(t / cyc), u = (t % cyc) / cyc;
          let raise;
          if (k >= n) raise = 0.15;
          else if (u < 0.5) raise = 0.15 + 0.85 * easeInOut(u / 0.5);
          else if (u < 0.58) raise = 1 - easeIn((u - 0.5) / 0.08) * 1.05;
          else raise = -0.05 + 0.2 * easeOut((u - 0.58) / 0.42) - 0.08 * Math.sin(((u - 0.58) / 0.42) * Math.PI);
          if (k < n && u >= 0.58 && lastStrike !== k + loopCount * 100) { lastStrike = k + loopCount * 100; strike(); }
          p.rShF = 0.55 + 1.75 * raise; p.rEl = 0.45 + 1.05 * raise; p.rShA = 0.12;
          p.spPitch = 0.48 - 0.16 * raise; p.spYaw = -0.12 * raise; p.hdPitch = 0.22;
          p.lShF = 1.05; p.lEl = 0.55; return p; } };
      },
      look() { return { kind: 'look', dur: 2.6, update(t) { const p = kneelPose(now); p.spPitch = 0.12; p.hdPitch = -0.15 * sstep(0.3, 1.0, t) * (1 - sstep(2.0, 2.6, t)); p.hdYaw = -0.2 * sstep(0.5, 1.2, t) * (1 - sstep(2, 2.6, t)); p.rShF = 0.45; p.rEl = 0.6; p.lShF = 0.6; p.lEl = 0.9; return p; } }; },
      rise(carry) { return { dur: 0.6, update(t) { const u = clamp(t / 0.6); const k = kneelPose(now); k.spPitch += 0.1 * Math.sin(Math.PI * u); const s = standPose(now); if (carry) Object.assign(s, carryArms()); return lerpPose(k, s, easeInOut(u), zeroPose()); }, end() { bs.posture = 'stand'; } }; },
      sitDown() { let z0, y0; return { kind: 'sit', dur: 1.2, start() { z0 = bs.z; y0 = bs.y; }, update(t) { const u = easeInOut(clamp(t / 1.2)); bs.z = lerp(z0, SLED_Z, sstep(0.0, 0.6, t / 1.2)); bs.y = lerp(y0, SEAT_H, sstep(0.35, 0.95, t / 1.2)); const p = lerpPose(standPose(now), sitPose(now, 0), u, zeroPose()); p.spPitch += 0.3 * Math.sin(Math.PI * u); return p; }, end() { bs.posture = 'sit'; } }; },
      sitLoop() { return { dur: 6, update() { return sitPose(now, phase === 'paused' ? 0.6 : 1); } }; },
      sitUp() { let z0, y0; return { kind: 'sit', dur: 1.0, start() { z0 = bs.z; y0 = bs.y; }, update(t) { const u = easeInOut(clamp(t / 1.0)); bs.y = lerp(y0, 0, sstep(0.0, 0.6, t)); bs.z = lerp(z0, LANE, sstep(0.3, 1.0, t)); const p = lerpPose(sitPose(now, 0), standPose(now), u, zeroPose()); p.spPitch += 0.3 * Math.sin(Math.PI * u); return p; }, end() { bs.posture = 'stand'; bs.y = 0; bs.z = LANE; } }; },
      lookOut() { return { dur: 6, update(t) { const p = standPose(now); p.hdPitch = -0.12; p.lShF = 0.0; p.rShF = 0.0; p.lShA = 0.1; p.rShA = 0.1; const w = Math.sin(t * 0.6); p.hipRoll = 0.025 * w; p.lKnee = 0.05 + 0.06 * Math.max(0, w); p.hdYaw = 0.12 * Math.sin(t * 0.4); return p; } }; },
      fn(f) { return { dur: 0, start: f, update() { return pose; } }; },
    };
    const sledPos = new THREE.Vector3(); let sledX = -1.0;
    const strike = () => { const x = front() + 0.04; spawnDust(x, deckY(x) + 0.03, 0.05, 4, 0.12, 0.35); };
    const _wp = new THREE.Vector3(), _wq = new THREE.Quaternion();
    function releaseToLoose() {
      bs.carrying = false; carried.visible = false; sledTopPanel.visible = true;
      if (complete()) return;
      carried.getWorldPosition(_wp); carried.getWorldQuaternion(_wq);
      loose.on = true; loose.t0 = clock(); loose.from.copy(_wp); loose.fromQ.copy(_wq);
    }
    const sitSpotX = () => sledX + 0.45;

    function plan() {
      const F = front(); const q = []; const kx = F - KNEEL_BACK;
      const near = (x, z = LANE) => Math.abs(bs.x - x) < 0.05 && Math.abs(bs.z - z) < 0.05;
      if (phase === 'paused') {
        if (bs.posture === 'sit') { queue = [A.sitLoop()]; return; }
        if (bs.carrying) { if (bs.posture !== 'kneel') { if (!near(kx)) q.push(A.walk(kx, LANE, { carry: true, face: Math.PI / 2 })); q.push(A.kneel(true)); } q.push(A.lay()); queue = q; return; }
        if (bs.posture === 'kneel') q.push(A.rise());
        q.push(hideHammer());
        const sx = sitSpotX(); if (!near(sx)) q.push(A.walk(sx, LANE, { face: Math.PI / 2 }));
        q.push(A.turn(Math.PI / 2), A.sitDown(), A.sitLoop()); queue = q; return;
      }
      if (bs.posture === 'sit') { queue = [A.sitUp()]; return; }
      if (phase === 'done' || (phase === 'building' && complete())) {
        if (bs.carrying) { bs.carrying = false; carried.visible = false; sledTopPanel.visible = true; }
        if (bs.posture === 'kneel') q.push(A.rise());
        q.push(hideHammer());
        if (!near(SPAN + 1.0, 0.02)) q.push(A.walk(SPAN + 1.0, 0.02, { face: Math.PI / 2 }));
        q.push(A.turn(Math.PI / 2 - 0.2), A.lookOut()); queue = q; return;
      }
      if (phase === 'idle') {
        if (bs.posture === 'kneel') q.push(A.rise());
        if (bs.carrying) { bs.carrying = false; carried.visible = false; sledTopPanel.visible = true; }
        q.push(hideHammer());
        if (!near(Math.max(-0.6, kx))) q.push(A.walk(Math.max(-0.6, kx), LANE, { face: Math.PI / 2 }));
        q.push(A.waitIdle()); queue = q; return;
      }
      // building
      if (bs.carrying) {
        if (bs.posture === 'kneel' && !near(kx)) q.push(A.rise(true));
        if (bs.posture !== 'kneel' || !near(kx)) { if (!near(kx)) q.push(A.walk(kx, LANE, { carry: true, face: Math.PI / 2 })); q.push(A.kneel(true)); }
        q.push(A.lay(), A.hammer(2)); queue = q; return;
      }
      if (!loose.on) {
        if (bs.posture === 'kneel') q.push(A.rise());
        q.push(hideHammer());
        if (!near(kx)) q.push(A.walk(kx, LANE, { face: Math.PI / 2 }));
        q.push(A.turn(Math.PI), A.pickSide(), A.turn(Math.PI / 2, true), A.kneel(true), A.lay(), A.hammer(2)); queue = q; return;
      }
      if (bs.posture !== 'kneel' || !near(kx)) {
        if (bs.posture === 'kneel') q.push(A.rise());
        if (!near(kx)) q.push(A.walk(kx, LANE, { face: Math.PI / 2 }));
        q.push(A.kneel(false));
      }
      loopCount++;
      q.push(loopCount % 4 === 0 ? A.look() : A.hammer(3)); queue = q;
    }

    // place everything in the right state immediately (first frame, or setProgress(..., { instant }))
    function snapState() {
      const F = front(); sledX = Math.max(-1.0, F - SLED_BACK);
      queue = []; act = null; bs.carrying = false; carried.visible = false; sledTopPanel.visible = true; bs.y = 0;
      B.hammer.visible = false; beltHammer.visible = true;
      if (phase === 'paused') { bs.x = sitSpotX(); bs.z = SLED_Z; bs.y = SEAT_H; bs.h = Math.PI / 2; bs.posture = 'sit'; pose = sitPose(now, 0); }
      else if (phase === 'done' || complete()) { bs.x = SPAN + 1.0; bs.z = 0.02; bs.h = Math.PI / 2 - 0.2; bs.posture = 'stand'; pose = standPose(now); }
      else if (phase === 'building') { bs.x = F - KNEEL_BACK; bs.z = LANE; bs.h = Math.PI / 2; bs.posture = 'kneel'; pose = kneelPose(now); loose.on = true; loose.t0 = -1e9; B.hammer.visible = true; beltHammer.visible = false; }
      else { bs.x = Math.max(-0.6, F - KNEEL_BACK); bs.z = LANE; bs.h = Math.PI / 2; bs.posture = 'stand'; pose = standPose(now); }
      frontS = F; tod = phase === 'done' ? 1 : progress;
      lanterns.forEach((L) => (L.lit = litTarget(L, -1)));
      camSnap = true;
    }

    // ---- camera: framing per phase and per screen shape ----
    let aspect = 390 / 844;
    const cam = { tx: 0, ty: 0, tz: 0, yaw: 0.5, pitch: 0.25, dist: 12, fov: 40, heroY: 0.6 };
    const want = { ...cam };
    let camSnap = true, driftT = 0;
    function framing() {
      const t = clamp((aspect - 0.55) / (1.6 - 0.55)); // 0 = tall phone, 1 = wide desktop
      want.fov = lerp(40, 30, t);
      want.yaw = lerp(0.5, 0.95, t);
      want.pitch = lerp(0.46, 0.3, t);
      want.heroY = lerp(0.6, 0.63, t);
      const size = lerp(0.135, 0.125, t); // builder height as a share of screen height
      want.dist = 1.05 / (2 * Math.tan(THREE.MathUtils.degToRad(want.fov) / 2) * size);
      const F = frontS;
      if (phase === 'paused') {
        const p = B.root.position; want.tx = p.x + 0.15; want.ty = p.y + 0.42; want.tz = p.z; want.dist *= 0.68; want.pitch += 0.02; want.heroY = lerp(0.6, 0.62, t);
      } else if (phase === 'done') {
        const u = doneT0 < 0 ? 1 : easeInOut(clamp((now - doneT0) / 4.5));
        want.tx = lerp(F + 0.2, SPAN * lerp(0.6, 0.56, t), u); want.ty = lerp(deckY(F) + 0.45, 0.2, u); want.tz = lerp(0, -0.3, u);
        want.dist = lerp(want.dist, lerp(33, 19, t), u); want.yaw = lerp(want.yaw, lerp(0.52, 1.0, t), u); want.pitch = lerp(want.pitch, lerp(0.25, 0.22, t), u);
      } else {
        const fx = Math.max(-0.3, F); want.tx = fx + 0.25; want.ty = deckY(fx) + 0.45; want.tz = 0;
      }
    }

    // ---- update ----
    const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
    const pA = new THREE.Vector3(), pB = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const viewDir = new THREE.Vector3(), rightDir = new THREE.Vector3();
    function litTarget(L, j) {
      const p = posts[L.post]; const builtPost = p.gate || built >= p.k * POST_EVERY;
      if (!builtPost) return 0;
      if (phase === 'done' && doneT0 >= 0 && j >= 0) { const tl = now - doneT0 - 1.2 - j * 0.16; return tl > 0 ? Math.min(1, tl * 4) * (1 + 0.5 * Math.exp(-tl * 5)) : 0.0; }
      if (phase === 'done') return 1;
      return 0.55 * sstep(0.84, 0.97, progress); // lanterns come on as dusk arrives
    }
    function updateWorld(dt) {
      if (phase !== 'paused') tod = damp(tod, phase === 'done' ? 1 : progress, 0.8, dt);
      const T = tod;
      pal('skyTop', T, skyU.uTop.value); pal('skyMid', T, skyU.uMid.value); pal('horizon', T, skyU.uHor.value); pal('sun', T, skyU.uSun.value); pal('fog', T, skyU.uFog.value);
      // sun sits just right of the view, low: rises a little through the day then sinks into gold
      const yaw = cam.yaw; viewDir.set(Math.cos(yaw), 0, -Math.sin(yaw)); rightDir.set(Math.sin(yaw), 0, Math.cos(yaw));
      const tAsp = clamp((aspect - 0.55) / (1.6 - 0.55));
      const off = lerp(0.13, 0.36, tAsp); const elev = lerp(0.13, 0.085, T) + 0.05 * Math.sin(Math.PI * T);
      skyU.uSunDir.value.copy(viewDir).multiplyScalar(Math.cos(off)).addScaledVector(rightDir, Math.sin(off)).setY(elev).normalize();
      skyU.uSunAmt.value = lerp(0.8, 1.25, T);
      const fogC = pal('fog', T, tmpC); scene.fog.color.copy(fogC);
      const mistC = pal('mist', T, tmpC2);
      pal('mistLow', T, mistU.uDeep.value); mistU.uMistC.value.copy(mistC); mistU.uSunC.value.copy(skyU.uSun.value).multiplyScalar(lerp(0.35, 0.7, T));
      farC.copy(fogC).lerp(mistC, 0.14).multiplyScalar(0.82); skyU.uFog.value.copy(farC); mistU.uFocusD.value = Math.max(6, cam.dist * Math.cos(cam.pitch));
      { let g = 0; lanterns.forEach((L) => (g += L.lit)); mistU.uGlow.value = 0.32 * g / lanterns.length; }
      mistU.uSunD.value.copy(skyU.uSunDir.value); mistU.uCamP.value.copy(camera.position);
      if (phase !== 'paused' && !reduceMotion) { mistU.uMT.value += dt; veilTex.offset.x += 0.0016 * dt; veilTex.offset.y += 0.0007 * dt; }
      veilMat.color.copy(mistC);
      ridgeMats.forEach((m) => { pal('ridge', T, m.uniforms.uCol.value).lerp(_cB.copy(farC).lerp(skyU.uHor.value, 0.3), m.userData.fogT * 0.9); });
      // lights: key from the side-front of the sun so tops catch warm light and faces stay cool
      pal('key', T, key.color); key.intensity = lerp(2.4, 3.1, T);
      pal('hemiSky', T, hemi.color); pal('hemiGround', T, hemi.groundColor); hemi.intensity = lerp(1.0, 0.85, T);
      rim.color.copy(skyU.uSun.value); rim.intensity = lerp(0.9, 1.8, T);
      renderer.toneMappingExposure = lerp(1.05, 1.0, T);
      const tg = _v.set(cam.tx, cam.ty, cam.tz);
      const kd = _s.copy(viewDir).multiplyScalar(0.45).addScaledVector(rightDir, 0.8).normalize();
      key.position.set(tg.x + kd.x * 8, tg.y + 7.5, tg.z + kd.z * 8); key.target.position.copy(tg);
      const sc = clamp(cam.dist * 0.42, 4, 11); Object.assign(key.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc }); key.shadow.camera.updateProjectionMatrix();
      rim.position.set(tg.x + skyU.uSunDir.value.x * 10, tg.y + 3, tg.z + skyU.uSunDir.value.z * 10); rim.target.position.copy(tg);
      // motes around the work front
      if (MOTES) {
        const mp = moteGeo.attributes.position, mc = moteGeo.attributes.color; const sun = skyU.uSun.value;
        for (let i = 0; i < MOTES; i++) {
          const ph = i * 1.7; mp.setXYZ(i, moteBase[i * 3] + Math.sin(wt * 0.11 + ph) * 0.6 + frontS, moteBase[i * 3 + 1] + Math.sin(wt * 0.17 + ph * 2) * 0.3, moteBase[i * 3 + 2] + Math.cos(wt * 0.13 + ph) * 0.5);
          const a = (0.25 + 0.25 * Math.sin(wt * 0.8 + ph * 3)) * lerp(0.4, 0.9, T); mc.setXYZ(i, sun.r * a, sun.g * a, sun.b * a);
        }
        mp.needsUpdate = true; mc.needsUpdate = true;
      }
      // birds glide in a loose loop far over the valley
      if (BIRDS) {
        for (let i = 0; i < BIRDS; i++) {
          const a = wt * 0.035 + i * 0.22; const r = 9 + (i % 3) * 0.9;
          const x = CX + 10 + Math.cos(a) * r + Math.sin(i * 7.1) * 0.8, z = -10 + Math.sin(a) * r * 0.6 + Math.cos(i * 3.3), y = 3.4 + Math.sin(i * 2.7) * 0.6 + Math.sin(wt * 0.3 + i) * 0.15;
          const flap = Math.sin(wt * 5.5 + i * 1.9); const glide = 0.5 + 0.5 * Math.sin(wt * 0.4 + i);
          dummy.position.set(x, y, z); dummy.rotation.set(0, Math.atan2(-Math.sin(a) * r, Math.cos(a) * r * 0.6), 0);
          dummy.scale.set(0.42, 0.42 * lerp(flap, 0.35, glide), 0.42); dummy.updateMatrix(); birds.setMatrixAt(i, dummy.matrix);
        }
        birds.instanceMatrix.needsUpdate = true;
        birdMat.color.copy(pal('ridge', T, _cA)).lerp(fogC, 0.25);
      }
    }
    const _cA = new THREE.Color(), _cB = new THREE.Color();

    function updateBridge(dt) {
      const now = clock(); // built pieces animate on wall-clock time
      const D_LOOSE = 0.45, D_DROP = 0.4;
      for (let i = 0; i < N; i++) {
        const L = land[i]; const xc = (i + 0.5) * PITCH;
        if (i >= built || L.t0 > now) { dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.0001); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); panels.setMatrixAt(i, dummy.matrix); panelsGold.setMatrixAt(i, dummy.matrix); continue; }
        deckPos(xc, 0, pA); _q.setFromEuler(_e.set(0, 0, deckSlope(xc)));
        const t = now - L.t0; let settle = 0;
        if (L.from && t < D_LOOSE) { const e = easeInOut(clamp(t / D_LOOSE)); pB.copy(pA); pA.lerpVectors(L.from, pB, e); pA.y += 0.05 * Math.sin(Math.PI * e); const q1 = _q.clone(); _q.slerpQuaternions(L.fromQ, q1, e); }
        else if (!L.from && t < D_DROP) { const u = clamp(t / D_DROP); pA.y += (1 - easeOut(u)) * 0.32; }
        const tl = t - (L.from ? D_LOOSE : D_DROP);
        if (tl >= 0 && tl < 0.4) settle = -0.012 * Math.sin(clamp(tl / 0.25) * Math.PI);
        if (tl >= 0 && !L.dusted) { L.dusted = true; spawnDust(xc + PITCH * 0.4, deckY(xc), 0, 10, 0.55, 0.3); }
        pA.y += settle; dummy.position.copy(pA); dummy.quaternion.copy(_q); dummy.scale.setScalar(1); dummy.updateMatrix();
        panels.setMatrixAt(i, dummy.matrix); panelsGold.setMatrixAt(i, dummy.matrix);
      }
      panels.instanceMatrix.needsUpdate = true; panelsGold.instanceMatrix.needsUpdate = true;
      // the plank being fitted
      loosePanel.visible = loose.on && phase !== 'done';
      if (loose.on) {
        looseRest(loose.pos, loose.q); const u = reduceMotion ? 1 : easeOut(clamp((now - loose.t0) / 0.3));
        loosePanel.position.lerpVectors(loose.from, loose.pos, u); loosePanel.quaternion.slerpQuaternions(loose.fromQ, loose.q, u);
        if (u >= 1) { loosePanel.position.copy(loose.pos); loosePanel.quaternion.copy(loose.q); }
      }
      // posts: section k stands once plank 4k-1 is built
      posts.forEach((p, i) => {
        let s;
        if (p.gate) s = 1;
        else if (built < p.k * POST_EVERY) s = 0;
        else { const t0 = land[p.k * POST_EVERY - 1].t0 + 0.4; s = t0 < -1e8 ? 1 : now < t0 ? 0 : easeOutBack(clamp((now - t0) / 0.5), 1.8); }
        deckPos(p.x, p.s * POST_Z, pA); if (p.k === 0) pA.x -= 0.02; if (p.k === 10) pA.x += 0.02;
        dummy.position.copy(pA); dummy.rotation.set(0, 0, 0);
        const sw = s <= 0.001 ? 0.0001 : (p.gate ? 1.35 : 1); dummy.scale.set(sw, Math.max(0.0001, s) * (p.gate ? 1.3 : 1), sw); dummy.updateMatrix();
        postMesh.setMatrixAt(i, dummy.matrix); capMesh.setMatrixAt(i, dummy.matrix); p.scale = s;
      });
      postMesh.instanceMatrix.needsUpdate = true; capMesh.instanceMatrix.needsUpdate = true;
      // ropes: section k strung once its closing post stands
      const spanL = PITCH * POST_EVERY;
      for (let i = 0; i < N; i++) {
        const k = Math.floor(i / POST_EVERY); const sec = k + 1;
        const t0 = built >= sec * POST_EVERY ? land[sec * POST_EVERY - 1].t0 + 0.75 : null;
        for (let s = 0; s < 2; s++) for (let lv = 0; lv < 2; lv++) {
          const idx = i * 4 + s * 2 + lv; const side = s ? -1 : 1;
          const appear = t0 === null ? 0 : t0 < -1e8 ? 1 : clamp((now - t0 - (i % POST_EVERY) * 0.07) / 0.2);
          if (appear <= 0) { dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.0001); dummy.updateMatrix(); ropes.setMatrixAt(idx, dummy.matrix); continue; }
          const H = lv ? 0.56 : 0.31, sag = lv ? 0.085 : 0.05;
          const rh = (x) => { const u = (x - k * spanL) / spanL; return H - sag * 4 * u * (1 - u); };
          const xa = i * PITCH, xb = (i + 1) * PITCH;
          deckPos(xa, side * POST_Z, pA); pA.y += rh(xa); deckPos(xb, side * POST_Z, pB); pB.y += rh(xb);
          pB.lerpVectors(pA, pB, appear);
          const len = pA.distanceTo(pB); dummy.position.copy(pA); dummy.quaternion.setFromUnitVectors(up, _v.subVectors(pB, pA).normalize()); dummy.scale.set(1, len, 1); dummy.updateMatrix(); ropes.setMatrixAt(idx, dummy.matrix);
        }
      }
      ropes.instanceMatrix.needsUpdate = true;
      // lanterns
      const gp = glowGeo.attributes.position, gc = glowGeo.attributes.color; const lampSum = [0, 0, 0];
      lanterns.forEach((L, j) => {
        const p = posts[L.post]; const s = Math.max(0.0001, p.scale ?? 0);
        deckPos(p.x, p.s * POST_Z, pA); dummy.position.copy(pA); dummy.rotation.set(0, p.s > 0 ? 0 : Math.PI, 0);
        const gs = p.gate ? 1.3 : 1; dummy.scale.set(s, s * gs, s); dummy.updateMatrix();
        lanternMesh.setMatrixAt(j, dummy.matrix); glassMesh.setMatrixAt(j, dummy.matrix);
        if (phase !== 'paused') L.lit = damp(L.lit, litTarget(L, j), 6, dt);
        const fl = 1 + (reduceMotion ? 0 : 0.05 * Math.sin(wt * 9 + j * 3) * Math.sin(wt * 5.3 + j)); const b = L.lit * fl * (s > 0.5 ? 1 : 0);
        glassMesh.setColorAt(j, tmpC.set('#3a2c1e').lerp(tmpC2.setRGB(3.2, 2.0, 0.85), clamp(b)));
        _v.set(0, 0.37 * s * gs, 0.14 * s * p.s); gp.setXYZ(j, pA.x, pA.y + _v.y, pA.z + _v.z);
        gc.setXYZ(j, 0.9 * b, 0.56 * b, 0.26 * b);
        dummy.position.set(pA.x, pA.y + 0.012, pA.z - p.s * 0.2); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); pools.setMatrixAt(j, dummy.matrix);
        pools.setColorAt(j, tmpC.setRGB(0.5 * b, 0.3 * b, 0.12 * b));
        const li = Math.min(2, Math.floor((pA.x / SPAN) * 3)); lampSum[li] = Math.max(lampSum[li], b);
      });
      lampLights.forEach((l, i) => (l.intensity = lampSum[i] * 1.8));
      lanternMesh.instanceMatrix.needsUpdate = true; glassMesh.instanceMatrix.needsUpdate = true; glassMesh.instanceColor.needsUpdate = true;
      pools.instanceMatrix.needsUpdate = true; pools.instanceColor.needsUpdate = true; gp.needsUpdate = true; gc.needsUpdate = true;
      // sled follows the work front (stays put while the builder sits on it)
      if (bs.posture !== 'sit' && phase !== 'paused' && !(act && act.kind === 'sit')) sledX = damp(sledX, phase === 'idle' ? -1.0 : Math.max(-1.0, front() - SLED_BACK), 2.2, dt);
      deckPos(sledX, SLED_Z, sledPos); sled.position.copy(sledPos); sled.rotation.set(0, 0, deckSlope(sledX));
      sled.visible = !(phase === 'done' && complete());
      // contact shadows: builder (0) and sled (last)
      deckPos(bs.x, bs.z, pA); dummy.position.set(pA.x, pA.y + 0.008 + (bs.posture === 'sit' ? 0 : 0), pA.z); dummy.rotation.set(0, 0, deckSlope(bs.x)); dummy.scale.set(0.55, 1, 0.4); dummy.updateMatrix(); blobs.setMatrixAt(0, dummy.matrix);
      dummy.position.set(sledPos.x, sledPos.y + 0.008, sledPos.z); dummy.scale.set(sled.visible ? 1.45 : 0.0001, 1, 0.55); dummy.updateMatrix(); blobs.setMatrixAt(blobSpots.length - 1, dummy.matrix);
      blobs.instanceMatrix.needsUpdate = true;
      // dust
      if (DUST) {
        const dp = dustGeo.attributes.position, dc = dustGeo.attributes.color;
        for (let i = 0; i < DUST; i++) {
          const d = dustP[i];
          if (d.life > 0 && phase !== 'paused') { d.life -= dt; d.v.multiplyScalar(Math.exp(-2.2 * dt)); d.v.y -= 0.05 * dt; d.p.addScaledVector(d.v, dt); }
          if (d.life > 0) { const a = clamp(d.life / d.max) * 0.55; dp.setXYZ(i, d.p.x, d.p.y, d.p.z); dc.setXYZW(i, 0.86, 0.78, 0.66, a); } else dc.setXYZW(i, 0, 0, 0, 0);
        }
        dp.needsUpdate = true; dc.needsUpdate = true;
      }
    }

    function updateBuilder(dt) {
      // if the work front ran far ahead (fast progress), hurry
      const F = front();
      bs.speed = phase === 'building' && (F - KNEEL_BACK - bs.x) > 1.0 ? 1.8 : 1;
      const bdt = dt * bs.speed;
      if (!act || actT >= (act.dur ?? 0)) {
        if (act && act.end) act.end();
        if (!queue.length) plan();
        startAct(queue.shift());
      }
      actT += bdt; blendT += bdt;
      const tp = act.update(Math.min(actT, act.dur || 0));
      if (blendT < blendD) lerpPose(snap, tp, easeInOut(blendT / blendD), pose); else Object.assign(pose, tp);
      applyPose(B, pose);
      deckPos(bs.x, bs.z, B.root.position); B.root.position.y += bs.y;
      B.root.rotation.set(0, bs.h, 0);
      if (bs.posture !== 'sit' && bs.y === 0) B.root.rotation.z = 0;
      if (carried.visible) { carryBlend = Math.min(1, carryBlend + dt * 3); carried.position.set(0, 0.0, 0).lerp(_v.set(0, -0.2, 0.15), 1 - easeOut(carryBlend)); }
    }

    // ---- loop ----
    let raf = 0, last = performance.now(), disposed = false, W = 390, H = 844;
    const debug = /[?&]debug=1/.test(location.search);
    function applyCamera() {
      camera.fov = cam.fov; camera.aspect = aspect; camera.updateProjectionMatrix();
      // lens shift: put the hero at heroY (share of height from the top) without tilting the camera
      camera.projectionMatrix.elements[9] = 2 * cam.heroY - 1; camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      const dyaw = reduceMotion ? 0 : Math.sin(driftT * 0.11) * 0.025, dp = reduceMotion ? 0 : Math.sin(driftT * 0.083 + 1) * 0.01;
      const yaw = cam.yaw + dyaw, pitch = cam.pitch + dp;
      camera.position.set(cam.tx - Math.cos(pitch) * Math.cos(yaw) * cam.dist, cam.ty + Math.sin(pitch) * cam.dist, cam.tz + Math.cos(pitch) * Math.sin(yaw) * cam.dist);
      camera.lookAt(cam.tx, cam.ty, cam.tz);
      camDir2.set(-Math.cos(yaw), Math.sin(yaw));
    }
    function frame(_now, resumed) {
      if (disposed) return;
      const t = performance.now(); if (resumed) last = t - 1000 / 60; // after a rest: carry on from here, no catch-up
      const dt = Math.min(0.1, (t - last) / 1000); last = t;
      if (!started) { started = true; snapState(); }
      now += dt; if (phase !== 'paused') { wt += dt; if (!reduceMotion) driftT += dt; }
      frontS = camSnap ? front() : damp(frontS, front(), 1.6, dt);
      updateBuilder(dt);
      framing();
      const k = phase === 'done' ? 1.4 : phase === 'paused' ? 1.6 : 1.1;
      for (const key2 in want) cam[key2] = camSnap || reduceMotion ? want[key2] : damp(cam[key2], want[key2], k, dt);
      camSnap = false;
      applyCamera();
      updateWorld(dt); updateBridge(dt);
      sky.position.copy(camera.position);
      renderer.info.reset();
      if (warm) { if (composer) composer.render(dt); else renderer.render(scene, camera); }
      if (debug) window.__gwInfo = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, built, phase, progress };
    }
    // nothing is drawn until the shaders are compiled (the page shows its placeholder meanwhile)
    let warm = false;
    const pace = makePacer(fps, frame);
    const ready = warmUp(renderer, scene, camera).then(() => { warm = true; pace.poke(3); });
    pace.start();
    let sizedAt = '';

    return {
      ready,
      setProgress(p, opts = {}) {
        const v = clamp(+p || 0);
        if (v !== progress || opts.instant) pace.poke();
        progress = v;
        const nb = phase === 'done' ? N : Math.floor(progress * N + 1e-6);
        const jump = !!opts.instant;
        setBuilt(nb, jump);
        if (jump && started) snapState();
      },
      setPhase(ph) {
        if (ph === phase) return; const prev = phase; phase = ph;
        pace.restIn(ph === 'paused' ? PAUSE_REST : ph === 'done' ? DONE_REST : null);
        if (ph === 'done') { doneT0 = started ? now : -1; setBuilt(N, !started); }
        else { doneT0 = -1; if (prev === 'done') setBuilt(Math.floor(progress * N + 1e-6), true); }
        if (started) { queue = []; if (act && !bs.carrying && act.dur > 0.7 && !/sit/.test(act.kind || '')) actT = act.dur; }
      },
      // test hook: what is built and what is actually showing in place right now
      debugState() {
        const arr = panels.instanceMatrix.array; let shown = 0, settled = 0;
        for (let i = 0; i < N; i++) { const y = arr[i * 16 + 13]; if (y > -100) { shown++; if (Math.abs(y - deckY((i + 0.5) * PITCH)) < 0.03) settled++; } }
        return { built, shown, settled, phase, progress, calls: renderer.info.render.calls, wt, cam: { ...cam } };
      },
      resize(w, h) {
        // each resize reallocates the drawing buffers: skip calls that change nothing
        const key = Math.round(w) + 'x' + Math.round(h) + '@' + (window.devicePixelRatio || 1);
        if (key === sizedAt) return; sizedAt = key;
        pace.poke();
        W = w; H = h; aspect = w / h; renderer.setSize(w, h, false);
        const ta = clamp((aspect - 0.55) / (1.6 - 0.55)); vigU.uClock.value.set(0.5, lerp(0.76, 0.7, ta), aspect * 1.6); vigU.uTopStart.value = lerp(0.55, 0.5, ta);
        if (composer) { composer.setPixelRatio(DPR); composer.setSize(w, h); }
        camSnap = true;
      },
      // false while the page isn't showing the world (hidden tab, scrolled away): nothing is drawn
      setShown(v) { pace.show(v); },
      dispose() {
        disposed = true; pace.stop(); cancelAnimationFrame(raf);
        scene.traverse((o) => { if (o.isMesh || o.isPoints) { o.geometry?.dispose?.(); } });
        disposables.forEach((d) => d.dispose && d.dispose());
        Object.values(M).forEach((m) => m.dispose()); envRT.dispose(); pmrem.dispose();
        if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); bloom.dispose(); }
        renderer.dispose();
      },
    };
  },
};
