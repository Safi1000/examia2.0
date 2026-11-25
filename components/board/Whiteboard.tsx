"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import {
  COLORS,
  type BoardImage,
  type Camera,
  type Pt,
  type Stroke,
  type View,
  boundsOf,
  getTheme,
  inkOf,
  setTheme,
  THEMES,
  type ThemeId,
  BACKDROPS,
  drawGrid,
  forgetImages,
  getBackdrop,
  setBackdrop,
  type Backdrop,
  drawImages,
  drawStroke,
  areaView,
  clearInset,
  fitView,
  hitStroke,
  aliasImage,
  imageAt,
  imageSize,
  isPenEraser,
  arrowHeadOn,
  lineAngle,
  measureText,
  runWidth,
  TEXT_LINE,
  wrapText,
  MAX_Z,
  MIN_Z,
  FOLLOW_MAX_Z,
  FOLLOW_MIN_Z,
  newId,
  TEXT_PX,
  packStroke,
  lineDir,
  holdShape,
  tidyStroke,
  penWeight,
  settleStroke,
  smoothPoint,
  steadyFor,
  straightOf,
  strokeBox,
  tAccountOf,
  axesOfPair,
  snapLine,
  toWorld,
  zoomAt,
  lassoPick,
  rawBox,
  resetBoardFont,
  type Grow,
  type Inset,
  GROW_NAME,
  inkCluster,
  isIdentity,
  type Xf,
  XF0,
  xformImage,
  xformStroke,
} from "@/components/board/engine";
import { boardDigest, connectBoard, Ledger, type BoardLink, type BoardMsg } from "@/components/board/sync";
import { deleteBoard, loadBoard, loadIndex, saveBoard, saveIndex, type BoardPage } from "@/components/board/storage";
import { useDatabase } from "@/lib/data/store";
import { LEVEL_LABEL, classBoardPages, classPageId, liveSlotsOn, pkDate, slotKey } from "@/lib/timetable";
import { useSchedule } from "@/lib/classes";
import { cloudinaryConfigured, uploadImage, uploadPdfPages } from "@/lib/cloudinary";
import { shrinkImage } from "@/lib/shrink-image";
import { LibraryPicker, type LibraryPage } from "@/components/board/LibraryPicker";

/**
 * Hamza's live whiteboard.
 *
 * Teacher: draws with the S Pen. Palm rejection is built in: only the pen (or
 * a mouse on a laptop) draws; fingers move and zoom the board, and touches
 * are ignored while the pen is on or hovering over the screen. Hold the pen
 * still at the end of a stroke and it straightens into a line, snapping to
 * 0°, 45° or 90°. The pen's side button erases. Pictures and PDF pages can be
 * dropped in and written on.
 *
 * Tablet and laptop are both full boards on the same private room: either one
 * draws, types, adds or removes pictures, and the other updates live. The
 * tablet leads: when it pans or zooms, the laptop (shared in Meet) follows.
 *
 * Viewer: the same board, live, read-only, following Hamza's screen.
 */

const HOLD_MS = 480;
const HOLD_STILL_PX = 4;
const MIN_HOLD_PATH_PX = 28;
// After the pen lifts, touches are taken as the resting hand for this long (not a pan).
const PALM_LOCK_MS = 900;
const PALM_SIZE_PX = 56;
const ERASER_PX = 22;
/** Pen thickness: the ends of the slider, and where it starts. */
const PEN_MIN = 2;
const PEN_MAX = 16;
const PEN_DEFAULT = 8;
/** The board from before pages existed (and the page used outside class time). */
const MAIN_PAGE: BoardPage = { id: "main", title: "Board", at: 0 };
/** A class's page opens this long before it starts. */
const PAGE_EARLY_MIN = 1;
/** The tablet's hovering pen shown as a red dot on the laptop. Off at Hamza's request. */
const HOVER_POINTER = false;
/** The board sliding up by itself after writing at the bottom of the screen. Off at Hamza's request:
 * the board never moves on its own. (Page Down on the laptop still gives more room when asked.) */
const AUTO_ROOM = false;
/** Drawing a little ahead of the pen with the tablet's guessed points. Off: it made the ink tip blink. */
const PREDICT_AHEAD = false;
/** Messages that change a page's board (tagged with that page). */
const PAGE_CHANGES = new Set<BoardMsg["t"]>(["add", "del", "img", "imgdel", "clear", "set", "live", "xf"]);
/** Every change says which page it's for (see BoardMsg.pg). */
function tagPage(m: BoardMsg, pg: string): BoardMsg {
  if (m.t === "batch") return { ...m, ms: m.ms.map((x) => tagPage(x, pg)) };
  return PAGE_CHANGES.has(m.t) ? { ...m, pg } : m;
}
const PAN_GAIN = 1.15;
const HANDLE_PX = 22;
/** A finger held still this long on typed words picks them up (then they follow the finger). */
const LIFT_MS = 380;
/** The pen (or mouse) held still this long where a stroke starts: on writing it picks it up, on
 * empty board a lasso starts. How far it may wander meanwhile, per pointer (screen pixels). */
const LASSO_MS = 550;
const LASSO_SLOP: Record<string, number> = { pen: 6, mouse: 4, touch: 10 };

type Tool = "pen" | "line" | "axes" | "eraser" | "move" | "text";
/** What is selected: strokes and pictures (ids in board order). `grow`: picked up from one stroke of
 * handwriting, and how far it reaches (its word, line or block), so a tap can reach further. */
type Sel = { ids: string[]; imgs: string[]; grow?: { seed: string; level: Grow } };
/** What the selection is, for its frame and bar: one typed text, one ruled line or shape, one
 * picture, only handwriting, or a mix. */
type SelKind = "text" | "line" | "picture" | "ink" | "mixed";
type SelUI = { key: string; kind: SelKind; n: number; level?: Grow; color?: string | null; colors: string[] };
/**
 * A group lifted off the board while it is dragged: drawn once into its own see-through layer,
 * which then only slides and scales (one style change per move), so a big group moves as smoothly
 * as a small one. `t`: where it is now; the layer was drawn for camera zoom `zR` and scale `kR`,
 * over `region` (in the group's own, unmoved board units) at `ppu` pixels per unit. `ready`: the
 * board has redrawn without it (until then it stays put, so it is never seen twice). `landing`: the
 * move is on the board now; the layer goes once the board shows it. `remote`: the tablet's drag,
 * shown on the laptop.
 */
type Lift = {
  ids: Set<string>;
  imgs: Set<string>;
  srcS: Stroke[] | null;
  restS: Stroke[];
  srcI: BoardImage[] | null;
  restI: BoardImage[];
  t: Xf;
  zR: number;
  kR: number;
  region: View;
  ppu: number;
  ready: boolean;
  landing: boolean;
  landingAt: number;
  movedAt: number;
  lastKey: string;
  remote?: string;
  /** The laptop: where the tablet last said the group is (it glides there). */
  goal?: Xf;
};
/** A drag of the selected group: by the board (finger, pen or mouse inside its frame), by a handle
 * (its Move grip or a corner), or by the arrow keys (`keyboard`). */
type GroupDrag = {
  pid: number;
  kind: "move" | "nw" | "ne" | "sw" | "se";
  viaHandle: boolean;
  keyboard?: boolean;
  /** Picked up by holding the pen still: once it has been moved and lands, it is let go (the pen writes on). */
  clearAfter?: boolean;
  sx0: number;
  sy0: number;
  wx0: number;
  wy0: number;
  lx: number;
  ly: number;
  moved: boolean;
  slop: number;
  touch: boolean;
  at: number;
  tapEdits: boolean;
  tapGrows: boolean;
  box0: View | null;
  t: Xf;
  xfId: string;
  sent: number;
  idsAt: number;
};
type Action =
  | { type: "add"; s: Stroke }
  | { type: "erase"; s: Stroke[] }
  | { type: "replace"; before: Stroke[]; after: Stroke[] }
  | { type: "clear"; s: Stroke[]; m: BoardImage[] }
  | { type: "img-add"; m: BoardImage[] }
  | { type: "img-del"; m: BoardImage }
  | { type: "img-edit"; before: BoardImage; after: BoardImage }
  // A group moved, scaled, recoloured, duplicated or deleted: the strokes and pictures before and after.
  | { type: "group"; sb: Stroke[]; sa: Stroke[]; ib: BoardImage[]; ia: BoardImage[] };

/** The time now in ms (for the group drag, which only runs from pointer events, never while drawing the page). */
const msNow = () => performance.now();

/** No margin at all: the whole screen. */
const FULL_SCREEN = { t: 0, r: 0, b: 0, l: 0 };

/** All the pen positions since the last frame (finer curves), or just this one. */
function coalesced(e: PointerEvent): PointerEvent[] {
  const list = e.getCoalescedEvents?.();
  return list && list.length ? list : [e];
}

/** Keep receiving a pointer's moves even if it leaves the canvas (never throws). */
function capture(el: HTMLElement | null, id: number) {
  try {
    el?.setPointerCapture(id);
  } catch {}
}

// ---------------------------------------------------------------- rendering

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number, again: () => void) => void) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const dirty = useRef(true);
  const drawRef = useRef(draw);
  // Always paint with the latest draw function (it reads refs, so it's cheap).
  useEffect(() => {
    drawRef.current = draw;
    dirty.current = true;
  });

  const requestDraw = useCallback(() => {
    dirty.current = true;
  }, []);

  useEffect(() => {
    const c = canvasRef.current!;
    // Opaque, and in step with the screen. (Not "desynchronized": on Android that can show the canvas
    // part way through a frame, and every frame starts by painting the paper over everything, so the
    // writing blinked.)
    const paintNow = () => {
      const { w, h, dpr } = size.current;
      // No size yet (the page still laying out, a hidden or minimised window): wait for one. Painting
      // a board with no size threw an error, and that error stopped every later frame: the board then
      // stayed blank, or stuck on an old picture, until the page was reloaded.
      if (!w || !h) return;
      dirty.current = false;
      const ctx = (c.getContext("2d", { alpha: false }) ?? c.getContext("2d"))!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx, w, h, () => {
        dirty.current = true;
      });
    };
    const resize = () => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      size.current = { w, h, dpr };
      if (c.width === pw && c.height === ph) {
        dirty.current = true;
        return;
      }
      // A new size wipes the canvas (to black, as it's opaque): draw it again straight away, before
      // the browser shows it, not a frame later.
      c.width = pw;
      c.height = ph;
      if (w && h) paintNow();
      else dirty.current = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    // Moved to a screen with a different pixel density (laptop screen to TV): the size on the page
    // is the same, so nothing above notices, and the ink stayed soft. Watch the density itself.
    let dprQuery: MediaQueryList | null = null;
    const onDpr = () => {
      dprQuery?.removeEventListener("change", onDpr);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprQuery.addEventListener("change", onDpr);
      resize();
    };
    onDpr();
    let raf = 0;
    const loop = () => {
      // The next frame is booked first: whatever happens while painting this one, the board keeps drawing.
      raf = requestAnimationFrame(loop);
      if (dirty.current) paintNow();
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dprQuery?.removeEventListener("change", onDpr);
    };
  }, []);

  return { canvasRef, size, requestDraw };
}

/**
 * The cached finished board for each canvas (see paint): drawn for the view `cam`, plus a
 * margin all round, so moving the view a little reuses it instead of drawing everything again.
 */
type Layer = {
  c: HTMLCanvasElement;
  content: string;
  strokes: Stroke[] | null;
  images: BoardImage[] | null;
  cam: Camera | null;
  /** Margin drawn around the view, in screen pixels. */
  m: number;
  /** When the view last moved (a zoom is redrawn sharp once it settles). */
  movedAt: number;
  /** When the layer was last drawn in full (rubbing out redraws at most this often). */
  builtAt: number;
  lastCam: string;
  /** How long the last full draw took (a heavy page is drawn less often while a picture is dragged). */
  cost: number;
};
const layers = new WeakMap<HTMLCanvasElement, Layer>();
/** Goes up each time a picture finishes loading, so the layer is redrawn with it. */
let imageVersion = 0;
/** Draw every board's finished layer again (a font arrived). */
const redrawAll = () => {
  imageVersion++;
};
/** A zoom is shown by stretching the cached board, then drawn sharp this long after it stops. */
const SETTLE_MS = 140;

/** Each finished stroke is packed (rounded) once and remembered: saving and sending a full page
 * then costs almost nothing, instead of rounding every point of every stroke each time. */
const packed = new WeakMap<Stroke, Stroke>();
function packOnce(s: Stroke): Stroke {
  let p = packed.get(s);
  if (!p) {
    p = packStroke(s);
    packed.set(s, p);
  }
  return p;
}

/** What a clean tap can select (besides typed words and pictures): a ruled line, or a tidy box, oval,
 * axes or T account. Never handwriting, so a tap near writing still leaves its dot. */
const isRuled = (s: Stroke) => s.kind === "line" || s.kind === "rect" || s.kind === "ellipse" || s.kind === "form";

