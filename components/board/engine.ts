/**
 * Whiteboard engine: the drawing model and the maths, no React.
 *
 * World space is an infinite plane. The camera maps it to the screen:
 *   screen = (world - camera.xy) * camera.z
 * Strokes are stored in world units, so zooming never blurs them.
 */

/** x, y in world units, pressure 0..1. */
export type Pt = [number, number, number];

export interface Stroke {
  id: string;
  /** rect, ellipse, form and text keep two corners in pts. */
  kind: "ink" | "line" | "rect" | "ellipse" | "form" | "text";
  color: string;
  /** Base width in world units. */
  size: number;
  pts: Pt[];
  /** For kind "form": which accounting layout (see FORMS). */
  form?: FormId;
  /** For kind "text": what was typed (size is the font size). */
  text?: string;
  /** For kind "text": the width its lines wrap at, when set by dragging the box's side. */
  boxW?: number;
  /** For kind "text": the words as typed (before wrapping) and the width they were wrapped at,
   * so opening them again never re-breaks the lines. */
  raw?: string;
  wrapW?: number;
  /** For kind "text": bold, italic, and a highlighter behind it. */
  bold?: boolean;
  italic?: boolean;
  hl?: boolean;
  /** For kind "line": drawn as evenly spaced dashes. Left out for a solid line, so old boards and
   * an older tab (which does not know it) simply show a solid line. */
  dotted?: boolean;
}

/** Typed text's style. */
export type TextStyle = { bold?: boolean; italic?: boolean };
/** The font for typed text, in its style. */
export const textFont = (size: number, st: TextStyle = {}) => `${st.italic ? "italic " : ""}${st.bold ? 700 : 500} ${size}px ${boardFont()}`;
/** The highlighter: a soft marker yellow that ink reads clearly through, on a TV too. */
export const HIGHLIGHT = "rgba(255, 213, 0, 0.42)";

export interface Camera {
  x: number;
  y: number;
  z: number;
}

/** A world-space rectangle (what a screen shows). */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Saved colours stay the same (older boards keep working); the light board draws each as its ink.
// Four inks with strong contrast on white, on a TV and in Meet: near-black, a deep royal blue,
// a clear red and a calm green (the same green older boards already used, so they draw as they
// were). Gold from before still draws as it was.
export const COLORS = [
  { name: "Black", value: "#F3F1EC" },
  { name: "Blue", value: "#8FD0F5" },
  { name: "Red", value: "#F07A6A" },
  { name: "Green", value: "#7FD1A6" },
];

export const SIZES = [
  // A little heavier than before, so writing reads clearly on the tablet, the laptop and a TV.
  { name: "Regular", value: 5 },
  { name: "Bold", value: 8 },
];

// ---------------------------------------------------------------- look (paper or night)

export type ThemeId = "paper" | "night";
interface Theme {
  /** Board background. */
  bg: string;
  /** What is printed on the paper (see drawGrid), as [red, green, blue] and how strong each kind is:
   * dots, fine ruled lines, the squares of graph paper, and its heavier line every fifth square. */
  print: { rgb: string; dots: number; lines: number; grid: number; major: number };
  /** What each saved ink colour is drawn as: strokes keep their original colour, so the
   * same board reads on both looks (white writing becomes charcoal on paper). */
  ink: Record<string, string>;
  /** Selection outline and handle. */
  accent: string;
  /** Eraser ring (CSS colours). */
  ring: { border: string; fill: string };
}
export const THEMES: Record<ThemeId, Theme> = {
  paper: {
    // The brand's paper white: crisp on a TV, no glare.
    bg: "#FDFDFB",
    // Faint enough that ink always wins. (The squares are exactly as faint as the old "Faint grid".)
    print: { rgb: "26,29,32", dots: 0.2, lines: 0.085, grid: 0.055, major: 0.115 },
    // Deep, even inks that read from the back of a room and on a TV: the brand charcoal, a royal
    // blue, a clear red, a clear green (5 to 1 against the paper, and plainly green beside the
    // charcoal on a TV) and a deep brand gold (plain gold is too light on white).
    ink: { "#F3F1EC": "#14171A", "#FBC159": "#C98500", "#8FD0F5": "#1D47C9", "#F07A6A": "#CC1F1A", "#7FD1A6": "#15803D" },
    accent: "#0F63A8",
    ring: { border: "rgba(20,22,24,0.55)", fill: "rgba(20,22,24,0.05)" },
  },
  night: {
    // The dark board: the brand charcoal. Every ink is drawn in its own saved (light) shade, all
    // at least 5.7 to 1 against it.
    bg: "#212427",
    print: { rgb: "240,237,232", dots: 0.17, lines: 0.07, grid: 0.055, major: 0.105 },
    ink: {},
    accent: "#FBC159",
    ring: { border: "rgba(255,255,255,0.7)", fill: "rgba(255,255,255,0.05)" },
  },
};
let themeId: ThemeId = "paper";
export const getTheme = () => THEMES[themeId];
export function setTheme(id: ThemeId) {
  themeId = id;
}
/** The colour a stroke is drawn in on the current look. */
export const inkOf = (c: string) => THEMES[themeId].ink[c] ?? c;

export const MIN_Z = 0.2;
export const MAX_Z = 6;
/**
 * How far the laptop may zoom while it follows the tablet. Wider than a screen's own limits: a
 * smaller or differently shaped laptop window has to zoom out further than the tablet to show the
 * same part of the board, and stopping at its own limit cut the edges of the tablet's view off.
 */
export const FOLLOW_MIN_Z = 0.02;
export const FOLLOW_MAX_Z = 30;

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const toWorld = (cam: Camera, sx: number, sy: number): [number, number] => [sx / cam.z + cam.x, sy / cam.z + cam.y];

export const visibleView = (cam: Camera, w: number, h: number): View => ({ x: cam.x, y: cam.y, w: w / cam.z, h: h / cam.z });

/** The part of the board shown in a screen's clear area (inside `pad`). */
export const areaView = (cam: Camera, w: number, h: number, pad: Inset): View => ({
  x: cam.x + pad.l / cam.z,
  y: cam.y + pad.t / cam.z,
  w: Math.max(80, w - pad.l - pad.r) / cam.z,
  h: Math.max(80, h - pad.t - pad.b) / cam.z,
});

/** Space kept clear at each edge of a screen (toolbars, a margin), in screen pixels. */
export type Inset = { t: number; r: number; b: number; l: number };
const NO_INSET: Inset = { t: 0, r: 0, b: 0, l: 0 };

