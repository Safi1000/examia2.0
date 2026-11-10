// "Your island grows": the live Home header. The study island from
// design-mockups/portal-scenes/scenes.js (island, builder at the desk seen from
// behind, lamp, sky, fog, the four times of day), drawn live with the student's
// own pieces on it (see layout.js).
//
// Drawn on demand: a frame when pieces, size or time of day change, the rise of
// a new piece, and a very light idle (lamp flicker, a little sway) at about 20
// frames a second. Nothing is drawn while the canvas is off screen or the tab is
// hidden. Loaded only through lib/island-growth/index.ts (three.js stays out of
// the main bundle).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { islandLayout, growth, seedFrom, MAX_PIECES, PAD } from './layout.js';

// ---------- helpers (from scenes.js)
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
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
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = smooth(xf), v = smooth(yf);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
const fbm2 = (x, y) => 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.1 + 5.2, y * 2.1 + 1.3) + 0.15 * vnoise(x * 4.3 + 9.1, y * 4.3 + 7.7);
const GLSL_NOISE = `
float h13(vec3 p){ p=fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vn3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float a=0.5,s=0.0; for(int k=0;k<4;k++){ s+=a*vn3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
`;

// ---------- builder rig (from scenes.js; seated at the desk, seen from behind)
const L1 = 0.21, L2 = 0.215, FOOT = 0.055, S = 1.3;
function makeBuilder(mats) {
  const add = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const G = () => new THREE.Group();
  const r = { root: G(), hips: G(), pelvis: G(), spine: G(), head: G(), shL: G(), shR: G(), elL: G(), elR: G(), hipL: G(), hipR: G(), knL: G(), knR: G(), anL: G(), anR: G() };
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
  const leg = (hip, kn, an, side) => {
    hip.position.set(0.062 * side, 0, 0); r.hips.add(hip);
    add(hip, merge([[new THREE.CapsuleGeometry(0.048, L1 - 0.03, 4, 12), M4(0, -L1 / 2, 0)]]), mats.overall);
    kn.position.y = -L1; hip.add(kn);
    add(kn, merge([[new THREE.CapsuleGeometry(0.042, L2 - 0.03, 4, 12), M4(0, -L2 / 2, 0)]]), mats.overall);
    an.position.y = -L2; kn.add(an);
    add(an, new RoundedBoxGeometry(0.08, 0.062, 0.14, 2, 0.022).translate(0, -FOOT + 0.031, 0.026), mats.boot);
  };
  leg(r.hipL, r.knL, r.anL, -1); leg(r.hipR, r.knR, r.anR, 1);
  // seated at the desk, leaning in to read and write
  const P = { px: 0.02, pz: -0.1, pY: L2 + FOOT, lHipX: -1.52, rHipX: -1.52, lHipZ: 0.1, rHipZ: 0.14, lKnX: 1.42, rKnX: 1.6, lAnX: 0.1, rAnX: -0.08, sRx: 0.36, sRz: 0.02, hRx: 0.42, hRy: -0.08, hRz: 0.03, lShX: -0.62, lShZ: 0.2, lElX: -1.25, rShX: -0.78, rShZ: 0.1, rElX: -1.0 };
  r.root.position.set(P.px, 0, P.pz);
  r.hips.position.y = P.pY;
  r.spine.rotation.set(P.sRx, 0, P.sRz);
  r.head.rotation.set(P.hRx, P.hRy, P.hRz, 'YXZ');
  r.shL.rotation.set(P.lShX, 0, -P.lShZ); r.elL.rotation.x = P.lElX;
  r.shR.rotation.set(P.rShX, 0, P.rShZ); r.elR.rotation.x = P.rElX;
  r.hipL.rotation.set(P.lHipX, 0, -P.lHipZ); r.knL.rotation.x = P.lKnX; r.anL.rotation.x = P.lAnX;
  r.hipR.rotation.set(P.rHipX, 0, P.rHipZ); r.knR.rotation.x = P.rKnX; r.anR.rotation.x = P.rAnX;
  return r.root;
}

// ---------- materials
function makeMats(low) {
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
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; stoneTex.anisotropy = low ? 1 : 8;
  const woodTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d9c3a6'; g.fillRect(0, 0, w, h); const r = rng(5);
    for (let i = 0; i < 70; i++) { const y = r() * h; g.strokeStyle = `rgba(90,60,35,${0.05 + r() * 0.12})`; g.lineWidth = 0.5 + r() * 2.2; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 2.5); g.stroke(); }
  });
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.anisotropy = low ? 1 : 8;
  const ruledTex = canvasTex(256, 360, (g, w, h) => {
    g.fillStyle = '#f4efe6'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,112,100,0.22)'; g.lineWidth = 1.4;
    for (let y = 46; y < h - 16; y += 18) { g.beginPath(); g.moveTo(18, y); g.lineTo(w - 14, y); g.stroke(); }
  });
  const glowTex = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,0.42)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const std = (color, rough, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const mats = {
    textures: [stoneTex, woodTex, ruledTex, glowTex], glowTex,
    stone: std('#d8cfc2', 0.86, 0, { map: stoneTex, envMapIntensity: 0.6 }),
    stoneLight: std('#e6dfd4', 0.84, 0, { map: stoneTex, envMapIntensity: 0.6 }),
    gold: std('#e8aa48', 0.26, 1, { envMapIntensity: 1.5 }),
    ground: std('#ffffff', 0.97, 0, { vertexColors: true, envMapIntensity: 0.45 }),
    rockside: std('#ffffff', 0.93, 0, { vertexColors: true, map: stoneTex, envMapIntensity: 0.55 }),
    rocks: std('#ffffff', 0.9, 0, { vertexColors: true, map: stoneTex, envMapIntensity: 0.5 }),
    tree: std('#ffffff', 0.9, 0, { vertexColors: true, envMapIntensity: 0.4 }),
    grass: std('#ffffff', 0.85, 0, { vertexColors: true, envMapIntensity: 0.35, side: THREE.DoubleSide }),
    tint: std('#ffffff', 0.86, 0, { envMapIntensity: 0.4 }),
    skin: std('#c4906f', 0.62), shirt: std('#ece7df', 0.82), overall: std('#2A3439', 0.78), boot: std('#3a2e28', 0.7),
    hair: std('#2a211c', 0.85), hat: std('#FBC159', 0.32, 0.45, { envMapIntensity: 1.1 }), leather: std('#6b4a33', 0.75),
    wood: std('#8a6446', 0.62, 0, { map: woodTex, envMapIntensity: 0.6 }),
    woodDark: std('#5a4130', 0.7, 0, { map: woodTex, envMapIntensity: 0.5 }),
    paperEdge: std('#e3dccf', 0.95, 0, { envMapIntensity: 0.45 }),
    ruled: std('#ffffff', 0.92, 0, { map: ruledTex, envMapIntensity: 0.5, side: THREE.DoubleSide }),
    cloth: std('#46525A', 0.88),
    coverA: std('#2A3439', 0.75), coverB: std('#7a5a44', 0.72), coverC: std('#cfc6b6', 0.85),
    metalDark: std('#2a2c2e', 0.42, 0.75, { envMapIntensity: 1.0 }),
    graphite: std('#2b2b2b', 0.5, 0.2),
    pencilWood: std('#d9b98d', 0.7),
    mug: std('#46525A', 0.35),
    slate: std('#8a5a40', 0.78, 0, { envMapIntensity: 0.5 }),
    water: std('#4d6570', 0.03, 0.35, { envMapIntensity: 2.2 }),
    mud: std('#4a3f33', 0.95),
  };
  // weathering for stone pieces: tonal variation, pits, lichen (skipped on the light tier)
  if (!low) for (const key of ['stone', 'stoneLight']) {
    mats[key].onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLoc = (modelMatrix * vec4(position, 1.0)).xyz;
          #ifdef USE_INSTANCING
            vLoc = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
          #endif`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vLoc;\n${GLSL_NOISE}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 sp = vLoc * 6.0;
          float n2 = vn3(sp * 3.1 + 11.0), n3 = fbm3(sp * 0.35 + 3.0), n4 = vn3(sp * 8.0 + 5.0);
          diffuseColor.rgb *= mix(0.86, 1.07, n3) * mix(0.95, 1.03, n2);
          diffuseColor.rgb *= 1.0 - 0.16 * smoothstep(0.8, 0.93, n4);
          float lichen = smoothstep(0.64, 0.82, fbm3(sp * 0.5 + 21.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.8, 0.82, 0.68), lichen * 0.45);`);
    };
  }
  // a little sway for trees and shrubs (idle only; height-weighted, per instance phase)
  const uSway = { value: 0 };
  for (const m of [mats.tree, mats.tint]) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uSway = uSway;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSway;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float hh = max(transformed.y, 0.0);
            vec3 ip = instanceMatrix[3].xyz;
            transformed.x += sin(uSway * 1.3 + ip.x * 3.1 + ip.z * 1.7) * 0.016 * hh * hh;
            transformed.z += cos(uSway * 1.05 + ip.z * 2.7) * 0.011 * hh * hh;
          #endif`);
    };
  }
  mats.uSway = uSway;
  return mats;
}

