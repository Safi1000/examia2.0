// Copied from design-mockups/groundwork-3d/concept1.js by scripts/sync-groundwork-worlds.mjs.
// Edit the original there, then run: node scripts/sync-groundwork-worlds.mjs
/* eslint-disable */
// Groundwork focus timer, concept 1: "The Tower" (v2).
// A weathered stone tower rises course by course on a grounded, floating island of layered rock,
// moss and grass. A small mason (always seen from behind) climbs up through the hatch with each
// block, kneels, sets it and taps it home. Light moves from cool starlit dawn (p=0) to golden
// evening (p=1); at 'done' a gold lantern rises from the hatch and lights the top.
//
// Time is truth: block k is in place exactly when p >= (k+1)/49. Between setProgress calls the
// mason keeps working; a due block is never more than about a second from being home.
// setProgress(p, { instant: true }) jumps straight to the right tower. 'paused' freezes the scene.
// mount(canvas, { reduceMotion, quality: 'high' | 'low' }).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

// ---------- helpers
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eo = (t) => 1 - Math.pow(1 - t, 3);
const ei = (t) => t * t * t;
const smooth = (t) => t * t * (3 - 2 * t);
const wrapPi = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const ni = (g) => (g.index ? g.toNonIndexed() : g);
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
function merge(list, keepColor = false) {
  const gs = list.map(([g, m]) => {
    g = ni(g); if (m) g.applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', ...(keepColor ? ['color'] : [])].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const common = Object.keys(gs[0].attributes).filter((k) => gs.every((g) => g.attributes[k]));
  for (const g of gs) for (const k of Object.keys(g.attributes)) if (!common.includes(k)) g.deleteAttribute(k);
  return mergeGeometries(gs);
}
function paint(g, hex) { const c = new THREE.Color(hex); const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
// small value noise for geometry shaping (deterministic)
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = smooth(xf), v = smooth(yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
const fbm2 = (x, y) => 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.1 + 5.2, y * 2.1 + 1.3) + 0.15 * vnoise(x * 4.3 + 9.1, y * 4.3 + 7.7);

// GLSL noise shared by stone, sky and grass
const GLSL_NOISE = `
float h13(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float a=0.5,s=0.0; for(int k=0;k<4;k++){ s+=a*vn3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
`;

// ---------- tower constants
const N = 7, BASE = 2, COURSES = 7, TOTAL = N * COURSES; // 49 blocks
const H = 0.3, R_OUT = 1.0, R_IN = 0.68, R_MID = 0.84, DA = TAU / N;
const PLINTH = 0.24, A0 = 0.35;
const HATCH_R = 0.28, CURB_R = 0.345, CURB_H = 0.04, PLACE_R = 0.45;
const L1 = 0.21, L2 = 0.215, FOOT = 0.055;
const S = 1.3;                // mason scale (reads ~75-90 px tall on a phone)
const ISL_R = 2.16, ISL_D = 1.6; // island radius and rock depth
const GAP = 0.012;
const blockInfo = (i) => { const c = BASE + Math.floor(i / N), s = i % N; return { c, a: s * DA + (c % 2) * DA * 0.5 + A0, y: PLINTH + c * H }; };
const floorFor = (n) => PLINTH + (BASE + Math.floor(n / N)) * H;
const TOP_Y = PLINTH + (BASE + COURSES) * H;
const dueP = (k) => (k + 1) / TOTAL;                       // block k is set exactly when p >= (k+1)/N
const targetFor = (p) => Math.min(TOTAL, Math.floor(p * TOTAL + 1e-7));

function sectorGeo() {
  const bevel = 0.024;
  const shape = new THREE.Shape();
  const ri = R_IN + bevel, ro = R_OUT - bevel;
  const ang = DA / 2;
  const a0 = -ang + (GAP / 2 + bevel) / R_MID, a1 = ang - (GAP / 2 + bevel) / R_MID;
  const seg = 14;
  for (let k = 0; k <= seg; k++) { const t = a0 + (a1 - a0) * k / seg; const x = ro * Math.sin(t), y = ro * Math.cos(t); k ? shape.lineTo(x, y) : shape.moveTo(x, y); }
  for (let k = seg; k >= 0; k--) { const t = a0 + (a1 - a0) * k / seg; shape.lineTo(ri * Math.sin(t), ri * Math.cos(t)); }
  const depth = H - GAP - 2 * bevel;
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14, steps: 1 });
  g.rotateX(Math.PI / 2);
  g.translate(0, depth + bevel + GAP / 2, 0);
  g.computeVertexNormals();
  return g;
}

// ---------- builder rig
function makeBuilder(mats) {
  const add = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m; };
  const G = () => new THREE.Group();
  const rig = { root: G(), hips: G(), pelvis: G(), spine: G(), head: G(), shL: G(), shR: G(), elL: G(), elR: G(), handR: G(), hipL: G(), hipR: G(), knL: G(), knR: G(), anL: G(), anR: G() };
  const r = rig;
  r.root.scale.setScalar(S);
  r.root.add(r.hips); r.hips.add(r.pelvis); r.pelvis.add(r.spine);
  r.spine.position.y = 0.07;
  add(r.pelvis, merge([[new THREE.CapsuleGeometry(0.088, 0.05, 6, 16), M4(0, 0.035, 0, 0, 0, 0, 1.22, 1, 0.82)]]), mats.overall);
  add(r.pelvis, merge([[new THREE.CylinderGeometry(0.111, 0.111, 0.028, 24, 1, true), M4(0, 0.115, 0, 0, 0, 0, 1.0, 1, 0.75)], [new RoundedBoxGeometry(0.05, 0.07, 0.07, 2, 0.015), M4(0.108, 0.075, -0.01)]]), mats.leather);
  add(r.spine, merge([[new THREE.CapsuleGeometry(0.098, 0.1, 6, 18), M4(0, 0.12, 0, 0, 0, 0, 1.28, 1, 0.74)]]), mats.shirt);
  add(r.spine, merge([
    [new RoundedBoxGeometry(0.15, 0.13, 0.03, 2, 0.01), M4(0, 0.095, 0.064)],
    [new THREE.BoxGeometry(0.027, 0.2, 0.014), M4(-0.05, 0.13, -0.07, 0, 0, 0.12)],
    [new THREE.BoxGeometry(0.027, 0.2, 0.014), M4(0.05, 0.13, -0.07, 0, 0, -0.12)],
    [new THREE.BoxGeometry(0.027, 0.012, 0.15), M4(-0.062, 0.255, 0)],
    [new THREE.BoxGeometry(0.027, 0.012, 0.15), M4(0.062, 0.255, 0)],
  ]), mats.overall);
  add(r.spine, merge([[new THREE.CapsuleGeometry(0.036, 0.04, 4, 12), M4(0, 0.29, 0.005)]]), mats.skin);
  r.head.position.set(0, 0.315, 0.01); r.spine.add(r.head);
  add(r.head, merge([[new THREE.SphereGeometry(0.083, 24, 16), M4(0, 0.075, 0.005, 0, 0, 0, 0.95, 1.05, 1)], [new THREE.SphereGeometry(0.018, 8, 6), M4(-0.079, 0.07, 0)], [new THREE.SphereGeometry(0.018, 8, 6), M4(0.079, 0.07, 0)]]), mats.skin);
  add(r.head, merge([[new THREE.SphereGeometry(0.085, 20, 14), M4(0, 0.08, -0.016, 0, 0, 0, 0.98, 1, 1)]]), mats.hair);
  add(r.head, merge([
    [new THREE.SphereGeometry(0.096, 28, 12, 0, TAU, 0, Math.PI / 2), M4(0, 0.112, 0, 0, 0, 0, 1, 0.84, 1.08)],
    [new THREE.CylinderGeometry(0.106, 0.11, 0.012, 40), M4(0, 0.112, 0.014, 0, 0, 0, 1, 1, 1.14)],
    [new RoundedBoxGeometry(0.024, 0.026, 0.19, 2, 0.01), M4(0, 0.188, 0)],
  ]), mats.hat);
  const arm = (sh, el, side) => {
    sh.position.set(0.128 * side, 0.232, 0); r.spine.add(sh);
    add(sh, merge([[new THREE.CapsuleGeometry(0.035, 0.1, 4, 12), M4(0, -0.075, 0)]]), mats.shirt);
    el.position.y = -0.165; sh.add(el);
    add(el, merge([[new THREE.CapsuleGeometry(0.03, 0.09, 4, 12), M4(0, -0.07, 0)], [new THREE.SphereGeometry(0.036, 12, 10), M4(0, -0.155, 0.004, 0, 0, 0, 0.85, 1.1, 0.95)]]), mats.skin);
  };
  arm(r.shL, r.elL, -1); arm(r.shR, r.elR, 1);
  r.handR.position.y = -0.155; r.elR.add(r.handR);
  const leg = (hip, kn, an, side) => {
    hip.position.set(0.062 * side, 0, 0); r.hips.add(hip);
    add(hip, merge([[new THREE.CapsuleGeometry(0.048, L1 - 0.03, 4, 12), M4(0, -L1 / 2, 0)]]), mats.overall);
    kn.position.y = -L1; hip.add(kn);
    add(kn, merge([[new THREE.CapsuleGeometry(0.042, L2 - 0.03, 4, 12), M4(0, -L2 / 2, 0)]]), mats.overall);
    an.position.y = -L2; kn.add(an);
    add(an, new RoundedBoxGeometry(0.08, 0.062, 0.14, 2, 0.022).translate(0, -FOOT + 0.031, 0.026), mats.boot);
  };
  leg(r.hipL, r.knL, r.anL, -1); leg(r.hipR, r.knR, r.anR, 1);
  const hg = merge([
    [paint(ni(new THREE.CylinderGeometry(0.011, 0.012, 0.22, 10)), '#8a6744'), M4(0, 0, 0.08, Math.PI / 2)],
    [paint(ni(new RoundedBoxGeometry(0.034, 0.1, 0.036, 2, 0.008)), '#9da3a8'), M4(0, -0.012, 0.185)],
  ], true);
  rig.hammer = add(new THREE.Group(), hg, mats.hammer);
  rig.hammerTip = new THREE.Object3D(); rig.hammerTip.position.set(0, -0.06, 0.185); rig.hammer.add(rig.hammerTip);
  rig.holdHand = G(); rig.holdHand.rotation.x = 0.55; rig.handR.add(rig.holdHand);
  rig.holdBelt = G(); rig.holdBelt.position.set(0.125, 0.06, 0.02); rig.holdBelt.rotation.set(1.75, 0, 0.12); rig.pelvis.add(rig.holdBelt);
  rig.holdBelt.add(rig.hammer);
  rig.carry = G(); rig.carry.position.set(0, 0.1, 0.2); r.spine.add(rig.carry);
  return rig;
}
const KEYS = ['px', 'py', 'pz', 'yaw', 'lock', 'pY', 'pRx', 'pRy', 'pRz', 'sRx', 'sRy', 'sRz', 'hRx', 'hRy', 'hRz', 'lShX', 'lShZ', 'lElX', 'rShX', 'rShZ', 'rElX', 'lHipX', 'lHipZ', 'lKnX', 'lAnX', 'rHipX', 'rHipZ', 'rKnX', 'rAnX'];
const BODY = KEYS.filter((k) => !['px', 'py', 'pz', 'yaw'].includes(k));
const P0 = () => ({ px: 0, py: 0, pz: 0, yaw: 0, lock: 1, pY: 0, pRx: 0, pRy: 0, pRz: 0, sRx: 0.03, sRy: 0, sRz: 0, hRx: 0, hRy: 0, hRz: 0, lShX: 0.05, lShZ: 0.08, lElX: -0.18, rShX: 0.05, rShZ: 0.08, rElX: -0.18, lHipX: 0, lHipZ: 0.03, lKnX: 0.04, lAnX: -0.04, rHipX: 0, rHipZ: 0.03, rKnX: 0.04, rAnX: -0.04 });
const legReach = (h, k, z) => (L1 * Math.cos(h) + L2 * Math.cos(h + k)) * Math.cos(z) + FOOT;
function applyPose(r, P) {
  r.root.position.set(P.px, P.py, P.pz); r.root.rotation.y = P.yaw;
  const reach = Math.max(legReach(P.lHipX, P.lKnX, P.lHipZ), legReach(P.rHipX, P.rKnX, P.rHipZ));
  r.hips.position.y = P.lock * reach + P.pY;
  r.pelvis.rotation.set(P.pRx, P.pRy, P.pRz);
  r.spine.rotation.set(P.sRx, P.sRy, P.sRz);
  r.head.rotation.set(P.hRx, P.hRy, P.hRz, 'YXZ');
  r.shL.rotation.set(P.lShX, 0, -P.lShZ); r.elL.rotation.x = P.lElX;
  r.shR.rotation.set(P.rShX, 0, P.rShZ); r.elR.rotation.x = P.rElX;
  r.hipL.rotation.set(P.lHipX, 0, -P.lHipZ); r.knL.rotation.x = P.lKnX; r.anL.rotation.x = P.lAnX;
  r.hipR.rotation.set(P.rHipX, 0, P.rHipZ); r.knR.rotation.x = P.rKnX; r.anR.rotation.x = P.rAnX;
}
// --- poses (t = animation clock, frozen while paused)
function standPose(P, t) {
  const b = Math.sin(t * 1.7), w = Math.sin(t * 0.37);
  P.sRx = 0.03 + 0.012 * b; P.pY = -0.003 * b; P.lKnX = 0.05 + 0.04 * Math.max(0, w); P.rKnX = 0.1 - 0.04 * Math.max(0, w);
  P.lAnX = -P.lKnX; P.rAnX = -P.rKnX; P.pRz = 0.025 + 0.02 * w; P.sRz = -0.02 - 0.015 * w;
}
function carryArms(P, k = 1) {
  P.lShX = lerp(P.lShX, -0.42, k); P.rShX = lerp(P.rShX, -0.42, k);
  P.lElX = lerp(P.lElX, -1.45, k); P.rElX = lerp(P.rElX, -1.45, k);
  P.lShZ = lerp(P.lShZ, -0.03, k); P.rShZ = lerp(P.rShZ, -0.03, k);
  P.sRx -= 0.1 * k; P.hRx += 0.06 * k; P.pY -= 0.01 * k;
}
function walkPose(P, ph, carry, amp = 1) {
  const s = Math.sin(ph), c = Math.cos(ph), A = (0.42 - 0.12 * carry) * amp;
  P.lHipX = -A * s; P.rHipX = A * s;
  P.lKnX = 0.06 + 0.8 * amp * Math.pow(Math.max(0, c), 1.5);
  P.rKnX = 0.06 + 0.8 * amp * Math.pow(Math.max(0, -c), 1.5);
  P.lAnX = -(P.lHipX + P.lKnX) * 0.8; P.rAnX = -(P.rHipX + P.rKnX) * 0.8;
  P.pRy = 0.06 * s * amp; P.sRy = -0.09 * s * amp * (1 - 0.6 * carry); P.pRz = 0.03 * c * amp;
  P.pY = -0.004 - 0.01 * carry + (0.007 + 0.004 * carry) * Math.cos(2 * ph) * amp;
  P.sRx = lerp(0.06, 0.0, carry); P.hRx = 0.05 - 0.02 * Math.cos(2 * ph);
  P.lShX = 0.36 * s * amp; P.rShX = -0.36 * s * amp; P.lElX = -0.2 - 0.25 * Math.max(0, -s); P.rElX = -0.2 - 0.25 * Math.max(0, s); P.lShZ = P.rShZ = 0.07;
  if (carry > 0) carryArms(P, carry);
}
function climbPose(P, ph, carry) {
  const s = Math.sin(ph);
  P.lHipX = -0.55 - 0.5 * s; P.lKnX = 0.6 + 0.6 * s; P.rHipX = -0.55 + 0.5 * s; P.rKnX = 0.6 - 0.6 * s;
  P.lAnX = -(P.lHipX + P.lKnX) * 0.7; P.rAnX = -(P.rHipX + P.rKnX) * 0.7;
  P.sRx = 0.2; P.hRx = 0.0; P.pRy = 0.05 * s;
  P.lShX = -0.7 - 0.3 * s; P.rShX = -0.7 + 0.3 * s; P.lElX = P.rElX = -0.7;
  if (carry > 0) carryArms(P, carry);
}
// one knee down, the other leg planted out to the side so the kneel reads from behind
function kneelPose(P, t) {
  const b = Math.sin(t * 1.5);
  P.lock = 0; P.pY = 0.268 + 0.003 * b;
  P.lHipX = -0.1; P.lKnX = 1.62; P.lAnX = 0.42; P.lHipZ = 0.16;
  P.rHipX = -1.42; P.rKnX = 1.38; P.rAnX = 0.05; P.rHipZ = 0.55;
  P.pRz = -0.05; P.sRz = 0.04;
  P.sRx = 0.3 + 0.01 * b; P.hRx = 0.32;
  P.lShX = -0.8; P.lElX = -0.45; P.lShZ = -0.06;
  P.rShX = -0.45; P.rElX = -0.85; P.rShZ = 0.1;
}
function tapArm(P, u, str = 1) {
  let sh, el, lean;
  const up = lerp(-1.3, -2.4, str);
  if (u < 0.42) { const k = eio(u / 0.42); sh = lerp(-0.55, up, k); el = lerp(-0.7, -1.45, k); lean = lerp(0.3, 0.16, k); }
  else if (u < 0.5) { const k = ei((u - 0.42) / 0.08); sh = lerp(up, -0.72, k); el = lerp(-1.45, -0.15, k); lean = lerp(0.16, 0.44, k); }
  else { const k = eo((u - 0.5) / 0.5); sh = lerp(-0.72, -0.55, k) - 0.1 * Math.sin(k * Math.PI); el = lerp(-0.15, -0.7, k); lean = lerp(0.44, 0.3, k); }
  P.rShX = sh; P.rElX = el; P.rShZ = 0.12; P.sRx = lean; P.sRy = -0.12; P.hRx = 0.34;
}
// sits on the floor facing out at the view: knees up and apart, forearms on knees, head tipped up
function sitPose(P, t) {
  const b = Math.sin(t * 1.1);
  P.lock = 0; P.pY = 0.085 + 0.002 * b;
  P.lHipX = P.rHipX = -1.25; P.lHipZ = P.rHipZ = 0.42; P.lKnX = P.rKnX = 2.05; P.lAnX = P.rAnX = 0.55;
  P.pRx = -0.1; P.sRx = 0.28 + 0.012 * b; P.sRz = 0.0;
  P.lShX = P.rShX = -0.95; P.lElX = P.rElX = -0.55; P.lShZ = P.rShZ = 0.22;
  P.hRx = -0.42; P.hRy = 0.2 * Math.sin(t * 0.21); P.hRz = 0.04;
}
function idlePose(P, t) {
  standPose(P, t);
  P.lShZ = 0.38; P.lShX = 0.15; P.lElX = -1.5; // hand on hip
  P.rShX = 0.0; P.rElX = -0.25; P.rShZ = 0.09;
  P.hRy = 0.35 * Math.sin(t * 0.23) * Math.max(0, Math.sin(t * 0.11)); P.hRx = -0.05;
}