/**
 * Camera that fits a world rectangle inside a w x h screen, centred in the part
 * left clear by `pad`, so nothing ends up under the toolbars or off the edge.
 */
export function fitView(v: View, w: number, h: number, pad: Inset = NO_INSET, minZ = MIN_Z, maxZ = MAX_Z): Camera {
  const iw = Math.max(80, w - pad.l - pad.r);
  const ih = Math.max(80, h - pad.t - pad.b);
  const z = Math.min(maxZ, Math.max(minZ, Math.min(iw / v.w, ih / v.h)));
  const cx = v.x + v.w / 2;
  const cy = v.y + v.h / 2;
  return { x: cx - (pad.l + iw / 2) / z, y: cy - (pad.t + ih / 2) / z, z };
}

/** The clear part of a screen: below the top bars and above the bottom ones, plus a margin. */
export function clearInset(h: number, top: (Element | null)[], bottom: (Element | null)[], margin = 14, left: (Element | null)[] = []): Inset {
  let t = margin;
  let b = margin;
  let l = margin;
  // A toolbar down the left edge (the tablet's).
  for (const el of left) {
    const r = el?.getBoundingClientRect();
    if (r && r.width) l = Math.max(l, r.right + margin);
  }
  for (const el of top) {
    const r = el?.getBoundingClientRect();
    if (r && r.height) t = Math.max(t, r.bottom + margin);
  }
  for (const el of bottom) {
    const r = el?.getBoundingClientRect();
    if (r && r.height) b = Math.max(b, h - r.top + margin);
  }
  return { t, r: margin, b, l };
}

/** Zoom by `factor` keeping the screen point (sx, sy) still. */
export function zoomAt(cam: Camera, factor: number, sx: number, sy: number): Camera {
  const z = Math.min(MAX_Z, Math.max(MIN_Z, cam.z * factor));
  const [wx, wy] = toWorld(cam, sx, sy);
  return { x: wx - sx / z, y: wy - sy / z, z };
}

/**
 * A straight line goes at exactly the angle it is drawn (demand and supply curves, budget lines).
 * Only a line within `tolerance` degrees of level or upright is made exactly so (axes, price
 * lines). `step`: the deliberate constraint (Shift on the laptop): the nearest multiple of that
 * many degrees. Length is kept.
 */
export function snapLine(a: Pt, b: Pt, tolerance = 3, step = 0): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return b;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const nearest = step > 0 ? Math.round(deg / step) * step : Math.round(deg / 90) * 90;
  if (!(step > 0) && Math.abs(deg - nearest) > tolerance) return b;
  const r = (nearest * Math.PI) / 180;
  // Exactly level or upright: the same y (or x) as the start, with no rounding left over.
  const q = ((Math.round(nearest) % 360) + 360) % 360;
  if (q === 0 || q === 180) return [a[0] + (q === 0 ? len : -len), a[1], b[2]];
  if (q === 90 || q === 270) return [a[0], a[1] + (q === 90 ? len : -len), b[2]];
  return [a[0] + Math.cos(r) * len, a[1] + Math.sin(r) * len, b[2]];
}

/** The line's angle from the horizontal, 0° to 90°, for the readout while drawing. */
export function lineAngle(a: Pt, b: Pt): number {
  const deg = Math.abs((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 180;
  return Math.round(deg > 90 ? 180 - deg : deg);
}

/** Light smoothing on incoming pen points: steadies the line without lag. */
export function smoothPoint(prev: Pt | undefined, raw: Pt, amount = 0.45): Pt {
  if (!prev) return raw;
  return [prev[0] + (raw[0] - prev[0]) * (1 - amount), prev[1] + (raw[1] - prev[1]) * (1 - amount), prev[2] + (raw[2] - prev[2]) * 0.35];
}

/**
 * How much to steady a pen point, from how far it moved on screen: slow,
 * careful writing (where the hand shakes) gets more, fast strokes get less so
 * they never lag behind the pen.
 */
export const steadyFor = (stepPx: number) => (stepPx < 1.5 ? 0.66 : stepPx < 4 ? 0.56 : stepPx < 9 ? 0.44 : 0.32);

/**
 * When the pen lifts, the stroke settles into its final, smoother line: points
 * crowded closer than a fraction of the nib are dropped, then the path is
 * eased twice. Ends stay exactly where they were, so letters still join up.
 */
export function settleStroke(pts: Pt[], size: number): Pt[] {
  if (pts.length < 5) return pts;
  const gap = size * 0.3;
  const kept: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const k = kept[kept.length - 1];
    if (Math.hypot(pts[i][0] - k[0], pts[i][1] - k[1]) >= gap) kept.push(pts[i]);
  }
  kept.push(pts[pts.length - 1]);
  let out = kept;
  for (let pass = 0; pass < 2; pass++) {
    out = out.map((p, i) => {
      if (i === 0 || i === out.length - 1) return p;
      const a = out[i - 1];
      const b = out[i + 1];
      // A real corner (the top of a 7, the point of a 4) stays sharp.
      const ux = p[0] - a[0], uy = p[1] - a[1], vx = b[0] - p[0], vy = b[1] - p[1];
      const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
      if (cos < 0.5) return p;
      return [(a[0] + p[0] * 2 + b[0]) / 4, (a[1] + p[1] * 2 + b[1]) / 4, (a[2] + p[2] * 2 + b[2]) / 4] as Pt;
    });
  }
  return out;
}

/**
 * A stroke that is really a straight line: its two ends, else null. `tolerance`: how far it may
 * bow from the straight line between its ends (a share of its length); `slack`: how much longer
 * than that line its own path may be (wobble, doubling back).
 */
export function straightOf(all: Pt[], tolerance = 0.06, slack = 1.18): [Pt, Pt] | null {
  if (all.length < 2) return null;
  // Ignore a little hook or flick where the pen lands and lifts.
  const cut = all.length >= 12 ? Math.floor(all.length * 0.08) : 0;
  const pts = cut ? all.slice(cut, all.length - cut) : all;
  const a = pts[0];
  const b = pts[pts.length - 1];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 1) return null;
  let path = 0;
  let dev = 0;
  for (let i = 1; i < pts.length; i++) {
    path += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    dev = Math.max(dev, distToSeg(pts[i][0], pts[i][1], a, b));
  }
  if (dev > L * tolerance || path > L * slack) return null;
  return [a, b];
}

/**
 * A straight stroke as a ruled line: the line of best fit through the whole stroke (not just the
 * line between its two ends, which a small hook where the pen lands or lifts would tilt), from
 * where the pen began to where it ended. Null when the stroke is not straight.
 */