/** On the laptop: a small dot in the ink's colour as the cursor, instead of a crosshair. */
const penCursor = (ink: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><circle cx='8' cy='8' r='4' fill='${ink}' stroke='white' stroke-width='1.5'/></svg>`)}") 8 8, crosshair`;

/** The stroke being drawn, with the predicted points on the end (pen ink only). */
function withPrediction(s: Stroke | null, ahead: Pt[]): Stroke | null {
  if (!s || s.kind !== "ink" || !ahead.length) return s;
  return { ...s, pts: [...s.pts, ...ahead] };
}

/** Strokes only added at the end since last time (the usual case: a new line), not removed or changed. */
function onlyAdded(before: Stroke[] | null, now: Stroke[]): boolean {
  if (!before || now.length <= before.length) return false;
  if (!before.length) return true;
  return now[0] === before[0] && now[before.length - 1] === before[before.length - 1];
}

function paint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: Camera,
  images: BoardImage[],
  strokes: Stroke[],
  extra: (Stroke | null)[],
  onImage: () => void,
  selected?: BoardImage | null,
) {
  const look = getTheme();
  // The finished board (paper, grid, pictures, every stroke) lives in its own layer:
  //  - the pen moving only draws the stroke in progress on top;
  //  - a new stroke is added to the layer, not the whole board drawn again;
  //  - panning (or the laptop following the tablet) slides the layer, zooming stretches it
  //    until the view settles, then it's drawn sharp once.
  // So a full page stays as quick as an empty one on both devices.
  const dpr = ctx.getTransform().a || 1;
  let L = layers.get(ctx.canvas);
  if (!L) {
    L = { c: document.createElement("canvas"), content: "", strokes: null, images: null, cam: null, m: 0, movedAt: 0, builtAt: 0, lastCam: "", cost: 0 };
    layers.set(ctx.canvas, L);
  }
  const now = performance.now();
  const camKey = `${cam.x}|${cam.y}|${cam.z}`;
  if (camKey !== L.lastCam) {
    L.lastCam = camKey;
    L.movedAt = now;
  }
  const settling = now - L.movedAt < SETTLE_MS;
  const content = `${w}|${h}|${dpr}|${look.bg}|${getBackdrop()}|${imageVersion}`;
  const sameContent = L.content === content && L.images === images;

  // Where the layer sits for this view: its own view, the margin, and the zoom between them.
  const fits = (lc: Camera) => {
    const k = cam.z / lc.z;
    const sx = (lc.x - L.m / lc.z - cam.x) * cam.z;
    const sy = (lc.y - L.m / lc.z - cam.y) * cam.z;
    const sw = (w + 2 * L.m) * k;
    const sh = (h + 2 * L.m) * k;
    return { sx, sy, sw, sh, covers: sx <= 0.5 && sy <= 0.5 && sx + sw >= w - 0.5 && sy + sh >= h - 0.5, k };
  };
  const layerCtx = (lc: Camera) => {
    const b = L.c.getContext("2d")!;
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.scale(lc.z, lc.z);
    b.translate(-(lc.x - L.m / lc.z), -(lc.y - L.m / lc.z));
    return b;
  };
  const rebuild = () => {
    L.builtAt = performance.now();
    L.content = content;
    L.strokes = strokes;
    L.images = images;
    L.cam = { ...cam };
    // A whole number of device pixels, so the layer lines up pixel for pixel with the screen.
    L.m = Math.round(0.18 * Math.max(w, h) * dpr) / dpr;
    const pw = Math.round((w + 2 * L.m) * dpr);
    const ph = Math.round((h + 2 * L.m) * dpr);
    if (L.c.width !== pw || L.c.height !== ph) {
      L.c.width = pw;
      L.c.height = ph;
    }
    const b = layerCtx(L.cam);
    const ox = L.cam.x - L.m / L.cam.z;
    const oy = L.cam.y - L.m / L.cam.z;
    const vw = (w + 2 * L.m) / L.cam.z;
    const vh = (h + 2 * L.m) / L.cam.z;
    b.fillStyle = look.bg;
    b.fillRect(ox, oy, vw, vh);
    const area: Camera = { x: ox, y: oy, z: L.cam.z };
    drawGrid(b, area, w + 2 * L.m, h + 2 * L.m);
    drawImages(b, images, () => {
      imageVersion++;
      onImage();
    });
    // Only what is in the layer gets drawn.
    for (const s of strokes) {
      const bx = strokeBox(s);
      if (bx.x > ox + vw || bx.y > oy + vh || bx.x + bx.w < ox || bx.y + bx.h < oy) continue;
      drawStroke(b, s);
    }
    L.cost = performance.now() - L.builtAt;
  };

  // A picture being dragged or resized on a heavy page: the whole board is drawn again about 30
  // times a second, not on every frame (as rubbing out is, below). Only when nothing else changed,
  // so a stroke just finished is never left out for a frame.
  if (L.cam && L.content === content && L.images !== images && L.strokes === strokes && L.cost > 6 && now - L.builtAt < 33) onImage();
  else if (!L.cam || !sameContent) rebuild();
  else if (L.strokes !== strokes) {
    // New strokes only: add them to the layer. Anything else (erased, undone, moved): draw again.
    if (onlyAdded(L.strokes, strokes)) {
      const b = layerCtx(L.cam);
      for (let i = L.strokes!.length; i < strokes.length; i++) drawStroke(b, strokes[i]);
      L.strokes = strokes;
    } else if (strokes.length < (L.strokes?.length ?? 0) && now - L.builtAt < 50) {
      // Rubbing out: the board is drawn again at most 20 times a second, not on every pen move.
      onImage();
    } else rebuild();
  }
  let f = fits(L.cam!);
  if (!f.covers || (f.k !== 1 && !settling)) {
    // Slid past the margin, or a zoom has settled: draw it fresh for this view.
    rebuild();
    f = fits(L.cam!);
  } else if (f.k !== 1) onImage(); // keep drawing until the zoom settles, then sharpen
  ctx.fillStyle = look.bg;
  ctx.fillRect(0, 0, w, h);
  if (f.k === 1) {
    // Same zoom: copy the layer pixel for pixel. Stretched by a fraction of a pixel it went soft, so
    // each stroke changed (sharp while drawn, softer once finished) the moment the pen lifted.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(L.c, Math.round(f.sx * dpr), Math.round(f.sy * dpr));
    ctx.restore();
  } else ctx.drawImage(L.c, f.sx, f.sy, f.sw, f.sh);
  ctx.save();
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);
  for (const s of extra) if (s) drawStroke(ctx, s);
  if (selected) {
    const px = 1 / cam.z;
    ctx.strokeStyle = look.accent;
    ctx.lineWidth = 2 * px;
    ctx.setLineDash([6 * px, 5 * px]);
    ctx.strokeRect(selected.x, selected.y, selected.w, selected.h);
    ctx.setLineDash([]);
    // Resize handle, bottom-right.
    const r = (HANDLE_PX / 2) * px;
    ctx.fillStyle = look.accent;
    ctx.beginPath();
    ctx.arc(selected.x + selected.w, selected.y + selected.h, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.bg;
    ctx.beginPath();
    ctx.arc(selected.x + selected.w, selected.y + selected.h, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- icons
// One grid (24), round caps and joins, one weight on screen: drawn 22 px at 1.75 on the tablet and
// 20 px at 1.9 on the laptop (see the board's own style rule), so every icon renders about 1.6 px.

const svg = (children: React.ReactNode, sw = 1.75) => (
  <svg className="wb-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
const I = {
  pen: svg(
    <>
      <path d="M4.5 19.5l.9-4.1L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.6 18.6l-4.1.9z" />
      <path d="M13.8 7l3.2 3.2" />
    </>,
  ),
  // The highlighter: its little band is drawn in the chip colour (or the icon colour when it is in hand).
  marker: svg(
    <>
      <path d="M14.6 3.9l5.5 5.5-7.4 7.4-5.5-5.5z" />
      <path d="M7.2 11.3l-1.6 4.4 2.7 2.7 4.4-1.6" />
      <path className="wb-hl-band" d="M3.5 21h9" strokeWidth={3} />
    </>,
  ),
  eraser: svg(
    <>
      <path d="M9 20h10.5" />
      <path d="M5.1 14.9l9.1-9.1a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8l-8 8a2 2 0 0 1-1.4.6H8.6a2 2 0 0 1-1.4-.6l-2.1-2.1a1.3 1.3 0 0 1 0-1.8z" />
      <path d="M9.6 10.4l5 5" />
    </>,
  ),
  lasso: svg(
    <>
      <path d="M8.3 16.3C5.2 15.4 3 13.4 3 11c0-3.3 4-6 9-6s9 2.7 9 6-4 6-9 6c-.8 0-1.6-.1-2.3-.2" strokeDasharray="3 2.6" />
      <path d="M8.3 16.3c-1.4.6-1.9 2-1.1 3 .6.8 1.8.9 2.6.3" />
    </>,
  ),
  text: svg(
    <>
      <path d="M5 7V5h14v2" />
      <path d="M12 5v14" />
      <path d="M9.5 19h5" />
    </>,
  ),
  // Insert: a page with a folded corner and a plus (pictures, PDFs, past papers, notes).
  insert: svg(
    <>
      <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M13.5 3.5V8a1 1 0 0 0 1 1H19" />
      <path d="M12 12v6M9 15h6" />
    </>,
  ),
  picture: svg(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M20.5 15.5l-4.1-4.1a1.4 1.4 0 0 0-2 0L6.5 19.4" />
    </>,
  ),
  pastPaper: svg(
    <>
      <path d="M7 3.5h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4" />
    </>,
  ),
  notes: svg(
    <>
      <path d="M12 6.5C10.5 5.3 8.4 4.5 6 4.5c-.9 0-1.7.1-2.5.3v13.5c.8-.2 1.6-.3 2.5-.3 2.4 0 4.5.8 6 2" />
      <path d="M12 6.5c1.5-1.2 3.6-2 6-2 .9 0 1.7.1 2.5.3v13.5c-.8-.2-1.6-.3-2.5-.3-2.4 0-4.5.8-6 2V6.5z" />
    </>,
  ),
  undo: svg(
    <>
      <path d="M9 13.5L4.5 9 9 4.5" />
      <path d="M4.5 9H15a5 5 0 0 1 0 10h-3.5" />
    </>,
  ),
  redo: svg(
    <>
      <path d="M15 13.5L19.5 9 15 4.5" />
      <path d="M19.5 9H9a5 5 0 0 0 0 10h3.5" />
    </>,
  ),
  prev: svg(<path d="M14.5 6l-6 6 6 6" />),
  next: svg(<path d="M9.5 6l6 6-6 6" />),
  chevronDown: svg(<path d="M7 10l5 5 5-5" />, 2.2),
  plus: svg(<path d="M12 5.5v13M5.5 12h13" />),
  minus: svg(<path d="M5.5 12h13" />),
  hide: svg(
    <>
      <path d="M3.5 3.5l17 17" />
      <path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c5 0 8.4 4.4 9.4 6-.5.8-1.5 2.2-3 3.5M6.5 7.6C4.6 8.9 3.2 10.8 2.6 12c1 1.6 4.4 6 9.4 6 1.5 0 2.8-.4 4-1" />
      <path d="M9.9 10a3 3 0 0 0 4.2 4.1" />
    </>,
  ),
  duplicate: svg(
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      <path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
    </>,
  ),
  front: svg(
    <>
      <path d="M12 3.5l8.5 4.3L12 12 3.5 7.8z" />
      <path d="M3.5 12.2L12 16.5l8.5-4.3" />
      <path d="M3.5 16.2L12 20.5l8.5-4.3" />
    </>,
  ),
  trash: svg(
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.2c0-.4.3-.7.7-.7h3.6c.4 0 .7.3.7.7V7" />
      <path d="M6.5 7l.8 11.6a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7" />
      <path d="M10 11v5.5M14 11v5.5" />
    </>,
  ),
  fit: svg(<path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 0-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3" />),
  arrow: svg(
    <>
      <path d="M5 19L19 5" />
      <path d="M10 5h9v9" />
    </>,
  ),
  dotted: svg(<path d="M4 12h1.5M11.25 12h1.5M18.5 12H20" strokeWidth={2.4} />),
  solid: svg(<path d="M4 12h16" />),
  // The selection's Move grip, and the open text box's grip.
  move: svg(
    <>
      <path d="M12 4v16M4 12h16" />
      <path d="M9.5 6.5L12 4l2.5 2.5M9.5 17.5L12 20l2.5-2.5M6.5 9.5L4 12l2.5 2.5M17.5 9.5L20 12l-2.5 2.5" />
    </>,
  ),
};

/**
 * Palm guard for the toolbar: while the pen is in use (or just was), a touch on a button is a
 * resting hand, not a tap, so it does nothing. A finger tap with the pen away still works.
 */
let penAt = 0;
const notePen = () => {
  penAt = Date.now();
};
let palmUntil = 0;
const palmDown = (e: React.PointerEvent) => {
  if (e.pointerType === "touch" && (Date.now() - penAt < 1500 || e.width > PALM_SIZE_PX || e.height > PALM_SIZE_PX)) palmUntil = Date.now() + 700;
};
const palmBlocked = () => Date.now() < palmUntil;

// ---------------------------------------------------------------- chrome look
// White capsules on the light board, lifted charcoal on the dark one (never darker than the board);
// gold only for the tool in hand and the selection; no borders (the hairline is in the shadow) and no
// blur (a blurred bar makes the tablet re-blur the writing under it on every pen move).

/** The board's colours for each tone, set once on its root. */
const CHROME: Record<"light" | "dark", React.CSSProperties> = {
  light: {
    "--bd-fg": "#1B1E21",
    "--bd-fg-2": "rgba(27,30,33,0.64)",
    "--bd-fg-3": "rgba(27,30,33,0.30)",
    "--bd-panel": "#FFFFFF",
    "--bd-shadow": "0 0 0 1px rgba(20,22,24,0.07), 0 1px 2px rgba(20,22,24,0.05), 0 8px 24px -8px rgba(20,22,24,0.14)",
    "--bd-dialog-shadow": "0 0 0 1px rgba(20,22,24,0.07), 0 1px 2px rgba(20,22,24,0.05), 0 24px 48px -16px rgba(20,22,24,0.30)",
    "--bd-hover": "rgba(27,30,33,0.05)",
    "--bd-on": "rgba(27,30,33,0.07)",
    "--bd-divider": "rgba(27,30,33,0.08)",
    "--bd-tool-bg": "#FBC159",
    "--bd-tool-fg": "#1B1E21",
    "--bd-tool-edge": "inset 0 0 0 1px rgba(27,30,33,0.08)",
    "--bd-sel": "#B07A12",
    "--bd-sel-fill": "rgba(176,122,18,0.06)",
    "--bd-danger": "#B3261E",
    "--bd-danger-bg": "rgba(179,38,30,0.08)",
    "--bd-solid": "#1B1E21",
    "--bd-solid-fg": "#FFFFFF",
    "--bd-swatch-edge": "inset 0 0 0 1px rgba(20,22,24,0.10)",
    "--bd-tip-bg": "rgba(27,30,33,0.96)",
    "--bd-hl-chip": "#F4DA86",
  } as React.CSSProperties,
  dark: {
    "--bd-fg": "#F0EDE8",
    "--bd-fg-2": "rgba(240,237,232,0.66)",
    "--bd-fg-3": "rgba(240,237,232,0.32)",
    "--bd-panel": "#2E3236",
    "--bd-shadow": "0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05), 0 2px 6px rgba(0,0,0,0.22), 0 12px 32px -10px rgba(0,0,0,0.55)",
    "--bd-dialog-shadow": "0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 48px -16px rgba(0,0,0,0.6)",
    "--bd-hover": "rgba(240,237,232,0.06)",
    "--bd-on": "rgba(240,237,232,0.10)",
    "--bd-divider": "rgba(240,237,232,0.10)",
    "--bd-tool-bg": "#FBC159",
    "--bd-tool-fg": "#1B1E21",
    "--bd-tool-edge": "inset 0 0 0 1px rgba(27,30,33,0.10)",
    "--bd-sel": "#FBC159",
    "--bd-sel-fill": "rgba(251,193,89,0.08)",
    "--bd-danger": "#F4A397",
    "--bd-danger-bg": "rgba(244,163,151,0.10)",
    "--bd-solid": "#F0EDE8",
    "--bd-solid-fg": "#1B1E21",
    "--bd-swatch-edge": "inset 0 0 0 1px rgba(255,255,255,0.10)",
    "--bd-tip-bg": "rgba(27,30,33,0.96)",
    "--bd-hl-chip": "#E8D08A",
  } as React.CSSProperties,
};
/** Makes a 36px control a 44px touch target without making it look bigger. */
const HIT = "before:absolute before:-inset-1 before:content-['']";
/** Every bar, island, popover and toast surface. */
const PANEL = "bg-[var(--bd-panel)] text-[color:var(--bd-fg)] [box-shadow:var(--bd-shadow)]";
/** A capsule bar: 52 tall on the tablet (44 controls + 4 + 4), 44 on the laptop; outer radius = inner + padding. */
const BAR = (lead: boolean) => `${PANEL} flex items-center gap-0.5 p-1 ${lead ? "rounded-[26px]" : "rounded-[22px]"}`;
/** A round control: 44 (icon 22) on the tablet, 36 (icon 20, with a 44 hit area) on the laptop. */
const CTL = (lead: boolean) =>
  `relative flex shrink-0 items-center justify-center rounded-full ${lead ? "h-11 w-11 [&_svg]:h-[22px] [&_svg]:w-[22px]" : `h-9 w-9 [&_svg]:h-5 [&_svg]:w-5 ${HIT}`}`;
/** Press, hover and focus for every control (only colour and scale animate; none with reduced motion). */
const PRESS =
  "transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(.22,1,.36,1)] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--bd-sel)] disabled:pointer-events-none disabled:text-[color:var(--bd-fg-3)]";
/** A quiet control: muted, full colour on hover. */
const QUIET = "text-[color:var(--bd-fg-2)] hover:bg-[var(--bd-hover)] hover:text-[color:var(--bd-fg)]";
/** A neutral "on" state (Bold on, a menu open, Arrow on). Never gold. */
const ON = "bg-[var(--bd-on)] text-[color:var(--bd-fg)]";
/** The tool in hand: the gold disc (the disc itself is one element that slides; this is its look). */
const TOOL_ON = "bg-[var(--bd-tool-bg)] text-[color:var(--bd-tool-fg)] [box-shadow:var(--bd-tool-edge)]";
const DANGER = "text-[color:var(--bd-danger)] hover:bg-[var(--bd-danger-bg)]";
/** The one selection look: a 1.5px gold line (half inside, half outside), radius 4, no fill. */
const SEL_FRAME = "rounded-[4px] outline outline-[1.5px] outline-offset-[-0.75px] outline-[color:var(--bd-sel)]";
const HANDLE_DOT = "block h-3 w-3 rounded-full bg-[#fff] [box-shadow:0_0_0_1.5px_var(--bd-sel),0_1px_3px_rgba(20,22,24,0.28)]";
const SIDE_HANDLE = "block h-5 w-1.5 rounded-full bg-[#fff] [box-shadow:0_0_0_1.5px_var(--bd-sel),0_1px_3px_rgba(20,22,24,0.28)]";
/** Menu and popover cards: radius 20 = 14 (rows) + 6 (padding). */
const CARD = `${PANEL} rounded-[20px] p-1.5`;
const MENU_ROW = (lead: boolean) => `${PRESS} flex w-full items-center rounded-[14px] px-3.5 text-left text-sm font-semibold ${lead ? "h-11" : "h-9"}`;

// ---------------------------------------------------------------- tooltips (mouse only)
// One small label for the whole board, kept in its own component so hovering never
// re-renders the board. Touch and pen never show it.
type Tip = { label: string; keys?: string; hint?: string; x: number; y: number; side: "right" | "top" | "bottom" };
let showTipNow: ((t: Tip | null) => void) | null = null;
let tipTimer: ReturnType<typeof setTimeout> | undefined;
const hideTip = () => {
  clearTimeout(tipTimer);
  showTipNow?.(null);
};
/** Hover props for a control: its name, its keyboard shortcut, and an optional second line. */
const tipOn = (label: string, keys?: string, hint?: string) => ({
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const side: Tip["side"] = r.right < 140 && r.top > 64 ? "right" : r.top > window.innerHeight - 140 ? "top" : "bottom";
    const x = Math.round(side === "right" ? r.right + 8 : r.left + r.width / 2);
    const y = Math.round(side === "right" ? r.top + r.height / 2 : side === "top" ? r.top - 8 : r.bottom + 8);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => showTipNow?.({ label, keys, hint, x, y, side }), 450);
  },
  onPointerLeave: hideTip,
});

function BoardTip() {
  const [tip, setTip] = useState<Tip | null>(null);
  useEffect(() => {
    showTipNow = setTip;
    window.addEventListener("pointerdown", hideTip, true);
    window.addEventListener("keydown", hideTip, true);
    return () => {
      showTipNow = null;
      clearTimeout(tipTimer);
      window.removeEventListener("pointerdown", hideTip, true);
      window.removeEventListener("keydown", hideTip, true);
    };
  }, []);
  if (!tip) return null;
  const place = tip.side === "right" ? "-translate-y-1/2" : tip.side === "top" ? "-translate-x-1/2 -translate-y-full" : "-translate-x-1/2";
  return (
    <div role="tooltip" className={`pointer-events-none fixed z-[60] ${place}`} style={{ left: tip.x, top: tip.y }}>
      <div className="wb-fade max-w-[260px] rounded-[8px] bg-[var(--bd-tip-bg)] px-2.5 py-1.5 text-[#fff] shadow-[0_6px_16px_-6px_rgba(20,22,24,0.4)]">
        <p className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold">
          {tip.label}
          {tip.keys && (
            <span className="flex gap-1">
              {tip.keys.split(" ").map((k) => (
                <kbd key={k} className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[rgba(255,255,255,0.12)] px-1 font-sans text-[10.5px] font-semibold text-[#fff]">
                  {k}
                </kbd>
              ))}
            </span>
          )}
        </p>
        {tip.hint && <p className="mt-0.5 text-[11px] font-medium leading-snug text-[rgba(255,255,255,0.62)]">{tip.hint}</p>}
      </div>
    </div>
  );
}

/** A round icon button on a bar (tablet 44, laptop 36). */
function Btn({
  lead,
  label,
  tip,
  keys,
  hint,
  onClick,
  disabled,
  pressed,
  className = QUIET,
  children,
}: {
  lead: boolean;
  /** The full name screen readers hear. */
  label: string;
  /** The short name in the tooltip (defaults to the label). */
  tip?: string;
  keys?: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      {...tipOn(tip ?? label, keys, hint)}
      onPointerDown={palmDown}
      onClick={() => !palmBlocked() && onClick()}
      disabled={disabled}
      className={`${PRESS} ${CTL(lead)} ${className}`}
    >
      {children}
    </button>
  );
}

/** `across`: a line across a vertical bar (the tablet's rail). 1 x 24 with 6 px either side. */
const Divider = ({ across = false, lead = true }: { across?: boolean; lead?: boolean }) => (
  <span className={across ? "my-1.5 h-px w-6 shrink-0 bg-[var(--bd-divider)]" : `mx-1.5 w-px shrink-0 bg-[var(--bd-divider)] ${lead ? "h-6" : "h-5"}`} aria-hidden />
);

/** One ink swatch: 28 px (laptop 22); the chosen one is ringed in its own colour (no scaling). */
function Swatch({ ink, on, size = 28 }: { ink: string; on: boolean; size?: number }) {
  return (
    <span
      className="block rounded-full transition-[box-shadow] duration-300 ease-[cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none"
      style={{ width: size, height: size, background: ink, boxShadow: on ? `0 0 0 3px var(--bd-panel), 0 0 0 5px ${ink}` : "var(--bd-swatch-edge)" }}
    />
  );
}

/** The first ink is charcoal on the light board and white on the dark one: it is named for what is seen. */
const inkName = (name: string, dark: boolean) => (dark && name === "Black" ? "White" : name);

/** A small picture of each paper for the paper menu and the paper button (the real print is drawn by the engine). */
const PAPER_SWATCH: Record<Backdrop, (ink: string, step: number) => React.CSSProperties> = {
  plain: () => ({}),
  dots: (ink, n) => ({ backgroundImage: `radial-gradient(circle, ${ink} 0.75px, transparent 1.1px)`, backgroundSize: `${n}px ${n}px`, backgroundPosition: `${n / 2}px ${n / 2}px` }),
  lines: (ink, n) => ({ backgroundImage: `linear-gradient(${ink} 1px, transparent 1px)`, backgroundSize: `100% ${n}px`, backgroundPosition: `0 ${Math.round(n / 2)}px` }),
  grid: (ink, n) => ({ backgroundImage: `linear-gradient(${ink} 1px, transparent 1px), linear-gradient(90deg, ${ink} 1px, transparent 1px)`, backgroundSize: `${n}px ${n}px`, backgroundPosition: "2px 2px" }),
};

// ---------------------------------------------------------------- sync helpers

/** Numbers a change before it goes out (see Ledger), and remembers it here too. */
function stampMsg(ledger: Ledger, m: BoardMsg): BoardMsg {
  switch (m.t) {
    case "add": {
      const q = ledger.stamp();
      ledger.mark([m.s.id], q);
      return { ...m, q };
    }
    case "del":
    case "imgdel": {
      const q = ledger.stamp();
      ledger.mark(m.ids, q);
      return { ...m, q };
    }
    case "img": {
      const q = ledger.stamp();
      ledger.mark([m.m.id], q);
      return { ...m, q };
    }
    case "clear": {
      const q = ledger.stamp();
      ledger.reset(q);
      return { ...m, q };
    }
    case "page": {
      // A new page starts clean: nothing numbered before it belongs on it.
      const q = ledger.stamp();
      ledger.reset(q);
      return { ...m, q };
    }
    case "set":
      return { ...m, q: ledger.stamp() };
    case "batch":
      return { t: "batch", ms: m.ms.map((x) => stampMsg(ledger, x)) };
    default:
      return m;
  }
}

// One look everywhere: the light board (clearest on a TV and in Meet).
setTheme("paper");

// ---------------------------------------------------------------- teacher

/** `lead`: the tablet. The laptop (lead false) is a full board too, but its view follows the tablet. */
export function TeacherBoard({ room, lead = true }: { room: string; lead?: boolean }) {
  const strokes = useRef<Stroke[]>([]);
  const images = useRef<BoardImage[]>([]);
  const cam = useRef<Camera>({ x: -60, y: -60, z: 1 });
  const current = useRef<Stroke | null>(null);
  // The next few pen positions the tablet predicts (drawn ahead of the pen, never saved).
  const predicted = useRef<Pt[]>([]);
  // Typed text or writing being dragged to a new place (drawn on top until it's let go).
  const moving = useRef<Stroke | null>(null);
  // Laptop: where the tablet's pen is hovering (a pointer for the students to follow).
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const pointerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerSent = useRef(0);
  // Set once moreRoom exists (further down), for the message handler.
  const moreRoomRef = useRef<() => void>(() => {});
  const undoStack = useRef<Action[]>([]);
  const redoStack = useRef<Action[]>([]);
  const link = useRef<BoardLink | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0].value);
  // Recent straight lines, so a bar then an upright (or the other way) becomes a T account.
  // When the last stroke landed (for an arrowhead added to the line just drawn).
  const lastDrawnAt = useRef(0);
  const recentLines = useRef<Array<{ id: string; ends: [Pt, Pt]; dir: "h" | "v"; at: number }>>([]);
  // The pen's real last position: smoothing trails it, so a stroke ends here.
  const lastRaw = useRef<Pt | null>(null);
  // Pen thickness, thin to large on one slider (remembered on this device). A little on the large
  // side to start with: it reads better from the back of the class.
  const [size, setSizeState] = useState(PEN_DEFAULT);
  const setSize = (v: number) => {
    setSizeState(v);
    try {
      localStorage.setItem("ht-board-pen-size", String(v));
    } catch {}
  };
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("ht-board-pen-size"));
      if (v >= PEN_MIN && v <= PEN_MAX) setSizeState(v);
    } catch {}
  }, []);
  // The slider, opened from the size button: where it sits (beside or above that button).
  // The highlighter in hand (the yellow swatch): the pen lays a broad see-through band, for headings
  // and key words. Picking an ink colour puts it down.
  const [marker, setMarker] = useState(false);
  const [sizeAt, setSizeAt] = useState<{ x: number; y: number } | null>(null);
  // It closes on a tap outside, 1.5 s after the last change, or when the screen turns (it would be
  // left behind its button).
  const sizeClose = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!sizeAt) return;
    const down = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-size-menu]")) setSizeAt(null);
    };
    const close = () => setSizeAt(null);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("resize", close);
      if (sizeClose.current) clearTimeout(sizeClose.current);
    };
  }, [sizeAt]);
  const onSizeDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.type === "pointerdown") {
      palmDown(e);
      if (palmBlocked()) return;
      e.currentTarget.setPointerCapture(e.pointerId);
    } else if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const r = e.currentTarget.getBoundingClientRect();
    // The knob's middle runs from 12 px in at each end (it is a fixed 24 px circle); whole steps.
    const t = Math.max(0, Math.min(1, (e.clientX - r.left - 12) / (r.width - 24)));
    setSize(Math.round(PEN_MIN + t * (PEN_MAX - PEN_MIN)));
    if (sizeClose.current) clearTimeout(sizeClose.current);
    sizeClose.current = setTimeout(() => setSizeAt(null), 1500);
  };
  // Typed words: the size used last (not tied to the pen any more).
  const lastTextPx = useRef(TEXT_PX[0] + 4);
  const [fingerDraws, setFingerDraws] = useState(false);
  // The other device (laptop or tablet) on the private room.
  const [partner, setPartner] = useState(false);
  // The tablet: the laptop was linked and has gone quiet (shown as a calm notice).
  const [linkLost, setLinkLost] = useState(false);
  // The light board (paper, the default) or the dark charcoal one: chosen with the paper button,
  // remembered on this device, and the other device follows.
  const [dark, setDarkState] = useState(false);
  const look: ThemeId = dark ? "night" : "paper";
  const [ledger] = useState(() => new Ledger(lead ? 1 : 0));
  const remoteLiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toolsHidden, setToolsHidden] = useState(false);
  // Pen down: the bars fade so they never cover the writing: after 150 ms of contact (so a dot or a
  // quick tap never makes them flicker), back 400 ms after the pen lifts (so writing, many short
  // strokes, never makes them pulse on every stroke).
  const [inking, setInkingNow] = useState(false);
  const inkingOff = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setInking = useCallback((on: boolean) => {
    if (inkingOff.current) clearTimeout(inkingOff.current);
    inkingOff.current = setTimeout(() => {
      inkingOff.current = null;
      setInkingNow(on);
    }, on ? 150 : 400);
  }, []);
  // Laptop (what students see): the bars hide after a few seconds without the mouse.
  const [quiet, setQuiet] = useState(false);
  const topBarRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Typing: where the text box sits on screen, and what is in it.
  const [typing, setTyping] = useState<{ x: number; y: number; px: number; color: string; maxPx: number; hPx: number; wPx: number; bold?: boolean; italic?: boolean; hl?: boolean } | null>(null);
  // `maxW`: how wide a line may run before it carries on below (to the screen's right edge).
  // `boxW`: a width Hamza set by dragging the box's side (kept with the text).
  const typingRef = useRef<{ id: string; wx: number; wy: number; size: number; color: string; text: string; maxW: number; boxW?: number; bold?: boolean; italic?: boolean; hl?: boolean; editing?: Stroke } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // What the other device is drawing or typing right now.
  const remoteLive = useRef<Stroke | null>(null);
  const [angle, setAngle] = useState<{ x: number; y: number; deg: number } | null>(null);
  // The eraser ring is moved straight on the page element, not through React: rubbing out used to
  // redraw the whole board's controls on every pen move.
  const eraserRef = useRef<HTMLSpanElement>(null);
  /** Show the ring at a screen point; with no point, hide it. */
  const moveEraser = (x?: number, y?: number) => {
    const el = eraserRef.current;
    if (!el) return;
    if (x === undefined || y === undefined) {
      if (el.style.display !== "none") el.style.display = "none";
      return;
    }
    el.style.transform = `translate(${x - ERASER_PX}px, ${y - ERASER_PX}px)`;
    if (el.style.display !== "block") el.style.display = "block";
  };
  const [zoom, setZoom] = useState(100);
  // What the toolbar needs to know, mirrored from the refs after each change.
  const [meta, setMeta] = useState({ undo: 0, redo: 0, content: 0 });
  const [copiedPresent, setCopiedPresent] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const selectedRef = useRef<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);
  const showDebug = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The toolbar only needs yes or no for each, so a new stroke on a page that already has some
  // changes nothing here and the board's controls are not redrawn at every pen lift.
  const syncMeta = () =>
    setMeta((p) => {
      const n = { undo: undoStack.current.length, redo: redoStack.current.length, content: strokes.current.length + images.current.length };
      return !p.undo === !n.undo && !p.redo === !n.redo && !p.content === !n.content ? p : n;
    });

  // ---- what is selected
  // One selection for everything: a set of strokes and pictures. Only this device knows it. The
  // typed text, line and picture selections below are read-only copies of it (written only by
  // syncSel), so every bar and key that works on one of those keeps working.
  const selRef = useRef<Sel | null>(null);
  const [selUI, setSelUI] = useState<SelUI | null>(null);
  // The selected typed text: a tap selects it (a gold frame and its bar), a drag then moves it and a
  // second tap opens it to edit. Its look is kept beside it for the bar's buttons.
  const [selText, setSelTextState] = useState<{ id: string; color: string; bold: boolean; italic: boolean; hl: boolean } | null>(null);
  const selTextRef = useRef<string | null>(null);
  // The selected straight line (the Move tool, a tap or a drag on it): a gold frame and a small bar
  // with Dotted or Solid, Duplicate and a bin.
  const [selLine, setSelLineState] = useState<{ id: string; dotted: boolean; line: boolean; arrow: boolean } | null>(null);
  const selLineRef = useRef<string | null>(null);
  /** The selected line as it is now (also while it is being dragged, when it is drawn on top). */
  const selLineStroke = (): Stroke | undefined => {
    const id = selLineRef.current;
    if (!id) return undefined;
    if (moving.current?.id === id) return moving.current;
    return strokes.current.find((x) => x.id === id && isRuled(x));
  };
  // The Line tool's style, Solid or Dotted: remembered for the next line, and on this device.
  const [lineDotted, setLineDottedState] = useState(false);
  const lineDottedRef = useRef(false);
  const setLineDotted = (on: boolean) => {
    lineDottedRef.current = on;
    setLineDottedState(on);
    try {
      localStorage.setItem("ht-board-line-dotted", on ? "1" : "0");
    } catch {}
  };
  // Set once the text grips exist (further down): ends a grip drag left open.
  const endTextDragRef = useRef<() => void>(() => {});
  // Set once the lifted group exists (further down): the tablet's group gliding, on the laptop.
  const remoteXfRef = useRef<(m: Extract<BoardMsg, { t: "xf" }>) => void>(() => {});
  // Set once the group drag exists (further down): a drag by the bar's grip or a corner, still open,
  // lands (the selection changed under it).
  const endHandleDragRef = useRef<() => void>(() => {});
  // Set once the group drag exists (further down): a drag still going goes back.
  const cancelGroupDragRef = useRef<() => void>(() => {});
  // Set once typing exists (further down): puts an open text box away.
  const commitTypingRef = useRef<() => void>(() => {});
  // Set once the group's lift exists (further down): the selection lost some members.
  const liftPruneRef = useRef<() => void>(() => {});
  /** Every stroke by its id (worked out again only when the board changes). */
  const idMap = useRef<{ of: Stroke[] | null; m: Map<string, Stroke> }>({ of: null, m: new Map() });
  const strokeMap = () => {
    const c = idMap.current;
    if (c.of !== strokes.current) {
      c.of = strokes.current;
      c.m = new Map(strokes.current.map((x) => [x.id, x]));
    }
    return c.m;
  };
  /** A selected stroke as it is now (also while it is moved on its own, drawn on top). */
  const strokeById = (id: string) => (moving.current?.id === id ? moving.current : strokeMap().get(id));
  /** Same members, in the same order? */
  const sameSel = (a: Sel | null, b: Sel | null) =>
    a === b || (!!a && !!b && a.ids.length === b.ids.length && a.imgs.length === b.imgs.length && a.ids.every((x, i) => x === b.ids[i]) && a.imgs.every((x, i) => x === b.imgs[i]));
  /** Goes up whenever the members change: the selection's key, without spelling out thousands of ids. */
  const selVer = useRef(0);
  const selKey = (x: Sel | null) => (x ? `s${selVer.current}` : "");
  /** The copies the bars read, and what the group bar shows. Each is set only when it changed. */
  const syncSel = () => {
    const sel = selRef.current;
    const lone = sel && sel.ids.length === 1 && !sel.imgs.length ? strokeById(sel.ids[0]) : undefined;
    const text = lone?.kind === "text" ? lone : undefined;
    const line = lone && isRuled(lone) ? lone : undefined;
    const picId = sel && !sel.ids.length && sel.imgs.length === 1 ? sel.imgs[0] : null;
    selTextRef.current = text?.id ?? null;
    selLineRef.current = line?.id ?? null;
    selectedRef.current = picId;
    setSelTextState((p) => (!text ? null : p && p.id === text.id && p.color === text.color && p.bold === !!text.bold && p.italic === !!text.italic && p.hl === !!text.hl ? p : { id: text.id, color: text.color, bold: !!text.bold, italic: !!text.italic, hl: !!text.hl }));
    setSelLineState((p) => (!line ? null : p && p.id === line.id && p.dotted === !!line.dotted && p.arrow === !!line.arrow ? p : { id: line.id, dotted: !!line.dotted, line: line.kind === "line", arrow: !!line.arrow }));
    let ui: SelUI | null = null;
    if (sel) {
      const members = sel.ids.map(strokeById).filter((x): x is Stroke => !!x);
      const kind: SelKind = text ? "text" : line ? "line" : picId ? "picture" : !sel.imgs.length && members.every((x) => x.kind === "ink") ? "ink" : "mixed";
      // The one colour every recolourable member shares (null when they differ; left out when none can be).
      // (Highlighter bands stay gold; highlighted typed text still takes a colour.)
      const inks = members.filter((x) => !(x.hl && x.kind !== "text"));
      const color = inks.length ? (inks.every((x) => x.color === inks[0].color) ? inks[0].color : null) : undefined;
      // The colours in it, in the swatches' order (for the split colour chip): at most four.
      const colors = COLORS.map((c) => c.value).filter((v) => inks.some((x) => x.color === v));
      ui = { key: selKey(sel), kind, n: sel.ids.length + sel.imgs.length, level: sel.grow?.level, color, colors };
    }
    setSelUI((p) => (p === ui || (p && ui && p.key === ui.key && p.kind === ui.kind && p.n === ui.n && p.level === ui.level && p.color === ui.color && p.colors.join() === ui.colors.join()) ? p : ui));
  };
  /**
   * Select these strokes and pictures (null or nothing: let go). A grip drag left open is finished
   * first, and an open text box is put away. Anything no longer on the board is left out.
   */
  const setSel = (next: Sel | null) => {
    const prev = selRef.current;
    let n = next;
    if (n) {
      const want = new Set(n.ids);
      const ids = strokes.current.filter((x) => want.has(x.id)).map((x) => x.id);
      if (moving.current && want.has(moving.current.id) && !ids.includes(moving.current.id)) ids.push(moving.current.id);
      const wantI = new Set(n.imgs);
      const imgs = images.current.filter((m) => wantI.has(m.id)).map((m) => m.id);
      n = ids.length || imgs.length ? { ...n, ids, imgs, grow: n.grow && ids.includes(n.grow.seed) ? n.grow : undefined } : null;
    }
    if (!sameSel(n, prev)) {
      selVer.current++;
      // The grips leave the page with the old selection: a drag still open on them lands first (a
      // handle drag of the group too, so it never stays stuck).
      endTextDragRef.current();
      endHandleDragRef.current();
    }
    if (n && typingRef.current) commitTypingRef.current();
    selRef.current = n;
    syncSel();
  };
  const clearSel = () => setSel(null);
  /** (The old single selections, now just ways into the one selection. Passing null lets everything go.) */
  const select = (id: string | null) => (id ? setSel({ ids: [], imgs: [id] }) : clearSel());
  /** The selected text as it is now (also while it is being dragged, when it is drawn on top). */
  const selStroke = (): Stroke | undefined => {
    const id = selTextRef.current;
    if (!id) return undefined;
    if (moving.current?.id === id) return moving.current;
    return strokes.current.find((x) => x.id === id && x.kind === "text");
  };
  const selectText = (id: string | null) => (id ? setSel({ ids: [id], imgs: [] }) : clearSel());
  const selectLine = (id: string | null) => (id ? setSel({ ids: [id], imgs: [] }) : clearSel());
  /**
   * After the board changes under the selection (rubbed out, undone, cleared, changed on the other
   * device): what is no longer on the board is let go, and the bars show the look things have now.
   */
  const checkSel = () => {
    const sel = selRef.current;
    if (!sel) return;
    const m = strokeMap();
    const ids = sel.ids.filter((id) => m.has(id) || moving.current?.id === id);
    const onI = new Set(images.current.map((x) => x.id));
    const imgs = sel.imgs.filter((id) => onI.has(id));
    if (ids.length !== sel.ids.length || imgs.length !== sel.imgs.length) {
      selRef.current = ids.length || imgs.length ? { ...sel, ids, imgs, grow: sel.grow && ids.includes(sel.grow.seed) ? sel.grow : undefined } : null;
      selVer.current++;
      if (!selRef.current) endTextDragRef.current();
      endHandleDragRef.current();
      liftPruneRef.current();
    }
    syncSel();
  };

  const [page, setPage] = useState<BoardPage>(MAIN_PAGE);
  const [pageList, setPageList] = useState<BoardPage[]>([MAIN_PAGE]);
  // The Insert menu (a picture or PDF from this device, a past paper, or notes) and the Library.
  const [insertOpen, setInsertOpen] = useState(false);
  const [library, setLibrary] = useState<null | "papers" | "notes">(null);
  // ---- the chrome's layout (SPEC v2): the rail's top is centred in the window's height (whole
  // pixels, never under the top bar); in a short window the inks fold into one chip.
  const [vh, setVh] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const railTop = Math.max(76, Math.round((vh - 530) / 2));
  const inksFolded = lead && vh < 606;
  const [inksOpen, setInksOpen] = useState(false);
  // The page name's button is always a whole, even number of pixels wide (so everything after it
  // sits on whole pixels), worked out once its font has loaded.
  const pageNameRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = pageNameRef.current;
    if (!el) return;
    const fix = () => {
      el.style.width = "";
      el.style.width = `${Math.ceil(el.getBoundingClientRect().width / 2) * 2}px`;
    };
    fix();
    void document.fonts?.ready.then(fix);
  }, [page.title, lead]);
  // The selection's colour chip opens the four inks just above the bar; the typing bar's the same.
  const [colorAtRaw, setColorAt] = useState<{ x: number; y: number; for: "sel" | "typing"; key: string } | null>(null);
  // (Open only for the selection it was opened on.)
  const colorAt = colorAtRaw && (colorAtRaw.for === "typing" ? !!typing : colorAtRaw.key === selUI?.key) ? colorAtRaw : null;
  useEffect(() => {
    if (!colorAtRaw) return;
    const down = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-color-menu]")) setColorAt(null);
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [colorAtRaw]);
  const colorNow = colorAt?.for === "typing" ? typing?.color : selUI?.colors.length === 1 ? selUI.colors[0] : null;
  /** A colour from that capsule: for the words being typed, or for everything selected. */
  const onColorPick = (e: React.MouseEvent<HTMLElement>) => {
    if (palmBlocked()) return;
    const c = e.currentTarget.dataset.v!;
    if (colorAtRaw?.for === "typing") setTextColor(c);
    else colorSelAll(c);
    setColorAt(null);
  };
  /** An ink from the rail (or its fold-out). */
  const onInkPick = (e: React.MouseEvent<HTMLElement>) => {
    if (palmBlocked()) return;
    pickInk(e.currentTarget.dataset.v!);
    setInksOpen(false);
  };
  /** A row of the Insert menu. */
  const onInsertRow = (e: React.MouseEvent<HTMLElement>) => {
    if (palmBlocked()) return;
    const k = e.currentTarget.dataset.k;
    setInsertOpen(false);
    if (k === "picture") fileRef.current?.click();
    else setLibrary(k === "notes" ? "notes" : "papers");
  };
  const openColors = (e: React.MouseEvent<HTMLElement>, which: "sel" | "typing") => {
    if (palmBlocked()) return;
    const r = e.currentTarget.getBoundingClientRect();
    setColorAt(colorAt ? null : { x: Math.round(r.left + r.width / 2), y: Math.round(r.top - 8 - 4), for: which, key: selUI?.key ?? "" });
  };
  // The Insert menu and the inks' fold-out close on a tap anywhere else.
  useEffect(() => {
    if (!insertOpen && !inksOpen) return;
    const down = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.("[data-insert-menu],[data-inks-menu]")) {
        setInsertOpen(false);
        setInksOpen(false);
      }
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [insertOpen, inksOpen]);
  const [insertAt, setInsertAt] = useState<React.CSSProperties>({});

  // Is the stroke being drawn a lasso? (Set by the input code further down, read by the drawing.)
  const gestureLasso = useRef(false);
  // ---- a group lifted off the board while it moves (see "The lifted group" further down)
  const lift = useRef<Lift | null>(null);
  /** What the board itself draws: everything except a lifted group (drawn on its own layer on top
   * while it moves). With nothing lifted these are the board's own lists, so nothing changes. */
  const shownStrokes = () => {
    const L = lift.current;
    if (!L || L.landing || !L.ids.size) return strokes.current;
    if (L.srcS !== strokes.current) {
      L.srcS = strokes.current;
      const rest = strokes.current.filter((x) => !L.ids.has(x.id));
      // The same strokes as before (only a lifted one changed): the same list, so the board is not redrawn.
      if (rest.length !== L.restS.length || rest.some((x, i) => x !== L.restS[i])) L.restS = rest;
    }
    return L.restS;
  };
  const shownImages = () => {
    const L = lift.current;
    if (!L || L.landing || !L.imgs.size) return images.current;
    if (L.srcI !== images.current) {
      L.srcI = images.current;
      const rest = images.current.filter((m) => !L.imgs.has(m.id));
      if (rest.length !== L.restI.length || rest.some((m, i) => m !== L.restI[i])) L.restI = rest;
    }
    return L.restI;
  };

  const { canvasRef, size: screen, requestDraw } = useCanvas((ctx, w, h, again) =>
    paint(
      ctx,
      w,
      h,
      cam.current,
      shownImages(),
      shownStrokes(),
      [
        // (A lasso is shown as its own dashed outline, never as ink.)
        gestureLasso.current ? null : withPrediction(current.current, predicted.current),
        remoteLive.current,
        moving.current,
        pointer.current ? { id: "pointer", kind: "ink", color: "#F07A6A", size: 15 / cam.current.z, pts: [[pointer.current.x, pointer.current.y, 0.6]] } : null,
      ],
      again,
      null, // the selected picture's frame and handles are page elements over the board ("The selected picture")
    ),
  );

  // The paper: plain, dots, lines or squared, on the light board or the dark one. One choice for
  // the whole board (every page), remembered on this device; the other device follows.
  const [paper, setPaperState] = useState<Backdrop>("dots");
  const paperRef = useRef<Backdrop>("dots");
  const darkRef = useRef(false);
  const setPaperRef = useRef<(v: Backdrop, isDark: boolean, share: boolean) => void>(() => {});
  const setPaper = (pick: Backdrop, isDark: boolean, share: boolean) => {
    // One paper only now: dots (25 Nov, Hamza). Older boards and older devices asking for plain,
    // lines or squared get the dots too; only light or dark is a choice.
    void pick;
    const v: Backdrop = "dots";
    paperRef.current = v;
    darkRef.current = isDark;
    setPaperState(v);
    setDarkState(isDark);
    setBackdrop(v);
    setTheme(isDark ? "night" : "paper");
    // The finished layer is drawn again with the new paper at the next frame (its key holds both).
    requestDraw();
    try {
      localStorage.setItem("ht-board-bg", v);
      localStorage.setItem("ht-board-dark", isDark ? "1" : "0");
    } catch {}
    if (share) link.current?.send({ t: "bg", v, dark: isDark });
  };
  useEffect(() => {
    setPaperRef.current = setPaper;
  });

  // ---- persistence + live link
  // Saved under the room's first part, so a board drawn before the private key existed is still here.
  // The laptop keeps its own copy: the tablet's board always wins when both are on.
  const storeKey = `ht-board-${room.split(".")[0]}${lead ? "" : "-laptop"}`;
  // Pages: each class gets its own (see openPage). "main" is the board from before pages.
  const pageRef = useRef<BoardPage>(MAIN_PAGE);
  const pagesRef = useRef<BoardPage[]>([MAIN_PAGE]);
  // Set once forgetPage exists (further down), for the message handler above it.
  const forgetPageRef = useRef<(id: string) => void>(() => {});
  // The laptop: has the tablet sent this page's board yet? (Then its own older copy isn't needed.)
  const pageBoardIn = useRef(false);
  // Which page's board has actually arrived here (from this device's store or the tablet). A page is
  // only saved on leaving once it has: leaving one still loading must never save it empty.
  const loadedPageId = useRef<string | null>(null);
  // The laptop: when the tablet's heartbeat was last heard (while it's on, the tablet picks the page).
  const tabletHeardAt = useRef(0);
  // Set once openPage exists (further down), for the message handler above it.
  const openPageRef = useRef<(p: BoardPage, announce: boolean) => void>(() => {});
  // Has this device's saved list of pages been read yet? (Until then the list isn't saved.)
  const indexReady = useRef(false);
  const ensurePagesRef = useRef<() => void>(() => {});
  const keyFor = useCallback((id: string) => (id === MAIN_PAGE.id ? storeKey : `${storeKey}#${id}`), [storeKey]);
  // Pictures that only live in this browser (local preview) aren't kept. Saved compact
  // (points rounded to a tenth), so even a very full board saves in a moment.
  const snapshot = () => ({ strokes: strokes.current.map(packOnce), images: images.current.filter((m) => !m.url.startsWith("blob:")) });
  const save = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set once flash exists (further down), for the link and the save, which are set up above it.
  const flashRef = useRef<(msg: string, ms?: number) => void>(() => {});
  // Said once: the browser would not keep the board (storage full or blocked).
  const saveFailed = useRef(false);
  const saved = useCallback(
    (ok: boolean) => {
      if (ok || saveFailed.current) return;
      saveFailed.current = true;
      flashRef.current(`This ${lead ? "tablet" : "laptop"} could not save the board. Keep this tab open.`, 9000);
    },
    [lead],
  );
  // Is the pen down or hovering ready to write? (Set once the pen's state exists, further down.)
  const writingNow = useRef<() => boolean>(() => false);
  const saveAsked = useRef(0);
  const persist = useCallback(() => {
    if (save.current) clearTimeout(save.current);
    else saveAsked.current = Date.now();
    // Saved a moment after writing stops, in a quiet gap between pen strokes, so saving a full
    // page never makes the pen hitch.
    const run = () => {
      save.current = null;
      // The pen is on the glass or hovering over it: wait for it to lift away (ten seconds at most),
      // so the save never lands on the first stroke after a pause.
      if (writingNow.current() && Date.now() - saveAsked.current < 10_000) {
        save.current = setTimeout(run, 700);
        return;
      }
      // The page and its board as they are now; if the page changes before the quiet moment
      // comes, this save is dropped (leaving a page already saves it).
      const id = pageRef.current.id;
      const board = { strokes: strokes.current.map(packOnce), images: images.current.filter((m) => !m.url.startsWith("blob:")) };
      const go = () => {
        // Only a page whose own board has arrived: one still loading must never be saved nearly empty.
        if (pageRef.current.id === id && loadedPageId.current === id) void saveBoard(keyFor(id), board).then(saved);
      };
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (idle) idle(go, { timeout: 2000 });
      else go();
    };
    save.current = setTimeout(run, 1500);
  }, [keyFor, saved]);

  // Closing or leaving the tab with a save still waiting: save straight away.
  useEffect(() => {
    const flush = () => {
      if (!save.current) return;
      clearTimeout(save.current);
      save.current = null;
      if (loadedPageId.current !== pageRef.current.id) return; // still loading: nothing of its own to save yet
      void saveBoard(keyFor(pageRef.current.id), { strokes: strokes.current.map(packOnce), images: images.current.filter((m) => !m.url.startsWith("blob:")) });
    };
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [keyFor]);

  // Where each page was last looked at. The tablet keeps it on the device too, so a reload in the
  // middle of a class comes back to the same spot (and the laptop with it), not the top left corner.
  const camByPage = useRef(new Map<string, Camera>());
  const camsKey = `${storeKey}-cams`;
  const saveCams = useCallback(() => {
    if (!lead) return;
    camByPage.current.set(pageRef.current.id, cam.current);
    try {
      localStorage.setItem(camsKey, JSON.stringify(Object.fromEntries(camByPage.current)));
    } catch {}
  }, [lead, camsKey]);
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && saveCams();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", saveCams);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", saveCams);
    };
  }, [saveCams]);

  // The laptop: what was made on it while the tablet was away, page by page. When the tablet's copy
  // of that page arrives it is the truth for everything else, but this work is added to it rather
  // than lost (a lesson prepared on the laptop the evening before).
  const solo = useRef(new Map<string, Set<string>>());
  const soloKey = `${storeKey}-solo`;
  const soloSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSolo = useCallback(() => {
    if (soloSave.current) clearTimeout(soloSave.current);
    soloSave.current = setTimeout(() => {
      soloSave.current = null;
      try {
        const all: Record<string, string[]> = {};
        for (const [k, v] of solo.current) if (v.size) all[k] = [...v];
        localStorage.setItem(soloKey, JSON.stringify(all));
      } catch {}
    }, 400);
  }, [soloKey]);
  /** Take these off the "made while the tablet was away" list (rubbed out, or the tablet has them now). */
  const dropSolo = useCallback(
    (ids: string[] | null) => {
      const pg = pageRef.current.id;
      const set = solo.current.get(pg);
      if (!set?.size) return;
      if (ids) for (const id of ids) set.delete(id);
      else solo.current.delete(pg);
      saveSolo();
    },
    [saveSolo],
  );
  const noteSolo = useCallback(
    (msg: BoardMsg) => {
      for (const m of msg.t === "batch" ? msg.ms : [msg]) {
        if (m.t === "del" || m.t === "imgdel") dropSolo(m.ids);
        else if (m.t === "clear") dropSolo(null);
        // Only while the tablet is silent: with it on, it hears every change as it is made.
        else if ((m.t === "add" || m.t === "img") && Date.now() - tabletHeardAt.current >= 6000) {
          const pg = pageRef.current.id;
          const set = solo.current.get(pg) ?? new Set<string>();
          set.add(m.t === "add" ? m.s.id : m.m.id);
          solo.current.set(pg, set);
          saveSolo();
        }
      }
    },
    [dropSolo, saveSolo],
  );

  // Everything goes to the private room: just Hamza's tablet and laptop, nobody else.
  const send = useCallback(
    (m: BoardMsg) => {
      if (!lead) noteSolo(m);
      link.current?.send(tagPage(stampMsg(ledger, m), pageRef.current.id));
    },
    [ledger, lead, noteSolo],
  );
  const fullBoard = useCallback(
    (): BoardMsg => ({ t: "set", strokes: strokes.current.map(packOnce), images: images.current.filter((m) => !m.url.startsWith("blob:")) }),
    [],
  );
  // What the tablet shares: the space between its own toolbars, where Hamza writes. The
  // laptop and students fit exactly that, so it fills their screens and nothing is cut off.
  const writingView = (w: number, h: number) =>
    areaView(cam.current, w, h, clearInset(h, [topBarRef.current, sidePanelRef.current], [], 0, [toolbarRef.current]));
  /**
   * What the tablet shares with the laptop: its WHOLE screen, exactly what the TV wired to it shows
   * (25 Nov, Hamza: the laptop had too much border around the tablet's picture). The bars float
   * over the board, so the board under them is shared too; a tablet and laptop of the same shape now
   * show the same picture edge to edge.
   */
  const sharedView = (w: number, h: number) => areaView(cam.current, w, h, FULL_SCREEN);
  // (The view is sent from the frame loop now, by whichever device is being moved: see viewFrame.)

  // ---- the other device: everything it does lands here too
  const gotBoard = useRef(false);
  const resync = useRef<"join" | "rev">("join");
  const revMiss = useRef(0);
  // The last view heard from the other device (the laptop also places new pictures there).
  const teacherView = useRef<View | null>(null);
  // Who leads the view (see "the view, both ways" further down): the key of the gesture that leads,
  // and whether that is this device.
  const myBy: 0 | 1 = lead ? 1 : 0;
  const viewKey = useRef<{ g: number; by: 0 | 1 }>({ g: 0, by: 1 });
  const owning = () => viewKey.current.by === myBy;
  // How a key from the other device compares with the one held here: above 0 newer, 0 the same,
  // below 0 older. A lower count from the other device when it also led last means it was reloaded
  // (its count starts again from 0), so that counts as newer: it is not left ignored.
  const keyCmp = (k: { g: number; by: number }) => {
    const c = k.g - viewKey.current.g || k.by - viewKey.current.by;
    return c < 0 && k.by !== myBy && k.by === viewKey.current.by ? 1 : c;
  };
  // The other device knows the two-way view (it sent a gesture key).
  const peerTwoWay = useRef(false);
  const onRemote = useRef<(m: BoardMsg) => void>(() => {});
  // The laptop with an OLDER tablet (one that can't follow): its view was moved here by hand
  // (wheel, Space drag, Fit), so it no longer shows what the tablet shows. It goes back by itself as
  // soon as the tablet moves, or at once with "Tablet view" in the top bar. (With a two-way tablet the
  // laptop's hand simply leads, and this never shows.)
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  const markAwayOld = () => {
    if (lead || awayRef.current || !teacherView.current || Date.now() - tabletHeardAt.current > 10_000) return;
    awayRef.current = true;
    setAway(true);
  };

  useEffect(() => {
    showDebug.current = new URL(window.location.href).searchParams.get("debug") === "1";
    let alive = true;
    const cam0 = cam.current;
    // This device's saved list of pages. `switchPage`: also go back to the page Hamza was on (the
    // tablet, or the laptop on its own; with the tablet on, the tablet says which page).
    const readIndex = async (switchPage: boolean) => {
      const idx = await loadIndex(storeKey);
      if (!alive) return;
      if (idx?.pages.length) {
        const mine = pagesRef.current;
        // Still on "Board": the saved list as it was. Already moved on this session: what is listed
        // here now stays as it is, and the saved pages join it.
        const fresh = switchPage && pageRef.current.id === MAIN_PAGE.id;
        pagesRef.current = [...idx.pages.map((y) => (fresh ? y : (mine.find((x) => x.id === y.id) ?? y))), ...mine.filter((x) => !idx.pages.some((y) => y.id === x.id))];
        setPageList(pagesRef.current);
        const cur = idx.pages.find((x) => x.id === idx.current);
        if (fresh && cur) {
          pageRef.current = cur;
          setPage(cur);
        }
      }
      indexReady.current = true;
      // A page opened before the list was read wasn't saved then (it would have written over the list): save it now.
      if (pageRef.current.id !== MAIN_PAGE.id && pageRef.current.id !== idx?.current) void saveIndex(storeKey, { pages: pagesRef.current, current: pageRef.current.id });
      ensurePagesRef.current();
    };
    // The tablet: what the laptop says before the tablet knows which page it is on, and has that
    // page's board, waits here. (Taken straight away, the laptop's board for "Board" landed on
    // whichever page the tablet then opened, and an empty tablet could answer as if it were the truth.)
    let early: BoardMsg[] | null = lead ? [] : null;
    const drain = () => {
      const q = early;
      early = null;
      if (q && alive) for (const m of q) onRemote.current(m);
    };
    // Never held for long, even if the saved board is slow to open.
    const drainLate = setTimeout(drain, 3000);
    const loadSaved = async () => {
      try {
        await openSaved();
      } finally {
        drain();
      }
    };
    const openSaved = async () => {
      // Where Hamza left off: the paper he chose, the page he was on, then its board.
      await readIndex(true);
      if (!alive) return;
      try {
        const bg = localStorage.getItem("ht-board-bg") as Backdrop | null;
        const isDark = localStorage.getItem("ht-board-dark") === "1";
        if ((bg && BACKDROPS.includes(bg)) || isDark) setPaperRef.current(bg && BACKDROPS.includes(bg) ? bg : "plain", isDark, false);
        // And the Line tool's style (Solid or Dotted).
        if (localStorage.getItem("ht-board-line-dotted") === "1") {
          lineDottedRef.current = true;
          setLineDottedState(true);
        }
      } catch {}
      if (lead) {
        // And where on each page (unless Hamza has already moved the board while this loaded).
        try {
          const all = JSON.parse(localStorage.getItem(camsKey) ?? "{}") as Record<string, Partial<Camera> | null>;
          for (const [id, c] of Object.entries(all)) {
            if (!c || camByPage.current.has(id)) continue;
            const { x, y, z } = c;
            if (typeof x === "number" && typeof y === "number" && typeof z === "number" && Number.isFinite(x) && Number.isFinite(y) && z >= MIN_Z && z <= MAX_Z) camByPage.current.set(id, { x, y, z });
          }
        } catch {}
        const c = camByPage.current.get(pageRef.current.id);
        if (c && cam.current === cam0) {
          cam.current = c;
          setZoom(Math.round(c.z * 100));
          requestDraw();
        }
      }
      const id = pageRef.current.id;
      const saved = await loadBoard(keyFor(id));
      // The page changed while it loaded: that page opens its own board.
      if (!alive || pageRef.current.id !== id) return;
      // The laptop: the tablet's board arrived meanwhile, and that is the truth. This device's older
      // copy on top of it would bring back what was rubbed out.
      if (!lead && gotBoard.current) return;
      loadedPageId.current = id;
      // Anything that arrived while it loaded (the other device's board) stays too, and is saved.
      const arrived = strokes.current.length + images.current.length > 0;
      if (saved) {
        const hasS = new Set(saved.strokes.map((x) => x.id));
        const hasI = new Set(saved.images.map((x) => x.id));
        strokes.current = [...saved.strokes, ...strokes.current.filter((x) => !hasS.has(x.id))];
        images.current = [...saved.images, ...images.current.filter((x) => !hasI.has(x.id))];
        requestDraw();
        syncMeta();
      }
      if (arrived) persist();
    };
    if (!lead) {
      // The laptop's own list of pages is read straight away, even with the tablet on (its blank
      // pages used to drop off the list), and what it made while the tablet was away.
      void readIndex(false);
      try {
        const all = JSON.parse(localStorage.getItem(soloKey) ?? "{}") as Record<string, string[]>;
        for (const [k, v] of Object.entries(all)) if (Array.isArray(v) && !solo.current.has(k)) solo.current.set(k, new Set(v));
      } catch {}
    }
    // The laptop link, said plainly on the tablet (never on the laptop, whose screen the class sees).
    let linked = false;
    let lostTimer: ReturnType<typeof setTimeout> | null = null;
    let lostShown = false;
    const onPeople = (others: number) => {
      const on = others > 0;
      setPartner(on);
      if (!lead) return;
      if (on) {
        if (lostTimer) clearTimeout(lostTimer);
        lostTimer = null;
        if (lostShown) {
          lostShown = false;
          setLinkLost(false);
          flashRef.current("Laptop linked.");
        }
      } else if (linked && !lostTimer && !lostShown) {
        // A few seconds first: on weak Wi-Fi the link can drop and come straight back.
        lostTimer = setTimeout(() => {
          lostShown = true;
          setLinkLost(true);
          // Then the notice steps aside (the grey dot in the top bar still says so).
          lostTimer = setTimeout(() => {
            lostTimer = null;
            setLinkLost(false);
          }, 30_000);
        }, 3000);
      }
      linked = on;
    };
    // The tablet opens its saved board. The laptop waits a moment for the tablet's
    // board, and only opens its own copy when the tablet isn't on.
    if (lead) void loadSaved();
    const late = lead ? null : setTimeout(() => !gotBoard.current && void loadSaved(), 1800);
    const t = setTimeout(syncMeta, 0);
    // Typed words are measured and drawn in the board's own font, Inter Tight: once it has loaded (both
    // weights), the font is read again and every typed word drawn again in it, so the tablet and the
    // laptop lay out the same words the same way.
    const family = getComputedStyle(document.querySelector("[data-board]") ?? document.body).fontFamily;
    void Promise.all([document.fonts?.load(`500 32px ${family}`), document.fonts?.load(`700 32px ${family}`)])
      .catch(() => {})
      .then(() => document.fonts?.ready)
      .then(() => {
        if (!alive) return;
        resetBoardFont();
        redrawAll();
        requestDraw();
      });
    link.current = connectBoard(
      room,
      "teacher",
      (m) => (early ? early.push(m) : onRemote.current(m)),
      (_viewers, others) => onPeople(others),
      true,
      lead ? undefined : () => tagPage(stampMsg(ledger, fullBoard()), pageRef.current.id),
    );
    // Heartbeat (tablet only): the laptop and students compare it with what they have and fetch the board again if behind.
    const beat = lead
      ? setInterval(() => {
          const shared = images.current.filter((m) => !m.url.startsWith("blob:"));
          const { w, h } = screen.current;
          // The view goes too: a "view" message that got lost is put right within two seconds.
          send({ t: "rev", n: strokes.current.length + shared.length, last: strokes.current[strokes.current.length - 1]?.id ?? "", d: boardDigest(strokes.current, shared), d2: boardDigest(strokes.current.map(packOnce), shared, true), p: pageRef.current, ...(w && h ? { v: sharedView(w, h), vg: viewKey.current.g, vb: viewKey.current.by } : {}) });
        }, 2000)
      : undefined;
    return () => {
      alive = false;
      clearTimeout(t);
      if (late) clearTimeout(late);
      clearTimeout(drainLate);
      if (lostTimer) clearTimeout(lostTimer);
      clearInterval(beat);
      link.current?.close();
    };
  }, [room, storeKey, keyFor, requestDraw, send, screen, fullBoard, lead, ledger, persist, camsKey, soloKey]);


  // Keeps the text box on its words while the board pans or zooms.
  const placeTyping = useCallback(() => {
    const t = typingRef.current;
    if (!t) return;
    const c = cam.current;
    // How big the words are now (they wrap), so the style bar and the handles sit just clear of them.
    const wrapped = wrapText(t.text || " ", t.size, t.maxW, t);
    const m = measureText(wrapped, t.size, t);
    const wPx = Math.max(t.boxW ?? 0, m.w, t.size * 3) * c.z;
    setTyping({ x: (t.wx - c.x) * c.z, y: (t.wy - c.y) * c.z, px: t.size * c.z, color: t.color, maxPx: t.maxW * c.z, hPx: m.h * c.z, wPx, bold: t.bold, italic: t.italic, hl: t.hl });
  }, []);

  // The zoom % label updates once the view stops moving, not on every frame of a pinch or
  // glide (each update redraws the toolbars, which made pinching stutter on the tablet).
  const zoomLabel = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refresh = useCallback(() => {
    requestDraw();
    if (zoomLabel.current) clearTimeout(zoomLabel.current);
    zoomLabel.current = setTimeout(() => {
      setZoom(Math.round(cam.current.z * 100));
      saveCams();
    }, 150);
    if (typingRef.current) placeTyping();
  }, [requestDraw, placeTyping, saveCams]);

  // ---- the view, both ways: whoever is moving the board by hand leads, the other device follows
  // (Hamza's request, 20 Nov 2026: before, only the tablet led). Each gesture carries a key, its
  // number and who made it: the last device to START moving leads, the tablet wins a tie, and only a
  // camera moved by a hand is ever sent, so a follower never echoes the view back. The follower plays
  // the leader's path back smoothly (a little behind, between timestamped samples, through a stiff
  // spring), instead of easing towards each message, which made the laptop surge and stop ten times
  // a second (the "blinking").
  // When this device's hand last moved the board.
  const lastHandAt = useRef(0);
  // (`peerTwoWay`, above: until the other device is known to be two-way, the laptop behaves as with an
  // older tablet: it follows, and its own moves only look around; "Tablet view" brings it back.)
  /** Where on this screen the shared view sits (the laptop: where the tablet's view landed, so its
   * own moves send back a view of the same shape, and a handover never zooms either screen). */
  const focusPx = useRef<View | null>(null);
  /** The clear part of this screen a followed view is fitted into (worked out once per follow, and
   * again after a resize or the tools showing or hiding). */
  const followInsetCache = useRef<Inset | null>(null);
  const followInset = (): Inset => {
    // The whole screen on both devices (the shared view is the tablet's whole screen, see sharedView):
    // no margin of its own around the other device's picture, and a handover never zooms.
    followInsetCache.current ??= FULL_SCREEN;
    return followInsetCache.current;
  };
  /** The shared view this device shows now, in board units. */
  const myRect = (): View | null => {
    const { w, h } = screen.current;
    if (!w || !h) return null;
    if (lead) return sharedView(w, h);
    const c = cam.current;
    let f = focusPx.current;
    if (!f) {
      const ins = followInset();
      f = { x: ins.l, y: ins.t, w: Math.max(80, w - ins.l - ins.r), h: Math.max(80, h - ins.t - ins.b) };
    }
    return { x: c.x + f.x / c.z, y: c.y + f.y / c.z, w: f.w / c.z, h: f.h / c.z };
  };
  /** Show the shared view R on this screen (fitted into its clear area, never cut off). */
  const showRect = (R: View) => {
    const { w, h } = screen.current;
    if (!w || !h) return;
    const ins = followInset();
    let c = fitView(R, w, h, ins, FOLLOW_MIN_Z, FOLLOW_MAX_Z);
    // The same zoom as now, give or take rounding (a pan): keep it exactly, so the board slides its
    // finished picture pixel for pixel instead of stretching it by a hair (which looks soft).
    const z0 = cam.current.z;
    if (Math.abs(c.z - z0) <= z0 * 1e-6) {
      const cx = R.x + R.w / 2;
      const cy = R.y + R.h / 2;
      const iw = Math.max(80, w - ins.l - ins.r);
      const ih = Math.max(80, h - ins.t - ins.b);
      c = { x: cx - (ins.l + iw / 2) / z0, y: cy - (ins.t + ih / 2) / z0, z: z0 };
    }
    cam.current = c;
    if (!lead) focusPx.current = { x: (R.x - c.x) * c.z, y: (R.y - c.y) * c.z, w: R.w * c.z, h: R.h * c.z };
    refresh();
  };
  /** Send this device's view (the owner only; see the frame loop). */
  const sendViewNow = (end: boolean) => {
    const R = myRect();
    if (!R) return;
    const at = Math.round((performance.timeOrigin + msNow()) * 10) / 10;
    link.current?.send({ t: "view", v: R, at, g: viewKey.current.g, by: myBy, ...(end ? { end: 1 as const } : {}) });
  };
  // What the frame loop has sent (`force`: send now, marked as at rest: a resize, a page opened).
  const viewSent = useRef({ key: "", at: 0, movedAt: 0, last: "", pendingEnd: false, force: false });
  /** Called each frame: the owner sends its view when it moved (at most 30 a second, in step with the
   * screen), and one last exact one, marked `end`, once it has been still for 120 ms. */
  const viewFrame = () => {
    if (!owning() || !(lead || peerTwoWay.current)) return;
    const V = viewSent.current;
    const c = cam.current;
    const { w, h } = screen.current;
    if (!w || !h) return;
    const key = `${c.x}|${c.y}|${c.z}|${w}|${h}`;
    const now = msNow();
    if (V.force) {
      sendViewNow(true);
      Object.assign(V, { force: false, key, at: now, movedAt: now, pendingEnd: false });
    } else if (key !== V.key && now - V.at >= 28) {
      sendViewNow(false);
      Object.assign(V, { key, at: now, movedAt: now, pendingEnd: true });
    } else if (key !== V.last) V.movedAt = now;
    if (V.pendingEnd && key === V.key && now - V.movedAt > 120) {
      sendViewNow(true);
      V.pendingEnd = false;
      V.at = now;
    }
    // The laptop leading: once every 2 s it says so again (repairs a lost "end" on the tablet).
    if (!lead && partner && !V.pendingEnd && now - V.at > 2000) {
      sendViewNow(true);
      V.at = now;
    }
    V.last = key;
  };
  /** A hand on this device moves the board: it leads from here (a new gesture after 400 ms of rest). */
  const takeView = () => {
    // An older tablet, which can't follow: the laptop only looks around, as before.
    if (!lead && !peerTwoWay.current) return markAwayOld();
    const now = msNow();
    if (!owning() || now - lastHandAt.current > 400) {
      viewKey.current = { g: viewKey.current.g + 1, by: myBy };
      stopFollowing();
    }
    lastHandAt.current = now;
  };

  // ---- following: the leader's path, played back smoothly
  type ViewSample = { at: number; cx: number; cy: number; lw: number; asp: number; end: boolean };
  const fol = useRef({
    buf: [] as ViewSample[],
    key: "",
    offs: [] as number[],
    off: 0,
    jit: 0,
    iv: 33,
    prevAt: 0,
    ts: false,
    s: null as null | { cx: number; cy: number; lw: number },
    v: { cx: 0, cy: 0, lw: 0 },
    last: 0,
    running: false,
    R: null as View | null,
    lastRecv: 0,
  });
  const stopFollowing = () => {
    const F = fol.current;
    F.running = false;
    F.buf = [];
    F.s = null;
  };
  // Set once the input code exists (further down): a hand still moving this board lets go.
  const yieldHandRef = useRef<() => void>(() => {});
  /** A view from the other device: who leads is settled first, then it is played back. */
  const onView = (m: Extract<BoardMsg, { t: "view" }>) => {
    if (m.g !== undefined) peerTwoWay.current = true;
    // (An older laptop never sends a view; one without a key is ignored by the tablet, to be safe.)
    if (lead && m.g === undefined) return;
    const k = { g: m.g ?? 0, by: m.by ?? 1 };
    const cmp = keyCmp(k);
    if (cmp < 0) return; // an older gesture
    if (cmp > 0) {
      // The other device started moving later: it leads now. A hand still moving here is let go
      // until it lifts (no tug of war).
      viewKey.current = { g: k.g, by: k.by as 0 | 1 };
      yieldHandRef.current();
    }
    if (owning()) return;
    pushSample(m.v, m.at, !!m.end, `${k.g}|${k.by}`);
  };
  const pushSample = (v: View, at: number | undefined, end: boolean, key: string) => {
    const F = fol.current;
    const recv = performance.timeOrigin + msNow();
    if (key !== F.key) {
      F.buf = [];
      F.key = key;
      F.prevAt = 0;
    }
    // (The laptop: also where pictures added there are placed.)
    teacherView.current = v;
    if (awayRef.current) {
      awayRef.current = false;
      setAway(false);
    }
    const smp: ViewSample = { at: at ?? recv, cx: v.x + v.w / 2, cy: v.y + v.h / 2, lw: Math.log(Math.max(1e-6, v.w)), asp: v.h / Math.max(1e-6, v.w), end };
    F.R = v;
    F.lastRecv = recv;
    F.ts = at !== undefined;
    if (F.ts) {
      // The other clock's offset (plus the fastest delivery), how unevenly messages arrive, and how
      // often they come: from these the follower picks how far behind to play.
      F.offs.push(recv - smp.at);
      if (F.offs.length > 64) F.offs.shift();
      F.off = Math.min(...F.offs);
      F.jit = 0.9 * F.jit + 0.1 * (recv - smp.at - F.off);
      if (F.prevAt) F.iv = Math.min(120, Math.max(16, 0.9 * F.iv + 0.1 * (smp.at - F.prevAt)));
      F.prevAt = smp.at;
      let i = F.buf.length;
      while (i > 0 && F.buf[i - 1].at > smp.at) i--;
      F.buf.splice(i, 0, smp);
    } else F.buf = [smp];
    startFollowing();
  };
  /** Follow the last view heard straight away (the laptop's "Tablet view", a resize). */
  const followLast = (jump: boolean) => {
    const R = fol.current.R ?? teacherView.current;
    if (!R) return;
    if (awayRef.current) {
      awayRef.current = false;
      setAway(false);
    }
    if (jump) {
      stopFollowing();
      showRect(R);
    } else pushSample(R, undefined, true, fol.current.key);
  };
  const startFollowing = () => {
    const F = fol.current;
    if (F.running) return;
    F.running = true;
    F.last = performance.timeOrigin + msNow();
    if (!F.s) {
      // From what is on screen now, so following never starts with a jump.
      const R = myRect() ?? F.R;
      if (!R) return;
      F.s = { cx: R.x + R.w / 2, cy: R.y + R.h / 2, lw: Math.log(Math.max(1e-6, R.w)) };
      F.v = { cx: 0, cy: 0, lw: 0 };
    }
    requestAnimationFrame(followStep);
  };
  const followStep = () => {
    const F = fol.current;
    if (!F.running || !F.s || !F.buf.length) {
      F.running = false;
      return;
    }
    const now = performance.timeOrigin + msNow();
    const dt = Math.min(0.05, Math.max(0.001, (now - F.last) / 1000));
    F.last = now;
    let T: ViewSample;
    const last = F.buf[F.buf.length - 1];
    if (F.ts) {
      // Played a little behind the leader (one message gap plus twice the jitter), between the two
      // samples either side of that moment; at most 60 ms of guessing past the newest one.
      const D = Math.min(150, Math.max(40, F.iv + 2 * F.jit));
      const tau = now - F.off - D;
      let i = F.buf.length - 1;
      while (i > 0 && F.buf[i].at > tau) i--;
      const a = F.buf[i];
      const b = F.buf[i + 1];
      if (a.at > tau) T = a;
      else if (b) {
        const u = Math.min(1, Math.max(0, (tau - a.at) / Math.max(1e-6, b.at - a.at)));
        T = { ...b, cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u, lw: a.lw + (b.lw - a.lw) * u };
      } else if (a.end || i === 0 || tau - a.at > 60) T = a;
      else {
        const p = F.buf[i - 1];
        const r = (tau - a.at) / Math.max(1e-6, a.at - p.at);
        T = { ...a, cx: a.cx + (a.cx - p.cx) * r, cy: a.cy + (a.cy - p.cy) * r, lw: a.lw + (a.lw - p.lw) * r };
      }
      if (i > 1) F.buf.splice(0, i - 1);
    } else T = last;
    // A critically damped spring (exact for any frame time): stiff for timestamped playback, softer
    // for an older tablet's uneven steps.
    const w = F.ts ? 40 : 12;
    const ex = Math.exp(-w * dt);
    const spring = (x: number, v: number, t: number): [number, number] => {
      const e = x - t;
      const q = (v + w * e) * dt;
      return [t + (e + q) * ex, (v - w * q) * ex];
    };
    [F.s.cx, F.v.cx] = spring(F.s.cx, F.v.cx, T.cx);
    [F.s.cy, F.v.cy] = spring(F.s.cy, F.v.cy, T.cy);
    [F.s.lw, F.v.lw] = spring(F.s.lw, F.v.lw, T.lw);
    const z = cam.current.z;
    const drained = F.ts ? T === last && (last.end || now - F.lastRecv > 1000) : now - F.lastRecv > 150;
    const settled = Math.abs(F.s.cx - T.cx) * z < 0.25 && Math.abs(F.s.cy - T.cy) * z < 0.25 && Math.abs(F.s.lw - T.lw) < 0.0003 && Math.abs(F.v.cx) * z < 2 && Math.abs(F.v.cy) * z < 2 && Math.abs(F.v.lw) < 0.003;
    if (drained && settled) F.s = { cx: T.cx, cy: T.cy, lw: T.lw };
    const W = Math.exp(F.s.lw);
    const H = W * T.asp;
    showRect({ x: F.s.cx - W / 2, y: F.s.cy - H / 2, w: W, h: H });
    if (drained && settled) {
      F.running = false;
      F.s = null;
      return;
    }
    requestAnimationFrame(followStep);
  };

  // The laptop window changes size (full screen to share): fit the tablet's view again. The board's
  // own size is watched too: it is what the fit is worked out from, and it can settle a moment
  // after the window says it changed (going full screen), which left the old framing on screen.
  // The tablet does the same for what it shares (turned round, the browser's bars showing or hiding).
  const refitView = () => {
    followInsetCache.current = null;
    if (owning() && (lead || peerTwoWay.current)) {
      // Leading: the laptop keeps showing the same view in its new shape; either way the other
      // device is told at once.
      if (!lead && focusPx.current) {
        const R = myRect();
        if (R) showRect(R);
      }
      viewSent.current.force = true;
    } else if (fol.current.R ?? teacherView.current) followLast(true);
  };
  const refitRef = useRef<() => void>(() => {});
  useEffect(() => {
    refitRef.current = refitView;
  });
  useEffect(() => {
    const c = canvasRef.current;
    const refit = () => setTimeout(() => refitRef.current(), 50);
    const ro = c ? new ResizeObserver(refit) : null;
    if (c) ro?.observe(c);
    if (!lead) window.addEventListener("resize", refit);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", refit);
    };
  }, [lead, canvasRef]);

  // Laptop: the bars step aside after 3 seconds without the mouse, and come back as soon as it moves.
  useEffect(() => {
    if (lead) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const wake = () => {
      setQuiet(false);
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        setQuiet(true);
        hideTip(); // a tooltip must not stay floating on the shared screen once the bars have gone
      }, 3000);
    };
    wake();
    window.addEventListener("pointermove", wake);
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [lead]);

  // The tablet's writing space changed without a pan (turned round, resized, tools hidden or shown):
  // the laptop is told, so it frames the same space straight away, not at the next pan.
  useEffect(() => {
    if (!lead) return;
    const go = () => refitRef.current();
    const t = setTimeout(go, 30);
    window.addEventListener("resize", go);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", go);
    };
  }, [lead, toolsHidden]);

  // Tools hidden or shown on the laptop: the clear space changed, so fit again (bigger without tools).
  useEffect(() => {
    if (lead) return;
    const t = setTimeout(() => refitRef.current(), 30);
    return () => clearTimeout(t);
  }, [lead, toolsHidden]);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** `ms`: how long it stays (problems stay longer: they are easy to miss in the middle of a class). */
  const flash = (msg: string, ms = 2600) => {
    setNotice(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setNotice(null), ms);
  };
  useEffect(() => {
    flashRef.current = flash;
  });

  // ---- history
  const commit = (a: Action) => {
    undoStack.current.push(a);
    redoStack.current = [];
    persist();
    syncMeta();
  };
  /**
   * Tell the other device and viewers only what changed (not the whole board),
   * so an undo on one device never wipes what the other just drew.
   */
  const applyChange = (beforeS: Stroke[], beforeI: BoardImage[]) => {
    const nowS = new Set(strokes.current.map((x) => x.id));
    const oldS = new Set(beforeS.map((x) => x.id));
    const ms: BoardMsg[] = [];
    const gone = beforeS.filter((x) => !nowS.has(x.id)).map((x) => x.id);
    if (gone.length) ms.push({ t: "del", ids: gone });
    // New strokes, and ones changed in place under the same id (moved, or text edited).
    const was = new Map(beforeS.map((x) => [x.id, x]));
    for (const x of strokes.current) if (!oldS.has(x.id) || was.get(x.id) !== x) ms.push({ t: "add", s: packStroke(x) });
    const nowI = new Map(images.current.map((m) => [m.id, m]));
    const goneI = beforeI.filter((m) => !nowI.has(m.id)).map((m) => m.id);
    if (goneI.length) ms.push({ t: "imgdel", ids: goneI });
    for (const m of images.current) if (!beforeI.includes(m) && !m.url.startsWith("blob:")) ms.push({ t: "img", m });
    // One message, so the other device applies the whole undo together or not at all.
    if (ms.length) send({ t: "batch", ms });
    checkSel();
    persist();
    requestDraw();
    syncMeta();
  };
  const removeIds = (list: { id: string }[]) => {
    const ids = new Set(list.map((s) => s.id));
    return (s: { id: string }) => !ids.has(s.id);
  };
  const undo = () => {
    // A group still being dragged goes back first.
    cancelGroupDragRef.current();
    const a = undoStack.current.pop();
    if (!a) return;
    const [bs, bi] = [strokes.current, images.current];
    if (a.type === "add") strokes.current = strokes.current.filter((s) => s.id !== a.s.id);
    else if (a.type === "erase") strokes.current = [...strokes.current, ...a.s];
    else if (a.type === "replace") strokes.current = [...strokes.current.filter(removeIds(a.after)), ...a.before];
    else if (a.type === "clear") {
      strokes.current = [...strokes.current, ...a.s];
      images.current = [...images.current, ...a.m];
    } else if (a.type === "img-add") images.current = images.current.filter(removeIds(a.m));
    else if (a.type === "img-del") images.current = [...images.current, a.m];
    else if (a.type === "group") {
      strokes.current = [...strokes.current.filter(removeIds(a.sa)), ...a.sb];
      // (Pictures only when the step had any: an untouched list keeps the board's drawing cheap.)
      if (a.ib.length || a.ia.length) images.current = [...images.current.filter(removeIds(a.ia)), ...a.ib];
    } else images.current = images.current.map((m) => (m.id === a.before.id ? a.before : m));
    redoStack.current.push(a);
    applyChange(bs, bi);
  };
  const redo = () => {
    cancelGroupDragRef.current();
    const a = redoStack.current.pop();
    if (!a) return;
    const [bs, bi] = [strokes.current, images.current];
    if (a.type === "add") strokes.current = [...strokes.current, a.s];
    else if (a.type === "erase") strokes.current = strokes.current.filter(removeIds(a.s));
    else if (a.type === "replace") strokes.current = [...strokes.current.filter(removeIds(a.before)), ...a.after];
    else if (a.type === "clear") {
      strokes.current = [];
      images.current = [];
    } else if (a.type === "img-add") images.current = [...images.current, ...a.m];
    else if (a.type === "img-del") images.current = images.current.filter((m) => m.id !== a.m.id);
    else if (a.type === "group") {
      strokes.current = [...strokes.current.filter(removeIds(a.sb)), ...a.sa];
      if (a.ib.length || a.ia.length) images.current = [...images.current.filter(removeIds(a.ib)), ...a.ia];
    } else images.current = images.current.map((m) => (m.id === a.after.id ? a.after : m));
    undoStack.current.push(a);
    applyChange(bs, bi);
  };
  const clearAll = () => {
    if (!strokes.current.length && !images.current.length) return;
    const gone = [...strokes.current.map((x) => x.id), ...images.current.map((x) => x.id)];
    cancelGroupDragRef.current();
    commit({ type: "clear", s: strokes.current, m: images.current });
    strokes.current = [];
    images.current = [];
    select(null);
    selectText(null);
    selectLine(null);
    send({ t: "clear" });
    // Remembered as gone, so a laptop that missed the clear can't hand them back when it rejoins.
    ledger.mark(gone, ledger.stamp());
    persist();
    requestDraw();
    syncMeta();
  };
  // Messages from the other device. Every change is checked against the ledger first, so one that
  // arrives late, twice or out of order can never undo something newer.
  useEffect(() => {
    onRemote.current = (m: BoardMsg) => {
      if (!lead) tabletHeardAt.current = Date.now(); // the tablet is on: it picks the page
      // Its number is heard first, even on a change for another page: a tablet opened fresh counts
      // from zero, and until it had heard the laptop's count the laptop refused all it wrote.
      ledger.hear((m as { q?: number }).q);
      // A change meant for another page (sent just as the page changed) is left out.
      if (m.pg && m.pg !== pageRef.current.id) return;
      switch (m.t) {
        case "hello": {
          // The other device asked for the board: answer it on this channel only (page first).
          if (lead) link.current?.send({ t: "page", p: pageRef.current });
          if (lead) link.current?.send({ t: "bg", v: paperRef.current, dark: darkRef.current });
          link.current?.send(tagPage(stampMsg(ledger, fullBoard()), pageRef.current.id));
          // And the view, from whichever device leads it.
          if (owning() && (lead || peerTwoWay.current)) sendViewNow(true);
          return;
        }
        case "theme":
          return; // one light board now; an older device's look is ignored
        case "pagedel":
          if (m.id !== pageRef.current.id && m.id !== MAIN_PAGE.id) forgetPageRef.current(m.id);
          return;
        case "mag":
          return; // (a laptop magnifier was tried and removed)
        case "room":
          if (lead) moreRoomRef.current();
          return;
        case "pt":
          // The tablet's pen hovering: a soft red pointer here, gone a moment after it lifts away.
          if (!lead) {
            pointer.current = { x: m.x, y: m.y };
            if (pointerTimer.current) clearTimeout(pointerTimer.current);
            pointerTimer.current = setTimeout(() => {
              pointer.current = null;
              requestDraw();
            }, 1200);
            requestDraw();
          }
          return;
        case "bg":
          // (An older tab that only knows the paper leaves the board light or dark as it is here.)
          if (BACKDROPS.includes(m.v)) setPaper(m.v, m.dark ?? darkRef.current, false);
          return;
        case "page":
          // The other device moved to another page (a class starting, or by hand): follow it.
          if (m.q !== undefined) {
            ledger.hear(m.q);
            ledger.reset(m.q);
          }
          openPageRef.current(m.p, false);
          return;
        case "view":
          // The other device is being moved by hand: settle who leads, then follow (see onView).
          onView(m);
          return;
        case "rev": {
          if (lead) return;
          tabletHeardAt.current = Date.now();
          // Missed a page change: catch up (the board follows in the reply to "hello").
          if (m.p && m.p.id !== pageRef.current.id) {
            openPageRef.current(m.p, false);
            link.current?.send({ t: "hello" });
            return;
          }
          // A "view" message that got lost: the heartbeat carries the view (and its key), so this screen
          // catches up. Never while it leads, never against a newer gesture, never mid-playback.
          if (m.vg !== undefined) peerTwoWay.current = true;
          const tv = teacherView.current;
          const rk = { g: m.vg ?? 0, by: m.vb ?? 1 };
          const newer = keyCmp(rk);
          const quiet = performance.timeOrigin + performance.now() - fol.current.lastRecv > 1000;
          if (m.v && newer >= 0 && !owning() && quiet && (!tv || tv.x !== m.v.x || tv.y !== m.v.y || tv.w !== m.v.w || tv.h !== m.v.h)) {
            // (A key naming this device that it doesn't hold: it led before it was reloaded. It
            // follows the tablet's view from here; either hand moving next takes the lead as usual.)
            if (newer > 0) viewKey.current = { g: rk.g, by: rk.by === myBy ? ((1 - myBy) as 0 | 1) : (rk.by as 0 | 1) };
            pushSample(m.v, undefined, true, `${rk.g}|${rk.by}`);
          }
          const shared = images.current.filter((x) => !x.url.startsWith("blob:"));
          // (A tablet that sends `d2` is checked against where things are, too; an older one as before.)
          const same =
            m.d2 !== undefined
              ? boardDigest(strokes.current.map(packOnce), shared, true) === m.d2
              : m.d !== undefined
              ? boardDigest(strokes.current, shared) === m.d
              : strokes.current.length + shared.length === m.n && (strokes.current[strokes.current.length - 1]?.id ?? "") === m.last;
          // Behind twice in a row (not just a stroke in flight): take the tablet's board.
          revMiss.current = same ? 0 : revMiss.current + 1;
          // The tablet has everything on this page, so nothing made here alone is still waiting.
          if (same) dropSolo(null);
          if (revMiss.current >= 2) {
            revMiss.current = 0;
            resync.current = "rev";
            link.current?.send({ t: "hello" });
          }
          return;
        }
        case "xf":
          // The tablet's group gliding (the laptop only; the tablet never shows the laptop's drags).
          if (!lead) remoteXfRef.current(m);
          return;
        case "live": {
          // The final stroke already came: this preview is stale. (Not for typed words: editing them
          // removes the old version first, and their previews arrive in order.)
          if (m.s.kind !== "text" && ledger.known(m.s.id)) return;
          if (m.from) {
            // Just the newest points: add them to what's on screen (if a part went missing, wait for the next whole one).
            const have = remoteLive.current;
            if (!have || have.id !== m.s.id || have.pts.length < m.from) return;
            remoteLive.current = { ...m.s, pts: [...have.pts.slice(0, m.from), ...m.s.pts] };
          } else remoteLive.current = m.s;
          if (remoteLiveTimer.current) clearTimeout(remoteLiveTimer.current);
          // A preview that stops coming (pen lifted, message lost) never stays on screen.
          // Typed words stay while the box is open (Hamza may pause to talk); writing previews
          // that stop coming are cleared after a while.
          if (remoteLive.current?.kind !== "text")
            remoteLiveTimer.current = setTimeout(() => {
              remoteLive.current = null;
              requestDraw();
            }, 8000);
          requestDraw();
          return;
        }
        case "add":
          if (!ledger.fresh(m.s.id, m.q)) return;
          strokes.current = [...strokes.current.filter((x) => x.id !== m.s.id), m.s];
          if (remoteLive.current?.id === m.s.id) remoteLive.current = null;
          break;
        case "del": {
          const ids = new Set(m.ids.filter((id) => ledger.fresh(id, m.q)));
          if (!ids.size) return;
          strokes.current = strokes.current.filter((x) => !ids.has(x.id));
          if (remoteLive.current && ids.has(remoteLive.current.id)) remoteLive.current = null;
          if (!lead) dropSolo([...ids]);
          break;
        }
        case "img":
          if (!ledger.fresh(m.m.id, m.q)) return;
          images.current = [...images.current.filter((x) => x.id !== m.m.id), m.m];
          break;
        case "imgdel": {
          const ids = new Set(m.ids.filter((id) => ledger.fresh(id, m.q)));
          if (!ids.size) return;
          images.current = images.current.filter((x) => !ids.has(x.id));
          if (selectedRef.current && ids.has(selectedRef.current)) select(null);
          if (!lead) dropSolo([...ids]);
          break;
        }
        case "clear":
          if (m.q !== undefined) {
            if (!ledger.fresh("*clear", m.q)) return;
            ledger.reset(m.q);
          }
          cancelGroupDragRef.current();
          strokes.current = [];
          images.current = [];
          remoteLive.current = null;
          select(null);
          if (!lead) dropSolo(null);
          break;
        case "set": {
          ledger.hear(m.q);
          pageBoardIn.current = true;
          // The laptop now has this page's real board. (The tablet's own copy comes from its store.)
          const pid = pageRef.current.id;
          const hadOwn = loadedPageId.current === pid;
          if (!lead) loadedPageId.current = pid;
          gotBoard.current = true;
          const theirs = m.strokes;
          const theirImgs = m.images ?? [];
          if (lead) {
            // The tablet's board is the truth, the first time they meet as well as after a Wi-Fi blip:
            // it only takes what the laptop has that it has never held, never the laptop's (maybe
            // older) copy of everything, which brought back writing that had been rubbed out.
            const hasS = new Set(strokes.current.map((x) => x.id));
            const hasI = new Set(images.current.map((x) => x.id));
            const newS = theirs.filter((x) => !hasS.has(x.id) && !ledger.known(x.id));
            const newI = theirImgs.filter((x) => !hasI.has(x.id) && !ledger.known(x.id));
            if (!newS.length && !newI.length) return;
            strokes.current = [...strokes.current, ...newS];
            images.current = [...images.current, ...newI];
            for (const x of newS) send({ t: "add", s: packStroke(x) });
            for (const x of newI) send({ t: "img", m: x });
            break;
          }
          // The laptop always takes the tablet's board as the truth (catching up, or opening while
          // the tablet is on): merging its own older copy would bring back what was erased.
          resync.current = "join";
          const haveS = new Set(theirs.map((x) => x.id));
          const haveI = new Set(theirImgs.map((x) => x.id));
          // Two things of its own stay: a picture still uploading (it reaches the tablet when it is
          // done), and what was made here while the tablet was away, which goes to the tablet now.
          const mine = solo.current.get(pid);
          const keepS = mine?.size ? strokes.current.filter((x) => mine.has(x.id) && !haveS.has(x.id)) : [];
          const keepI = images.current.filter((x) => !haveI.has(x.id) && (x.url.startsWith("blob:") || !!mine?.has(x.id)));
          strokes.current = [...theirs, ...keepS];
          images.current = [...theirImgs, ...keepI];
          remoteLive.current = null;
          // The tablet's numbers are taken as they are, even lower ones (a tablet opened fresh).
          if (m.q !== undefined) ledger.adopt(m.q);
          if (selectedRef.current && !images.current.some((x) => x.id === selectedRef.current)) select(null);
          const giveBack = (ss: Stroke[], ii: BoardImage[]) => {
            for (const x of ss) send({ t: "add", s: packStroke(x) });
            for (const x of ii) if (!x.url.startsWith("blob:")) send({ t: "img", m: x });
          };
          if (mine?.size) {
            solo.current.delete(pid);
            saveSolo();
            giveBack(keepS, keepI);
            if (!hadOwn) {
              // This page's own copy was never opened here (the tablet led the way to it): what was
              // made on it alone is still in this device's store. Read before the save below lands.
              void loadBoard(keyFor(pid)).then((own) => {
                if (!own || pageRef.current.id !== pid) return;
                const gotS = new Set(strokes.current.map((x) => x.id));
                const gotI = new Set(images.current.map((x) => x.id));
                const moreS = own.strokes.filter((x) => mine.has(x.id) && !gotS.has(x.id));
                const moreI = own.images.filter((x) => mine.has(x.id) && !gotI.has(x.id));
                if (!moreS.length && !moreI.length) return;
                strokes.current = [...strokes.current, ...moreS];
                images.current = [...images.current, ...moreI];
                giveBack(moreS, moreI);
                persist();
                requestDraw();
                syncMeta();
              });
            }
          }
          break;
        }
        case "batch":
          return; // unpacked before it gets here
      }
      checkSel();
      persist();
      requestDraw();
      syncMeta();
    };
  });

  // ---- typing
  const textSize = () => lastTextPx.current / cam.current.z;
  const typedStroke = (t: NonNullable<typeof typingRef.current>): Stroke => {
    const text = wrapText(t.text.replace(/\s+$/, ""), t.size, t.maxW, t);
    const m = measureText(text, t.size, t);
    return {
      id: t.id,
      kind: "text",
      text,
      color: t.color,
      size: t.size,
      ...(t.bold ? { bold: true } : {}),
      ...(t.italic ? { italic: true } : {}),
      ...(t.hl ? { hl: true } : {}),
      ...(t.boxW ? { boxW: t.boxW } : {}),
      raw: t.text.replace(/\s+$/, ""),
      wrapW: t.maxW,
      pts: [[t.wx, t.wy, 0.5], [t.wx + Math.max(m.w, t.boxW ?? 0), t.wy + m.h, 0.5]],
    };
  };
  /** Typed text with a new look (size, line width, style or colour): its words are laid out again, in the same place. */
  const restyled = (s: Stroke, patch: { size?: number; boxW?: number; color?: string; bold?: boolean; italic?: boolean; hl?: boolean }): Stroke => {
    const n = { ...s, ...patch };
    const hasWrap = typeof s.wrapW === "number" && Number.isFinite(s.wrapW);
    const out = typedStroke({ id: s.id, wx: s.pts[0][0], wy: s.pts[0][1], size: n.size, color: n.color, text: s.raw ?? s.text ?? "", maxW: n.boxW ?? (hasWrap ? s.wrapW! : Infinity), boxW: n.boxW, bold: n.bold, italic: n.italic, hl: n.hl });
    // Text from before line widths were kept stays as it was: its lines are not re-broken later.
    if (!n.boxW && !hasWrap) delete out.wrapW;
    return out;
  };
  /** Where in the words as typed a tap landed, so the caret opens there. */
  const caretAt = (s: Stroke, wx: number, wy: number): number => {
    const raw = s.raw ?? s.text ?? "";
    const lines = (s.text ?? "").split("\n");
    const li = Math.max(0, Math.min(lines.length - 1, Math.floor((wy - s.pts[0][1]) / (s.size * TEXT_LINE))));
    const line = lines[li];
    const at = wx - s.pts[0][0];
    // The gap between two letters nearest the tap.
    let col = line.length;
    let before = 0;
    for (let i = 1; i <= line.length; i++) {
      const w = runWidth(line.slice(0, i), s.size, s);
      if (w > at) {
        col = at - before < w - at ? i - 1 : i;
        break;
      }
      before = w;
    }
    // The same place in the words as typed (wrapping swaps spaces for line breaks): after the same
    // number of letters, plus any spaces typed between that letter and the tap.
    const lead = lines.slice(0, li).join("") + line.slice(0, col);
    let need = lead.replace(/\s/g, "").length;
    let i = 0;
    while (i < raw.length && need > 0) {
      if (!/\s/.test(raw[i])) need--;
      i++;
    }
    let gaps = /\s*$/.exec(line.slice(0, col))?.[0].length ?? 0;
    while (gaps > 0 && raw[i] === " ") {
      gaps--;
      i++;
    }
    return i;
  };
  // Bold, italic, highlight: switched on the text being typed (the whole of it), shown at once
  // there and on the other screen.
  const lastTextStyle = useRef<{ bold?: boolean; italic?: boolean; hl?: boolean }>({});
  const toggleStyle = (k: "bold" | "italic" | "hl") => {
    const t = typingRef.current;
    if (!t) return;
    t[k] = !t[k];
    lastTextStyle.current = { bold: t.bold, italic: t.italic, hl: t.hl };
    placeTyping();
    send({ t: "live", s: typedStroke(t) });
    textRef.current?.focus({ preventScroll: true });
  };
  // Like Canva: drag the box's side to set how wide its lines run, or its corner to make the
  // words bigger or smaller. The keyboard stays open throughout.
  const resizing = useRef<{ kind: "w" | "s"; x0: number; w0: number; size0: number; box0?: number } | null>(null);
  const onHandleDown = (kind: "w" | "s", e: React.PointerEvent<HTMLButtonElement>) => {
    const t = typingRef.current;
    if (!t) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizing.current = { kind, x0: e.clientX, w0: Math.max(1, (typing?.wPx ?? 100) / cam.current.z), size0: t.size, box0: t.boxW };
  };
  const onHandleMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = resizing.current;
    const t = typingRef.current;
    if (!r || !t) return;
    const z = cam.current.z;
    const dx = (e.clientX - r.x0) / z;
    if (r.kind === "w") {
      t.boxW = Math.max(t.size * 2, r.w0 + dx);
      t.maxW = t.boxW;
    } else {
      const k = Math.max(0.4, Math.min(4, (r.w0 + dx) / r.w0));
      t.size = Math.max(10 / z, r.size0 * k);
      if (r.box0) t.maxW = t.boxW = r.box0 * k;
    }
    placeTyping();
    // The event's own time (same clock as performance.now), so the other screen gets ~16 updates a second.
    if (e.timeStamp - liveSend.current > 60) {
      liveSend.current = e.timeStamp;
      send({ t: "live", s: typedStroke(t) });
    }
  };
  const onHandleUp = () => {
    resizing.current = null;
    textRef.current?.focus({ preventScroll: true });
  };
  /** Smaller or bigger words, one step at a time: the box being typed in, or the selected words. */
  const stepTextSize = (dir: 1 | -1) => {
    const z = cam.current.z;
    const next = (v: number) => Math.max(12 / z, Math.min(240 / z, dir > 0 ? v * 1.2 : v / 1.2));
    const t = typingRef.current;
    if (t) {
      t.size = next(t.size);
      lastTextPx.current = t.size * z;
      placeTyping();
      send({ t: "live", s: typedStroke(t) });
      textRef.current?.focus({ preventScroll: true });
      return;
    }
    const s = selStroke();
    if (s) restyleSel({ size: next(s.size) });
  };
  const setTextColor = (c: string) => {
    const t = typingRef.current;
    if (!t) return;
    t.color = c;
    placeTyping();
    send({ t: "live", s: typedStroke(t) });
    textRef.current?.focus({ preventScroll: true });
  };
  // Typing started with the T key goes back to the tool before it once the words are done.
  const toolBeforeT = useRef<Tool | null>(null);
  // Axes started with the A key: one set, then back to the tool that was in hand.
  const toolBeforeA = useRef<Tool | null>(null);
  /** `nextBox`: closed because another box is opening (the T-key tool stays until typing is done). */
  // When a key was last typed into the text box (or the box closed): letters typed straight after
  // are still words, not shortcuts.
  const typedAt = useRef(0);
  const commitTyping = (nextBox = false) => {
    // A handle drag cut short by the box closing must not carry over to the next box.
    gripping.current = null;
    resizing.current = null;
    const t = typingRef.current;
    if (!t) return;
    typedAt.current = performance.now();
    typingRef.current = null;
    setTyping(null);
    if (toolBeforeT.current && !nextBox) {
      setTool(toolBeforeT.current);
      toolBeforeT.current = null;
    }
    if (textRef.current) {
      textRef.current.value = "";
      textRef.current.blur();
    }
    if (!t.text.trim()) {
      // Emptied: an edited text is erased (undo brings it back), a new one just goes.
      if (t.editing) commit({ type: "erase", s: [t.editing] });
      send({ t: "del", ids: [t.id] }); // the live preview on the other screen goes at once
      requestDraw();
      return;
    }
    const s = typedStroke(t);
    const sameStyle =
      !!t.editing && !!t.editing.bold === !!s.bold && !!t.editing.italic === !!s.italic && !!t.editing.hl === !!s.hl && t.editing.size === s.size && t.editing.boxW === s.boxW;
    // Moved with the grip (even with the words unchanged): kept as a change, so undo puts it back.
    const samePlace = !!t.editing && t.editing.pts[0][0] === t.wx && t.editing.pts[0][1] === t.wy;
    if (t.editing && t.editing.text === s.text && t.editing.color === s.color && sameStyle && samePlace) {
      strokes.current = [...strokes.current, t.editing];
      send({ t: "add", s: packStroke(t.editing) });
    } else {
      strokes.current = [...strokes.current, s];
      commit(t.editing ? { type: "replace", before: [t.editing], after: [s] } : { type: "add", s });
      send({ t: "add", s: packStroke(s) });
    }
    requestDraw();
  };
  /**
   * Opens the text box at a spot, or on the words already there. Focus happens now, so the keyboard opens.
   * `target`: these words (selected, then tapped again), with the caret where the tap landed (`atTap`) or at the end.
   */
  const startTyping = (sx: number, sy: number, target?: Stroke, atTap = false) => {
    commitTyping(true);
    selectText(null);
    const [wx, wy] = toWorld(cam.current, sx, sy);
    const under = target ?? strokes.current.findLast((x) => x.kind === "text" && hitStroke(x, wx, wy, 6 / cam.current.z));
    const caret = target && atTap ? caretAt(target, wx, wy) : -1;
    // Lines run to the right edge of the screen (less a margin), then carry on below.
    const lineFrom = (x: number) => Math.max(160, screen.current.w - 24 - (x - cam.current.x) * cam.current.z) / cam.current.z;
    if (under) {
      // Lifted off the board while it is edited, so it isn't drawn twice.
      strokes.current = strokes.current.filter((x) => x.id !== under.id);
      send({ t: "del", ids: [under.id] });
      typingRef.current = { id: under.id, wx: under.pts[0][0], wy: under.pts[0][1], size: under.size, color: under.color, text: under.raw ?? under.text ?? "", maxW: under.boxW ?? under.wrapW ?? lineFrom(under.pts[0][0]), boxW: under.boxW, bold: under.bold, italic: under.italic, hl: under.hl, editing: under };
    } else {
      const sz = textSize();
      const ink = color === COLORS[0].value && imageAt(images.current, wx, wy) ? "#1B1E21" : color;
      // New text keeps the style used last (bold headings stay bold until switched off).
      const st = lastTextStyle.current;
      typingRef.current = { id: newId(), wx, wy: wy - sz * 0.6, size: sz, color: ink, text: "", maxW: lineFrom(wx), ...st };
    }
    const el = textRef.current;
    if (el) {
      el.value = typingRef.current.text;
      el.focus({ preventScroll: true });
      const pos = caret >= 0 ? Math.min(caret, el.value.length) : el.value.length;
      el.setSelectionRange(pos, pos);
    }
    placeTyping();
    // Opening words to edit: the other screen keeps showing them (not a gap until the first key).
    if (typingRef.current.editing) send({ t: "live", s: typedStroke(typingRef.current) });
    requestDraw();
  };
  const onTypingInput = (text: string) => {
    const t = typingRef.current;
    if (!t) return;
    t.text = text;
    placeTyping();
    const now = performance.now();
    typedAt.current = now;
    if (now - liveSend.current > 60) {
      liveSend.current = now;
      send({ t: "live", s: typedStroke(t) });
    }
  };

  // ---- the selected text's bar: its look changes in place (one undo step each), no keyboard needed
  const restyleSel = (patch: Parameters<typeof restyled>[1]) => {
    const s = selStroke();
    if (!s || moving.current) return;
    const after = restyled(s, patch);
    strokes.current = strokes.current.map((x) => (x.id === s.id ? after : x));
    commit({ type: "replace", before: [s], after: [after] });
    send({ t: "add", s: packStroke(after) });
    setSelTextState({ id: after.id, color: after.color, bold: !!after.bold, italic: !!after.italic, hl: !!after.hl });
    requestDraw();
  };
  const toggleSel = (k: "bold" | "italic" | "hl") => {
    const s = selStroke();
    if (s) restyleSel({ [k]: !s[k] });
  };
  // ---- the selected line's bar
  /** Dotted or Solid: this line's style switches in place (one undo step), and the other device sees it. */
  const toggleSelLine = () => {
    const s = selLineStroke();
    if (!s || s.kind !== "line" || moving.current) return;
    const after: Stroke = { ...s };
    if (s.dotted) delete after.dotted;
    else after.dotted = true;
    strokes.current = strokes.current.map((x) => (x.id === s.id ? after : x));
    commit({ type: "replace", before: [s], after: [after] });
    send({ t: "add", s: packStroke(after) });
    setSelLineState({ id: after.id, dotted: !!after.dotted, line: true, arrow: !!after.arrow });
    requestDraw();
  };
  /** Arrow or plain: the selected line gains or loses its arrowhead (one undo step). */
  const toggleSelArrow = () => {
    const s = selLineStroke();
    if (!s || s.kind !== "line" || s.hl || moving.current) return;
    const after: Stroke = { ...s };
    if (s.arrow) delete after.arrow;
    else after.arrow = true;
    strokes.current = strokes.current.map((x) => (x.id === s.id ? after : x));
    commit({ type: "replace", before: [s], after: [after] });
    send({ t: "add", s: packStroke(after) });
    setSelLineState({ id: after.id, dotted: !!after.dotted, line: true, arrow: !!after.arrow });
    requestDraw();
  };
  /** Enter, or Edit in its bar: the selected words open, caret at the end. */
  const editSel = () => {
    const s = selStroke();
    if (!s || moving.current) return;
    startTyping((s.pts[0][0] - cam.current.x) * cam.current.z, (s.pts[0][1] - cam.current.y) * cam.current.z, s);
  };

  // ---- insert pictures and PDFs
  /**
   * Where new pictures land. The tablet: the part of its screen the bars leave clear. The laptop:
   * the tablet's view while it's showing it (so the picture is on both screens), else its own.
   */
  const placeView = (): View => {
    const { w, h } = screen.current;
    if (lead) return writingView(w, h);
    const own = areaView(cam.current, w, h, clearInset(h, [topBarRef.current, sidePanelRef.current], [toolbarRef.current]));
    const tv = teacherView.current;
    const cx = tv ? tv.x + tv.w / 2 : 0;
    const cy = tv ? tv.y + tv.h / 2 : 0;
    return tv && cx > own.x && cx < own.x + own.w && cy > own.y && cy < own.y + own.h ? tv : own;
  };
  /** A sensible size: inside the view, and a small picture is never blown up past 1.5 times. */
  const fitIn = (n: { w: number; h: number }, v: View, maxW: number, maxH: number) => {
    const k = Math.min((v.w * maxW) / n.w, (v.h * maxH) / n.h, 1.5 / cam.current.z);
    return { w: n.w * k, h: n.h * k };
  };
  /** A new picture steps down and right of one already in the same spot, so it never hides it. */
  const freeSpot = (x: number, y: number) => {
    const step = 28 / cam.current.z;
    const taken = (px: number, py: number) => images.current.some((m) => Math.abs(m.x - px) < step / 4 && Math.abs(m.y - py) < step / 4);
    let i = 0;
    while (i < 20 && taken(x + i * step, y + i * step)) i++;
    return { x: x + i * step, y: y + i * step };
  };
  /**
   * An uploaded picture gets its web address everywhere it's kept (the board, undo and redo), then
   * goes to the other device and is saved. Where it is and its size stay as Hamza left them.
   */
  const swapUrl = (id: string, url: string) => {
    const fix = (m: BoardImage) => (m.id === id ? { ...m, url } : m);
    for (const a of [...undoStack.current, ...redoStack.current]) {
      if (a.type === "img-add" || a.type === "clear") a.m = a.m.map(fix);
      else if (a.type === "img-del") a.m = fix(a.m);
      else if (a.type === "img-edit") {
        a.before = fix(a.before);
        a.after = fix(a.after);
      } else if (a.type === "group") {
        a.ib = a.ib.map(fix);
        a.ia = a.ia.map(fix);
      }
    }
    const now = images.current.find((m) => m.id === id);
    if (!now) return;
    const after = { ...now, url };
    images.current = images.current.map((m) => (m.id === id ? after : m));
    send({ t: "img", m: after });
    persist();
    requestDraw();
  };
  // ---- the Insert menu: a picture or PDF from this device, a past paper, or one of Hamza's notes
  /**
   * Pages picked in the Library land like a PDF's pages: one under another at a readable width, the
   * first at the top of the view; one undo step; the first one selected. A page that only lives on
   * this screen (a blob: address, in a preview without uploads) is never sent to the other device.
   */
  const placeLibraryPages = async (list: LibraryPage[], title: string) => {
    if (!list.length) return;
    const pageId = pageRef.current.id;
    const sizes = await Promise.allSettled(list.map((p) => (p.w && p.h ? Promise.resolve({ w: p.w, h: p.h }) : imageSize(p.url))));
    if (pageRef.current.id !== pageId) {
      flash("The page changed before it was ready. Add it again here.", 6000);
      return;
    }
    const pv = placeView();
    const gap = 24 / cam.current.z;
    const pages: BoardImage[] = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < list.length; i++) {
      const sz = sizes[i];
      const { w, h } = fitIn(sz.status === "fulfilled" ? sz.value : { w: 1000, h: 1414 }, pv, 0.9, Infinity);
      if (i === 0) ({ x, y } = freeSpot(pv.x + (pv.w - w) / 2, pv.y + pv.h * 0.04));
      pages.push({ id: newId(), url: list[i].url, x, y, w, h });
      y += h + gap;
    }
    images.current = [...images.current, ...pages];
    commit({ type: "img-add", m: pages });
    for (const m of pages) if (!m.url.startsWith("blob:")) send({ t: "img", m });
    select(pages[0].id);
    requestDraw();
    flash(title);
  };
  const insertFiles = async (files: File[]) => {
    const list = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!list.length) return flash("Pictures or PDFs only.");
    const online = cloudinaryConfigured();
    const pageId = pageRef.current.id;
    const pics = list.filter((f) => f.type !== "application/pdf");
    const pdfs = list.filter((f) => f.type === "application/pdf");
    let problem: string | null = null;
    let added = 0;
    try {
      // Pictures show at once, from this device. They upload while Hamza carries on (they can be
      // moved and resized meanwhile) and reach the other device when the upload is done.
      const v = placeView();
      const placed: BoardImage[] = [];
      const smalls: File[] = [];
      if (pics.length) setBusy("Adding…");
      for (const f of pics) {
        const small = await shrinkImage(f);
        const url = URL.createObjectURL(small);
        try {
          const n = await imageSize(url);
          const { w, h } = fitIn(n, v, 0.8, 0.75);
          const m: BoardImage = { id: newId(), url, w, h, ...freeSpot(v.x + (v.w - w) / 2, v.y + (v.h - h) / 2) };
          images.current = [...images.current, m];
          placed.push(m);
          smalls.push(small);
        } catch {
          URL.revokeObjectURL(url);
          problem = `"${f.name}" couldn't be opened. Try a JPG or PNG.`;
        }
      }
      if (placed.length) {
        commit({ type: "img-add", m: placed });
        select(placed[0].id);
        requestDraw();
      }
      if (online) {
        for (let i = 0; i < placed.length; i++) {
          const m = placed[i];
          const label = placed.length > 1 ? `Uploading ${i + 1} of ${placed.length}…` : "Uploading…";
          setBusy(label);
          try {
            const url = await uploadImage(smalls[i], (p) => setBusy(`${label} ${Math.round(p * 100)}%`));
            if (pageRef.current.id !== pageId) {
              problem = "The page changed before the picture finished uploading. Add it again here.";
              break;
            }
            const aliased = aliasImage(m.url, url); // the copy already on screen is used: no flicker, no second download
            swapUrl(m.id, url);
            // The copy held by this browser is let go once the loaded picture answers to its web address.
            if (aliased) URL.revokeObjectURL(m.url);
            added++;
          } catch (err) {
            // Not uploaded, it would only ever be on this screen (and never saved), so it comes off.
            images.current = images.current.filter((x) => x.id !== m.id);
            // Out of undo and redo as well, or redo would bring back a picture that only ever
            // lived on this screen and is never saved.
            const strip = (list: Action[]) =>
              list.flatMap((a): Action[] => {
                if (a.type === "img-add") {
                  const left = a.m.filter((x) => x.id !== m.id);
                  return left.length ? [{ ...a, m: left }] : [];
                }
                if (a.type === "clear") return [{ ...a, m: a.m.filter((x) => x.id !== m.id) }];
                if ((a.type === "img-del" && a.m.id === m.id) || (a.type === "img-edit" && a.before.id === m.id)) return [];
                if (a.type === "group") {
                  const g = { ...a, ib: a.ib.filter((x) => x.id !== m.id), ia: a.ia.filter((x) => x.id !== m.id) };
                  return g.sb.length || g.sa.length || g.ib.length || g.ia.length ? [g] : [];
                }
                return [a];
              });
            undoStack.current = strip(undoStack.current);
            redoStack.current = strip(redoStack.current);
            syncMeta();
            if (selectedRef.current === m.id) select(null);
            requestDraw();
            problem = err instanceof Error ? err.message : "That picture didn't upload. Try again.";
          }
        }
      } else added += placed.length;
      for (const f of pdfs) {
        if (!online) {
          problem = "PDFs need the live site (uploads aren't set up in this preview).";
          continue;
        }
        setBusy("Uploading the PDF…");
        const urls = await uploadPdfPages(f, (p) => setBusy(`Uploading the PDF… ${Math.round(p * 100)}%`));
        if (pageRef.current.id !== pageId) {
          problem = "The page changed before the PDF was ready. Add it again here.";
          break;
        }
        setBusy(urls.length > 1 ? `Opening ${urls.length} pages…` : "Opening the page…");
        // Every page at once, so one slow page doesn't hold up the rest. A page that won't open keeps
        // an A4 shape (it fills in when it arrives) instead of losing the whole PDF.
        const sizes = await Promise.allSettled(urls.map((u) => imageSize(u)));
        // One under another at a readable page width, the first at the top of the view.
        const pv = placeView();
        const gap = 24 / cam.current.z;
        const pages: BoardImage[] = [];
        let x = 0;
        let y = 0;
        for (let i = 0; i < urls.length; i++) {
          const sz = sizes[i];
          const { w, h } = fitIn(sz.status === "fulfilled" ? sz.value : { w: 1000, h: 1414 }, pv, 0.9, Infinity);
          if (i === 0) ({ x, y } = freeSpot(pv.x + (pv.w - w) / 2, pv.y + pv.h * 0.04));
          pages.push({ id: newId(), url: urls[i], x, y, w, h });
          y += h + gap;
        }
        images.current = [...images.current, ...pages];
        commit({ type: "img-add", m: pages });
        for (const m of pages) send({ t: "img", m });
        if (!placed.length) select(pages[0].id);
        requestDraw();
        added += pages.length;
      }
      if (problem) flash(problem, 6000);
      else if (added) {
        const where = !online ? " Preview only: it stays on this screen." : partner ? (lead ? " It's on your laptop too." : " It's on your tablet too.") : "";
        flash(`${added > 1 ? `${added} added.` : "Added."}${where}`);
      }
    } catch (err) {
      flash(err instanceof Error ? err.message : "That file couldn't be added.", 6000);
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Paste a picture (Ctrl+V, e.g. a screenshot) straight onto the board, like the Insert button.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      if (busy) flash("Still adding the last one. Try again in a moment.");
      else void insertFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  // ---- input
  const pens = useRef({ active: false, lastAt: 0, seen: false });
  const touches = useRef(new Map<number, { x: number; y: number; t: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number } | null>(null);
  const tap2 = useRef<{ at: number; moved: number } | null>(null);
  // One finger tap (no drag): selects the picture under it, or clears the selection.
  const tap1 = useRef<{ id: number; x: number; y: number; at: number } | null>(null);
  const glide = useRef<{ vx: number; vy: number; raf: number } | null>(null);
  const velocity = useRef({ vx: 0, vy: 0 });
  // How far this finger pan has travelled, and when it last moved: a tap or a stop never glides.
  const panTrip = useRef({ dist: 0, at: 0 });
  /**
   * Typed text being re-wrapped by its side handle, or a line's end being moved: the stroke, where the
   * press began, and whether it has moved yet. `slop`: how far it may wander and still be a press.
   */
  type Mv = { s: Stroke; x0: number; y0: number; lx: number; ly: number; moved: boolean; tapEdits: boolean; previewId: string; slop: number; touch: boolean; at: number };
  const gesture = useRef<{
    mode: "draw" | "line" | "box" | "erase" | "pan" | "group" | null;
    id: number;
    erased: Stroke[];
    straightened: boolean;
    /** A mouse press with the pen or line tool that may turn out to be a plain click: on typed words
     * it selects them (`text`), and with words selected a click elsewhere only lets them go. */
    click?: { text: string | null; at: number; line?: string | null; pen?: boolean; x: number; y: number };
    /** The stroke is a lasso round things (not ink). `safety`: if it goes round nothing, it is kept
     * as the writing it was. */
    lasso?: { safety: boolean };
  }>({ mode: null, id: -1, erased: [], straightened: false });
  const hold = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null; path: number }>({ x: 0, y: 0, timer: null, path: 0 });
  const liveSend = useRef(0);
  const spaceDown = useRef(false);
  useEffect(() => {
    writingNow.current = () => gesture.current.mode !== null || Date.now() - pens.current.lastAt < 700;
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  // Where the mouse last was over the board (laptop), for the T key.
  const hoverAt = useRef<{ x: number; y: number } | null>(null);
  // What last pressed the board (mouse, pen or touch), and the dots a mouse click left a moment ago.
  const lastPointer = useRef("");
  const clickDots = useRef<{ id: string; at: number }[]>([]);

  const logPen = (e: React.PointerEvent, what: string) => {
    if (!showDebug.current) return;
    setDebug(`${what} · ${e.pointerType} · button ${e.button} · buttons ${e.buttons} · pressure ${e.pressure.toFixed(2)} · size ${Math.round(e.width)}×${Math.round(e.height)}`);
  };

  // How much of the stroke being drawn the laptop already has: only the new points go, and the
  // whole stroke every 20th time in case one went missing (the finished stroke settles it anyway).
  const liveShared = useRef<{ id: string; n: number; times: number }>({ id: "", n: 0, times: 0 });
  // When a preview is held back (sent too recently), it still goes a moment later: the last bit of
  // a line always reaches the laptop, even if the pen then pauses.
  const liveLater = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendLive = () => {
    const now = performance.now();
    const s = current.current;
    if (!s) return;
    if (now - liveSend.current <= 40) {
      liveLater.current ??= setTimeout(() => {
        liveLater.current = null;
        sendLive();
      }, 45);
      return;
    }
    liveSend.current = now;
    const sh = liveShared.current;
    if (sh.id !== s.id) liveShared.current = { id: s.id, n: 0, times: 0 };
    const k = liveShared.current;
    k.times++;
    // Only growing pen ink can go in parts (a ruled line changes its ends, so it goes whole). Keeps a
    // few points of overlap, since the smoothing still moves the newest ones.
    const from = s.kind === "ink" && k.n > 4 && k.times % 20 !== 0 ? k.n - 4 : 0;
    const packed = packStroke(from ? { ...s, pts: s.pts.slice(from) } : s);
    k.n = s.pts.length;
    send(from ? { t: "live", s: packed, from } : { t: "live", s: packed });
  };

  // Where the eraser was a moment ago (world), so a quick rub also catches thin lines it jumped over.
  const lastErase = useRef<[number, number] | null>(null);
  // Rubbed-out strokes go to the other screens together, a few times a second, not one message per touch point.
  const eraseOut = useRef<{ ids: string[]; timer: ReturnType<typeof setTimeout> | null }>({ ids: [], timer: null });
  const flushErase = () => {
    const q = eraseOut.current;
    if (q.timer) clearTimeout(q.timer);
    q.timer = null;
    if (q.ids.length) send({ t: "del", ids: q.ids });
    q.ids = [];
  };
  const eraseAt = (sx: number, sy: number) => {
    const [wx, wy] = toWorld(cam.current, sx, sy);
    const r = ERASER_PX / cam.current.z;
    // Check the whole path from the last spot, in steps smaller than the eraser.
    const from = lastErase.current ?? [wx, wy];
    lastErase.current = [wx, wy];
    const steps = Math.min(40, Math.max(1, Math.ceil(Math.hypot(wx - from[0], wy - from[1]) / (r * 0.6))));
    // The patch of board this rub covers. A stroke whose own box is clear of it can't be touched, so
    // it is skipped without measuring every point of it: a full page rubs out as quickly as an empty one.
    const x0 = Math.min(from[0], wx) - r;
    const x1 = Math.max(from[0], wx) + r;
    const y0 = Math.min(from[1], wy) - r;
    const y1 = Math.max(from[1], wy) + r;
    const hit = strokes.current.filter((s) => {
      // (Not ovals or axes and T accounts: their reach can run past their box, so they are always measured.)
      if (s.kind !== "form" && s.kind !== "ellipse") {
        const b = strokeBox(s);
        if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) return false;
      }
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (hitStroke(s, from[0] + (wx - from[0]) * t, from[1] + (wy - from[1]) * t, r)) return true;
      }
      return false;
    });
    if (!hit.length) return;
    strokes.current = strokes.current.filter(removeIds(hit));
    gesture.current.erased.push(...hit);
    eraseOut.current.ids.push(...hit.map((s) => s.id));
    eraseOut.current.timer ??= setTimeout(flushErase, 60);
    checkSel();
    requestDraw();
  };

  const clearHold = () => {
    if (hold.current.timer) clearTimeout(hold.current.timer);
    hold.current.timer = null;
  };

  // Hold still → straighten the stroke into a snapped line.
  const armHold = (sx: number, sy: number) => {
    clearHold();
    hold.current.x = sx;
    hold.current.y = sy;
    hold.current.timer = setTimeout(() => {
      const s = current.current;
      if (!s || s.kind !== "ink" || gesture.current.mode !== "draw" || hold.current.path < MIN_HOLD_PATH_PX) return;
      // Snap from where the pen tip really is, not where the smoothing had got to.
      const drawn = lastRaw.current ? [...s.pts, lastRaw.current] : s.pts;
      // A closed loop becomes a clean box or oval, an L becomes axes, a roughly straight stroke a
      // line. A real curve (an arc, a letter) stays exactly as drawn, and the pen carries on.
      const tidy = holdShape(drawn, cam.current.z);
      if (!tidy) return;
      // The same weight as the hand-drawn stroke it replaces.
      const weight = penWeight(drawn);
      if (tidy.kind === "line") {
        s.kind = "line";
        s.size *= Math.min(1.25, Math.max(0.6, weight / 0.95));
        setAngle({ x: (tidy.b[0] - cam.current.x) * cam.current.z, y: (tidy.b[1] - cam.current.y) * cam.current.z, deg: lineAngle(tidy.a, tidy.b) });
      } else {
        s.size *= Math.min(1.25, Math.max(0.6, weight / 0.9));
        if (tidy.kind === "axes") {
          s.kind = "form";
          s.form = "axes";
        } else s.kind = tidy.kind;
      }
      s.pts = [tidy.a, tidy.b];
      gesture.current.straightened = true;
      try {
        navigator.vibrate?.(10);
      } catch {}
      requestDraw();
      sendLive();
    }, HOLD_MS);
  };

  const stopGlide = () => {
    if (glide.current) cancelAnimationFrame(glide.current.raf);
    glide.current = null;
  };
  // After a finger flick, the board keeps sliding and eases to a stop.
  const startGlide = (vx: number, vy: number) => {
    stopGlide();
    if (Math.hypot(vx, vy) < 0.15) return;
    const step = () => {
      const g = glide.current;
      if (!g) return;
      cam.current = { ...cam.current, x: cam.current.x - (g.vx * 16) / cam.current.z, y: cam.current.y - (g.vy * 16) / cam.current.z };
      g.vx *= 0.92;
      g.vy *= 0.92;
      refresh();
      if (Math.hypot(g.vx, g.vy) < 0.03) glide.current = null;
      else g.raf = requestAnimationFrame(step);
    };
    glide.current = { vx, vy, raf: requestAnimationFrame(step) };
  };

  // Switch a pen gesture to erasing (side button pressed mid-stroke).
  const switchToErase = (id: number, sx: number, sy: number) => {
    clearHold();
    setAngle(null);
    // The half-drawn stroke is dropped: take its preview off the other screen too.
    const dropped = current.current?.id;
    current.current = null;
    if (dropped) send({ t: "del", ids: [dropped] });
    lastErase.current = null;
    setInking(true);
    gesture.current = { mode: "erase", id, erased: [], straightened: false };
    moveEraser(sx, sy);
    eraseAt(sx, sy);
  };

  // ---- moving typed text and writing
  /** The topmost typed text (or, `anyStroke`, any writing) under a screen point. */
  const strokeUnder = (sx: number, sy: number, anyStroke: boolean) => {
    const [wx, wy] = toWorld(cam.current, sx, sy);
    const r = 10 / cam.current.z;
    // From the top down, skipping any stroke whose box is clear of the point (as the eraser does).
    const all = strokes.current;
    for (let i = all.length - 1; i >= 0; i--) {
      const x = all[i];
      if (x.kind !== "text" && !anyStroke) continue;
      if (x.kind !== "form" && x.kind !== "ellipse") {
        const b = strokeBox(x);
        if (b.x > wx + r || b.x + b.w < wx - r || b.y > wy + r || b.y + b.h < wy - r) continue;
      }
      if (hitStroke(x, wx, wy, r)) return x;
    }
    return undefined;
  };
  /** A press that may become a move: nothing changes until the pointer has gone further than a tap would. */
  const startMv = (s: Stroke, sx: number, sy: number, tapEdits: boolean, pt: string): Mv => ({
    s,
    x0: sx,
    y0: sy,
    lx: sx,
    ly: sy,
    moved: false,
    tapEdits,
    previewId: `${s.id}~${Date.now().toString(36)}`,
    // A fingertip wanders more than a pen tip or the mouse while it taps.
    slop: pt === "touch" ? 8 : pt === "pen" ? 5 : 4,
    touch: pt === "touch",
    at: performance.now(),
  });
  /** The topmost straight ruled line under a screen point (never handwriting), with a forgiving reach for a tap. */
  const lineUnder = (sx: number, sy: number, pt: string) => {
    const [wx, wy] = toWorld(cam.current, sx, sy);
    const r = (pt === "touch" ? 20 : pt === "pen" ? 10 : 6) / cam.current.z;
    // A box, oval, axes or T account is selected the same way, by a tap on its outline. The pen has a
    // shorter reach there: figures are written right beside those lines, and their dots must stay dots.
    const rShape = pt === "pen" ? r * 0.6 : r;
    const all = strokes.current;
    for (let i = all.length - 1; i >= 0; i--) if (isRuled(all[i]) && hitStroke(all[i], wx, wy, all[i].kind === "line" ? r : rShape)) return all[i];
    return undefined;
  };
  /** The move really starts: lifted off the board while it moves (drawn on top), so the board isn't redrawn each move. */
  const liftMv = (mv: Mv) => {
    mv.moved = true;
    strokes.current = strokes.current.filter((x) => x.id !== mv.s.id);
    send({ t: "del", ids: [mv.s.id] });
    setInking(true);
  };
  /** Where (or how) it is now: drawn on top here, and the other screen sees it a few times a second. */
  const showMv = (mv: Mv, next: Stroke) => {
    moving.current = next;
    const now = performance.now();
    if (now - liveSend.current > 40) {
      liveSend.current = now;
      send({ t: "live", s: packStroke({ ...next, id: mv.previewId }) });
    }
    requestDraw();
  };
  /** The words re-wrapped by their side handle (or a line's end moved) land: one undo step, and the
   * other device gets them. */
  const landMv = (mv: Mv, cancelled: boolean) => {
    setInking(false);
    const after = cancelled ? mv.s : (moving.current ?? mv.s);
    moving.current = null;
    strokes.current = [...strokes.current, after];
    if (after !== mv.s) commit({ type: "replace", before: [mv.s], after: [after] });
    // The preview goes and the moved one lands, together.
    send({ t: "batch", ms: [{ t: "del", ids: [mv.previewId] }, { t: "add", s: packStroke(after) }] });
    persist();
    requestDraw();
    syncMeta();
  };
  // ---- handles that re-shape one thing (page elements over the board, so they work with the pen, a
  // finger or the mouse, whatever tool is in hand): typed text's side handle sets how wide its lines
  // run (they wrap again), and a line's end handles move one end. (Moving and scaling go through the
  // group drag.)
  type TextGrip = "w" | "a" | "b";
  const textDrag = useRef<{ id: number; kind: TextGrip; mv: Mv; w0: number } | null>(null);
  const endTextDrag = (cancelled = false) => {
    const d = textDrag.current;
    if (!d) return;
    textDrag.current = null;
    if (d.mv.moved) landMv(d.mv, cancelled);
  };
  useEffect(() => {
    endTextDragRef.current = endTextDrag;
  });
  const onTextGripDown = (e: React.PointerEvent<HTMLElement>) => {
    // A resting palm, or a touch while the pen is in use, does nothing (as on the board).
    if (e.pointerType === "touch" && (pens.current.active || Date.now() - pens.current.lastAt < PALM_LOCK_MS || e.width > PALM_SIZE_PX || e.height > PALM_SIZE_PX)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // A drag left open by a grip that went off the page is finished first.
    endTextDrag();
    const kind = e.currentTarget.dataset.k as TextGrip;
    const s = kind === "w" ? selStroke() : selLineStroke();
    if (!s || moving.current || grp.current || gesture.current.mode) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    stopGlide();
    const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
    textDrag.current = { id: e.pointerId, kind, w0: Math.max(1, b[0] - a[0]), mv: { ...startMv(s, e.clientX, e.clientY, false, e.pointerType), slop: 2 } };
  };
  const onTextGripMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = textDrag.current;
    if (!d || d.id !== e.pointerId) return;
    const mv = d.mv;
    const z = cam.current.z;
    const dx = (e.clientX - mv.x0) / z;
    const dy = (e.clientY - mv.y0) / z;
    if (!mv.moved) {
      if (Math.hypot(dx, dy) * z < mv.slop) return;
      liftMv(mv);
    }
    if (d.kind === "w") showMv(mv, restyled(mv.s, { boxW: Math.max(mv.s.size * 2, d.w0 + dx) }));
    else {
      // One end of a line moves (straight, level or upright when within 3 degrees of it); the other stays.
      const [p0, p1] = [mv.s.pts[0], mv.s.pts[mv.s.pts.length - 1]];
      const fixed = d.kind === "a" ? p1 : p0;
      const end = d.kind === "a" ? p0 : p1;
      const moved = snapLine(fixed, [end[0] + dx, end[1] + dy, end[2]], 3, e.pointerType === "mouse" && e.shiftKey ? 15 : 0);
      showMv(mv, { ...mv.s, pts: d.kind === "a" ? [moved, p1] : [p0, moved] });
    }
  };
  const onTextGripUp = (e: React.PointerEvent<HTMLElement>) => {
    if (textDrag.current?.id === e.pointerId) endTextDrag(e.type === "pointercancel");
  };
  // Tablet: a finger held still on typed words picks them up (a small buzz), then they follow the
  // finger, with any tool; so does a finger held on what is already selected (a big selection, which
  // a finger otherwise pans). Never lines, shapes, pictures, handwriting or empty board: a hand
  // resting there must still pan. A quick drag still pans.
  const liftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armLift = (id: number) => {
    if (liftTimer.current) clearTimeout(liftTimer.current);
    liftTimer.current = setTimeout(() => {
      liftTimer.current = null;
      const at = touches.current.get(id);
      if (!at || touches.current.size !== 1 || panTrip.current.dist > 12 || gesture.current.mode) return;
      if (pens.current.active || Date.now() - pens.current.lastAt < PALM_LOCK_MS) return;
      const word = strokeUnder(at.x, at.y, false);
      if (word) setSel({ ids: [word.id], imgs: [] });
      else if (!selRef.current || !insideSelFrame(at.x, at.y, "touch")) return;
      // From here this finger moves it (the group drag), not the board.
      touches.current.delete(id);
      tap1.current = null;
      velocity.current = { vx: 0, vy: 0 };
      startGroupDrag(id, at.x, at.y, "move", "touch");
      requestDraw();
      try {
        navigator.vibrate?.(12);
      } catch {}
    }, LIFT_MS);
  };
  // The open text box's grip (left of the words): drag it to move the box; the keyboard stays open.
  const gripping = useRef<{ x0: number; y0: number; wx0: number; wy0: number } | null>(null);
  const onGripDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const t = typingRef.current;
    if (!t) return;
    e.preventDefault();
    // A resting palm never drags the box.
    if (e.pointerType === "touch" && (pens.current.active || Date.now() - pens.current.lastAt < PALM_LOCK_MS || e.width > PALM_SIZE_PX || e.height > PALM_SIZE_PX)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gripping.current = { x0: e.clientX, y0: e.clientY, wx0: t.wx, wy0: t.wy };
  };
  const onGripMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gripping.current;
    const t = typingRef.current;
    if (!g || !t) return;
    const z = cam.current.z;
    t.wx = g.wx0 + (e.clientX - g.x0) / z;
    t.wy = g.wy0 + (e.clientY - g.y0) / z;
    placeTyping();
    if (t.text.trim() && e.timeStamp - liveSend.current > 40) {
      liveSend.current = e.timeStamp;
      send({ t: "live", s: typedStroke(t) });
    }
  };
  const onGripUp = () => {
    const t = typingRef.current;
    // Its last spot always reaches the other screen.
    if (gripping.current && t?.text.trim()) send({ t: "live", s: typedStroke(t) });
    gripping.current = null;
    textRef.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    commitTypingRef.current = () => commitTyping();
  });
  // Laptop: the mouse is over something the Type or Move tool can drag (the cursor shows it).
  const [overItem, setOverItem] = useState(false);
  const overItemRef = useRef(false);
  const noteHover = (x: number, y: number) => {
    let over = false;
    if (!gesture.current.mode && selRef.current && insideSelFrame(x, y, "mouse")) over = true;
    else if (!gesture.current.mode && (tool === "text" || tool === "move")) {
      const [wx, wy] = toWorld(cam.current, x, y);
      over = !!strokeUnder(x, y, tool === "move") || (tool === "move" && !!imageAt(images.current, wx, wy));
    }
    if (over === overItemRef.current) return;
    overItemRef.current = over;
    setOverItem(over);
  };

  // ---- hold to select, and the lasso
  const lassoArm = useRef<{ pid: number; x: number; y: number; pt: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const cancelLasso = () => {
    if (lassoArm.current) clearTimeout(lassoArm.current.timer);
    lassoArm.current = null;
  };
  const lassoSvgRef = useRef<SVGSVGElement>(null);
  const lassoPathRef = useRef<SVGPathElement>(null);
  const lassoCloseRef = useRef<SVGLineElement>(null);
  const lassoTipRef = useRef<SVGCircleElement>(null);
  /** The lasso's dashed outline, in board units, kept on the board as it is drawn. */
  /** The lasso's outline on screen: a smooth dashed path, a faint hint closing it back to where it
   * began, and a small dot at the pen. */
  const drawLasso = () => {
    const svgEl = lassoSvgRef.current;
    const path = lassoPathRef.current;
    const s = current.current;
    if (!svgEl || !path || !s || !s.pts.length) return;
    const c = cam.current;
    // Screen points, dropping any closer than 2 px to the last one kept.
    const pts: Array<[number, number]> = [];
    for (const p of s.pts) {
      const q: [number, number] = [(p[0] - c.x) * c.z, (p[1] - c.y) * c.z];
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) >= 2) pts.push(q);
    }
    const f = (v: number) => v.toFixed(1);
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    // Through the midpoints, so it is smooth.
    for (let i = 1; i < pts.length - 1; i++) d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f((pts[i][0] + pts[i + 1][0]) / 2)} ${f((pts[i][1] + pts[i + 1][1]) / 2)}`;
    const end = pts[pts.length - 1];
    if (pts.length > 1) d += `L${f(end[0])} ${f(end[1])}`;
    path.setAttribute("d", d);
    const close = lassoCloseRef.current;
    if (close) {
      close.setAttribute("x1", f(end[0]));
      close.setAttribute("y1", f(end[1]));
      close.setAttribute("x2", f(pts[0][0]));
      close.setAttribute("y2", f(pts[0][1]));
    }
    const tip = lassoTipRef.current;
    if (tip) {
      tip.setAttribute("cx", f(end[0]));
      tip.setAttribute("cy", f(end[1]));
    }
    if (svgEl.style.display !== "block") svgEl.style.display = "block";
  };
  const hideLasso = () => {
    const svgEl = lassoSvgRef.current;
    if (svgEl && svgEl.style.display !== "none") svgEl.style.display = "none";
    lassoPathRef.current?.setAttribute("d", "");
  };
  /** A lasso from here: the stroke being drawn becomes the loop. */
  const startLasso = (pid: number, sx: number, sy: number, safety: boolean) => {
    const [wx, wy] = toWorld(cam.current, sx, sy);
    current.current = { id: newId(), kind: "ink", color, size: size / cam.current.z, pts: [[wx, wy, 0.5]] };
    lastRaw.current = null;
    gesture.current = { mode: "draw", id: pid, erased: [], straightened: false, lasso: { safety } };
    gestureLasso.current = true;
    hold.current.path = 0;
    capture(canvasRef.current, pid);
    drawLasso();
    requestDraw();
  };
  const armLasso = (pid: number, sx: number, sy: number, pt: string) => {
    cancelLasso();
    lassoArm.current = { pid, x: sx, y: sy, pt, timer: setTimeout(fireLasso, LASSO_MS) };
  };
  /** Held still long enough: pick up what is under the pen, or start a lasso. */
  const fireLasso = () => {
    const a = lassoArm.current;
    lassoArm.current = null;
    const g = gesture.current;
    if (!a || g.id !== a.pid || (g.mode !== "draw" && g.mode !== "line")) return;
    if (g.mode === "draw" && (g.straightened || hold.current.path >= 6)) return;
    if (a.pt === "pen" && !pens.current.active) return;
    clearHold();
    setAngle(null);
    // The dot that was starting here never becomes ink: its preview leaves the other screen too.
    if (liveLater.current) clearTimeout(liveLater.current);
    liveLater.current = null;
    const cur = current.current;
    if (cur && liveShared.current.id === cur.id) send({ t: "del", ids: [cur.id] });
    try {
      navigator.vibrate?.(12);
    } catch {}
    // The bars come back at once, so the bar (or the outline) is seen straight away.
    if (inkingOff.current) clearTimeout(inkingOff.current);
    inkingOff.current = null;
    setInkingNow(false);
    // On something: it is selected, and the pen is now dragging it.
    const text = strokeUnder(a.x, a.y, false);
    const ruled = text ? undefined : lineUnder(a.x, a.y, a.pt);
    const ink = text || ruled ? undefined : inkUnder(a.x, a.y, a.pt);
    if (text || ruled) {
      current.current = null;
      const hit = (text ?? ruled)!;
      setSel({ ids: [hit.id], imgs: [] });
      startGroupDrag(a.pid, a.x, a.y, "move", a.pt, { clearAfter: a.pt === "pen" });
      requestDraw();
      return;
    }
    if (ink) {
      current.current = null;
      setSel(clusterSel(ink, 1));
      startGroupDrag(a.pid, a.x, a.y, "move", a.pt, { clearAfter: a.pt === "pen" });
      requestDraw();
      return;
    }
    // On empty board (or the bare part of a picture): a lasso. If it goes round nothing, it is kept
    // as ink (with the pen, not the highlighter), so a pause before a stroke never loses writing.
    if (g.mode === "line" || !cur) {
      const [wx, wy] = toWorld(cam.current, a.x, a.y);
      current.current = { id: newId(), kind: "ink", color: cur?.color ?? color, size: size / cam.current.z, pts: [[wx, wy, 0.5]] };
      lastRaw.current = null;
    }
    gesture.current = { mode: "draw", id: a.pid, erased: [], straightened: false, lasso: { safety: tool === "pen" && !marker } };
    gestureLasso.current = true;
    drawLasso();
    requestDraw();
  };

  // ---- the selected group: handwriting picked up by a tap (its word, line or block), or a mix of
  // things. One frame and one bar; it moves (and scales) as one, in one undo step.
  /** A group selection: anything selected that is not one typed text, one line or one picture (those
   * keep their own frame and bar). */
  const isGroup = () => !!selRef.current;
  /** The selection's box on the board (cached until the board or the selection changes). */
  // (Where the content itself is, without the room kept for the nib: the frame sits a fixed 8 screen
  // pixels outside it, and a corner drag scales from its corners.)
  const boundsCache = useRef<{ sel: Sel | null; s: Stroke[] | null; i: BoardImage[] | null; mv: Stroke | null; b: View | null }>({ sel: null, s: null, i: null, mv: null, b: null });
  const selBounds = (): View | null => {
    const sel = selRef.current;
    if (!sel) return null;
    const c = boundsCache.current;
    if (c.sel === sel && c.s === strokes.current && c.i === images.current && c.mv === moving.current) return c.b;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (b: View) => {
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    };
    for (const id of sel.ids) {
      const s = strokeById(id);
      if (!s) continue;
      // Typed text: its words' box; a box, oval or form: its outline; writing: where its points are.
      if (s.kind === "text" || s.kind === "rect" || s.kind === "ellipse" || s.kind === "form") {
        const [a, q] = [s.pts[0], s.pts[s.pts.length - 1]];
        add({ x: Math.min(a[0], q[0]), y: Math.min(a[1], q[1]), w: Math.abs(q[0] - a[0]), h: Math.abs(q[1] - a[1]) });
      } else add(rawBox(s));
    }
    const want = new Set(sel.imgs);
    for (const m of images.current) if (want.has(m.id)) add(m);
    const b = x1 >= x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
    boundsCache.current = { sel, s: strokes.current, i: images.current, mv: moving.current, b };
    return b;
  };
  /** The selection's box on screen, where it is now (moved along while it is dragged). */
  const selScreenBox = () => {
    const b = selBounds();
    if (!b) return null;
    const t = lift.current && !lift.current.landing && !lift.current.remote ? lift.current.t : XF0;
    const c = cam.current;
    const x = (t.ax + (b.x - t.ax) * t.k + t.dx - c.x) * c.z;
    const y = (t.ay + (b.y - t.ay) * t.k + t.dy - c.y) * c.z;
    return { x, y, w: b.w * t.k * c.z, h: b.h * t.k * c.z };
  };
  /**
   * Does a press here take hold of the selection? Its frame, with a little slack; a lone straight line
   * along the line itself. A lone picture only for a finger or the Select tool: the pen (and the mouse
   * with the Pen or Line tool) writes straight through it, which is how PDF pages are marked up.
   */
  const insideSelFrame = (sx: number, sy: number, pt: string) => {
    if (!selRef.current) return false;
    const line = selLineStroke();
    if (line?.kind === "line") {
      const [wx, wy] = toWorld(cam.current, sx, sy);
      return hitStroke(line, wx, wy, (pt === "touch" ? 22 : 12) / cam.current.z);
    }
    if (selectedRef.current && pt !== "touch" && tool !== "move") return false;
    const r = selScreenBox();
    if (!r) return false;
    // The frame is 8 px out; a little slack beyond it.
    const pad = 8 + (pt === "touch" ? 12 : 8);
    return sx >= r.x - pad && sx <= r.x + r.w + pad && sy >= r.y - pad && sy <= r.y + r.h + pad;
  };
  /** Covers most of the screen: a finger then pans as usual (the Move grip in its bar moves it). */
  const selIsBig = () => {
    const r = selScreenBox();
    const { w, h } = screen.current;
    return !!r && r.w * r.h > 0.45 * w * h;
  };
  /** The topmost handwriting under a screen point (a finger has a wider reach than the pen or mouse). */
  const inkUnder = (sx: number, sy: number, pt: string) => {
    const [wx, wy] = toWorld(cam.current, sx, sy);
    const r = (pt === "touch" ? 14 : pt === "pen" ? 8 : 6) / cam.current.z;
    const all = strokes.current;
    for (let i = all.length - 1; i >= 0; i--) {
      const x = all[i];
      if (x.kind !== "ink") continue;
      const b = strokeBox(x);
      if (b.x > wx + r || b.x + b.w < wx - r || b.y > wy + r || b.y + b.h < wy - r) continue;
      if (hitStroke(x, wx, wy, r)) return x;
    }
    return undefined;
  };
  /**
   * What a press picks up here: typed text, a ruled line or shape, handwriting (its word: `ink`), or a
   * picture that is not most of the screen (`pic`). Nothing: null.
   */
  const grabAt = (sx: number, sy: number, pt: string, ink = true, pic = true): Sel | null => {
    const text = strokeUnder(sx, sy, false);
    if (text) return { ids: [text.id], imgs: [] };
    const ruled = lineUnder(sx, sy, pt);
    if (ruled) return { ids: [ruled.id], imgs: [] };
    const hand = ink ? inkUnder(sx, sy, pt) : undefined;
    if (hand) return clusterSel(hand, 1);
    if (!pic) return null;
    const [wx, wy] = toWorld(cam.current, sx, sy);
    const m = imageAt(images.current, wx, wy);
    return m && m.w * m.h * cam.current.z ** 2 <= 0.45 * screen.current.w * screen.current.h ? { ids: [], imgs: [m.id] } : null;
  };
  /** Is the pen right on one of the selected things (as close as it would pick it up)? */
  const onSelMember = (sx: number, sy: number) => {
    const sel = selRef.current;
    if (!sel) return false;
    const [wx, wy] = toWorld(cam.current, sx, sy);
    const r = 8 / cam.current.z;
    for (const id of sel.ids) {
      const s = strokeById(id);
      if (!s) continue;
      const b = strokeBox(s);
      if (s.kind !== "form" && s.kind !== "ellipse" && (b.x > wx + r || b.x + b.w < wx - r || b.y > wy + r || b.y + b.h < wy - r)) continue;
      if (hitStroke(s, wx, wy, r)) return true;
    }
    const want = new Set(sel.imgs);
    return images.current.some((m) => want.has(m.id) && wx >= m.x && wx <= m.x + m.w && wy >= m.y && wy <= m.y + m.h);
  };
  /** Pressing inside the selection: a tap opens lone typed words, or picks up more handwriting. */
  const tapOpts = () => ({ tapEdits: !!selTextRef.current, tapGrows: !!selRef.current?.grow });
  /** Handwriting picked up from one stroke: its word (1), line (2) or block (3). */
  const clusterSel = (s: Stroke, level: Grow): Sel => ({ ids: inkCluster(strokes.current, s.id, s.hl ? 0 : level), imgs: [], grow: { seed: s.id, level: s.hl ? 0 : level } });
  /** One step further (word, line, block) or back, skipping a step that picks up the same. */
  const stepSel = (dir: 1 | -1) => {
    const sel = selRef.current;
    if (!sel?.grow || grp.current) return;
    const seed = strokeMap().get(sel.grow.seed);
    if (!seed || seed.hl) return;
    let level = sel.grow.level;
    const now = sel.ids.join(",");
    while (dir > 0 ? level < 3 : level > 0) {
      level = (level + dir) as Grow;
      const ids = inkCluster(strokes.current, seed.id, level);
      if (ids.join(",") !== now || level === 0 || level === 3) {
        setSel({ ids, imgs: [], grow: { seed: seed.id, level } });
        requestDraw();
        return;
      }
    }
  };
  const growSel = () => stepSel(1);
  const shrinkSel = () => stepSel(-1);

  // ---- the lifted group: drawn once on its own layer over the board, then only moved
  const liftCanvasRef = useRef<HTMLCanvasElement>(null);
  /** Draw the lifted group into its layer, sharp for the zoom and scale it has now. Only the part
   * within a screen of what is in view, so a huge group never makes a huge picture. */
  const renderLift = () => {
    const L = lift.current;
    const c = liftCanvasRef.current;
    const { w, h, dpr } = screen.current;
    if (!L || !c || !w || !h) return;
    const cm = cam.current;
    const t = L.t;
    const z = cm.z;
    const k = t.k;
    const liftedS = strokes.current.filter((x) => L.ids.has(x.id));
    const liftedI = images.current.filter((m) => L.imgs.has(m.id));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of [...liftedS.map(strokeBox), ...liftedI]) {
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    // The screen, and one more screen each side, in the group's own (unmoved) units.
    const qx = (sx: number) => (sx / z + cm.x - t.ax * (1 - k) - t.dx) / k;
    const qy = (sy: number) => (sy / z + cm.y - t.ay * (1 - k) - t.dy) / k;
    const rx0 = Math.max(x0, qx(-w));
    const ry0 = Math.max(y0, qy(-h));
    const rx1 = Math.min(x1, qx(2 * w));
    const ry1 = Math.min(y1, qy(2 * h));
    L.zR = z;
    L.kR = k;
    L.ppu = z * k;
    if (!(rx1 > rx0) || !(ry1 > ry0)) {
      L.region = { x: rx0, y: ry0, w: 0, h: 0 };
      c.width = 1;
      c.height = 1;
      return;
    }
    L.region = { x: rx0, y: ry0, w: rx1 - rx0, h: ry1 - ry0 };
    const cssW = L.region.w * L.ppu;
    const cssH = L.region.h * L.ppu;
    // Kept within what a phone or tablet can hold as one picture (drawn a little softer if bigger).
    let bs = 1;
    const pw = cssW * dpr;
    const ph = cssH * dpr;
    if (Math.max(pw, ph) > 4096) bs = 4096 / Math.max(pw, ph);
    if (pw * ph * bs * bs > 8.4e6) bs = Math.min(bs, Math.sqrt(8.4e6 / (pw * ph)));
    c.width = Math.max(1, Math.ceil(pw * bs));
    c.height = Math.max(1, Math.ceil(ph * bs));
    c.style.width = `${cssW}px`;
    c.style.height = `${cssH}px`;
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr * bs, 0, 0, dpr * bs, 0, 0);
    g.scale(L.ppu, L.ppu);
    g.translate(-rx0, -ry0);
    // Pictures first, then the writing (on them too), as on the board.
    drawImages(g, liftedI, () => {
      if (lift.current === L) renderLift();
    });
    for (const s of liftedS) drawStroke(g, s);
    L.lastKey = "";
  };
  /** Slide (and scale) the layer to where the group is now: one style change. */
  const placeLift = () => {
    const L = lift.current;
    const c = liftCanvasRef.current;
    if (!L || !c) return;
    const cm = cam.current;
    // Until the board has redrawn without it, it stays exactly where it was (never seen twice).
    const t = L.ready || L.landing ? L.t : XF0;
    const S = (t.k * cm.z) / L.ppu;
    const tx = (L.region.x * t.k + t.ax * (1 - t.k) + t.dx - cm.x) * cm.z;
    const ty = (L.region.y * t.k + t.ay * (1 - t.k) + t.dy - cm.y) * cm.z;
    const tf = `translate(${tx}px, ${ty}px) scale(${S})`;
    if (c.style.transform !== tf) c.style.transform = tf;
    if (c.style.display !== "block") c.style.display = "block";
  };
  /** Lift these off the board onto the layer (the board redraws once without them). */
  const liftItems = (ids: string[], imgs: string[], remote?: string) => {
    const L: Lift = {
      ids: new Set(ids),
      imgs: new Set(imgs),
      srcS: null,
      restS: [],
      srcI: null,
      restI: [],
      t: { ...XF0 },
      zR: cam.current.z,
      kR: 1,
      region: { x: 0, y: 0, w: 0, h: 0 },
      ppu: cam.current.z,
      ready: false,
      landing: false,
      landingAt: 0,
      movedAt: performance.now(),
      lastKey: "",
      remote,
    };
    lift.current = L;
    renderLift();
    placeLift();
    requestDraw();
  };
  /** The move is on the board now (or was called off): the layer goes as soon as the board shows it. */
  const landLift = () => {
    const L = lift.current;
    if (!L) return;
    L.landing = true;
    L.landingAt = performance.now();
    placeLift();
    requestDraw();
  };
  /** Called off: the group goes back where it was. */
  const unlift = () => {
    const L = lift.current;
    if (!L) return;
    L.t = { ...XF0 };
    landLift();
  };
  const dropLift = () => {
    lift.current = null;
    const c = liftCanvasRef.current;
    if (c && c.style.display !== "none") c.style.display = "none";
  };
  // ---- dragging the group
  const grp = useRef<GroupDrag | null>(null);
  // ---- the live glide on the laptop: where the group is, about 15 times a second (a tiny message;
  // the strokes themselves go once, when it lands). The tablet only: the laptop never sends its own.
  const xfLater = useRef<ReturnType<typeof setTimeout> | null>(null);
  // While a drag is held still, the laptop still hears from it once a second (or it would give up
  // after three seconds and put the group back).
  const xfKeep = useRef<ReturnType<typeof setInterval> | null>(null);
  /** A transform as the five numbers the message carries. */
  const xfD = (t: Xf): [number, number, number, number, number] => {
    const r = (v: number) => Math.round(v * 10) / 10;
    return [r(t.dx), r(t.dy), Math.round(t.k * 1e4) / 1e4, r(t.ax), r(t.ay)];
  };
  /** `cancel`: called off; the laptop puts the group back where it was (no flash at the dragged spot). */
  const sendXf = (d: GroupDrag, done: boolean, cancel = false) => {
    if (!lead) return;
    if (xfLater.current) clearTimeout(xfLater.current);
    xfLater.current = null;
    if (done) {
      send({ t: "xf", id: d.xfId, done: true, d: cancel ? [0, 0, 1, 0, 0] : xfD(d.t) });
      return;
    }
    const now = msNow();
    if (now - d.sent < 66) {
      // Held back (sent too recently): it still goes a moment later, so the last spot always arrives.
      xfLater.current = setTimeout(() => {
        xfLater.current = null;
        if (grp.current === d) sendXf(d, false);
      }, 70);
      return;
    }
    d.sent = now;
    const msg: BoardMsg = { t: "xf", id: d.xfId, d: xfD(d.t) };
    // What is moving: in the first message, then once a second (in case the first went missing).
    if (!d.idsAt || now - d.idsAt > 1000) {
      d.idsAt = now;
      msg.ids = [...(lift.current?.ids ?? [])];
      msg.imgs = [...(lift.current?.imgs ?? [])];
    }
    send(msg);
  };
  /**
   * Laptop: the arrow keys nudge the selected group (Shift: 10 at a time). It moves on its layer like
   * a drag, and lands half a second after the last press (or at once on a click or any other key):
   * one burst of presses is one undo step.
   */
  const nudgeT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nudgeGroup = (dx: number, dy: number) => {
    const sel = selRef.current;
    if (!sel || !isGroup()) return false;
    let d = grp.current;
    if (d && !d.keyboard) return true; // a drag by pointer is going on: that comes first
    if (!d) {
      startGroupDrag(-2, 0, 0, "move", "key", { keyboard: true });
      d = grp.current!;
      d.moved = true;
      liftItems(sel.ids, sel.imgs);
    }
    const z = cam.current.z;
    d.t = { ...d.t, dx: d.t.dx + dx / z, dy: d.t.dy + dy / z };
    if (lift.current) lift.current.t = d.t;
    sendXf(d, false);
    if (nudgeT.current) clearTimeout(nudgeT.current);
    const mine = d;
    nudgeT.current = setTimeout(() => {
      nudgeT.current = null;
      if (grp.current === mine) endGroupDrag(false);
    }, 500);
    return true;
  };
  /** A nudge burst still waiting to land: it lands now. */
  const landNudge = () => {
    if (!grp.current?.keyboard) return;
    if (nudgeT.current) clearTimeout(nudgeT.current);
    nudgeT.current = null;
    endGroupDrag(false);
  };

  const startGroupDrag = (pid: number, sx: number, sy: number, kind: GroupDrag["kind"], pt: string, opts: { viaHandle?: boolean; tapGrows?: boolean; tapEdits?: boolean; keyboard?: boolean; clearAfter?: boolean } = {}) => {
    stopGlide();
    // The tablet's group still gliding here: this device's own move comes first.
    if (lift.current?.remote) dropLift();
    const [wx, wy] = toWorld(cam.current, sx, sy);
    grp.current = {
      pid,
      kind,
      viaHandle: !!opts.viaHandle,
      keyboard: opts.keyboard,
      clearAfter: opts.clearAfter,
      sx0: sx,
      sy0: sy,
      wx0: wx,
      wy0: wy,
      lx: sx,
      ly: sy,
      moved: false,
      // A fingertip wanders more than a pen tip or the mouse while it taps; a handle moves at once.
      slop: opts.viaHandle ? 2 : pt === "touch" ? 8 : pt === "pen" ? 5 : 4,
      touch: pt === "touch",
      at: performance.now(),
      tapEdits: !!opts.tapEdits,
      tapGrows: !!opts.tapGrows,
      box0: kind === "move" ? null : selBounds(),
      t: { ...XF0 },
      xfId: newId(),
      sent: 0,
      idsAt: 0,
    };
    if (!opts.viaHandle && !opts.keyboard) gesture.current = { mode: "group", id: pid, erased: [], straightened: false };
  };
  const moveGroupDrag = (sx: number, sy: number) => {
    const d = grp.current;
    const sel = selRef.current;
    if (!d || !sel) return;
    d.lx = sx;
    d.ly = sy;
    if (!d.moved) {
      // Still a tap until it has gone a few pixels. Then the group is lifted onto its own layer.
      if (Math.hypot(sx - d.sx0, sy - d.sy0) < d.slop) return;
      d.moved = true;
      liftItems(sel.ids, sel.imgs);
      setInking(true);
      if (lead && !xfKeep.current)
        xfKeep.current = setInterval(() => {
          const g = grp.current;
          if (!g || !g.moved) return;
          g.sent = 0;
          sendXf(g, false);
        }, 1000);
    }
    const [wx, wy] = toWorld(cam.current, sx, sy);
    if (d.kind === "move" || !d.box0) d.t = { dx: wx - d.wx0, dy: wy - d.wy0, k: 1, ax: 0, ay: 0 };
    else d.t = scaleXf(d, wx, wy);
    // The layer itself is moved in the next frame (see frameTick), not here: a style change here
    // would make the next pointer event wait for the page to lay itself out again.
    if (lift.current) lift.current.t = d.t;
    sendXf(d, false);
  };
  /** A corner drag: the opposite corner stays put and the group keeps its shape. */
  const scaleXf = (d: GroupDrag, wx: number, wy: number): Xf => {
    const b = d.box0!;
    const left = d.kind === "nw" || d.kind === "sw";
    const top = d.kind === "nw" || d.kind === "ne";
    const ax = left ? b.x + b.w : b.x;
    const ay = top ? b.y + b.h : b.y;
    const kx = (left ? ax - wx : wx - ax) / Math.max(1e-6, b.w);
    const ky = (top ? ay - wy : wy - ay) / Math.max(1e-6, b.h);
    // Whichever way the corner went further.
    let k = Math.abs(kx - 1) >= Math.abs(ky - 1) ? kx : ky;
    // Never smaller than a little on screen (a lone picture keeps its 60 pixels, as before).
    const z = cam.current.z;
    const sel = selRef.current;
    const minPx = sel && !sel.ids.length && sel.imgs.length === 1 ? 60 : 24;
    k = Math.max(k, minPx / Math.max(1e-6, Math.max(b.w, b.h) * z), 0.02);
    return { dx: 0, dy: 0, k, ax, ay };
  };
  /** The drag ends: a tap opens the words or picks up more; a move lands as one undo step. */
  const endGroupDrag = (cancelled = false) => {
    const d = grp.current;
    if (!d) return;
    grp.current = null;
    if (gesture.current.mode === "group") gesture.current = { mode: null, id: -1, erased: [], straightened: false };
    if (!d.moved) {
      // A finger that only rested there for a while is not a tap.
      if (cancelled || (d.touch && msNow() - d.at >= 600)) return;
      if (d.tapEdits) {
        const s = selStroke();
        if (s) startTyping(d.sx0, d.sy0, s, true);
      } else if (d.tapGrows) growSel();
      return;
    }
    setInking(false);
    if (xfKeep.current) clearInterval(xfKeep.current);
    xfKeep.current = null;
    if (cancelled || isIdentity(d.t)) {
      unlift();
      sendXf(d, true, true);
      return;
    }
    applyGroup(d.t, d.xfId);
    if (d.clearAfter) clearSel();
  };
  /** The moved (or scaled) group goes on the board: one undo step, one message to the other device. */
  const applyGroup = (t: Xf, xfId: string) => {
    const L = lift.current;
    const sel = selRef.current;
    const ids = L ? L.ids : new Set(sel?.ids ?? []);
    const imgs = L ? L.imgs : new Set(sel?.imgs ?? []);
    const sb = strokes.current.filter((x) => ids.has(x.id));
    const ib = images.current.filter((m) => imgs.has(m.id));
    if (!sb.length && !ib.length) {
      if (L) unlift();
      return;
    }
    const sa = sb.map((x) => xformStroke(x, t));
    const ia = ib.map((m) => xformImage(m, t));
    // A glide message still waiting must not arrive after the move.
    if (xfLater.current) clearTimeout(xfLater.current);
    xfLater.current = null;
    // Moved things go to the end of the list, as the other device puts them when it hears.
    strokes.current = [...strokes.current.filter((x) => !ids.has(x.id)), ...sa];
    if (ib.length) images.current = [...images.current.filter((m) => !imgs.has(m.id)), ...ia];
    commit({ type: "group", sb, sa, ib, ia });
    send({
      t: "batch",
      ms: [
        ...sa.map((x): BoardMsg => ({ t: "add", s: packStroke(x) })),
        ...ia.filter((m) => !m.url.startsWith("blob:")).map((m): BoardMsg => ({ t: "img", m })),
        // (Last, with where it ended, so the laptop's glide ends exactly there.)
        ...(lead ? [{ t: "xf" as const, id: xfId, done: true, d: xfD(t) }] : []),
      ],
    });
    if (L) landLift();
    // Still selected, where it is now.
    syncSel();
    requestDraw();
  };
  /** A drag called off part way (a page change, undo, Escape): the group goes back. */
  const cancelGroupDrag = () => {
    if (grp.current) endGroupDrag(true);
  };
  useEffect(() => {
    cancelGroupDragRef.current = cancelGroupDrag;
    endHandleDragRef.current = () => {
      if (grp.current?.viaHandle) endGroupDrag(false);
    };
  });
  // Timers left running when the board goes (another page of the site): stopped.
  useEffect(
    () => () => {
      if (lassoArm.current) clearTimeout(lassoArm.current.timer);
      if (nudgeT.current) clearTimeout(nudgeT.current);
      if (xfLater.current) clearTimeout(xfLater.current);
      if (xfTimer.current) clearTimeout(xfTimer.current);
      if (xfKeep.current) clearInterval(xfKeep.current);
    },
    [],
  );
  // Some of the lifted group left the board (rubbed out or changed on the other device): it is
  // drawn again without them.
  useEffect(() => {
    liftPruneRef.current = () => {
      const L = lift.current;
      const sel = selRef.current;
      if (!L || L.landing || L.remote) return;
      L.ids = new Set(sel?.ids ?? []);
      L.imgs = new Set(sel?.imgs ?? []);
      L.srcS = null;
      L.srcI = null;
      if (!sel) {
        // Nothing left to move: the drag ends here.
        grp.current = null;
        if (gesture.current.mode === "group") gesture.current = { mode: null, id: -1, erased: [], straightened: false };
        setInking(false);
        unlift();
        return;
      }
      renderLift();
      requestDraw();
    };
  });


  // The laptop: the tablet's group gliding. Its own copies are lifted and moved along; the move
  // itself lands with the tablet's batch, and the last message ("done") lets the layer go.
  const xfDone = useRef<string[]>([]);
  const xfTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    remoteXfRef.current = (m) => {
      const L = lift.current;
      // Busy moving something of its own: that comes first.
      if (grp.current || (L && !L.remote && !L.landing)) return;
      if (m.done) {
        xfDone.current = [...xfDone.current.slice(-19), m.id];
        if (L?.remote === m.id && !L.landing) {
          if (xfTimer.current) clearTimeout(xfTimer.current);
          // Where it really ended (back where it was, when called off). An older tablet says nothing:
          // the board already shows the move, so the layer just goes.
          if (m.d) {
            const [dx, dy, k, ax, ay] = m.d;
            L.t = { dx, dy, k, ax, ay };
          }
          L.goal = undefined;
          landLift();
        }
        return;
      }
      if (xfDone.current.includes(m.id)) return;
      if (!L || L.remote !== m.id || L.landing) {
        if (!m.ids && !m.imgs) return; // joined part way: wait for the message that says what moves
        dropLift();
        liftItems(m.ids ?? [], m.imgs ?? [], m.id);
      }
      const L2 = lift.current;
      if (L2 && m.d) {
        const [dx, dy, k, ax, ay] = m.d;
        L2.goal = { dx, dy, k, ax, ay };
      }
      // No word for three seconds (the tablet went quiet): the group goes back where it is here.
      if (xfTimer.current) clearTimeout(xfTimer.current);
      xfTimer.current = setTimeout(() => {
        if (lift.current?.remote === m.id && !lift.current.landing) unlift();
      }, 3000);
    };
  });

  /** Fit: zoom the view to the whole selection, with room above for its bar. The laptop follows. */
  const fitSel = () => {
    const b = selBounds();
    if (!b) return;
    const { w, h } = screen.current;
    const z = cam.current.z;
    const pad = 24 / z;
    takeView();
    const inset = lead
      ? clearInset(h, [topBarRef.current, sidePanelRef.current], [], 14, [toolbarRef.current])
      : clearInset(h, [topBarRef.current, sidePanelRef.current], [toolbarRef.current]);
    cam.current = fitView({ x: b.x - pad, y: b.y - pad - 60 / z, w: b.w + 2 * pad, h: b.h + 2 * pad + 60 / z }, w, h, inset);
    refresh();
  };
  // ---- the group's bar: delete, duplicate, recolour, to the front (each one undo step)
  const deleteSel = () => {
    const sel = selRef.current;
    if (!sel || grp.current) return;
    const ids = new Set(sel.ids);
    const imgs = new Set(sel.imgs);
    const sb = strokes.current.filter((x) => ids.has(x.id));
    const ib = images.current.filter((m) => imgs.has(m.id));
    if (!sb.length && !ib.length) return;
    strokes.current = strokes.current.filter((x) => !ids.has(x.id));
    if (ib.length) images.current = images.current.filter((m) => !imgs.has(m.id));
    commit({ type: "group", sb, sa: [], ib, ia: [] });
    send({ t: "batch", ms: [...(sb.length ? [{ t: "del" as const, ids: sb.map((x) => x.id) }] : []), ...(ib.length ? [{ t: "imgdel" as const, ids: ib.map((m) => m.id) }] : [])] });
    clearSel();
    requestDraw();
  };
  /** A copy a little down and to the right, selected and ready to drag. */
  const duplicateSel = () => {
    const sel = selRef.current;
    if (!sel || grp.current) return;
    const d = 24 / cam.current.z;
    const t: Xf = { dx: d, dy: d, k: 1, ax: 0, ay: 0 };
    const ids = new Set(sel.ids);
    const imgs = new Set(sel.imgs);
    const sb = strokes.current.filter((x) => ids.has(x.id));
    const ibAll = images.current.filter((m) => imgs.has(m.id));
    // A picture still uploading has no web address yet: it can't be copied to the other device.
    const ib = ibAll.filter((m) => !m.url.startsWith("blob:"));
    if (!sb.length && !ib.length) return;
    // The copies were "written" now, with the same gaps between them (so they still group alike).
    const lastAt = Math.max(0, ...sb.map((x) => x.at ?? 0));
    const shift = lastAt ? Date.now() - lastAt : 0;
    const newIds = new Map<string, string>();
    const sa = sb.map((x) => {
      const id = newId();
      newIds.set(x.id, id);
      return { ...xformStroke(x, t), id, ...(x.at !== undefined ? { at: x.at + shift } : {}) };
    });
    const ia = ib.map((m) => ({ ...xformImage(m, t), id: newId() }));
    strokes.current = [...strokes.current, ...sa];
    if (ia.length) images.current = [...images.current, ...ia];
    commit({ type: "group", sb: [], sa, ib: [], ia });
    send({ t: "batch", ms: [...sa.map((x): BoardMsg => ({ t: "add", s: packStroke(x) })), ...ia.map((m): BoardMsg => ({ t: "img", m }))] });
    const seed = sel.grow ? newIds.get(sel.grow.seed) : undefined;
    setSel({ ids: sa.map((x) => x.id), imgs: ia.map((m) => m.id), grow: seed && sel.grow ? { seed, level: sel.grow.level } : undefined });
    if (ib.length < ibAll.length) flash("A picture still uploading was left out. Copy it once it's up.");
    requestDraw();
  };
  /** Every stroke in the group takes this ink (highlighter stays yellow; pictures are left alone). */
  const colorSelAll = (c: string) => {
    const sel = selRef.current;
    if (!sel || grp.current) return;
    const ids = new Set(sel.ids);
    const sb = strokes.current.filter((x) => ids.has(x.id) && !(x.hl && x.kind !== "text") && x.color !== c);
    if (!sb.length) return;
    const sa = sb.map((x) => ({ ...x, color: c }));
    const changed = new Set(sb.map((x) => x.id));
    strokes.current = [...strokes.current.filter((x) => !changed.has(x.id)), ...sa];
    commit({ type: "group", sb, sa, ib: [], ia: [] });
    send({ t: "batch", ms: sa.map((x): BoardMsg => ({ t: "add", s: packStroke(x) })) });
    syncSel();
    requestDraw();
  };
  /** In front of everything else (the other device stacks it the same). */
  const frontSel = () => {
    const sel = selRef.current;
    if (!sel || grp.current) return;
    const ids = new Set(sel.ids);
    const imgs = new Set(sel.imgs);
    const sb = strokes.current.filter((x) => ids.has(x.id));
    const ib = images.current.filter((m) => imgs.has(m.id));
    if (!sb.length && !ib.length) return;
    const sa = sb.map((x) => ({ ...x }));
    const ia = ib.map((m) => ({ ...m }));
    strokes.current = [...strokes.current.filter((x) => !ids.has(x.id)), ...sa];
    if (ib.length) images.current = [...images.current.filter((m) => !imgs.has(m.id)), ...ia];
    commit({ type: "group", sb, sa, ib, ia });
    send({ t: "batch", ms: [...sa.map((x): BoardMsg => ({ t: "add", s: packStroke(x) })), ...ia.filter((m) => !m.url.startsWith("blob:")).map((m): BoardMsg => ({ t: "img", m }))] });
    syncSel();
    requestDraw();
  };
  /** The group's Move grip and corners (page elements, so they work with any tool). */
  const onGroupHandleDown = (e: React.PointerEvent<HTMLElement>) => {
    // A resting palm, or a touch while the pen is in use, does nothing (as on the board).
    if (e.pointerType === "touch" && (pens.current.active || Date.now() - pens.current.lastAt < PALM_LOCK_MS || e.width > PALM_SIZE_PX || e.height > PALM_SIZE_PX)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!selRef.current || grp.current || gesture.current.mode) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    const [sx, sy] = local(e);
    startGroupDrag(e.pointerId, sx, sy, (e.currentTarget.dataset.k as GroupDrag["kind"]) || "move", e.pointerType, { viaHandle: true });
    // Its lift is also heard on the window: if the handle leaves the page mid-drag (the bar changed),
    // its own lift would never arrive and the drag would stay stuck.
    const pid = e.pointerId;
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const d = grp.current;
      if (d?.viaHandle && d.pid === pid) endGroupDrag(ev.type === "pointercancel");
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const onGroupHandleMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = grp.current;
    if (!d || !d.viaHandle || d.pid !== e.pointerId) return;
    const [sx, sy] = local(e);
    moveGroupDrag(sx, sy);
  };
  const onGroupHandleUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = grp.current;
    if (!d || !d.viaHandle || d.pid !== e.pointerId) return;
    endGroupDrag(e.type === "pointercancel");
  };

  // The group's frame and bar follow it every frame (pan, zoom, a drag, the other device), set
  // straight on the page elements; and the lifted layer is kept in place and sharpened once a zoom
  // or a scale settles. Its loop runs after the board's own drawing in each frame (it was booked
  // after it), so the layer only goes once the board shows the group in its new place.
  const groupFrameRef = useRef<HTMLDivElement>(null);
  const groupBarRef = useRef<HTMLDivElement>(null);
  const groupFitRef = useRef<HTMLButtonElement>(null);
  // A lone straight line: two end handles and a soft halo along it instead of a frame.
  const lineEndARef = useRef<HTMLSpanElement>(null);
  const lineEndBRef = useRef<HTMLSpanElement>(null);
  const haloRef = useRef<SVGLineElement>(null);
  const frameTick = useRef<() => void>(() => {});
  const placed = useRef({ frame: "", bar: { w: 0, h: 0, key: "" }, typing: { w: 0, h: 0, key: "" } });
  /** A context bar's spot: centred over the frame, its bottom 12 px above it (or its top 12 px below
   * it when there is no room under the top bar), kept on screen and clear of the rail. Whole pixels. */
  const barSpot = (cx: number, top: number, bottom: number, bw: number, bh: number) => {
    const { w: sw, h: sh } = screen.current;
    const minY = 76;
    const maxY = sh - bh - (lead ? 12 : 76);
    const above = top - 12 - bh;
    const by = Math.round(Math.min(maxY, above >= minY ? above : Math.max(minY, bottom + 12)));
    const bx = Math.round(Math.min(Math.max(lead ? 76 : 12, cx - bw / 2), sw - bw - 12));
    return { bx, by };
  };
  /** The selection's frame (or a line's end handles and halo) and its bar, where it is now. */
  const placeSel = () => {
    const el = groupFrameRef.current;
    const bar = groupBarRef.current;
    const P = placed.current;
    if (!bar || !selRef.current) return;
    const { w: sw, h: sh } = screen.current;
    const c = cam.current;
    const line = selLineStroke();
    let fx: number, fy: number, fw: number, fh: number;
    if (line?.kind === "line") {
      // The line as it is now (moved along while it is dragged).
      const t = lift.current && !lift.current.landing && !lift.current.remote ? lift.current.t : XF0;
      const [p, q] = [line.pts[0], line.pts[line.pts.length - 1]];
      const sp = (pt: Pt) => [((t.ax + (pt[0] - t.ax) * t.k + t.dx) - c.x) * c.z, ((t.ay + (pt[1] - t.ay) * t.k + t.dy) - c.y) * c.z];
      const [ax, ay] = sp(p);
      const [bx2, by2] = sp(q);
      const a = lineEndARef.current;
      const b = lineEndBRef.current;
      if (a) a.style.transform = `translate(${Math.round(ax) - 22}px, ${Math.round(ay) - 22}px)`;
      if (b) b.style.transform = `translate(${Math.round(bx2) - 22}px, ${Math.round(by2) - 22}px)`;
      const halo = haloRef.current;
      if (halo) {
        halo.setAttribute("x1", `${ax}`);
        halo.setAttribute("y1", `${ay}`);
        halo.setAttribute("x2", `${bx2}`);
        halo.setAttribute("y2", `${by2}`);
        halo.setAttribute("stroke-width", `${line.size * 0.95 * t.k * c.z + 8}`);
      }
      fx = Math.min(ax, bx2);
      fy = Math.min(ay, by2);
      fw = Math.abs(bx2 - ax);
      fh = Math.abs(by2 - ay);
    } else {
      const r = selScreenBox();
      if (!r) return;
      // 8 px clear of the content all round (the same at any zoom), never tiny, on whole pixels.
      // (Even sizes, so the frame's centre, and the bar centred on it, are whole pixels too.)
      fw = Math.round(Math.max(24, r.w + 16));
      fh = Math.round(Math.max(24, r.h + 16));
      fw += fw % 2;
      fh += fh % 2;
      fx = Math.round(r.x + r.w / 2 - fw / 2);
      fy = Math.round(r.y + r.h / 2 - fh / 2);
      const key = `${fx}|${fy}|${fw}|${fh}`;
      // (A new frame element for a new selection starts unplaced.)
      if (el && el.style.left === "-9999px") P.frame = "";
      if (el && key !== P.frame) {
        P.frame = key;
        Object.assign(el.style, { left: `${fx}px`, top: `${fy}px`, width: `${fw}px`, height: `${fh}px` });
      }
    }
    // Partly off the screen: its bar offers Fit (a picture always has it).
    const partOff = fx < 0 || fy < 0 || fx + fw > sw || fy + fh > sh;
    const fit = groupFitRef.current;
    if (fit && !selectedRef.current && fit.style.display !== (partOff ? "flex" : "none")) fit.style.display = partOff ? "flex" : "none";
    // Its size is read only when what it shows changes, not on every frame of a drag. An odd width
    // gets one more pixel of padding, so its centre lands on a whole pixel.
    const ui = (selUI?.key ?? "") + bar.childElementCount + (partOff ? "f" : "") + (selUI?.color ?? "") + (selText ? `${selText.bold}${selText.italic}${selText.hl}` : "");
    if (P.bar.key !== ui) {
      bar.style.paddingRight = "";
      if (bar.offsetWidth % 2) bar.style.paddingRight = "5px";
      P.bar = { w: bar.offsetWidth, h: bar.offsetHeight, key: ui };
    }
    const { bx, by } = barSpot(fx + fw / 2, fy, fy + fh, P.bar.w, P.bar.h);
    const off = fx + fw < 0 || fy + fh < 0 || fx > sw || fy > sh;
    const tf = `translate(${bx}px, ${by}px)`;
    if (bar.style.transform !== tf) bar.style.transform = tf;
    const vis = off ? "hidden" : "visible";
    if (bar.style.visibility !== vis) bar.style.visibility = vis;
  };
  /** The typing bar: the same rule, around the open text box. */
  const typingBarRef = useRef<HTMLDivElement>(null);
  const placeTypingBar = () => {
    const bar = typingBarRef.current;
    const t = typing;
    if (!bar || !t) return;
    const P = placed.current;
    const key = `${t.bold}${t.italic}${t.hl}${t.color}`;
    if (P.typing.key !== key) {
      bar.style.paddingRight = "";
      if (bar.offsetWidth % 2) bar.style.paddingRight = "5px";
      P.typing = { w: bar.offsetWidth, h: bar.offsetHeight, key };
    }
    const { bx, by } = barSpot(t.x + t.wPx / 2, t.y - 4, t.y + t.hPx + 4, P.typing.w, P.typing.h);
    const tf = `translate(${bx}px, ${by}px)`;
    if (bar.style.transform !== tf) bar.style.transform = tf;
  };
  useEffect(() => {
    frameTick.current = () => {
      // The view, if this device leads it (at most 30 a second, in step with the screen).
      viewFrame();
      // The side button turned a lasso into rubbing out (that replaces the gesture): its outline goes.
      if (gestureLasso.current && !gesture.current.lasso) {
        gestureLasso.current = false;
        hideLasso();
      }
      const L = lift.current;
      if (L) {
        const ly = canvasRef.current ? layers.get(canvasRef.current) : undefined;
        if (L.landing) {
          if ((ly && ly.strokes === strokes.current && ly.images === images.current) || performance.now() - L.landingAt > 400) dropLift();
        } else {
          if (!L.ready && ly && ly.strokes === shownStrokes() && ly.images === shownImages()) L.ready = true;
          // The laptop: glide towards where the tablet says it is (its messages come ~15 times a second).
          if (L.goal) {
            const g = L.goal;
            const e = 0.45;
            const near = Math.abs(g.dx - L.t.dx) * cam.current.z < 0.3 && Math.abs(g.dy - L.t.dy) * cam.current.z < 0.3 && Math.abs(g.k - L.t.k) < 0.0005;
            L.t = near ? g : { dx: L.t.dx + (g.dx - L.t.dx) * e, dy: L.t.dy + (g.dy - L.t.dy) * e, k: L.t.k + (g.k - L.t.k) * e, ax: g.ax, ay: g.ay };
          }
          const cm = cam.current;
          const key = `${cm.x}|${cm.y}|${cm.z}|${L.t.k}`;
          const now = performance.now();
          if (key !== L.lastKey) {
            L.lastKey = key;
            L.movedAt = now;
          } else if ((cm.z !== L.zR || L.t.k !== L.kR) && now - L.movedAt > SETTLE_MS) renderLift(); // a zoom or scale settled: drawn sharp
          placeLift();
        }
      }
      placeSel();
      placeTypingBar();
    };
  });
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      frameTick.current();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = local(e);
    const isPen = e.pointerType === "pen";
    const isMouse = e.pointerType === "mouse";
    const isTouch = e.pointerType === "touch";
    logPen(e, "down");
    // A burst of arrow-key nudges still waiting lands first.
    landNudge();
    // A tap that stops the board sliding is only that: it never selects.
    const wasGliding = !!glide.current;
    stopGlide();

    lastPointer.current = e.pointerType;
    if (isPen) {
      air.current.contactAt = performance.now();
      // This browser does pass on a stroke that starts with the button held: holding erases, as
      // before, and the tool that was in hand comes straight back.
      if (isPenEraser(e)) {
        const a = air.current;
        a.holdWorks = true;
        if (a.before && tool === "eraser" && performance.now() - a.at < 4000) setTool(a.before);
        a.before = null;
      }
      pens.current.seen = true;
      pens.current.active = true;
      // A hand already resting on the screen must not pan the board under the pen.
      touches.current.clear();
      pinch.current = null;
      tap1.current = null;
      pens.current.lastAt = Date.now();
      notePen();
    }

    // Palm rejection: while the pen is down or was just near the screen, touches do nothing.
    if (isTouch) {
      if (pens.current.active || Date.now() - pens.current.lastAt < PALM_LOCK_MS) return;
      if (e.width > PALM_SIZE_PX || e.height > PALM_SIZE_PX) return; // a resting hand, not a fingertip
      // A second finger while one finger moves the selection: not moved yet, it stays where it is;
      // moved, it lands where it is. Either way the two fingers then pinch.
      const held = gesture.current;
      const g1 = grp.current;
      if (held.mode === "group" && g1?.touch && held.id !== e.pointerId) {
        const at = { x: g1.lx, y: g1.ly, t: performance.now() };
        endGroupDrag(!g1.moved);
        touches.current.set(held.id, at);
      }
      // One finger inside the selection moves it, with any tool (a big one pans: its Move grip moves
      // it). A finger anywhere else pans, exactly as before.
      if (selRef.current && touches.current.size === 0 && !gesture.current.mode && insideSelFrame(sx, sy, "touch") && !selIsBig()) {
        startGroupDrag(e.pointerId, sx, sy, "move", "touch", tapOpts());
        capture(canvasRef.current, e.pointerId);
        return;
      }
      tap1.current = touches.current.size === 0 && !wasGliding ? { id: e.pointerId, x: sx, y: sy, at: performance.now() } : null;
      if (!fingerDraws || pens.current.seen) {
        touches.current.set(e.pointerId, { x: sx, y: sy, t: performance.now() });
        velocity.current = { vx: 0, vy: 0 };
        panTrip.current = { dist: 0, at: performance.now() };
        if (touches.current.size === 2) {
          const [p1, p2] = [...touches.current.values()];
          pinch.current = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2 };
          tap2.current = { at: performance.now(), moved: 0 };
        }
        if (touches.current.size === 1 && !gesture.current.mode) armLift(e.pointerId);
        capture(canvasRef.current, e.pointerId);
        return;
      }
    }

    if (isMouse && (e.button === 1 || spaceDown.current)) {
      gesture.current = { mode: "pan", id: e.pointerId, erased: [], straightened: false };
      touches.current.set(e.pointerId, { x: sx, y: sy, t: performance.now() });
      capture(canvasRef.current, e.pointerId);
      return;
    }
    if (isMouse && e.button !== 0 && e.button !== 2) return;
    // The pen always wins: a finger (or a handle) moving the selection lets go, and the move is kept
    // (a press that never moved is just let go; it never opens typed words).
    if (isPen && grp.current) endGroupDrag(!grp.current.moved);
    if (gesture.current.mode) return;

    // Typing: the pen or mouse puts the text box here (focus stays in it).
    if (tool === "text" && !isPenEraser(e)) {
      e.preventDefault();
      // On words already there: they are selected, a drag moves them, and a tap on them once
      // selected opens them to edit (on lifting). An open box closes first, so pressing just around
      // it picks it up too.
      if (typingRef.current) commitTyping(true);
      // Inside the selection: it moves (a tap there opens selected words, or picks up more writing).
      if (selRef.current && insideSelFrame(sx, sy, e.pointerType)) {
        startGroupDrag(e.pointerId, sx, sy, "move", e.pointerType, tapOpts());
        capture(canvasRef.current, e.pointerId);
        return;
      }
      // On other typed words: they are selected, and a drag moves them.
      const word = strokeUnder(sx, sy, false);
      if (word) {
        setSel({ ids: [word.id], imgs: [] });
        startGroupDrag(e.pointerId, sx, sy, "move", e.pointerType);
        capture(canvasRef.current, e.pointerId);
        return;
      }
      // Keep this pointer, so its lift always comes back here (and the pen is never left "down").
      capture(canvasRef.current, e.pointerId);
      // With something selected, a tap on empty board only lets it go (no new text box, no keyboard).
      if (selRef.current) clearSel();
      else startTyping(sx, sy);
      return;
    }

    capture(canvasRef.current, e.pointerId);
    const [wx, wy] = toWorld(cam.current, sx, sy);

    if (isPenEraser(e) || tool === "eraser") {
      selectText(null);
      selectLine(null);
      lastErase.current = null;
      setInking(true);
      gesture.current = { mode: "erase", id: e.pointerId, erased: [], straightened: false };
      moveEraser(sx, sy);
      eraseAt(sx, sy);
      return;
    }

    // The pen or mouse inside the selection moves it, with any tool (a tap there opens selected words,
    // or picks up more writing: the line, then the block).
    // (The S Pen with the Pen or Line tool takes hold only ON something selected, never in the gap
    // around it: Hamza writes right beside things all the time. Its tap never picks up more.)
    const penWrites = isPen && (tool === "pen" || tool === "line");
    if (selRef.current && (isPen || isMouse) && insideSelFrame(sx, sy, e.pointerType) && (!penWrites || onSelMember(sx, sy))) {
      startGroupDrag(e.pointerId, sx, sy, "move", e.pointerType, penWrites ? { tapEdits: !!selTextRef.current } : tapOpts());
      return;
    }

    if (tool === "move") {
      // The Select tool, with the pen or mouse: typed text, a ruled line or shape, handwriting (its
      // word) or a picture under the press is picked up and moves with it. Empty board, or a page that
      // fills most of the screen: a lasso straight away.
      const sel = grabAt(sx, sy, e.pointerType);
      if (sel) {
        setSel(sel);
        startGroupDrag(e.pointerId, sx, sy, "move", e.pointerType);
        requestDraw();
        return;
      }
      void wx;
      void wy;
      startLasso(e.pointerId, sx, sy, false);
      return;
    }

    // Typed words and the pen, line and axes tools. The S Pen always writes, so it lets selected
    // words go and carries on. The mouse moves the selected words (and a click on them again opens
    // them); a plain click on other typed words selects them, and a plain click anywhere else only
    // lets the selection go (see the lift). A drag draws as usual.
    let click: { text: string | null; at: number; line?: string | null; pen?: boolean; x: number; y: number } | undefined;
    if (isMouse && e.button === 0 && (tool === "pen" || tool === "line")) {
      const word = strokeUnder(sx, sy, false);
      const ruled = word ? undefined : lineUnder(sx, sy, "mouse");
      if (word || ruled || selRef.current) click = { text: word?.id ?? null, line: ruled?.id ?? null, at: performance.now(), x: sx, y: sy };
    } else {
      // The pen writing away from the selection lets it go, and writes at once (writing on a selected
      // picture keeps it selected: see below).
      if (selRef.current && !selectedRef.current) clearSel();
      // The S Pen with the pen or line tool: a clean tap on a straight ruled line selects it (decided
      // when the pen lifts, and no dot is left); a stroke that moves writes as ever, even when it
      // starts on a line.
      if (isPen && e.button === 0 && (tool === "pen" || tool === "line")) {
        const ruled = lineUnder(sx, sy, "pen");
        if (ruled) click = { text: null, line: ruled.id, at: performance.now(), pen: true, x: sx, y: sy };
      }
    }

    // Writing away from the selected picture lets it go (writing on it keeps it selected).
    if (selectedRef.current) {
      const sel = images.current.find((m) => m.id === selectedRef.current);
      if (!sel || wx < sel.x || wx > sel.x + sel.w || wy < sel.y || wy > sel.y + sel.h) select(null);
    }
    const p: Pt = [wx, wy, isPen ? e.pressure || 0.5 : 0.5];
    // Width stays the same on screen at any zoom.
    const w = size / cam.current.z;
    // White ink would vanish on a white page: on a picture it writes in charcoal.
    const ink = color === COLORS[0].value && imageAt(images.current, wx, wy) ? "#1B1E21" : color;
    if (tool === "axes") {
      // Drag from where the y axis starts (top left) to the end of the x axis; a tap gives a standard size.
      current.current = { id: newId(), kind: "form", form: "axes", color: ink, size: w, pts: [p, p] };
      setInking(true);
      gesture.current = { mode: "box", id: e.pointerId, erased: [], straightened: false };
    } else if (tool === "line") {
      // Solid or Dotted, as chosen beside the Line tool. (A pen stroke that is straightened is always solid.)
      current.current = { id: newId(), kind: "line", color: ink, size: w, pts: [p, p], ...(lineDottedRef.current ? { dotted: true } : {}) };
      setInking(true);
      gesture.current = { mode: "line", id: e.pointerId, erased: [], straightened: true, click };
    } else {
      current.current = marker ? { id: newId(), kind: "ink", color: ink, size: (size * 2 + 16) / cam.current.z, hl: true, pts: [p] } : { id: newId(), kind: "ink", color: ink, size: w, pts: [p] };
      lastRaw.current = p;
      setInking(true);
      gesture.current = { mode: "draw", id: e.pointerId, erased: [], straightened: false, click };
      hold.current.path = 0;
      armHold(sx, sy);
      // Held still a moment instead: on writing it is picked up, on empty board a lasso starts. (The pen
      // only: never the highlighter, whose held sweep is a highlight, nor the Line tool.)
      if (tool === "pen" && !marker) armLasso(e.pointerId, sx, sy, e.pointerType);
    }
    requestDraw();
  };

  // The S Pen's side button, pressed while the pen is just above the screen: the eraser comes on,
  // and the next press gives the tool back. (Chrome on Android keeps every stroke that STARTS with
  // the button held for itself, as a text selection, so the board never hears "hold and rub".
  // A press in the air does arrive.) Where a browser does pass held strokes on, holding still
  // erases as before and this stands aside.
  const air = useRef<{ held: boolean; at: number; contactAt: number; before: Tool | null; holdWorks: boolean }>({ held: false, at: 0, contactAt: 0, before: null, holdWorks: false });
  const airTold = useRef(false);
  const airButton = (held: boolean, sx: number, sy: number) => {
    const a = air.current;
    const now = performance.now();
    if (held && !a.held && !a.holdWorks && now - a.contactAt > 60 && now - a.at > 90) {
      a.at = now;
      if (tool === "eraser") {
        pickTool(a.before ?? "pen");
        a.before = null;
      } else {
        a.before = tool;
        pickTool("eraser");
        moveEraser(sx, sy);
        // Said once: after that the ring under the pen says it, and nothing redraws for a message.
        if (!airTold.current) {
          airTold.current = true;
          flash("Eraser on. Press the pen button again to write.");
        }
      }
      a.held = held;
      return true;
    }
    a.held = held;
    return false;
  };

  // Set once endGesture exists (below), for a pen whose lift came late.
  const endLate = useRef<(e: React.PointerEvent<HTMLCanvasElement>) => void>(() => {});
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = local(e);
    if (e.pointerType === "pen") {
      pens.current.lastAt = Date.now();
      notePen(); // hovering counts: keeps palms locked out
      // Hovering over the board: no pointer on the laptop (Hamza turned it off; it showed as a marker there).
      if (HOVER_POINTER && lead && e.buttons === 0) {
        const t = performance.now();
        if (t - pointerSent.current > 50) {
          pointerSent.current = t;
          const [px, py] = toWorld(cam.current, sx, sy);
          send({ t: "pt", x: Math.round(px * 10) / 10, y: Math.round(py * 10) / 10 });
        }
      }
      // The side button pressed in the air (see airButton).
      if (!pens.current.active && !gesture.current.mode && airButton(e.pressure === 0 && (e.buttons !== 0 || isPenEraser(e)), sx, sy)) return;
    }

    // The pen moved off its spot: no lasso (it is writing).
    const arm = lassoArm.current;
    if (arm && arm.pid === e.pointerId && Math.hypot(sx - arm.x, sy - arm.y) > (LASSO_SLOP[arm.pt] ?? 6)) cancelLasso();

    // Touch pan / pinch.
    if (touches.current.has(e.pointerId)) {
      // The pen is writing: a touch is the resting hand, never a pan.
      if (pens.current.active) return;
      const prev = touches.current.get(e.pointerId)!;
      const now = performance.now();
      touches.current.set(e.pointerId, { x: sx, y: sy, t: now });
      if (tap2.current) tap2.current.moved += Math.hypot(sx - prev.x, sy - prev.y);
      // This hand leads the view (the laptop, with an older tablet: only looks around).
      takeView();
      if (touches.current.size === 1 || gesture.current.mode === "pan") {
        const dx = (sx - prev.x) * PAN_GAIN;
        const dy = (sy - prev.y) * PAN_GAIN;
        cam.current = { ...cam.current, x: cam.current.x - dx / cam.current.z, y: cam.current.y - dy / cam.current.z };
        const dt = Math.max(8, now - prev.t);
        velocity.current = { vx: dx / dt, vy: dy / dt };
        panTrip.current = { dist: panTrip.current.dist + Math.hypot(dx, dy), at: now };
      } else if (touches.current.size === 2 && pinch.current) {
        const [p1, p2] = [...touches.current.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        // (Two contacts reported on the very same spot would divide nothing by nothing and blank
        // the board: that frame is skipped.)
        if (d > 0 && pinch.current.d > 0) {
          let c = zoomAt(cam.current, d / pinch.current.d, cx, cy);
          c = { ...c, x: c.x - ((cx - pinch.current.cx) * PAN_GAIN) / c.z, y: c.y - ((cy - pinch.current.cy) * PAN_GAIN) / c.z };
          cam.current = c;
        }
        pinch.current = { d, cx, cy };
        velocity.current = { vx: 0, vy: 0 };
      }
      refresh();
      return;
    }

    const g = gesture.current;
    if (g.id !== e.pointerId || !g.mode) {
      if (tool === "eraser" && e.pointerType !== "touch") moveEraser(sx, sy);
      return;
    }

    // Laptop: the mouse button was let go where this page never heard it (Alt+Tab in the middle of a
    // drag), and the line, eraser or picture kept following the mouse with no button held. Ends here.
    if (e.pointerType === "mouse" && e.buttons === 0) {
      endLate.current(e);
      return;
    }

    // The pen hovering again but its lift never came (some tablets report it late): the move lands now.
    if (e.pointerType === "pen" && e.buttons === 0 && g.mode === "group") {
      endLate.current(e);
      return;
    }
    if (g.mode === "group") {
      moveGroupDrag(sx, sy);
      return;
    }

    // The pen is hovering again but the browser never said it lifted (some tablets report the lift
    // late, or only at the next touch): finish the stroke now, so the laptop gets it at once.
    if (e.pointerType === "pen" && e.buttons === 0 && (g.mode === "draw" || g.mode === "line" || g.mode === "box")) {
      endLate.current(e);
      return;
    }

    // Side button pressed after the pen touched down: erase from here on.
    if ((g.mode === "draw" || g.mode === "line") && e.pointerType === "pen" && isPenEraser(e)) {
      logPen(e, "move");
      switchToErase(e.pointerId, sx, sy);
      return;
    }

    if (g.mode === "erase") {
      moveEraser(sx, sy);
      for (const ev of coalesced(e.nativeEvent)) {
        const [x, y] = local(ev);
        eraseAt(x, y);
      }
      return;
    }

    const [wx, wy] = toWorld(cam.current, sx, sy);

    const s = current.current;
    if (!s) return;

    if (g.mode === "box") {
      s.pts = [s.pts[0], [wx, wy, 0.5]];
      requestDraw();
      sendLive();
      return;
    }
    // A snapped box, oval or set of axes stays put until the pen lifts.
    if (s.kind === "rect" || s.kind === "ellipse" || s.kind === "form") return;
    if (g.mode === "line" || (g.mode === "draw" && g.straightened)) {
      const a = s.pts[0];
      // Free: the line goes at exactly the angle drawn, and only settles on exactly level or upright
      // within 3 degrees of it. Shift with the mouse: steps of 15 degrees, on purpose.
      const b = snapLine(a, [wx, wy, 0.5], 3, e.pointerType === "mouse" && e.shiftKey ? 15 : 0);
      s.pts = [a, b];
      setAngle({ x: (b[0] - cam.current.x) * cam.current.z, y: (b[1] - cam.current.y) * cam.current.z, deg: lineAngle(a, b) });
    } else {
      for (const ev of coalesced(e.nativeEvent)) {
        const [x, y] = local(ev);
        const [px, py] = toWorld(cam.current, x, y);
        const pr = e.pointerType === "pen" ? ev.pressure || 0.5 : 0.5;
        const last = s.pts[s.pts.length - 1];
        lastRaw.current = [px, py, pr];
        const next = smoothPoint(last, [px, py, pr], steadyFor(Math.hypot(px - last[0], py - last[1]) * cam.current.z));
        hold.current.path += Math.hypot(next[0] - last[0], next[1] - last[1]) * cam.current.z;
        s.pts.push(next);
      }
      // Where the pen is about to be (the tablet's own guess): drawn ahead of it, never saved.
      // Off: the guessed points flickered at the pen tip (the writing looked like it blinked).
      const ahead = PREDICT_AHEAD ? (e.nativeEvent.getPredictedEvents?.() ?? []) : [];
      predicted.current = ahead.slice(0, 3).map((ev) => {
        const [x, y] = local(ev);
        const [px, py] = toWorld(cam.current, x, y);
        return [px, py, e.pointerType === "pen" ? ev.pressure || 0.5 : 0.5] as Pt;
      });
      // A lasso: its outline follows the pen (nothing is drawn on the board, nothing is sent).
      if (g.lasso) {
        drawLasso();
        return;
      }
      // Restart the "hold still" timer whenever the pen really moves.
      if (Math.hypot(sx - hold.current.x, sy - hold.current.y) > HOLD_STILL_PX) armHold(sx, sy);
    }
    requestDraw();
    sendLive();
  };

  /**
   * After a stroke lands: a clear T (a bar and an upright, in either order)
   * becomes a clean T account; a big hand-drawn box or circle becomes a clean
   * one; a long, clearly straight line straightens. Undo brings the hand
   * version back. Small strokes (writing) are never touched.
   */
  const recognise = (s: Stroke): boolean => {
    const z = cam.current.z;
    const now = Date.now();
    // Only the stroke drawn just before, a few seconds ago, can pair up into a T.
    const prev = strokes.current[strokes.current.length - 2];
    recentLines.current = recentLines.current.filter((l) => now - l.at < 6000 && l.id === prev?.id);
    const ends: [Pt, Pt] | null = s.kind === "line" ? [s.pts[0], s.pts[1]] : s.kind === "ink" ? straightOf(s.pts) : null;
    const len = ends ? Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]) * z : 0;
    const dir = ends && len >= 40 ? lineDir(ends[0], ends[1]) : null;

    const swap = (before: Stroke[], after: Stroke, note?: string) => {
      if (s.at !== undefined) after.at = s.at;
      strokes.current = [...strokes.current.filter(removeIds(before)), after];
      const top = undoStack.current[undoStack.current.length - 1];
      if (before.length === 1 && top?.type === "add" && top.s.id === before[0].id) {
        // One stroke tidied: it is still one step, so one undo removes it.
        undoStack.current[undoStack.current.length - 1] = { type: "add", s: after };
        persist();
        syncMeta();
      } else commit({ type: "replace", before, after: [after] });
      recentLines.current = recentLines.current.filter((l) => !before.some((b) => b.id === l.id));
      // One message: the old ones go and the new one appears together. The stroke just drawn was never
      // sent as final, but its live preview was, so it's removed by name too (no 2-second ghost).
      const old = [...new Set([...before.map((b) => b.id), s.id])];
      send({ t: "batch", ms: [...(old.length ? [{ t: "del" as const, ids: old }] : []), { t: "add" as const, s: packStroke(after) }] });
      requestDraw();
      try {
        navigator.vibrate?.(10);
      } catch {}
      if (note) flash(note);
    };

    // Highlighter: a band drawn nearly straight is made straight (and level, if nearly so). Nothing else.
    if (s.hl) {
      const t = s.kind === "ink" ? tidyStroke(s.pts, z) : null;
      if (t && t.kind !== "rect" && t.kind !== "ellipse" && t.kind !== "axes") {
        swap([s], { id: s.id + "l", kind: "line", color: s.color, size: s.size, hl: true, pts: [t.a, t.b] });
        return true;
      }
      return false;
    }
    // An arrow, drawn the usual way: a line, then a small "V" on its end within a few seconds.
    // The two become one clean arrow (undo gives the hand-drawn pair back).
    const sincePrev = now - lastDrawnAt.current;
    lastDrawnAt.current = now;
    if (s.kind === "ink" && prev && !prev.hl && sincePrev < 4000 && (prev.kind === "line" || prev.kind === "ink")) {
      const shaft: [Pt, Pt] | null = prev.kind === "line" ? [prev.pts[0], prev.pts[1]] : straightOf(prev.pts, 0.12, 1.3);
      const end = shaft ? arrowHeadOn(s.pts, shaft[0], shaft[1], z) : null;
      if (shaft && end) {
        const [tail, tip] = end === "b" ? shaft : [shaft[1], shaft[0]];
        const size = prev.kind === "line" ? prev.size : prev.size * Math.min(1.25, Math.max(0.6, penWeight(prev.pts) / 0.95));
        swap([prev, s], { id: newId(), kind: "line", color: prev.color, size, pts: [[tail[0], tail[1], 0.5], [tip[0], tip[1], 0.5]], arrow: true, ...(prev.dotted ? { dotted: true } : {}) });
        return true;
      }
    }

    if (ends && dir) {
      for (let i = recentLines.current.length - 1; i >= 0; i--) {
        const o = recentLines.current[i];
        if (o.dir === dir) continue;
        const other = strokes.current.find((x) => x.id === o.id);
        // An upright and a base meeting at the bottom left: diagram axes.
        const ax = dir === "v" ? axesOfPair(o.ends, ends) : axesOfPair(ends, o.ends);
        if (ax && other && (ax.b[0] - ax.a[0]) * z >= 120 && (ax.b[1] - ax.a[1]) * z >= 90) {
          swap([other, s], { id: newId(), kind: "form", form: "axes", color: other.color, size: Math.max(other.size, s.size), pts: [ax.a, ax.b] }, "Axes");
          return true;
        }
        const t = dir === "v" ? tAccountOf(o.ends, ends) : tAccountOf(ends, o.ends);
        // T account size only, so a capital T in a heading stays handwriting.
        if (!t || !other || (t.b[0] - t.a[0]) * z < 150 || (t.b[1] - t.a[1]) * z < 90) continue;
        swap([other, s], { id: newId(), kind: "form", form: "t", color: other.color, size: Math.max(other.size, s.size), pts: [t.a, t.b] }, "T account");
        return true;
      }
      recentLines.current.push({ id: s.id, ends, dir, at: now });
    }

    if (s.kind !== "ink") return false;
    const tidy = tidyStroke(s.pts, z);
    if (!tidy) return false;
    // The clean version is drawn the same weight as the hand-drawn stroke it replaces.
    const weight = (k: number) => s.size * Math.min(1.25, Math.max(0.6, penWeight(s.pts) / k));
    if (tidy.kind === "rect" || tidy.kind === "ellipse") {
      // Circling or boxing an answer keeps the hand drawn loop: only an empty loop snaps.
      const empty =
        !strokes.current.some((o) => {
          if (o.id === s.id) return false;
          const b = strokeBox(o);
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          return cx > tidy.a[0] && cx < tidy.b[0] && cy > tidy.a[1] && cy < tidy.b[1];
        }) && !images.current.some((m) => m.x < tidy.b[0] && m.x + m.w > tidy.a[0] && m.y < tidy.b[1] && m.y + m.h > tidy.a[1]);
      if (!empty) return false;
      swap([s], { id: newId(), kind: tidy.kind, color: s.color, size: weight(0.9), pts: [tidy.a, tidy.b] });
      return true;
    }
    // An L in one go (down the side, along the bottom): diagram axes.
    if (tidy.kind === "axes") {
      swap([s], { id: newId(), kind: "form", form: "axes", color: s.color, size: weight(0.9), pts: [tidy.a, tidy.b] }, "Axes");
      return true;
    }
    // Long and clearly straight: tidied into a ruled line (underlines, totals), made exactly level
    // or upright when it was drawn nearly so, otherwise at its own angle.
    const line: Stroke = { id: s.id + "l", kind: "line", color: s.color, size: weight(0.95), pts: [tidy.a, tidy.b] };
    swap([s], line);
    // Still counts towards a T, under its new id.
    if (dir) recentLines.current.push({ id: line.id, ends: [line.pts[0], line.pts[1]], dir, at: now });
    return true;
  };

  /**
   * "More room": one tap slides the board up smoothly (the laptop following), like turning to
   * fresh lines in a notebook. Only when asked (Page Down on the laptop): writing at the bottom
   * never moves the board (see AUTO_ROOM).
   */
  const scrolling = useRef(false);
  const moreRoom = () => {
    // The laptop with an older tablet (which leads the view) asks it to make the room; with a two-way
    // tablet it makes the room itself, and leads.
    if (!lead && partner && !peerTwoWay.current) {
      send({ t: "room" });
      return;
    }
    if (scrolling.current) return;
    takeView();
    const { h } = screen.current;
    const from = cam.current.y;
    const to = from + (h * 0.45) / cam.current.z;
    const t0 = performance.now();
    scrolling.current = true;
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 340);
      const ease = 1 - Math.pow(1 - k, 3);
      cam.current = { ...cam.current, y: from + (to - from) * ease };
      refresh();
      if (k < 1) requestAnimationFrame(step);
      else scrolling.current = false;
    };
    requestAnimationFrame(step);
  };
  // The other device took the lead while a hand was moving this board: that hand is let go until it
  // lifts (a finger or mouse pan, a fling, More room or the wheel).
  useEffect(() => {
    yieldHandRef.current = () => {
      const live = touches.current.size > 0 || gesture.current.mode === "pan" || !!glide.current || scrolling.current || performance.now() - lastHandAt.current < 150;
      if (!live) return;
      stopGlide();
      touches.current.clear();
      pinch.current = null;
      tap1.current = null;
      if (gesture.current.mode === "pan") gesture.current = { mode: null, id: -1, erased: [], straightened: false };
    };
  });
  useEffect(() => {
    moreRoomRef.current = moreRoom;
  });

  /**
   * (Switched off with AUTO_ROOM: the board never moves by itself.)
   * Room by itself, only when it's clearly wanted: three or more handwritten strokes in a row end
   * in the bottom band of the screen (lines of writing, not a long diagram line), then the pen
   * rests for a moment and isn't hovering ready to write. Writing elsewhere resets it.
   */
  const bottomInk = useRef<{ times: number[]; timer: ReturnType<typeof setTimeout> | null; tries: number }>({ times: [], timer: null, tries: 0 });
  const watchBottom = (s: Stroke) => {
    if (!AUTO_ROOM || !lead || s.kind !== "ink") return;
    const b = bottomInk.current;
    const { h } = screen.current;
    const z = cam.current.z;
    const box = strokeBox(s);
    const bottomPx = (box.y + box.h - cam.current.y) * z;
    const smallPx = box.h * z < h * 0.12;
    if (bottomPx < h * 0.84 || !smallPx) {
      b.times = [];
      if (b.timer) clearTimeout(b.timer);
      b.timer = null;
      return;
    }
    const now = Date.now();
    b.times = [...b.times.filter((t) => now - t < 25_000), now];
    if (b.times.length < 3) return;
    if (b.timer) clearTimeout(b.timer);
    b.tries = 0;
    const check = () => {
      b.timer = null;
      const last = b.times[b.times.length - 1] ?? 0;
      const busy = gesture.current.mode !== null || Date.now() - pens.current.lastAt < 700 || Date.now() - last < 1500;
      if (busy) {
        // Still writing, or the pen hovers ready to: wait (and give up after a while).
        if (++b.tries < 12) b.timer = setTimeout(check, 500);
        return;
      }
      b.times = [];
      moreRoom();
    };
    b.timer = setTimeout(check, 1500);
  };

  const endGesture = (e: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    logPen(e, cancelled ? "cancel" : "up");
    if (e.pointerType === "pen") {
      air.current.contactAt = performance.now();
      pens.current.active = false;
      pens.current.lastAt = Date.now();
      notePen();
    }
    if (touches.current.has(e.pointerId)) {
      const wasSingle = touches.current.size === 1;
      const t1 = tap1.current;
      tap1.current = null;
      if (t1 && t1.id === e.pointerId && !cancelled && performance.now() - t1.at < 300) {
        const [ex, ey] = local(e);
        if (Math.hypot(ex - t1.x, ey - t1.y) < 10) {
          // A clean finger tap (the finger hardly moved, so it was never a pan). On typed words it
          // selects them, with any tool. With words selected, a tap elsewhere lets them go. Otherwise
          // as before: the Type tool starts a text box, any other tool selects the picture under it.
          const word = strokeUnder(ex, ey, false);
          const hadWords = !!selRef.current;
          // A straight ruled line under the tap (never handwriting) is selected the same way, with a
          // finger's width of reach. Typed words come first when both are there.
          const ruled = word ? undefined : lineUnder(ex, ey, "touch");
          // Handwriting under the tap picks up its word (a tap inside the frame then picks up more).
          const ink = word || ruled ? undefined : inkUnder(ex, ey, "touch");
          // With something selected, a tap on other writing only lets it go: tapping away is easy.
          if (ink && selRef.current && !insideSelFrame(ex, ey, "touch")) clearSel();
          else if (word) selectText(word.id);
          else if (ruled) selectLine(ruled.id);
          else if (ink) setSel(clusterSel(ink, 1));
          else {
            clearSel();
            if (tool === "text") {
              if (!hadWords) startTyping(ex, ey);
            } else {
              const [wx, wy] = toWorld(cam.current, ex, ey);
              select(imageAt(images.current, wx, wy)?.id ?? null);
            }
          }
          requestDraw();
        }
      }
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) pinch.current = null;
      else if (touches.current.size === 2) {
        // Back to two from three (a knuckle or the edge of the hand came and went mid-pinch): the
        // pinch starts again from these two, or the view leapt by the gap to the old pair.
        const [p1, p2] = [...touches.current.values()];
        pinch.current = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2 };
      }
      // (A two-finger tap used to undo. A palm landing after writing looked just like one and
      // undid the last line, so it's gone: undo is the button, or Ctrl+Z.)
      if (touches.current.size === 0) tap2.current = null;
      const flicked = panTrip.current.dist > 24 && performance.now() - panTrip.current.at < 80;
      if (wasSingle && !cancelled && !tap2.current && flicked) startGlide(velocity.current.vx, velocity.current.vy);
      if (gesture.current.mode === "pan" && gesture.current.id === e.pointerId) gesture.current = { mode: null, id: -1, erased: [], straightened: false };
      return;
    }
    const g = gesture.current;
    if (lassoArm.current?.pid === e.pointerId) cancelLasso();
    if (g.id !== e.pointerId) return;
    clearHold();
    setAngle(null);
    if (g.lasso) {
      hideLasso();
      gestureLasso.current = false;
      const s = current.current;
      // What the loop goes round (a tiny loop, under 12 pixels each way, is a tap, not a lasso).
      let picked: { ids: string[]; imgs: string[] } = { ids: [], imgs: [] };
      if (s && !cancelled && s.pts.length >= 3) {
        const b = strokeBox(s);
        if ((b.w - s.size * 4) * cam.current.z >= 12 || (b.h - s.size * 4) * cam.current.z >= 12)
          picked = lassoPick(
            strokes.current,
            images.current,
            s.pts.map((p) => [p[0], p[1]]),
          );
      }
      if (picked.ids.length || picked.imgs.length) {
        current.current = null;
        setSel({ ids: picked.ids, imgs: picked.imgs });
        try {
          navigator.vibrate?.(12);
        } catch {}
        // Its bar shows straight away (not after the usual pause once the pen lifts).
        if (inkingOff.current) clearTimeout(inkingOff.current);
        inkingOff.current = null;
        setInkingNow(false);
        gesture.current = { mode: null, id: -1, erased: [], straightened: false };
        predicted.current = [];
        requestDraw();
        return;
      }
      if (!g.lasso.safety || cancelled) {
        // Round nothing, with the Select tool: nothing is kept, and the selection goes.
        current.current = null;
        clearSel();
        gesture.current = { mode: null, id: -1, erased: [], straightened: false };
        predicted.current = [];
        setInking(false);
        requestDraw();
        return;
      }
      // Round nothing, with the pen: it was writing after all (a pause before a stroke). It is kept,
      // exactly as if it had been written, so no writing is ever lost.
    }
    if (g.mode === "group") {
      endGroupDrag(cancelled);
      return;
    }
    if (g.mode === "erase") {
      flushErase();
      lastErase.current = null;
      if (g.erased.length) commit({ type: "erase", s: g.erased });
      if (tool !== "eraser") moveEraser();
        } else if ((g.mode === "draw" || g.mode === "line" || g.mode === "box") && current.current) {
      const s = current.current;
      current.current = null;
      // Ink ends where the pen lifted, not where the smoothing had got to.
      const raw = lastRaw.current;
      if (s.kind === "ink" && raw && s.pts.length > 1) {
        const last = s.pts[s.pts.length - 1];
        if (Math.hypot(raw[0] - last[0], raw[1] - last[1]) > 0.2) s.pts.push([raw[0], raw[1], last[2]]);
      }
      lastRaw.current = null;
      if (s.kind === "ink") s.pts = settleStroke(s.pts, s.size);
      // Axes from a tap (or a tiny drag): a standard size, centred where it was tapped.
      if (s.kind === "form" && s.form === "axes") {
        const [a, b] = s.pts;
        const z = cam.current.z;
        if (Math.abs(b[0] - a[0]) * z < 60 || Math.abs(b[1] - a[1]) * z < 45) s.pts = [[a[0] - 210 / z, a[1] - 150 / z, 0.5], [a[0] + 210 / z, a[1] + 150 / z, 0.5]];
        else s.pts = [[Math.min(a[0], b[0]), Math.min(a[1], b[1]), 0.5], [Math.max(a[0], b[0]), Math.max(a[1], b[1]), 0.5]];
      }
      const tooShort = s.kind === "line" && Math.hypot(s.pts[1][0] - s.pts[0][0], s.pts[1][1] - s.pts[0][1]) * cam.current.z < 3;
      // A plain mouse click (no drag) that began on typed words, or while words were selected: it
      // selects, or lets the selection go, and leaves no dot. A real stroke lets the selection go.
      // (The S Pen's tip wanders a little more than the mouse while it taps.)
      const [ux, uy] = local(e);
      const still = g.click?.pen
        ? Math.hypot(ux - g.click.x, uy - g.click.y) < 6 && (s.kind === "ink" ? !g.straightened && hold.current.path < 14 : g.mode === "line")
        : s.kind === "line"
          ? tooShort
          : s.kind === "ink" && hold.current.path < 4;
      const clicked = !!g.click && !cancelled && performance.now() - g.click.at < 500 && still;
      if (g.click) {
        selectText(clicked ? g.click.text : null);
        // A clean tap on a straight line selects it; a tap on empty board, or a real stroke, lets it go.
        if (!clicked || !g.click.text) selectLine(clicked ? (g.click.line ?? null) : null);
      }
      if (!cancelled && !tooShort && !clicked) {
        // When it was written, so handwriting written together can be picked up together.
        if (s.kind === "ink" || s.kind === "line") s.at = Date.now();
        strokes.current = [...strokes.current, s];
        commit({ type: "add", s });
        if (e.pointerType === "mouse" && s.kind === "ink" && hold.current.path < 4) clickDots.current = [...clickDots.current.slice(-1), { id: s.id, at: performance.now() }];
        // A stroke that gets tidied (a ruled line, a T account) is sent once, as the tidy version.
        if (!recognise(s)) send({ t: "add", s: packStroke(s) });
        watchBottom(s);
        if (s.kind === "form" && s.form === "axes" && toolBeforeA.current) {
          setTool(toolBeforeA.current);
          toolBeforeA.current = null;
        }
      } else {
        send({ t: "del", ids: [s.id] }); // the preview on the other screen goes
      }
    }
    gesture.current = { mode: null, id: -1, erased: [], straightened: false };
    predicted.current = [];
    setInking(false);
    requestDraw();
  };

  useEffect(() => {
    endLate.current = (e) => endGesture(e);
  });

  // The tab going out of sight (app switch, screen off) with contacts still counted as down: they
  // are forgotten, so nothing is left "held" when Hamza comes back. Nothing to do in normal use.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      touches.current.clear();
      pinch.current = null;
      tap1.current = null;
      tap2.current = null;
      pens.current.active = false;
      if (liftTimer.current) clearTimeout(liftTimer.current);
      liftTimer.current = null;
      if (gesture.current.mode === "pan") gesture.current = { mode: null, id: -1, erased: [], straightened: false };
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  // No pull to refresh and no sideways "back" swipe from the edges of the page: a finger that starts
  // on a toolbar and drags must never reload the board in the middle of a class. Put back on leaving.
  useEffect(() => {
    const els = [document.documentElement, document.body];
    const was = els.map((el) => el.style.overscrollBehavior);
    for (const el of els) el.style.overscrollBehavior = "none";
    return () => els.forEach((el, i) => (el.style.overscrollBehavior = was[i]));
  }, []);

  // Mouse wheel / trackpad: pinch or ctrl+wheel zooms, plain wheel pans.
  const onWheel = (e: WheelEvent) => {
    takeView();
    const [sx, sy] = local(e);
    if (e.ctrlKey || e.metaKey) cam.current = zoomAt(cam.current, Math.exp(-e.deltaY * 0.01), sx, sy);
    else cam.current = { ...cam.current, x: cam.current.x + e.deltaX / cam.current.z, y: cam.current.y + e.deltaY / cam.current.z };
    refresh();
  };
  // Listened to directly, not through React (whose wheel listener can't cancel the browser's own
  // action): a trackpad pinch or Ctrl+wheel no longer also zooms the whole page, and a sideways
  // scroll no longer swipes "back" out of the board. The board moves exactly as before.
  const wheelRef = useRef(onWheel);
  useEffect(() => {
    wheelRef.current = onWheel;
  });
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      wheelRef.current(e);
    };
    c.addEventListener("wheel", h, { passive: false });
    return () => c.removeEventListener("wheel", h);
  }, [canvasRef]);

  /** An ink: the pen takes it (and comes back in hand from the eraser, Select or the highlighter). */
  const pickInk = (c: string) => {
    setColor(c);
    setMarker(false);
    if (tool === "eraser" || tool === "move") pickTool("pen");
  };
  const pickTool = (t: Tool) => {
    commitTyping();
    toolBeforeA.current = null;
    setTool(t);
    // Picking another tool lets the selection go (the Type tool keeps selected typed text).
    if (t !== "move" && !(t === "text" && selTextRef.current)) clearSel();
    if (t !== "eraser") moveEraser();
    requestDraw();
  };

  // ---- pages: one per class, so a new class never starts on the last one's writing
  /**
   * The order pages are listed in: "Board" first, then every class's page in timetable order
   * (always there, written on or not), then blank pages, oldest first.
   */
  const classOrder = useRef<string[]>([]);
  const ordered = (list: BoardPage[]) => {
    const rank = (x: BoardPage) => (x.id === MAIN_PAGE.id ? -1 : classOrder.current.includes(x.id) ? classOrder.current.indexOf(x.id) : 1e6);
    return list.toSorted((a, b) => rank(a) - rank(b) || a.at - b.at);
  };
  /**
   * Remember a page in the list, and where Hamza is. Pages are never let go on their own,
   * however many there are: a page and its writing stay until Hamza deletes it.
   */
  const rememberPage = (p: BoardPage) => {
    const list = ordered(pagesRef.current.some((x) => x.id === p.id) ? pagesRef.current.map((x) => (x.id === p.id ? { ...x, ...p } : x)) : [...pagesRef.current, p]);
    pagesRef.current = list;
    setPageList(list);
    // Saved only once this device's own list has loaded, so it never writes over pages it hasn't read yet.
    if (indexReady.current) void saveIndex(storeKey, { pages: list, current: p.id });
  };
  /**
   * Switch page. The page being left is saved as it is; the new one opens from this device's
   * copy. Told to the other device (`announce`), which follows; the tablet then sends its copy,
   * which the laptop takes as the truth.
   */
  const openPage = (p: BoardPage, announce: boolean) => {
    if (p.id === pageRef.current.id) return;
    commitTyping();
    // The page changing under a gesture (the other device switched page while this one was in the
    // middle of a move or a rub): it ends here, on the page it belongs to. Words being moved go back
    // where they were, a half-drawn line is dropped, and what was rubbed out so far is sent.
    const open = gesture.current;
    endTextDrag(true);
    // A group being moved goes back where it was, and nothing stays lifted; no lasso either.
    cancelGroupDrag();
    dropLift();
    cancelLasso();
    hideLasso();
    gestureLasso.current = false;
    selectText(null);
    selectLine(null);
    if (open.mode && open.mode !== "pan" && open.mode !== "group") {
      if (current.current) send({ t: "del", ids: [current.current.id] });
      gesture.current = { mode: null, id: -1, erased: [], straightened: false };
      setInking(false);
      setAngle(null);
    }
    flushErase();
    lastErase.current = null;
    clearHold();
    moving.current = null;
    if (save.current) clearTimeout(save.current);
    save.current = null;
    if (loadedPageId.current === pageRef.current.id) void saveBoard(keyFor(pageRef.current.id), snapshot()).then(saved);
    loadedPageId.current = null;
    camByPage.current.set(pageRef.current.id, cam.current);
    pageRef.current = p;
    setPage(p);
    rememberPage(p);
    strokes.current = [];
    images.current = [];
    remoteLive.current = null;
    current.current = null;
    undoStack.current = [];
    redoStack.current = [];
    // A fresh start for each page: pictures from earlier pages are let go (as a reload would).
    forgetImages();
    select(null);
    pageBoardIn.current = false;
    if (announce) send({ t: "page", p });
    if (lead) {
      cam.current = camByPage.current.get(p.id) ?? { x: -60, y: -60, z: 1 };
      // A new page: the tablet leads its view (the laptop follows, as before).
      viewKey.current = { g: viewKey.current.g + 1, by: 1 };
      stopFollowing();
      viewSent.current.force = true;
      refresh();
    }
    // The laptop moved because the tablet did: the tablet's copy follows at once and is the truth,
    // so the laptop's own (maybe older) copy is left alone, or erased writing would come back.
    if (!lead && !announce) return;
    void loadBoard(keyFor(p.id)).then((saved) => {
      if (pageRef.current.id !== p.id) return;
      // The laptop already has the tablet's copy of this page: that wins.
      if (!lead && pageBoardIn.current) return;
      loadedPageId.current = p.id;
      if (saved) {
        const hasS = new Set(saved.strokes.map((x) => x.id));
        const hasI = new Set(saved.images.map((x) => x.id));
        strokes.current = [...saved.strokes, ...strokes.current.filter((x) => !hasS.has(x.id))];
        images.current = [...saved.images, ...images.current.filter((x) => !hasI.has(x.id))];
      }
      if (lead) send(fullBoard());
      // Anything that arrived while it loaded is saved with it.
      if (strokes.current.length || images.current.length) persist();
      requestDraw();
      syncMeta();
    });
    requestDraw();
    syncMeta();
  };
  useEffect(() => {
    openPageRef.current = openPage;
  });
  // Blank pages are numbered (Page 2, Page 3…); class pages carry the class name.
  const newPage = () => {
    const n = pagesRef.current.filter((x) => !x.classId).length + 1;
    openPage({ id: `p-${Date.now().toString(36)}`, title: `Page ${n}`, at: Date.now() }, true);
  };
  // Delete the page on screen (after a confirm): its writing goes for good, on both devices, and the
  // page next to it opens. "Board" itself stays (it can be cleared instead). A class's page is
  // back straight away, empty (see ensureClassPages).
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  // A tap or click anywhere outside the open page list closes it, and never draws on the board.
  useEffect(() => {
    if (!pagesOpen) return;
    const down = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-pages-menu]")) return;
      e.stopPropagation();
      e.preventDefault();
      setPagesOpen(false);
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [pagesOpen]);
  // The paper menu: a tap or click anywhere outside it closes it, and never draws on the board.
  const [paperOpen, setPaperOpen] = useState(false);
  useEffect(() => {
    if (!paperOpen) return;
    const down = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-paper-menu]")) return;
      e.stopPropagation();
      e.preventDefault();
      setPaperOpen(false);
    };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [paperOpen]);
  const onPickTone = (e: React.MouseEvent<HTMLElement>) => setPaper(paperRef.current, e.currentTarget.dataset.v === "dark", true);
  const forgetPage = (id: string) => {
    const list = pagesRef.current.filter((x) => x.id !== id);
    pagesRef.current = list;
    setPageList(list);
    void deleteBoard(keyFor(id));
    if (indexReady.current) void saveIndex(storeKey, { pages: list, current: pageRef.current.id });
    if (solo.current.delete(id)) saveSolo();
    camByPage.current.delete(id);
    // A class's page comes straight back, empty: deleting it wipes it clean.
    ensurePagesRef.current();
  };
  const deletePage = () => {
    setConfirmDelete(false);
    const gone = pageRef.current;
    if (gone.id === MAIN_PAGE.id) return;
    const list = pagesRef.current;
    const i = list.findIndex((x) => x.id === gone.id);
    const next = list[i - 1] ?? list[i + 1] ?? MAIN_PAGE;
    loadedPageId.current = null; // leaving it: nothing to save
    openPage(next, true);
    forgetPage(gone.id);
    send({ t: "pagedel", id: gone.id });
  };
  useEffect(() => {
    forgetPageRef.current = forgetPage;
  });
  const stepPage = (dir: 1 | -1) => {
    const list = pagesRef.current;
    const i = list.findIndex((x) => x.id === pageRef.current.id);
    const next = list[i + dir];
    if (next) openPage(next, true);
  };

  // Each class opens its own page by itself, a minute before it starts (on the tablet, or the
  // laptop when it's on its own). Only when the class changes: going back to another page by
  // hand during class is never undone.
  const db = useDatabase();
  const schedule = useSchedule();
  const lastAutoSlot = useRef<string | null>(null);
  const autoPage = useRef<() => void>(() => {});
  useEffect(() => {
    autoPage.current = () => {
      const now = Date.now();
      const today = pkDate(now);
      // The class that has started (or starts within a minute): with back-to-back subjects, the
      // next one's page opens a minute before it starts.
      const slot = liveSlotsOn(db, today)
        .filter((s) => now >= s.startMs - PAGE_EARLY_MIN * 60_000 && now < s.endMs)
        .sort((a, b) => b.startMs - a.startMs)[0];
      if (!slot) return;
      const key = slotKey(slot);
      if (lastAutoSlot.current === key) return;
      // The tablet is on: it picks the page for this class. Counted as done here, so if the tablet
      // goes quiet for a moment later in the lesson the laptop doesn't open the class page over
      // whatever page Hamza has chosen.
      if (!lead && now - tabletHeardAt.current < 10_000) {
        lastAutoSlot.current = key;
        return;
      }
      // Not before this page's own board has loaded (its list of pages comes with it).
      if (loadedPageId.current === null) return;
      // Never mid-stroke or mid-word: it waits for the pen to lift (checked again in 5 seconds).
      if (gesture.current.mode || typingRef.current) return;
      lastAutoSlot.current = key;
      // One page per class (AS Accounting, AS Business…), kept from one lesson to the next, so each
      // class carries on where it left off. Moved to the end of the list each time it's used.
      const id = classPageId(slot.classId, slot.subjectId);
      const had = pagesRef.current.find((x) => x.id === id);
      const p = { ...(had ?? { id, classId: slot.classId, subjectId: slot.subjectId }), title: `${LEVEL_LABEL[slot.level]} ${slot.subject}`, at: now };
      openPage(p, true);
    };
  });
  // Every class's page is always in the list, so Hamza can open one and write on it before
  // its lesson. One that's missing (never opened, or deleted) is added back, empty.
  const ensureClassPages = () => {
    const want = classBoardPages(db);
    classOrder.current = want.map((x) => x.id);
    const missing = want.filter((w) => !pagesRef.current.some((x) => x.id === w.id));
    const list = ordered([...pagesRef.current, ...missing.map((w) => ({ ...w, at: 0 }))]);
    const changed = missing.length > 0 || list.some((x, i) => x.id !== pagesRef.current[i]?.id);
    if (!changed) return;
    pagesRef.current = list;
    setPageList(list);
    // Saved only once this device's own list has loaded, so it never writes over pages it hasn't read yet.
    if (indexReady.current) void saveIndex(storeKey, { pages: list, current: pageRef.current.id });
  };
  useEffect(() => {
    ensurePagesRef.current = ensureClassPages;
  });
  useEffect(() => {
    ensurePagesRef.current();
  }, [db, schedule]);

  useEffect(() => {
    // A moment after opening (the saved page first), then every 5 seconds.
    const first = setTimeout(() => autoPage.current(), 3000);
    const every = setInterval(() => autoPage.current(), 5_000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, [schedule]);

  // Keyboard on a laptop: P/L/E/V/T tools, H hides the tools, [ ] pages, N new page, Ctrl+Z / Ctrl+Shift+Z, space to pan, Delete.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Typing in the text box: its keys are words, not shortcuts.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
      // A question or the page list is open: Escape closes it, and nothing happens on the board behind it.
      if (confirmClear || confirmDelete || pagesOpen || paperOpen) {
        if (e.key === "Escape") {
          setConfirmClear(false);
          setConfirmDelete(false);
          setPagesOpen(false);
          setPaperOpen(false);
        }
        return;
      }
      // A button pressed with the mouse or a finger keeps the focus, and Space or Enter would press it
      // again (a second undo, another blank page). It lets go instead. A button reached with Tab still works.
      if ((e.code === "Space" || e.key === "Enter") && pressedButton.current && document.activeElement === pressedButton.current) {
        e.preventDefault();
        pressedButton.current.blur();
        pressedButton.current = null;
      }
      if (e.code === "Space" && !e.metaKey && !e.ctrlKey && !e.altKey) spaceDown.current = true;
      // Any key but an arrow lands a nudge burst first (so an undo takes the whole burst back).
      if (!e.key.startsWith("Arrow")) landNudge();
      // Ctrl+D (Cmd+D on a Mac): a copy of what is selected, just beside it.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && selRef.current) {
        e.preventDefault();
        duplicateSel();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Arrow keys nudge what is selected (Shift: 10 at a time).
      if (e.key.startsWith("Arrow") && isGroup()) {
        const step = e.shiftKey ? 10 : 1;
        const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
        if (d && nudgeGroup(d[0], d[1])) e.preventDefault();
        return;
      }
      // Still typing: Enter closed the text box and the next line's letters are on their way. They
      // are words, not shortcuts (a stray "n" made a new page on both devices).
      if (e.key.length === 1 && performance.now() - typedAt.current < 700) {
        typedAt.current = performance.now();
        return;
      }
      // A key held down acts once (a held N made a pile of pages). Page Down may repeat.
      if (e.repeat && e.key !== "PageDown") return;
      // Lower case whether or not Caps Lock is on.
      const k = e.shiftKey ? "" : e.key.toLowerCase();
      if (k === "p") {
        pickTool("pen");
        setMarker(false);
      }
      // 1 to 4: the four inks.
      if (!e.shiftKey && /^[1-4]$/.test(e.key)) pickInk(COLORS[Number(e.key) - 1].value);
      if (k === "l") pickTool("line");
      // D: Solid or Dotted, for the next line (Line tool) or for the selected line.
      if (k === "d") {
        if (selLineRef.current) toggleSelLine();
        else if (tool === "line") setLineDotted(!lineDottedRef.current);
      }
      if (k === "a") {
        const before = tool === "axes" ? toolBeforeA.current : tool;
        pickTool("axes");
        toolBeforeA.current = before;
      }
      if (k === "e") pickTool("eraser");
      if (k === "v") pickTool("move");
      if (k === "t") {
        // T: the text box opens right where the mouse is (or the middle), ready to type.
        e.preventDefault();
        const before = tool === "text" ? toolBeforeT.current : tool;
        pickTool("text");
        toolBeforeT.current = before;
        const { w, h } = screen.current;
        const at = hoverAt.current ?? { x: w / 2, y: h / 2 };
        startTyping(at.x, at.y);
      }
      if (k === "h") setToolsHidden((v) => !v);
      if (e.key === "PageDown") {
        e.preventDefault();
        moreRoom();
      }
      if (e.key === "[") stepPage(-1);
      if (e.key === "]") stepPage(1);
      if (k === "n") newPage();
      if ((e.key === "Delete" || e.key === "Backspace") && selRef.current) {
        e.preventDefault();
        deleteSel();
      }
      // Enter opens the selected words to edit.
      if (e.key === "Enter" && selTextRef.current) {
        e.preventDefault();
        editSel();
      }
      if (e.key === "Escape" && gesture.current.lasso) {
        // A lasso being drawn is called off (nothing kept, nothing selected).
        cancelLasso();
        hideLasso();
        gestureLasso.current = false;
        current.current = null;
        gesture.current = { mode: null, id: -1, erased: [], straightened: false };
        setInking(false);
        requestDraw();
      } else if (e.key === "Escape" && grp.current) cancelGroupDrag();
      else if (e.key === "Escape" && selRef.current) {
        clearSel();
        requestDraw();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });
  // Which button the pointer last pressed (see Space and Enter above), and Space let go of when the
  // window loses the keyboard (or every later click would move the board instead of drawing).
  const pressedButton = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const press = (e: PointerEvent) => {
      const b = (e.target as Element | null)?.closest?.("button");
      pressedButton.current = b instanceof HTMLButtonElement ? b : null;
    };
    const blur = () => {
      spaceDown.current = false;
    };
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const fit = () => {
    takeView();
    const b = boundsOf(strokes.current);
    const all = [...images.current.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h })), ...(b ? [b] : [])];
    const { w, h } = screen.current;
    if (!all.length) cam.current = { x: -60, y: -60, z: 1 };
    else {
      const x0 = Math.min(...all.map((r) => r.x));
      const y0 = Math.min(...all.map((r) => r.y));
      const x1 = Math.max(...all.map((r) => r.x + r.w));
      const y1 = Math.max(...all.map((r) => r.y + r.h));
      cam.current = fitView({ x: x0 - 40, y: y0 - 90, w: x1 - x0 + 80, h: y1 - y0 + 200 }, w, h);
    }
    refresh();
  };

  /** The laptop's link: /teach/present (it pairs with this tablet by Hamza's sign-in). */
  const copyLink = async () => {
    const url = `${window.location.origin}/teach/present`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Laptop link", url);
    }
    setCopiedPresent(true);
    setTimeout(() => setCopiedPresent(false), 1800);
  };

  const hasContent = meta.content > 0;
  const pageIndex = pageList.findIndex((x) => x.id === page.id);

  // The tool in hand, for the sliding gold disc (Insert is not a tool; the Line and Axes tools, from
  // the keyboard, have no button).
  const toolIndex = tool === "pen" ? (marker ? 1 : 0) : tool === "eraser" ? 2 : tool === "move" ? 3 : tool === "text" ? 4 : -1;
  const ctl = CTL(lead);
  const step = lead ? 46 : 38; // a control and the 2 px gap after it
  const typedColor = (c: string) => inkOf(c);
  const selLineIsLine = !!selLine?.line;
  const kind = selUI?.kind;
  /** A lone straight line (not a box, oval or form): end handles instead of a frame. */
  const lineSel = kind === "line" && selLineIsLine;
  /** The colour chip: the one colour, or the colours split into equal slices. */
  const chipStyle = (colors: string[]): React.CSSProperties => {
    const inks = colors.map(typedColor);
    if (inks.length <= 1) return { background: inks[0] ?? "transparent", boxShadow: "var(--bd-swatch-edge)" };
    const a = 360 / inks.length;
    return { background: `conic-gradient(${inks.map((c, i) => `${c} ${Math.round(i * a)}deg ${Math.round((i + 1) * a)}deg`).join(", ")})`, boxShadow: "var(--bd-swatch-edge)" };
  };
  const colorChip = (colors: string[], which: "sel" | "typing") => (
    <button
      type="button"
      data-color-menu
      aria-label="Colour"
      aria-expanded={colorAt?.for === which}
      {...tipOn("Colour")}
      onPointerDown={palmDown}
      onClick={(e) => openColors(e, which)}
      className={`${PRESS} ${ctl} ${colorAt?.for === which ? ON : QUIET}`}
    >
      <span className="block h-5 w-5 rounded-full" style={chipStyle(colors)} />
    </button>
  );
  /** Smaller and bigger "A"s: their baselines on one line. */
  const sizeButtons = (
    <>
      <button type="button" aria-label="Smaller text" {...tipOn("Smaller")} onPointerDown={palmDown} onClick={() => !palmBlocked() && stepTextSize(-1)} className={`${PRESS} ${QUIET} relative flex shrink-0 justify-center rounded-full ${lead ? "h-11 w-11 items-end pb-[13px] text-[13px]" : `h-9 w-9 items-end pb-[10px] text-[12px] ${HIT}`} font-semibold leading-none`}>
        A
      </button>
      <button type="button" aria-label="Bigger text" {...tipOn("Bigger")} onPointerDown={palmDown} onClick={() => !palmBlocked() && stepTextSize(1)} className={`${PRESS} ${QUIET} relative flex shrink-0 justify-center rounded-full ${lead ? "h-11 w-11 items-end pb-[12px] text-[18px]" : `h-9 w-9 items-end pb-[9px] text-[16px] ${HIT}`} font-semibold leading-none`}>
        A
      </button>
    </>
  );
  /** Bold, italic, highlight: on the words being typed (`typingNow`), or on the selected words. */
  const onStyle = (e: React.MouseEvent<HTMLElement>) => {
    if (palmBlocked()) return;
    const k = e.currentTarget.dataset.k as "bold" | "italic" | "hl";
    if (e.currentTarget.dataset.typing) toggleStyle(k);
    else toggleSel(k);
  };
  const styleButtons = (st: { bold?: boolean; italic?: boolean; hl?: boolean }, typingNow: boolean) => (
    <>
      <button type="button" aria-label="Bold" aria-pressed={!!st.bold} {...tipOn("Bold", "Ctrl+B")} onPointerDown={palmDown} data-k="bold" data-typing={typingNow ? "1" : undefined} onClick={onStyle} className={`${PRESS} ${ctl} text-[15px] font-bold ${st.bold ? ON : QUIET}`}>
        B
      </button>
      <button type="button" aria-label="Italic" aria-pressed={!!st.italic} {...tipOn("Italic", "Ctrl+I")} onPointerDown={palmDown} data-k="italic" data-typing={typingNow ? "1" : undefined} onClick={onStyle} className={`${PRESS} ${ctl} text-[15px] font-medium italic ${st.italic ? ON : QUIET}`}>
        I
      </button>
      <button type="button" aria-label="Highlight" aria-pressed={!!st.hl} {...tipOn("Highlight", "Ctrl+H")} onPointerDown={palmDown} data-k="hl" data-typing={typingNow ? "1" : undefined} onClick={onStyle} className={`${PRESS} ${ctl} ${st.hl ? `${ON} wb-tool-on` : QUIET}`}>
        {I.marker}
      </button>
    </>
  );
  // The rail: the Tools island (with its gold disc) and the Ink island.
  /** A tool button: the pen (highlighter down), the highlighter (in the pen), or a tool. */
  const onToolButton = (e: React.MouseEvent<HTMLElement>) => {
    if (palmBlocked()) return;
    const id = e.currentTarget.dataset.k;
    if (id === "pen" || id === "marker") {
      setMarker(id === "marker");
      pickTool("pen");
    } else pickTool(id as Tool);
  };
  const toolButtons: Array<{ id: string; label: string; tip: string; keys?: string; hint?: string; icon: React.ReactNode }> = [
    { id: "pen", label: "Pen (P). Hold still at the end to snap a line, box or circle; hold still at the start to pick up writing", tip: "Pen", keys: "P", hint: "Hold still at the end to snap a line, box or circle. Hold still at the start to pick up writing or lasso.", icon: I.pen },
    { id: "marker", label: "Highlighter", tip: "Highlighter", hint: "A gold band for headings and key words. Drawn nearly straight, it straightens.", icon: I.marker },
    { id: "eraser", label: "Eraser (E), or press the pen's side button", tip: "Eraser", keys: "E", hint: "Or press the pen's side button once, just above the screen. Press again to write.", icon: I.eraser },
    { id: "move", label: "Select (V): drag round things to select them, or drag one to move it", tip: "Select", keys: "V", hint: "Drag round things to select them, or drag one to move it. With any tool: tap writing with a finger, or hold the pen still on it.", icon: I.lasso },
    { id: "text", label: "Type (T, or double click the board)", tip: "Type", keys: "T", hint: "Or double click the board. Enter for a new line, Esc or a tap away to finish. Start a line with - for a list.", icon: I.text },
  ];
  const inkNow = inkOf(color);
  const thick = Math.round(Math.min(10, Math.max(2, size * 0.6)));

  return (
    <div
      data-board
      data-laptop={lead ? undefined : ""}
      className="fixed inset-0 select-none overflow-hidden text-[color:var(--bd-fg)] antialiased [-webkit-touch-callout:none]"
      style={{ fontFamily: "var(--font-body)", background: THEMES[look].bg, ...CHROME[dark ? "dark" : "light"] }}
      // Files dragged in from the laptop's desktop or a folder land on the board, like Insert.
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        if (busy) flash("Still adding the last one. Try again in a moment.");
        else void insertFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {/* Motion (only opacity and transform; none with reduced motion), the laptop's icon weight, and
          the highlighter icon's little gold band. */}
      <style>{`