// ---------- the island (from scenes.js makeIsland: polar grass top and layered rock strata)
const R = 1.65, D = 1.35, ISLE_SEED = 2, FLAT = 0.95;
const groundH = (x, z) => {
  const r = Math.hypot(x, z); const rim = clamp((R - r) / 0.25);
  return (0.035 * (fbm2(x * 1.3 + ISLE_SEED * 3, z * 1.3 + 7) - 0.45) + 0.012 * Math.sin(x * 3.1 + z * 2.3)) * rim * smooth(clamp((r - FLAT) / 0.3));
};
function makeIslandBody(mats, low) {
  const grp = new THREE.Group(); const c = new THREE.Color(); const seed = ISLE_SEED;
  const pads = [[PAD.x, PAD.z, 0.72, 0.38]];
  { // ground top
    const RS = low ? 20 : 30, AS = low ? 80 : 128, pos = [], col = [], idx = [];
    const grassA = new THREE.Color('#5f6747'), grassB = new THREE.Color('#7f7d58'), moss = new THREE.Color('#465036'), dirtD = new THREE.Color('#6f604f');
    for (let i = 0; i <= RS; i++) {
      const rr = (R + 0.04) * Math.pow(i / RS, 0.8);
      for (let j = 0; j <= AS; j++) {
        const a = j / AS * TAU, x = Math.sin(a) * rr, z = Math.cos(a) * rr;
        pos.push(x, groundH(x, z) - (i === RS ? 0.03 : 0), z);
        const n = fbm2(x * 2.2 + seed, z * 2.2), n2 = vnoise(x * 7, z * 7);
        c.copy(grassA).lerp(grassB, clamp(n * 1.4 - 0.2)).lerp(moss, clamp((0.45 - n) * 2) * 0.6);
        c.multiplyScalar(0.9 + 0.2 * n2);
        let ao = 1;
        for (const [px, pz, pr, pk] of pads) { const d = Math.hypot(x - px, z - pz); const f = 1 - smooth(clamp((d - pr * 0.7) / (pr * 0.6))); c.lerp(dirtD, f * pk); ao *= 1 - 0.28 * (1 - smooth(clamp((d - pr * 0.45) / (pr * 0.5)))); }
        ao *= 1 - 0.25 * smooth(clamp((rr - R + 0.1) / 0.14));
        c.multiplyScalar(ao);
        col.push(c.r, c.g, c.b);
        if (i < RS && j < AS) { const k = i * (AS + 1) + j; idx.push(k, k + AS + 1, k + 1, k + 1, k + AS + 1, k + AS + 2); }
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const ground = new THREE.Mesh(g, mats.ground); ground.receiveShadow = true; grp.add(ground);
  }
  { // sides: strata with small ledges, darker with depth
    const HS = low ? 30 : 46, AS = low ? 80 : 128, pos2 = [], col2 = [], uv2 = [], idx2 = [];
    const bands = ['#4e3f30', '#a58e6c', '#7a6853', '#b8a07c', '#6c5c4b', '#9e8a6b', '#5e5144', '#8a7762', '#4f463d'].map((h) => new THREE.Color(h));
    const deep = new THREE.Color('#2c2824'); const BT = 0.17 * D / 1.6; const top = new THREE.Color('#4b5034');
    for (let i = 0; i <= HS; i++) {
      const t = i / HS, y0 = -D * Math.pow(t, 1.15);
      for (let j = 0; j <= AS; j++) {
        const a = j / AS * TAU;
        const wob = (0.045 * Math.sin(a * 3 + 1.3 + seed) + 0.03 * Math.sin(a * 7 + 0.4)) * D / 1.6;
        const yb = y0 + wob; const band = Math.max(0, Math.floor((-yb - 0.07 * D / 1.6) / BT) + 1); const bf = ((-yb - 0.07) / BT) % 1;
        const shape = Math.pow(1 - Math.pow(t, 1.7), 0.62);
        const n = 0.55 * Math.sin(a * 3 + y0 * 2 + seed) + 0.3 * Math.sin(a * 7 - y0 * 3 + 1) + 0.2 * Math.sin(a * 13 + y0 * 5) + 0.12 * Math.sin(a * 23 + band * 1.7);
        const ledge = band > 0 ? 0.05 * (hash2(band, 3 + seed) - 0.5) - 0.035 * smooth(clamp(bf * 4)) : 0.03;
        const rr = (R + 0.04) * shape * (1 + (0.07 * n + ledge) * clamp(t * 6));
        const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
        pos2.push(x, y0 + 0.05 * Math.sin(a * 5 + 2) * t * D / 1.6 - (i === 0 ? 0.03 : 0), z);
        c.copy(bands[Math.min(band, bands.length - 1)]).multiplyScalar(0.88 + 0.22 * vnoise(a * 18, y0 * 9)).lerp(deep, clamp(t * 1.15) * 0.8);
        if (band === 0) c.lerp(top, 0.35 * (1 - clamp(bf)));
        col2.push(c.r, c.g, c.b); uv2.push(a * 2.2 * R / 2.16, y0 * 1.4);
        if (i < HS && j < AS) { const k = i * (AS + 1) + j; idx2.push(k, k + 1, k + AS + 1, k + 1, k + AS + 2, k + AS + 1); }
      }
    }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3)); g2.setAttribute('color', new THREE.Float32BufferAttribute(col2, 3)); g2.setAttribute('uv', new THREE.Float32BufferAttribute(uv2, 2)); g2.setIndex(idx2); g2.computeVertexNormals();
    const side = new THREE.Mesh(g2, mats.rockside); side.receiveShadow = true; side.castShadow = true; grp.add(side);
  }
  return grp;
}