export function ruledLine(all: Pt[], tolerance = 0.03): [Pt, Pt] | null {
  if (!straightOf(all, tolerance)) return null;
  const cut = all.length >= 12 ? Math.floor(all.length * 0.08) : 0;
  const pts = cut ? all.slice(cut, all.length - cut) : all;
  let mx = 0, my = 0;
  for (const p of pts) {
    mx += p[0];
    my += p[1];
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0, sxy = 0, syy = 0;
  for (const p of pts) {
    sxx += (p[0] - mx) * (p[0] - mx);
    sxy += (p[0] - mx) * (p[1] - my);
    syy += (p[1] - my) * (p[1] - my);
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const onLine = (p: Pt): Pt => {
    const t = (p[0] - mx) * dx + (p[1] - my) * dy;
    return [mx + t * dx, my + t * dy, 0.5];
  };
  return [onLine(all[0]), onLine(all[all.length - 1])];
}

/**
 * A ruled line drawn almost level or upright (within `flat` degrees) is made exactly so, turned
 * about its middle (so an underline stays under its words) and kept the same length. Any other
 * line keeps its own angle: a sloping line on a diagram is meant to slope as drawn.
 */
export function levelLine(a: Pt, b: Pt, flat = 3): [Pt, Pt] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return [a, b];
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const nearest = Math.round(deg / 90) * 90;
  if (Math.abs(deg - nearest) > flat) return [a, b];
  const q = ((nearest % 360) + 360) % 360;
  const cx = (a[0] + b[0]) / 2;
  const cy = (a[1] + b[1]) / 2;
  const hx = q === 0 ? len / 2 : q === 180 ? -len / 2 : 0;
  const hy = q === 90 ? len / 2 : q === 270 ? -len / 2 : 0;
  return [
    [cx - hx, cy - hy, a[2]],
    [cx + hx, cy + hy, b[2]],
  ];
}

/** Roughly flat (h) or upright (v), or neither, for a line's two ends. */
export function lineDir(a: Pt, b: Pt): "h" | "v" | null {
  const deg = Math.abs((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI) % 180;
  const d = deg > 90 ? 180 - deg : deg;
  return d <= 18 ? "h" : d >= 72 ? "v" : null;
}

/**
 * A flat line and an upright line that together make a T account: the upright
 * starts at (or near) the flat line, somewhere in its middle part, and runs
 * down. Returns the T's box (top edge = the flat line), else null.
 */
export function tAccountOf(h: [Pt, Pt], v: [Pt, Pt]): { a: Pt; b: Pt } | null {
  const hx0 = Math.min(h[0][0], h[1][0]);
  const hx1 = Math.max(h[0][0], h[1][0]);
  const hy = (h[0][1] + h[1][1]) / 2;
  const Lh = hx1 - hx0;
  const top = v[0][1] < v[1][1] ? v[0] : v[1];
  const bottom = v[0][1] < v[1][1] ? v[1] : v[0];
  const vx = (top[0] + bottom[0]) / 2;
  const Lv = bottom[1] - top[1];
  if (Lh < 1 || Lv < Lh * 0.25) return null;
  if (vx < hx0 + Lh * 0.3 || vx > hx1 - Lh * 0.3) return null; // not in the middle part
  if (Math.abs(top[1] - hy) > Math.max(Lv * 0.15, Lh * 0.1)) return null; // doesn't start at the bar
  if (bottom[1] <= hy) return null;
  return { a: [hx0, hy, 0.5], b: [hx1, bottom[1], 0.5] };
}

/**
 * Two lines drawn as diagram axes (one up the side, one along the bottom, meeting at the
 * bottom-left corner): the box for clean axes, or null.
 */
export function axesOfPair(h: [Pt, Pt], v: [Pt, Pt]): { a: Pt; b: Pt } | null {
  const left = h[0][0] < h[1][0] ? h[0] : h[1];
  const right = h[0][0] < h[1][0] ? h[1] : h[0];
  const top = v[0][1] < v[1][1] ? v[0] : v[1];
  const bottom = v[0][1] < v[1][1] ? v[1] : v[0];
  const Lh = right[0] - left[0];
  const Lv = bottom[1] - top[1];
  if (Lh < 1 || Lv < 1 || Lv < Lh * 0.3 || Lh < Lv * 0.3) return null;
  const near = Math.max(Lh, Lv) * 0.12;
  // The corner: the bottom of the upright meets the left end of the base.
  if (Math.hypot(bottom[0] - left[0], bottom[1] - left[1]) > near) return null;
  const ox = (bottom[0] + left[0]) / 2;
  const oy = (bottom[1] + left[1]) / 2;
  return { a: [ox, top[1], 0.5], b: [right[0], oy, 0.5] };
}

/**
 * One stroke drawn as an L (down the side, then along the bottom): the box for clean axes, or
 * null. The path has to hug the left and bottom edges of its box all the way.
 */
export function axesOf(pts: Pt[], hug = 0.08): { a: Pt; b: Pt } | null {
  if (pts.length < 6) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 1 || h < 1 || h < w * 0.3 || w < h * 0.3) return null;
  const tol = Math.max(w, h) * hug;
  const first = pts[0];
  const last = pts[pts.length - 1];
  // Starts at the top of the upright, ends at the right of the base (or drawn the other way).
  const startsTop = Math.hypot(first[0] - x0, first[1] - y0) < tol * 2 && Math.hypot(last[0] - x1, last[1] - y1) < tol * 2;
  const startsRight = Math.hypot(first[0] - x1, first[1] - y1) < tol * 2 && Math.hypot(last[0] - x0, last[1] - y0) < tol * 2;
  if (!startsTop && !startsRight) return null;
  // Every point near the left edge or the bottom edge.
  for (const p of pts) if (Math.min(Math.abs(p[0] - x0), Math.abs(p[1] - y1)) > tol) return null;
  return { a: [x0, y0, 0.5], b: [x1, y1, 0.5] };
}

/** Pen pressure to width factor: light touch stays readable, pressing thickens. */
const widthAt = (size: number, p: number) => size * (0.3 + 1.05 * Math.pow(Math.min(1, Math.max(0, p)), 0.8));

/**
 * How heavy a hand-drawn stroke looks, as a share of its pen size (from its pen pressure), so the
 * ruled line or clean shape it is tidied into is drawn the same weight as the writing around it.
 */
export function penWeight(pts: Pt[]): number {
  if (!pts.length) return 0.9;
  let sum = 0;
  for (const p of pts) sum += widthAt(1, p[2]);
  return sum / pts.length;
}

/** Distance from point to segment. */
function distToSeg(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** Does a circle (world units) touch this stroke? Used by the eraser. */
export function hitStroke(s: Stroke, x: number, y: number, r: number): boolean {
  const reach = r + s.size;
  if (s.kind === "ellipse") {
    const { x: bx, y: by, w, h } = box(s);
    const rx = Math.max(0.5, w / 2);
    const ry = Math.max(0.5, h / 2);
    const k = Math.hypot((x - bx - rx) / rx, (y - by - ry) / ry);
    return Math.abs(k - 1) * Math.min(rx, ry) <= reach;
  }
  if (s.kind === "text") {
    const { x: bx, y: by, w, h } = box(s);
    return x >= bx - r && x <= bx + w + r && y >= by - r && y <= by + h + r;
  }
  if (s.kind === "rect" || s.kind === "form") {
    // Only the ruled lines count, so rubbing out a figure inside never removes the layout.
    return shapeParts(s).segs.some(([x0, y0, x1, y1]) => distToSeg(x, y, [x0, y0, 0], [x1, y1, 0]) <= reach);
  }
  if (s.pts.length === 1) return Math.hypot(x - s.pts[0][0], y - s.pts[0][1]) <= reach;
  for (let i = 1; i < s.pts.length; i++) if (distToSeg(x, y, s.pts[i - 1], s.pts[i]) <= reach) return true;
  return false;
}

/** World-space bounds of all strokes (for "fit to board"). */
export function boundsOf(strokes: Stroke[]): View | null {
  if (!strokes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes)
    for (const p of s.pts) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
  const pad = 40;
  return { x: x0 - pad, y: y0 - pad, w: Math.max(200, x1 - x0 + pad * 2), h: Math.max(200, y1 - y0 + pad * 2) };
}

/** Draw one stroke onto a context already transformed to world space. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const ink = inkOf(s.color);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pts = s.pts;
  if (s.kind === "line" && pts.length >= 2) {
    const lw = s.size * 0.95;
    ctx.lineWidth = lw;
    // Dotted: even dashes that grow with the line's weight, in board units (so they stay evenly
    // spaced at any zoom). With round ends each dash shows 3 widths long with 2 widths between.
    if (s.dotted) ctx.setLineDash([lw * 2, lw * 3]);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();
    if (s.dotted) ctx.setLineDash([]);
    return;
  }
  if (s.kind === "rect" || s.kind === "ellipse" || s.kind === "form") {
    drawShape(ctx, s);
    return;
  }
  if (s.kind === "text") {
    const lines = (s.text ?? "").split("\n");
    ctx.font = textFont(s.size, s);
    ctx.textBaseline = "top";
    if (s.hl) {
      // Marker behind each line, a little wider than the words, softly rounded.
      ctx.save();
      ctx.fillStyle = HIGHLIGHT;
      lines.forEach((line, i) => {
        if (!line.trim()) return;
        const w = ctx.measureText(line).width;
        const pad = s.size * 0.18;
        ctx.beginPath();
        ctx.roundRect(pts[0][0] - pad, pts[0][1] + i * s.size * TEXT_LINE - s.size * 0.06, w + pad * 2, s.size * 1.18, s.size * 0.18);
        ctx.fill();
      });
      ctx.restore();
      ctx.fillStyle = ink;
    }
    lines.forEach((line, i) => ctx.fillText(line, pts[0][0], pts[0][1] + i * s.size * TEXT_LINE));
    return;
  }
  // A tap (full stop, decimal point, the dot on an i): a round dot, never an empty outline.
  const tiny = s.size * 0.5;
  if (pts.length === 1 || pts.every((p) => Math.abs(p[0] - pts[0][0]) <= tiny && Math.abs(p[1] - pts[0][1]) <= tiny)) {
    let x = 0, y = 0, pr = 0;
    for (const p of pts) {
      x += p[0];
      y += p[1];
      pr = Math.max(pr, p[2]);
    }
    ctx.beginPath();
    ctx.arc(x / pts.length, y / pts.length, Math.max(widthAt(s.size, pr) / 2, s.size * 0.42), 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fill(inkShape(s));
}

/** A stroke's world box (kept per stroke), to skip what is off screen. */
const boxes = new WeakMap<Stroke, { pts: Pt[]; n: number; b: View }>();
export function strokeBox(s: Stroke): View {
  const hit = boxes.get(s);
  if (hit && hit.pts === s.pts && hit.n === s.pts.length) return hit.b;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of s.pts) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  const pad = s.kind === "text" ? 4 : s.size * 2 + (s.kind === "form" ? 40 : 0); // room for the nib and a form's labels
  const b = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  boxes.set(s, { pts: s.pts, n: s.pts.length, b });
  return b;
}

/** Finished ink never changes, so its outline is worked out once and kept. */
const shapes = new WeakMap<Stroke, { pts: Pt[]; n: number; size: number; p: Path2D }>();
function inkShape(s: Stroke): Path2D {
  const hit = shapes.get(s);
  if (hit && hit.pts === s.pts && hit.n === s.pts.length && hit.size === s.size) return hit.p;
  const p = new Path2D(inkPath(s.pts, s.size));
  shapes.set(s, { pts: s.pts, n: s.pts.length, size: s.size, p });
  return p;
}

/**
 * Pressure ink as one filled shape, like a real pen nib: the outline follows
 * pressure, thins a little on fast strokes, and tapers gently at both ends.
 * Edges are curved through midpoints, so there are no beads or corners.
 */
export function inkPath(pts: Pt[], size: number): string {
  const n = pts.length;
  const widths: number[] = [];
  // Distance along the stroke, so the taper is the same length on short marks and long ones.
  const along: number[] = [0];
  for (let i = 1; i < n; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = along[n - 1];
  const reach = Math.min(size * 3, total / 3) || 1;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const speed = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 / Math.max(0.5, size);
    const fast = Math.max(0.78, 1 - Math.max(0, speed - 1.2) * 0.05);
    const taperIn = Math.min(1, 0.6 + (along[i] / reach) * 0.4);
    const taperOut = Math.min(1, 0.5 + ((total - along[i]) / reach) * 0.5);
    widths.push((widthAt(size, pts[i][2]) / 2) * fast * Math.min(taperIn, taperOut));
  }
  // Even out width changes so pressure never looks lumpy.
  for (let i = 1; i < n - 1; i++) widths[i] = (widths[i - 1] + widths[i] * 2 + widths[i + 1]) / 4;
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const r = widths[i];
    left.push([pts[i][0] - ty * r, pts[i][1] + tx * r]);
    right.push([pts[i][0] + ty * r, pts[i][1] - tx * r]);
  }
  const f = (v: number) => Math.round(v * 100) / 100;
  const edge = (side: Array<[number, number]>) => {
    let d = "";
    for (let i = 1; i < side.length - 1; i++) {
      const mx = (side[i][0] + side[i + 1][0]) / 2;
      const my = (side[i][1] + side[i + 1][1]) / 2;
      d += `Q${f(side[i][0])} ${f(side[i][1])} ${f(mx)} ${f(my)}`;
    }
    const last = side[side.length - 1];
    return d + `L${f(last[0])} ${f(last[1])}`;
  };
  const rEnd = Math.max(0.01, widths[n - 1]);
  const rStart = Math.max(0.01, widths[0]);
  const back = [...right].reverse();
  return (
    `M${f(left[0][0])} ${f(left[0][1])}` +
    edge(left) +
    `A${f(rEnd)} ${f(rEnd)} 0 0 0 ${f(right[n - 1][0])} ${f(right[n - 1][1])}` +
    edge(back) +
    `A${f(rStart)} ${f(rStart)} 0 0 0 ${f(left[0][0])} ${f(left[0][1])}Z`
  );
}