@keyframes wb-pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
@keyframes wb-rise{from{opacity:0;translate:0 4px}to{opacity:1;translate:0 0}}
@keyframes wb-fade-in{from{opacity:0}to{opacity:1}}
@keyframes wb-toast{from{opacity:0;transform:translate(-50%,6px)}to{opacity:1;transform:translate(-50%,0)}}
.wb-pop{animation:wb-pop 160ms cubic-bezier(.16,1,.3,1) both}
.wb-rise{animation:wb-rise 160ms cubic-bezier(.16,1,.3,1) 40ms both}
.wb-fade{animation:wb-fade-in 100ms ease-out both}
.wb-toast{animation:wb-toast 180ms cubic-bezier(.16,1,.3,1) both}
.wb-disc{transition:transform 340ms cubic-bezier(.32,.72,0,1)}
.wb-hl-band{stroke:var(--bd-hl-chip)}
.wb-tool-on .wb-hl-band{stroke:currentColor}
[data-laptop] .wb-ic{stroke-width:1.9}
@media (prefers-reduced-motion:reduce){.wb-pop,.wb-rise,.wb-toast{animation:wb-fade-in 100ms ease-out both}.wb-toast{transform:translateX(-50%)}.wb-disc{transition:none}}
`}</style>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: tool === "eraser" ? "none" : overItem ? "move" : tool === "move" ? "default" : tool === "text" ? "text" : lead ? "auto" : penCursor(inkOf(color)) }}
        onPointerDown={onPointerDown}
        // Keeps the text box focused when the board is clicked or tapped to type.
        onMouseDown={(e) => tool === "text" && e.preventDefault()}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") {
            const [x, y] = local(e);
            hoverAt.current = { x, y };
            noteHover(x, y);
          }
          onPointerMove(e);
        }}
        onPointerUp={(e) => endGesture(e)}
        onPointerCancel={(e) => endGesture(e, true)}
        // A safety net: this always follows the lift, when there is nothing left to end. If the lift
        // itself never came, a finger is not left behind as a ghost that turns every pan into a pinch.
        onLostPointerCapture={(e) => {
          if (gesture.current.id === e.pointerId && gesture.current.mode) endGesture(e);
          else if (touches.current.has(e.pointerId)) endGesture(e, true);
        }}
        // The ring goes when the pen or mouse leaves the board (it used to stay behind with the
        // Eraser tool on, also on the shared laptop screen); the next move over the board shows it again.
        onPointerLeave={() => gesture.current.mode !== "erase" && moveEraser()}
        onContextMenu={(e) => e.preventDefault()}
        // Laptop: a double click on empty board starts typing there, with any tool (the tool in
        // hand comes back when the words are done). The two dots the clicks left are taken away.
        onDoubleClick={(e) => {
          if (lastPointer.current !== "mouse" || tool === "text" || tool === "eraser" || typingRef.current || selRef.current) return;
          const [x, y] = local(e);
          const [wx, wy] = toWorld(cam.current, x, y);
          if (strokeUnder(x, y, false) || imageAt(images.current, wx, wy)) return;
          const now = performance.now();
          for (const d of [...clickDots.current].reverse()) {
            if (now - d.at < 900 && strokes.current[strokes.current.length - 1]?.id === d.id) {
              undo();
              redoStack.current.pop(); // not something to redo
            }
          }
          clickDots.current = [];
          const before = tool;
          pickTool("text");
          toolBeforeT.current = before;
          startTyping(x, y);
        }}
      />
      {/* The selection while it moves: its own see-through layer over the board (the board itself is
          never redrawn for the move). Hidden the rest of the time. */}
      <canvas ref={liftCanvasRef} aria-hidden className="pointer-events-none absolute left-0 top-0" style={{ display: "none", transformOrigin: "0 0", willChange: "transform" }} />
      {/* The lasso: a smooth dashed loop in the selection colour, faintly filled, a fainter hint back
          to where it began, and a dot at the pen. */}
      <svg ref={lassoSvgRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" style={{ display: "none" }}>
        <path ref={lassoPathRef} fill="var(--bd-sel-fill)" stroke="var(--bd-sel)" strokeWidth={1.5} strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
        <line ref={lassoCloseRef} stroke="var(--bd-sel)" strokeWidth={1.5} strokeDasharray="1 4" strokeLinecap="round" opacity={0.5} />
        <circle ref={lassoTipRef} r={3.5} fill="var(--bd-sel)" />
      </svg>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => void insertFiles(Array.from(e.target.files ?? []))}
        aria-label="Insert a picture or PDF"
      />

      {/* The text box: always here (hidden when not typing) so a tap can open the keyboard at once. */}
      <textarea
        ref={textRef}
        aria-label="Type on the board"
        spellCheck={false}
        autoCapitalize="sentences"
        rows={1}
        // Out of the Tab order while hidden (focus landing in it silenced every shortcut).
        tabIndex={typing ? 0 : -1}
        onChange={(e) => {
          // "- " at the start of a line becomes a bullet.
          const el = e.target;
          const pos = el.selectionStart;
          const from = el.value.lastIndexOf("\n", pos - 1) + 1;
          if (pos - from === 2 && el.value.slice(from, pos) === "- ") el.setRangeText("• ", from, pos, "end");
          onTypingInput(el.value);
        }}
        onBlur={(e) => {
          // Tapping the style bar: keep typing (and the keyboard) open.
          if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest?.("[data-typing-ui]")) return;
          commitTyping();
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          // Enter starts a new line, as in any notes app. Esc, Ctrl+Enter or a tap away finishes.
          if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            commitTyping();
            return;
          }
          // A list carries on: Enter after "• point" or "1. point" starts the next one, and Enter
          // on an empty one ends the list.
          if (e.key === "Enter" && !e.shiftKey) {
            const el = e.currentTarget;
            const pos = el.selectionStart;
            const from = el.value.lastIndexOf("\n", pos - 1) + 1;
            const m = /^(\s*)(•|\d+[.)])\s+(.*)$/.exec(el.value.slice(from, pos));
            if (m) {
              e.preventDefault();
              if (!m[3]) el.setRangeText("", from, pos, "end");
              else el.setRangeText(`\n${m[1]}${/^\d/.test(m[2]) ? `${parseInt(m[2], 10) + 1}${m[2].slice(-1)}` : m[2]} `, pos, el.selectionEnd, "end");
              onTypingInput(el.value);
            }
          }
          // Ctrl+B bold, Ctrl+I italic, Ctrl+H highlight (Cmd on a Mac).
          if (e.ctrlKey || e.metaKey) {
            const k = e.key.toLowerCase();
            const which = k === "b" ? "bold" : k === "i" ? "italic" : k === "h" ? "hl" : null;
            if (which) {
              e.preventDefault();
              toggleStyle(which);
            }
          }
        }}
        className={`absolute resize-none overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent p-0 leading-[1.25] [field-sizing:content] ${
          typing ? "rounded-[4px]" : "pointer-events-none opacity-0 outline-none"
        }`}
        style={
          typing
            ? {
                left: typing.x,
                top: typing.y,
                // The selection's line, 4 px clear of the words.
                outline: "1.5px solid var(--bd-sel)",
                outlineOffset: 4,
                fontSize: typing.px,
                fontWeight: typing.bold ? 700 : 500,
                fontStyle: typing.italic ? "italic" : "normal",
                background: typing.hl ? THEMES[look].highlight : "transparent",
                color: inkOf(typing.color),
                caretColor: inkOf(typing.color),
                minWidth: Math.max(40, typing.px * 3),
                maxWidth: typing.maxPx,
              }
            : { left: -9999, top: 0, width: 1, height: 1 }
        }
      />

      {/* While typing: size, bold, italic, highlight and colour, centred just above the words (taps keep the keyboard open). */}
      {typing && (
        <div
          ref={typingBarRef}
          data-typing-ui
          className={`${BAR(lead)} wb-rise absolute left-0 top-0 z-20`}
          style={{ transform: "translate(-9999px, 0)" }}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        >
          {sizeButtons}
          <Divider lead={lead} />
          {styleButtons(typing, true)}
          <Divider lead={lead} />
          {colorChip([typing.color], "typing")}
        </div>
      )}

      {/* Text box handles: the grip on the left moves the box, the side sets the line width, the corner the size. */}
      {typing && (
        <>
          <button
            type="button"
            data-typing-ui
            aria-label="Drag to move the text"
            {...tipOn("Move")}
            onPointerDown={onGripDown}
            onMouseDown={(e) => e.preventDefault()}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            className="absolute z-20 flex h-11 w-11 cursor-move touch-none items-center justify-center rounded-full"
            // A 28 px grip, 8 px left of the box, centred on its first line.
            style={{ left: Math.round(typing.x - 4 - 8 - 28 - 8), top: Math.round(typing.y + Math.min(typing.hPx, typing.px * 1.25) / 2 - 22) }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#fff] text-[color:rgba(27,30,33,0.64)] [box-shadow:0_0_0_1.5px_var(--bd-sel),0_1px_3px_rgba(20,22,24,0.28)] [&>svg]:h-4 [&>svg]:w-4">{I.move}</span>
          </button>
          <button
            type="button"
            data-typing-ui
            aria-label="Drag to make the text box wider or narrower"
            {...tipOn("Line width")}
            onPointerDown={(e) => onHandleDown("w", e)}
            onMouseDown={(e) => e.preventDefault()}
            onPointerMove={(e) => onHandleMove(e)}
            onPointerUp={() => onHandleUp()}
            onPointerCancel={() => onHandleUp()}
            className="absolute z-20 flex h-11 w-11 cursor-ew-resize touch-none items-center justify-center"
            style={{ left: Math.round(typing.x + typing.wPx + 4 - 22), top: Math.round(typing.y + typing.hPx / 2 - 22) }}
          >
            <span className={SIDE_HANDLE} />
          </button>
          <button
            type="button"
            data-typing-ui
            aria-label="Drag to make the text bigger or smaller"
            {...tipOn("Text size")}
            onPointerDown={(e) => onHandleDown("s", e)}
            onMouseDown={(e) => e.preventDefault()}
            onPointerMove={(e) => onHandleMove(e)}
            onPointerUp={() => onHandleUp()}
            onPointerCancel={() => onHandleUp()}
            className="absolute z-20 flex h-11 w-11 cursor-nwse-resize touch-none items-center justify-center"
            style={{ left: Math.round(typing.x + typing.wPx + 4 - 22), top: Math.round(typing.y + typing.hPx + 4 - 22) }}
          >
            <span className={HANDLE_DOT} />
          </button>
        </>
      )}

      {/* Eraser ring */}
      <span
        ref={eraserRef}
        aria-hidden
        className="pointer-events-none absolute rounded-full border-[1.5px]"
        style={{ left: 0, top: 0, display: "none", width: ERASER_PX * 2, height: ERASER_PX * 2, borderColor: dark ? "rgba(240,237,232,0.55)" : "rgba(27,30,33,0.55)", background: dark ? "rgba(240,237,232,0.04)" : "rgba(27,30,33,0.04)" }}
      />

      {/* Angle readout while drawing a line */}
      {angle && (
        <span
          aria-hidden
          className="pointer-events-none absolute flex h-6 items-center rounded-full bg-[var(--bd-tip-bg)] px-2.5 text-xs font-bold tabular-nums text-[#fff] shadow-[0_6px_16px_-6px_rgba(20,22,24,0.4)]"
          style={{ left: Math.round(angle.x + 18), top: Math.round(angle.y - 34) }}
        >
          {angle.deg}°
        </span>
      )}

      {/* Tools hidden (clean screen for sharing): just a way back, in the corner. */}
      {toolsHidden && (
        <button
          type="button"
          onClick={() => setToolsHidden(false)}
          className={`${PANEL} ${PRESS} absolute bottom-3 left-3 flex h-11 items-center gap-2 rounded-full pl-4 pr-3 text-[13px] font-semibold transition-opacity duration-300 ${quiet ? "opacity-0" : "opacity-[0.72]"}`}
        >
          Show tools
          <kbd className="flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[var(--bd-on)] px-1 font-sans text-[10.5px] font-semibold">H</kbd>
        </button>
      )}

      {/* Everything on top of the board fades while the pen is down, and on the laptop when the mouse rests. */}
      <div className={`transition-[opacity,translate] ${inking ? "duration-500" : "duration-[420ms]"} ease-[cubic-bezier(.22,1,.36,1)] ${toolsHidden ? "hidden" : ""} ${quiet ? "pointer-events-none opacity-0" : inking ? "opacity-20" : ""}`}>
        {/* What is selected: one look for everything. A gold frame 8 px around it with a handle at each
            corner (drag one: bigger or smaller, same shape), typed text also a side handle (how wide its
            lines run); a lone straight line instead has a handle at each end and a soft halo. A drag
            inside moves it, with any tool. Its bar sits centred just above it. */}
        {selUI && !lineSel && (
          <div ref={groupFrameRef} aria-hidden className={`wb-fade pointer-events-none absolute ${SEL_FRAME}`} style={{ left: -9999, top: -9999 }}>
            {(["nw", "ne", "sw", "se"] as const).map((k) => (
              <span
                key={k}
                data-k={k}
                onPointerDown={onGroupHandleDown}
                onPointerMove={onGroupHandleMove}
                onPointerUp={onGroupHandleUp}
                onPointerCancel={onGroupHandleUp}
                onLostPointerCapture={onGroupHandleUp}
                className={`pointer-events-auto absolute flex touch-none items-center justify-center ${lead ? "h-11 w-11" : "h-6 w-6"} ${k === "nw" || k === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
                style={{ left: k[1] === "w" ? (lead ? -22 : -12) : undefined, right: k[1] === "e" ? (lead ? -22 : -12) : undefined, top: k[0] === "n" ? (lead ? -22 : -12) : undefined, bottom: k[0] === "s" ? (lead ? -22 : -12) : undefined }}
              >
                <span className={HANDLE_DOT} />
              </span>
            ))}
            {kind === "text" && (
              <span
                data-k="w"
                onPointerDown={onTextGripDown}
                onPointerMove={onTextGripMove}
                onPointerUp={onTextGripUp}
                onPointerCancel={onTextGripUp}
                onLostPointerCapture={onTextGripUp}
                className="pointer-events-auto absolute right-[-22px] top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center"
              >
                <span className={SIDE_HANDLE} />
              </span>
            )}
          </div>
        )}
        {selUI && lineSel && (
          <>
            <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
              <line ref={haloRef} stroke="var(--bd-sel)" strokeOpacity={0.25} strokeLinecap="round" />
            </svg>
            {(["a", "b"] as const).map((k) => (
              <span
                key={k}
                ref={k === "a" ? lineEndARef : lineEndBRef}
                data-k={k}
                aria-hidden
                onPointerDown={onTextGripDown}
                onPointerMove={onTextGripMove}
                onPointerUp={onTextGripUp}
                onPointerCancel={onTextGripUp}
                onLostPointerCapture={onTextGripUp}
                className="absolute left-0 top-0 flex h-11 w-11 cursor-move touch-none items-center justify-center"
                style={{ transform: "translate(-9999px, 0)" }}
              >
                <span className={HANDLE_DOT} />
              </span>
            ))}
          </>
        )}
        {selUI && (
          <div
            key={selUI.key}
            ref={groupBarRef}
            data-group-bar
            role="toolbar"
            aria-label="Selection"
            className={`${BAR(lead)} wb-rise absolute left-0 top-0 z-20`}
            style={{ transform: "translate(-9999px, 0)" }}
          >
            {/* Move: for a selection too big to grab with a finger (and for the mouse). Neutral, icon only. */}
            <button
              type="button"
              data-k="move"
              aria-label="Move: drag this, or drag inside the frame"
              {...tipOn("Move", undefined, "Drag this, or anywhere inside the frame.")}
              onPointerDown={onGroupHandleDown}
              onPointerMove={onGroupHandleMove}
              onPointerUp={onGroupHandleUp}
              onPointerCancel={onGroupHandleUp}
              onLostPointerCapture={onGroupHandleUp}
              className={`${PRESS} ${QUIET} ${ctl} cursor-grab touch-none active:cursor-grabbing`}
            >
              {I.move}
            </button>
            <Divider lead={lead} />
            {kind === "text" && selText ? (
              <>
                {sizeButtons}
                <Divider lead={lead} />
                {styleButtons(selText, false)}
                <Divider lead={lead} />
                {colorChip([selText.color], "sel")}
                <Divider lead={lead} />
                <Btn lead={lead} label="Delete the text" tip="Delete" keys="Delete" onClick={deleteSel} className={DANGER}>
                  {I.trash}
                </Btn>
              </>
            ) : lineSel && selLine ? (
              <>
                <Btn lead={lead} label={selLine.dotted ? "Make it solid" : "Make it dotted"} tip={selLine.dotted ? "Solid" : "Dotted"} keys="D" onClick={toggleSelLine}>
                  {selLine.dotted ? I.solid : I.dotted}
                </Btn>
                <Btn lead={lead} label="Arrow" tip={selLine.arrow ? "Remove the arrowhead" : "Make it an arrow"} pressed={selLine.arrow} onClick={toggleSelArrow} className={selLine.arrow ? ON : QUIET}>
                  {I.arrow}
                </Btn>
                <Divider lead={lead} />
                {colorChip(selUI.colors, "sel")}
                <Divider lead={lead} />
                <Btn lead={lead} label="Duplicate" keys="Ctrl+D" hint="A copy just beside it, ready to drag." onClick={duplicateSel}>
                  {I.duplicate}
                </Btn>
                <Btn lead={lead} label="Delete the line" tip="Delete" keys="Delete" onClick={deleteSel} className={DANGER}>
                  {I.trash}
                </Btn>
              </>
            ) : kind === "picture" ? (
              <>
                <Btn lead={lead} label="Fit: show the whole picture" tip="Fit" hint="Zoom to show the whole picture." onClick={fitSel}>
                  {I.fit}
                </Btn>
                <Btn lead={lead} label="Bring to front" onClick={frontSel}>
                  {I.front}
                </Btn>
                <Divider lead={lead} />
                <Btn lead={lead} label="Duplicate" keys="Ctrl+D" onClick={duplicateSel}>
                  {I.duplicate}
                </Btn>
                <Divider lead={lead} />
                <Btn lead={lead} label="Delete the picture" tip="Delete" keys="Delete" onClick={deleteSel} className={DANGER}>
                  {I.trash}
                </Btn>
              </>
            ) : (
              <>
                {/* Handwriting picked up by a tap: less or more of it (stroke, word, line, block). */}
                {selUI.kind === "ink" && selUI.level !== undefined && (
                  <>
                    <Btn lead={lead} label="Pick up less" tip={`Less (now: ${GROW_NAME[selUI.level]})`} disabled={selUI.level <= 0} onClick={shrinkSel}>
                      {I.minus}
                    </Btn>
                    <Btn lead={lead} label="Pick up more" tip={`More (now: ${GROW_NAME[selUI.level]})`} hint="The whole line, then the block. Or tap inside the frame." disabled={selUI.level >= 3} onClick={growSel}>
                      {I.plus}
                    </Btn>
                    <Divider lead={lead} />
                  </>
                )}
                {selUI.colors.length > 0 && (
                  <>
                    {colorChip(selUI.colors, "sel")}
                    <Divider lead={lead} />
                  </>
                )}
                <Btn lead={lead} label="Duplicate" keys="Ctrl+D" hint="A copy just beside it, ready to drag." onClick={duplicateSel}>
                  {I.duplicate}
                </Btn>
                <Btn lead={lead} label="Bring to front" onClick={frontSel}>
                  {I.front}
                </Btn>
                <Divider lead={lead} />
                <Btn lead={lead} label="Delete" keys="Delete" onClick={deleteSel} className={DANGER}>
                  {I.trash}
                </Btn>
              </>
            )}
            {/* Fit, when part of it is off the screen (shown by the placer). */}
            {kind !== "picture" && (
              <button ref={groupFitRef} type="button" aria-label="Fit: show all of it" {...tipOn("Fit", undefined, "Zoom to show all of it.")} onPointerDown={palmDown} onClick={() => !palmBlocked() && fitSel()} style={{ display: "none" }} className={`${PRESS} ${QUIET} ${ctl}`}>
                {I.fit}
              </button>
            )}
          </div>
        )}
        {/* The four inks for the selection (or the words being typed): a capsule 8 px above the chip. */}
        {colorAt && (
          <div
            data-color-menu
            data-typing-ui
            className={`${BAR(lead)} wb-pop fixed z-40 -translate-x-1/2 -translate-y-full`}
            style={{ left: colorAt.x, top: colorAt.y }}
            onPointerDown={(e) => colorAt.for === "typing" && e.preventDefault()}
            onMouseDown={(e) => colorAt.for === "typing" && e.preventDefault()}
          >
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                data-v={c.value}
                aria-label={`${inkName(c.name, dark)} ink`}
                aria-pressed={colorNow === c.value}
                {...tipOn(`${inkName(c.name, dark)} ink`)}
                onPointerDown={palmDown}
                onClick={onColorPick}
                className={`${PRESS} ${ctl} hover:bg-[var(--bd-hover)]`}
              >
                <Swatch ink={inkOf(c.value)} on={colorNow === c.value} size={lead ? 28 : 22} />
              </button>
            ))}
          </div>
        )}

        {/* The Line tool in hand (L): Solid or Dotted for the next line, beside the tools. */}
        {tool === "line" && (
          <div
            data-line-style
            role="group"
            aria-label="Line style"
            className={`${BAR(lead)} wb-pop absolute ${lead ? "left-[72px]" : "bottom-[76px] left-1/2 -translate-x-1/2"}`}
            style={lead ? { top: railTop } : undefined}
          >
            <Btn lead={lead} label="Solid line" tip="Solid" keys="D" hint="For the next line you draw." pressed={!lineDotted} onClick={() => setLineDotted(false)} className={!lineDotted ? ON : QUIET}>
              {I.solid}
            </Btn>
            <Btn lead={lead} label="Dotted line" tip="Dotted" keys="D" hint="For the next line you draw." pressed={lineDotted} onClick={() => setLineDotted(true)} className={lineDotted ? ON : QUIET}>
              {I.dotted}
            </Btn>
          </div>
        )}

        {/* Top: the page and the history on the left, the view on the right. */}
        <div ref={topBarRef} className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <div className="flex min-w-0 items-start gap-2">
            {/* The page: each class has its own, always there. Tap the name for the list of pages (and
                Clear page / Delete page at its end); the arrows step through them, + starts a blank one. */}
            <div className={`${BAR(lead)} pointer-events-auto relative z-30 shrink-0`}>
              <Btn lead={lead} label="Previous page" keys="[" onClick={() => stepPage(-1)} disabled={pageIndex <= 0}>
                {I.prev}
              </Btn>
              <button
                ref={pageNameRef}
                type="button"
                onClick={() => setPagesOpen((v) => !v)}
                aria-expanded={pagesOpen}
                data-pages-menu
                aria-haspopup="listbox"
                {...tipOn("All pages", undefined, pageList.length > 1 ? `Page ${pageIndex + 1} of ${pageList.length}` : undefined)}
                className={`${PRESS} flex max-w-[34vw] shrink-0 items-center justify-center gap-1.5 rounded-full pl-4 pr-3 font-semibold tracking-[-0.005em] ${lead ? "h-11 text-sm" : `h-9 text-[13px] ${HIT}`} ${pagesOpen ? ON : "hover:bg-[var(--bd-hover)]"}`}
              >
                <span className="truncate">{page.title}</span>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center text-[color:var(--bd-fg-3)] transition-transform duration-200 motion-reduce:transition-none [&_svg]:!h-4 [&_svg]:!w-4 ${pagesOpen ? "rotate-180" : ""}`}>{I.chevronDown}</span>
              </button>
              <Btn lead={lead} label="Next page" keys="]" onClick={() => stepPage(1)} disabled={pageIndex >= pageList.length - 1}>
                {I.next}
              </Btn>
              <Btn lead={lead} label="New blank page" keys="N" onClick={newPage}>
                {I.plus}
              </Btn>
              {pagesOpen && (
                <div data-pages-menu className={`${CARD} wb-pop absolute left-0 top-[calc(100%+8px)] z-50 w-72 origin-top-left`}>
                  <ul role="listbox" aria-label="Pages" className="max-h-[60vh] overflow-y-auto [scrollbar-width:thin]">
                    {pageList.map((x) => (
                      <li key={x.id} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={x.id === page.id}
                          onClick={() => {
                            setPagesOpen(false);
                            openPage(x, true);
                          }}
                          className={`${MENU_ROW(lead)} gap-2.5 ${x.id === page.id ? ON : "text-[color:var(--bd-fg)] hover:bg-[var(--bd-hover)]"}`}
                        >
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${x.id === page.id ? "bg-[#FBC159]" : "bg-transparent"}`} aria-hidden />
                          <span className="truncate">{x.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <span className="mx-3.5 my-1.5 block h-px bg-[var(--bd-divider)]" aria-hidden />
                  <button
                    type="button"
                    disabled={!hasContent}
                    onClick={() => {
                      setPagesOpen(false);
                      setConfirmClear(true);
                    }}
                    className={`${MENU_ROW(lead)} ${DANGER}`}
                  >
                    Clear page
                  </button>
                  {page.id !== MAIN_PAGE.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setPagesOpen(false);
                        setConfirmDelete(true);
                      }}
                      className={`${MENU_ROW(lead)} ${DANGER}`}
                    >
                      Delete page
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Undo and redo, beside the page name. */}
            <div className={`${BAR(lead)} pointer-events-auto shrink-0`}>
              <Btn lead={lead} label="Undo (Ctrl+Z)" tip="Undo" keys="Ctrl+Z" disabled={!meta.undo} onClick={undo}>
                {I.undo}
              </Btn>
              <Btn lead={lead} label="Redo (Ctrl+Shift+Z)" tip="Redo" keys="Ctrl+Shift+Z" disabled={!meta.redo} onClick={redo}>
                {I.redo}
              </Btn>
            </div>
          </div>
          <div ref={sidePanelRef} className={`${BAR(lead)} pointer-events-auto relative shrink-0`}>
            {!lead && away && (
              <button
                type="button"
                onClick={() => followLast(false)}
                {...tipOn("Back to the tablet's view", undefined, "This screen was moved by hand. It also goes back by itself when the tablet moves.")}
                className={`${PRESS} ${TOOL_ON} ${HIT} relative h-9 rounded-full px-3.5 text-[13px] font-semibold`}
              >
                Tablet view
              </button>
            )}
            <button
              type="button"
              onClick={fit}
              aria-label={`Zoom ${zoom}%. Fit the whole board`}
              {...tipOn("Fit the whole board", undefined, "Shows everything on this page")}
              className={`${PRESS} ${QUIET} relative flex w-16 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${lead ? "h-11" : `h-9 ${HIT}`}`}
            >
              {zoom}%
            </button>
            <button
              type="button"
              data-paper-menu
              onClick={() => setPaperOpen((v) => !v)}
              aria-expanded={paperOpen}
              aria-haspopup="menu"
              aria-label={dark ? "Board: dark" : "Board: light"}
              {...tipOn("Paper", undefined, `Plain, dots, lines or squared, on a light or dark board. The ${lead ? "laptop" : "tablet"} changes too.`)}
              className={`${PRESS} ${ctl} ${paperOpen ? ON : QUIET}`}
            >
              <span
                aria-hidden
                className="block h-5 w-5 rounded-[6px]"
                style={{ backgroundColor: THEMES[look].bg, boxShadow: "inset 0 0 0 1px var(--bd-divider), 0 0 0 1px var(--bd-divider)", ...PAPER_SWATCH[paper](dark ? "rgba(240,237,232,0.34)" : "rgba(26,29,32,0.28)", 5) }}
              />
            </button>
            <Btn lead={lead} label="Hide the tools for a clean shared screen" tip="Hide the tools" keys="H" onClick={() => setToolsHidden(true)}>
              {I.hide}
            </Btn>
            {/* The board: light or dark (the paper is always the dotted one). */}
            {paperOpen && (
              <div data-paper-menu role="menu" aria-label="Paper" className={`${CARD} wb-pop absolute right-0 top-[calc(100%+8px)] z-50 w-[236px] origin-top-right`}>
                <div className="grid grid-cols-2 gap-1 rounded-[14px] bg-[var(--bd-on)] p-1" role="group" aria-label="Board">
                  <button type="button" role="menuitemradio" aria-checked={!dark} data-v="light" onClick={onPickTone} className={`${PRESS} h-9 rounded-[10px] text-[13px] font-semibold ${!dark ? `${PANEL}` : "text-[color:var(--bd-fg-2)] hover:text-[color:var(--bd-fg)]"}`}>
                    Light board
                  </button>
                  <button type="button" role="menuitemradio" aria-checked={dark} data-v="dark" onClick={onPickTone} className={`${PRESS} h-9 rounded-[10px] text-[13px] font-semibold ${dark ? `${PANEL}` : "text-[color:var(--bd-fg-2)] hover:text-[color:var(--bd-fg)]"}`}>
                    Dark board
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* The tools and the inks. The tablet: two capsules down the left edge, away from the writing
            hand (Hamza is right-handed). The laptop: side by side along the bottom. */}
        <div
          ref={toolbarRef}
          className={`absolute flex gap-3 ${lead ? "left-3 flex-col" : "bottom-4 left-1/2 max-w-[calc(100vw-24px)] -translate-x-1/2 items-center"}`}
          style={lead ? { top: railTop } : undefined}
        >
          {/* Tools: the one in hand sits on a gold disc that slides between them. */}
          <div className={`${BAR(lead)} relative ${lead ? "flex-col" : ""}`}>
            <span
              aria-hidden
              className={`wb-disc pointer-events-none absolute left-1 top-1 rounded-full ${TOOL_ON} ${lead ? "h-11 w-11" : "h-9 w-9"}`}
              style={{ transform: lead ? `translateY(${Math.max(0, toolIndex) * step}px)` : `translateX(${Math.max(0, toolIndex) * step}px)`, opacity: toolIndex < 0 ? 0 : 1 }}
            />
            {toolButtons.map((b, i) => (
              <button
                key={b.id}
                type="button"
                data-k={b.id}
                aria-label={b.label}
                aria-pressed={toolIndex === i}
                {...tipOn(b.tip, b.keys, b.hint)}
                onPointerDown={palmDown}
                onClick={onToolButton}
                className={`${PRESS} ${ctl} ${toolIndex === i ? "wb-tool-on text-[color:var(--bd-tool-fg)] transition-[color] duration-300" : QUIET}`}
              >
                {b.icon}
                {/* The Pen shows the ink in hand at its nib, whatever tool is on. */}
                {b.id === "pen" && <span aria-hidden className={`absolute rounded-full ${lead ? "left-[13px] top-[27px] h-1.5 w-1.5" : "left-[10px] top-[22px] h-[5px] w-[5px]"}`} style={{ background: inkNow, boxShadow: "0 0 0 1.5px var(--bd-panel)" }} />}
              </button>
            ))}
            <button
              type="button"
              data-insert-menu
              aria-label="Insert a picture, PDF, past paper or notes"
              aria-expanded={insertOpen}
              aria-haspopup="menu"
              {...tipOn("Insert", undefined, lead ? "A picture or PDF, a past paper, or notes." : "A picture or PDF, a past paper, or notes. Or paste one (Ctrl+V), or drop a file on the board.")}
              onPointerDown={palmDown}
              onClick={(e) => {
                if (palmBlocked()) return;
                // Its menu: 8 px right of the rail, its top level with this button (the laptop: centred, 8 px above the bar).
                const r = e.currentTarget.getBoundingClientRect();
                setInsertAt(lead ? { left: Math.round(r.right + 4 + 8), top: Math.round(r.top) } : { left: Math.round(r.left + r.width / 2 - 124), bottom: Math.round(window.innerHeight - r.top + 4 + 8) });
                setInsertOpen((v) => !v);
              }}
              disabled={!!busy}
              className={`${PRESS} ${ctl} ${insertOpen ? ON : QUIET}`}
            >
              {busy ? <Spinner size={lead ? 20 : 18} className="text-[color:var(--bd-fg-2)]" /> : I.insert}
            </button>
          </div>
          {/* Inks: the chosen one ringed in its own colour; then the thickness, drawn in that ink. */}
          <div className={`${BAR(lead)} ${lead ? "flex-col" : ""}`}>
            {inksFolded ? (
              <button
                type="button"
                data-inks-menu
                aria-label="Inks"
                aria-expanded={inksOpen}
                {...tipOn("Inks")}
                onPointerDown={palmDown}
                onClick={() => !palmBlocked() && setInksOpen((v) => !v)}
                className={`${PRESS} ${ctl} ${inksOpen ? ON : "hover:bg-[var(--bd-hover)]"}`}
              >
                <Swatch ink={inkNow} on={!marker} size={28} />
              </button>
            ) : (
              COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  data-v={c.value}
                  aria-label={`${inkName(c.name, dark)} ink`}
                  aria-pressed={color === c.value}
                  {...tipOn(`${inkName(c.name, dark)} ink`, String(COLORS.indexOf(c) + 1))}
                  onPointerDown={palmDown}
                  onClick={onInkPick}
                  className={`${PRESS} ${ctl} hover:bg-[var(--bd-hover)]`}
                >
                  <Swatch ink={inkOf(c.value)} on={color === c.value} size={lead ? 28 : 22} />
                </button>
              ))
            )}
            <button
              type="button"
              data-size-menu
              aria-label="Pen thickness"
              aria-expanded={!!sizeAt}
              {...tipOn("Thickness")}
              onPointerDown={palmDown}
              onClick={(e) => {
                if (palmBlocked()) return;
                const r = e.currentTarget.getBoundingClientRect();
                // Beside the rail, centred on this chip (the laptop: 8 px above the bar, centred).
                setSizeAt(sizeAt ? null : lead ? { x: Math.round(r.right + 4 + 8), y: Math.round(r.top + r.height / 2 - 26) } : { x: Math.round(r.left + r.width / 2 - 134), y: Math.round(r.top - 4 - 8 - 44) });
              }}
              className={`${PRESS} ${ctl} ${sizeAt ? ON : "hover:bg-[var(--bd-hover)]"}`}
            >
              <span aria-hidden className="block w-5" style={{ height: thick, borderRadius: thick / 2, background: inkNow }} />
            </button>
          </div>
        </div>

        {/* The inks, folded out beside their chip (a short window). */}
        {inksOpen && inksFolded && (
          <div data-inks-menu className={`${BAR(lead)} wb-pop fixed z-40`} style={{ left: 72, top: railTop + 282 + 12 }}>
            {COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                data-v={c.value}
                aria-label={`${inkName(c.name, dark)} ink`}
                aria-pressed={color === c.value}
                onPointerDown={palmDown}
                onClick={onInkPick}
                className={`${PRESS} ${ctl} hover:bg-[var(--bd-hover)]`}
              >
                <Swatch ink={inkOf(c.value)} on={color === c.value} size={28} />
              </button>
            ))}
          </div>
        )}

        {/* Insert: a picture or PDF from this device, a past paper, or notes. */}
        {insertOpen && (
          <div
            data-insert-menu
            role="menu"
            aria-label="Insert"
            className={`${CARD} wb-pop fixed z-50 w-[248px] ${lead ? "origin-top-left" : "origin-bottom"}`}
            style={insertAt}
          >
            {(
              [
                ["picture", I.picture, "Picture or PDF"],
                ["papers", I.pastPaper, "Past paper"],
                ["notes", I.notes, "Notes"],
              ] as const
            ).map(([k, icon, label]) => (
              <button
                key={k}
                type="button"
                role="menuitem"
                data-k={k}
                onPointerDown={palmDown}
                onClick={onInsertRow}
                className={`${PRESS} flex w-full items-center gap-3 rounded-[14px] px-3.5 text-left text-sm font-semibold hover:bg-[var(--bd-hover)] ${lead ? "h-[52px]" : "h-11"}`}
              >
                <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center text-[color:var(--bd-fg-2)] [&_svg]:h-[22px] [&_svg]:w-[22px]">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Pen thickness: one slider, thin to large. The track is a wedge, filled up to the knob; the
            knob stays one size (whole steps 2 to 16). */}
        {sizeAt && (
          <div data-size-menu className={`${BAR(lead)} wb-pop fixed z-40 px-4`} style={{ left: sizeAt.x, top: sizeAt.y }}>
            <div
              role="slider"
              aria-label="Pen thickness, thin to large"
              aria-valuemin={PEN_MIN}
              aria-valuemax={PEN_MAX}
              aria-valuenow={size}
              onPointerDown={onSizeDrag}
              onPointerMove={onSizeDrag}
              className={`relative w-[236px] cursor-pointer touch-none ${lead ? "h-11" : "h-9"}`}
            >
              <svg aria-hidden viewBox="0 0 236 44" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                <defs>
                  <clipPath id="wb-wedge">
                    <path d="M12 21 L224 14 A8 8 0 0 1 224 30 L12 23 A1 1 0 0 1 12 21Z" />
                  </clipPath>
                </defs>
                <g clipPath="url(#wb-wedge)">
                  <rect x="0" y="0" width="236" height="44" fill="var(--bd-fg)" opacity="0.14" />
                  <rect x="0" y="0" width={12 + ((size - PEN_MIN) / (PEN_MAX - PEN_MIN)) * 212} height="44" fill="var(--bd-fg)" />
                </g>
              </svg>
              <span
                aria-hidden
                className="absolute top-1/2 block h-6 w-6 rounded-full bg-[#fff] shadow-[0_0_0_1px_rgba(20,22,24,0.12),0_1px_3px_rgba(20,22,24,0.25)]"
                style={{ left: Math.round(((size - PEN_MIN) / (PEN_MAX - PEN_MIN)) * 212), transform: "translateY(-50%)" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* A blank page on the tablet: centred on the free board, gone with the first stroke. Not on the
          laptop, whose screen the class sees. */}
      {lead && !hasContent && !typing && !inking && !toolsHidden && !quiet && (
        <div className="wb-fade pointer-events-none absolute inset-y-0 right-0 flex flex-col items-center justify-center text-center" style={{ left: 64 }} aria-hidden>
          <p className="text-base font-semibold tracking-[-0.01em] text-[color:var(--bd-fg)] opacity-[0.36]">Write anywhere</p>
          <svg width="72" height="8" viewBox="0 0 72 8" className="mt-2 text-[color:var(--bd-fg)] opacity-[0.18]" fill="none">
            <path d="M2 5.5c14-2.6 38-3.6 68-1.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <p className="mt-2.5 text-xs font-medium text-[color:var(--bd-fg)] opacity-30">Pen draws · {fingerDraws ? "fingers draw too" : "fingers move the board"}</p>
        </div>
      )}

      <BoardTip />

      {/* Short messages: "Undone", upload progress, errors */}
      {(notice || busy || linkLost) && (
        <div className={`${PANEL} wb-toast pointer-events-none absolute left-1/2 flex h-10 items-center gap-2 rounded-full px-4 text-[13px] font-semibold ${lead ? "bottom-4" : "bottom-[76px]"}`} role="status">
          {busy && <Spinner size={16} className="text-[color:var(--bd-fg-2)]" />}
          {notice ?? busy ?? "Laptop link lost. Your writing is safe here."}
        </div>
      )}

      {/* Pen diagnostics (?debug=1): what the tablet reports for the pen and its button */}
      {debug && (
        <div className="pointer-events-none absolute left-4 top-20 max-w-[90vw] rounded-lg bg-black/80 px-3 py-2 font-mono text-[11px] text-[#7FD1A6]">{debug}</div>
      )}

      {/* Past papers and notes, from the Insert menu. */}
      <LibraryPicker key={library ?? "closed"} open={!!library} onClose={() => setLibrary(null)} onPick={placeLibraryPages} big={lead} dark={dark} hint={page.title} startTab={library ?? "papers"} />

      {/* Delete page confirm */}
      {confirmDelete && (
        <div className="wb-fade absolute inset-0 z-[70] flex items-center justify-center bg-[rgba(20,22,24,0.28)] px-4" onClick={() => setConfirmDelete(false)}>
          <div role="alertdialog" aria-modal="true" aria-label="Delete this page" className="wb-pop w-[360px] max-w-full rounded-[20px] bg-[var(--bd-panel)] p-6 text-center text-[color:var(--bd-fg)] [box-shadow:var(--bd-dialog-shadow)]" onClick={(e) => e.stopPropagation()}>
            <p className="text-[17px] font-bold tracking-[-0.01em]">Delete &ldquo;{page.title}&rdquo;?</p>
            <p className="mt-1.5 text-sm leading-normal text-[color:var(--bd-fg-2)]">
              {page.classId ? "Its writing goes for good, on your laptop too. The class keeps its page, empty." : "The page and its writing go for good, on your laptop too."}
            </p>
            <div className="mt-6 flex gap-2">
              <button type="button" autoFocus onClick={() => setConfirmDelete(false)} className={`${PRESS} h-11 flex-1 rounded-full bg-[var(--bd-on)] text-sm font-semibold`}>
                Cancel
              </button>
              <button type="button" onClick={deletePage} className={`${PRESS} h-11 flex-1 rounded-full bg-[#C2382C] text-sm font-semibold text-[#fff] hover:bg-[#D0453A]`}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear confirm */}
      {confirmClear && (
        <div className="wb-fade absolute inset-0 z-[70] flex items-center justify-center bg-[rgba(20,22,24,0.28)] px-4" onClick={() => setConfirmClear(false)}>
          <div role="alertdialog" aria-modal="true" aria-label="Clear the whole page" className="wb-pop w-[360px] max-w-full rounded-[20px] bg-[var(--bd-panel)] p-6 text-center text-[color:var(--bd-fg)] [box-shadow:var(--bd-dialog-shadow)]" onClick={(e) => e.stopPropagation()}>
            <p className="text-[17px] font-bold tracking-[-0.01em]">Clear the whole page?</p>
            <p className="mt-1.5 text-sm leading-normal text-[color:var(--bd-fg-2)]">Writing and pictures go. Undo brings them back.</p>
            <div className="mt-6 flex gap-2">
              <button type="button" autoFocus onClick={() => setConfirmClear(false)} className={`${PRESS} h-11 flex-1 rounded-full bg-[var(--bd-on)] text-sm font-semibold`}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAll();
                  setConfirmClear(false);
                }}
                className={`${PRESS} h-11 flex-1 rounded-full bg-[var(--bd-solid)] text-sm font-semibold text-[color:var(--bd-solid-fg)] hover:opacity-90`}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- viewer

export function ViewerBoard({ room, present = false }: { room: string; present?: boolean }) {
  const strokes = useRef<Stroke[]>([]);
  const images = useRef<BoardImage[]>([]);
  const live = useRef<Stroke | null>(null);
  const cam = useRef<Camera>({ x: -60, y: -60, z: 1 });
  const teacherView = useRef<View | null>(null);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  const [teacherHere, setTeacherHere] = useState(false);
  const [got, setGot] = useState(false);
  const look: ThemeId = "paper";
  const [ledger] = useState(() => new Ledger(0));

  const { canvasRef, size: screen, requestDraw } = useCanvas((ctx, w, h, again) =>
    paint(ctx, w, h, cam.current, images.current, strokes.current, [live.current], again),
  );

  // Following the tablet: each position update sets a target, and the camera
  // glides to it at screen speed (60 fps), so panning and zooming look smooth
  // on the shared laptop screen instead of jumping in steps.
  const target = useRef<Camera | null>(null);
  const gliding = useRef(false);
  const glideStep = useRef<() => void>(() => {});
  useEffect(() => {
    glideStep.current = () => {
      const t = target.current;
      if (!t) {
        gliding.current = false;
        return;
      }
      const c = cam.current;
      const k = 0.38;
      const next = { x: c.x + (t.x - c.x) * k, y: c.y + (t.y - c.y) * k, z: c.z + (t.z - c.z) * k };
      const done = Math.abs(t.x - next.x) * next.z < 0.25 && Math.abs(t.y - next.y) * next.z < 0.25 && Math.abs(t.z - next.z) < 0.0008;
      cam.current = done ? t : next;
      requestDraw();
      if (done) gliding.current = false;
      else requestAnimationFrame(() => glideStep.current());
    };
  }, [requestDraw]);
  const viewerBarRef = useRef<HTMLDivElement>(null);
  // Held in a ref so the live connection never has to restart to use it.
  const followFn = useRef<(jump?: boolean) => void>(() => {});
  useEffect(() => {
    followFn.current = (jump = false) => {
      const v = teacherView.current;
      const { w, h } = screen.current;
      if (!v || !w || !h) return;
      target.current = fitView(v, w, h, clearInset(h, [viewerBarRef.current], []));
      if (jump) {
        cam.current = target.current;
        requestDraw();
        return;
      }
      if (!gliding.current) {
        gliding.current = true;
        requestAnimationFrame(() => glideStep.current());
      }
    };
  }, [screen, requestDraw]);

  useEffect(() => {
    const linkRef: { l: BoardLink | null } = { l: null };
    let behind = 0;
    const l = connectBoard(
      room,
      "viewer",
      (m) => {
        if (m.t === "set") {
          ledger.hear(m.q);
          strokes.current = m.strokes;
          images.current = m.images ?? [];
          live.current = null;
          if (m.q !== undefined) ledger.reset(m.q);
          setGot(true);
        } else if (m.t === "add") {
          if (!ledger.fresh(m.s.id, m.q)) return;
          strokes.current = [...strokes.current.filter((s) => s.id !== m.s.id), m.s];
          if (live.current?.id === m.s.id) live.current = null;
          setGot(true);
        } else if (m.t === "del") {
          const ids = new Set(m.ids.filter((id) => ledger.fresh(id, m.q)));
          if (!ids.size) return;
          strokes.current = strokes.current.filter((s) => !ids.has(s.id));
          if (live.current && ids.has(live.current.id)) live.current = null;
        } else if (m.t === "clear") {
          if (m.q !== undefined) {
            if (!ledger.fresh("*clear", m.q)) return;
            ledger.reset(m.q);
          }
          strokes.current = [];
          images.current = [];
          live.current = null;
        } else if (m.t === "live") {
          if (ledger.known(m.s.id) || m.from) return;
          live.current = m.s;
          setGot(true);
        } else if (m.t === "img") {
          if (!ledger.fresh(m.m.id, m.q)) return;
          images.current = [...images.current.filter((x) => x.id !== m.m.id), m.m];
          setGot(true);
        } else if (m.t === "imgdel") {
          const ids = new Set(m.ids.filter((id) => ledger.fresh(id, m.q)));
          if (!ids.size) return;
          images.current = images.current.filter((x) => !ids.has(x.id));
        } else if (m.t === "theme") {
          // one light board now
        } else if (m.t === "view") {
          teacherView.current = m.v;
          if (followRef.current) followFn.current();
        } else if (m.t === "rev") {
          // Self-check: behind twice in a row (not just a stroke in flight)? Fetch the whole board again.
          const shared = images.current.filter((x) => !x.url.startsWith("blob:"));
          // (A tablet that sends `d2` is checked against where things are, too; an older one as before.)
          const same =
            m.d2 !== undefined
              ? boardDigest(strokes.current.map(packOnce), shared, true) === m.d2
              : m.d !== undefined
              ? boardDigest(strokes.current, shared) === m.d
              : strokes.current.length + shared.length === m.n && (strokes.current[strokes.current.length - 1]?.id ?? "") === m.last;
          behind = same ? 0 : behind + 1;
          if (behind >= 2) {
            behind = 0;
            linkRef.l?.send({ t: "hello" });
          }
          return;
        }
        requestDraw();
      },
      (_n, t) => setTeacherHere(t > 0),
    );
    linkRef.l = l;
    return () => l.close();
  }, [room, requestDraw, ledger]);

  // The laptop window changes size (going full screen to share): re-fit at once.
  useEffect(() => {
    const onResize = () => followRef.current && setTimeout(() => followFn.current(true), 50);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Students can look around; doing so stops following until they tap "Follow".
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number } | null>(null);
  const stopFollow = () => {
    followRef.current = false;
    setFollow(false);
  };
  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div className="fixed inset-0 select-none overflow-hidden text-[#f0ede8]" style={{ background: THEMES[look].bg, ...CHROME.dark }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => {
          if (present) return;
          const [x, y] = local(e);
          touches.current.set(e.pointerId, { x, y });
          if (touches.current.size === 2) {
            const [a, b] = [...touches.current.values()];
            pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
          }
          capture(canvasRef.current, e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!touches.current.has(e.pointerId)) return;
          const [x, y] = local(e);
          const prev = touches.current.get(e.pointerId)!;
          touches.current.set(e.pointerId, { x, y });
          if (Math.hypot(x - prev.x, y - prev.y) > 0.5) stopFollow();
          if (touches.current.size === 1) {
            cam.current = { ...cam.current, x: cam.current.x - ((x - prev.x) * PAN_GAIN) / cam.current.z, y: cam.current.y - ((y - prev.y) * PAN_GAIN) / cam.current.z };
          } else if (touches.current.size === 2 && pinch.current) {
            const [a, b] = [...touches.current.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            const cx = (a.x + b.x) / 2;
            const cy = (a.y + b.y) / 2;
            let c = zoomAt(cam.current, d / pinch.current.d, cx, cy);
            c = { ...c, x: c.x - (cx - pinch.current.cx) / c.z, y: c.y - (cy - pinch.current.cy) / c.z };
            cam.current = c;
            pinch.current = { d, cx, cy };
          }
          requestDraw();
        }}
        onPointerUp={(e) => {
          touches.current.delete(e.pointerId);
          if (touches.current.size < 2) pinch.current = null;
        }}
        onPointerCancel={(e) => touches.current.delete(e.pointerId)}
        onWheel={(e) => {
          if (present) return;
          stopFollow();
          const [x, y] = local(e);
          if (e.ctrlKey || e.metaKey) cam.current = zoomAt(cam.current, Math.exp(-e.deltaY * 0.01), x, y);
          else cam.current = { ...cam.current, x: cam.current.x + e.deltaX / cam.current.z, y: cam.current.y + e.deltaY / cam.current.z };
          requestDraw();
        }}
      />

      {/* Present mode (screen-sharing from the laptop): just the board and a small mark. */}
      {present && (
        <span style={{ fontFamily: "var(--font-caveat)" }} className="pointer-events-none absolute bottom-4 right-5 text-lg text-[#FBC159]/60">
          hamzateaches
        </span>
      )}
      <div ref={viewerBarRef} className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4 ${present ? "hidden" : ""}`}>
        <div className={`${PANEL} flex h-11 items-center gap-3 px-4`}>
          <span style={{ fontFamily: "var(--font-caveat)" }} className="text-xl leading-none text-[#FBC159]">
            hamzateaches
          </span>
          <span className="h-4 w-px bg-white/[0.12]" />
          <span className="flex items-center gap-2 text-xs font-semibold text-white/70" role="status">
            <span className={`h-2 w-2 rounded-full ${teacherHere ? "bg-[#F07A6A] shadow-[0_0_0_3px_rgba(240,122,106,0.2)]" : "bg-white/25"}`} />
            {teacherHere ? "Live" : "Waiting for Hamza"}
          </span>
        </div>
      </div>

      {!got && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-[15px] font-medium tracking-[-0.01em] text-[#1B1E21]/45">The board appears here as Hamza writes.</p>
        </div>
      )}

      {!follow && !present && (
        <button
          type="button"
          onClick={() => {
            followRef.current = true;
            setFollow(true);
            followFn.current();
          }}
          className={`absolute bottom-5 left-1/2 h-11 -translate-x-1/2 animate-[scale-in_160ms_ease-out] rounded-full transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1E21]/40 focus-visible:ring-offset-2 bg-[#FBC159] px-5 text-sm font-bold text-[#1B1E21] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_28px_-12px_rgba(20,22,24,0.45)] hover:bg-[#FFD07A] active:bg-[#E5A832] motion-reduce:animate-none`}
        >
          Follow Hamza&apos;s board
        </button>
      )}
    </div>
  );
}