// ---------- props (from scenes.js)
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };
const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };
function makeDesk(mats, { w = 0.86, d = 0.44, h = 0.56 } = {}) {
  const g = new THREE.Group();
  g.add(at(mesh(new RoundedBoxGeometry(w, 0.04, d, 3, 0.012), mats.wood), 0, h - 0.02, 0));
  g.add(at(mesh(new RoundedBoxGeometry(w - 0.08, 0.07, d - 0.06, 2, 0.008), mats.woodDark), 0, h - 0.075, 0));
  const legGeo = new RoundedBoxGeometry(0.036, h - 0.04, 0.036, 2, 0.008);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(mesh(legGeo, mats.woodDark), sx * (w / 2 - 0.05), (h - 0.04) / 2, sz * (d / 2 - 0.045)));
  g.add(at(mesh(new RoundedBoxGeometry(w - 0.1, 0.022, 0.022, 2, 0.006), mats.woodDark), 0, 0.11, d / 2 - 0.045));
  g.userData.top = h;
  return g;
}
function makeStool(mats, h = 0.27) {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.13, 0.125, 0.035, 32), mats.wood), 0, h - 0.0175, 0));
  for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + 0.4; const leg = mesh(new THREE.CylinderGeometry(0.014, 0.016, h, 8), mats.woodDark); leg.position.set(Math.sin(a) * 0.085, h / 2 - 0.01, Math.cos(a) * 0.085); leg.rotation.set(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12); g.add(leg); }
  return g;
}
function makeBook(mats, { w = 0.2, t = 0.04, d = 0.27, cover = mats.coverA } = {}) {
  const g = new THREE.Group(); const b = 0.006;
  g.add(at(mesh(new RoundedBoxGeometry(w + 0.008, b, d + 0.01, 1, 0.002), cover), 0.002, b / 2, 0));
  g.add(at(mesh(new RoundedBoxGeometry(w + 0.008, b, d + 0.01, 1, 0.002), cover), 0.002, t - b / 2, 0));
  g.add(at(mesh(new RoundedBoxGeometry(0.012, t, d + 0.01, 2, 0.005), cover), -w / 2 - 0.002, t / 2, 0));
  g.add(at(mesh(new THREE.BoxGeometry(w - 0.006, t - 2 * b, d - 0.006), mats.paperEdge), 0.001, t / 2, 0));
  return g;
}
function makeOpenBook(mats, { w = 0.22, d = 0.3, cover = mats.coverA, pageMat = mats.ruled } = {}) {
  const g = new THREE.Group();
  g.add(at(mesh(new RoundedBoxGeometry(2 * w + 0.03, 0.008, d + 0.02, 1, 0.003), cover), 0, 0.004, 0));
  for (const side of [-1, 1]) {
    for (let layer = 0; layer < 2; layer++) {
      const geo = new THREE.PlaneGeometry(w, d, 24, 1); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) / w + 0.5; const uu = side > 0 ? u : 1 - u; const lift = layer === 0 ? 1 : 0.55;
        const y = 0.008 + 0.024 * lift * Math.sin(Math.min(uu * 2.4, 1) * Math.PI / 2) * (1 - 0.55 * uu) + 0.004 * (1 - uu);
        p.setY(i, y - layer * 0.004);
        if (side < 0) uv.setX(i, 1 - uv.getX(i));
      }
      geo.translate(side * (w / 2 + 0.002), 0, 0); geo.computeVertexNormals();
      g.add(mesh(geo, layer === 0 ? pageMat : mats.paperEdge, layer === 0));
    }
  }
  return g;
}
function makeLamp(mats) {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.018, 32), mats.metalDark), 0, 0.009, 0));
  const a1 = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 10), mats.metalDark); a1.position.set(0, 0.13, -0.03); a1.rotation.x = -0.25; g.add(a1);
  const j = mesh(new THREE.SphereGeometry(0.014, 12, 10), mats.metalDark); j.position.set(0, 0.255, -0.062); g.add(j);
  const a2 = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.2, 10), mats.metalDark); a2.position.set(0, 0.275, 0.03); a2.rotation.x = 1.35; g.add(a2);
  const shade = new THREE.Group(); shade.position.set(0, 0.29, 0.125); shade.rotation.x = 0.55; g.add(shade);
  shade.add(mesh(new THREE.CylinderGeometry(0.022, 0.07, 0.085, 32, 1, true), mats.metalDark));
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.8, 0.5) });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.026, 16, 12), bulbMat); bulb.position.y = -0.03; shade.add(bulb);
  const innerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.62, 0.32), side: THREE.BackSide });
  shade.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.066, 0.08, 32, 1, true), innerMat));
  g.userData = { bulb, bulbMat, innerMat };
  return g;
}
function makePencil(mats, len = 0.2, r = 0.0085) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(r, r, len, 6), mats.cloth); body.rotation.z = Math.PI / 2; g.add(body);
  const cone = mesh(new THREE.ConeGeometry(r, len * 0.12, 6), mats.pencilWood); cone.rotation.z = -Math.PI / 2; cone.position.x = len * 0.56; g.add(cone);
  const tip = mesh(new THREE.ConeGeometry(r * 0.32, len * 0.04, 6), mats.graphite); tip.rotation.z = -Math.PI / 2; tip.position.x = len * 0.6 + 0.004; g.add(tip);
  return g;
}

/** Merge every mesh under `root` into one mesh per material (fewer draw calls for things that never move). */
function bake(root) {
  root.updateMatrixWorld(true);
  const byMat = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = ni(o.geometry).clone(); g.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const e = byMat.get(o.material) || { geos: [], cast: false };
    e.geos.push(g); e.cast = e.cast || o.castShadow; byMat.set(o.material, e);
  });
  const out = new THREE.Group();
  for (const [mat, { geos, cast }] of byMat) { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = cast; m.receiveShadow = true; out.add(m); }
  root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  return out;
}

// ---------- piece geometry
function tuftGeometry() {
  const blade = (h, lean, rot) => { const g = new THREE.BufferGeometry(); const w = 0.008; g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, lean * 0.6, h, lean], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); g.applyMatrix4(M4(0, 0, 0, 0, rot)); return g; };
  const parts = []; const rb = rng(17);
  for (let k = 0; k < 11; k++) { const g = blade(0.035 + rb() * 0.045, (rb() - 0.5) * 0.05, rb() * TAU); g.translate((rb() - 0.5) * 0.05, 0, (rb() - 0.5) * 0.05); const cc = new Float32Array(9); const q = new THREE.Color('#5f6a42'); const tip = new THREE.Color('#c2bb86').lerp(q, rb() * 0.4); cc.set([q.r, q.g, q.b, q.r, q.g, q.b, tip.r, tip.g, tip.b]); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); parts.push(g); }
  return mergeGeometries(parts);
}
function rockGeometry() {
  let rg = new THREE.DodecahedronGeometry(1, 1); rg.deleteAttribute('uv'); rg.deleteAttribute('normal'); rg = mergeVertices(rg);
  const p = rg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.85 + 0.3 * vnoise(x * 2 + 4, z * 2 + y); p.setXYZ(i, x * k, Math.max(-0.35, y) * k, z * k); }
  const cc = new Float32Array(p.count * 3); const c1 = new THREE.Color('#cdc3b2'), c2 = new THREE.Color('#7d8a5c'), q = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); q.copy(c1).multiplyScalar(0.8 + 0.25 * vnoise(p.getX(i) * 3, p.getZ(i) * 3)); if (y > 0.45) q.lerp(c2, 0.35 * vnoise(p.getX(i) * 5, p.getZ(i) * 5 + 3)); cc.set([q.r, q.g, q.b], i * 3); }
  rg.setAttribute('color', new THREE.BufferAttribute(cc, 3)); rg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.count * 2), 2)); rg.computeVertexNormals();
  return rg;
}
function cypressGeometry() {
  const prof = [[0.001, 0], [0.12, 0.05], [0.17, 0.28], [0.16, 0.6], [0.11, 0.95], [0.045, 1.22], [0.001, 1.3]].map(([a, b]) => new THREE.Vector2(a, b));
  let g = new THREE.LatheGeometry(prof, 18); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position; const cc = new Float32Array(p.count * 3); const cB = new THREE.Color('#1f2a22'), cT = new THREE.Color('#3f5341'), q = new THREE.Color(); const seed = 1.7;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i), a = Math.atan2(px, pz);
    const k = 1 + 0.16 * (vnoise(a * 2.5 + seed, py * 6) - 0.5) + 0.06 * Math.sin(py * 22 + a * 3);
    p.setXYZ(i, px * k, py, pz * k);
    q.copy(cB).lerp(cT, clamp(py / 1.2) * (0.6 + 0.5 * vnoise(a * 4, py * 9 + seed)));
    cc.set([q.r, q.g, q.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.computeVertexNormals();
  return g.translate(0, -0.02, 0);
}
function blob(r, detail, seed, hex, dark) {
  let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position; const cc = new Float32Array(p.count * 3); const c0 = new THREE.Color(hex), c1 = new THREE.Color(dark), q = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.86 + 0.28 * vnoise(x * 9 + seed, z * 9 + y * 5);
    p.setXYZ(i, x * k, y * k, z * k);
    q.copy(c1).lerp(c0, clamp(0.35 + y / r * 0.5) * (0.75 + 0.4 * vnoise(x * 14, z * 14 + seed))); cc.set([q.r, q.g, q.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); g.computeVertexNormals();
  return ni(g);
}
// a round-crowned tree (olive or holm oak) on a short trunk
function roundTreeGeometry() {
  const trunk = paint(ni(new THREE.CylinderGeometry(0.022, 0.034, 0.42, 8)), '#4a3a2c').translate(0, 0.21, 0);
  trunk.deleteAttribute('uv');
  const parts = [trunk,
    blob(0.2, 1, 1, '#5d6b44', '#2c3523').translate(0, 0.5, 0),
    blob(0.15, 1, 2, '#66734a', '#2f3926').translate(0.12, 0.43, 0.06),
    blob(0.14, 1, 3, '#55623f', '#2a3322').translate(-0.11, 0.45, -0.05),
    blob(0.11, 1, 4, '#6b7750', '#323c28').translate(0.02, 0.64, -0.03)];
  return mergeGeometries(parts.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; }));
}
function shrubGeometry() {
  let g = new THREE.IcosahedronGeometry(0.16, 1); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.85 + 0.3 * vnoise(x * 8 + 2, z * 8 + y * 4); p.setXYZ(i, x * k, Math.max(y, -0.04) * k * 0.62 + 0.04, z * k * 0.9); }
  g.computeVertexNormals();
  return g;
}
function flagGeometry() { return new THREE.CylinderGeometry(0.07, 0.075, 0.03, 7).translate(0, 0.004, 0); }
function benchGeometry() {
  return merge([
    [new RoundedBoxGeometry(0.34, 0.025, 0.1, 2, 0.008), M4(0, 0.13, 0)],
    [new RoundedBoxGeometry(0.34, 0.06, 0.018, 2, 0.006), M4(0, 0.21, -0.05, -0.12)],
    [new RoundedBoxGeometry(0.03, 0.13, 0.09, 1, 0.006), M4(-0.14, 0.06, 0)],
    [new RoundedBoxGeometry(0.03, 0.13, 0.09, 1, 0.006), M4(0.14, 0.06, 0)],
    [new THREE.BoxGeometry(0.018, 0.1, 0.018), M4(-0.14, 0.17, -0.048)],
    [new THREE.BoxGeometry(0.018, 0.1, 0.018), M4(0.14, 0.17, -0.048)],
  ]);
}
// lantern post: post + cage (dark metal), and the light inside (separate, so it can be lit)
function lanternPostGeometry() {
  const parts = [
    [new THREE.CylinderGeometry(0.03, 0.036, 0.03, 10), M4(0, 0.015, 0)],
    [new THREE.CylinderGeometry(0.009, 0.011, 0.3, 8), M4(0, 0.165, 0)],
    [new THREE.CylinderGeometry(0.034, 0.03, 0.012, 6), M4(0, 0.318, 0)],
    [new THREE.ConeGeometry(0.045, 0.045, 6), M4(0, 0.405, 0)],
    [new THREE.SphereGeometry(0.008, 8, 6), M4(0, 0.433, 0)],
  ];
  for (let k = 0; k < 6; k++) { const a = k * TAU / 6; parts.push([new THREE.CylinderGeometry(0.003, 0.003, 0.07, 4), M4(Math.sin(a) * 0.03, 0.355, Math.cos(a) * 0.03)]); }
  return merge(parts);
}
function wallGeometry() {
  return merge([
    [new RoundedBoxGeometry(0.2, 0.085, 0.075, 2, 0.014), M4(0, 0.035, 0)],
    [new RoundedBoxGeometry(0.21, 0.025, 0.088, 2, 0.01), M4(0, 0.088, 0)],
  ]);
}
function towerTierGeometry() {
  return merge([
    [new THREE.CylinderGeometry(0.15, 0.165, 0.16, 14), M4(0, 0.08, 0)],
    [new THREE.CylinderGeometry(0.168, 0.168, 0.018, 14), M4(0, 0.156, 0)],
    [new RoundedBoxGeometry(0.03, 0.05, 0.06, 1, 0.006), M4(0.15, 0.09, 0)],
  ]);
}