// ---------------------------------------------------------------- shapes and formats

/** Accounting layouts Hamza can drop on the board, drawn to fit the box that is dragged out. */
export const FORMS = [
  { id: "t", name: "T account" },
  { id: "ledger", name: "Ledger account" },
  { id: "cash3", name: "Three column cash book" },
  { id: "journal", name: "Journal" },
  { id: "running", name: "Running balance" },
  { id: "trial", name: "Trial balance" },
  { id: "statement", name: "Statement (two money columns)" },
  { id: "axes", name: "Axes (diagram)" },
] as const;
export type FormId = (typeof FORMS)[number]["id"];

type Seg = [number, number, number, number];
type Label = { text: string; x: number; y: number; w: number; align: "left" | "center" };

/** Column edges (as fractions of a width) and their headings, per layout. */
const SIDES: Record<Exclude<FormId, "t" | "axes">, { cols: number[]; heads: string[]; twoSided?: boolean }> = {
  ledger: { cols: [0, 0.22, 0.72, 1], heads: ["Date", "Details", "$"], twoSided: true },
  cash3: { cols: [0, 0.15, 0.47, 0.64, 0.82, 1], heads: ["Date", "Details", "Disc", "Cash", "Bank"], twoSided: true },
  journal: { cols: [0, 0.14, 0.62, 0.81, 1], heads: ["Date", "Details", "Dr $", "Cr $"] },
  running: { cols: [0, 0.13, 0.49, 0.66, 0.83, 1], heads: ["Date", "Details", "Dr $", "Cr $", "Balance $"] },
  trial: { cols: [0, 0.6, 0.8, 1], heads: ["Account", "Dr $", "Cr $"] },
  statement: { cols: [0, 0.64, 0.82, 1], heads: ["", "$", "$"] },
};

