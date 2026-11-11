"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import {
  COLORS,
  SIZES,
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
  BACKDROP_NAME,
  drawGrid,
  HIGHLIGHT,
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
} from "@/components/board/engine";
import { boardDigest, connectBoard, Ledger, viewerRoom, type BoardLink, type BoardMsg } from "@/components/board/sync";
import { deleteBoard, loadBoard, loadIndex, saveBoard, saveIndex, type BoardPage } from "@/components/board/storage";
import { useDatabase } from "@/lib/data/store";
import { LEVEL_LABEL, classBoardPages, classPageId, liveSlotsOn, pkDate, slotKey } from "@/lib/timetable";
import { useSchedule } from "@/lib/classes";
import { cloudinaryConfigured, uploadImage, uploadPdfPages } from "@/lib/cloudinary";
import { shrinkImage } from "@/lib/shrink-image";

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
const ERASER_PX = 14;
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
const PAGE_CHANGES = new Set<BoardMsg["t"]>(["add", "del", "img", "imgdel", "clear", "set", "live"]);
/** Every change says which page it's for (see BoardMsg.pg). */
function tagPage(m: BoardMsg, pg: string): BoardMsg {
  if (m.t === "batch") return { ...m, ms: m.ms.map((x) => tagPage(x, pg)) };
  return PAGE_CHANGES.has(m.t) ? { ...m, pg } : m;
}
const PAN_GAIN = 1.15;
const HANDLE_PX = 22;
/** A finger held still this long on typed words picks them up (then they follow the finger). */
const LIFT_MS = 380;

type Tool = "pen" | "line" | "axes" | "eraser" | "move" | "text";
type Action =
  | { type: "add"; s: Stroke }
  | { type: "erase"; s: Stroke[] }
  | { type: "replace"; before: Stroke[]; after: Stroke[] }
  | { type: "clear"; s: Stroke[]; m: BoardImage[] }
  | { type: "img-add"; m: BoardImage[] }
  | { type: "img-del"; m: BoardImage }
  | { type: "img-edit"; before: BoardImage; after: BoardImage };

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
      dirty.current = false;
      const ctx = (c.getContext("2d", { alpha: false }) ?? c.getContext("2d"))!;
      const { w, h, dpr } = size.current;
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
      if (dirty.current) paintNow();
      raf = requestAnimationFrame(loop);
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

const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const I = {
  pen: svg(
    <>
      <path d="M4 20l1.2-4.4L15.6 5.2a2 2 0 012.8 0l.4.4a2 2 0 010 2.8L8.4 18.8 4 20z" />
      <path d="M13.8 7l3.2 3.2" />
    </>,
  ),
  line: svg(
    <>
      <path d="M5 19L19 5" />
      <circle cx="5" cy="19" r="1.6" fill="currentColor" />
      <circle cx="19" cy="5" r="1.6" fill="currentColor" />
    </>,
  ),
  eraser: svg(
    <>
      <path d="M8.5 19.5h11M4.6 14.6l8.8-8.8a2 2 0 012.8 0l2.5 2.5a2 2 0 010 2.8l-7.3 7.3a2 2 0 01-1.4.6H8.3a2 2 0 01-1.4-.6l-2.3-2.3a1 1 0 010-1.5z" />
      <path d="M9.5 9.7l4.8 4.8" />
    </>,
  ),
  text: svg(
    <>
      <path d="M5 6.5V5h14v1.5M12 5v14M9.5 19h5" />
    </>,
  ),
  hide: svg(
    <>
      <path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0112 6c5 0 8.5 4.5 9.5 6-.5.8-1.6 2.3-3.2 3.6M6.4 7.6C4.5 8.9 3.1 10.8 2.5 12c1 1.5 4.5 6 9.5 6 1.5 0 2.9-.4 4.1-1" />
      <path d="M9.9 10a3 3 0 004.2 4.1" />
    </>,
  ),
  move: svg(
    <>
      <path d="M12 3v18M3 12h18" />
      <path d="M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3" />
    </>,
  ),
  insert: svg(
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M20.5 15.5l-4.5-4.5-8.5 8.5" />
    </>,
  ),
  undo: svg(
    <>
      <path d="M9 7L4.5 11.5 9 16" />
      <path d="M5 11.5h9.5a5 5 0 010 10H12" />
    </>,
  ),
  redo: svg(
    <>
      <path d="M15 7l4.5 4.5L15 16" />
      <path d="M19 11.5H9.5a5 5 0 000 10H12" />
    </>,
  ),
  trash: svg(<path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l.8 12a1.5 1.5 0 001.5 1.4h6.4a1.5 1.5 0 001.5-1.4l.8-12" />),
  fit: svg(<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />),
  axes: svg(<path d="M5 3.5V19h15.5M3 6l2-2.5L7 6M18 17l2.5 2-2.5 2" />),
  prev: svg(<path d="M14.5 6l-6 6 6 6" />),
  next: svg(<path d="M9.5 6l6 6-6 6" />),
  plus: svg(<path d="M12 5.5v13M5.5 12h13" />),
  down: svg(<path d="M6.5 6.5L12 12l5.5-5.5M6.5 12.5L12 18l5.5-5.5" />),
  link: svg(
    <>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
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
// The two line styles, as small pictures for their buttons.
const LINE_SOLID = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <path d="M2 8h12" />
  </svg>
);
const LINE_DOTTED = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
    <path d="M2 8h2M7 8h2M12 8h2" />
  </svg>
);
const palmDown = (e: React.PointerEvent) => {
  if (e.pointerType === "touch" && (Date.now() - penAt < 1500 || e.width > PALM_SIZE_PX || e.height > PALM_SIZE_PX)) palmUntil = Date.now() + 700;
};
const palmBlocked = () => Date.now() < palmUntil;

// ---------------------------------------------------------------- chrome look
// The bars float over the paper as calm dark glass (the brand charcoal), so the light board
// stays the brightest thing on screen. Gold marks only the tool in hand and the one main action.

/** Every floating bar: charcoal glass, a 1px hairline, a faint top highlight, a soft shadow. */
const PANEL =
  "rounded-[18px] border border-white/[0.08] bg-[#1B1E21]/[0.88] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_1px_2px_rgba(20,22,24,0.16),0_14px_34px_-14px_rgba(20,22,24,0.5)] backdrop-blur-xl";
/** Press, hover and focus for every control on a bar (movement drops out with reduced motion). */
const PRESS =
  "relative transition-[background-color,color,transform,box-shadow,opacity] duration-150 ease-out active:scale-[0.94] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:pointer-events-none disabled:opacity-30";
/** A quiet control: muted, lifts to white on hover. */
const QUIET = "text-white/[0.68] hover:bg-white/[0.07] hover:text-white active:bg-white/[0.1]";
/** A neutral "on" state (a toggle that is on, the size in use, the open page). */
const ON = "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]";
/** The tool in hand: the brand gold, as a tint, not a fill. */
const GOLD_ON = "bg-[#FBC159]/[0.16] text-[#FBC159] shadow-[inset_0_0_0_1px_rgba(251,193,89,0.32)]";
/** What is selected (a picture, typed text): one calm gold frame, and one kind of handle dot. */
const SEL_FRAME = "rounded-[3px] shadow-[0_0_0_2px_#FBC159,0_0_0_6px_rgba(251,193,89,0.16)]";
const HANDLE_DOT = "block h-4 w-4 rounded-full border-2 border-[#FBC159] bg-white shadow-[0_1px_3px_rgba(20,22,24,0.35)]";
/** Makes a 36px control a 44px touch target without making it look bigger. */
const HIT = "before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']";

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
    const side: Tip["side"] = r.right < 120 && r.top > 64 ? "right" : r.top > window.innerHeight - 140 ? "top" : "bottom";
    const x = side === "right" ? r.right + 10 : r.left + r.width / 2;
    const y = side === "right" ? r.top + r.height / 2 : side === "top" ? r.top - 10 : r.bottom + 10;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => showTipNow?.({ label, keys, hint, x, y, side }), 320);
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
  const place =
    tip.side === "right" ? "-translate-y-1/2" : tip.side === "top" ? "-translate-x-1/2 -translate-y-full" : "-translate-x-1/2";
  return (
    <div role="tooltip" className={`pointer-events-none fixed z-[60] ${place}`} style={{ left: tip.x, top: tip.y }}>
      <div className="max-w-[260px] animate-[scale-in_140ms_ease-out] rounded-[10px] border border-white/[0.08] bg-[#141618]/95 px-2.5 py-1.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_24px_-10px_rgba(20,22,24,0.55)] motion-reduce:animate-none">
        <p className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold">
          {tip.label}
          {tip.keys && (
            <span className="flex gap-1">
              {tip.keys.split(" ").map((k) => (
                <kbd key={k} className="min-w-[18px] rounded-[5px] border border-white/[0.12] bg-white/[0.06] px-1 text-center font-sans text-[10.5px] font-semibold leading-[17px] text-white/75">
                  {k}
                </kbd>
              ))}
            </span>
          )}
        </p>
        {tip.hint && <p className="mt-0.5 text-[11px] leading-snug text-white/55">{tip.hint}</p>}
      </div>
    </div>
  );
}

function ToolButton({
  active,
  label,
  tip,
  keys,
  hint,
  onClick,
  disabled,
  children,
}: {
  active?: boolean;
  /** The full name screen readers hear. */
  label: string;
  /** The short name in the tooltip (defaults to the label). */
  tip?: string;
  keys?: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      {...tipOn(tip ?? label, keys, hint)}
      onPointerDown={palmDown}
      onClick={() => !palmBlocked() && onClick()}
      disabled={disabled}
      className={`${PRESS} flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] [&_svg]:h-[22px] [&_svg]:w-[22px] ${active ? GOLD_ON : QUIET}`}
    >
      {children}
    </button>
  );
}

/** `across`: a line across a vertical toolbar (the tablet's). */
const Divider = ({ across = false }: { across?: boolean }) => (
  <span className={across ? "my-1.5 h-px w-6 shrink-0 bg-white/[0.09]" : "mx-1.5 h-6 w-px shrink-0 bg-white/[0.09]"} aria-hidden />
);

/** One ink swatch: a hairline keeps the dark inks visible on the charcoal bar; the chosen one gets a white ring. */
function Swatch({ ink, on, size = 18 }: { ink: string; on: boolean; size?: number }) {
  return (
    <span
      className="block rounded-full transition-[transform,box-shadow] duration-150 ease-out motion-reduce:transition-none"
      style={{
        width: size,
        height: size,
        background: ink,
        transform: on ? "scale(1.12)" : undefined,
        boxShadow: on
          ? "inset 0 0 0 1px rgba(255,255,255,0.28), 0 0 0 2px #1B1E21, 0 0 0 3.5px rgba(255,255,255,0.92)"
          : "inset 0 0 0 1px rgba(255,255,255,0.3)",
      }}
    />
  );
}

/** The first ink is charcoal on the light board and white on the dark one: it is named for what is seen. */
const inkName = (name: string, dark: boolean) => (dark && name === "Black" ? "White" : name);

/** A small picture of each paper for the paper menu (the real print is drawn by the engine). */
const PAPER_SWATCH: Record<Backdrop, (ink: string) => React.CSSProperties> = {
  plain: () => ({}),
  dots: (ink) => ({ backgroundImage: `radial-gradient(circle, ${ink} 1px, transparent 1.4px)`, backgroundSize: "8px 8px", backgroundPosition: "center" }),
  lines: (ink) => ({ backgroundImage: `linear-gradient(${ink} 1px, transparent 1px)`, backgroundSize: "100% 8px", backgroundPosition: "0 3px" }),
  grid: (ink) => ({ backgroundImage: `linear-gradient(${ink} 1px, transparent 1px), linear-gradient(90deg, ${ink} 1px, transparent 1px)`, backgroundSize: "8px 8px", backgroundPosition: "3px 3px" }),
};

