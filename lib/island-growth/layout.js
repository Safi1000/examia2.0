// "Your island grows": which pieces a student's island has, and where they sit.
// Pure functions, no three.js: safe to import anywhere (the header component uses
// piecesFor; the 3D scene in scene.js uses islandLayout and the growth helpers).
//
// One full focus block (25 minutes) adds one piece. The layout is seeded by the
// student id and computed for all 120 pieces at once, so the same minutes always
// give the same island and a new block never moves an old piece.
//
// Island space: the island is a disc of radius 1.65 at the origin. The builder
// sits at the desk in the middle, seen from behind. The camera looks along FWD;
// RIGHT is screen right. u = dot(p, RIGHT) (screen x), v = dot(p, FWD) (depth).
// The header's text sits on the screen left, so tall pieces stay on the right.

export const BLOCK_MINUTES = 25;
export const MAX_PIECES = 120;

/** Full focus blocks in a number of all-time focus minutes. */
export function piecesFor(totalMinutes) {
  const m = Number(totalMinutes);
  return Number.isFinite(m) && m > 0 ? Math.floor(m / BLOCK_MINUTES) : 0;
}

/** A stable 32-bit seed from a student id (FNV-1a). */
export function seedFrom(id) {
  const s = String(id ?? '');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// Camera azimuth of the header scene: PI + 0.62 (see scene.js). FWD points away from the camera.
const AZ = 0.62;
export const FWD = [Math.sin(AZ), Math.cos(AZ)]; // (x, z)
export const RIGHT = [-FWD[1], FWD[0]];
const toXZ = (u, v) => [u * RIGHT[0] + v * FWD[0], u * RIGHT[1] + v * FWD[1]];
const uvOf = (x, z) => [x * RIGHT[0] + z * RIGHT[1], x * FWD[0] + z * FWD[1]];

/** The flagstone pad under the desk and builder: nothing is ever placed on it. */
export const PAD = { x: 0.05, z: 0.15, r: 0.62 };

/*
 * The fixed order pieces arrive in (one letter per block):
 * t grass tuft, s stone, b shrub, c cypress, p path stone, B bench, l lantern,
 * w wall segment, f flowers, o round tree, P pond, T tower (3 tiers, then the roof).
 */
const SCHEDULE = [
  // the first blocks each add something easy to spot, even on a phone
  'bfclbsfc', 'tpstlftb', 'pcppBtfs', 'wwftwosb', 'Pflwtcwf',
  'owpfbstT', 'fwwbfolT', 'cfspfsbt', 'pTftocbf', 'Bfbsotfl',
  'Tfbwfbsf', 'ofptsfbt', 'bfwfstsf', 'bfltbfsf', 'tsftbsft',
].join('');

const TALL = new Set(['c', 'o', 'T', 'l']);
const MEDIUM = new Set(['b', 'B', 'w']);
// footprint radius per kind, for spacing
const FOOT = { t: 0.05, s: 0.07, b: 0.12, c: 0.12, p: 0.06, B: 0.16, l: 0.13, w: 0.09, f: 0.07, o: 0.16, P: 0.4, T: 0.22 };

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Can a piece of this kind stand at (x, z)? */
function allowed(kind, x, z) {
  const r = Math.hypot(x, z);
  const [u, v] = uvOf(x, z);
  const foot = FOOT[kind];
  if (Math.hypot(x - PAD.x, z - PAD.z) < PAD.r + foot * 0.6) return false;
  if (r > (TALL.has(kind) ? 1.32 : 1.48) - foot * 0.4) return false;
  if (TALL.has(kind)) {
    // Never in front of or just behind the builder, desk and lamp (they span u -0.35 to 0.7 on screen),
    // never toward the text: the screen right, or far back on either side.
    if (kind === 'l') return u > 0.9 || (u > 0.6 && v < -0.7) || (u < -0.4 && u > -1.05 && v > 0.45);
    if (u > 0.9) return true;
    return kind !== 'T' && u < -0.4 && u > -1.05 && v > 0.7;
  }
  if (MEDIUM.has(kind)) {
    // Nothing between the camera and the builder.
    return !(v < 0.15 && Math.abs(u) < 0.55);
  }
  return true;
}

const cache = new Map();

/**
 * Every piece the island will ever have, in arrival order (index 0 = first block).
 * Each: { i, kind, x, z, rot, s, k } where k is the piece's number within its kind
 * (wall segment, tower tier) and s a small size variation.
 */
export function islandLayout(seed) {
  seed = seed >>> 0;
  if (cache.has(seed)) return cache.get(seed);
  const r = rng(seed ^ 0x9e3779b9);
  for (let i = 0; i < 7; i++) r();
  const kinds = SCHEDULE.slice(0, MAX_PIECES).split('');
  const count = (k) => kinds.filter((q) => q === k).length;
  const placed = []; // [x, z, foot]
  const free = (x, z, foot, ignoreSmall = false) => placed.every(([px, pz, pf, small]) => (ignoreSmall && small) || Math.hypot(x - px, z - pz) > foot + pf);
  const reserve = (x, z, foot, small = false) => placed.push([x, z, foot, small]);

  // 1. Structures first (positions only; they appear when their block comes).
  const spot = (kind, test, tries = 400) => {
    for (let t = 0; t < tries; t++) {
      const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 1.45;
      const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      if (allowed(kind, x, z) && test(x, z) && free(x, z, FOOT[kind])) return [x, z];
    }
    return null;
  };
  // Pond: low, front left, where the camera sees into it (it fills the text side without rising into it).
  const pond = spot('P', (x, z) => { const [u, v] = uvOf(x, z); return u < -0.45 && u > -1.0 && v > -0.95 && v < -0.2 && Math.hypot(x, z) < 1.15; }) || toXZ(-0.75, -0.6);
  reserve(pond[0], pond[1], FOOT.P);
  // Tower: back right.
  const tower = spot('T', (x, z) => { const [u, v] = uvOf(x, z); return u > 0.9 && v > -0.45 && v < 0.35 && Math.hypot(x, z) < 1.2; }) || toXZ(1.0, -0.1);
  reserve(tower[0], tower[1], FOOT.T);
  // keep the line of sight to the tower clear of trees, lanterns and shrubs
  const [tu, tv] = uvOf(tower[0], tower[1]);
  const hidesTower = (x, z) => { const [u, v] = uvOf(x, z); return v < tv + 0.05 && Math.abs(u - tu) < 0.3; };
  // Path: from the pad's edge out to the front right rim, with a gentle bend.
  const nPath = count('p');
  const phi = -0.85 - r() * 0.45; // direction in (u, v): toward the camera, a little to the right
  const bend = (r() - 0.5) * 0.7;
  const pathPts = [];
  for (let k = 0; k < nPath; k++) {
    const t = (k + 0.5) / nPath;
    const d = PAD.r + 0.06 + t * 0.72;
    const ang = phi + bend * t * t;
    const u = Math.cos(ang) * d + (r() - 0.5) * 0.03, v = Math.sin(ang) * d + (r() - 0.5) * 0.03;
    const [ox, oz] = toXZ(u, v);
    pathPts.push([PAD.x + ox, PAD.z + oz, ang]);
  }
  for (const [x, z] of pathPts) reserve(x, z, FOOT.p);
  // Wall: an arc of low segments on the back left rim.
  const nWall = count('w');
  const wallR = 1.4, wStep = 0.2 / wallR;
  const wMid = Math.PI * (0.62 + r() * 0.16); // angle in (u, v): back left
  const wallPts = [];
  for (let k = 0; k < nWall; k++) {
    // grows from the middle outward, alternating sides
    const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * wStep;
    const ang = wMid + off;
    const [x, z] = toXZ(Math.cos(ang) * wallR, Math.sin(ang) * wallR);
    wallPts.push([x, z, Math.atan2(x, z)]); // long side along the rim
  }
  for (const [x, z] of wallPts) reserve(x, z, FOOT.w * 0.8);
  // Benches: one beside the path, one by the pond.
  const benchPts = [];
  {
    const mid = pathPts[Math.floor(pathPts.length * 0.55)] || [0.9, -0.6, -0.8];
    const [px, pz, ang] = mid;
    for (const side of [1, -1]) {
      const nu = Math.cos(ang + side * Math.PI / 2) * 0.24, nv = Math.sin(ang + side * Math.PI / 2) * 0.24;
      const [ox, oz] = toXZ(nu, nv);
      const x = px + ox, z = pz + oz;
      if (allowed('B', x, z) && free(x, z, FOOT.B)) { benchPts.push([x, z, Math.atan2(-ox, -oz)]); reserve(x, z, FOOT.B); break; }
    }
    const a = r() * Math.PI * 2;
    for (let t = 0; t < 24 && benchPts.length < 2; t++) {
      const aa = a + t * 0.6, x = pond[0] + Math.sin(aa) * 0.48, z = pond[1] + Math.cos(aa) * 0.48;
      if (allowed('B', x, z) && free(x, z, FOOT.B)) { benchPts.push([x, z, Math.atan2(pond[0] - x, pond[1] - z)]); reserve(x, z, FOOT.B); }
    }
  }

  // 2. Everything else, in arrival order.
  const out = [];
  const nth = {};
  let lanternN = 0;
  const lanterns = [];
  for (let i = 0; i < kinds.length; i++) {
    const kind = kinds[i];
    const k = (nth[kind] = (nth[kind] ?? -1) + 1);
    const s = 0.85 + r() * 0.3, rot = r() * Math.PI * 2;
    let x, z, ang = rot;
    if (kind === 'p') [x, z, ang] = pathPts[k];
    else if (kind === 'w') [x, z, ang] = wallPts[k];
    else if (kind === 'P') [x, z] = pond;
    else if (kind === 'T') [x, z] = tower;
    else if (kind === 'B') {
      if (benchPts[k]) [x, z, ang] = benchPts[k];
    } else if (kind === 'l' && lanternN < 2 && pathPts.length) {
      // the first two lanterns light the path
      const [px, pz, pa] = pathPts[lanternN === 0 ? 0 : pathPts.length - 1];
      const side = lanternN === 0 ? -1 : 1;
      const [ox, oz] = toXZ(Math.cos(pa + side * Math.PI / 2) * 0.16, Math.sin(pa + side * Math.PI / 2) * 0.16);
      if (allowed('l', px + ox, pz + oz) && free(px + ox, pz + oz, FOOT.l, true) && lanterns.every(([lx, lz]) => Math.hypot(px + ox - lx, pz + oz - lz) > 0.5)) { x = px + ox; z = pz + oz; }
    }
    if (x === undefined) {
      // Seeded search: the first spot with full spacing, else the roomiest one found.
      // Small pieces keep clear of everything; bigger ones may stand over grass and flowers.
      const small = kind === 't' || kind === 'f' || kind === 's';
      let best = null, bestGap = -1e9;
      for (let t = 0; t < 320; t++) {
        const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * 1.48;
        const cx = Math.sin(a) * rr, cz = Math.cos(a) * rr;
        if (!allowed(kind, cx, cz) || (!small && hidesTower(cx, cz))) continue;
        // the first blocks land in the front half, where they show best
        if (i < 12 && (kind === 'b' || kind === 'f' || kind === 's') && uvOf(cx, cz)[1] > 0.1) continue;
        let gap = 1e9;
        for (const [px, pz, pf, ps] of placed) if (small || !ps) gap = Math.min(gap, Math.hypot(cx - px, cz - pz) - FOOT[kind] - pf);
        // lanterns spread out: never a row of them
        if (kind === 'l') for (const [lx, lz] of lanterns) gap = Math.min(gap, Math.hypot(cx - lx, cz - lz) - 0.5);
        if (gap > 0) { best = [cx, cz]; break; }
        if (gap > bestGap) { bestGap = gap; best = [cx, cz]; }
      }
      [x, z] = best || [0.9, -0.9];
      reserve(x, z, FOOT[kind], small);
    }
    if (kind === 'l') { lanternN++; lanterns.push([x, z]); }
    out.push({ i, kind, x, z, rot: ang, s, k });
  }
  cache.set(seed, out);
  return out;
}

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const ease = (t) => t * t * (3 - 2 * t);

/**
 * How grown a piece is once `pieces` blocks are done (later blocks upgrade
 * earlier pieces). Returns a size factor for plants and the lit state for lanterns.
 */
export function growth(piece, pieces) {
  const age = pieces - 1 - piece.i;
  const beyond = clamp01((pieces - MAX_PIECES) / MAX_PIECES); // blocks after the island is full
  switch (piece.kind) {
    case 'c': case 'o': return { size: 0.62 + 0.38 * ease(clamp01(age / 24)) + 0.22 * beyond, lit: false };
    case 'b': return { size: 0.85 + 0.15 * ease(clamp01(age / 12)) + 0.1 * beyond, lit: false };
    case 'l': return { size: 1, lit: age >= 3 || pieces >= MAX_PIECES };
    case 'T': return { size: 1, lit: pieces >= MAX_PIECES + 20 };
    default: return { size: 1, lit: false };
  }
}