// ---------- particles
function makeParticles(max, blending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), al = new Float32Array(max), sz = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 800 } }, transparent: true, depthWrite: false, blending,
    vertexShader: `attribute vec3 aColor; attribute float aAlpha; attribute float aSize; uniform float uScale; varying vec3 vC; varying float vA;
      void main(){ vC=aColor; vA=aAlpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(0.01,-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-0.5)*2.0; float a=1.0-smoothstep(0.0,1.0,r); a*=a; if(vA*a<0.003) discard; gl_FragColor=vec4(vC,vA*a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  const P = []; for (let i = 0; i < max; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s0: 0, s1: 0, a: 0, r: 1, g: 1, b: 1, drag: 1, grav: 0, kind: 0 });
  let cur = 0;
  return {
    pts, mat, P,
    spawn(o) { for (let n = 0; n < max; n++) { const p = P[(cur + n) % max]; if (p.life <= 0) { Object.assign(p, o); p.life = o.max; cur = (cur + n + 1) % max; return p; } } return null; },
    update(dt, fn) {
      for (let i = 0; i < max; i++) {
        const p = P[i];
        if (p.life > 0) {
          if (fn) fn(p, dt);
          p.life -= dt * (p.kind === 2 ? 0 : 1);
          p.vx *= Math.exp(-p.drag * dt); p.vz *= Math.exp(-p.drag * dt); p.vy = p.vy * Math.exp(-p.drag * dt) - p.grav * dt;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          const k = 1 - clamp(p.life / p.max);
          const env = p.kind === 2 ? p.fade : Math.sin(Math.PI * Math.min(1, k + 0.0001)) * (k < 0.15 ? k / 0.15 : 1);
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
          al[i] = p.a * Math.max(0, env); sz[i] = lerp(p.s0, p.s1, k);
        } else al[i] = 0;
      }
      for (const n of ['position', 'aColor', 'aAlpha', 'aSize']) geo.attributes[n].needsUpdate = true;
    },
  };
}

// ---------- colour script (t: 0 dawn, 0.5 day, 1 evening). Dark, calm zenith for the clock.
const KEYF = [
  { zen: '#0b0e12', mid: '#151b22', hor: '#3e4a57', below: '#12161b', sun: '#cdd8ff', glow: '#d6b4ad', sunI: 2.5, el: 0.24, ps: -1.45, hemiS: '#8ea3bb', hemiG: '#3a342d', hemiI: 0.6, fog: '#2b333c' },
  { zen: '#0e1114', mid: '#191d22', hor: '#4f5552', below: '#141619', sun: '#fff1dc', glow: '#ecd6b0', sunI: 2.9, el: 0.46, ps: -0.85, hemiS: '#b5b7b3', hemiG: '#3e3a34', hemiI: 0.58, fog: '#33352f' },
  { zen: '#0f0f11', mid: '#1c1818', hor: '#704630', below: '#161210', sun: '#ffb36a', glow: '#ffbd6a', sunI: 3.3, el: 0.2, ps: 1.15, hemiS: '#c49a86', hemiG: '#3a2d26', hemiI: 0.68, fog: '#3a2a20' },
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function todSample(t, key, out) {
  const seg = t < 0.5 ? 0 : 1, u = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5, k = u * u * (3 - 2 * u);
  const A = KEYF[seg], B = KEYF[seg + 1];
  if (typeof A[key] === 'number') return lerp(A[key], B[key], k);
  return out.copy(_ca.set(A[key])).lerp(_cb.set(B[key]), k);
}

// ---------- mount
function mountTower(canvas, opts) {
  const reduceMotion = !!opts.reduceMotion;
  const low = opts.quality === 'low';
  const DPR_CAP = opts.maxDpr > 0 ? opts.maxDpr : low ? 1.25 : 2;
  const FOV = 30, EL = 0.43;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: low ? 'default' : 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 390 / 844, 0.1, 400);
  const fitCam = new THREE.PerspectiveCamera(FOV, 390 / 844, 0.1, 400);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.fog = new THREE.FogExp2(0x2b333c, 0.012);
  const shared = { uTime: { value: 0 }, uWind: { value: reduceMotion ? 0 : 1 } };

  // textures
  const stoneTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f3efe9'; g.fillRect(0, 0, w, h); const r = rng(11);
    for (let i = 0; i < 90; i++) {
      const x = r() * w, y = r() * h, rad = 8 + r() * 46, dark = r() < 0.6, al = 0.04 + r() * 0.05;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad); const c = dark ? '120,108,92' : '255,252,246';
        gr.addColorStop(0, `rgba(${c},${al})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(80,70,60,${0.04 + r() * 0.1})`; g.fillRect(r() * w, r() * h, 1 + r(), 1 + r()); }
  });
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; stoneTex.repeat.set(1.6, 1.6); stoneTex.anisotropy = 4;
  const paveTex = canvasTex(512, 512, (g, w, h) => {
    g.drawImage(stoneTex.image, 0, 0, w, h);
    g.strokeStyle = 'rgba(70,58,46,0.22)'; g.lineWidth = 2.2;
    const SC = 256 / R_IN, cx = 256, cy = 256;
    g.beginPath(); g.arc(cx, cy, 0.5 * SC, 0, TAU); g.stroke();
    for (let k = 0; k < 14; k++) { const a = k * TAU / 14; g.beginPath(); g.moveTo(cx + Math.cos(a) * CURB_R * SC, cy + Math.sin(a) * CURB_R * SC); g.lineTo(cx + Math.cos(a) * 0.5 * SC, cy + Math.sin(a) * 0.5 * SC); g.stroke(); }
    for (let k = 0; k < 20; k++) { const a = (k + 0.5) * TAU / 20; g.beginPath(); g.moveTo(cx + Math.cos(a) * 0.5 * SC, cy + Math.sin(a) * 0.5 * SC); g.lineTo(cx + Math.cos(a) * 0.7 * SC, cy + Math.sin(a) * 0.7 * SC); g.stroke(); }
    // soft inner-corner occlusion where the floor meets the wall
    const gr = g.createRadialGradient(cx, cy, 0.55 * SC, cx, cy, 0.7 * SC); gr.addColorStop(0, 'rgba(40,32,24,0)'); gr.addColorStop(1, 'rgba(40,32,24,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const glowTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });

  // materials
  const std = (color, rough, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const mats = {
    stone: std('#ffffff', 0.84, 0, { map: stoneTex, envMapIntensity: 0.7 }),
    floor: std('#d6ccbd', 0.9, 0, { map: paveTex, envMapIntensity: 0.55 }),
    gold: std('#e8aa48', 0.28, 1, { envMapIntensity: 1.45 }),
    ground: std('#ffffff', 0.97, 0, { vertexColors: true, envMapIntensity: 0.45 }),
    rockside: std('#ffffff', 0.93, 0, { vertexColors: true, map: stoneTex, envMapIntensity: 0.55 }),
    plinth: std('#a1988a', 0.9, 0, { map: stoneTex, envMapIntensity: 0.55 }),
    rocks: std('#ffffff', 0.9, 0, { vertexColors: true, map: stoneTex, envMapIntensity: 0.5 }),
    tree: std('#ffffff', 0.9, 0, { vertexColors: true, envMapIntensity: 0.4 }),
    grass: std('#ffffff', 0.85, 0, { vertexColors: true, envMapIntensity: 0.35, side: THREE.DoubleSide }),
    skin: std('#c4906f', 0.62), shirt: std('#ece7df', 0.82), overall: std('#2f3c47', 0.78), boot: std('#3a2e28', 0.7),
    hair: std('#2a211c', 0.85), hat: std('#FBC159', 0.32, 0.45, { envMapIntensity: 1.1 }), leather: std('#6b4a33', 0.75),
    hammer: std('#ffffff', 0.5, 0.35, { vertexColors: true }),
  };
  // weathered stone: per-block tonal variation, worn lighter arrises, chips, pits, crevice occlusion
  const Y0 = GAP / 2, Y1 = H - GAP / 2, HA = DA / 2 - GAP / 2 / R_MID;
  mats.stone.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying float vSeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLoc = position; vSeed = 0.37;
        #ifdef USE_INSTANCING
          vSeed = instanceMatrix[3].y * 7.31 + instanceMatrix[0].x * 3.7 + instanceMatrix[2].x * 5.1;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vLoc; varying float vSeed;\n${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float rr = length(vLoc.xz); float ang = atan(vLoc.x, vLoc.z);
        float eR = min(rr - ${R_IN.toFixed(4)}, ${R_OUT.toFixed(4)} - rr);
        float eY = min(vLoc.y - ${Y0.toFixed(4)}, ${Y1.toFixed(4)} - vLoc.y);
        float eA = (${HA.toFixed(4)} - abs(ang)) * rr;
        float e = min(eR, min(eY, eA));
        vec3 sp = vLoc * 9.0 + vec3(vSeed * 3.1, vSeed * 1.7, vSeed * 2.3);
        float n1 = vn3(sp), n2 = vn3(sp * 3.1 + 11.0), n3 = fbm3(sp * 0.3 + 3.0), n4 = vn3(sp * 8.0 + 5.0);
        diffuseColor.rgb *= mix(0.86, 1.07, n3) * mix(0.95, 1.03, n2);
        float wear = 1.0 - smoothstep(0.0, 0.05, e);
        float chip = wear * smoothstep(0.58, 0.8, n2 * 0.6 + n1 * 0.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.06 + 0.02, wear * 0.7);
        diffuseColor.rgb *= 1.0 - chip * 0.25;
        diffuseColor.rgb *= 1.0 - 0.2 * smoothstep(0.8, 0.93, n4);
        float lichen = smoothstep(0.62, 0.8, fbm3(sp * 0.55 + 21.0)) * (1.0 - smoothstep(0.0, 0.16, vLoc.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.8, 0.66), lichen * 0.55);
        diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.045, vLoc.y - ${Y0.toFixed(4)}));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + chip * 0.1 - wear * 0.06, 0.0, 1.0);');
  };
  // grass sway (freezes with the scene clock while paused)
  mats.grass.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime; sh.uniforms.uWind = shared.uWind;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = instanceMatrix[3].xz;
          float sw = (sin(uTime * 1.3 + ip.x * 2.1 + ip.y * 1.7) * 0.6 + sin(uTime * 2.3 + ip.x * 4.0) * 0.4) * uWind;
          transformed.x += sw * 0.18 * position.y * position.y * 8.0;
          transformed.z += sw * 0.08 * position.y * position.y * 8.0;
        #endif`);
  };

  // ---- sky dome: dark calm zenith (clock), horizon glow behind the island, cloud bands, dawn stars
  const skyU = { uZen: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBelow: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 0.3, 1) }, uHv: { value: -0.35 }, uStars: { value: 1 }, uTime: shared.uTime };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`,
    fragmentShader: `uniform vec3 uZen,uMid,uHor,uBelow,uGlow,uSun; uniform float uHv,uStars,uTime; varying vec3 vD;
      ${GLSL_NOISE}
      void main(){ vec3 d=normalize(vD); float h=d.y-uHv;
        vec3 c=mix(uHor,uMid,smoothstep(0.0,0.2,h)); c=mix(c,uZen,smoothstep(0.14,0.55,h));
        c=mix(c,uBelow,smoothstep(-0.02,-0.16,h));
        vec2 hz=normalize(d.xz+1e-5), sz=normalize(uSun.xz+1e-5); float s=max(dot(hz,sz),0.0);
        c+=uGlow*(pow(s,3.0)*0.26*exp(-abs(h-0.02)*7.0)+pow(s,18.0)*0.2*exp(-abs(h-0.035)*16.0));
        // layered cloud bands (thin high streaks, a broad band at the horizon, a cloud sea beneath)
        float dr=uTime*0.004;
        float n=fbm3(vec3(d.x*5.0+dr,d.y*36.0,d.z*5.0-dr*0.5));
        float n2=fbm3(vec3(d.x*3.2-dr,d.y*14.0+4.0,d.z*3.2));
        float m1=exp(-pow((h-0.07)/0.03,2.0)), m2=exp(-pow((h-0.18)/0.045,2.0))*0.6, m3=smoothstep(0.02,-0.07,h)*exp(-pow((h+0.12)/0.13,2.0));
        float cl=smoothstep(0.5,0.78,n)*(m1+m2)+smoothstep(0.4,0.72,n2)*m3*0.9;
        vec3 lit=mix(uHor*1.12,uGlow*0.9,0.25+0.5*pow(s,2.0)); vec3 shade=mix(uMid,uHor,0.35);
        c=mix(c,mix(shade,lit,smoothstep(0.45,0.85,n*0.6+n2*0.4)),clamp(cl,0.0,1.0)*0.55);
        // stars (dawn, and a few again at the finished evening)
        if(uStars>0.002){ vec3 sp=d*120.0; vec3 id=floor(sp); vec3 f=fract(sp)-0.5; float r=h13(id);
          if(r>0.9){ vec3 off=(vec3(h13(id+3.1),h13(id+7.7),h13(id+1.3))-0.5)*0.5; float dd=length(f-off);
            float sz2=mix(0.06,0.13,pow(h13(id+5.5),4.0)); float w=fwidth(dd)*0.9; float st=1.0-smoothstep(sz2-w,sz2+w,dd);
            float tw=0.78+0.22*sin(uTime*(0.7+2.0*h13(id+2.2))+r*40.0);
            c+=vec3(1.0,0.95,0.88)*st*tw*mix(0.2,0.95,pow(h13(id+9.9),3.0))*uStars*smoothstep(0.12,0.4,h)*(1.0-clamp(cl*1.5,0.0,1.0)); } }
        c+=(h13(vec3(gl_FragCoord.xy,1.0))-0.5)/255.0;
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

  // environment for reflections: the same sky colours, so gold mirrors dawn blue, day cream or evening amber
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyU, side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vD; void main(){ vD=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uZen,uMid,uHor,uBelow,uGlow,uSun; varying vec3 vD;
      void main(){ vec3 d=normalize(vD); float h=d.y;
        vec3 c=mix(uHor*1.25,uMid*1.3,smoothstep(0.0,0.3,h)); c=mix(c,uZen*1.4+uMid*0.4,smoothstep(0.25,0.8,h));
        vec3 gnd=mix(uBelow,vec3(0.32,0.29,0.25),0.55); c=mix(c,gnd,smoothstep(0.0,-0.25,h));
        float s=max(dot(d,normalize(uSun)),0.0);
        c+=uGlow*(pow(s,6.0)*0.9+pow(s,90.0)*5.0);
        vec2 hz=normalize(d.xz+1e-5), sz=normalize(uSun.xz+1e-5); c+=uGlow*pow(max(dot(hz,sz),0.0),3.0)*0.45*exp(-abs(h)*6.0);
        gl_FragColor=vec4(c,1.0); }`,
  })));
  let envRT = null, envT = -1, envAt = -99;
  function refreshEnv(force) {
    if (!force && Math.abs(todS - envT) < 0.012) return;
    if (!force && time - envAt < (low ? 6 : 2)) return;
    const rt = pmrem.fromScene(envScene, 0, 0.1, 100);
    scene.environment = rt.texture; if (envRT) envRT.dispose(); envRT = rt; envT = todS; envAt = time;
  }

  // ---- lights
  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.castShadow = true; sun.shadow.mapSize.set(low ? 512 : 2048, low ? 512 : 2048);
  Object.assign(sun.shadow.camera, { left: -2.7, right: 2.7, top: 3.2, bottom: -3.2, near: 1, far: 40 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.7); scene.add(hemi);
  const lampLight = new THREE.PointLight(0xffb15a, 0, 6, 1.6); scene.add(lampLight);

  // ---- distant islets for depth (fogged; parallax as the camera turns)
  const farMat = new THREE.MeshBasicMaterial({ color: 0x333333, fog: false });
  {
    const parts = []; const r = rng(42);
    for (let i = 0; i < 4; i++) {
      const a = 0.9 + i * 1.6 + r() * 0.6, R = 36 + r() * 16, s = 1.4 + r() * 1.8;
      const prof = [[0.001, -1.6], [0.35, -1.25], [0.7, -0.6], [0.95, -0.15], [1.0, 0], [0.001, 0.02]].map(([x, y]) => new THREE.Vector2(x, y));
      parts.push([new THREE.LatheGeometry(prof, 12), M4(Math.sin(a) * R, -2.5 - r() * 4, Math.cos(a) * R, 0, r() * 3, 0, s, s * (0.8 + r() * 0.5), s)]);
      parts.push([new THREE.ConeGeometry(0.12, 0.7, 6), M4(Math.sin(a) * R + s * 0.3, -2.5 + 0.35 * s, Math.cos(a) * R, 0, 0, 0, s, s, s)]);
    }
    const far = new THREE.Mesh(merge(parts), farMat); scene.add(far);
  }
  // ---- island: layered rock strata, grassy ground with a worn path, moss, stones, cypresses
  const PATH_A = 2.55 + Math.PI; // path leaves the plinth steps on this bearing
  const groundH = (x, z) => {
    const r = Math.hypot(x, z); const rim = clamp((ISL_R - r) / 0.25);
    return (0.035 * (fbm2(x * 1.3 + 3, z * 1.3 + 7) - 0.45) + 0.012 * Math.sin(x * 3.1 + z * 2.3)) * rim * smooth(clamp((r - 1.48) / 0.25));
  };
  const pathW = (x, z) => { // 0..1 inside the worn path
    const r = Math.hypot(x, z); if (r < 1.45) return 0;
    const a = Math.atan2(x, z); const centre = PATH_A + 0.18 * Math.sin((r - 1.5) * 3.2);
    const d = Math.abs(wrapPi(a - centre)) * r; const w = 0.16 + 0.04 * Math.sin(r * 7);
    return 1 - smooth(clamp((d - w * 0.55) / (w * 0.6)));
  };
  const rockSpots = []; // for contact occlusion in the ground colours
  {
    const r0 = rng(3);
    for (let i = 0; i < 12; i++) { const a = r0() * TAU, R = 1.62 + r0() * 0.42, s = 0.05 + r0() * 0.1; if (pathW(Math.sin(a) * R, Math.cos(a) * R) > 0.1) continue; rockSpots.push([Math.sin(a) * R, Math.cos(a) * R, s, r0()]); }
  }
  {
    // ground top: polar grid
    const RS = 26, AS = 128, pos = [], col = [], idx = [];
    const grassA = new THREE.Color('#5f6747'), grassB = new THREE.Color('#7f7d58'), moss = new THREE.Color('#465036'), dirt = new THREE.Color('#9a876c'), dirtD = new THREE.Color('#6f604f'), c = new THREE.Color();
    for (let i = 0; i <= RS; i++) {
      const rr = lerp(1.42, ISL_R + 0.04, i / RS);
      for (let j = 0; j <= AS; j++) {
        const a = j / AS * TAU, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
        let y = groundH(x, z) - (i === RS ? 0.03 : 0);
        const pw = pathW(x, z); y -= pw * 0.012;
        pos.push(x, y, z);
        const n = fbm2(x * 2.2, z * 2.2), n2 = vnoise(x * 7, z * 7);
        c.copy(grassA).lerp(grassB, clamp(n * 1.4 - 0.2)).lerp(moss, clamp((0.45 - n) * 2) * 0.6);
        c.multiplyScalar(0.9 + 0.2 * n2);
        // trampled earth ring at the plinth foot and the worn path
        const foot = 1 - smooth(clamp((rr - 1.5) / 0.22));
        c.lerp(dirtD, foot * 0.55).lerp(dirt, pw * (0.75 + 0.25 * n2));
        // contact occlusion: plinth base, rocks, island lip
        let ao = 1 - 0.5 * (1 - smooth(clamp((rr - 1.49) / 0.12)));
        for (const [sx, sz, s] of rockSpots) { const d = Math.hypot(x - sx, z - sz); ao *= 1 - 0.5 * (1 - smooth(clamp((d - s * 0.6) / (s * 1.6)))); }
        ao *= 1 - 0.25 * smooth(clamp((rr - ISL_R + 0.1) / 0.14));
        c.multiplyScalar(ao);
        col.push(c.r, c.g, c.b);
        if (i < RS && j < AS) { const k = i * (AS + 1) + j; idx.push(k, k + AS + 1, k + 1, k + 1, k + AS + 1, k + AS + 2); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const ground = new THREE.Mesh(g, mats.ground); ground.receiveShadow = true; scene.add(ground);

    // sides: strata with small ledges, darker and rougher with depth
    const HS = 46, pos2 = [], col2 = [], uv2 = [], idx2 = [];
    const bands = ['#4e3f30', '#a58e6c', '#7a6853', '#b8a07c', '#6c5c4b', '#9e8a6b', '#5e5144', '#8a7762', '#4f463d'].map((h) => new THREE.Color(h));
    const deep = new THREE.Color('#2c2824');
    for (let i = 0; i <= HS; i++) {
      const t = i / HS, y0 = -ISL_D * Math.pow(t, 1.15);
      for (let j = 0; j <= AS; j++) {
        const a = j / AS * TAU;
        const wob = 0.045 * Math.sin(a * 3 + 1.3) + 0.03 * Math.sin(a * 7 + 0.4);
        const yb = y0 + wob; const band = Math.max(0, Math.floor((-yb - 0.07) / 0.17) + 1); const bf = ((-yb - 0.07) / 0.17) % 1;
        const shape = Math.pow(1 - Math.pow(t, 1.7), 0.62);
        const n = 0.55 * Math.sin(a * 3 + y0 * 2) + 0.3 * Math.sin(a * 7 - y0 * 3 + 1) + 0.2 * Math.sin(a * 13 + y0 * 5) + 0.12 * Math.sin(a * 23 + band * 1.7);
        const ledge = band > 0 ? 0.05 * (hash2(band, 3) - 0.5) - 0.035 * smooth(clamp(bf * 4)) : 0.03;
        let rr = (ISL_R + 0.04) * shape * (1 + (0.07 * n + ledge) * clamp(t * 6));
        const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
        pos2.push(x, y0 + 0.05 * Math.sin(a * 5 + 2) * t - (i === 0 ? 0.03 : 0), z);
        c.copy(bands[Math.min(band, bands.length - 1)]).multiplyScalar(0.88 + 0.22 * vnoise(a * 18, y0 * 9)).lerp(deep, clamp(t * 1.15) * 0.8);
        if (band === 0) c.lerp(new THREE.Color('#4b5034'), 0.35 * (1 - bf));
        col2.push(c.r, c.g, c.b); uv2.push(a * 2.2, y0 * 1.4);
        if (i < HS && j < AS) { const k = i * (AS + 1) + j; idx2.push(k, k + 1, k + AS + 1, k + 1, k + AS + 2, k + AS + 1); }
      }
    }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3)); g2.setAttribute('color', new THREE.Float32BufferAttribute(col2, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv2, 2)); g2.setIndex(idx2); g2.computeVertexNormals();
    const side = new THREE.Mesh(g2, mats.rockside); side.receiveShadow = true; side.castShadow = true; scene.add(side);

    // plinth (stepped stone platform)
    const pl = new THREE.LatheGeometry([[1.5, -0.06], [1.5, 0.095], [1.47, 0.12], [1.3, 0.12], [1.27, 0.145], [1.27, 0.22], [1.24, 0.24], [0.001, 0.24]].map(([x, y]) => new THREE.Vector2(x, y)), 120);
    const plinth = new THREE.Mesh(pl, mats.plinth); plinth.receiveShadow = true; plinth.castShadow = true; scene.add(plinth);

    // cypresses and a low shrub (lumpy foliage, darker at the base) + short trunks
    const cyp = (x, z, s, sy, seed) => {
      const prof = [[0.001, 0], [0.12, 0.05], [0.17, 0.28], [0.16, 0.6], [0.11, 0.95], [0.045, 1.22], [0.001, 1.3]].map(([a, b]) => new THREE.Vector2(a, b));
      let g = new THREE.LatheGeometry(prof, 18); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
      const p = g.attributes.position; const cc = new Float32Array(p.count * 3); const cB = new THREE.Color('#1f2a22'), cT = new THREE.Color('#3f5341'), q = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), a = Math.atan2(px, pz);
        const k = 1 + 0.16 * (vnoise(a * 2.5 + seed, py * 6) - 0.5) + 0.06 * Math.sin(py * 22 + a * 3);
        p.setXYZ(i, px * k, py, pz * k);
        q.copy(cB).lerp(cT, clamp(py / 1.2) * (0.6 + 0.5 * vnoise(a * 4, py * 9 + seed)));
        cc.set([q.r, q.g, q.b], i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.computeVertexNormals();
      return [g, M4(x, -0.02, z, 0, seed, 0, s, s * sy, s)];
    };
    const tg = merge([
      cyp(Math.sin(4.15) * 1.8, Math.cos(4.15) * 1.8, 1, 1.15, 1),
      cyp(Math.sin(4.42) * 1.9, Math.cos(4.42) * 1.9, 0.8, 0.85, 2),
      cyp(Math.sin(1.25) * 1.86, Math.cos(1.25) * 1.86, 0.7, 0.68, 3),
      [paint(ni(new THREE.IcosahedronGeometry(0.16, 1)), '#3a4732'), M4(Math.sin(1.55) * 1.9, 0.05, Math.cos(1.55) * 1.9, 0, 0, 0, 1.3, 0.75, 1.1)],
      [paint(ni(new THREE.IcosahedronGeometry(0.12, 1)), '#46543a'), M4(Math.sin(5.6) * 1.86, 0.04, Math.cos(5.6) * 1.86, 0, 0, 0, 1.2, 0.7, 1)],
    ], true);
    const trees = new THREE.Mesh(tg, mats.tree); trees.castShadow = true; trees.receiveShadow = true; scene.add(trees);

    // scattered stones + flat stepping stones along the path
    let rg = new THREE.DodecahedronGeometry(1, 1); rg.deleteAttribute('uv'); rg.deleteAttribute('normal'); rg = mergeVertices(rg);
    { const p = rg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.85 + 0.3 * vnoise(x * 2 + 4, z * 2 + y); p.setXYZ(i, x * k, Math.max(-0.35, y) * k, z * k); }
      const cc = new Float32Array(p.count * 3); const c1 = new THREE.Color('#cdc3b2'), c2 = new THREE.Color('#7d8a5c'), q = new THREE.Color();
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); q.copy(c1).multiplyScalar(0.8 + 0.25 * vnoise(p.getX(i) * 3, p.getZ(i) * 3)); if (y > 0.45) q.lerp(c2, 0.35 * vnoise(p.getX(i) * 5, p.getZ(i) * 5 + 3)); cc.set([q.r, q.g, q.b], i * 3); }
      rg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); rg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2)); rg.computeVertexNormals(); }
    const nSteps = 6, rocks = new THREE.InstancedMesh(rg, mats.rocks, rockSpots.length + nSteps);
    rockSpots.forEach(([x, z, s, rr], i) => { rocks.setMatrixAt(i, M4(x, s * 0.15, z, rr * 2, rr * 9, rr, s * 1.3, s * 0.75, s)); rocks.setColorAt(i, new THREE.Color(1, 1, 1)); });
    for (let k = 0; k < nSteps; k++) {
      const r = 1.6 + k * 0.11, a = PATH_A + 0.18 * Math.sin((r - 1.5) * 3.2) + (k % 2 ? 0.05 : -0.05);
      rocks.setMatrixAt(rockSpots.length + k, M4(Math.sin(a) * r, groundH(Math.sin(a) * r, Math.cos(a) * r) - 0.005, Math.cos(a) * r, 0, a + k, 0, 0.075, 0.025, 0.06));
      rocks.setColorAt(rockSpots.length + k, new THREE.Color(0.92, 0.9, 0.86));
    }
    rocks.castShadow = true; rocks.receiveShadow = true; scene.add(rocks);

    // grass and moss tufts (instanced, swaying)
    const blade = (h, lean, rot) => { const g = new THREE.BufferGeometry(); const w = 0.008; g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, lean * 0.6, h, lean], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); g.applyMatrix4(M4(0, 0, 0, 0, rot)); return g; };
    const tuftParts = []; const rb = rng(17);
    for (let k = 0; k < 11; k++) { const g = blade(0.035 + rb() * 0.045, (rb() - 0.5) * 0.05, rb() * TAU); g.translate((rb() - 0.5) * 0.05, 0, (rb() - 0.5) * 0.05); const cc = new Float32Array(9); const q = new THREE.Color('#5f6a42'); const tip = new THREE.Color('#c2bb86').lerp(q, rb() * 0.4); cc.set([q.r, q.g, q.b, q.r, q.g, q.b, tip.r, tip.g, tip.b]); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); tuftParts.push(g); }
    const tuftGeo = mergeGeometries(tuftParts);
    const NT = low ? 140 : 420; const tufts = new THREE.InstancedMesh(tuftGeo, mats.grass, NT); const rt = rng(29); let n = 0;
    for (let tries = 0; tries < 2000 && n < NT; tries++) {
      const a = rt() * TAU, R = 1.55 + Math.sqrt(rt()) * (ISL_R - 1.57), x = Math.sin(a) * R, z = Math.cos(a) * R;
      if (pathW(x, z) > 0.25) continue; const clump = fbm2(x * 2.2, z * 2.2); if (rt() > clump * 1.9) continue;
      const s = 0.7 + rt() * 0.9; tufts.setMatrixAt(n, M4(x, groundH(x, z) - 0.005, z, 0, rt() * TAU, 0, s, s * (0.8 + rt() * 0.6), s));
      tufts.setColorAt(n, new THREE.Color().setHSL(0.15 + rt() * 0.06, 0.2, 0.8 + rt() * 0.2)); n++;
    }
    // a fringe of tufts hanging at the lip
    tufts.count = n; tufts.receiveShadow = true; scene.add(tufts);
  }

  // ---- tower blocks
  const bGeo = sectorGeo();
  const stones = new THREE.InstancedMesh(bGeo, mats.stone, BASE * N + TOTAL - N);
  const golds = new THREE.InstancedMesh(bGeo, mats.gold, N);
  for (const m of [stones, golds]) { m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
  const dummy = new THREE.Object3D(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  { const r = rng(9), c = new THREE.Color();
    for (let j = 0; j < BASE * N; j++) { c.set('#b0a697').offsetHSL(0, (r() - 0.5) * 0.02, (r() - 0.5) * 0.05); stones.setColorAt(j, c); }
    for (let i = 0; i < TOTAL - N; i++) { c.set('#cbc1b0').offsetHSL((r() - 0.5) * 0.015, (r() - 0.5) * 0.04, (r() - 0.5) * 0.08); stones.setColorAt(BASE * N + i, c); }
    for (let i = 0; i < N; i++) golds.setColorAt(i, c.set('#ffffff'));
  }
  for (let j = 0; j < BASE * N; j++) { const cc = Math.floor(j / N), s = j % N; dummy.position.set(0, PLINTH + cc * H, 0); dummy.rotation.set(0, s * DA + (cc % 2) * DA * 0.5 + A0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); stones.setMatrixAt(j, dummy.matrix); }
  const goldLip = new THREE.Mesh(new THREE.TorusGeometry(R_OUT + 0.004, 0.011, 8, 120), mats.gold);
  goldLip.rotation.x = Math.PI / 2; goldLip.position.y = PLINTH + BASE * H; scene.add(goldLip);
  // per-block state: 0 not set, 1 placed, 2 dropping in, 3 the mason's block (carried / on its slot), 4 sliding home
  const bState = new Array(TOTAL).fill(0), bT = new Array(TOTAL).fill(0), dueAt = new Array(TOTAL).fill(0), landed = new Array(TOTAL).fill(0);
  function setBlockMatrix(i, dy = 0, dyaw = 0, sq = 0) {
    const { a, y } = blockInfo(i);
    dummy.position.set(0, y + dy, 0); dummy.rotation.set(0, a + dyaw, 0); dummy.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5); dummy.updateMatrix();
    if (i >= TOTAL - N) golds.setMatrixAt(i - (TOTAL - N), dummy.matrix); else stones.setMatrixAt(BASE * N + i, dummy.matrix);
  }
  function hideBlock(i) { if (i >= TOTAL - N) golds.setMatrixAt(i - (TOTAL - N), ZERO); else stones.setMatrixAt(BASE * N + i, ZERO); }
  const carried = new THREE.Mesh(bGeo, mats.stone); carried.castShadow = true; carried.receiveShadow = true; carried.visible = false; scene.add(carried);
  // pile of spare stones by the path
  const PILE = 10;
  const pile = new THREE.InstancedMesh(bGeo, mats.stone, PILE); pile.castShadow = true; pile.receiveShadow = true; scene.add(pile);
  { const c = new THREE.Color('#d9d0c2'), pa = 2.55, r = rng(4);
    for (let k = 0; k < PILE; k++) {
      const layer = Math.floor(k / 4), col = k % 4; const t = (col - 1.5 + layer * 0.5) * 0.33;
      const px = Math.sin(pa) * 1.8 + Math.cos(pa) * t, pz = Math.cos(pa) * 1.8 - Math.sin(pa) * t;
      dummy.position.set(px - Math.sin(pa) * R_MID * 0.55, 0.004 + layer * 0.158, pz - Math.cos(pa) * R_MID * 0.55);
      dummy.rotation.set(0, pa + Math.PI / 2 + (r() - 0.5) * 0.12, 0); dummy.scale.setScalar(0.55); dummy.updateMatrix();
      const m = dummy.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, -R_MID));
      pile.setMatrixAt(k, m); pile.setColorAt(k, c.clone().offsetHSL(0, 0, (r() - 0.5) * 0.06));
    }
  }

  // ---- top floor (moves up as courses complete)
  const floor = new THREE.Group(); scene.add(floor);
  const fl = new THREE.Mesh(new THREE.RingGeometry(HATCH_R, R_IN + 0.012, 64, 1), mats.floor); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; floor.add(fl);
  const curb = new THREE.Mesh(new THREE.LatheGeometry([[HATCH_R, -0.02], [HATCH_R, CURB_H - 0.012], [HATCH_R + 0.012, CURB_H], [CURB_R - 0.012, CURB_H], [CURB_R, CURB_H - 0.012], [CURB_R, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 64), mats.plinth);
  curb.castShadow = true; curb.receiveShadow = true; floor.add(curb);
  const inlay = new THREE.Mesh(new THREE.TorusGeometry((HATCH_R + CURB_R) / 2, 0.006, 6, 64), mats.gold); inlay.rotation.x = Math.PI / 2; inlay.position.y = CURB_H + 0.001; inlay.scale.z = 0.35; floor.add(inlay);
  { const g = new THREE.CylinderGeometry(HATCH_R, HATCH_R * 0.9, 1.6, 32, 1, true); const p = g.attributes.position; const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const k = clamp((p.getY(i) + 0.8) / 1.6); const v = 0.003 + 0.05 * k * k; col[i * 3] = v * 1.1; col[i * 3 + 1] = v; col[i * 3 + 2] = v * 0.85; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const shaft = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })); shaft.position.y = -0.8; floor.add(shaft);
    const bot = new THREE.Mesh(new THREE.CircleGeometry(HATCH_R, 24), new THREE.MeshBasicMaterial({ color: 0x030303 })); bot.rotation.x = -Math.PI / 2; bot.position.y = -1.58; floor.add(bot);
  }

  // ---- lantern (rises from the hatch at 'done')
  const lantern = new THREE.Group(); scene.add(lantern); lantern.visible = false;
  {
    const ogee = [[0.24, 0], [0.235, 0.03], [0.2, 0.08], [0.13, 0.15], [0.07, 0.22], [0.04, 0.28], [0.001, 0.3]].map(([x, y]) => new THREE.Vector2(x, y));
    const parts = [
      [new THREE.CylinderGeometry(0.235, 0.24, 0.03, 40), M4(0, 0.135, 0)],
      [new THREE.CylinderGeometry(0.245, 0.245, 0.04, 40), M4(0, 0.79, 0)],
      [new THREE.LatheGeometry(ogee, 40), M4(0, 0.81, 0)],
      [new THREE.SphereGeometry(0.035, 16, 12), M4(0, 1.14, 0)],
      [new THREE.ConeGeometry(0.012, 0.16, 8), M4(0, 1.24, 0)],
    ];
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6; parts.push([new THREE.CylinderGeometry(0.013, 0.013, 0.64, 8), M4(Math.sin(a) * 0.19, 0.47, Math.cos(a) * 0.19)]); }
    const lg = new THREE.Mesh(merge(parts), mats.gold); lg.castShadow = true; lantern.add(lg);
    const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.255, 0.255, 0.42, 40), mats.plinth); lb.position.y = -0.09; lb.castShadow = true; lb.receiveShadow = true; lantern.add(lb);
    const flame = [[0.001, 0], [0.06, 0.05], [0.075, 0.12], [0.05, 0.2], [0.001, 0.3]].map(([x, y]) => new THREE.Vector2(x, y));
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.72, 0.38) });
    const core = new THREE.Mesh(new THREE.LatheGeometry(flame, 16), coreMat); core.position.y = 0.3; lantern.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb35c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    halo.position.y = 0.45; halo.scale.set(2.2, 2.2, 1); lantern.add(halo);
    lantern.userData = { coreMat, halo };
  }

  // ---- builder
  const rig = makeBuilder(mats); scene.add(rig.root);

  // ---- particles (fewer on 'low', none with reduced motion)
  const dust = makeParticles(low ? 50 : 140, THREE.NormalBlending); scene.add(dust.pts);
  const glow = makeParticles(low ? 40 : 110, THREE.AdditiveBlending); scene.add(glow.pts);
  if (reduceMotion) { dust.pts.visible = false; glow.pts.visible = false; }
  { const r = rng(77); for (let i = 0; i < (low ? 16 : 46); i++) { const a = r() * TAU, R = 0.6 + r() * 2.6; glow.spawn({ kind: 2, max: 1, x: Math.sin(a) * R, y: 0.2 + r() * 4.2, z: Math.cos(a) * R, vx: 0, vy: 0, vz: 0, s0: 0.022 + r() * 0.03, s1: 0, a: 0.5, r: 1, g: 0.85, b: 0.62, drag: 0, grav: 0, fade: 0, seed: r() * 100 }); } }
  const puff = (x, y, z, n, str = 1) => {
    if (reduceMotion) return;
    if (low) n = Math.ceil(n / 2);
    for (let k = 0; k < n; k++) { const a = Math.random() * TAU, sp = (0.15 + Math.random() * 0.35) * str;
      dust.spawn({ kind: 0, max: 0.9 + Math.random() * 0.9, x, y, z, vx: Math.sin(a) * sp, vy: 0.03 + Math.random() * 0.1 * str, vz: Math.cos(a) * sp, s0: 0.03, s1: 0.11 + Math.random() * 0.08 * str, a: 0.3, r: 0.86, g: 0.8, b: 0.72, drag: 2.6, grav: 0.05 }); }
  };

  // ---------- simulation state
  let progress = 0, phase = 'idle', started = false, time = 0, aTime = 0, lastT = performance.now(), raf = 0, disposed = false;
  let target = 0, dueN = 0, nSet = 0, floorY = floorFor(0), floorTarget = floorY;
  let todS = 0, doneAmt = 0, lampAmt = 0, driftSpeed = 1, driftClock = 0, skyClock = 0;
  let rate = 0, anchorT = -1, anchorV = 0, realDt = 0; // progress per second, from the app's calls
  const cam = { az: 0, azT: 0, v: 0, lookY: 1, dist: 14, scripted: null, fit: { dist: 14, lookY: 1 } };
  const B = { state: 'idleTop', t: 0, pose: P0(), from: null, blend: 0.3, visible: true, work: -1, onSlot: false, off: 0, offYaw: 0, ph: 0, act: 0, actT: 0, taps: 0, resume: 'descend', a: 0, walk: null, hammerHand: false, impact: false, carryK: 0, setFrom: null, slide: null };
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpV2 = new THREE.Vector3();
  const slotPos = (i) => { const { a, y } = blockInfo(i); return { a, x: Math.sin(a) * R_MID, y, z: Math.cos(a) * R_MID }; };
  const timeToDue = (k) => (rate > 1e-6 ? (dueP(k) - progress) / rate : Infinity);

  function hammerTo(hand) { if (B.hammerHand === hand) return; B.hammerHand = hand; (hand ? rig.holdHand : rig.holdBelt).add(rig.hammer); }
  function go(state, blend = 0.3) { B.from = { ...B.pose }; B.state = state; B.t = 0; B.blend = blend; }
  function commitBlock(i) { if (i < 0) return; bState[i] = 1; setBlockMatrix(i); if (B.work === i) { carried.visible = false; B.onSlot = false; B.work = -1; } }
  function setCarriedOnSlot(i, dy, dyaw, scale = 1) { const s = slotPos(i); carried.position.set(0, s.y + dy, 0); carried.rotation.set(0, s.a + dyaw, 0); carried.scale.setScalar(scale); }
  function prepCarried(i) { carried.material = i >= TOTAL - N ? mats.gold : mats.stone; carried.visible = true; }
  function takeBlock(i) { B.work = i; bState[i] = 3; prepCarried(i); B.onSlot = false; B.setFrom = null; }
  // the mason's block becomes due while it's still in his hands: it glides home by itself
  function slideHome(i) {
    if (B.work !== i) return;
    B.slide = { i, p: carried.position.clone(), q: carried.quaternion.clone(), s: carried.scale.x, t: 0 };
    bState[i] = 4; B.work = -1; B.onSlot = false;
  }
  function dropBlock(i) { if (reduceMotion) { bState[i] = 1; setBlockMatrix(i); return; } bState[i] = 2; bT[i] = 0; landed[i] = 0; }

  // rebuild the exact picture for the current progress and phase (mount, instant, rewind)
  function snap() {
    target = phase === 'done' ? TOTAL : targetFor(progress); dueN = target;
    for (let i = 0; i < TOTAL; i++) { dueAt[i] = -1e9; if (i < target) { bState[i] = 1; setBlockMatrix(i); } else { bState[i] = 0; hideBlock(i); } }
    nSet = target; B.slide = null;
    floorY = floorTarget = nSet >= TOTAL ? TOP_Y : floorFor(nSet);
    todS = phase === 'done' ? 1 : progress; doneAmt = phase === 'done' ? 1 : 0; lampAmt = phase === 'done' ? 1 : 0;
    carried.visible = false; B.onSlot = false; B.work = -1; B.turn = null; B.ang = undefined; hammerTo(false); cam.scripted = null;
    lantern.visible = phase === 'done';
    const ai = Math.min(target, TOTAL - 1); B.a = blockInfo(ai).a;
    if (!reduceMotion || !started) { cam.az = cam.azT = B.a + Math.PI; }
    cam.v = 0;
    if (reduceMotion) B.a = cam.az + Math.PI;
    const loose = () => { takeBlock(target); B.onSlot = true; B.off = 0.03; B.offYaw = 0.02; setCarriedOnSlot(target, B.off, B.offYaw); };
    if (phase === 'done') { B.a = blockInfo(TOTAL - 1).a; B.ang = B.a; B.doneR = 0.58; cam.az = cam.azT = B.a - 0.5; go('doneRest', 0); }
    else if (phase === 'paused') { if (target < TOTAL && !reduceMotion) { loose(); B.resume = 'toFit'; } else B.resume = reduceMotion ? 'rm' : 'idle'; go('sit', 0); driftSpeed = 0; }
    else if (phase === 'building' && target < TOTAL) { if (!reduceMotion) loose(); B.act = 0; B.actT = 0; hammerTo(true); go('fit', 0); }
    else { go('idleTop', 0); hammerTo(true); }
    B.from = null;
    fitFrame(); cam.lookY = cam.fit.lookY; cam.dist = cam.fit.dist;
    refreshEnv(true);
  }

  function requestPhase(ph) {
    if (ph === phase) return;
    const prev = phase; phase = ph;
    if (!started) return;
    if (ph === 'paused') { goSit(); return; }
    if (ph === 'done') { startDone(); return; }
    if (ph === 'building') {
      if (prev === 'done' || prev === 'idle') { started = false; return; }
      if (prev === 'paused') { go('standUp', 0.6); return; }
      return;
    }
    if (ph === 'idle') started = false;
  }
  function goSit() {
    const s = B.state;
    if (B.work >= 0 && !B.onSlot && carried.visible) { B.onSlot = true; B.off = 0.03; B.offYaw = 0.02; B.setFrom = { p: carried.position.clone(), q: carried.quaternion.clone(), s: carried.scale.x, t: 0 }; }
    if (s === 'settle' && B.work >= 0) commitBlock(B.work);
    B.resume = reduceMotion ? 'rm' : (B.work >= 0 ? 'toFit' : 'next');
    hammerTo(false);
    if (!reduceMotion) B.a = cam.az + Math.PI; // sit facing away from the camera
    B.visible = true; go('sit', reduceMotion ? 0.5 : 1.1);
  }
  function startDone() {
    target = TOTAL;
    if (B.work >= 0) slideHome(B.work);
    hammerTo(false);
    if (reduceMotion) { B.ang = cam.az + Math.PI; B.doneR = 0.58; go('doneWait', 0.4); return; }
    if (B.visible && !['below', 'descend'].includes(B.state)) walkTo(0.03, B.a, true, 'descend'); else if (B.state !== 'descend') go('doneFill', 0.2);
  }
  function walkTo(r, a, backward, next, speed) {
    const x0 = B.pose.px, z0 = B.pose.pz;
    B.walk = { x0, z0, x1: Math.sin(a) * r, z1: Math.cos(a) * r, a, backward, next, speed: speed || (backward ? 0.34 : 0.42), d: 0 };
    B.walk.len = Math.hypot(B.walk.x1 - x0, B.walk.z1 - z0);
    go('walk', 0.25);
  }
  const curbBump = (x, z) => { const r = Math.hypot(x, z); return CURB_H * (1 - clamp(Math.abs(r - (HATCH_R + CURB_R) / 2) / 0.09)); };
  const nextFree = () => (target < TOTAL && bState[target] === 0 ? target : -1);

  // ---------- builder update
  function updateBuilder(dt) {
    B.t += dt; const t = B.t; const P = P0(); const at = aTime;
    const st = B.state;
    const atPolar = (r, a) => { P.px = Math.sin(a) * r; P.pz = Math.cos(a) * r; };
    const holding = B.work >= 0 && carried.visible && !B.onSlot;
    B.carryK += ((holding ? 1 : 0) - B.carryK) * (1 - Math.exp(-dt * 6));
    P.py = floorY; P.yaw = B.a;
    if (st === 'below') {
      B.visible = false; atPolar(0, B.a); P.py = floorY - 1.4;
      if (phase === 'building' && t > 0.9 && Math.abs(floorY - floorTarget) < 0.01) {
        const k = nextFree();
        if (k >= 0 && timeToDue(k) > 5.5 && (Math.abs(cam.az - cam.azT) < 0.25 || t > 3.5)) { takeBlock(k); B.a = blockInfo(k).a; go('emerge', 0); B.from = null; }
        else if (t > 1.6) { B.a = cam.az + Math.PI; go('emerge', 0); B.from = null; } // come up and watch (fast time-lapse)
      }
    } else if (st === 'emerge') {
      B.visible = true; const u = clamp(t / 1.6);
      atPolar(0.02, B.a); P.py = floorY - 1.15 + 1.15 * eo(u);
      climbPose(P, u * TAU * 1.25, B.carryK);
      if (u > 0.75) { const k = (u - 0.75) / 0.25; const Sx = P0(); standPose(Sx, at); if (B.carryK > 0) carryArms(Sx, B.carryK); for (const key of BODY) P[key] = lerp(P[key], Sx[key], eio(k)); }
      if (u >= 1) { if (B.work >= 0) walkTo(PLACE_R, B.a, false, 'set'); else { hammerTo(true); walkTo(PLACE_R, B.a, false, 'idleTop'); } }
    } else if (st === 'walk') {
      const W = B.walk; W.d = Math.min(W.len, W.d + W.speed * dt * (1 - 0.2 * B.carryK)); const u = W.len > 0 ? W.d / W.len : 1;
      P.px = lerp(W.x0, W.x1, u); P.pz = lerp(W.z0, W.z1, u);
      const dir = Math.atan2(W.x1 - W.x0, W.z1 - W.z0);
      P.yaw = W.backward || W.len < 0.05 ? W.a : (u > 0.7 ? lerp(dir, dir + wrapPi(W.a - dir), (u - 0.7) / 0.3) : dir);
      B.ph += (W.speed * dt) / (0.17 * S) * Math.PI * (W.backward ? -1 : 1);
      const fade = Math.min(1, W.d / 0.06, (W.len - W.d) / 0.06 + 0.15);
      walkPose(P, B.ph, B.carryK, clamp(fade));
      P.py = floorY + curbBump(P.px, P.pz);
      if (W.d >= W.len) { B.a = W.a; let nx = W.next; if (nx === 'set' && B.work < 0) nx = 'idleTop'; go(nx, 0.35); if (nx === 'descend') B.visible = true; }
    } else if (st === 'set') {
      atPolar(PLACE_R, B.a); const u = clamp(t / 1.8);
      const Sx = P0(); standPose(Sx, at); carryArms(Sx, B.work >= 0 ? 1 : 0);
      const K = P0(); kneelPose(K, at); K.lShX = K.rShX = -1.0; K.lElX = K.rElX = -0.35; K.sRx = 0.55; K.lShZ = K.rShZ = 0.02;
      const R = P0(); kneelPose(R, at);
      const k1 = eio(clamp(u / 0.6)), k2 = eio(clamp((u - 0.75) / 0.25));
      for (const key of BODY) P[key] = lerp(lerp(Sx[key], K[key], k1), R[key], k2);
      if (u >= 0.8 && !B.onSlot && B.work >= 0) { B.onSlot = true; B.off = 0.035; B.offYaw = 0.025; B.setFrom = { p: carried.position.clone(), q: carried.quaternion.clone(), s: carried.scale.x, t: 0.25 }; const sp = slotPos(B.work); puff(sp.x * 0.85, sp.y, sp.z * 0.85, 6, 0.6); }
      if (u >= 1) { if (B.work >= 0) { B.taps = 2; go('tap', 0.2); } else go('standBack', 0.3); }
    } else if (st === 'tap' || st === 'settle' || st === 'fit') {
      atPolar(PLACE_R, B.a); kneelPose(P, at);
      const dur = st === 'settle' ? 1.05 : 0.8;
      if (st === 'fit') {
        // a gentle working loop while the student focuses
        const ACT = [['tap', 1.0], ['feel', 2.2], ['tap', 1.0], ['look', 3.2], ['rest', 1.6], ['tap', 1.0], ['feel', 2.0], ['look', 2.6]];
        B.actT += dt; let [name, len] = ACT[B.act % ACT.length];
        if (B.actT > len) { B.actT -= len; B.act++; [name, len] = ACT[B.act % ACT.length]; B.impact = false; }
        const u = clamp(B.actT / len);
        if (name === 'tap') { hammerTo(true); tapArm(P, u, 0.55); if (u >= 0.5 && !B.impact) { B.impact = true; if (B.work >= 0) { impactFx(0.4); B.off = Math.max(0.008, B.off * 0.85); } } if (u < 0.5) B.impact = false; }
        else if (name === 'feel') { const w = Math.sin(u * Math.PI); P.lShX = -0.95 - 0.12 * Math.sin(u * TAU * 1.5); P.lElX = -0.35; P.lShZ = -0.1 + 0.18 * Math.sin(u * TAU) * w; P.hRz = 0.18 * w; P.hRx = 0.42; P.sRx = 0.4; P.rShX = -0.5; P.rElX = -1.0; }
        else if (name === 'look') { const w = Math.sin(u * Math.PI); P.sRx = lerp(0.3, 0.12, w); P.hRy = 0.5 * w * (B.act % 2 ? 1 : -1); P.hRx = lerp(0.32, -0.12, w); P.lShX = lerp(-0.8, -0.5, w); P.lElX = lerp(-0.45, -1.1, w); }
        else { const w = Math.sin(u * Math.PI); P.sRx = lerp(0.3, 0.2, w); P.rShX = lerp(-0.45, -0.25, w); P.rElX = lerp(-0.85, -0.5, w); }
        if (B.work >= 0 && target > B.work) { B.impact = false; go('settle', 0.25); }
      } else {
        hammerTo(true);
        const u = clamp((t % dur) / dur); tapArm(P, u, st === 'settle' ? 1.0 : 0.85);
        if (u >= 0.5 && !B.impact) {
          B.impact = true;
          if (st === 'settle') { impactFx(1.2); B.settleT = 0; } else { impactFx(0.7); B.off *= 0.6; B.offYaw *= 0.6; }
        }
        if (u < 0.45) B.impact = false;
        if (st === 'tap' && B.work >= 0 && target > B.work && phase !== 'paused') { B.impact = false; go('settle', 0.2); }
        else if (st === 'tap' && t >= dur * B.taps) { B.impact = false; if (B.work < 0) go('standBack', 0.3); else if (target > B.work) go('settle', 0.2); else { B.act = 0; B.actT = 0; go('fit', 0.3); } }
        if (st === 'settle' && t >= dur) { commitBlock(B.work); go('standBack', 0.2); }
      }
    } else if (st === 'standBack') {
      atPolar(PLACE_R, B.a); const u = clamp(t / 0.9);
      const K = P0(); kneelPose(K, at); const Sx = P0(); standPose(Sx, at);
      for (const key of BODY) P[key] = lerp(K[key], Sx[key], eio(u));
      P.hRx += 0.15 * Math.sin(u * Math.PI); // a small satisfied nod
      if (u > 0.55) hammerTo(false);
      if (u >= 1) {
        const k = nextFree();
        if (phase === 'building' && k >= 0 && timeToDue(k) > 7) walkTo(0.03, B.a, true, 'descend');
        else { hammerTo(true); go('idleTop', 0.4); }
      }
    } else if (st === 'descend') {
      const u = clamp(t / 1.3); atPolar(0.02, B.a);
      P.py = floorY - 1.15 * ei(u); climbPose(P, -u * TAU * 1.25, 0);
      if (u >= 1) { B.visible = false; go(phase === 'done' ? 'doneFill' : 'below', 0); B.from = null; }
    } else if (st === 'idleTop') {
      atPolar(PLACE_R, B.a); idlePose(P, at); hammerTo(true);
      const k = nextFree();
      if (phase === 'building' && !reduceMotion && k >= 0 && timeToDue(k) > 8 && t > 1) { hammerTo(false); walkTo(0.03, B.a, true, 'descend'); }
    } else if (st === 'sit') {
      atPolar(0.4, B.a); sitPose(P, at);
    } else if (st === 'standUp') {
      atPolar(0.4, B.a); const Sx = P0(); sitPose(Sx, at); const T = P0(); standPose(T, at); const u = clamp(t / 0.9);
      for (const key of BODY) P[key] = lerp(Sx[key], T[key], eio(u));
      if (u >= 1) {
        if (B.resume === 'rm') { B.act = 0; B.actT = 0; go('fit', 0.5); }
        else if (B.resume === 'toFit' && B.work >= 0) { const wa = blockInfo(B.work).a; cam.azT = cam.az + wrapPi(wa + Math.PI - cam.az); walkTo(PLACE_R, wa, false, 'tapResume', 0.3); }
        else if (nextFree() < 0) go('idleTop', 0.4);
        else walkTo(0.03, B.a, true, 'descend');
      }
    } else if (st === 'tapResume') { B.taps = 1; go(B.work >= 0 ? 'tap' : 'standBack', 0.3); }
    else if (st === 'doneFill') {
      B.visible = false; atPolar(0, B.a); P.py = floorY - 1.4;
      if (nSet >= TOTAL && Math.abs(floorY - TOP_Y) < 0.005 && t > 0.6) { B.a = cam.az + Math.PI; go('doneEmerge', 0); B.from = null; }
    } else if (st === 'doneEmerge') {
      B.visible = true; const u = clamp(t / 1.6); atPolar(0.02, B.a); P.py = floorY - 1.15 + 1.15 * eo(u); climbPose(P, u * TAU * 1.25, 0);
      if (u > 0.75) { const k = (u - 0.75) / 0.25; const Sx = P0(); standPose(Sx, at); for (const key of BODY) P[key] = lerp(P[key], Sx[key], eio(k)); }
      if (u >= 1) walkTo(0.52, B.a, false, 'doneTurn');
    } else if (st === 'doneTurn') {
      const u = clamp(t / 3.4), k = eio(u);
      if (!B.turn) { B.turn = { yaw0: B.a, az0: cam.az }; }
      atPolar(lerp(0.52, 0.58, k), B.turn.yaw0);
      P.yaw = B.turn.yaw0 + Math.PI * k; standPose(P, at);
      const stepPh = u * TAU * 2.5; const w = Math.sin(u * Math.PI);
      P.lHipX = -0.18 * Math.max(0, Math.sin(stepPh)) * w; P.lKnX = 0.05 + 0.35 * Math.max(0, Math.sin(stepPh)) * w;
      P.rHipX = -0.18 * Math.max(0, -Math.sin(stepPh)) * w; P.rKnX = 0.05 + 0.35 * Math.max(0, -Math.sin(stepPh)) * w;
      cam.scripted = B.turn.az0 + (Math.PI - 0.5) * k;
      lantern.visible = true; lantern.position.y = floorY - 1.5 + 1.5 * eio(clamp((t - 1.2) / 2.1));
      if (u >= 1 && t > 3.5) { cam.scripted = null; cam.az = cam.azT = B.turn.az0 + Math.PI - 0.5; cam.v = 0; B.a = B.turn.yaw0 + Math.PI; B.doneR = 0.58; B.ang = B.turn.yaw0; B.turn = null; go('doneLantern', 0.2); }
    } else if (st === 'doneWait') { // reduced motion: wait for the top floor, then the lantern simply lights
      atPolar(0.3, B.a); standPose(P, at); P.yaw = B.a;
      if (nSet >= TOTAL && Math.abs(floorY - TOP_Y) < 0.01) { B.ang = cam.az + Math.PI; B.doneR = 0.58; lantern.visible = true; go('doneLantern', 0.5); }
    } else if (st === 'doneLantern' || st === 'doneRest') {
      if (B.ang === undefined) { B.ang = B.a - Math.PI; B.doneR = 0.58; }
      atPolar(B.doneR, B.ang); P.yaw = B.ang + Math.PI; standPose(P, at);
      const u = st === 'doneRest' ? 1 : clamp(t / 3.4);
      lantern.visible = true; lantern.position.y = floorY;
      if (st === 'doneLantern') lampAmt = Math.max(lampAmt, eio(clamp((t - 0.3) / 2.2)));
      const look = eio(clamp((u - 0.15) / 0.5));
      P.hRx = lerp(0, -0.5, look) + 0.03 * Math.sin(at * 0.6); P.sRx = lerp(0.03, -0.07, look);
      const hips = eio(clamp((u - 0.55) / 0.4));
      P.lShZ = P.rShZ = lerp(0.08, 0.42, hips); P.lShX = P.rShX = lerp(0.05, 0.18, hips); P.lElX = P.rElX = lerp(-0.18, -1.45, hips);
      if (st === 'doneLantern' && u >= 1) go('doneRest', 0.01);
    }
    // blend from previous state's pose
    let out = P;
    if (B.from && B.t < B.blend) {
      const k = eio(clamp(B.t / B.blend)); out = {};
      for (const key of KEYS) out[key] = key === 'yaw' ? B.from.yaw + wrapPi(P.yaw - B.from.yaw) * k : lerp(B.from[key], P[key], k);
    }
    B.pose = out;
    rig.root.visible = B.visible;
    applyPose(rig, out);
    rig.root.updateMatrixWorld(true);
    // the block glides home by itself (it became due while still in his hands)
    if (B.slide) {
      const Sd = B.slide; Sd.t += realDt / 0.45; const k = eio(clamp(Sd.t)); const s = slotPos(Sd.i);
      tmpV.set(0, s.y, 0); tmpQ.setFromEuler(new THREE.Euler(0, s.a, 0));
      carried.material = Sd.i >= TOTAL - N ? mats.gold : mats.stone; carried.visible = true;
      carried.position.lerpVectors(Sd.p, tmpV, k); carried.position.y += Math.sin(k * Math.PI) * 0.06; carried.quaternion.slerpQuaternions(Sd.q, tmpQ, k); carried.scale.setScalar(lerp(Sd.s, 1, k));
      if (Sd.t >= 1) { bState[Sd.i] = 1; setBlockMatrix(Sd.i); carried.visible = false; B.slide = null; puff(s.x, s.y + 0.02, s.z, 7, 0.7); }
    } else if (B.work >= 0 && carried.visible) {
      if (B.onSlot) {
        if (B.setFrom && B.setFrom.t < 1) {
          B.setFrom.t = Math.min(1, B.setFrom.t + dt / 0.45); const k = eio(B.setFrom.t);
          setCarriedOnSlot(B.work, B.off, B.offYaw, 1); tmpV.copy(carried.position); tmpQ.copy(carried.quaternion);
          carried.position.lerpVectors(B.setFrom.p, tmpV, k); carried.quaternion.slerpQuaternions(B.setFrom.q, tmpQ, k); carried.scale.setScalar(lerp(B.setFrom.s, 1, k));
        } else {
          let off = B.off, oy = B.offYaw;
          if (B.state === 'settle' && B.impact) { B.settleT = (B.settleT || 0) + dt; const k = clamp(B.settleT / 0.3); const kk = k * k; off = lerp(B.off, 0, kk) - 0.006 * Math.sin(clamp((B.settleT - 0.3) / 0.25) * Math.PI); oy = lerp(B.offYaw, 0, eo(k)); }
          setCarriedOnSlot(B.work, off, oy, 1);
        }
      } else {
        rig.carry.getWorldPosition(tmpV); rig.carry.getWorldQuaternion(tmpQ);
        carried.quaternion.copy(tmpQ); carried.scale.setScalar(0.78);
        tmpV2.set(0, -H / 2 * 0.78, -R_MID * 0.78 + 0.12 * S).applyQuaternion(tmpQ); carried.position.copy(tmpV).add(tmpV2);
        if (B.state === 'set') {
          const u = clamp(B.t / 1.8), k = eio(clamp((u - 0.12) / 0.68));
          const sp = slotPos(B.work);
          const qS = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sp.a + 0.025, 0));
          const pS = new THREE.Vector3(0, sp.y + 0.035, 0);
          carried.position.lerp(pS, k); carried.quaternion.slerp(qS, k); carried.scale.setScalar(lerp(0.78, 1, k));
        }
      }
    }
  }

  function impactFx(str) {
    rig.hammerTip.getWorldPosition(tmpV);
    puff(tmpV.x, tmpV.y - 0.02, tmpV.z, Math.round(5 + 7 * str), str);
  }

  // ---------- framing: keep island + tower in the middle band, clock area above, buttons below
  let W = 390, Hh = 844;
  function layout() {
    const portrait = W / Hh < 0.9;
    let top, bot, wf;
    if (portrait) { top = Math.max(Hh / 3 + 24, 372); bot = Hh - Math.max(0.14 * Hh, 118); wf = W / Hh > 0.6 ? 0.78 : 0.88; }
    else { top = Math.max(0.42 * Hh, 378); bot = Hh - Math.max(0.11 * Hh, 96); wf = 0.6; }
    if (bot - top < 0.4 * Hh) { top = 0.3 * Hh; bot = 0.93 * Hh; }
    return { top, bot, wf };
  }
  const _pp = new THREE.Vector3();
  function fitFrame() {
    const L = layout();
    const builderTop = phase === 'done' ? 0 : 1.08;
    const topY = lerp(floorY + builderTop, TOP_Y + 1.42, doneAmt), botY = -1.45;
    const needH = 2 * (L.bot - L.top) / Hh, needW = 2 * L.wf;
    fitCam.aspect = W / Hh; fitCam.updateProjectionMatrix();
    let d = cam.fit.dist || 14, ly = (topY + botY) / 2; const tf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const az = cam.az;
    for (let it = 0; it < 8; it++) {
      fitCam.position.set(Math.sin(az) * Math.cos(EL) * d, ly + Math.sin(EL) * d, Math.cos(az) * Math.cos(EL) * d);
      fitCam.lookAt(0, ly, 0); fitCam.updateMatrixWorld(); fitCam.matrixWorldInverse.copy(fitCam.matrixWorld).invert();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      const acc = () => { _pp.project(fitCam); x0 = Math.min(x0, _pp.x); x1 = Math.max(x1, _pp.x); y0 = Math.min(y0, _pp.y); y1 = Math.max(y1, _pp.y); };
      _pp.set(0, topY, 0); acc(); _pp.set(0, botY, 0); acc();
      for (let k = 0; k < 12; k++) { const a = k * TAU / 12; _pp.set(Math.sin(a) * ISL_R, 0, Math.cos(a) * ISL_R); acc(); _pp.set(Math.sin(a) * 1.0, topY - 0.4, Math.cos(a) * 1.0); acc(); _pp.set(Math.sin(a) * 0.5, topY, Math.cos(a) * 0.5); acc(); }
      const s = Math.max((y1 - y0) / needH, (x1 - x0) / needW);
      ly += ((y1 + y0) / 2) * d * tf / Math.cos(EL);
      d *= s;
    }
    cam.fit.dist = d; cam.fit.lookY = ly;
  }
  let sizedAt = '';
  function resize(w, h) {
    // each resize reallocates the drawing buffers: skip calls that change nothing
    const key = Math.round(w) + 'x' + Math.round(h) + '@' + (window.devicePixelRatio || 1);
    if (key === sizedAt) return; sizedAt = key;
    W = Math.max(1, w | 0); Hh = Math.max(1, h | 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    renderer.setSize(W, Hh, false);
    camera.aspect = W / Hh;
    const L = layout();
    camera.setViewOffset(W, Hh, 0, Hh / 2 - (L.top + L.bot) / 2, W, Hh);
    camera.updateProjectionMatrix();
    const s = Hh * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
    dust.mat.uniforms.uScale.value = s; glow.mat.uniforms.uScale.value = s;
    if (started) { fitFrame(); }
  }

  const sunDir = new THREE.Vector3(), cTmp = new THREE.Color();
  function step(dt, real = dt) {
    time += real; realDt = real;
    if (!started) { snap(); started = true; }
    const paused = phase === 'paused';
    // ---- time is truth: which blocks are in place is a pure function of p
    const tgt = phase === 'done' ? TOTAL : targetFor(progress);
    if (tgt < dueN && phase !== 'done') { snap(); return; }
    for (let i = dueN; i < tgt; i++) dueAt[i] = time;
    dueN = Math.max(dueN, tgt); target = tgt;
    for (let i = 0; i < target; i++) {
      const s = bState[i];
      if (s === 1 || s === 2 || s === 4) continue;
      const late = time - dueAt[i];
      if (s === 3) {
        if (B.state === 'settle' && B.work === i && late + Math.max(0, 1.05 - B.t) <= 1.25) continue; // he'll have it home within ~1 s
        const willSettle = ['tap', 'fit'].includes(B.state) && B.onSlot && !paused;
        if (!willSettle || late > 0.3) slideHome(i);
      } else if (late > 0.1 || reduceMotion) dropBlock(i);
    }
    // blocks dropping in: real weight (accelerate, land, a tiny squash and settle, dust)
    for (let i = 0; i < TOTAL; i++) if (bState[i] === 2) {
      bT[i] += realDt; const T = 0.42, h0 = 0.75; const u = bT[i];
      if (u < T) setBlockMatrix(i, h0 * (1 - (u / T) * (u / T)), 0.06 * (1 - u / T));
      else { const v = clamp((u - T) / 0.22); setBlockMatrix(i, 0, 0, 0.05 * Math.sin(v * Math.PI) * (1 - v)); }
      if (u >= T && !landed[i]) { landed[i] = 1; const { a, y } = blockInfo(i); puff(Math.sin(a) * R_MID, y + 0.02, Math.cos(a) * R_MID, 9, 0.85); }
      if (u >= T + 0.22) { bState[i] = 1; setBlockMatrix(i); }
    }
    stones.instanceMatrix.needsUpdate = true; golds.instanceMatrix.needsUpdate = true;
    nSet = 0; while (nSet < TOTAL && bState[nSet] === 1) nSet++;
    // floor follows completed courses (the mason rides it)
    floorTarget = nSet >= TOTAL ? TOP_Y : floorFor(nSet);
    floorY += (floorTarget - floorY) * (1 - Math.exp(-dt * 4)); if (Math.abs(floorTarget - floorY) < 0.002) floorY = floorTarget;
    floor.position.y = floorY;
    pile.count = Math.max(0, Math.ceil(PILE * (1 - nSet / TOTAL)));

    // ---- animation clocks: freeze while paused once he has sat down
    const seated = paused && B.state === 'sit' && B.t > B.blend;
    aTime += seated ? 0 : dt;
    updateBuilder(dt);
    if (phase === 'done') doneAmt = Math.min(1, doneAmt + dt * 0.28); else doneAmt = Math.max(0, doneAmt - dt * 0.3);
    todS += ((phase === 'done' ? 1 : progress) - todS) * (1 - Math.exp(-dt * 0.8));

    // ---- camera
    driftSpeed += ((paused || reduceMotion ? 0 : 1) - driftSpeed) * (1 - Math.exp(-dt * 2.5));
    driftClock += dt * driftSpeed; skyClock += dt * driftSpeed;
    shared.uTime.value = skyClock;
    if (!reduceMotion) {
      if (B.work >= 0 && !['sit', 'standUp'].includes(B.state) && !cam.scripted) { const wa = blockInfo(B.work).a + Math.PI; cam.azT = cam.az + wrapPi(wa - cam.az); }
      if (cam.scripted !== null) { cam.az = cam.scripted; cam.v = 0; }
      else if (!paused) { const w = 0.9; cam.v += (w * w * (cam.azT - cam.az) - 2 * w * cam.v) * dt; cam.v = clamp(cam.v, -0.45, 0.45); cam.az += cam.v * dt; }
      else { cam.v *= Math.exp(-dt * 6); cam.az += cam.v * dt; }
    }
    const kf = seated ? 0 : 1 - Math.exp(-dt * 1.2);   // framing holds still while paused
    if (!seated) fitFrame();
    cam.lookY += (cam.fit.lookY - cam.lookY) * kf; cam.dist += (cam.fit.dist - cam.dist) * kf;
    const az = cam.az + 0.05 * Math.sin(driftClock * 0.11) * (reduceMotion ? 0 : 1);
    const el = EL + 0.012 * Math.sin(driftClock * 0.07 + 1);
    camera.position.set(Math.sin(az) * Math.cos(el) * cam.dist, cam.lookY + Math.sin(el) * cam.dist, Math.cos(az) * Math.cos(el) * cam.dist);
    camera.lookAt(0, cam.lookY, 0);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
    // virtual horizon just behind the upper island so the glow frames the tower and the top stays dark
    _pp.set(0, 0.55, 0).project(camera); tmpV.set(0, _pp.y, 0.5).unproject(camera).sub(camera.position).normalize();
    skyU.uHv.value = tmpV.y;

    // ---- light + colour script (sky, fog, sun and reflections share one palette)
    const t = todS;
    const ps = todSample(t, 'ps'), sel = todSample(t, 'el');
    sunDir.set(Math.sin(az + ps) * Math.cos(sel), Math.sin(sel), Math.cos(az + ps) * Math.cos(sel));
    sun.position.set(0, 1.5, 0).addScaledVector(sunDir, 16); sun.target.position.set(0, 1.5, 0);
    todSample(t, 'sun', sun.color); sun.intensity = todSample(t, 'sunI') * (1 - 0.15 * doneAmt);
    todSample(t, 'hemiS', hemi.color); todSample(t, 'hemiG', hemi.groundColor); hemi.intensity = todSample(t, 'hemiI');
    todSample(t, 'zen', skyU.uZen.value); todSample(t, 'mid', skyU.uMid.value); todSample(t, 'hor', skyU.uHor.value); todSample(t, 'below', skyU.uBelow.value); todSample(t, 'glow', skyU.uGlow.value);
    skyU.uSun.value.copy(sunDir);
    skyU.uStars.value = Math.max(clamp(1 - t / 0.32), 0.4 * doneAmt);
    todSample(t, 'fog', scene.fog.color);
    farMat.color.copy(scene.fog.color).lerp(skyU.uHor.value, 0.35).multiplyScalar(1.05);
    refreshEnv(false);
    // lantern glow
    const Lu = lantern.userData; if (lantern.visible && B.state !== 'doneTurn') lantern.position.y = floorY;
    const flick = 1 + (reduceMotion ? 0 : 0.05 * Math.sin(time * 9.1) + 0.03 * Math.sin(time * 13.7));
    Lu.coreMat.color.setRGB(1.0, 0.72, 0.38).multiplyScalar(0.25 + lampAmt * 3.2 * flick);
    Lu.halo.material.opacity = lampAmt * 0.55 * flick; Lu.halo.scale.setScalar(1.6 + lampAmt * 0.8);
    lantern.getWorldPosition(tmpV); lampLight.position.set(0, tmpV.y + 0.45, 0); lampLight.intensity = lampAmt * 5 * flick;

    // ---- particles (frozen while paused)
    if (!reduceMotion && !paused) {
      dust.update(dt);
      glow.update(dt, (p, d) => {
        if (p.kind === 2) {
          p.x += Math.sin(time * 0.3 + p.seed) * 0.03 * d; p.z += Math.cos(time * 0.27 + p.seed * 1.3) * 0.03 * d; p.y += (0.025 + 0.01 * Math.sin(p.seed)) * d;
          if (p.y > 4.6) p.y = 0.2;
          p.fade = (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(time * 0.8 + p.seed * 3))) * (0.35 + 0.65 * t);
          p.r = 1; p.g = lerp(0.9, 0.78, t); p.b = lerp(0.82, 0.5, t);
        }
      });
      if (lampAmt > 0.3 && Math.random() < dt * (low ? 4 : 9) * lampAmt) {
        const a = Math.random() * TAU;
        glow.spawn({ kind: 1, max: 3 + Math.random() * 2.5, x: Math.sin(a) * 0.12, y: lantern.position.y + 0.5, z: Math.cos(a) * 0.12, vx: Math.sin(a) * 0.12, vy: 0.22 + Math.random() * 0.2, vz: Math.cos(a) * 0.12, s0: 0.05, s1: 0.012, a: 0.9, r: 1, g: 0.72, b: 0.36, drag: 0.4, grav: -0.01 });
      }
    }
  }

  function frame(now, resumed) {
    if (disposed) return;
    if (resumed) lastT = now - 1000 / 60; // after a rest: carry on from here, no catch-up
    const real = Math.min(5, Math.max(0, (now - lastT) / 1000)); lastT = now;
    step(Math.min(0.1, real), real); // animation uses a capped step; the timing of blocks uses real time
    if (warm) renderer.render(scene, camera);
  }
  const pace = makePacer(opts.fps || 0, frame);
  // nothing is drawn until the shaders are compiled (the page shows its placeholder meanwhile)
  let warm = false;
  const ready = warmUp(renderer, scene, camera).then(() => { warm = true; pace.poke(3); });
  pace.start();
  resize(canvas.clientWidth || 390, canvas.clientHeight || 844);
  // debug hook for tests (not used by the app)
  canvas.__towerInfo = () => {
    let placed = 0, maxLate = 0; for (let i = 0; i < TOTAL; i++) { if (bState[i] === 1) placed++; else if (i < target) maxLate = Math.max(maxLate, time - dueAt[i]); }
    return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, state: B.state, placed, target, maxLate: +maxLate.toFixed(2), floorY: +floorY.toFixed(3), work: B.work, rate };
  };

  canvas.__towerStep = (sec, fps = 30) => { for (let k = 0; k < Math.round(sec * fps); k++) step(1 / fps); };

  return {
    ready,
    setProgress(p, o) {
      const v = clamp(+p || 0);
      // pace of the session (progress per second), measured over >= 0.5 s so jittery calls can't spike it
      if (anchorT < 0 || v < anchorV || time - anchorT > 10) { anchorT = time; anchorV = v; }
      else if (time - anchorT >= 0.5) { const inst = (v - anchorV) / (time - anchorT); rate = rate ? lerp(rate, inst, 0.5) : inst; anchorT = time; anchorV = v; }
      const changed = v !== progress;
      progress = v;
      if (o && o.instant) { started = false; rate = 0; anchorT = -1; }
      if (changed || (o && o.instant)) pace.poke();
    },
    setPhase(ph) {
      if (!['idle', 'building', 'paused', 'done'].includes(ph)) return;
      if (ph !== phase) pace.restIn(ph === 'paused' ? PAUSE_REST : ph === 'done' ? DONE_REST : null);
      requestPhase(ph);
    },
    resize(w, h) { resize(w, h); pace.poke(); },
    // false while the page isn't showing the world (hidden tab, scrolled away): nothing is drawn
    setShown(v) { pace.show(v); },
    dispose() {
      disposed = true; pace.stop(); cancelAnimationFrame(raf);
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
      envScene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      [stoneTex, paveTex, glowTex].forEach((tx) => tx.dispose());
      if (envRT) envRT.dispose(); pmrem.dispose(); renderer.dispose();
    },
  };
}

export default {
  id: 'tower',
  title: 'The Tower',
  blurb: 'A weathered stone tower rises course by course on a grassy floating island as a small mason carries up each block and taps it home, and a gold lantern lights the top when you finish.',
  mount(canvas, { reduceMotion = false, quality = 'high', fps = 0, maxDpr = 0 } = {}) { return mountTower(canvas, { reduceMotion, quality, fps, maxDpr }); },
};