/** The text colour choices in the style bar (the same four inks as the pen). */
function TextColors({ value, big, dark, onPick }: { value: string; big: boolean; dark: boolean; onPick: (c: string) => void }) {
  return (
    <>
      {COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          aria-label={`${inkName(c.name, dark)} text`}
          aria-pressed={value === c.value}
          {...tipOn(`${inkName(c.name, dark)} text`)}
          onPointerDown={palmDown}
          onClick={() => onPick(c.value)}
          className={`${PRESS} flex items-center justify-center rounded-[10px] hover:bg-white/[0.07] ${big ? "h-11 w-10" : `h-9 w-8 ${HIT}`}`}
        >
          <Swatch ink={inkOf(c.value)} on={value === c.value} size={16} />
        </button>
      ))}
    </>
  );
}

function SmallButton({ label, keys, onClick, disabled, children }: { label: string; keys?: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={keys ? `${label} (${keys})` : label}
      {...tipOn(label, keys)}
      onClick={onClick}
      disabled={disabled}
      className={`${PRESS} ${QUIET} ${HIT} flex h-9 w-10 shrink-0 items-center justify-center rounded-[10px] [&_svg]:h-5 [&_svg]:w-5`}
    >
      {children}
    </button>
  );
}

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
  const recentLines = useRef<Array<{ id: string; ends: [Pt, Pt]; dir: "h" | "v"; at: number }>>([]);
  // The pen's real last position: smoothing trails it, so a stroke ends here.
  const lastRaw = useRef<Pt | null>(null);
  const [size, setSize] = useState(SIZES[0].value);
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
  // Pen down: the bars fade so they never cover the writing. They come back only once the pen has
  // rested a moment, so writing (many short strokes) never makes them pulse on every stroke.
  const [inking, setInkingNow] = useState(false);
  const inkingOff = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setInking = useCallback((on: boolean) => {
    if (inkingOff.current) clearTimeout(inkingOff.current);
    inkingOff.current = null;
    if (on) setInkingNow(true);
    else
      inkingOff.current = setTimeout(() => {
        inkingOff.current = null;
        setInkingNow(false);
      }, 900);
  }, []);
  // Laptop (what students see): the bars hide after a few seconds without the mouse.
  const [quiet, setQuiet] = useState(false);
  const topBarRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Typing: where the text box sits on screen, and what is in it.
  const [typing, setTyping] = useState<{ x: number; y: number; px: number; color: string; maxPx: number; hPx: number; wPx: number; bold?: boolean; italic?: boolean; hl?: boolean } | null>(null);
  // The bold / italic / highlight bar above the text box (a tap on it mustn't close the box).
  const styleBarRef = useRef<HTMLDivElement>(null);
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // The selected typed text: a tap selects it (a gold frame and its bar), a drag then moves it and a
  // second tap opens it to edit. Only this device knows what is selected. Its look is kept beside it
  // for the bar's buttons.
  const [selText, setSelTextState] = useState<{ id: string; color: string; bold: boolean; italic: boolean; hl: boolean } | null>(null);
  const selTextRef = useRef<string | null>(null);
  // The selected straight line (the Move tool, a tap or a drag on it): a gold frame and a small bar
  // with Dotted or Solid, Duplicate and a bin. Only this device knows what is selected.
  const [selLine, setSelLineState] = useState<{ id: string; dotted: boolean } | null>(null);
  const selLineRef = useRef<string | null>(null);
  /** The selected line as it is now (also while it is being dragged, when it is drawn on top). */
  const selLineStroke = (): Stroke | undefined => {
    const id = selLineRef.current;
    if (!id) return undefined;
    if (moving.current?.id === id) return moving.current;
    return strokes.current.find((x) => x.id === id && x.kind === "line");
  };
  const selectLine = (id: string | null) => {
    selLineRef.current = id;
    const s = selLineStroke();
    if (!s) selLineRef.current = null;
    setSelLineState((p) => (!s ? null : p && p.id === s.id && p.dotted === !!s.dotted ? p : { id: s.id, dotted: !!s.dotted }));
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

  // Set once the picture handles exist (further down): ends a handle drag left open.
  const finishPicDragRef = useRef<(keepId?: string | null) => void>(() => {});
  const select = (id: string | null) => {
    // The selection changing in the middle of a handle drag (the pen starting to write, a page
    // change, Escape) takes the handle off the page before it can report the lift: the drag is
    // finished here, or every handle stayed dead until the board was reloaded.
    finishPicDragRef.current(id);
    selectedRef.current = id;
    setSelectedId(id);
    if (id && selLineRef.current) selectLine(null);
    // One thing is selected at a time: a picture taking the selection lets typed text go.
    if (id && selTextRef.current) {
      endTextDragRef.current();
      selTextRef.current = null;
      setSelTextState(null);
    }
  };
  /** The selected text as it is now (also while it is being dragged, when it is drawn on top). */
  const selStroke = (): Stroke | undefined => {
    const id = selTextRef.current;
    if (!id) return undefined;
    if (moving.current?.id === id) return moving.current;
    return strokes.current.find((x) => x.id === id && x.kind === "text");
  };
  const selectText = (id: string | null) => {
    if (id && selectedRef.current) select(null);
    if (id && selLineRef.current) selectLine(null);
    if (selTextRef.current === id) return;
    // Its grips leave the page with it: a grip drag still open is finished first (the words land).
    endTextDragRef.current();
    selTextRef.current = id;
    const s = selStroke();
    if (!s) selTextRef.current = null;
    setSelTextState(s ? { id: s.id, color: s.color, bold: !!s.bold, italic: !!s.italic, hl: !!s.hl } : null);
  };
  /**
   * After the board changes under the selection. It is let go once its text is no longer on the
   * board (rubbed out, undone, cleared, opened on the other device); if its look changed (an undo,
   * the other device), its bar shows the look it has now.
   */
  const checkSel = () => {
    // The selected line: let go once it is off the board, and its bar shows the style it has now.
    if (selLineRef.current) selectLine(selLineRef.current);
    if (!selTextRef.current) return;
    const s = selStroke();
    if (!s) return selectText(null);
    setSelTextState((p) => (p && p.id === s.id && p.color === s.color && p.bold === !!s.bold && p.italic === !!s.italic && p.hl === !!s.hl ? p : { id: s.id, color: s.color, bold: !!s.bold, italic: !!s.italic, hl: !!s.hl }));
  };

  const { canvasRef, size: screen, requestDraw } = useCanvas((ctx, w, h, again) =>
    paint(
      ctx,
      w,
      h,
      cam.current,
      images.current,
      strokes.current,
      [
        withPrediction(current.current, predicted.current),
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
  const [paper, setPaperState] = useState<Backdrop>("plain");
  const paperRef = useRef<Backdrop>("plain");
  const darkRef = useRef(false);
  const setPaperRef = useRef<(v: Backdrop, isDark: boolean, share: boolean) => void>(() => {});
  const setPaper = (v: Backdrop, isDark: boolean, share: boolean) => {
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
  const [page, setPage] = useState<BoardPage>(MAIN_PAGE);
  const [pageList, setPageList] = useState<BoardPage[]>([MAIN_PAGE]);
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
  const sendView = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `screen` is a stable ref from useCanvas; the compiler just can't see that.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const shareView = useCallback(() => {
    if (!lead) return;
    if (!sendView.current)
      sendView.current = setTimeout(() => {
        sendView.current = null;
        const { w, h } = screen.current;
        if (w && h) link.current?.send({ t: "view", v: writingView(w, h) });
      }, 70); // ~14 position updates a second to the laptop, which glides smoothly between them (fewer messages, so drawing never queues behind them)
  }, [screen, lead]);

  // ---- the other device: everything it does lands here too
  const gotBoard = useRef(false);
  const resync = useRef<"join" | "rev">("join");
  const revMiss = useRef(0);
  const teacherView = useRef<View | null>(null);
  const followTarget = useRef<Camera | null>(null);
  const following = useRef(false);
  const onRemote = useRef<(m: BoardMsg) => void>(() => {});
  const follow = useRef<(jump?: boolean) => void>(() => {});
  // The laptop: its view was moved here by hand (wheel, Space drag, Fit) while the tablet is on, so
  // it no longer shows what the tablet shows. It goes back by itself as soon as the tablet moves,
  // or at once with "Tablet view" in the top bar.
  const [away, setAway] = useState(false);
  const awayRef = useRef(false);
  const markAway = () => {
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
          shareView();
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
    // Typed words drawn before the board's font had loaded are drawn again in it.
    void document.fonts?.ready.then(() => {
      if (!alive) return;
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
          send({ t: "rev", n: strokes.current.length + shared.length, last: strokes.current[strokes.current.length - 1]?.id ?? "", d: boardDigest(strokes.current, shared), p: pageRef.current, ...(w && h ? { v: writingView(w, h) } : {}) });
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
  }, [room, storeKey, keyFor, requestDraw, send, screen, fullBoard, lead, ledger, persist, shareView, camsKey, soloKey]);


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
    shareView();
    if (typingRef.current) placeTyping();
  }, [requestDraw, shareView, placeTyping, saveCams]);

  // The laptop glides to wherever the tablet is looking, at screen speed.
  useEffect(() => {
    const step = () => {
      const t = followTarget.current;
      if (!t) {
        following.current = false;
        return;
      }
      const c = cam.current;
      const k = 0.38;
      const next = { x: c.x + (t.x - c.x) * k, y: c.y + (t.y - c.y) * k, z: c.z + (t.z - c.z) * k };
      const done = Math.abs(t.x - next.x) * next.z < 0.25 && Math.abs(t.y - next.y) * next.z < 0.25 && Math.abs(t.z - next.z) < 0.0008;
      cam.current = done ? t : next;
      refresh();
      if (done) following.current = false;
      else requestAnimationFrame(step);
    };
    follow.current = (jump = false) => {
      const v = teacherView.current;
      const { w, h } = screen.current;
      if (!v || !w || !h) return;
      // Fit the tablet's whole writing space into the part of this screen the toolbars leave clear,
      // centred, whatever the two screens' shapes. (Not held to this screen's own zoom limits: with
      // the tablet zoomed far out, stopping at them cut the edges of its view off here.)
      followTarget.current = fitView(v, w, h, clearInset(h, [topBarRef.current, sidePanelRef.current], [toolbarRef.current]), FOLLOW_MIN_Z, FOLLOW_MAX_Z);
      // Following again: any looking around done here by hand is over.
      if (awayRef.current) {
        awayRef.current = false;
        setAway(false);
      }
      if (jump) {
        cam.current = followTarget.current;
        refresh();
      } else if (!following.current) {
        following.current = true;
        requestAnimationFrame(step);
      }
    };
  }, [refresh, screen]);

  // The laptop window changes size (full screen to share): fit the tablet's view again. The board's
  // own size is watched too: it is what the fit is worked out from, and it can settle a moment
  // after the window says it changed (going full screen), which left the old framing on screen.
  // The tablet does the same for what it shares (turned round, the browser's bars showing or hiding).
  useEffect(() => {
    const c = canvasRef.current;
    const refit = () => setTimeout(() => (lead ? shareView() : follow.current(true)), 50);
    const ro = c ? new ResizeObserver(refit) : null;
    if (c) ro?.observe(c);
    if (!lead) window.addEventListener("resize", refit);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", refit);
    };
  }, [lead, canvasRef, shareView]);

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
    const t = setTimeout(shareView, 30);
    window.addEventListener("resize", shareView);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", shareView);
    };
  }, [lead, toolsHidden, shareView]);

  // Tools hidden or shown on the laptop: the clear space changed, so fit again (bigger without tools).
  useEffect(() => {
    if (lead) return;
    const t = setTimeout(() => follow.current(true), 30);
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
    if (selectedRef.current && !nowI.has(selectedRef.current)) select(null);
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
    else images.current = images.current.map((m) => (m.id === a.before.id ? a.before : m));
    redoStack.current.push(a);
    applyChange(bs, bi);
  };
  const redo = () => {
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
    else images.current = images.current.map((m) => (m.id === a.after.id ? a.after : m));
    undoStack.current.push(a);
    applyChange(bs, bi);
  };
  const clearAll = () => {
    if (!strokes.current.length && !images.current.length) return;
    const gone = [...strokes.current.map((x) => x.id), ...images.current.map((x) => x.id)];
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
  const deleteSelected = () => {
    const m = images.current.find((x) => x.id === selectedRef.current);
    if (!m) return;
    images.current = images.current.filter((x) => x.id !== m.id);
    commit({ type: "img-del", m });
    send({ t: "imgdel", ids: [m.id] });
    select(null);
    requestDraw();
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
          const { w, h } = screen.current;
          if (lead && w && h) link.current?.send({ t: "view", v: writingView(w, h) });
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
          // Only the laptop follows; a tablet pan always brings the laptop back to it.
          if (!lead) {
            teacherView.current = m.v;
            follow.current();
          }
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
          // A "view" message that got lost: the heartbeat carries the view, so this screen catches up.
          const tv = teacherView.current;
          if (m.v && (!tv || tv.x !== m.v.x || tv.y !== m.v.y || tv.w !== m.v.w || tv.h !== m.v.h)) {
            teacherView.current = m.v;
            follow.current();
          }
          const shared = images.current.filter((x) => !x.url.startsWith("blob:"));
          const same =
            m.d !== undefined
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
  const textSize = () => (TEXT_PX[SIZES.findIndex((x) => x.value === size)] ?? TEXT_PX[1]) / cam.current.z;
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
    const under = target ?? [...strokes.current].reverse().find((x) => x.kind === "text" && hitStroke(x, wx, wy, 6 / cam.current.z));
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
  const colorSel = (c: string) => restyleSel({ color: c });
  const onSelStyle = (e: React.MouseEvent<HTMLElement>) => {
    if (!palmBlocked()) toggleSel(e.currentTarget.dataset.k as "bold" | "italic" | "hl");
  };
  /** Delete or Backspace, or the bin in its bar: the selected text goes (undo brings it back). */
  const deleteSelText = () => {
    const s = selStroke();
    if (!s || moving.current) return;
    strokes.current = strokes.current.filter((x) => x.id !== s.id);
    commit({ type: "erase", s: [s] });
    send({ t: "del", ids: [s.id] });
    selectText(null);
    requestDraw();
  };
  // ---- the selected line's bar
  /** Dotted or Solid: this line's style switches in place (one undo step), and the other device sees it. */
  const toggleSelLine = () => {
    const s = selLineStroke();
    if (!s || moving.current) return;
    const after: Stroke = { ...s };
    if (s.dotted) delete after.dotted;
    else after.dotted = true;
    strokes.current = strokes.current.map((x) => (x.id === s.id ? after : x));
    commit({ type: "replace", before: [s], after: [after] });
    send({ t: "add", s: packStroke(after) });
    setSelLineState({ id: after.id, dotted: !!after.dotted });
    requestDraw();
  };
  /** A copy a little down and to the right, selected and ready to drag (one undo step). */
  const duplicateSelLine = () => {
    const s = selLineStroke();
    if (!s || moving.current) return;
    const d = 24 / cam.current.z;
    const copy: Stroke = { ...s, id: newId(), pts: s.pts.map((p) => [p[0] + d, p[1] + d, p[2]] as Pt) };
    strokes.current = [...strokes.current, copy];
    commit({ type: "add", s: copy });
    send({ t: "add", s: packStroke(copy) });
    selectLine(copy.id);
    requestDraw();
  };
  /** Delete or Backspace, or the bin in its bar: the selected line goes (undo brings it back). */
  const deleteSelLine = () => {
    const s = selLineStroke();
    if (!s || moving.current) return;
    strokes.current = strokes.current.filter((x) => x.id !== s.id);
    commit({ type: "erase", s: [s] });
    send({ t: "del", ids: [s.id] });
    selectLine(null);
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
   * Typed text or writing being moved. `tapEdits`: lifting without a drag opens the words (they were
   * already selected). `slop`: how far the pointer may wander and still count as a tap. `lx, ly`: where
   * the pointer is now.
   */
  type Mv = { s: Stroke; x0: number; y0: number; lx: number; ly: number; moved: boolean; tapEdits: boolean; previewId: string; slop: number; touch: boolean; at: number };
  const gesture = useRef<{
    mode: "draw" | "line" | "box" | "erase" | "pan" | "drag" | "resize" | "shift" | null;
    id: number;
    erased: Stroke[];
    straightened: boolean;
    img?: { before: BoardImage; ox: number; oy: number };
    /** Moving typed text or writing: the stroke, where the pointer went down, and whether it has
     * moved yet (a tap on words with the type tool edits them instead). */
    mv?: Mv;
    /** A mouse press with the pen or line tool that may turn out to be a plain click: on typed words
     * it selects them (`text`), and with words selected a click elsewhere only lets them go. */
    click?: { text: string | null; at: number };
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

  /** Pick up a picture under (sx, sy): its gold dot resizes, the rest moves it. */
  const grabImage = (id: number, sx: number, sy: number, byFinger: boolean, selectedOnly = false) => {
    const [wx, wy] = toWorld(cam.current, sx, sy);
    const sel = images.current.find((m) => m.id === selectedRef.current);
    const reach = byFinger ? HANDLE_PX * 1.8 : HANDLE_PX;
    if (sel && Math.hypot((sel.x + sel.w - wx) * cam.current.z, (sel.y + sel.h - wy) * cam.current.z) <= reach) {
      gesture.current = { mode: "resize", id, erased: [], straightened: false, img: { before: { ...sel }, ox: 0, oy: 0 } };
      return true;
    }
    const under = imageAt(images.current, wx, wy);
    const hit = selectedOnly && under?.id !== selectedRef.current ? undefined : under;
    // A finger off every picture pans as usual (and keeps the selection).
    if (!hit && byFinger) return false;
    // A big page (most of the screen) scrolls under a finger, so a pan never drags it by mistake:
    // its Move grip moves it. (With the Move tool on, a finger still drags it.)
    if (hit && byFinger && tool !== "move" && hit.w * hit.h * cam.current.z ** 2 > 0.45 * screen.current.w * screen.current.h) return false;
    select(hit?.id ?? null);
    if (hit) gesture.current = { mode: "drag", id, erased: [], straightened: false, img: { before: { ...hit }, ox: wx - hit.x, oy: wy - hit.y } };
    requestDraw();
    return !!hit;
  };

  // ---- the selected picture: a Move grip and four big corner handles (page elements over the board,
  // so they work with the pen, a finger or the mouse, whatever tool is in hand)
  type PicGrip = "move" | "nw" | "ne" | "sw" | "se";
  const picDrag = useRef<{ id: number; kind: PicGrip; before: BoardImage; sx: number; sy: number; sent: number; el: Element } | null>(null);
  /** A handle drag ends: the move or resize is kept as one undo step and goes to the other device. */
  const finishPicDrag = () => {
    const d = picDrag.current;
    if (!d) return;
    picDrag.current = null;
    const after = images.current.find((m) => m.id === d.before.id);
    if (!after || (after.x === d.before.x && after.y === d.before.y && after.w === d.before.w)) return;
    // To the front, as the other device puts it when it hears (so both screens stack alike).
    images.current = [...images.current.filter((m) => m.id !== after.id), after];
    commit({ type: "img-edit", before: { ...d.before, url: after.url }, after });
    if (!after.url.startsWith("blob:")) send({ t: "img", m: after });
    requestDraw();
  };
  useEffect(() => {
    finishPicDragRef.current = (keepId) => {
      if (picDrag.current && picDrag.current.before.id !== keepId) finishPicDrag();
    };
  });
  const onPicDown = (kind: PicGrip, e: React.PointerEvent<HTMLElement>) => {
    // A resting palm, or a touch while the pen is in use, does nothing (as on the board).
    if (e.pointerType === "touch" && (pens.current.active || Date.now() - pens.current.lastAt < PALM_LOCK_MS || e.width > PALM_SIZE_PX || e.height > PALM_SIZE_PX)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const m = images.current.find((x) => x.id === selectedRef.current);
    if (!m) return;
    const open = picDrag.current;
    if (open) {
      // A drag still going on its own handle: this second press does nothing, as before.
      if (open.el.isConnected && open.before.id === selectedRef.current) return;
      // Its handle has gone from the page without reporting the lift: finish it, then start this one.
      finishPicDrag();
    }
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    stopGlide();
    picDrag.current = { id: e.pointerId, kind, before: { ...m }, sx: e.clientX, sy: e.clientY, sent: 0, el: e.currentTarget };
  };
  const onCornerDown = (e: React.PointerEvent<HTMLElement>) => onPicDown(e.currentTarget.dataset.k as PicGrip, e);
  const onPicMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = picDrag.current;
    if (!d || d.id !== e.pointerId) return;
    const z = cam.current.z;
    const dx = (e.clientX - d.sx) / z;
    const dy = (e.clientY - d.sy) / z;
    const b = d.before;
    let box = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
    if (d.kind !== "move") {
      // A corner: the opposite corner stays put and the picture keeps its shape.
      const left = d.kind === "nw" || d.kind === "sw";
      const top = d.kind === "nw" || d.kind === "ne";
      const byX = b.w + (left ? -dx : dx);
      const byY = (b.h + (top ? -dy : dy)) * (b.w / b.h);
      const w = Math.max(60 / z, Math.abs(byX - b.w) >= Math.abs(byY - b.w) ? byX : byY);
      const h = w * (b.h / b.w);
      box = { x: left ? b.x + b.w - w : b.x, y: top ? b.y + b.h - h : b.y, w, h };
    }
    images.current = images.current.map((m) => (m.id === b.id ? { ...m, ...box } : m));
    requestDraw();
    // The other screen sees it glide, a few times a second, not jump when it's let go.
    const now = performance.now();
    const m = images.current.find((x) => x.id === b.id);
    if (m && !m.url.startsWith("blob:") && now - d.sent > 90) {
      d.sent = now;
      send({ t: "img", m });
    }
  };
  const onPicUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = picDrag.current;
    if (!d || d.id !== e.pointerId) return;
    finishPicDrag();
  };
  /** Fit: zoom the view to the whole selected picture, every corner in reach. The laptop follows. */
  const fitSelected = () => {
    const m = images.current.find((x) => x.id === selectedRef.current);
    if (!m) return;
    const { w, h } = screen.current;
    const z = cam.current.z;
    const pad = 24 / z;
    markAway();
    const inset = lead
      ? clearInset(h, [topBarRef.current, sidePanelRef.current], [], 14, [toolbarRef.current])
      : clearInset(h, [topBarRef.current, sidePanelRef.current], [toolbarRef.current]);
    // A little more room above, for the picture's bar.
    cam.current = fitView({ x: m.x - pad, y: m.y - pad - 60 / z, w: m.w + 2 * pad, h: m.h + 2 * pad + 60 / z }, w, h, inset);
    refresh();
  };
  const frontSelected = () => {
    const m = images.current.find((x) => x.id === selectedRef.current);
    if (!m) return;
    images.current = [...images.current.filter((x) => x.id !== m.id), m];
    if (!m.url.startsWith("blob:")) send({ t: "img", m });
    persist();
    requestDraw();
  };
  // The frame and bar follow the picture every frame (pan, zoom, drag, the other device moving it),
  // set straight on the page elements, so the board never re-renders for it.
  const selFrameRef = useRef<HTMLDivElement>(null);
  const selBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    let raf = 0;
    let last = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = selFrameRef.current;
      const bar = selBarRef.current;
      const m = images.current.find((x) => x.id === selectedRef.current);
      if (!el || !bar || !m) return;
      const c = cam.current;
      const { w: sw, h: sh } = screen.current;
      const x = (m.x - c.x) * c.z;
      const y = (m.y - c.y) * c.z;
      const w = m.w * c.z;
      const h = m.h * c.z;
      const key = `${x}|${y}|${w}|${h}|${sw}|${sh}`;
      if (key === last) return;
      last = key;
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      // The bar: just above the picture (below it near the top), always on screen, clear of the bars.
      const bw = bar.offsetWidth;
      const bh = bar.offsetHeight;
      const minY = 64;
      const maxY = sh - bh - (lead ? 12 : 84);
      const above = y - bh - 18;
      const below = y + h + 18;
      const by = Math.min(Math.max(minY, above >= minY ? above : below <= maxY ? below : minY), maxY);
      const bx = Math.min(Math.max(lead ? 76 : 12, x + w / 2 - bw / 2), sw - bw - 12);
      const off = x + w < 0 || y + h < 0 || x > sw || y > sh;
      Object.assign(bar.style, { left: `${bx}px`, top: `${by}px`, visibility: off ? "hidden" : "visible" });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selectedId, screen, lead]);

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
  const shifted = (s: Stroke, dx: number, dy: number): Stroke => ({ ...s, pts: s.pts.map((p) => [p[0] + dx, p[1] + dy, p[2]] as Pt) });
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
  /**
   * A press on typed text (or, `anyStroke`, any writing: the Move tool with the pen or mouse). Typed
   * text is selected at once and a drag from here moves it; pressed again while selected, lifting
   * without a drag opens it to edit.
   */
  const grabStroke = (id: number, sx: number, sy: number, anyStroke: boolean, pt: string) => {
    const hit = strokeUnder(sx, sy, anyStroke);
    if (!hit) return false;
    const again = hit.kind === "text" && hit.id === selTextRef.current;
    selectText(hit.kind === "text" ? hit.id : null);
    // A straight line picked up with the Move tool is selected too: its bar has Dotted and Duplicate.
    selectLine(anyStroke && hit.kind === "line" ? hit.id : null);
    gesture.current = { mode: "shift", id, erased: [], straightened: false, mv: startMv(hit, sx, sy, again, pt) };
    return true;
  };
  /** A press on the selected text (anywhere in its frame, with a little slack), whatever is drawn over it. */
  const grabSel = (id: number, sx: number, sy: number, pt: string) => {
    const s = selStroke();
    if (!s || moving.current) return false;
    const c = cam.current;
    const pad = (pt === "touch" ? 12 : 8) / c.z;
    const [wx, wy] = toWorld(c, sx, sy);
    const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
    if (wx < a[0] - pad || wx > b[0] + pad || wy < a[1] - pad || wy > b[1] + pad) return false;
    gesture.current = { mode: "shift", id, erased: [], straightened: false, mv: startMv(s, sx, sy, true, pt) };
    return true;
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
  // What was moved last: the laptop's arrow keys nudge it.
  const lastMoved = useRef<string | null>(null);
  /** A move ends: the moved words land (one undo step), or a tap with the type tool opens them to edit. */
  /** The moved (or resized) words land: one undo step, and the other device gets them. */
  const landMv = (mv: Mv, cancelled: boolean) => {
    setInking(false);
    const after = cancelled ? mv.s : (moving.current ?? mv.s);
    moving.current = null;
    strokes.current = [...strokes.current, after];
    if (after !== mv.s) {
      commit({ type: "replace", before: [mv.s], after: [after] });
      lastMoved.current = after.id;
    }
    // The preview goes and the moved one lands, together.
    send({ t: "batch", ms: [{ t: "del", ids: [mv.previewId] }, { t: "add", s: packStroke(after) }] });
    persist();
    requestDraw();
    syncMeta();
  };
  const finishShift = (mv: Mv, cancelled: boolean) => {
    gesture.current = { mode: null, id: -1, erased: [], straightened: false };
    if (!mv.moved) {
      setInking(false);
      // A second tap on selected words opens them to edit, the caret where the tap landed. (A finger
      // that only rested there for a while is not a tap.)
      if (mv.tapEdits && !cancelled && (!mv.touch || performance.now() - mv.at < 600)) startTyping(mv.x0, mv.y0, mv.s, true);
      return;
    }
    landMv(mv, cancelled);
  };
  // ---- the selected text's own grips (page elements over the board, so they work with the pen, a
  // finger or the mouse, whatever tool is in hand): Move in its bar, the side pill for how wide its
  // lines run, the corner dot for its size.
  type TextGrip = "move" | "w" | "s";
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
    const s = selStroke();
    if (!s || moving.current || gesture.current.mode === "shift") return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    stopGlide();
    const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
    textDrag.current = { id: e.pointerId, kind: e.currentTarget.dataset.k as TextGrip, w0: Math.max(1, b[0] - a[0]), mv: { ...startMv(s, e.clientX, e.clientY, false, e.pointerType), slop: 2 } };
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
    if (d.kind === "move") showMv(mv, shifted(mv.s, dx, dy));
    else if (d.kind === "w") showMv(mv, restyled(mv.s, { boxW: Math.max(mv.s.size * 2, d.w0 + dx) }));
    else {
      // The corner: the words grow or shrink (and a set line width with them).
      const size = Math.max(10 / z, mv.s.size * Math.max(0.4, Math.min(4, (d.w0 + dx) / d.w0)));
      showMv(mv, restyled(mv.s, { size, ...(mv.s.boxW ? { boxW: mv.s.boxW * (size / mv.s.size) } : {}) }));
    }
  };
  const onTextGripUp = (e: React.PointerEvent<HTMLElement>) => {
    if (textDrag.current?.id === e.pointerId) endTextDrag(e.type === "pointercancel");
  };
  // The frame and bar follow the selected words (pan, zoom, a drag, the other device moving them),
  // set straight on the page elements, as for a picture.
  const selTextFrameRef = useRef<HTMLDivElement>(null);
  const selTextBarRef = useRef<HTMLDivElement>(null);
  const selTextId = selText?.id ?? null;
  useEffect(() => {
    if (!selTextId) return;
    let raf = 0;
    let last = "";
    const place = () => {
      const el = selTextFrameRef.current;
      const bar = selTextBarRef.current;
      const id = selTextRef.current;
      const s = id ? (moving.current?.id === id ? moving.current : strokes.current.find((x) => x.id === id)) : undefined;
      if (!el || !bar || !s) return;
      const c = cam.current;
      const { w: sw, h: sh } = screen.current;
      const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
      // A little clear of the words all round.
      const x = (a[0] - c.x) * c.z - 7;
      const y = (a[1] - c.y) * c.z - 5;
      const w = (b[0] - a[0]) * c.z + 14;
      const h = (b[1] - a[1]) * c.z + 10;
      const key = `${x}|${y}|${w}|${h}|${sw}|${sh}`;
      if (key === last) return;
      last = key;
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      // The bar: just above the words (below them near the top), always on screen, clear of the bars.
      const bw = bar.offsetWidth;
      const bh = bar.offsetHeight;
      const minY = 64;
      const maxY = sh - bh - (lead ? 12 : 84);
      const above = y - bh - 14;
      const below = y + h + 14;
      const by = Math.min(Math.max(minY, above >= minY ? above : below <= maxY ? below : minY), maxY);
      const bx = Math.max(lead ? 76 : 12, Math.min(x, sw - bw - 12));
      const off = x + w < 0 || y + h < 0 || x > sw || y > sh;
      Object.assign(bar.style, { left: `${bx}px`, top: `${by}px`, visibility: off ? "hidden" : "visible" });
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      place();
    };
    // Placed at once (not a frame later), then kept in step.
    place();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selTextId, screen, lead]);
  // The selected line's frame and bar, kept in step the same way.
  const selLineFrameRef = useRef<HTMLDivElement>(null);
  const selLineBarRef = useRef<HTMLDivElement>(null);
  const selLineId = selLine?.id ?? null;
  useEffect(() => {
    if (!selLineId) return;
    let raf = 0;
    let last = "";
    const place = () => {
      const el = selLineFrameRef.current;
      const bar = selLineBarRef.current;
      const id = selLineRef.current;
      const s = id ? (moving.current?.id === id ? moving.current : strokes.current.find((x) => x.id === id)) : undefined;
      if (!el || !bar || !s) return;
      const c = cam.current;
      const { w: sw, h: sh } = screen.current;
      const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
      const x = (Math.min(a[0], b[0]) - c.x) * c.z - 8;
      const y = (Math.min(a[1], b[1]) - c.y) * c.z - 8;
      const w = Math.abs(b[0] - a[0]) * c.z + 16;
      const h = Math.abs(b[1] - a[1]) * c.z + 16;
      const key = `${x}|${y}|${w}|${h}|${sw}|${sh}`;
      if (key === last) return;
      last = key;
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      const bw = bar.offsetWidth;
      const bh = bar.offsetHeight;
      const minY = 64;
      const maxY = sh - bh - (lead ? 12 : 84);
      const above = y - bh - 14;
      const below = y + h + 14;
      const by = Math.min(Math.max(minY, above >= minY ? above : below <= maxY ? below : minY), maxY);
      const bx = Math.min(Math.max(lead ? 76 : 12, x + w / 2 - bw / 2), sw - bw - 12);
      const off = x + w < 0 || y + h < 0 || x > sw || y > sh;
      Object.assign(bar.style, { left: `${bx}px`, top: `${by}px`, visibility: off ? "hidden" : "visible" });
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      place();
    };
    place();
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selLineId, screen, lead]);
  // Tablet: a finger held still on typed words picks them up (a small buzz), then they follow the
  // finger, with any tool. A quick drag still pans, and the pen never moves text by accident.
  const liftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armLift = (id: number) => {
    if (liftTimer.current) clearTimeout(liftTimer.current);
    liftTimer.current = setTimeout(() => {
      liftTimer.current = null;
      const at = touches.current.get(id);
      if (!at || touches.current.size !== 1 || panTrip.current.dist > 12 || gesture.current.mode) return;
      if (pens.current.active || Date.now() - pens.current.lastAt < PALM_LOCK_MS) return;
      if (!grabStroke(id, at.x, at.y, false, "touch")) return;
      // Picked up to be moved: letting go without a drag only leaves them selected.
      if (gesture.current.mv) gesture.current.mv.tapEdits = false;
      // From here this finger moves the words (the "shift" gesture), not the board.
      touches.current.delete(id);
      tap1.current = null;
      velocity.current = { vx: 0, vy: 0 };
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
  // Laptop: right after a move, the arrow keys nudge it (Shift: 10 at a time); a burst is one undo.
  const nudgeAt = useRef(0);
  const nudge = (dx: number, dy: number) => {
    // The selected text, or what was moved last.
    const id = selTextRef.current ?? lastMoved.current;
    const s = id ? strokes.current.find((x) => x.id === id) : undefined;
    if (!s) return false;
    const z = cam.current.z;
    const after = shifted(s, dx / z, dy / z);
    strokes.current = [...strokes.current.filter((x) => x.id !== s.id), after];
    const top = undoStack.current[undoStack.current.length - 1];
    const now = performance.now();
    if (top?.type === "replace" && top.after.length === 1 && top.after[0] === s && now - nudgeAt.current < 1500) {
      undoStack.current[undoStack.current.length - 1] = { type: "replace", before: top.before, after: [after] };
      redoStack.current = [];
      persist();
    } else commit({ type: "replace", before: [s], after: [after] });
    nudgeAt.current = now;
    send({ t: "add", s: packStroke(after) });
    requestDraw();
    return true;
  };
  // Laptop: the mouse is over something the Type or Move tool can drag (the cursor shows it).
  const [overItem, setOverItem] = useState(false);
  const overItemRef = useRef(false);
  const noteHover = (x: number, y: number) => {
    let over = false;
    if (!gesture.current.mode && (tool === "text" || tool === "move")) {
      const [wx, wy] = toWorld(cam.current, x, y);
      over = !!strokeUnder(x, y, tool === "move") || (tool === "move" && !!imageAt(images.current, wx, wy));
    } else if (!gesture.current.mode && (tool === "pen" || tool === "line") && selTextRef.current) {
      // With the pen or line tool the mouse still moves the selected words.
      const s = selStroke();
      const [wx, wy] = toWorld(cam.current, x, y);
      const pad = 8 / cam.current.z;
      over = !!s && wx >= s.pts[0][0] - pad && wx <= s.pts[1][0] + pad && wy >= s.pts[0][1] - pad && wy <= s.pts[1][1] + pad;
    }
    if (over === overItemRef.current) return;
    overItemRef.current = over;
    setOverItem(over);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = local(e);
    const isPen = e.pointerType === "pen";
    const isMouse = e.pointerType === "mouse";
    const isTouch = e.pointerType === "touch";
    logPen(e, "down");
    stopGlide();
    lastMoved.current = null;

    if (isPen) {
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
      // A second finger while the first rests on typed words it has not dragged yet: a pinch, not a
      // move. The words stay where they are and the first finger joins the pan and zoom.
      const held = gesture.current;
      if (held.mode === "shift" && held.mv?.touch && !held.mv.moved && held.id !== e.pointerId) {
        touches.current.set(held.id, { x: held.mv.lx, y: held.mv.ly, t: performance.now() });
        gesture.current = { mode: null, id: -1, erased: [], straightened: false };
      }
      // One finger on the selected words moves them, with any tool (as a selected picture does). A
      // finger anywhere else pans, exactly as before.
      if (selTextRef.current && touches.current.size === 0 && !gesture.current.mode && grabSel(e.pointerId, sx, sy, "touch")) {
        capture(canvasRef.current, e.pointerId);
        return;
      }
      // Move tool: one finger on typed words moves them, even on a picture or PDF page (not near the
      // selected picture's gold dot, which still resizes it).
      if (tool === "move" && touches.current.size === 0 && !gesture.current.mode) {
        const sel = images.current.find((m) => m.id === selectedRef.current);
        const [px, py] = toWorld(cam.current, sx, sy);
        const onDot = !!sel && Math.hypot((sel.x + sel.w - px) * cam.current.z, (sel.y + sel.h - py) * cam.current.z) <= HANDLE_PX * 1.8;
        if (!onDot && grabStroke(e.pointerId, sx, sy, false, "touch")) {
          capture(canvasRef.current, e.pointerId);
          return;
        }
      }
      // One finger on the selected picture (or any picture with Move on) moves it; its gold dot resizes it.
      if ((tool === "move" || selectedRef.current) && touches.current.size === 0 && !gesture.current.mode && grabImage(e.pointerId, sx, sy, true, tool !== "move")) {
        capture(canvasRef.current, e.pointerId);
        return;
      }
      tap1.current = touches.current.size === 0 ? { id: e.pointerId, x: sx, y: sy, at: performance.now() } : null;
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
    // The pen always wins: a finger moving a picture lets go, and the move is kept.
    if (isPen && (gesture.current.mode === "drag" || gesture.current.mode === "resize") && gesture.current.img) {
      const before = gesture.current.img.before;
      const after = images.current.find((m) => m.id === before.id);
      if (after && (after.x !== before.x || after.y !== before.y || after.w !== before.w)) {
        // Exactly as when the finger lifts: to the front, and undo keeps the picture's uploaded address.
        images.current = [...images.current.filter((m) => m.id !== after.id), after];
        commit({ type: "img-edit", before: { ...before, url: after.url }, after });
        if (!after.url.startsWith("blob:")) send({ t: "img", m: after });
      }
      gesture.current = { mode: null, id: -1, erased: [], straightened: false };
    }
    // Same for a finger moving words: they land where they are, and the pen writes. (A finger only
    // resting on them is let go; it never opens them.)
    if (isPen && gesture.current.mode === "shift" && gesture.current.mv) finishShift(gesture.current.mv, !gesture.current.mv.moved);
    if (gesture.current.mode) return;

    // Typing: the pen or mouse puts the text box here (focus stays in it).
    if (tool === "text" && !isPenEraser(e)) {
      e.preventDefault();
      // On words already there: they are selected, a drag moves them, and a tap on them once
      // selected opens them to edit (on lifting). An open box closes first, so pressing just around
      // it picks it up too.
      if (typingRef.current) commitTyping(true);
      if (grabStroke(e.pointerId, sx, sy, false, e.pointerType)) {
        capture(canvasRef.current, e.pointerId);
        return;
      }
      // Keep this pointer, so its lift always comes back here (and the pen is never left "down").
      capture(canvasRef.current, e.pointerId);
      // With words selected, a tap on empty board only lets them go (no new text box, no keyboard).
      if (selTextRef.current) selectText(null);
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

    if (tool === "move") {
      // The selected picture's resize dot first, then writing (even on a picture or PDF page), then a picture.
      const sel = images.current.find((m) => m.id === selectedRef.current);
      const onDot = !!sel && Math.hypot((sel.x + sel.w - wx) * cam.current.z, (sel.y + sel.h - wy) * cam.current.z) <= HANDLE_PX;
      if (onDot || !grabStroke(e.pointerId, sx, sy, true, e.pointerType)) {
        selectText(null);
        selectLine(null);
        grabImage(e.pointerId, sx, sy, false);
      }
      return;
    }

    // Typed words and the pen, line and axes tools. The S Pen always writes, so it lets selected
    // words go and carries on. The mouse moves the selected words (and a click on them again opens
    // them); a plain click on other typed words selects them, and a plain click anywhere else only
    // lets the selection go (see the lift). A drag draws as usual.
    let click: { text: string | null; at: number } | undefined;
    if (isMouse && e.button === 0 && (tool === "pen" || tool === "line")) {
      if (selTextRef.current && grabSel(e.pointerId, sx, sy, "mouse")) return;
      const word = strokeUnder(sx, sy, false);
      if (word || selTextRef.current) click = { text: word?.id ?? null, at: performance.now() };
    } else if (selTextRef.current) selectText(null);

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
      current.current = { id: newId(), kind: "ink", color: ink, size: w, pts: [p] };
      lastRaw.current = p;
      setInking(true);
      gesture.current = { mode: "draw", id: e.pointerId, erased: [], straightened: false, click };
      hold.current.path = 0;
      armHold(sx, sy);
    }
    requestDraw();
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
      if (e.buttons === 0 && isPenEraser(e)) moveEraser(sx, sy);
    }

    // Touch pan / pinch.
    if (touches.current.has(e.pointerId)) {
      // The pen is writing: a touch is the resting hand, never a pan.
      if (pens.current.active) return;
      const prev = touches.current.get(e.pointerId)!;
      const now = performance.now();
      touches.current.set(e.pointerId, { x: sx, y: sy, t: now });
      if (tap2.current) tap2.current.moved += Math.hypot(sx - prev.x, sy - prev.y);
      if (!lead) markAway();
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

    if (g.mode === "shift" && g.mv) {
      const mv = g.mv;
      mv.lx = sx;
      mv.ly = sy;
      if (!mv.moved) {
        // Still a tap until it has gone a few pixels (a little more for a fingertip).
        if (Math.hypot(sx - mv.x0, sy - mv.y0) < mv.slop) return;
        liftMv(mv);
      }
      const z = cam.current.z;
      showMv(mv, shifted(mv.s, (sx - mv.x0) / z, (sy - mv.y0) / z));
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

    if ((g.mode === "drag" || g.mode === "resize") && g.img) {
      const before = g.img.before;
      const off = g.img;
      images.current = images.current.map((m) => {
        if (m.id !== before.id) return m;
        if (g.mode === "drag") return { ...m, x: wx - off.ox, y: wy - off.oy };
        const w = Math.max(60 / cam.current.z, wx - m.x);
        return { ...m, w, h: w * (before.h / before.w) };
      });
      requestDraw();
      // The other screen sees it glide, a few times a second, not jump when it's let go.
      const now = performance.now();
      const moved = images.current.find((m) => m.id === before.id);
      if (moved && !moved.url.startsWith("blob:") && now - liveSend.current > 90) {
        liveSend.current = now;
        send({ t: "img", m: moved });
      }
      return;
    }

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
    // The laptop follows the tablet's view, so it asks the tablet to make the room.
    if (!lead && partner) {
      send({ t: "room" });
      return;
    }
    if (scrolling.current) return;
    markAway();
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
          const hadWords = !!selTextRef.current;
          if (word) selectText(word.id);
          else {
            selectText(null);
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
    if (g.id !== e.pointerId) return;
    clearHold();
    setAngle(null);
    if (g.mode === "shift" && g.mv) {
      finishShift(g.mv, cancelled);
      return;
    }
    if (g.mode === "erase") {
      flushErase();
      lastErase.current = null;
      if (g.erased.length) commit({ type: "erase", s: g.erased });
      if (tool !== "eraser") moveEraser();
    } else if ((g.mode === "drag" || g.mode === "resize") && g.img) {
      const before = g.img.before;
      const after = images.current.find((m) => m.id === before.id);
      if (after && (after.x !== before.x || after.y !== before.y || after.w !== before.w)) {
        // To the front, as the other device puts it when it hears (so both screens stack alike).
        images.current = [...images.current.filter((m) => m.id !== after.id), after];
        commit({ type: "img-edit", before: { ...before, url: after.url }, after });
        if (!after.url.startsWith("blob:")) send({ t: "img", m: after });
      }
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
      const clicked = !!g.click && !cancelled && performance.now() - g.click.at < 500 && (s.kind === "line" ? tooShort : s.kind === "ink" && hold.current.path < 4);
      if (g.click) selectText(clicked ? g.click.text : null);
      if (!cancelled && !tooShort && !clicked) {
        strokes.current = [...strokes.current, s];
        commit({ type: "add", s });
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
    markAway();
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

  const pickTool = (t: Tool) => {
    commitTyping();
    toolBeforeA.current = null;
    setTool(t);
    if (t !== "move") select(null);
    if (t !== "move") selectLine(null);
    if (t !== "move" && t !== "text") selectText(null);
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
    return [...list].sort((a, b) => rank(a) - rank(b) || a.at - b.at);
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
    selectText(null);
    selectLine(null);
    if (open.mode === "shift" && open.mv) finishShift(open.mv, true);
    else if (open.mode && open.mode !== "pan") {
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
  const onPickPaper = (e: React.MouseEvent<HTMLElement>) => setPaper(e.currentTarget.dataset.v as Backdrop, darkRef.current, true);
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Arrow keys nudge the selected text, or what was just moved (Shift: 10 at a time).
      if (e.key.startsWith("Arrow") && (selTextRef.current || lastMoved.current)) {
        const step = e.shiftKey ? 10 : 1;
        const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[e.key];
        if (d && nudge(d[0], d[1])) e.preventDefault();
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
      if (k === "p") pickTool("pen");
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
      if ((e.key === "Delete" || e.key === "Backspace") && selTextRef.current) {
        e.preventDefault();
        deleteSelText();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selLineRef.current) {
        e.preventDefault();
        deleteSelLine();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current) deleteSelected();
      // Enter opens the selected words to edit.
      if (e.key === "Enter" && selTextRef.current) {
        e.preventDefault();
        editSel();
      }
      if (e.key === "Escape" && (selectedRef.current || selTextRef.current || selLineRef.current)) {
        select(null);
        selectText(null);
        selectLine(null);
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
    markAway();
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

  return (
    <div
      data-board
      className="fixed inset-0 select-none overflow-hidden text-[#1A1D20] [-webkit-touch-callout:none]"
      style={{ fontFamily: "var(--font-sans)", background: THEMES[look].bg }}
      // Files dragged in from the laptop's desktop or a folder land on the board, like Insert.
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        if (busy) flash("Still adding the last one. Try again in a moment.");
        else void insertFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: tool === "eraser" ? "none" : overItem ? "move" : tool === "move" ? "grab" : tool === "text" ? "text" : lead ? "auto" : penCursor(inkOf(color)) }}
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
      />
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
        onChange={(e) => onTypingInput(e.target.value)}
        onBlur={(e) => {
          // Tapping the style bar: keep typing (and the keyboard) open.
          if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest?.("[data-typing-ui]")) return;
          commitTyping();
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
            e.preventDefault();
            commitTyping();
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
        className={`absolute resize-none overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent p-0 leading-[1.25] outline-none [field-sizing:content] ${
          typing ? "rounded-sm ring-2 ring-[#FBC159] ring-offset-4 ring-offset-transparent" : "pointer-events-none opacity-0"
        }`}
        style={
          typing
            ? {
                left: typing.x,
                top: typing.y,
                fontSize: typing.px,
                fontWeight: typing.bold ? 700 : 500,
                fontStyle: typing.italic ? "italic" : "normal",
                background: typing.hl ? HIGHLIGHT : "transparent",
                color: inkOf(typing.color),
                caretColor: inkOf(typing.color),
                minWidth: Math.max(40, typing.px * 3),
                maxWidth: typing.maxPx,
              }
            : { left: -9999, top: 0, width: 1, height: 1 }
        }
      />

      {/* While typing: bold, italic, highlight, just above the words (taps keep the keyboard open). */}
      {typing && (
        <div
          ref={styleBarRef}
          data-typing-ui
          className={`${PANEL} absolute z-20 flex animate-[scale-in_140ms_ease-out] items-center gap-0.5 p-1 motion-reduce:animate-none`}
          // Above the words, or below them when there's no room above (near the top of the screen).
          style={{
            left: Math.min(Math.max(8, typing.x - 6), Math.max(8, screen.current.w - (lead ? 372 : 304))),
            top: typing.y - 60 > 64 ? typing.y - 60 : typing.y + typing.hPx + 14,
          }}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
        >
          {(
            [
              ["bold", "B", "Bold (Ctrl+B)", "font-bold"],
              ["italic", "I", "Italic (Ctrl+I)", "italic font-serif"],
            ] as const
          ).map(([k, label, title, cls]) => (
            <button
              key={k}
              type="button"
              aria-label={title}
              aria-pressed={!!typing[k]}
              {...tipOn(title.split(" (")[0], title.slice(title.indexOf("(") + 1, -1))}
              onClick={() => toggleStyle(k)}
              className={`${PRESS} flex items-center justify-center rounded-[10px] text-[15px] ${lead ? "h-11 w-11" : `h-9 w-9 ${HIT}`} ${cls} ${typing[k] ? ON : QUIET}`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            aria-label="Highlight (Ctrl+H)"
            aria-pressed={!!typing.hl}
            {...tipOn("Highlight", "Ctrl+H")}
            onClick={() => toggleStyle("hl")}
            className={`${PRESS} flex items-center gap-2 rounded-[10px] px-3 text-xs font-semibold ${lead ? "h-11" : `h-9 ${HIT}`} ${typing.hl ? ON : QUIET}`}
          >
            <span className="h-3.5 w-3.5 rounded-[4px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: "rgb(255, 213, 0)" }} />
            Highlight
          </button>
          <Divider />
          <TextColors value={typing.color} big={lead} dark={dark} onPick={setTextColor} />
        </div>
      )}

      {/* Text box handles: the grip on the left moves the box, the side sets the line width, the corner the size. */}
      {typing && (
        <>
          <button
            type="button"
            data-typing-ui
            aria-label="Drag to move the text"
            title="Drag to move"
            onPointerDown={onGripDown}
            onMouseDown={(e) => e.preventDefault()}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            className={`absolute z-20 flex cursor-move touch-none items-center justify-center rounded-full ${lead ? "h-11 w-11" : "h-9 w-9"}`}
            style={{ left: Math.max(4, typing.x - (lead ? 52 : 42)), top: typing.y + Math.min(typing.hPx, typing.px * 1.25) / 2 - (lead ? 22 : 18) }}
          >
            <span className={`flex items-center justify-center rounded-full border border-[#FBC159] bg-white text-[#1A1D20]/75 shadow-[0_1px_3px_rgba(20,22,24,0.35)] ${lead ? "h-8 w-8 [&>svg]:h-[18px] [&>svg]:w-[18px]" : "h-7 w-7 [&>svg]:h-4 [&>svg]:w-4"}`}>{I.move}</span>
          </button>
          <button
            type="button"
            data-typing-ui
            aria-label="Drag to make the text box wider or narrower"
            title="Drag: wider or narrower"
            onPointerDown={(e) => onHandleDown("w", e)}
            onMouseDown={(e) => e.preventDefault()}
            onPointerMove={(e) => onHandleMove(e)}
            onPointerUp={() => onHandleUp()}
            onPointerCancel={() => onHandleUp()}
            // The tablet: a finger-sized target that grows outwards (right, up and down); the pill itself stays where it was.
            className={`absolute z-20 flex cursor-ew-resize touch-none items-center ${lead ? "h-11 w-9 justify-start pl-[5px]" : "h-7 w-4 justify-center"}`}
            style={{ left: typing.x + typing.wPx + 6, top: typing.y + typing.hPx / 2 - (lead ? 22 : 14) }}
          >
            <span className="block h-6 w-1.5 rounded-full border border-[#FBC159] bg-white shadow-[0_1px_3px_rgba(20,22,24,0.35)]" />
          </button>
          <button
            type="button"
            data-typing-ui
            aria-label="Drag to make the text bigger or smaller"
            title="Drag: bigger or smaller"
            onPointerDown={(e) => onHandleDown("s", e)}
            onMouseDown={(e) => e.preventDefault()}
            onPointerMove={(e) => onHandleMove(e)}
            onPointerUp={() => onHandleUp()}
            onPointerCancel={() => onHandleUp()}
            // The tablet: a bigger target growing right and down; the dot stays where it was.
            className={`absolute z-20 flex cursor-nwse-resize touch-none ${lead ? "h-10 w-10 items-start justify-start p-[6px]" : "h-6 w-6 items-center justify-center"}`}
            style={{ left: typing.x + typing.wPx + 1, top: typing.y + typing.hPx + 1 }}
          >
            <span className={HANDLE_DOT} />
          </button>
        </>
      )}

      {/* Eraser ring */}
      <span
        ref={eraserRef}
        aria-hidden
        className="pointer-events-none absolute rounded-full border"
        style={{ left: 0, top: 0, display: "none", width: ERASER_PX * 2, height: ERASER_PX * 2, borderColor: THEMES[look].ring.border, background: THEMES[look].ring.fill }}
      />

      {/* Angle readout while drawing a line */}
      {angle && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-[#1A1D20] px-2.5 py-1 text-xs font-bold tabular-nums text-white shadow-lg ring-1 ring-white/[0.12]"
          style={{ left: angle.x + 18, top: angle.y - 34 }}
        >
          {angle.deg}°
        </span>
      )}

      {/* Tools hidden (clean screen for sharing): just a way back, in the corner. */}
      {toolsHidden && (
        <button
          type="button"
          onClick={() => setToolsHidden(false)}
          className={`absolute bottom-3 left-3 flex h-11 items-center gap-2 rounded-[12px] px-3 text-[11px] font-semibold transition-[opacity,background-color,color] duration-300 focus-visible:outline-none focus-visible:ring-2 motion-reduce:transition-none ${
            dark ? "text-white/60 hover:bg-white/[0.06] hover:text-white focus-visible:ring-white/50" : "text-[#6B7075] hover:bg-black/[0.04] hover:text-[#1B1E21] focus-visible:ring-[#1B1E21]/40"
          } ${quiet ? "opacity-0" : "opacity-70"}`}
        >
          Show tools
          <kbd className={`min-w-[18px] rounded-[5px] border px-1 text-center font-sans text-[10.5px] leading-[17px] ${dark ? "border-white/[0.18]" : "border-black/[0.12]"}`}>H</kbd>
        </button>
      )}

      {/* Everything on top of the board fades while the pen is down, and on the laptop when the mouse rests. */}
      <div className={`transition-opacity duration-300 ${toolsHidden ? "hidden" : ""} ${quiet ? "pointer-events-none opacity-0" : inking ? "opacity-25" : ""}`}>
        {/* The selected picture: a gold frame with a big handle at each corner (drag one to resize; it
            keeps its shape), and a small bar just above it. The inside lets the pen write straight through. */}
        {selectedId && (
          <>
            <div ref={selFrameRef} aria-hidden className={`pointer-events-none absolute ${SEL_FRAME}`} style={{ left: -9999, top: -9999 }}>
              {(["nw", "ne", "sw", "se"] as const).map((k) => (
                <span
                  key={k}
                  data-k={k}
                  onPointerDown={onCornerDown}
                  onPointerMove={onPicMove}
                  onPointerUp={onPicUp}
                  onPointerCancel={onPicUp}
                  onLostPointerCapture={onPicUp}
                  className={`pointer-events-auto absolute flex h-11 w-11 touch-none items-center justify-center ${k === "nw" || k === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"}`}
                  style={{ left: k[1] === "w" ? -22 : undefined, right: k[1] === "e" ? -22 : undefined, top: k[0] === "n" ? -22 : undefined, bottom: k[0] === "s" ? -22 : undefined }}
                >
                  <span className={HANDLE_DOT} />
                </span>
              ))}
            </div>
            <div ref={selBarRef} className={`${PANEL} absolute flex animate-[scale-in_140ms_ease-out] items-center gap-0.5 p-[3px] motion-reduce:animate-none`} style={{ left: -9999, top: -9999 }}>
              <button
                type="button"
                aria-label="Move the picture: drag this"
                {...tipOn("Move", undefined, "Drag this to move the picture.")}
                onPointerDown={(e) => onPicDown("move", e)}
                onPointerMove={onPicMove}
                onPointerUp={onPicUp}
                onPointerCancel={onPicUp}
                onLostPointerCapture={onPicUp}
                className={`${PRESS} ${GOLD_ON} flex cursor-grab touch-none items-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold active:cursor-grabbing [&_svg]:h-4 [&_svg]:w-4 ${lead ? "h-11" : `h-9 ${HIT}`}`}
              >
                {I.move}
                Move
              </button>
              <button type="button" {...tipOn("Fit", undefined, "Zoom to show the whole picture.")} onPointerDown={palmDown} onClick={() => !palmBlocked() && fitSelected()} className={`${PRESS} ${QUIET} flex items-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold [&_svg]:h-4 [&_svg]:w-4 ${lead ? "h-11" : `h-9 ${HIT}`}`}>
                {I.fit}
                Fit
              </button>
              <button type="button" {...tipOn("Bring to front")} onPointerDown={palmDown} onClick={() => !palmBlocked() && frontSelected()} className={`${PRESS} ${QUIET} rounded-[10px] px-3 text-xs font-semibold ${lead ? "h-11" : `h-9 ${HIT}`}`}>
                Front
              </button>
              <button type="button" {...tipOn("Remove the picture", "Delete")} onPointerDown={palmDown} onClick={() => !palmBlocked() && deleteSelected()} className={`${PRESS} flex items-center gap-1.5 rounded-[10px] bg-[#E5685A]/[0.14] px-3 text-xs font-semibold text-[#F4A397] hover:bg-[#E5685A]/[0.22] [&_svg]:h-4 [&_svg]:w-4 ${lead ? "h-11" : `h-9 ${HIT}`}`}>
                {I.trash}
                Remove
              </button>
              <Divider />
              <button
                type="button"
                {...tipOn("Done", "Esc")}
                onPointerDown={palmDown}
                onClick={() => {
                  if (palmBlocked()) return;
                  select(null);
                  requestDraw();
                }}
                className={`${PRESS} ${QUIET} rounded-[10px] px-3 text-xs font-semibold ${lead ? "h-11" : `h-9 ${HIT}`}`}
              >
                Done
              </button>
            </div>
          </>
        )}

        {/* The selected straight line (Move tool): a gold frame and a small bar. A drag on the line
            itself moves it (the board's own work). */}
        {selLine && (
          <>
            <div ref={selLineFrameRef} aria-hidden className={`pointer-events-none absolute ${SEL_FRAME}`} style={{ left: -9999, top: -9999 }} />
            <div ref={selLineBarRef} data-selline-bar className={`${PANEL} absolute z-20 flex animate-[scale-in_140ms_ease-out] items-center gap-0.5 p-[3px] motion-reduce:animate-none`} style={{ left: -9999, top: -9999 }}>
              <button
                type="button"
                {...tipOn(selLine.dotted ? "Make it solid" : "Make it dotted", "D")}
                onPointerDown={palmDown}
                onClick={() => !palmBlocked() && toggleSelLine()}
                className={`${PRESS} ${QUIET} flex items-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold [&_svg]:h-4 [&_svg]:w-4 ${lead ? "h-11" : `h-9 ${HIT}`}`}
              >
                {selLine.dotted ? LINE_SOLID : LINE_DOTTED}
                {selLine.dotted ? "Solid" : "Dotted"}
              </button>
              <button
                type="button"
                {...tipOn("Duplicate", undefined, "Makes a copy just beside it, ready to drag.")}
                onPointerDown={palmDown}
                onClick={() => !palmBlocked() && duplicateSelLine()}
                className={`${PRESS} ${QUIET} flex items-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold [&_svg]:h-4 [&_svg]:w-4 ${lead ? "h-11" : `h-9 ${HIT}`}`}
              >
                Duplicate
              </button>
              <button type="button" aria-label="Remove the line" {...tipOn("Remove the line", "Delete")} onPointerDown={palmDown} onClick={() => !palmBlocked() && deleteSelLine()} className={`${PRESS} flex items-center gap-1.5 rounded-[10px] bg-[#E5685A]/[0.14] px-3 text-xs font-semibold text-[#F4A397] hover:bg-[#E5685A]/[0.22] [&_svg]:h-4 [&_svg]:w-4 ${lead ? "h-11" : `h-9 ${HIT}`}`}>
                {I.trash}
              </button>
              <Divider />
              <button
                type="button"
                {...tipOn("Done", "Esc")}
                onPointerDown={palmDown}
                onClick={() => {
                  if (palmBlocked()) return;
                  selectLine(null);
                  requestDraw();
                }}
                className={`${PRESS} ${QUIET} rounded-[10px] px-3 text-xs font-semibold ${lead ? "h-11" : `h-9 ${HIT}`}`}
              >
                Done
              </button>
            </div>
          </>
        )}

        {/* The Line tool in hand: Solid or Dotted for the next line, beside the tools. */}
        {tool === "line" && (
          <div
            data-line-style
            role="group"
            aria-label="Line style"
            className={`${PANEL} absolute flex animate-[scale-in_140ms_ease-out] items-center gap-0.5 p-[3px] motion-reduce:animate-none ${
              lead ? "left-[72px] top-[calc(max(64px,50dvh_-_370.5px)_+_49px)]" : "bottom-[76px] left-1/2 -translate-x-1/2"
            }`}
          >
            {([false, true] as const).map((d) => (
              <button
                key={d ? "dotted" : "solid"}
                type="button"
                aria-pressed={lineDotted === d}
                {...tipOn(d ? "Dotted line" : "Solid line", "D", "For the next line you draw.")}
                onPointerDown={palmDown}
                onClick={() => !palmBlocked() && setLineDotted(d)}
                className={`${PRESS} flex items-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold [&_svg]:h-4 [&_svg]:w-4 ${lead ? "h-11" : `h-9 ${HIT}`} ${lineDotted === d ? ON : QUIET}`}
              >
                {d ? LINE_DOTTED : LINE_SOLID}
                {d ? "Dotted" : "Solid"}
              </button>
            ))}
          </div>
        )}

        {/* The selected typed text: the same gold frame as a picture, a pill on its side for how wide its
            lines run, a dot on its corner for its size, and its bar just above. A drag on the words
            themselves moves them (that part is the board's own work). */}
        {selText && (
          <>
            <div ref={selTextFrameRef} aria-hidden className={`pointer-events-none absolute ${SEL_FRAME}`} style={{ left: -9999, top: -9999 }}>
              <span
                data-k="w"
                onPointerDown={onTextGripDown}
                onPointerMove={onTextGripMove}
                onPointerUp={onTextGripUp}
                onPointerCancel={onTextGripUp}
                onLostPointerCapture={onTextGripUp}
                className="pointer-events-auto absolute right-[-30px] top-1/2 flex h-11 w-9 -translate-y-1/2 cursor-ew-resize touch-none items-center pl-[3px]"
              >
                <span className="block h-6 w-1.5 rounded-full border border-[#FBC159] bg-white shadow-[0_1px_3px_rgba(20,22,24,0.35)]" />
              </span>
              <span
                data-k="s"
                onPointerDown={onTextGripDown}
                onPointerMove={onTextGripMove}
                onPointerUp={onTextGripUp}
                onPointerCancel={onTextGripUp}
                onLostPointerCapture={onTextGripUp}
                className="pointer-events-auto absolute bottom-[-34px] right-[-34px] flex h-11 w-11 cursor-nwse-resize touch-none items-start justify-start p-[2px]"
              >
                <span className={HANDLE_DOT} />
              </span>
            </div>
            <div ref={selTextBarRef} data-seltext-bar className={`${PANEL} absolute z-20 flex animate-[scale-in_140ms_ease-out] items-center gap-0.5 p-[3px] motion-reduce:animate-none`} style={{ left: -9999, top: -9999 }}>
              <button
                type="button"
                data-k="move"
                aria-label="Move the text: drag this, or drag the words"
                {...tipOn("Move", undefined, "Drag this, or the words themselves.")}
                onPointerDown={onTextGripDown}
                onPointerMove={onTextGripMove}
                onPointerUp={onTextGripUp}
                onPointerCancel={onTextGripUp}
                onLostPointerCapture={onTextGripUp}
                className={`${PRESS} ${GOLD_ON} flex cursor-grab touch-none items-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold active:cursor-grabbing [&_svg]:h-4 [&_svg]:w-4 ${lead ? "h-11" : `h-9 ${HIT}`}`}
              >
                {I.move}
                Move
              </button>
              <button type="button" data-k="bold" aria-label="Bold" aria-pressed={selText.bold} {...tipOn("Bold")} onPointerDown={palmDown} onClick={onSelStyle} className={`${PRESS} flex items-center justify-center rounded-[10px] text-[15px] font-bold ${lead ? "h-11 w-11" : `h-9 w-9 ${HIT}`} ${selText.bold ? ON : QUIET}`}>
                B
              </button>
              <button type="button" data-k="italic" aria-label="Italic" aria-pressed={selText.italic} {...tipOn("Italic")} onPointerDown={palmDown} onClick={onSelStyle} className={`${PRESS} flex items-center justify-center rounded-[10px] font-serif text-[15px] italic ${lead ? "h-11 w-11" : `h-9 w-9 ${HIT}`} ${selText.italic ? ON : QUIET}`}>
                I
              </button>
              <button type="button" data-k="hl" aria-label="Highlight" aria-pressed={selText.hl} {...tipOn("Highlight")} onPointerDown={palmDown} onClick={onSelStyle} className={`${PRESS} flex items-center gap-2 rounded-[10px] px-3 text-xs font-semibold ${lead ? "h-11" : `h-9 ${HIT}`} ${selText.hl ? ON : QUIET}`}>
                <span className="h-3.5 w-3.5 rounded-[4px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]" style={{ background: "rgb(255, 213, 0)" }} />
                Highlight
              </button>
              <Divider />
              <TextColors value={selText.color} big={lead} dark={dark} onPick={(c) => !palmBlocked() && colorSel(c)} />
              <Divider />
              <button type="button" {...tipOn("Edit the words", "Enter", "Or tap the words again.")} onPointerDown={palmDown} onClick={() => !palmBlocked() && editSel()} className={`${PRESS} ${QUIET} rounded-[10px] px-3 text-xs font-semibold ${lead ? "h-11" : `h-9 ${HIT}`}`}>
                Edit
              </button>
              <button type="button" aria-label="Remove the text" {...tipOn("Remove the text", "Delete")} onPointerDown={palmDown} onClick={() => !palmBlocked() && deleteSelText()} className={`${PRESS} flex items-center justify-center rounded-[10px] bg-[#E5685A]/[0.14] text-[#F4A397] hover:bg-[#E5685A]/[0.22] [&_svg]:h-4 [&_svg]:w-4 ${lead ? "h-11 w-11" : `h-9 w-9 ${HIT}`}`}>
                {I.trash}
              </button>
            </div>
          </>
        )}

        {/* Top: who's linked (left), view controls (right). Small, so the board gets the room. */}
        <div ref={topBarRef} className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          {/* The page: each class has its own, always there. Tap the name for the list of pages;
              the arrows step through them, + starts a blank one. */}
          <div className={`${PANEL} pointer-events-auto relative z-30 flex h-11 shrink-0 items-center gap-0.5 px-[3px]`}>
            <SmallButton label="Previous page" keys="[" onClick={() => stepPage(-1)} disabled={pageIndex <= 0}>{I.prev}</SmallButton>
            <button
              type="button"
              onClick={() => setPagesOpen((v) => !v)}
              aria-expanded={pagesOpen}
              data-pages-menu
              aria-haspopup="listbox"
              {...tipOn("All pages", undefined, pageList.length > 1 ? `Page ${pageIndex + 1} of ${pageList.length}` : undefined)}
              className={`${PRESS} ${HIT} flex h-9 max-w-[30vw] items-center gap-1.5 rounded-[10px] pl-2.5 pr-2 sm:max-w-[46vw] text-[13px] font-semibold tracking-[-0.005em] ${pagesOpen ? ON : "text-white hover:bg-white/[0.07]"}`}
            >
              <span className="truncate">{page.title}</span>
              <svg
                viewBox="0 0 24 24"
                className={`h-4 w-4 shrink-0 text-white/50 transition-transform duration-200 ease-out motion-reduce:transition-none ${pagesOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m6.5 9.5 5.5 5.5 5.5-5.5" />
              </svg>
            </button>
            {pagesOpen && (
              <>
                <ul data-pages-menu role="listbox" aria-label="Pages" className={`${PANEL} absolute left-0 top-[52px] z-50 max-h-[60vh] w-72 origin-top-left animate-[scale-in_140ms_ease-out] overflow-y-auto p-1.5 [scrollbar-width:thin] motion-reduce:animate-none`}>
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
                        className={`${PRESS} flex h-11 w-full items-center gap-2.5 rounded-[12px] px-3 text-left text-sm font-semibold active:scale-[0.98] ${x.id === page.id ? ON : QUIET}`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${x.id === page.id ? "bg-[#FBC159]" : "bg-white/20"}`} aria-hidden />
                        <span className="truncate">{x.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <SmallButton label="Next page" keys="]" onClick={() => stepPage(1)} disabled={pageIndex >= pageList.length - 1}>{I.next}</SmallButton>
            <SmallButton label="New blank page" keys="N" onClick={newPage}>{I.plus}</SmallButton>
            {page.id !== MAIN_PAGE.id && <SmallButton label="Delete this page" onClick={() => setConfirmDelete(true)}>{I.trash}</SmallButton>}
            <Divider />
            <span
              className="flex shrink-0 items-center gap-1.5 pl-0.5 pr-2.5 text-[11px] font-semibold text-white/60"
              {...tipOn(
                partner ? (lead ? "Laptop linked" : "Tablet linked") : lead ? "No laptop yet" : "No tablet yet",
                undefined,
                lead ? "Open /teach/present on your laptop: it draws too, and follows this tablet." : "Open the board on your tablet: when it pans or zooms, this screen follows.",
              )}
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${partner ? "bg-[#6FBBA8] shadow-[0_0_0_3px_rgba(111,187,168,0.18)]" : "bg-white/25"}`} />
              <span className="sr-only sm:not-sr-only">
                {partner ? (lead ? "Laptop" : "Tablet") : lead ? "No laptop" : "No tablet"}
              </span>
            </span>
          </div>
          <div ref={sidePanelRef} className={`${PANEL} pointer-events-auto flex h-11 min-w-0 items-center overflow-hidden`}>
            {/* On a narrow phone the view controls slide sideways instead of crowding the page bar. */}
            <div className="flex h-full min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap px-[3px] [scrollbar-width:none] [&>*]:shrink-0">
            {lead && (
              <button
                type="button"
                onClick={() => setFingerDraws((v) => !v)}
                aria-pressed={fingerDraws}
                {...tipOn(fingerDraws ? "Finger draws" : "Pen only", undefined, "For phones without a pen. On your tablet, leave this off: only the S Pen draws.")}
                className={`${PRESS} ${HIT} h-9 rounded-[10px] px-3 text-xs font-semibold ${fingerDraws ? ON : QUIET}`}
              >
                {fingerDraws ? "Finger draws" : "Pen only"}
              </button>
            )}
            <button type="button" onClick={fit} aria-label={`Zoom ${zoom}%. Fit the whole board`} {...tipOn("Fit the whole board", undefined, "Shows everything on this page")} className={`${PRESS} ${QUIET} ${HIT} flex h-9 w-[60px] items-center justify-center gap-1 rounded-[10px] text-xs font-semibold tabular-nums`}>
              {zoom}%
            </button>
            {!lead && away && (
              <button
                type="button"
                onClick={() => follow.current()}
                {...tipOn("Back to the tablet's view", undefined, "This screen was moved by hand. It also goes back by itself when the tablet moves.")}
                className={`${PRESS} ${GOLD_ON} ${HIT} h-9 rounded-[10px] px-3 text-xs font-semibold`}
              >
                Tablet view
              </button>
            )}
            <button
              type="button"
              data-paper-menu
              onClick={() => setPaperOpen((v) => !v)}
              aria-expanded={paperOpen}
              aria-haspopup="menu"
              aria-label={`Paper: ${BACKDROP_NAME[paper]}${dark ? ", dark board" : ""}`}
              {...tipOn("Paper", undefined, `Plain, dots, lines or squared, on a light or dark board. The ${lead ? "laptop" : "tablet"} changes too.`)}
              className={`${PRESS} ${HIT} h-9 rounded-[10px] px-3 text-xs font-semibold ${paperOpen ? ON : QUIET}`}
            >
              {BACKDROP_NAME[paper]}
            </button>
            <SmallButton label="Hide the tools for a clean shared screen" keys="H" onClick={() => setToolsHidden(true)}>{I.hide}</SmallButton>
            {lead && (
              <button
                type="button"
                onClick={() => void copyLink()}
                {...tipOn("Copy the laptop link", undefined, "Open it on your laptop and share that screen in Meet.")}
                className={`${PRESS} ${HIT} ml-0.5 h-9 rounded-[10px] bg-[#FBC159] px-3.5 text-xs font-bold text-[#1B1E21] hover:bg-[#FFD07A] active:bg-[#E5A832]`}
              >
                {copiedPresent ? "Copied" : "Laptop link"}
              </button>
            )}
            </div>
          </div>
          {/* The papers: four prints, on the light board or the dark one. One tap each. */}
          {paperOpen && (
            <div data-paper-menu role="menu" aria-label="Paper" className={`${PANEL} pointer-events-auto absolute right-3 top-[64px] z-50 w-[252px] origin-top-right animate-[scale-in_140ms_ease-out] p-2 motion-reduce:animate-none`}>
              <div className="grid grid-cols-4 gap-1">
                {BACKDROPS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    role="menuitemradio"
                    aria-checked={paper === b}
                    data-v={b}
                    onClick={onPickPaper}
                    className={`${PRESS} flex flex-col items-center gap-1.5 rounded-[12px] px-1 pb-1.5 pt-2 text-[11px] font-semibold ${paper === b ? ON : QUIET}`}
                  >
                    <span
                      aria-hidden
                      className={`block h-8 w-11 rounded-[6px] ${paper === b ? "shadow-[0_0_0_1.5px_#FBC159]" : "shadow-[0_0_0_1px_rgba(255,255,255,0.14)]"}`}
                      style={{ backgroundColor: THEMES[look].bg, ...PAPER_SWATCH[b](dark ? "rgba(240,237,232,0.4)" : "rgba(26,29,32,0.34)") }}
                    />
                    {BACKDROP_NAME[b]}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 rounded-[12px] bg-white/[0.05] p-1" role="group" aria-label="Board">
                <button type="button" role="menuitemradio" aria-checked={!dark} data-v="light" onClick={onPickTone} className={`${PRESS} h-11 rounded-[9px] text-xs font-semibold ${!dark ? ON : QUIET}`}>
                  Light board
                </button>
                <button type="button" role="menuitemradio" aria-checked={dark} data-v="dark" onClick={onPickTone} className={`${PRESS} h-11 rounded-[9px] text-xs font-semibold ${dark ? ON : QUIET}`}>
                  Dark board
                </button>
              </div>
            </div>
          )}
        </div>


        {/* Main toolbar */}
        {/* The tablet: a column down the left edge, away from the writing hand's palm. The laptop:
            along the bottom. */}
        <div
          ref={toolbarRef}
          className={`${PANEL} absolute flex items-center gap-0.5 p-[3px] [scrollbar-width:none] ${
            lead
              ? // In the middle of the screen's height when there is room (as before). In a short browser
                // window (the tablet's address bar and tab strip showing) it starts just under the page bar
                // and its buttons are a little shorter (and the dividers closer), so "Clear the board" is
                // never cut off at the bottom, with the fourth ink colour in the column too.
                "left-3 top-[max(64px,calc(50dvh_-_370.5px))] max-h-[calc(100dvh-76px)] flex-col overflow-y-auto [@media(max-height:800px)]:[&>button]:h-10 [@media(max-height:800px)]:[&>span]:my-1"
              : "bottom-4 left-1/2 max-w-[calc(100vw-16px)] -translate-x-1/2 overflow-x-auto"
          }`}
        >
          <ToolButton label="Pen (P). Draw a T for a T account; hold still at the end to snap a line, box or circle" tip="Pen" keys="P" hint="Draw a T for a T account. Hold still at the end to snap a line, box or circle." active={tool === "pen"} onClick={() => pickTool("pen")}>{I.pen}</ToolButton>
          <ToolButton label="Straight line (L), at any angle. Solid or Dotted appears beside the tools" tip="Straight line" keys="L" hint={lead ? "Goes at any angle. Pick Solid or Dotted beside the tools." : "Goes at any angle. D switches Solid and Dotted. Hold Shift for steps of 15 degrees."} active={tool === "line"} onClick={() => pickTool("line")}>{I.line}</ToolButton>
          <ToolButton label="Eraser (E), or hold the pen's side button" tip="Eraser" keys="E" hint="Or hold the pen's side button." active={tool === "eraser"} onClick={() => pickTool("eraser")}>{I.eraser}</ToolButton>
          <ToolButton label="Type (T starts typing where the mouse is). Enter finishes, Shift+Enter for a new line. Tap typed words to select them, drag to move them, tap again to edit" tip="Type" keys="T" hint="Starts where the mouse is. Enter finishes, Shift+Enter for a new line. Tap typed words to select them, drag to move, tap again to edit." active={tool === "text"} onClick={() => pickTool("text")}>{I.text}</ToolButton>
          <ToolButton label="Move (V): drag pictures, typed text or writing" tip="Move" keys="V" hint="Drag pictures, typed text or writing. Tap a straight line for Dotted and Duplicate. With any tool, tap typed words with a finger to select them, then drag." active={tool === "move"} onClick={() => pickTool("move")}>{I.move}</ToolButton>
          <ToolButton label="Insert a picture or PDF" tip="Picture or PDF" hint={lead ? undefined : "Or paste one (Ctrl+V), or drop a file on the board."} disabled={!!busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Spinner size={20} className="text-white/80" /> : I.insert}
          </ToolButton>
          <Divider across={lead} />
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={inkName(c.name, dark)}
              aria-pressed={color === c.value}
              {...tipOn(`${inkName(c.name, dark)} ink`)}
              onPointerDown={palmDown}
              onClick={() => {
                if (palmBlocked()) return;
                setColor(c.value);
                if (tool === "eraser" || tool === "move") pickTool("pen");
              }}
              className={`${PRESS} flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] hover:bg-white/[0.06]`}
            >
              <Swatch ink={inkOf(c.value)} on={color === c.value} size={20} />
            </button>
          ))}
          <Divider across={lead} />
          {SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-label={`${s.name} pen`}
              aria-pressed={size === s.value}
              {...tipOn(`${s.name} pen`)}
              onPointerDown={palmDown}
              onClick={() => !palmBlocked() && setSize(s.value)}
              className={`${PRESS} flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${size === s.value ? ON : "hover:bg-white/[0.06]"}`}
            >
              <span
                className="block rounded-full transition-colors duration-150 motion-reduce:transition-none"
                style={{ width: s.value * 2.2, height: s.value * 2.2, background: size === s.value ? "#FFFFFF" : "rgba(255,255,255,0.42)" }}
              />
            </button>
          ))}
          <Divider across={lead} />
          <ToolButton label="Undo (Ctrl+Z)" tip="Undo" keys="Ctrl+Z" disabled={!meta.undo} onClick={undo}>{I.undo}</ToolButton>
          <ToolButton label="Redo (Ctrl+Shift+Z)" tip="Redo" keys="Ctrl+Shift+Z" disabled={!meta.redo} onClick={redo}>{I.redo}</ToolButton>
          <ToolButton label="Clear the board" disabled={!hasContent} onClick={() => setConfirmClear(true)}>{I.trash}</ToolButton>
        </div>
      </div>

      {/* A blank page on the tablet: one quiet line in the middle, gone with the first stroke.
          Not on the laptop, whose screen the class sees. */}
      {lead && !hasContent && !typing && !inking && !toolsHidden && !quiet && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center" aria-hidden>
          <p className={`text-[15px] font-semibold tracking-[-0.01em] ${dark ? "text-white/35" : "text-[#1B1E21]/35"}`}>Write anywhere</p>
          <p className={`flex items-center gap-1.5 text-xs ${dark ? "text-white/30" : "text-[#1B1E21]/30"}`}>
            <span>Pen draws</span>
            <span aria-hidden>·</span>
            <span>{fingerDraws ? "fingers draw too" : "fingers move the board"}</span>
          </p>
        </div>
      )}

      <BoardTip />

      {/* Short messages: "Undone", upload progress, errors */}
      {(notice || busy || linkLost) && (
        <div className={`${PANEL} pointer-events-none absolute left-1/2 flex -translate-x-1/2 animate-[scale-in_140ms_ease-out] items-center rounded-full px-4 py-2.5 text-xs font-semibold motion-reduce:animate-none ${lead ? "bottom-6" : "bottom-20"}`} role="status">
          {notice ?? busy ?? "Laptop link lost. Your writing is safe here."}
        </div>
      )}

      {/* Pen diagnostics (?debug=1): what the tablet reports for the pen and its button */}
      {debug && (
        <div className="pointer-events-none absolute left-4 top-20 max-w-[90vw] rounded-lg bg-black/80 px-3 py-2 font-mono text-[11px] text-[#7FD1A6]">{debug}</div>
      )}

      {/* Delete page confirm */}
      {confirmDelete && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-[#141618]/30 px-4 backdrop-blur-[2px]" onClick={() => setConfirmDelete(false)}>
          <div role="alertdialog" aria-modal="true" aria-label="Delete this page" className={`${PANEL} w-[340px] max-w-full animate-[scale-in_160ms_ease-out] rounded-[22px] p-6 text-center motion-reduce:animate-none`} onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold tracking-[-0.01em]">Delete &ldquo;{page.title}&rdquo;?</p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/60">
              {page.classId
                ? "Its writing goes for good, on your laptop too. The class keeps its page, empty."
                : "The page and its writing go for good, on your laptop too."}
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" autoFocus onClick={() => setConfirmDelete(false)} className={`${PRESS} h-11 flex-1 rounded-[12px] bg-white/[0.07] text-sm font-semibold text-white hover:bg-white/[0.11]`}>
                Cancel
              </button>
              <button type="button" onClick={deletePage} className={`${PRESS} h-11 flex-1 rounded-[12px] bg-[#C2382C] text-sm font-bold text-white hover:bg-[#D0453A]`}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear confirm */}
      {confirmClear && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-[#141618]/30 px-4 backdrop-blur-[2px]" onClick={() => setConfirmClear(false)}>
          <div role="alertdialog" aria-modal="true" aria-label="Clear the whole board" className={`${PANEL} w-[340px] max-w-full animate-[scale-in_160ms_ease-out] rounded-[22px] p-6 text-center motion-reduce:animate-none`} onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold tracking-[-0.01em]">Clear the whole board?</p>
            <p className="mt-1.5 text-sm leading-relaxed text-white/60">Writing and pictures go. Undo brings them back.</p>
            <div className="mt-5 flex gap-2">
              <button type="button" autoFocus onClick={() => setConfirmClear(false)} className={`${PRESS} h-11 flex-1 rounded-[12px] bg-white/[0.07] text-sm font-semibold text-white hover:bg-white/[0.11]`}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAll();
                  setConfirmClear(false);
                }}
                className={`${PRESS} h-11 flex-1 rounded-[12px] bg-white text-sm font-bold text-[#1B1E21] hover:bg-white/90`}
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
          const same =
            m.d !== undefined
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
    <div className="fixed inset-0 select-none overflow-hidden text-[#f0ede8]" style={{ background: THEMES[look].bg }}>
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