// ---------- sky + environment (from scenes.js)
function makeSky(U, low) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(150, low ? 32 : 64, low ? 20 : 40), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vD; void main(){ vD=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`,
    fragmentShader: `uniform vec3 uZen,uMid,uHor,uBelow,uGlow,uSun,uMoon; uniform float uHv,uStars,uTime,uMoonI,uCloud,uGlowI; varying vec3 vD;
      ${GLSL_NOISE}
      void main(){ vec3 d=normalize(vD); float h=d.y-uHv;
        vec3 c=mix(uHor,uMid,smoothstep(0.0,0.22,h)); c=mix(c,uZen,smoothstep(0.16,0.6,h));
        c=mix(c,uBelow,smoothstep(-0.02,-0.18,h));
        vec2 hz=normalize(d.xz+1e-5), sz=normalize(uSun.xz+1e-5); float s=max(dot(hz,sz),0.0);
        c+=uGlow*uGlowI*(pow(s,3.0)*0.3*exp(-abs(h-0.02)*6.0)+pow(s,16.0)*0.28*exp(-abs(h-0.03)*14.0));
        float dr=uTime*0.004;
        float n=fbm3(vec3(d.x*5.0+dr,d.y*36.0,d.z*5.0-dr*0.5));
        float n2=fbm3(vec3(d.x*3.2-dr,d.y*14.0+4.0,d.z*3.2));
        float m1=exp(-pow((h-0.07)/0.03,2.0)), m2=exp(-pow((h-0.18)/0.045,2.0))*0.6, m3=smoothstep(0.02,-0.07,h)*exp(-pow((h+0.12)/0.13,2.0));
        float cl=(smoothstep(0.5,0.78,n)*(m1+m2)+smoothstep(0.4,0.72,n2)*m3*0.9)*uCloud;
        vec3 lit=mix(uHor*1.12,uGlow*0.9,0.25+0.5*pow(s,2.0)); vec3 shade=mix(uMid,uHor,0.35);
        c=mix(c,mix(shade,lit,smoothstep(0.45,0.85,n*0.6+n2*0.4)),clamp(cl,0.0,1.0)*0.55);
        if(uStars>0.002){ vec3 sp=d*120.0; vec3 id=floor(sp); vec3 f=fract(sp)-0.5; float r=h13(id);
          if(r>0.9){ vec3 off=(vec3(h13(id+3.1),h13(id+7.7),h13(id+1.3))-0.5)*0.5; float dd=length(f-off);
            float sz2=mix(0.05,0.11,pow(h13(id+5.5),4.0)); float w=fwidth(dd)*0.9; float st=1.0-smoothstep(sz2-w,sz2+w,dd);
            c+=vec3(1.0,0.96,0.9)*st*mix(0.15,0.9,pow(h13(id+9.9),3.0))*uStars*smoothstep(0.1,0.4,h)*(1.0-clamp(cl*1.5,0.0,1.0)); } }
        if(uMoonI>0.001){ float md=acos(clamp(dot(d,normalize(uMoon)),-1.0,1.0));
          float disc=1.0-smoothstep(0.0098,0.0114,md);
          float tex=0.88+0.12*vn3(d*900.0);
          c=mix(c,vec3(0.93,0.91,0.86)*tex*1.15,disc*uMoonI);
          c+=vec3(0.75,0.74,0.7)*uMoonI*(exp(-md*28.0)*0.09+exp(-md*7.0)*0.035); }
        c+=(h13(vec3(gl_FragCoord.xy,1.0))-0.5)/255.0;
        gl_FragColor=vec4(c,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  return sky;
}
function makeEnvScene(U) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false,
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
  return s;
}
// The dark wash that keeps the text side readable (same stops as the static renders) plus the vignette.
function makeScrim() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uWide: { value: 1 } },
    transparent: true, depthTest: false, depthWrite: false,
    vertexShader: 'void main(){ gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: `uniform vec2 uRes; uniform float uWide;
      float ramp(float t, float a){ t=clamp(t,0.0,1.0); return t<0.55 ? mix(a,a*0.35,t/0.55) : mix(a*0.35,0.0,(t-0.55)/0.45); }
      void main(){ vec2 p=gl_FragCoord.xy/uRes; float y=1.0-p.y;
        float s = uWide>0.5 ? ramp(p.x/0.6,0.62) : ramp(y/0.66,0.66);
        vec2 px=gl_FragCoord.xy; px.y=uRes.y-px.y; vec2 c=vec2(0.575,0.525)*uRes;
        float r0=min(uRes.x,uRes.y)*0.3, r1=max(uRes.x,uRes.y)*0.75;
        float v=0.38*clamp((length(px-c)-r0)/(r1-r0),0.0,1.0);
        float a=1.0-(1.0-s)*(1.0-v);
        gl_FragColor=vec4(vec3(20.0,22.0,24.0)/255.0,a); }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  return { scene, mat, cam: new THREE.Camera() };
}