const box = (s: Stroke) => {
  const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
};

/** The ruled lines and headings of a box shape, in world units. */
export function shapeParts(s: Stroke): { segs: Seg[]; labels: Label[]; font: number } {
  const { x, y, w, h } = box(s);
  const segs: Seg[] = [];
  const labels: Label[] = [];
  const font = Math.max(6, Math.min(h * 0.06, w * 0.032, 28));
  if (s.kind === "rect") return { segs: [[x, y, x + w, y], [x + w, y, x + w, y + h], [x + w, y + h, x, y + h], [x, y + h, x, y]], labels, font };
  if (s.kind !== "form") return { segs, labels, font };
  if (s.form === "axes") {
    // Economics diagram axes: the origin bottom left, labelled 0; arrowheads at the far ends.
    const a = Math.max(5, Math.min(w, h) * 0.035, s.size * 2.6);
    const ox = x;
    const oy = y + h;
    segs.push([ox, oy, ox, y], [ox, oy, x + w, oy]);
    segs.push([ox - a * 0.7, y + a * 1.3, ox, y], [ox, y, ox + a * 0.7, y + a * 1.3]);
    segs.push([x + w - a * 1.3, oy - a * 0.7, x + w, oy], [x + w, oy, x + w - a * 1.3, oy + a * 0.7]);
    const f = Math.max(8, Math.min(w, h) * 0.06, 14);
    labels.push({ text: "0", x: ox - f * 0.75, y: oy + f * 1.05, w: f, align: "center" });
    return { segs, labels, font: f };
  }
  const top = y + font * 1.9; // the ruled line under the headings
  if (s.form === "t" || !s.form) {
    // The bar is the box's top edge; Dr and Cr sit just above its two ends.
    const tf = Math.max(6, Math.min(w * 0.055, 26));
    segs.push([x, y, x + w, y], [x + w / 2, y, x + w / 2, y + h]);
    labels.push({ text: "Dr", x: x, y: y - tf * 0.45, w: w * 0.2, align: "left" }, { text: "Cr", x: x + w - tf * 1.3, y: y - tf * 0.45, w: w * 0.2, align: "left" });
    return { segs, labels, font: tf };
  }
  const L = SIDES[s.form];
  const sides = L.twoSided ? [[x, w / 2], [x + w / 2, w / 2]] : [[x, w]];
  if (L.twoSided) {
    labels.push({ text: "Dr", x, y: y - font * 0.5, w: w * 0.1, align: "left" }, { text: "Cr", x: x + w - font * 1.4, y: y - font * 0.5, w: w * 0.1, align: "left" });
  }
  segs.push([x, y, x + w, y], [x, top, x + w, top]);
  for (const [sx, sw] of sides) {
    L.cols.forEach((c, i) => {
      // Outer edges only on single sided layouts; inner rules always.
      if ((i === 0 || i === L.cols.length - 1) && !(L.twoSided && i === L.cols.length - 1 && sx === x)) return;
      segs.push([sx + c * sw, y, sx + c * sw, y + h]);
    });
    L.heads.forEach((t, i) => {
      if (!t) return;
      const c0 = sx + L.cols[i] * sw;
      const cw = (L.cols[i + 1] - L.cols[i]) * sw;
      labels.push({ text: t, x: c0 + cw / 2, y: y + font * 1.35, w: cw - font * 0.4, align: "center" });
    });
  }
  return { segs, labels, font };
}

