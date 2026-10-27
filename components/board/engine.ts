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
  /** rect, ellipse and form keep two corners in pts. */
  kind: "ink" | "line" | "rect" | "ellipse" | "form";
  color: string;
  /** Base width in world units. */
  size: number;
  pts: Pt[];
  /** For kind "form": which accounting layout (see FORMS). */
  form?: FormId;
}

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

export const COLORS = [
  { name: "White", value: "#F3F1EC" },
  { name: "Gold", value: "#FBC159" },
  { name: "Sky blue", value: "#8FD0F5" },
];

export const SIZES = [
  { name: "Fine", value: 2.2 },
  { name: "Medium", value: 3.6 },
  { name: "Bold", value: 6 },
];

export const MIN_Z = 0.2;
export const MAX_Z = 6;

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const toWorld = (cam: Camera, sx: number, sy: number): [number, number] => [sx / cam.z + cam.x, sy / cam.z + cam.y];

export const visibleView = (cam: Camera, w: number, h: number): View => ({ x: cam.x, y: cam.y, w: w / cam.z, h: h / cam.z });

/** Camera that fits a world rectangle inside a w x h screen, centred. */
export function fitView(v: View, w: number, h: number): Camera {
  const z = Math.min(MAX_Z, Math.max(MIN_Z, Math.min(w / v.w, h / v.h)));
  const cx = v.x + v.w / 2;
  const cy = v.y + v.h / 2;
  return { x: cx - w / 2 / z, y: cy - h / 2 / z, z };
}

/** Zoom by `factor` keeping the screen point (sx, sy) still. */
export function zoomAt(cam: Camera, factor: number, sx: number, sy: number): Camera {
  const z = Math.min(MAX_Z, Math.max(MIN_Z, cam.z * factor));
  const [wx, wy] = toWorld(cam, sx, sy);
  return { x: wx - sx / z, y: wy - sy / z, z };
}

/**
 * Snap a straight line to 0°, 45° or 90° (and their mirrors) when it is
 * within `tolerance` degrees of one; otherwise leave it at its own angle.
 * Length is kept.
 */
export function snapLine(a: Pt, b: Pt, tolerance = 9): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return b;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const nearest = Math.round(deg / 45) * 45;
  if (Math.abs(deg - nearest) > tolerance) return b;
  const r = (nearest * Math.PI) / 180;
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

/** A stroke that is really a straight line: its two ends, else null. */
export function straightOf(all: Pt[], tolerance = 0.06): [Pt, Pt] | null {
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
  if (dev > L * tolerance || path > L * 1.18) return null;
  return [a, b];
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

/** Pen pressure to width factor: light touch stays readable, pressing thickens. */
const widthAt = (size: number, p: number) => size * (0.3 + 1.05 * Math.pow(Math.min(1, Math.max(0, p)), 0.8));

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
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pts = s.pts;
  if (s.kind === "line" && pts.length >= 2) {
    ctx.lineWidth = s.size * 0.95;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    ctx.stroke();
    return;
  }
  if (s.kind === "rect" || s.kind === "ellipse" || s.kind === "form") {
    drawShape(ctx, s);
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
  const pad = s.size * 2 + (s.kind === "form" ? 40 : 0); // room for the nib and a form's labels
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
] as const;
export type FormId = (typeof FORMS)[number]["id"];

type Seg = [number, number, number, number];
type Label = { text: string; x: number; y: number; w: number; align: "left" | "center" };

/** Column edges (as fractions of a width) and their headings, per layout. */
const SIDES: Record<Exclude<FormId, "t">, { cols: number[]; heads: string[]; twoSided?: boolean }> = {
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

/**
 * Hand-drawn closed loop to a clean box or oval, if it is close to one.
 * Returns null when the stroke isn't a clear shape (it then stays as ink).
 */
export function recogniseShape(pts: Pt[], strict = 0.045): { kind: "rect" | "ellipse"; a: Pt; b: Pt } | null {
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
  if (Math.hypot(e0[0] - s0[0], e0[1] - s0[1]) > diag * 0.22) return null; // not closed
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  let er = 0;
  let ee = 0;
  for (const p of pts) {
    er += Math.min(Math.abs(p[0] - x0), Math.abs(p[0] - x1), Math.abs(p[1] - y0), Math.abs(p[1] - y1));
    const ang = Math.atan2((p[1] - cy) / (h / 2), (p[0] - cx) / (w / 2));
    ee += Math.hypot(p[0] - (cx + Math.cos(ang) * (w / 2)), p[1] - (cy + Math.sin(ang) * (h / 2)));
  }
  er /= pts.length * diag;
  ee /= pts.length * diag;
  const best = er <= ee ? "rect" : "ellipse";
  if (Math.min(er, ee) > strict) return null;
  return { kind: best, a: [x0, y0, 0.5], b: [x1, y1, 0.5] };
}

/** Subtle dot grid behind the ink, so the board feels like paper, not a void. */
export function drawGrid(ctx: CanvasRenderingContext2D, cam: Camera, w: number, h: number) {
  let step = 32;
  while (step * cam.z < 18) step *= 2;
  const x0 = Math.floor(cam.x / step) * step;
  const y0 = Math.floor(cam.y / step) * step;
  const x1 = cam.x + w / cam.z;
  const y1 = cam.y + h / cam.z;
  const r = Math.max(0.6, 1.1 / cam.z);
  ctx.fillStyle = "rgba(240,237,232,0.09)";
  for (let x = x0; x <= x1; x += step)
    for (let y = y0; y <= y1; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
}

/** Compact a stroke for sending: fewer decimals, same look. */
export function packStroke(s: Stroke): Stroke {
  return { ...s, pts: s.pts.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 100) / 100]) };
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
export function loadImage(url: string, onReady: () => void): HTMLImageElement | null {
  const hit = cache.get(url);
  if (hit) return hit.complete && hit.naturalWidth ? hit : null;
  const img = new Image();
  img.decoding = "async";
  img.onload = onReady;
  img.src = url;
  cache.set(url, img);
  return null;
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
