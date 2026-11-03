"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  drawGrid,
  drawImages,
  drawStroke,
  areaView,
  clearInset,
  fitView,
  hitStroke,
  imageAt,
  imageSize,
  isPenEraser,
  lineAngle,
  measureText,
  newId,
  TEXT_PX,
  packStroke,
  lineDir,
  recogniseShape,
  settleStroke,
  smoothPoint,
  steadyFor,
  straightOf,
  strokeBox,
  tAccountOf,
  snapLine,
  toWorld,
  visibleView,
  zoomAt,
} from "@/components/board/engine";
import { boardDigest, connectBoard, Ledger, viewerRoom, type BoardLink, type BoardMsg } from "@/components/board/sync";
import { loadBoard, saveBoard } from "@/components/board/storage";
import { cloudinaryConfigured, uploadImage, uploadPdfPages } from "@/lib/cloudinary";

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
const PALM_LOCK_MS = 350;
const PALM_SIZE_PX = 56;
const ERASER_PX = 14;
const PAN_GAIN = 1.15;
const HANDLE_PX = 22;

type Tool = "pen" | "line" | "eraser" | "move" | "text";
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
    const resize = () => {
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = c.clientHeight;
      size.current = { w, h, dpr };
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      dirty.current = true;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    let raf = 0;
    const loop = () => {
      if (dirty.current) {
        dirty.current = false;
        const ctx = c.getContext("2d")!;
        const { w, h, dpr } = size.current;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawRef.current(ctx, w, h, () => {
          dirty.current = true;
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return { canvasRef, size, requestDraw };
}

/** The cached finished board for each canvas (see paint). */
type Layer = { c: HTMLCanvasElement; key: string; strokes: Stroke[] | null; images: BoardImage[] | null };
const layers = new WeakMap<HTMLCanvasElement, Layer>();
/** Goes up each time a picture finishes loading, so the layer is redrawn with it. */
let imageVersion = 0;

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
  // The finished board (paper, grid, pictures, every stroke) is drawn once into its own
  // layer and reused while the pen moves: each frame then only adds the stroke being
  // drawn, so a full board stays as quick as an empty one. Redrawn only when the board,
  // the view or a picture changes.
  const dpr = ctx.getTransform().a || 1;
  let L = layers.get(ctx.canvas);
  if (!L) {
    L = { c: document.createElement("canvas"), key: "", strokes: null, images: null };
    layers.set(ctx.canvas, L);
  }
  const key = `${w}|${h}|${dpr}|${cam.x}|${cam.y}|${cam.z}|${look.bg}|${imageVersion}`;
  if (L.key !== key || L.strokes !== strokes || L.images !== images) {
    L.key = key;
    L.strokes = strokes;
    L.images = images;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (L.c.width !== pw || L.c.height !== ph) {
      L.c.width = pw;
      L.c.height = ph;
    }
    const b = L.c.getContext("2d")!;
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.fillStyle = look.bg;
    b.fillRect(0, 0, w, h);
    b.save();
    b.scale(cam.z, cam.z);
    b.translate(-cam.x, -cam.y);
    drawGrid(b, cam, w, h);
    drawImages(b, images, () => {
      imageVersion++;
      onImage();
    });
    // Only what is on screen gets drawn.
    const vx = cam.x, vy = cam.y, vw = w / cam.z, vh = h / cam.z;
    for (const s of strokes) {
      const bx = strokeBox(s);
      if (bx.x > vx + vw || bx.y > vy + vh || bx.x + bx.w < vx || bx.y + bx.h < vy) continue;
      drawStroke(b, s);
    }
    b.restore();
  }
  ctx.drawImage(L.c, 0, 0, w, h);
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
  link: svg(
    <>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </>,
  ),
};

function ToolButton({ active, label, onClick, disabled, children }: { active?: boolean; label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors duration-150 disabled:opacity-30 [&_svg]:h-[21px] [&_svg]:w-[21px] ${
        active ? "bg-[#1A1D20] text-white" : "text-[#4B5563] hover:bg-black/[0.05] hover:text-[#1A1D20]"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-6 w-px shrink-0 bg-black/[0.08]" aria-hidden />;

/** The look of every floating bar: white, a hairline edge, a soft shadow. */
const PANEL = "rounded-2xl border border-black/[0.07] bg-white/92 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_10px_30px_-14px_rgba(16,24,40,0.25)] backdrop-blur-xl";

function SmallButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-7 w-8 items-center justify-center rounded-lg text-[#6B7280] transition-colors hover:bg-black/[0.05] hover:text-[#1A1D20] [&_svg]:h-[18px] [&_svg]:w-[18px]"
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
  // Light (paper) or dark (night) board: shared with the other device and students.
  const look: ThemeId = "paper";
  const [ledger] = useState(() => new Ledger(lead ? 1 : 0));
  const remoteLiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toolsHidden, setToolsHidden] = useState(false);
  // Pen down: the bars fade so they never cover the writing.
  const [inking, setInking] = useState(false);
  // Laptop (what students see): the bars hide after a few seconds without the mouse.
  const [quiet, setQuiet] = useState(false);
  const topBarRef = useRef<HTMLDivElement>(null);
  const sidePanelRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Typing: where the text box sits on screen, and what is in it.
  const [typing, setTyping] = useState<{ x: number; y: number; px: number; color: string } | null>(null);
  const typingRef = useRef<{ id: string; wx: number; wy: number; size: number; color: string; text: string; editing?: Stroke } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // What the other device is drawing or typing right now.
  const remoteLive = useRef<Stroke | null>(null);
  const [angle, setAngle] = useState<{ x: number; y: number; deg: number } | null>(null);
  const [eraserAt, setEraserAt] = useState<{ x: number; y: number } | null>(null);
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

  const syncMeta = () =>
    setMeta({ undo: undoStack.current.length, redo: redoStack.current.length, content: strokes.current.length + images.current.length });

  const select = (id: string | null) => {
    selectedRef.current = id;
    setSelectedId(id);
  };

  const { canvasRef, size: screen, requestDraw } = useCanvas((ctx, w, h, again) =>
    paint(
      ctx,
      w,
      h,
      cam.current,
      images.current,
      strokes.current,
      [current.current, remoteLive.current],
      again,
      images.current.find((m) => m.id === selectedRef.current) ?? null,
    ),
  );

  // ---- persistence + live link
  // Saved under the room's first part, so a board drawn before the private key existed is still here.
  // The laptop keeps its own copy: the tablet's board always wins when both are on.
  const storeKey = `ht-board-${room.split(".")[0]}${lead ? "" : "-laptop"}`;
  const save = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(() => {
    if (save.current) clearTimeout(save.current);
    save.current = setTimeout(() => {
      // Pictures that only live in this browser (local preview) aren't kept. Saved compact
      // (points rounded to a tenth), so even a very full board saves in a moment.
      void saveBoard(storeKey, { strokes: strokes.current.map(packStroke), images: images.current.filter((m) => !m.url.startsWith("blob:")) });
    }, 700);
  }, [storeKey]);

  // Everything goes to the private room: just Hamza's tablet and laptop, nobody else.
  const send = useCallback(
    (m: BoardMsg) => {
      link.current?.send(stampMsg(ledger, m));
    },
    [ledger],
  );
  const fullBoard = useCallback(
    (): BoardMsg => ({ t: "set", strokes: strokes.current.map(packStroke), images: images.current.filter((m) => !m.url.startsWith("blob:")) }),
    [],
  );
  // What the tablet shares: the space between its own toolbars, where Hamza writes. The
  // laptop and students fit exactly that, so it fills their screens and nothing is cut off.
  const writingView = (w: number, h: number) =>
    areaView(cam.current, w, h, clearInset(h, [topBarRef.current, sidePanelRef.current], [toolbarRef.current], 0));
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
      }, 40); // ~25 position updates a second to the laptop, which glides between them
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

  useEffect(() => {
    showDebug.current = new URL(window.location.href).searchParams.get("debug") === "1";
    let alive = true;
    const loadSaved = async () => {
      const saved = await loadBoard(storeKey);
      if (!alive || !saved) return;
      // Anything that arrived while it loaded (the other device's board) stays too.
      const hasS = new Set(saved.strokes.map((x) => x.id));
      const hasI = new Set(saved.images.map((x) => x.id));
      strokes.current = [...saved.strokes, ...strokes.current.filter((x) => !hasS.has(x.id))];
      images.current = [...saved.images, ...images.current.filter((x) => !hasI.has(x.id))];
      requestDraw();
      syncMeta();
    };
    // The tablet opens its saved board. The laptop waits a moment for the tablet's
    // board, and only opens its own copy when the tablet isn't on.
    if (lead) void loadSaved();
    const late = lead ? null : setTimeout(() => !gotBoard.current && void loadSaved(), 1800);
    const t = setTimeout(syncMeta, 0);
    link.current = connectBoard(
      room,
      "teacher",
      (m) => onRemote.current(m),
      (_viewers, others) => setPartner(others > 0),
      true,
    );
    // Heartbeat (tablet only): the laptop and students compare it with what they have and fetch the board again if behind.
    const beat = lead
      ? setInterval(() => {
          const shared = images.current.filter((m) => !m.url.startsWith("blob:"));
          send({ t: "rev", n: strokes.current.length + shared.length, last: strokes.current[strokes.current.length - 1]?.id ?? "", d: boardDigest(strokes.current, shared) });
        }, 2000)
      : undefined;
    return () => {
      alive = false;
      clearTimeout(t);
      if (late) clearTimeout(late);
      clearInterval(beat);
      link.current?.close();
    };
  }, [room, storeKey, requestDraw, send, screen, fullBoard, lead, ledger]);


  // Keeps the text box on its words while the board pans or zooms.
  const placeTyping = useCallback(() => {
    const t = typingRef.current;
    if (!t) return;
    const c = cam.current;
    setTyping({ x: (t.wx - c.x) * c.z, y: (t.wy - c.y) * c.z, px: t.size * c.z, color: t.color });
  }, []);

  const refresh = useCallback(() => {
    requestDraw();
    setZoom(Math.round(cam.current.z * 100));
    shareView();
    placeTyping();
  }, [requestDraw, shareView, placeTyping]);

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
      // Fit the tablet's whole screen into the part of this one the toolbars leave clear.
      followTarget.current = fitView(v, w, h, clearInset(h, [topBarRef.current, sidePanelRef.current], [toolbarRef.current]));
      if (jump) {
        cam.current = followTarget.current;
        refresh();
      } else if (!following.current) {
        following.current = true;
        requestAnimationFrame(step);
      }
    };
  }, [refresh, screen]);

  // The laptop window changes size (full screen to share): fit the tablet's view again.
  useEffect(() => {
    if (lead) return;
    const onResize = () => setTimeout(() => follow.current(true), 50);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [lead]);

  // Laptop: the bars step aside after 3 seconds without the mouse, and come back as soon as it moves.
  useEffect(() => {
    if (lead) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const wake = () => {
      setQuiet(false);
      if (t) clearTimeout(t);
      t = setTimeout(() => setQuiet(true), 3000);
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

  // Tools hidden or shown on the laptop: the clear space changed, so fit again (bigger without tools).
  useEffect(() => {
    if (lead) return;
    const t = setTimeout(() => follow.current(true), 30);
    return () => clearTimeout(t);
  }, [lead, toolsHidden]);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (msg: string) => {
    setNotice(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setNotice(null), 2600);
  };

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
    for (const x of strokes.current) if (!oldS.has(x.id)) ms.push({ t: "add", s: packStroke(x) });
    const nowI = new Map(images.current.map((m) => [m.id, m]));
    const goneI = beforeI.filter((m) => !nowI.has(m.id)).map((m) => m.id);
    if (goneI.length) ms.push({ t: "imgdel", ids: goneI });
    for (const m of images.current) if (!beforeI.includes(m) && !m.url.startsWith("blob:")) ms.push({ t: "img", m });
    // One message, so the other device applies the whole undo together or not at all.
    if (ms.length) send({ t: "batch", ms });
    if (selectedRef.current && !nowI.has(selectedRef.current)) select(null);
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
    commit({ type: "clear", s: strokes.current, m: images.current });
    strokes.current = [];
    images.current = [];
    select(null);
    send({ t: "clear" });
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
      switch (m.t) {
        case "hello": {
          // The other device asked for the board: answer it on this channel only.
          link.current?.send(stampMsg(ledger, fullBoard()));
          const { w, h } = screen.current;
          if (lead && w && h) link.current?.send({ t: "view", v: writingView(w, h) });
          return;
        }
        case "theme":
          return; // one light board now; an older device's look is ignored
        case "view":
          // Only the laptop follows; a tablet pan always brings the laptop back to it.
          if (!lead) {
            teacherView.current = m.v;
            follow.current();
          }
          return;
        case "rev": {
          if (lead) return;
          const shared = images.current.filter((x) => !x.url.startsWith("blob:"));
          const same =
            m.d !== undefined
              ? boardDigest(strokes.current, shared) === m.d
              : strokes.current.length + shared.length === m.n && (strokes.current[strokes.current.length - 1]?.id ?? "") === m.last;
          // Behind twice in a row (not just a stroke in flight): take the tablet's board.
          revMiss.current = same ? 0 : revMiss.current + 1;
          if (revMiss.current >= 2) {
            revMiss.current = 0;
            resync.current = "rev";
            link.current?.send({ t: "hello" });
          }
          return;
        }
        case "live": {
          if (ledger.known(m.s.id)) return; // the final stroke already came: this preview is stale
          if (m.from) {
            // Just the newest points: add them to what's on screen (if a part went missing, wait for the next whole one).
            const have = remoteLive.current;
            if (!have || have.id !== m.s.id || have.pts.length < m.from) return;
            remoteLive.current = { ...m.s, pts: [...have.pts.slice(0, m.from), ...m.s.pts] };
          } else remoteLive.current = m.s;
          if (remoteLiveTimer.current) clearTimeout(remoteLiveTimer.current);
          // A preview that stops coming (pen lifted, message lost) never stays on screen.
          remoteLiveTimer.current = setTimeout(() => {
            remoteLive.current = null;
            requestDraw();
          }, 2500);
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
          break;
        case "set": {
          ledger.hear(m.q);
          const first = !gotBoard.current;
          gotBoard.current = true;
          const theirs = m.strokes;
          const theirImgs = m.images ?? [];
          if (lead && !first) {
            // The tablet's board is the truth: after a Wi-Fi blip it only takes what the laptop drew
            // meanwhile, never the laptop's (maybe older) copy of everything.
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
          if (!first || resync.current === "rev") {
            // Catching up after being away or behind: the other device's board is the truth.
            resync.current = "join";
            strokes.current = theirs;
            images.current = theirImgs;
            remoteLive.current = null;
            if (m.q !== undefined) ledger.reset(m.q);
            if (selectedRef.current && !theirImgs.some((x) => x.id === selectedRef.current)) select(null);
            break;
          }
          // First meeting: keep both devices' work, and send back what the other one hasn't got.
          const hasS = new Set(theirs.map((x) => x.id));
          const hasI = new Set(theirImgs.map((x) => x.id));
          const mineS = strokes.current.filter((x) => !hasS.has(x.id));
          const mineI = images.current.filter((x) => !hasI.has(x.id) && !x.url.startsWith("blob:"));
          strokes.current = [...theirs, ...mineS];
          images.current = [...theirImgs, ...mineI];
          for (const x of mineS) send({ t: "add", s: packStroke(x) });
          for (const x of mineI) send({ t: "img", m: x });
          break;
        }
        case "batch":
          return; // unpacked before it gets here
      }
      persist();
      requestDraw();
      syncMeta();
    };
  });

  // ---- typing
  const textSize = () => (TEXT_PX[SIZES.findIndex((x) => x.value === size)] ?? TEXT_PX[1]) / cam.current.z;
  const typedStroke = (t: NonNullable<typeof typingRef.current>): Stroke => {
    const text = t.text.replace(/\s+$/, "");
    const m = measureText(text, t.size);
    return { id: t.id, kind: "text", text, color: t.color, size: t.size, pts: [[t.wx, t.wy, 0.5], [t.wx + m.w, t.wy + m.h, 0.5]] };
  };
  const commitTyping = () => {
    const t = typingRef.current;
    if (!t) return;
    typingRef.current = null;
    setTyping(null);
    if (textRef.current) {
      textRef.current.value = "";
      textRef.current.blur();
    }
    if (!t.text.trim()) {
      // Emptied: an edited text is erased (undo brings it back), a new one just goes.
      if (t.editing) commit({ type: "erase", s: [t.editing] });
      else send({ t: "del", ids: [t.id] });
      requestDraw();
      return;
    }
    const s = typedStroke(t);
    if (t.editing && t.editing.text === s.text && t.editing.color === s.color) {
      strokes.current = [...strokes.current, t.editing];
      send({ t: "add", s: packStroke(t.editing) });
    } else {
      strokes.current = [...strokes.current, s];
      commit(t.editing ? { type: "replace", before: [t.editing], after: [s] } : { type: "add", s });
      send({ t: "add", s: packStroke(s) });
    }
    requestDraw();
  };
  /** Opens the text box at a spot, or on the words already there. Focus happens now, so the keyboard opens. */
  const startTyping = (sx: number, sy: number) => {
    commitTyping();
    const [wx, wy] = toWorld(cam.current, sx, sy);
    const under = [...strokes.current].reverse().find((x) => x.kind === "text" && hitStroke(x, wx, wy, 6 / cam.current.z));
    if (under) {
      // Lifted off the board while it is edited, so it isn't drawn twice.
      strokes.current = strokes.current.filter((x) => x.id !== under.id);
      send({ t: "del", ids: [under.id] });
      typingRef.current = { id: under.id, wx: under.pts[0][0], wy: under.pts[0][1], size: under.size, color: under.color, text: under.text ?? "", editing: under };
    } else {
      const sz = textSize();
      const ink = color === COLORS[0].value && imageAt(images.current, wx, wy) ? "#1B1E21" : color;
      typingRef.current = { id: newId(), wx, wy: wy - sz * 0.6, size: sz, color: ink, text: "" };
    }
    const el = textRef.current;
    if (el) {
      el.value = typingRef.current.text;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    }
    placeTyping();
    requestDraw();
  };
  const onTypingInput = (text: string) => {
    const t = typingRef.current;
    if (!t) return;
    t.text = text;
    const now = performance.now();
    if (now - liveSend.current > 60) {
      liveSend.current = now;
      send({ t: "live", s: typedStroke(t) });
    }
  };

  // ---- insert pictures and PDFs
  const insertFiles = async (files: File[]) => {
    const list = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!list.length) return flash("Pictures or PDFs only.");
    const online = cloudinaryConfigured();
    const urls: string[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        setBusy(list.length > 1 ? `Adding ${i + 1} of ${list.length}…` : "Adding…");
        if (f.type === "application/pdf") {
          if (!online) {
            flash("PDFs need the live site (uploads aren't set up in this preview).");
            continue;
          }
          urls.push(...(await uploadPdfPages(f)));
        } else {
          urls.push(online ? await uploadImage(f) : URL.createObjectURL(f));
        }
      }
      if (!urls.length) return;
      setBusy(urls.length > 1 ? `Placing ${urls.length} pages…` : "Placing…");
      const { w: sw, h: sh } = screen.current;
      const v = visibleView(cam.current, sw, sh);
      const width = v.w * 0.62;
      const gap = 28 / cam.current.z;
      let y = v.y + v.h * 0.15;
      const placed: BoardImage[] = [];
      for (const url of urls) {
        const n = await imageSize(url);
        const h = width * (n.h / n.w);
        placed.push({ id: newId(), url, x: v.x + (v.w - width) / 2, y, w: width, h });
        y += h + gap;
      }
      images.current = [...images.current, ...placed];
      commit({ type: "img-add", m: placed });
      for (const m of placed) if (!m.url.startsWith("blob:")) send({ t: "img", m });
      // Ready to place: the first picture is selected. A finger moves it, the pen still writes.
      select(placed[0].id);
      // On the laptop the mouse is the hand: ready to drag straight away.
      if (!lead) setTool("move");
      requestDraw();
      const how = lead ? "Drag with a finger to move" : "Drag to move";
      flash(placed.length > 1 ? `${placed.length} pages added. ${how}.` : `${how}. Gold dot resizes.`);
    } catch (err) {
      flash(err instanceof Error ? err.message : "That file couldn't be added.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

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
  const gesture = useRef<{
    mode: "draw" | "line" | "box" | "erase" | "pan" | "drag" | "resize" | null;
    id: number;
    erased: Stroke[];
    straightened: boolean;
    img?: { before: BoardImage; ox: number; oy: number };
  }>({ mode: null, id: -1, erased: [], straightened: false });
  const hold = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null; path: number }>({ x: 0, y: 0, timer: null, path: 0 });
  const liveSend = useRef(0);
  const spaceDown = useRef(false);

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
  const sendLive = () => {
    const now = performance.now();
    const s = current.current;
    if (!s || now - liveSend.current <= 40) return;
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
    const hit = strokes.current.filter((s) => {
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
      if (lastRaw.current) s.pts = [...s.pts, lastRaw.current];
      // A closed loop becomes a clean box or oval; anything else a straight line.
      const shape = recogniseShape(s.pts);
      if (shape) {
        s.kind = shape.kind;
        s.pts = [shape.a, shape.b];
        gesture.current.straightened = true;
        try {
          navigator.vibrate?.(10);
        } catch {}
        requestDraw();
        sendLive();
        return;
      }
      const a = s.pts[0];
      const b = snapLine(a, s.pts[s.pts.length - 1]);
      s.kind = "line";
      s.pts = [a, b];
      gesture.current.straightened = true;
      try {
        navigator.vibrate?.(10);
      } catch {}
      setAngle({ x: (b[0] - cam.current.x) * cam.current.z, y: (b[1] - cam.current.y) * cam.current.z, deg: lineAngle(a, b) });
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
    setEraserAt({ x: sx, y: sy });
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
    select(hit?.id ?? null);
    if (hit) gesture.current = { mode: "drag", id, erased: [], straightened: false, img: { before: { ...hit }, ox: wx - hit.x, oy: wy - hit.y } };
    requestDraw();
    return !!hit;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = local(e);
    const isPen = e.pointerType === "pen";
    const isMouse = e.pointerType === "mouse";
    const isTouch = e.pointerType === "touch";
    logPen(e, "down");
    stopGlide();

    if (isPen) {
      pens.current.seen = true;
      pens.current.active = true;
      pens.current.lastAt = Date.now();
    }

    // Palm rejection: while the pen is down or was just near the screen, touches do nothing.
    if (isTouch) {
      if (pens.current.active || Date.now() - pens.current.lastAt < PALM_LOCK_MS) return;
      if (e.width > PALM_SIZE_PX || e.height > PALM_SIZE_PX) return; // a resting hand, not a fingertip
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
        commit({ type: "img-edit", before, after });
        if (!after.url.startsWith("blob:")) send({ t: "img", m: after });
      }
      gesture.current = { mode: null, id: -1, erased: [], straightened: false };
    }
    if (gesture.current.mode) return;

    // Typing: the pen or mouse puts the text box here (focus stays in it).
    if (tool === "text" && !isPenEraser(e)) {
      e.preventDefault();
      startTyping(sx, sy);
      return;
    }

    capture(canvasRef.current, e.pointerId);
    const [wx, wy] = toWorld(cam.current, sx, sy);

    if (isPenEraser(e) || tool === "eraser") {
      lastErase.current = null;
      setInking(true);
      gesture.current = { mode: "erase", id: e.pointerId, erased: [], straightened: false };
      setEraserAt({ x: sx, y: sy });
      eraseAt(sx, sy);
      return;
    }

    if (tool === "move") {
      grabImage(e.pointerId, sx, sy, false);
      return;
    }

    const p: Pt = [wx, wy, isPen ? e.pressure || 0.5 : 0.5];
    // Width stays the same on screen at any zoom.
    const w = size / cam.current.z;
    // White ink would vanish on a white page: on a picture it writes in charcoal.
    const ink = color === COLORS[0].value && imageAt(images.current, wx, wy) ? "#1B1E21" : color;
    if (tool === "line") {
      current.current = { id: newId(), kind: "line", color: ink, size: w, pts: [p, p] };
      setInking(true);
      gesture.current = { mode: "line", id: e.pointerId, erased: [], straightened: true };
    } else {
      current.current = { id: newId(), kind: "ink", color: ink, size: w, pts: [p] };
      lastRaw.current = p;
      setInking(true);
      gesture.current = { mode: "draw", id: e.pointerId, erased: [], straightened: false };
      hold.current.path = 0;
      armHold(sx, sy);
    }
    requestDraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = local(e);
    if (e.pointerType === "pen") {
      pens.current.lastAt = Date.now(); // hovering counts: keeps palms locked out
      if (e.buttons === 0 && isPenEraser(e)) setEraserAt({ x: sx, y: sy });
    }

    // Touch pan / pinch.
    if (touches.current.has(e.pointerId)) {
      const prev = touches.current.get(e.pointerId)!;
      const now = performance.now();
      touches.current.set(e.pointerId, { x: sx, y: sy, t: now });
      if (tap2.current) tap2.current.moved += Math.hypot(sx - prev.x, sy - prev.y);
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
        let c = zoomAt(cam.current, d / pinch.current.d, cx, cy);
        c = { ...c, x: c.x - ((cx - pinch.current.cx) * PAN_GAIN) / c.z, y: c.y - ((cy - pinch.current.cy) * PAN_GAIN) / c.z };
        cam.current = c;
        pinch.current = { d, cx, cy };
        velocity.current = { vx: 0, vy: 0 };
      }
      refresh();
      return;
    }

    const g = gesture.current;
    if (g.id !== e.pointerId || !g.mode) {
      if (tool === "eraser" && e.pointerType !== "touch") setEraserAt({ x: sx, y: sy });
      return;
    }

    // Side button pressed after the pen touched down: erase from here on.
    if ((g.mode === "draw" || g.mode === "line") && e.pointerType === "pen" && isPenEraser(e)) {
      logPen(e, "move");
      switchToErase(e.pointerId, sx, sy);
      return;
    }

    if (g.mode === "erase") {
      setEraserAt({ x: sx, y: sy });
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
    // A snapped box or oval stays put until the pen lifts.
    if (s.kind === "rect" || s.kind === "ellipse") return;
    if (g.mode === "line" || (g.mode === "draw" && g.straightened)) {
      const a = s.pts[0];
      const b = snapLine(a, [wx, wy, 0.5]);
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
      // One message: the old ones go and the new one appears together (the stroke just drawn was never sent).
      const old = before.filter((b) => b.id !== s.id).map((b) => b.id);
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
        const t = dir === "v" ? tAccountOf(o.ends, ends) : tAccountOf(ends, o.ends);
        const other = strokes.current.find((x) => x.id === o.id);
        // T account size only, so a capital T in a heading stays handwriting.
        if (!t || !other || (t.b[0] - t.a[0]) * z < 150 || (t.b[1] - t.a[1]) * z < 90) continue;
        swap([other, s], { id: newId(), kind: "form", form: "t", color: other.color, size: Math.max(other.size, s.size), pts: [t.a, t.b] }, "T account");
        return true;
      }
      recentLines.current.push({ id: s.id, ends, dir, at: now });
    }

    if (s.kind !== "ink") return false;
    const big = (() => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of s.pts) {
        x0 = Math.min(x0, p[0]);
        y0 = Math.min(y0, p[1]);
        x1 = Math.max(x1, p[0]);
        y1 = Math.max(y1, p[1]);
      }
      return (x1 - x0) * z >= 90 && (y1 - y0) * z >= 60;
    })();
    const shape = big ? recogniseShape(s.pts, 0.032) : null;
    // Circling or boxing an answer keeps the hand drawn loop: only an empty loop snaps.
    const empty = (sh: NonNullable<typeof shape>) =>
      !strokes.current.some((o) => {
        if (o.id === s.id) return false;
        const b = strokeBox(o);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        return cx > sh.a[0] && cx < sh.b[0] && cy > sh.a[1] && cy < sh.b[1];
      }) && !images.current.some((m) => m.x < sh.b[0] && m.x + m.w > sh.a[0] && m.y < sh.b[1] && m.y + m.h > sh.a[1]);
    if (shape && empty(shape)) {
      swap([s], { id: newId(), kind: shape.kind, color: s.color, size: s.size, pts: [shape.a, shape.b] });
      return true;
    }
    // Long and clearly straight: tidy it into a ruled line (underlines, totals), at its own angle.
    const tidy = straightOf(s.pts, 0.03);
    if (tidy && len >= 120) {
      const line: Stroke = { id: s.id + "l", kind: "line", color: s.color, size: s.size, pts: [s.pts[0], s.pts[s.pts.length - 1]] };
      swap([s], line);
      // Still counts towards a T, under its new id.
      if (dir) recentLines.current.push({ id: line.id, ends: [line.pts[0], line.pts[1]], dir, at: now });
      return true;
    }
    return false;
  };

  const endGesture = (e: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    logPen(e, cancelled ? "cancel" : "up");
    if (e.pointerType === "pen") {
      pens.current.active = false;
      pens.current.lastAt = Date.now();
    }
    if (touches.current.has(e.pointerId)) {
      const wasSingle = touches.current.size === 1;
      const t1 = tap1.current;
      tap1.current = null;
      if (t1 && t1.id === e.pointerId && !cancelled && performance.now() - t1.at < 300) {
        const [ex, ey] = local(e);
        if (Math.hypot(ex - t1.x, ey - t1.y) < 10) {
          if (tool === "text") startTyping(ex, ey);
          else {
            const [wx, wy] = toWorld(cam.current, ex, ey);
            select(imageAt(images.current, wx, wy)?.id ?? null);
            requestDraw();
          }
        }
      }
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) pinch.current = null;
      // Two-finger tap (both down and up quickly, barely moving) = undo.
      if (touches.current.size === 0 && tap2.current) {
        const quick = performance.now() - tap2.current.at < 280 && tap2.current.moved < 14;
        tap2.current = null;
        if (quick) {
          undo();
          flash("Undone");
          return;
        }
      }
      const flicked = panTrip.current.dist > 24 && performance.now() - panTrip.current.at < 80;
      if (wasSingle && !cancelled && !tap2.current && flicked) startGlide(velocity.current.vx, velocity.current.vy);
      if (gesture.current.mode === "pan" && gesture.current.id === e.pointerId) gesture.current = { mode: null, id: -1, erased: [], straightened: false };
      return;
    }
    const g = gesture.current;
    if (g.id !== e.pointerId) return;
    clearHold();
    setAngle(null);
    if (g.mode === "erase") {
      flushErase();
      lastErase.current = null;
      if (g.erased.length) commit({ type: "erase", s: g.erased });
      if (tool !== "eraser") setEraserAt(null);
    } else if ((g.mode === "drag" || g.mode === "resize") && g.img) {
      const before = g.img.before;
      const after = images.current.find((m) => m.id === before.id);
      if (after && (after.x !== before.x || after.y !== before.y || after.w !== before.w)) {
        commit({ type: "img-edit", before, after });
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
      const tooShort = s.kind === "line" && Math.hypot(s.pts[1][0] - s.pts[0][0], s.pts[1][1] - s.pts[0][1]) * cam.current.z < 3;
      if (!cancelled && !tooShort) {
        strokes.current = [...strokes.current, s];
        commit({ type: "add", s });
        // A stroke that gets tidied (a ruled line, a T account) is sent once, as the tidy version.
        if (!recognise(s)) send({ t: "add", s: packStroke(s) });
      } else {
        send({ t: "del", ids: [s.id] }); // the preview on the other screen goes
      }
    }
    gesture.current = { mode: null, id: -1, erased: [], straightened: false };
    setInking(false);
    requestDraw();
  };

  // Mouse wheel / trackpad: pinch or ctrl+wheel zooms, plain wheel pans.
  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const [sx, sy] = local(e);
    if (e.ctrlKey || e.metaKey) cam.current = zoomAt(cam.current, Math.exp(-e.deltaY * 0.01), sx, sy);
    else cam.current = { ...cam.current, x: cam.current.x + e.deltaX / cam.current.z, y: cam.current.y + e.deltaY / cam.current.z };
    refresh();
  };

  const pickTool = (t: Tool) => {
    commitTyping();
    setTool(t);
    if (t !== "move") select(null);
    if (t !== "eraser") setEraserAt(null);
    requestDraw();
  };

  // Keyboard on a laptop: P/L/E/V/T tools, H hides the tools, Ctrl+Z / Ctrl+Shift+Z, space to pan, Delete.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Typing in the text box: its keys are words, not shortcuts.
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable)) return;
      if (e.code === "Space") spaceDown.current = true;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "p") pickTool("pen");
      if (e.key === "l") pickTool("line");
      if (e.key === "e") pickTool("eraser");
      if (e.key === "v") pickTool("move");
      if (e.key === "t") {
        // T: the text box opens right where the mouse is (or the middle), ready to type.
        e.preventDefault();
        pickTool("text");
        const { w, h } = screen.current;
        const at = hoverAt.current ?? { x: w / 2, y: h / 2 };
        startTyping(at.x, at.y);
      }
      if (e.key === "h") setToolsHidden((v) => !v);
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current) deleteSelected();
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

  const fit = () => {
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

  return (
    <div data-board className="fixed inset-0 select-none overflow-hidden text-[#1A1D20] [-webkit-touch-callout:none]" style={{ fontFamily: "var(--font-sans)", background: THEMES[look].bg }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: tool === "eraser" ? "none" : tool === "move" ? "grab" : tool === "text" ? "text" : "crosshair" }}
        onPointerDown={onPointerDown}
        // Keeps the text box focused when the board is clicked or tapped to type.
        onMouseDown={(e) => tool === "text" && e.preventDefault()}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse") {
            const [x, y] = local(e);
            hoverAt.current = { x, y };
          }
          onPointerMove(e);
        }}
        onPointerUp={(e) => endGesture(e)}
        onPointerCancel={(e) => endGesture(e, true)}
        onLostPointerCapture={(e) => gesture.current.id === e.pointerId && gesture.current.mode && endGesture(e)}
        onPointerLeave={() => tool !== "eraser" && gesture.current.mode !== "erase" && setEraserAt(null)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="sr-only"
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
        onChange={(e) => onTypingInput(e.target.value)}
        onBlur={commitTyping}
        onKeyDown={(e) => {
          if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
            e.preventDefault();
            commitTyping();
          }
        }}
        className={`absolute resize-none overflow-hidden whitespace-pre border-0 bg-transparent p-0 font-medium leading-[1.25] outline-none [field-sizing:content] ${
          typing ? "rounded-sm ring-1 ring-[#1557B0]/35 ring-offset-4 ring-offset-transparent" : "pointer-events-none opacity-0"
        }`}
        style={
          typing
            ? { left: typing.x, top: typing.y, fontSize: typing.px, color: inkOf(typing.color), caretColor: inkOf(typing.color), minWidth: Math.max(40, typing.px * 3) }
            : { left: -9999, top: 0, width: 1, height: 1 }
        }
      />

      {/* Eraser ring */}
      {eraserAt && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full border"
          style={{ left: eraserAt.x - ERASER_PX, top: eraserAt.y - ERASER_PX, width: ERASER_PX * 2, height: ERASER_PX * 2, borderColor: THEMES[look].ring.border, background: THEMES[look].ring.fill }}
        />
      )}

      {/* Angle readout while drawing a line */}
      {angle && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-[#1A1D20] px-2.5 py-1 text-xs font-bold tabular-nums text-white shadow-lg"
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
          className={`absolute bottom-3 left-3 h-8 rounded-lg px-2.5 text-[11px] font-semibold text-[#6B7280] transition-opacity duration-300 hover:bg-black/[0.04] hover:text-[#1A1D20] ${quiet ? "opacity-0" : "opacity-70"}`}
        >
          Show tools (H)
        </button>
      )}

      {/* Everything on top of the board fades while the pen is down, and on the laptop when the mouse rests. */}
      <div className={`transition-opacity duration-300 ${toolsHidden ? "hidden" : ""} ${quiet ? "pointer-events-none opacity-0" : inking ? "opacity-25" : ""}`}>
        {/* Top: who's linked (left), view controls (right). Small, so the board gets the room. */}
        <div ref={topBarRef} className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <div
            className={`${PANEL} pointer-events-auto flex h-9 items-center gap-2 px-3 text-xs font-semibold text-[#4B5563]`}
            title={lead ? "Open /teach/present on your laptop: it draws too, and follows this tablet." : "Open the board on your tablet: when it pans or zooms, this screen follows."}
          >
            <span className={`h-2 w-2 rounded-full ${partner ? "bg-[#22A06B]" : "bg-[#C4C9CF]"}`} />
            {partner ? (lead ? "Laptop linked" : "Tablet linked") : lead ? "Laptop not open" : "Tablet not open"}
          </div>
          <div ref={sidePanelRef} className={`${PANEL} pointer-events-auto flex h-9 items-center gap-0.5 px-1`}>
            {lead && (
              <button
                type="button"
                onClick={() => setFingerDraws((v) => !v)}
                className={`h-7 rounded-lg px-2.5 text-xs font-semibold transition-colors ${fingerDraws ? "bg-[#1A1D20] text-white" : "text-[#6B7280] hover:bg-black/[0.05] hover:text-[#1A1D20]"}`}
                title="For phones without a pen. On your tablet, leave this off: only the S Pen draws."
              >
                {fingerDraws ? "Finger draws" : "Pen only"}
              </button>
            )}
            <button type="button" onClick={fit} title="Fit the whole board" className="h-7 w-14 rounded-lg text-center text-xs font-semibold tabular-nums text-[#6B7280] hover:bg-black/[0.05] hover:text-[#1A1D20]">
              {zoom}%
            </button>
            <SmallButton label="Hide the tools for a clean shared screen (H)" onClick={() => setToolsHidden(true)}>{I.hide}</SmallButton>
            {lead && (
              <button
                type="button"
                onClick={() => void copyLink()}
                title="Copy the link for your laptop: open it there and share that screen in Meet."
                className="ml-0.5 h-7 rounded-lg bg-[#1A1D20] px-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#30353a]"
              >
                {copiedPresent ? "Copied" : "Laptop link"}
              </button>
            )}
          </div>
        </div>

        {/* Picture actions, when one is selected */}
        {selectedId && (
          <div className={`${PANEL} absolute left-1/2 top-14 flex -translate-x-1/2 items-center gap-2 p-1 pl-3`}>
            <span className="text-xs font-semibold text-[#4B5563]">{lead ? "Finger drags it · round handle resizes" : "Drag to move · round handle resizes"}</span>
            <button type="button" onClick={deleteSelected} className="flex h-8 items-center gap-1.5 rounded-lg bg-[#FDECEA] px-2.5 text-xs font-bold text-[#B42318] [&_svg]:h-4 [&_svg]:w-4">
              {I.trash}
              Remove
            </button>
          </div>
        )}

        {/* Main toolbar */}
        <div ref={toolbarRef} className={`${PANEL} absolute bottom-4 left-1/2 flex max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto p-1 [scrollbar-width:none]`}>
          <ToolButton label="Pen (P). Draw a T for a T account; hold still at the end to snap a line, box or circle" active={tool === "pen"} onClick={() => pickTool("pen")}>{I.pen}</ToolButton>
          <ToolButton label="Straight line (L)" active={tool === "line"} onClick={() => pickTool("line")}>{I.line}</ToolButton>
          <ToolButton label="Eraser (E), or hold the pen's side button" active={tool === "eraser"} onClick={() => pickTool("eraser")}>{I.eraser}</ToolButton>
          <ToolButton label="Type (T starts typing where the mouse is). Enter finishes, Shift+Enter for a new line" active={tool === "text"} onClick={() => pickTool("text")}>{I.text}</ToolButton>
          <ToolButton label="Move pictures (V)" active={tool === "move"} onClick={() => pickTool("move")}>{I.move}</ToolButton>
          <ToolButton label="Insert a picture or PDF" disabled={!!busy} onClick={() => fileRef.current?.click()}>
            {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-black/10 border-t-[#1A1D20]" /> : I.insert}
          </ToolButton>
          <Divider />
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-label={c.name}
              title={c.name}
              aria-pressed={color === c.value}
              onClick={() => {
                setColor(c.value);
                if (tool === "eraser" || tool === "move") pickTool("pen");
              }}
              className="flex h-10 w-8 shrink-0 items-center justify-center"
            >
              <span
                className={`block rounded-full transition-all duration-150 ${color === c.value ? "h-[22px] w-[22px] ring-2 ring-[#1A1D20]/80 ring-offset-2 ring-offset-white" : "h-[18px] w-[18px] hover:scale-110"}`}
                style={{ background: inkOf(c.value) }}
              />
            </button>
          ))}
          <Divider />
          {SIZES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-label={`${s.name} pen`}
              title={`${s.name} pen`}
              aria-pressed={size === s.value}
              onClick={() => setSize(s.value)}
              className={`flex h-10 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${size === s.value ? "bg-black/[0.06]" : "hover:bg-black/[0.04]"}`}
            >
              <span className="block rounded-full" style={{ width: s.value * 2.2, height: s.value * 2.2, background: size === s.value ? "#1A1D20" : "#9CA3AF" }} />
            </button>
          ))}
          <Divider />
          <ToolButton label="Undo (Ctrl+Z, or tap with two fingers)" disabled={!meta.undo} onClick={undo}>{I.undo}</ToolButton>
          <ToolButton label="Redo (Ctrl+Shift+Z)" disabled={!meta.redo} onClick={redo}>{I.redo}</ToolButton>
          <ToolButton label="Clear the board" disabled={!hasContent} onClick={() => setConfirmClear(true)}>{I.trash}</ToolButton>
        </div>
      </div>

      {/* Short messages: "Undone", upload progress, errors */}
      {(notice || busy) && (
        <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-[#1A1D20] px-4 py-2 text-xs font-semibold text-white shadow-lg">
          {busy ?? notice}
        </div>
      )}

      {/* Pen diagnostics (?debug=1): what the tablet reports for the pen and its button */}
      {debug && (
        <div className="pointer-events-none absolute left-4 top-20 max-w-[90vw] rounded-lg bg-black/80 px-3 py-2 font-mono text-[11px] text-[#7FD1A6]">{debug}</div>
      )}

      {/* Clear confirm */}
      {confirmClear && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1A1D20]/25 backdrop-blur-[2px]" onClick={() => setConfirmClear(false)}>
          <div className={`${PANEL} w-[320px] p-5 text-center`} onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Clear the whole board?</p>
            <p className="mt-1 text-sm text-[#6B7280]">Writing and pictures go. Undo brings them back.</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirmClear(false)} className="h-11 flex-1 rounded-xl bg-black/[0.05] text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAll();
                  setConfirmClear(false);
                }}
                className="h-11 flex-1 rounded-xl bg-[#1A1D20] text-sm font-bold text-white"
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
        <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#1c1f22]/80 px-4 py-2.5 backdrop-blur-xl">
          <span style={{ fontFamily: "var(--font-caveat)" }} className="text-xl leading-none text-[#FBC159]">
            hamzateaches
          </span>
          <span className="h-4 w-px bg-white/10" />
          <span className="flex items-center gap-2 text-xs font-semibold text-[#b9bec3]">
            <span className={`h-2 w-2 rounded-full ${teacherHere ? "bg-[#F07A6A] shadow-[0_0_8px_#F07A6A]" : "bg-[#5a6066]"}`} />
            {teacherHere ? "Live" : "Waiting for Hamza"}
          </span>
        </div>
      </div>

      {!got && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-[#80868c]">The board appears here as Hamza writes.</p>
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
          className="absolute bottom-5 left-1/2 h-11 -translate-x-1/2 rounded-full bg-[#FBC159] px-5 text-sm font-bold text-[#141618] shadow-[0_12px_30px_-10px_rgba(251,193,89,0.6)]"
        >
          Follow Hamza&apos;s board
        </button>
      )}
    </div>
  );
}
