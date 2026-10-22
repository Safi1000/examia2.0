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
  kind: "ink" | "line";
  color: string;
  /** Base width in world units. */
  size: number;
  pts: Pt[];
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
  { name: "Red", value: "#F07A6A" },
  { name: "Green", value: "#7FD1A6" },
  { name: "Blue", value: "#7DB7F5" },
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
  return [prev[0] + (raw[0] - prev[0]) * (1 - amount), prev[1] + (raw[1] - prev[1]) * (1 - amount), prev[2] + (raw[2] - prev[2]) * 0.5];
}

/** Pen pressure to width factor: light touch stays readable, pressing thickens. */
const widthAt = (size: number, p: number) => size * (0.38 + 0.9 * Math.pow(Math.min(1, Math.max(0, p)), 0.75));

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
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0][0], pts[0][1], widthAt(s.size, pts[0][2]) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  // Pressure ink: short curved segments through the midpoints, each with its
  // own width, overlapping round caps so the line reads as one smooth stroke.
  let mx = pts[0][0];
  let my = pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const nx = (a[0] + b[0]) / 2;
    const ny = (a[1] + b[1]) / 2;
    ctx.lineWidth = widthAt(s.size, (a[2] + b[2]) / 2);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(a[0], a[1], nx, ny);
    ctx.stroke();
    mx = nx;
    my = ny;
  }
  const last = pts[pts.length - 1];
  ctx.lineWidth = widthAt(s.size, last[2]);
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
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