// ---------- framing (from scenes.js fitCamera, plus an object-cover crop so any box matches the static pictures)
const ringPts = (r, y, n = 16) => Array.from({ length: n }, (_, k) => new THREE.Vector3(Math.sin(k / n * TAU) * r, y, Math.cos(k / n * TAU) * r));
function islandPts() { const out = []; for (const t of [0, 0.2, 0.4, 0.55, 0.7, 0.85, 1]) out.push(...ringPts(R * 1.07 * Math.pow(1 - Math.pow(t, 1.7), 0.62) + 0.001, -D * Math.pow(t, 1.15), 24)); return out; }
const FIT_PTS = [...islandPts(), new THREE.Vector3(-0.5, 1.5, 1.2), new THREE.Vector3(0, 1.25, 0)];
const AZ = Math.PI + 0.62;
// the two pictures: desktop 1200x360 (words on the left), phone 390x210 (words below)
const FRAMES = {
  wide: { aspect: 1200 / 360, el: 0.22, rect: { x0: 0.53, x1: 0.92, y0: 0.06, y1: 0.95 }, moon: [0.86, 0.16], islets: [[0.5, 0.76, 72, 1.3], [0.965, 0.64, 80, 1.0]] },
  phone: { aspect: 390 / 210, el: 0.26, rect: { x0: 0.47, x1: 0.97, y0: 0.1, y1: 0.97 }, moon: [0.9, 0.12], islets: [[0.36, 0.6, 70, 1.3]] },
};
function fitCamera(camera, pts, { az, el, Wf, Hf, rect }) {
  camera.aspect = Wf / Hf; camera.clearViewOffset(); camera.updateProjectionMatrix();
  const box = new THREE.Box3().setFromPoints(pts); const look = box.getCenter(new THREE.Vector3());
  let d = box.getSize(new THREE.Vector3()).length() * 2;
  const tf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const needW = (rect.x1 - rect.x0) * 2, needH = (rect.y1 - rect.y0) * 2; const v = new THREE.Vector3();
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  for (let it = 0; it < 14; it++) {
    camera.position.copy(look).addScaledVector(dir, d); camera.lookAt(look); camera.updateMatrixWorld();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { v.copy(p).project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const s = Math.max((x1 - x0) / needW, (y1 - y0) / needH);
    right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1);
    look.addScaledVector(right, ((x0 + x1) / 2) * d * tf * camera.aspect).addScaledVector(up, ((y0 + y1) / 2) * d * tf);
    d *= lerp(1, s, 0.85);
  }
  camera.position.copy(look).addScaledVector(dir, d); camera.lookAt(look); camera.updateMatrixWorld();
  const fx = (rect.x0 + rect.x1) / 2, fy = (rect.y0 + rect.y1) / 2;
  camera.setViewOffset(Wf, Hf, Wf * (0.5 - fx), Hf * (0.5 - fy), Wf, Hf);
  camera.updateProjectionMatrix();
  return [Wf * (0.5 - fx), Hf * (0.5 - fy)];
}
function screenDir(camera, fx, fy) { const v = new THREE.Vector3(fx * 2 - 1, -(fy * 2 - 1), 0.5).unproject(camera); return v.sub(camera.position).normalize(); }
function horizonAt(camera, worldY, fx = 0.5) { const p = new THREE.Vector3(0, worldY, 0).project(camera); return screenDir(camera, fx, (1 - p.y) / 2).y; }

// ---------- times of day (from scenes.js)
const TOD = {
  dawn: { zen: '#101113', mid: '#1a1a1d', hor: '#5d4d4a', below: '#141416', glow: '#e3a98f', glowI: 1.0, sun: '#ffd9bf', sunI: 1.9, sunEl: 0.16, sunB: 0.55, hemiS: '#a9a2a2', hemiG: '#38322d', hemiI: 0.55, fog: '#2f2b2c', stars: 0.55, moon: 0, lamp: 0.55, exp: 1.0, cloud: 1.0, lantern: 0.6 },
  day: { zen: '#151718', mid: '#212324', hor: '#45453f', below: '#18191a', glow: '#efe2c6', glowI: 1.25, skyB: 0.42, sun: '#fff3e0', sunI: 3.0, sunEl: 0.72, sunB: -0.75, hemiS: '#cfcac0', hemiG: '#423c33', hemiI: 0.7, fog: '#3a3a36', stars: 0, moon: 0, lamp: 0.0, exp: 1.0, cloud: 1.0, lantern: 0.22 },
  dusk: { zen: '#121011', mid: '#1f1918', hor: '#7c4630', below: '#161211', glow: '#ffae62', glowI: 1.15, sun: '#ffb06a', sunI: 3.0, sunEl: 0.12, sunB: 0.6, hemiS: '#c39a86', hemiG: '#3a2d26', hemiI: 0.55, fog: '#33241e', stars: 0.15, moon: 0, lamp: 0.85, exp: 1.0, cloud: 1.0, lantern: 0.85 },
  night: { rock: 0.7, zen: '#0a0b0c', mid: '#101113', hor: '#24262a', below: '#0c0d0e', glow: '#55575a', glowI: 0.5, sun: '#c9cdd4', sunI: 0.5, sunEl: 0.75, sunB: 0.45, hemiS: '#5e636a', hemiG: '#211e1c', hemiI: 0.32, fog: '#141517', stars: 1.0, moon: 1, lamp: 1.0, exp: 1.05, cloud: 0.6, lantern: 1.0 },
};
const FLOWER_TONES = ['#efe6d2', '#FBC159', '#d9a19a', '#b9a7c9', '#f4f0e8', '#e8c27a'];
const SHRUB_TONES = ['#6b7d4c', '#788a55', '#66784a', '#7f8f5a'];

/**
 * Mount the island header into a canvas.
 * opts: { quality: 'low' | 'high', reduceMotion, preserveDrawingBuffer, observe (default true) }
 * Throws when WebGL is not available (the caller keeps the static picture).
 */