function drawShape(ctx: CanvasRenderingContext2D, s: Stroke) {
  ctx.lineWidth = s.size * 0.9;
  if (s.kind === "ellipse") {
    const { x, y, w, h } = box(s);
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
    return;
  }
  const { segs, labels, font } = shapeParts(s);
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of segs) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
  if (!labels.length) return;
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.font = `600 ${font}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textBaseline = "alphabetic";
  for (const l of labels) {
    ctx.textAlign = l.align;
    ctx.fillText(l.text, l.x, l.y, Math.max(1, l.w));
  }
  ctx.restore();
}

/** The middle value of a list (0 when it is empty). */
function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/**
 * Hand-drawn closed loop to a clean box or oval, if it is close to one.
 * Returns null when the stroke isn't a clear shape (it then stays as ink).
 * `strict`: how closely it must follow the shape; `gap`: how far apart its two ends may be (both
 * as a share of its size).
 *
 * The clean shape is fitted to where the pen actually ran, not to the furthest it strayed: each
 * side of a box sits on the middle of the points drawn along it (so one bulge or an overshoot at
 * the join does not push the whole side out), and a box or oval drawn nearly square or round comes
 * out exactly square or round.
 */
export function recogniseShape(pts: Pt[], strict = 0.045, gap = 0.22): { kind: "rect" | "ellipse"; a: Pt; b: Pt } | null {
  if (pts.length < 8) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  const w = x1 - x0;
  const h = y1 - y0;
  const diag = Math.hypot(w, h);
  if (w < diag * 0.12 || h < diag * 0.12) return null; // a line, not a loop
  const [s0, e0] = [pts[0], pts[pts.length - 1]];
  if (Math.hypot(e0[0] - s0[0], e0[1] - s0[1]) > diag * gap) return null; // not closed
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  let er = 0;
  let ee = 0;
  // The points drawn along each side of the box (the middle part of each side, clear of the corners).
  const sides: [number[], number[], number[], number[]] = [[], [], [], []];
  for (const p of pts) {
    const dl = Math.abs(p[0] - x0), dr = Math.abs(p[0] - x1), dt = Math.abs(p[1] - y0), db = Math.abs(p[1] - y1);
    const near = Math.min(dl, dr, dt, db);
    er += near;
    const ang = Math.atan2((p[1] - cy) / (h / 2), (p[0] - cx) / (w / 2));
    ee += Math.hypot(p[0] - (cx + Math.cos(ang) * (w / 2)), p[1] - (cy + Math.sin(ang) * (h / 2)));
    const midY = p[1] > y0 + h * 0.2 && p[1] < y1 - h * 0.2;
    const midX = p[0] > x0 + w * 0.2 && p[0] < x1 - w * 0.2;
    if (near === dl && midY) sides[0].push(p[0]);
    else if (near === dr && midY) sides[1].push(p[0]);
    else if (near === dt && midX) sides[2].push(p[1]);
    else if (near === db && midX) sides[3].push(p[1]);
  }
  er /= pts.length * diag;
  ee /= pts.length * diag;
  const best = er <= ee ? "rect" : "ellipse";
  if (Math.min(er, ee) > strict) return null;
  let [l, r, t, b] = [x0, x1, y0, y1];
  if (best === "rect") {
    // Each side where most of it was drawn (never further in than a little way: a side with too few
    // points of its own keeps the box's edge).
    const fit = (v: number[], edge: number, room: number) => (v.length >= 3 && Math.abs(median(v) - edge) < room ? median(v) : edge);
    l = fit(sides[0], x0, w * 0.12);
    r = fit(sides[1], x1, w * 0.12);
    t = fit(sides[2], y0, h * 0.12);
    b = fit(sides[3], y1, h * 0.12);
  }
  // Nearly square or round: exactly so, about the same middle.
  const sw = r - l;
  const sh = b - t;
  if (Math.abs(sw - sh) <= Math.max(sw, sh) * 0.1) {
    const side = (sw + sh) / 2;
    const mx = (l + r) / 2;
    const my = (t + b) / 2;
    [l, r, t, b] = [mx - side / 2, mx + side / 2, my - side / 2, my + side / 2];
  }
  return { kind: best, a: [l, t, 0.5], b: [r, b, 0.5] };
}

/** What a pen stroke is tidied into: a clean box or oval, diagram axes, or a ruled line. */
export type Tidy = { kind: "rect" | "ellipse" | "axes" | "line"; a: Pt; b: Pt };

/**
 * What a finished pen stroke tidies into by itself, with no hold: only big, clear, deliberate
 * shapes. Handwriting never gets here: letters and figures are far smaller than these sizes, and
 * anything that is not plainly a closed box or oval, an L, or a long straight line stays as drawn.
 * `z`: the zoom, so the sizes are what Hamza sees on screen.
 *  - a closed loop at least 110 by 70 on screen that follows a box or an oval closely;
 *  - an L at least 150 by 110, not a tall narrow one (a capital L written large stays a letter);
 *  - a straight stroke at least 120 long: a ruled line, levelled when it is nearly level or upright.
 */
export function tidyStroke(pts: Pt[], z: number): Tidy | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  const w = (x1 - x0) * z;
  const h = (y1 - y0) * z;
  if (w >= 90 && h >= 60) {
    // (A little bigger than before, 110 by 70: a capital O written large for a heading was just
    // inside the old 90 by 60 and came out as a drawn oval.)
    const shape = w >= 110 && h >= 70 ? recogniseShape(pts, 0.032) : null;
    if (shape) return shape;
    const ax = axesOf(pts);
    if (ax && w >= 150 && h >= 110 && w >= h * 0.55) return { kind: "axes", ...ax };
  }
  // (Its length is measured as before, without any little hook at its ends, so nothing shorter than
  // before is taken for a ruled line.)
  const ends = straightOf(pts);
  const line = ends && Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]) * z >= 120 ? ruledLine(pts, 0.03) : null;
  if (line) {
    const [a, b] = levelLine(line[0], line[1]);
    return { kind: "line", a, b };
  }
  return null;
}

/**
 * What a stroke becomes when the pen is held still at its end: the deliberate "tidy this" gesture,
 * so it is more forgiving than tidyStroke and works at any size. A closed loop becomes a box or an
 * oval, an L becomes axes, and a stroke that runs roughly straight becomes a line from where the
 * pen began (made exactly level or upright when within 3° of it, otherwise at its own angle). A real curve (an arc, an S, a letter)
 * is left exactly as drawn: before, it was flattened into the straight line between its ends.
 */
export function holdShape(pts: Pt[], z: number): Tidy | null {
  if (pts.length < 2) return null;
  const shape = recogniseShape(pts, 0.075, 0.3);
  if (shape) return shape;
  const ax = axesOf(pts, 0.12);
  if (ax && (ax.b[0] - ax.a[0]) * z >= 80 && (ax.b[1] - ax.a[1]) * z >= 60) return { kind: "axes", ...ax };
  if (!straightOf(pts, 0.22, 1.5)) return null;
  const a = pts[0];
  return { kind: "line", a, b: snapLine(a, pts[pts.length - 1]) };
}

/** What's printed on the board: nothing, soft dots, fine ruled lines, or squares for graphs. */
export type Backdrop = "plain" | "dots" | "lines" | "grid";
export const BACKDROPS: Backdrop[] = ["plain", "dots", "lines", "grid"];
export const BACKDROP_NAME: Record<Backdrop, string> = { plain: "Plain", dots: "Dots", lines: "Lines", grid: "Squared" };
let backdrop: Backdrop = "plain";
export const getBackdrop = () => backdrop;
export function setBackdrop(b: Backdrop) {
  backdrop = b;
}

/** The paper's own spacing, in board units: one square, one ruled line, one dot. */
export const PAPER_STEP = 40;
/** How much of a level of the print shows when it is `px` apart on screen: all of it from 20px, none under 9px. */
const printFade = (px: number) => Math.max(0, Math.min(1, (px - 9) / 11));

/**
 * The print on the paper: soft dots, fine ruled lines, or squares with a slightly heavier line
 * every fifth (for graphs). It is part of the board, so it moves and zooms with the writing and
 * works as real paper for lining things up. Always fainter than the ink. Zoomed out, the fine
 * level fades away and every fifth carries on, so it never turns into noise.
 *
 * Drawn once into the finished layer (never per pen move), straight in screen pixels: each line is
 * one thin filled bar that sits exactly on the pixels (a crisp hairline at any zoom), all in one path.
 */
export function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) {
  if (backdrop === "plain") return;
  const { rgb, dots, lines, grid, major } = THEMES[themeId].print;
  const z = cam.z;
  // The fine level and every fifth of it. (Far below any tablet zoom, on a laptop following a much
  // bigger screen, both step up together.)
  let step = PAPER_STEP;
  while (step * 5 * z < 9) step *= 5;
  const fine = printFade(step * z);
  const coarse = printFade(step * 5 * z);
  const base = backdrop === "dots" ? dots : backdrop === "lines" ? lines : grid;
  const top = backdrop === "grid" ? major : base;
  // Every fifth is drawn over the fine level, so it only adds what is missing to reach its strength.
  const levels: Array<[number, number]> = [
    [step, base * fine],
    [step * 5, top * coarse - base * fine],
  ];
  // Board units to screen pixels, as the layer is set up: X = k * x + ex.
  const m = ctx.getTransform();
  const k = m.a;
  const dpr = k / z;
  const W = Math.ceil(w * dpr);
  const H = Math.ceil(h * dpr);
  const thick = Math.max(1, Math.round(dpr));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const [gap, alpha] of levels) {
    if (alpha < 0.004) continue;
    const ink = `rgba(${rgb},${Math.round(alpha * 1000) / 1000})`;
    const x0 = Math.floor(cam.x / gap) * gap;
    const y0 = Math.floor(cam.y / gap) * gap;
    const x1 = cam.x + w / z;
    const y1 = cam.y + h / z;
    ctx.fillStyle = ink;
    ctx.beginPath();
    if (backdrop === "dots") {
      // Round dots while there are few enough of them (any normal zoom); zoomed far out, where each is
      // only a couple of pixels and already fading, small squares, which cost next to nothing. A
      // little bigger zoomed in.
      const r = dpr * Math.max(1, Math.min(1.7, 1.15 * Math.sqrt(z)));
      const round = ((x1 - x0) / gap + 1) * ((y1 - y0) / gap + 1) <= 4000;
      const d = Math.max(1, Math.round(r * 2));
      for (let y = y0; y <= y1; y += gap) {
        const Y = k * y + m.f;
        for (let x = x0; x <= x1; x += gap) {
          const X = k * x + m.e;
          if (round) {
            ctx.moveTo(X + r, Y);
            ctx.arc(X, Y, r, 0, Math.PI * 2);
          } else ctx.rect(Math.round(X - d / 2), Math.round(Y - d / 2), d, d);
        }
      }
      ctx.fill();
      continue;
    }
    ctx.fillStyle = ink;
    ctx.beginPath();
    if (backdrop === "grid") for (let x = x0; x <= x1; x += gap) ctx.rect(Math.round(k * x + m.e), 0, thick, H);
    for (let y = y0; y <= y1; y += gap) ctx.rect(0, Math.round(k * y + m.f), W, thick);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- typed text

/** Line height of typed text, as a share of its font size. */
export const TEXT_LINE = 1.25;
/** Font size on screen for each pen size (fine, medium, bold). */
export const TEXT_PX = [32, 44];

let font = "";
/** The site's own sans font, so typed text matches the portal. */
export function boardFont(): string {
  // Read from the board itself, the same font its text box uses, so words don't shift when finished.
  if (!font && typeof document !== "undefined") font = getComputedStyle(document.querySelector("[data-board]") ?? document.body).fontFamily;
  return font || "system-ui, sans-serif";
}

let meter: CanvasRenderingContext2D | null = null;
/** Width and height of typed text in world units, for its box (eraser, fit, off screen). */
/**
 * Typed words that reach the edge go on to the next line, like a page (whole words; a word too
 * long for the line is split). `maxW` is in board units.
 */
export function wrapText(text: string, size: number, maxW: number, st: TextStyle = {}): string {
  if (!Number.isFinite(maxW) || maxW <= 0) return text;
  const fits = (s: string) => measureText(s, size, st).w <= maxW;
  return text
    .split("\n")
    .map((line) => {
      if (fits(line)) return line;
      const out: string[] = [];
      let cur = "";
      for (const word of line.split(/(\s+)/)) {
        if (!word) continue;
        const next = cur + word;
        if (cur.trim() && !fits(next.trimEnd())) {
          out.push(cur.trimEnd());
          cur = word.trimStart();
        } else cur = next;
        // One word longer than the whole line: split it.
        while (cur.length > 1 && !fits(cur)) {
          let i = cur.length - 1;
          while (i > 1 && !fits(cur.slice(0, i))) i--;
          out.push(cur.slice(0, i));
          cur = cur.slice(i);
        }
      }
      out.push(cur);
      return out.join("\n");
    })
    .join("\n");
}

/** How wide one run of typed text is, in world units (no minimum: used to find the gap between two letters). */
export function runWidth(text: string, size: number, st: TextStyle = {}): number {
  meter ??= document.createElement("canvas").getContext("2d");
  if (!meter) return text.length * size * 0.55;
  meter.font = textFont(size, st);
  return meter.measureText(text).width;
}

export function measureText(text: string, size: number, st: TextStyle = {}): { w: number; h: number } {
  meter ??= document.createElement("canvas").getContext("2d");
  const lines = text.split("\n");
  let w = 0;
  if (meter) {
    meter.font = textFont(size, st);
    for (const l of lines) w = Math.max(w, meter.measureText(l).width);
  } else w = Math.max(...lines.map((l) => l.length)) * size * 0.55;
  return { w: Math.max(w, size * 0.4), h: lines.length * size * TEXT_LINE };
}

/** Compact a stroke for sending: fewer decimals, same look. */
export function packStroke(s: Stroke): Stroke {
  // Fine ink (written zoomed far in) keeps one more decimal, or it looked rougher on the laptop
  // and after a reload than it did while being written.
  const k = s.size < 2 ? 100 : 10;
  return { ...s, pts: s.pts.map((p) => [Math.round(p[0] * k) / k, Math.round(p[1] * k) / k, Math.round(p[2] * 100) / 100]) };
}

// ---------------------------------------------------------------- images

/** A picture or PDF page placed on the board (world units). */
export interface BoardImage {
  id: string;
  url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export const imageAt = (imgs: BoardImage[], x: number, y: number): BoardImage | undefined => {
  for (let i = imgs.length - 1; i >= 0; i--) {
    const m = imgs[i];
    if (x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) return m;
  }
  return undefined;
};

/** Loaded pictures, shared by every board on the page. */
const cache = new Map<string, HTMLImageElement>();
/** How many times in a row a picture has failed to load (it is tried again, a little later each time). */
const fails = new Map<string, number>();
/** Let go of loaded pictures (all, or all but `keep`): a new page starts light. */
export function forgetImages(keep: string[] = []) {
  const k = new Set(keep);
  for (const url of [...cache.keys()]) if (!k.has(url)) cache.delete(url);
  fails.clear();
}
export function loadImage(url: string, onReady: () => void): HTMLImageElement | null {
  const hit = cache.get(url);
  if (hit) return hit.complete && hit.naturalWidth ? hit : null;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    fails.delete(url);
    onReady();
  };
  // Didn't load (a Wi-Fi blip, or a PDF page not made yet): forgotten, so the redraw asked for a
  // little later tries again. Before, it stayed an empty outline until the page was reloaded.
  img.onerror = () => {
    if (cache.get(url) === img) cache.delete(url);
    const n = (fails.get(url) ?? 0) + 1;
    fails.set(url, n);
    setTimeout(onReady, Math.min(30_000, 2000 * 2 ** (n - 1)));
  };
  img.src = url;
  cache.set(url, img);
  return null;
}

/**
 * A picture now known by another address (just uploaded): reuse the one already loaded (no flash,
 * no second download). True when the loaded picture now answers to the new address, so the old
 * one is no longer needed.
 */
export function aliasImage(from: string, to: string): boolean {
  const el = cache.get(from);
  if (el && !cache.has(to)) cache.set(to, el);
  return !!el && cache.get(to) === el && el.complete && el.naturalWidth > 0;
}

/** Natural size of a picture (waits for it to load). */
export function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => rej(new Error("That file couldn't be opened."));
    img.src = url;
  });
}

export function drawImages(ctx: CanvasRenderingContext2D, imgs: BoardImage[], onReady: () => void) {
  for (const m of imgs) {
    const el = loadImage(m.url, onReady);
    // A faint page behind every picture, so a transparent PNG still reads.
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = el ? 1 : 0.06;
    ctx.fillRect(m.x, m.y, m.w, m.h);
    ctx.globalAlpha = 1;
    if (el) ctx.drawImage(el, m.x, m.y, m.w, m.h);
    // On the light board a page needs an edge to stand off the paper.
    if (themeId === "paper") {
      ctx.strokeStyle = "rgba(20,22,24,0.22)";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(m.x, m.y, m.w, m.h);
    }
  }
}

// ---------------------------------------------------------------- ink outline (SVG)

/** Width at a point for pressure ink (same feel as the board). */
export const inkWidth = (size: number, p: number) => size * (0.38 + 0.9 * Math.pow(Math.min(1, Math.max(0, p)), 0.75));

/**
 * Pressure ink as one filled SVG outline: the shape traced around a stroke
 * whose width follows pen pressure, with round ends. Used where markup is SVG
 * (marking scripts), so pressure ink shows the same for Hamza and students.
 */
export function inkOutlinePath(xs: number[], ps: number[], size: number): string {
  const n = Math.floor(xs.length / 2);
  if (!n) return "";
  const P = (i: number) => [xs[i * 2], xs[i * 2 + 1]];
  const W = (i: number) => inkWidth(size, ps[i] ?? 0.5) / 2;
  if (n === 1) {
    const [x, y] = P(0);
    const r = W(0);
    return `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
  }
  const left: number[][] = [];
  const right: number[][] = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = P(Math.max(0, i - 1));
    const [bx, by] = P(Math.min(n - 1, i + 1));
    let tx = bx - ax;
    let ty = by - ay;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const [x, y] = P(i);
    const r = W(i);
    left.push([x - ty * r, y + tx * r]);
    right.push([x + ty * r, y - tx * r]);
  }
  const f = (v: number) => Math.round(v * 10) / 10;
  const rEnd = W(n - 1);
  const rStart = W(0);
  let d = `M${f(left[0][0])} ${f(left[0][1])}`;
  for (let i = 1; i < n; i++) d += `L${f(left[i][0])} ${f(left[i][1])}`;
  d += `A${f(rEnd)} ${f(rEnd)} 0 0 0 ${f(right[n - 1][0])} ${f(right[n - 1][1])}`;
  for (let i = n - 2; i >= 0; i--) d += `L${f(right[i][0])} ${f(right[i][1])}`;
  d += `A${f(rStart)} ${f(rStart)} 0 0 0 ${f(left[0][0])} ${f(left[0][1])}Z`;
  return d;
}

/**
 * Pen events that mean "erase": the S Pen side button (secondary button) or an
 * eraser end, whichever way the browser reports it.
 */
export function isPenEraser(e: { pointerType: string; button: number; buttons: number }): boolean {
  if (e.pointerType === "touch") return false;
  return (e.buttons & 2) !== 0 || (e.buttons & 32) !== 0 || e.button === 2 || e.button === 5;
}