export function mountIsland(canvas, opts = {}) {
  const low = opts.quality === 'low';
  const reduceMotion = !!opts.reduceMotion;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, alpha: false, powerPreference: low ? 'low-power' : 'default', preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
  const DPR_CAP = low ? 1.25 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = low ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false; // shadows only change with pieces or time of day
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1200 / 360, 0.1, 400);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const U = { uZen: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBelow: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 0.3, 1) }, uMoon: { value: new THREE.Vector3(0, 0.5, 1) }, uMoonI: { value: 0 }, uHv: { value: -0.3 }, uStars: { value: 0 }, uTime: { value: 37 }, uCloud: { value: 1 }, uGlowI: { value: 1 } };
  const envScene = makeEnvScene(U);
  let envRT = null;
  const mats = makeMats(low);
  const scrim = makeScrim();

  // --- the fixed world: island, desk, builder, study things
  scene.add(makeIslandBody(mats, low));
  const props = new THREE.Group();
  { // flagstones under the desk
    const flag = []; const fr = rng(8);
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + fr() * 0.3, rr = i === 0 ? 0 : 0.32 + fr() * 0.12; const r0 = 0.17 + fr() * 0.06; flag.push([new THREE.CylinderGeometry(r0, r0 + 0.01, 0.035, 7), M4(Math.sin(a) * rr + 0.05, 0.004, Math.cos(a) * rr + 0.15, 0, fr() * 3, 0, 1, 1, 0.8 + fr() * 0.3)]); }
    props.add(mesh(merge(flag), mats.stone, false));
  }
  const desk = makeDesk(mats); desk.position.set(0.04, 0, 0.4); props.add(desk);
  const top = desk.userData.top;
  const stool = makeStool(mats, 0.27); stool.position.set(0.02, 0, -0.1); props.add(stool);
  props.add(makeBuilder(mats));
  const ob = makeOpenBook(mats, { w: 0.14, d: 0.2 }); ob.position.set(0.0, top, 0.36); ob.rotation.y = 0.08; props.add(ob);
  const books = new THREE.Group();
  books.add(makeBook(mats, { w: 0.16, t: 0.035, d: 0.22, cover: mats.coverA }));
  const bk2 = makeBook(mats, { w: 0.15, t: 0.03, d: 0.2, cover: mats.coverB }); bk2.position.y = 0.035; bk2.rotation.y = 0.12; books.add(bk2);
  const bk3 = makeBook(mats, { w: 0.14, t: 0.028, d: 0.19, cover: mats.coverC }); bk3.position.y = 0.065; bk3.rotation.y = -0.08; books.add(bk3);
  books.position.set(0.31, top, 0.47); books.rotation.y = 1.4; props.add(books);
  const lamp = makeLamp(mats); lamp.position.set(-0.3, top, 0.52); lamp.rotation.y = Math.PI - 0.55; props.add(lamp);
  const pencil = makePencil(mats, 0.13, 0.006); pencil.position.set(0.17, top + 0.006, 0.3); pencil.rotation.y = 0.5; props.add(pencil);
  const mug = mesh(new THREE.CylinderGeometry(0.032, 0.03, 0.07, 24), mats.mug); mug.position.set(-0.26, top + 0.035, 0.3); props.add(mug);
  props.updateMatrixWorld(true);
  const bulbW = new THREE.Vector3(); lamp.userData.bulb.getWorldPosition(bulbW);
  const { bulbMat, innerMat } = lamp.userData;
  scene.add(bake(props));

  // --- lights
  const key = new THREE.DirectionalLight('#ffffff', 1); key.castShadow = true;
  const SM = low ? 1024 : 2048; key.shadow.mapSize.set(SM, SM);
  Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.5, far: 50 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.025; key.shadow.radius = 4;
  key.target.position.set(0, 0.3, 0); scene.add(key, key.target);
  const hemi = new THREE.HemisphereLight('#ffffff', '#000000', 0.5); scene.add(hemi);
  const spot = new THREE.SpotLight(0xffb866, 0, 3.2, 0.95, 0.65, 1.6); spot.position.copy(bulbW); spot.target.position.set(0.02, top, 0.38);
  spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0006; spot.shadow.radius = 5; scene.add(spot, spot.target);
  const point = new THREE.PointLight(0xffaa55, 0, 2.6, 1.8); point.position.copy(bulbW).add(new THREE.Vector3(0, 0.06, 0)); scene.add(point);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: mats.glowTex, color: 0xffb35c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.scale.set(0.55, 0.55, 1); halo.position.copy(bulbW); scene.add(halo);
  const halo2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: mats.glowTex, color: 0xffa04a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo2.scale.set(1.8, 1.8, 1); halo2.position.copy(bulbW); scene.add(halo2);
  const motesGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-0.6, 0.9, 0.2, 0.55, 1.15, 0.9, -0.2, 1.35, 1.1, 0.9, 0.7, 0.1, -1.0, 0.6, 0.9], 3));
  const motes = new THREE.Points(motesGeo, new THREE.PointsMaterial({ map: mats.glowTex, color: 0xffbe6a, size: 0.06, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  scene.add(motes);
  const sky = makeSky(U, low); scene.add(sky);
  const isletMat = new THREE.MeshBasicMaterial({ color: '#333', fog: false });
  const islets = new THREE.Mesh(new THREE.BufferGeometry(), isletMat); scene.add(islets);

  // --- the pieces: one instanced mesh per kind, filled in arrival order
  const layoutCache = new Map();
  const capFor = (seed) => { if (!layoutCache.has(seed)) layoutCache.set(seed, islandLayout(seed)); return layoutCache.get(seed); };
  // the base grass is the same on both tiers, so the bare placeholder picture matches the live island
  const TUFTS_BASE = 260, TUFT_CLUSTER = low ? 4 : 7, FLOWER_HEADS = low ? 4 : 7;
  const inst = (geo, mat, cap, { cast = true, color = false } = {}) => {
    const m = new THREE.InstancedMesh(geo, mat, cap); m.count = 0; m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false; m.visible = false;
    if (color) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    scene.add(m); return m;
  };
  const M = {
    tuft: inst(tuftGeometry(), mats.grass, TUFTS_BASE + 40 * TUFT_CLUSTER + 40 * 3, { cast: false, color: true }),
    rock: inst(rockGeometry(), mats.rocks, 3 + 40 * 2 + 12),
    shrub: inst(shrubGeometry(), mats.tint, 40, { color: true }),
    flower: inst(new THREE.IcosahedronGeometry(0.028, 0), mats.tint, 40 * FLOWER_HEADS, { cast: false, color: true }),
    cypress: inst(cypressGeometry(), mats.tree, 30),
    round: inst(roundTreeGeometry(), mats.tree, 30),
    flag: inst(flagGeometry(), mats.stone, 30, { cast: false }),
    bench: inst(benchGeometry(), mats.wood, 4),
    post: inst(lanternPostGeometry(), mats.metalDark, 30),
    core: inst(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6).translate(0, 0.355, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 30, { cast: false, color: true }),
    wall: inst(wallGeometry(), mats.stoneLight, 30),
    tier: inst(towerTierGeometry(), mats.stone, 4),
  };
  const roof = mesh(new THREE.ConeGeometry(0.2, 0.22, 14).translate(0, 0.11, 0), mats.slate); roof.visible = false; scene.add(roof);
  const pond = new THREE.Group();
  pond.add(mesh(new THREE.CircleGeometry(0.31, 32).rotateX(-Math.PI / 2).translate(0, 0.012, 0), mats.mud, false));
  pond.add(mesh(new THREE.CircleGeometry(0.25, 32).rotateX(-Math.PI / 2).translate(0, 0.018, 0), mats.water, false));
  pond.visible = false; scene.add(pond);
  // glow for lit lanterns and the tower window: one Points draw for all of them
  const GLOW_CAP = 32;
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(GLOW_CAP * 3), 3));
  glowGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(GLOW_CAP * 3), 3));
  glowGeo.setDrawRange(0, 0);
  const glows = new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: mats.glowTex, size: 0.32, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  glows.frustumCulled = false; scene.add(glows);

  // base grass: a sparse cover the pieces fill in over the term
  const baseTufts = [];
  { const rt = rng(29 + ISLE_SEED); let n = 0;
    for (let tries = 0; tries < TUFTS_BASE * 10 && n < TUFTS_BASE; tries++) {
      const a = rt() * TAU, rr = Math.sqrt(rt()) * (R - 0.03), x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      if (Math.hypot(x - PAD.x, z - PAD.z) < 0.6) continue; const clump = fbm2(x * 2.2 + ISLE_SEED, z * 2.2); if (rt() > clump * 1.7) continue;
      const s = 0.7 + rt() * 0.9; baseTufts.push([x, z, rt() * TAU, s, s * (0.8 + rt() * 0.6), 0.15 + rt() * 0.06, 0.8 + rt() * 0.2]); n++;
    } }
  const baseRocks = [[1.05, -0.35, 0.09, 0.3], [-0.6, -1.05, 0.07, 0.7], [0.3, 1.25, 0.06, 0.5]];

  const state = { seed: null, pieces: -1, tod: null, wide: true, w: 0, h: 0 };
  let rises = []; // { i, start, dur } (ms on the rise clock)
  let riseClock = 0;
  let refs = new Map(); // piece index -> [{ mesh, idx, pos, quat, scl }] (instanced) or [{ obj, scl }]
  const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpC = new THREE.Color(), tmpE = new THREE.Euler();

  function rebuildPieces() {
    const lay = capFor(state.seed);
    const N = Math.max(0, state.pieces);
    const shown = Math.min(N, MAX_PIECES);
    for (const m of Object.values(M)) m.count = 0;
    pond.visible = false; roof.visible = false;
    refs = new Map();
    let glowN = 0;
    const tod = TOD[state.tod] || TOD.day;
    const put = (m, i, x, y, z, ry, sx, sy, sz, color) => {
      const idx = m.count++;
      tmpP.set(x, y, z); tmpQ.setFromEuler(tmpE.set(0, ry, 0)); tmpS.set(sx, sy, sz);
      m.setMatrixAt(idx, tmpM.compose(tmpP, tmpQ, tmpS));
      if (color) m.setColorAt(idx, tmpC.set(color));
      if (i >= 0) { const list = refs.get(i) || []; list.push({ mesh: m, idx, pos: tmpP.clone(), quat: tmpQ.clone(), scl: tmpS.clone() }); refs.set(i, list); }
    };
    const glow = (i, x, y, z, k) => {
      if (glowN >= GLOW_CAP) return;
      glowGeo.attributes.position.setXYZ(glowN, x, y, z);
      glowGeo.attributes.color.setXYZ(glowN, 1.0 * k, 0.68 * k, 0.34 * k);
      if (i >= 0) { const list = refs.get(i) || []; list.push({ glow: glowN, k }); refs.set(i, list); }
      glowN++;
    };
    for (const [x, z, ry, sx, sy, hue, li] of baseTufts) { put(M.tuft, -1, x, groundH(x, z) - 0.005, z, ry, sx, sy, sx); M.tuft.setColorAt(M.tuft.count - 1, tmpC.setHSL(hue, 0.2, li)); }
    for (const [x, z, s, rr] of baseRocks) put(M.rock, -1, x, groundH(x, z) + s * 0.15, z, rr * 9, s * 1.3, s * 0.75, s);
    let tiers = 0;
    for (let n = 0; n < shown; n++) {
      const p = lay[n]; const { x, z, s, rot } = p; const y = groundH(x, z); const g = growth(p, N);
      const pr = rng(p.i * 7919 + 13);
      switch (p.kind) {
        case 't': for (let k = 0; k < TUFT_CLUSTER; k++) { const a = pr() * TAU, d = Math.sqrt(pr()) * 0.1, tx = x + Math.sin(a) * d, tz = z + Math.cos(a) * d, ts = 0.8 + pr() * 0.8; put(M.tuft, p.i, tx, groundH(tx, tz) - 0.005, tz, pr() * TAU, ts, ts * (0.9 + pr() * 0.6), ts); M.tuft.setColorAt(M.tuft.count - 1, tmpC.setHSL(0.15 + pr() * 0.06, 0.22, 0.85 + pr() * 0.2)); } break;
        case 's': { const sc = 0.07 + pr() * 0.045; put(M.rock, p.i, x, y + sc * 0.15, z, rot, sc * 1.3, sc * 0.75, sc); if (pr() < 0.6) { const sc2 = sc * 0.5; put(M.rock, p.i, x + 0.08 * s, groundH(x + 0.08, z) + sc2 * 0.1, z + 0.05, rot * 2, sc2 * 1.2, sc2 * 0.7, sc2); } break; }
        case 'b': { const sc = s * g.size * 1.05; put(M.shrub, p.i, x, y, z, rot, sc, sc * (0.9 + pr() * 0.3), sc * 0.88, SHRUB_TONES[Math.floor(pr() * SHRUB_TONES.length)]); break; }
        case 'c': { const sc = (0.5 + s * 0.28) * g.size; put(M.cypress, p.i, x, y, z, rot, sc, sc * (0.85 + pr() * 0.4), sc); break; }
        case 'o': { const sc = (0.8 + s * 0.3) * g.size; put(M.round, p.i, x, y, z, rot, sc, sc * (0.9 + pr() * 0.25), sc); break; }
        case 'p': put(M.flag, p.i, x, y - 0.006, z, rot + pr(), 0.85 + pr() * 0.3, 1, 0.75 + pr() * 0.3); break;
        case 'B': put(M.bench, p.i, x, y, z, rot, 1, 1, 1); break;
        case 'l': {
          put(M.post, p.i, x, y, z, rot, 1, 1, 1);
          put(M.core, p.i, x, y, z, rot, 1, 1, 1, '#3a332c');
          if (g.lit) { M.core.setColorAt(M.core.count - 1, tmpC.setRGB(2.6, 1.92, 1.04)); glow(p.i, x, y + 0.355, z, tod.lantern); }
          break;
        }
        case 'w': put(M.wall, p.i, x, y - 0.01, z, rot, 1, 0.9 + pr() * 0.25, 1); break;
        case 'f': for (let k = 0; k < FLOWER_HEADS; k++) {
          const a = pr() * TAU, d = Math.sqrt(pr()) * 0.1, fx = x + Math.sin(a) * d, fz = z + Math.cos(a) * d;
          const tone = FLOWER_TONES[(Math.floor(s * 97) + (k % 2)) % FLOWER_TONES.length];
          put(M.flower, p.i, fx, groundH(fx, fz) + 0.035 + pr() * 0.03, fz, 0, 1, 0.8, 1, tone);
          if (k < 3) { put(M.tuft, p.i, fx, groundH(fx, fz) - 0.005, fz, pr() * TAU, 0.7, 0.9, 0.7); M.tuft.setColorAt(M.tuft.count - 1, tmpC.setHSL(0.2, 0.2, 0.75)); }
        } break;
        case 'P': {
          // sits on the highest ground under it, so no part of the water is buried
          let py = y; for (let k = 0; k < 8; k++) py = Math.max(py, groundH(x + Math.sin(k) * 0.28, z + Math.cos(k) * 0.28));
          pond.position.set(x, py, z); pond.visible = true;
          refs.set(p.i, [{ obj: pond, scl: 1 }]);
          for (let k = 0; k < 11; k++) { const a = k / 11 * TAU + pr() * 0.3, rx = x + Math.sin(a) * 0.29, rz = z + Math.cos(a) * 0.29, sc = 0.04 + pr() * 0.03; put(M.rock, p.i, rx, Math.max(py, groundH(rx, rz)) + sc * 0.2, rz, pr() * 6, sc * 1.4, sc * 0.7, sc); }
          break;
        }
        case 'T': {
          if (tiers < 3) { put(M.tier, p.i, x, y + tiers * 0.16, z, 0.4 + tiers * 0.9, 1 - tiers * 0.06, 1, 1 - tiers * 0.06); tiers++; }
          else if (!roof.visible) { roof.position.set(x, y + tiers * 0.16, z); roof.scale.setScalar(0.85); roof.visible = true; refs.set(p.i, [{ obj: roof, scl: 0.85 }]); }
          if (g.lit && tiers >= 3) glow(-1, x + 0.13, y + 2.5 * 0.16 - 0.06, z, tod.lantern * 0.7);
          break;
        }
      }
    }
    for (const m of Object.values(M)) { m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    glowGeo.setDrawRange(0, glowN); glowGeo.attributes.position.needsUpdate = true; glowGeo.attributes.color.needsUpdate = true;
    glows.visible = glowN > 0;
    applyRises(true);
    renderer.shadowMap.needsUpdate = true;
  }

  // Rise: the piece grows up out of the ground (eased), only while it is new.
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function applyRises(force = false) {
    let any = false;
    for (const r of rises) {
      const t = clamp((riseClock - r.start) / r.dur);
      if (t >= 1 && !force && r.done) continue;
      const k = easeOut(t); const list = refs.get(r.i) || [];
      for (const ref of list) {
        if (ref.mesh) {
          tmpP.copy(ref.pos); tmpP.y -= (1 - k) * 0.08;
          tmpS.copy(ref.scl).multiplyScalar(Math.max(0.0001, k));
          ref.mesh.setMatrixAt(ref.idx, tmpM.compose(tmpP, ref.quat, tmpS)); ref.mesh.instanceMatrix.needsUpdate = true;
        } else if (ref.obj) ref.obj.scale.setScalar(Math.max(0.0001, ref.scl * k));
        else if (ref.glow !== undefined) { const kk = ref.k * k; glowGeo.attributes.color.setXYZ(ref.glow, kk, 0.68 * kk, 0.34 * kk); glowGeo.attributes.color.needsUpdate = true; }
      }
      if (t >= 1) r.done = true; else any = true;
    }
    if (!any && rises.length && rises.every((r) => r.done)) { rises = []; renderer.shadowMap.needsUpdate = true; }
    return any;
  }

  // --- framing and time of day
  let fitOff = [0, 0];
  function frame() {
    const { w, h } = state; if (!w || !h) return;
    const a = w / h; const F = a < 2.4 ? FRAMES.phone : FRAMES.wide; state.wide = F === FRAMES.wide;
    // object-cover, anchored right like the static picture: the full frame has the picture's aspect
    let Wf, Hf, cx, cy;
    if (a >= F.aspect) { Wf = w; Hf = w / F.aspect; cx = 0; cy = (Hf - h) / 2; } else { Hf = h; Wf = h * F.aspect; cx = Wf - w; cy = 0; }
    fitOff = fitCamera(camera, FIT_PTS, { az: AZ, el: F.el, Wf, Hf, rect: F.rect });
    // sky, moon and far islets are placed in the full frame, then the view is cropped to the box
    sky.position.copy(camera.position);
    U.uHv.value = horizonAt(camera, 0.1, 0.75);
    U.uMoon.value.copy(screenDir(camera, F.moon[0], F.moon[1]));
    const prof = [[0.001, -1.5], [0.3, -1.2], [0.62, -0.62], [0.9, -0.2], [1.0, -0.04], [0.97, 0.02], [0.001, 0.04]].map(([x, yy]) => new THREE.Vector2(x, yy));
    const parts = []; const r = rng(7);
    for (const [fx, fy, dist, s] of F.islets) {
      const p = camera.position.clone().addScaledVector(screenDir(camera, fx, fy), dist);
      parts.push([new THREE.LatheGeometry(prof, low ? 16 : 28), M4(p.x, p.y, p.z, 0, r() * 3, 0, s, s * (0.75 + r() * 0.3), s)]);
      parts.push([new THREE.ConeGeometry(0.1, 0.6, 10), M4(p.x + s * 0.25, p.y + 0.3 * s, p.z, 0, 0, 0, s, s, s)]);
      parts.push([new THREE.ConeGeometry(0.07, 0.4, 10), M4(p.x - s * 0.2, p.y + 0.2 * s, p.z + s * 0.1, 0, 0, 0, s, s, s)]);
    }
    islets.geometry.dispose(); islets.geometry = merge(parts);
    camera.setViewOffset(Wf, Hf, fitOff[0] + cx, fitOff[1] + cy, w, h);
    camera.updateProjectionMatrix();
    scrim.mat.uniforms.uWide.value = state.wide ? 1 : 0;
  }
  let lampOn = 0;
  function applyTod() {
    const P = TOD[state.tod] || TOD.day;
    U.uZen.value.set(P.zen); U.uMid.value.set(P.mid); U.uHor.value.set(P.hor); U.uBelow.value.set(P.below); U.uGlow.value.set(P.glow);
    renderer.toneMappingExposure = P.exp;
    scene.fog = new THREE.FogExp2(new THREE.Color(P.fog), 0.012);
    U.uStars.value = P.stars; U.uCloud.value = P.cloud; U.uGlowI.value = P.glowI; U.uMoonI.value = P.moon ? 1 : 0;
    // sun relative to the view direction (fixed azimuth, so independent of the box size)
    const fwd = new THREE.Vector3(-Math.sin(AZ), 0, -Math.cos(AZ)).normalize();
    const rightV = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const hz = fwd.clone().multiplyScalar(Math.cos(P.sunB)).addScaledVector(rightV, Math.sin(P.sunB)).normalize();
    const sunDir = hz.clone().multiplyScalar(Math.cos(P.sunEl)); sunDir.y = Math.sin(P.sunEl);
    U.uSun.value.copy(sunDir);
    if (P.skyB !== undefined) { const h2 = fwd.clone().multiplyScalar(Math.cos(P.skyB)).addScaledVector(rightV, Math.sin(P.skyB)); h2.y = 0.2; U.uSun.value.copy(h2.normalize()); }
    key.color.set(P.sun); key.intensity = P.sunI; key.position.copy(key.target.position).addScaledVector(sunDir.clone().normalize(), 18);
    hemi.color.set(P.hemiS); hemi.groundColor.set(P.hemiG); hemi.intensity = P.hemiI;
    mats.rockside.color.setScalar(P.rock || 1);
    lampOn = P.lamp;
    bulbMat.color.setRGB(1.0, 0.8, 0.52).multiplyScalar(0.35 + lampOn * 2.4); innerMat.color.setRGB(0.9, 0.62, 0.32).multiplyScalar(0.3 + lampOn * 1.4);
    spot.castShadow = !low && lampOn > 0;
    motes.visible = state.tod === 'night' || state.tod === 'dusk';
    motes.material.opacity = 0.55 * lampOn;
    isletMat.color.set(P.hor).lerp(new THREE.Color(P.mid), 0.35).lerp(new THREE.Color(P.glow), 0.06);
    const rt = pmrem.fromScene(envScene, 0, 0.1, 100); scene.environment = rt.texture; if (envRT) envRT.dispose(); envRT = rt;
    setLamp(1);
    renderer.shadowMap.needsUpdate = true;
  }
  function setLamp(f) {
    spot.intensity = 6 * lampOn * f; point.intensity = 1.1 * lampOn * f;
    halo.material.opacity = 0.5 * lampOn * f; halo2.material.opacity = 0.16 * lampOn * f;
    halo.visible = halo2.visible = lampOn > 0;
  }

  // --- drawing: on demand, plus a light idle while visible
  let raf = 0, disposed = false, held = false, onScreen = true, tabShown = document.visibilityState !== 'hidden', dirty = true, lastDraw = 0, lastTick = 0, idleT = 0;
  const IDLE_MS = 50; // ~20 fps
  renderer.info.autoReset = false;
  function draw() {
    renderer.info.reset();
    renderer.setRenderTarget(null); renderer.clear();
    renderer.render(scene, camera);
    renderer.render(scrim.scene, scrim.cam);
  }
  function tick(now) {
    raf = 0;
    if (disposed || held || !onScreen || !tabShown || !state.w) return;
    const dt = lastTick ? Math.min(now - lastTick, 100) : 16; lastTick = now;
    const rising = rises.length > 0;
    if (rising) riseClock += dt;
    const idle = !reduceMotion && now - lastDraw >= IDLE_MS;
    if (dirty || rising || idle) {
      if (!reduceMotion) {
        idleT += (now - (lastDraw || now)) / 1000;
        mats.uSway.value = idleT; U.uTime.value = 37 + idleT;
        if (lampOn > 0) setLamp(1 + 0.05 * Math.sin(idleT * 7.3) * Math.sin(idleT * 2.9 + 1) + 0.025 * Math.sin(idleT * 13.7));
      }
      if (rising) { applyRises(); if (!low && rises.length) renderer.shadowMap.needsUpdate = true; }
      draw(); dirty = false; lastDraw = now;
    }
    if (rises.length || !reduceMotion) raf = requestAnimationFrame(tick);
  }
  function invalidate() { dirty = true; if (!raf && !disposed) { lastTick = 0; raf = requestAnimationFrame(tick); } }

  const io = typeof IntersectionObserver !== 'undefined' && opts.observe !== false
    ? new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; if (onScreen) invalidate(); }, { rootMargin: '64px' }) : null;
  io?.observe(canvas);
  const onVis = () => { tabShown = document.visibilityState !== 'hidden'; if (tabShown) invalidate(); };
  document.addEventListener('visibilitychange', onVis);

  return {
    /** What to show. riseFrom: pieces with index >= riseFrom rise in (default: none). */
    set({ seed, pieces, timeOfDay, riseFrom }) {
      const sd = typeof seed === 'number' ? seed >>> 0 : seedFrom(seed);
      const n = Math.max(0, Math.floor(Number(pieces) || 0));
      const tod = TOD[timeOfDay] ? timeOfDay : 'day';
      const todChanged = tod !== state.tod;
      const changed = sd !== state.seed || n !== state.pieces;
      if (todChanged) { state.tod = tod; applyTod(); }
      if (changed || todChanged) {
        state.seed = sd; state.pieces = n;
        rises = [];
        if (!reduceMotion && typeof riseFrom === 'number' && riseFrom < n) {
          const from = Math.max(riseFrom, n - 5, 0);
          for (let i = from; i < Math.min(n, MAX_PIECES); i++) rises.push({ i, start: riseClock + 650 + (i - from) * 420, dur: 1300 });
        }
        rebuildPieces();
      }
      invalidate();
    },
    resize(w, h) {
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      if (w === state.w && h === state.h) return;
      state.w = w; state.h = h;
      renderer.setSize(w, h, false);
      const pr = renderer.getPixelRatio();
      scrim.mat.uniforms.uRes.value.set(w * pr, h * pr);
      frame(); invalidate();
    },
    /** Stop drawing while covered (the focus room is open on top); draw again when uncovered. */
    hold(on) { held = !!on; if (held) { cancelAnimationFrame(raf); raf = 0; } else invalidate(); },
    /** Draw now (for stills). */
    renderNow() { if (rises.length) { riseClock += 1e6; applyRises(); } draw(); },
    info() { const r = renderer.info.render; return { calls: r.calls, triangles: r.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, pixelRatio: renderer.getPixelRatio() }; },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); io?.disconnect(); document.removeEventListener('visibilitychange', onVis);
      const seen = new Set();
      const free = (o) => { if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); } const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) if (!seen.has(m)) { seen.add(m); m.dispose(); } if (o.isInstancedMesh) o.dispose(); };
      scene.traverse(free); envScene.traverse(free); scrim.scene.traverse(free);
      mats.textures.forEach((t) => t.dispose());
      if (envRT) envRT.dispose(); pmrem.dispose();
      renderer.dispose(); renderer.forceContextLoss();
    },
  };
}

const islandModule = { mount: mountIsland };
export default islandModule;
