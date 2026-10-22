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
  drawGrid,
  drawImages,
  drawStroke,
  fitView,
  hitStroke,
  imageAt,
  imageSize,
  isPenEraser,
  lineAngle,
  newId,
  packStroke,
  smoothPoint,
  snapLine,
  toWorld,
  visibleView,
  zoomAt,
} from "@/components/board/engine";
import { connectBoard, type BoardLink, type BoardMsg } from "@/components/board/sync";
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
 * Viewer: the same board, live, read-only, following Hamza's screen.
 */

const BG = "#141618";
const HOLD_MS = 480;
const HOLD_STILL_PX = 4;
const MIN_HOLD_PATH_PX = 28;
const PALM_LOCK_MS = 350;
const PALM_SIZE_PX = 56;
const ERASER_PX = 14;
const PAN_GAIN = 1.15;
const HANDLE_PX = 22;

type Tool = "pen" | "line" | "eraser" | "move";
type Action =
  | { type: "add"; s: Stroke }
  | { type: "erase"; s: Stroke[] }
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
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);
  drawGrid(ctx, cam, w, h);
  drawImages(ctx, images, onImage);
  for (const s of strokes) drawStroke(ctx, s);
  for (const s of extra) if (s) drawStroke(ctx, s);
  if (selected) {
    const px = 1 / cam.z;
    ctx.strokeStyle = "#FBC159";
    ctx.lineWidth = 2 * px;
    ctx.setLineDash([6 * px, 5 * px]);
    ctx.strokeRect(selected.x, selected.y, selected.w, selected.h);
    ctx.setLineDash([]);
    // Resize handle, bottom-right.
    const r = (HANDLE_PX / 2) * px;
    ctx.fillStyle = "#FBC159";
    ctx.beginPath();
    ctx.arc(selected.x + selected.w, selected.y + selected.h, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BG;
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
      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 disabled:opacity-30 [&_svg]:h-[22px] [&_svg]:w-[22px] ${
        active
          ? "bg-[linear-gradient(180deg,rgba(251,193,89,0.22),rgba(251,193,89,0.1))] text-[#FBC159] shadow-[inset_0_0_0_1px_rgba(251,193,89,0.35)]"
          : "text-[#a6acb2] hover:bg-white/[0.06] hover:text-[#f0ede8]"
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-7 w-px bg-white/10" aria-hidden />;

// ---------------------------------------------------------------- teacher

export function TeacherBoard({ room }: { room: string }) {
  const strokes = useRef<Stroke[]>([]);
  const images = useRef<BoardImage[]>([]);
  const cam = useRef<Camera>({ x: -60, y: -60, z: 1 });
  const current = useRef<Stroke | null>(null);
  const undoStack = useRef<Action[]>([]);
  const redoStack = useRef<Action[]>([]);
  const link = useRef<BoardLink | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(SIZES[0].value);
  const [fingerDraws, setFingerDraws] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [angle, setAngle] = useState<{ x: number; y: number; deg: number } | null>(null);
  const [eraserAt, setEraserAt] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(100);
  // What the toolbar needs to know, mirrored from the refs after each change.
  const [meta, setMeta] = useState({ undo: 0, redo: 0, content: 0 });
  const [copied, setCopied] = useState(false);
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
      [current.current],
      again,
      images.current.find((m) => m.id === selectedRef.current) ?? null,
    ),
  );

  // ---- persistence + live link
  const storeKey = `ht-board-${room}`;
  const save = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(() => {
    if (save.current) clearTimeout(save.current);
    save.current = setTimeout(() => {
      try {
        // Pictures that only live in this browser (local preview) aren't kept.
        const keep = images.current.filter((m) => !m.url.startsWith("blob:"));
        localStorage.setItem(storeKey, JSON.stringify({ strokes: strokes.current, images: keep }));
      } catch {}
    }, 400);
  }, [storeKey]);

  const send = useCallback((m: BoardMsg) => link.current?.send(m), []);
  const fullBoard = useCallback(
    (): BoardMsg => ({ t: "set", strokes: strokes.current.map(packStroke), images: images.current.filter((m) => !m.url.startsWith("blob:")) }),
    [],
  );
  const sendView = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `screen` is a stable ref from useCanvas; the compiler just can't see that.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const shareView = useCallback(() => {
    if (sendView.current) return;
    sendView.current = setTimeout(() => {
      sendView.current = null;
      const { w, h } = screen.current;
      if (w && h) send({ t: "view", v: visibleView(cam.current, w, h) });
    }, 120);
  }, [send, screen]);

  useEffect(() => {
    showDebug.current = new URL(window.location.href).searchParams.get("debug") === "1";
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) ?? "null");
      if (Array.isArray(saved)) strokes.current = saved as Stroke[];
      else if (saved) {
        strokes.current = saved.strokes ?? [];
        images.current = saved.images ?? [];
      }
    } catch {}
    requestDraw();
    const t = setTimeout(syncMeta, 0);
    link.current = connectBoard(
      room,
      "teacher",
      (m) => {
        if (m.t === "hello") {
          send(fullBoard());
          const { w, h } = screen.current;
          if (w && h) send({ t: "view", v: visibleView(cam.current, w, h) });
        }
      },
      (n) => setViewers(n),
    );
    return () => {
      clearTimeout(t);
      link.current?.close();
    };
  }, [room, storeKey, requestDraw, send, screen, fullBoard]);

  const refresh = useCallback(() => {
    requestDraw();
    setZoom(Math.round(cam.current.z * 100));
    shareView();
  }, [requestDraw, shareView]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2600);
  };

  // ---- history
  const commit = (a: Action) => {
    undoStack.current.push(a);
    redoStack.current = [];
    persist();
    syncMeta();
  };
  const applySet = () => {
    send(fullBoard());
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
    if (a.type === "add") strokes.current = strokes.current.filter((s) => s.id !== a.s.id);
    else if (a.type === "erase") strokes.current = [...strokes.current, ...a.s];
    else if (a.type === "clear") {
      strokes.current = [...strokes.current, ...a.s];
      images.current = [...images.current, ...a.m];
    } else if (a.type === "img-add") images.current = images.current.filter(removeIds(a.m));
    else if (a.type === "img-del") images.current = [...images.current, a.m];
    else images.current = images.current.map((m) => (m.id === a.before.id ? a.before : m));
    redoStack.current.push(a);
    applySet();
  };
  const redo = () => {
    const a = redoStack.current.pop();
    if (!a) return;
    if (a.type === "add") strokes.current = [...strokes.current, a.s];
    else if (a.type === "erase") strokes.current = strokes.current.filter(removeIds(a.s));
    else if (a.type === "clear") {
      strokes.current = [];
      images.current = [];
    } else if (a.type === "img-add") images.current = [...images.current, ...a.m];
    else if (a.type === "img-del") images.current = images.current.filter((m) => m.id !== a.m.id);
    else images.current = images.current.map((m) => (m.id === a.after.id ? a.after : m));
    undoStack.current.push(a);
    applySet();
  };
  const clearAll = () => {
    if (!strokes.current.length && !images.current.length) return;
    commit({ type: "clear", s: strokes.current, m: images.current });
    strokes.current = [];
    images.current = [];
    select(null);
    applySet();
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
      requestDraw();
      if (placed.length > 1) flash(`${placed.length} pages added. Scroll down for the rest.`);
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
  const glide = useRef<{ vx: number; vy: number; raf: number } | null>(null);
  const velocity = useRef({ vx: 0, vy: 0 });
  const gesture = useRef<{
    mode: "draw" | "line" | "erase" | "pan" | "drag" | "resize" | null;
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

  const logPen = (e: React.PointerEvent, what: string) => {
    if (!showDebug.current) return;
    setDebug(`${what} · ${e.pointerType} · button ${e.button} · buttons ${e.buttons} · pressure ${e.pressure.toFixed(2)} · size ${Math.round(e.width)}×${Math.round(e.height)}`);
  };

  const sendLive = () => {
    const now = performance.now();
    if (current.current && now - liveSend.current > 45) {
      liveSend.current = now;
      send({ t: "live", s: packStroke(current.current) });
    }
  };

  const eraseAt = (sx: number, sy: number) => {
    const [wx, wy] = toWorld(cam.current, sx, sy);
    const r = ERASER_PX / cam.current.z;
    const hit = strokes.current.filter((s) => hitStroke(s, wx, wy, r));
    if (!hit.length) return;
    strokes.current = strokes.current.filter(removeIds(hit));
    gesture.current.erased.push(...hit);
    send({ t: "del", ids: hit.map((s) => s.id) });
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
    current.current = null;
    gesture.current = { mode: "erase", id, erased: [], straightened: false };
    setEraserAt({ x: sx, y: sy });
    eraseAt(sx, sy);
    send(fullBoard());
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
      if (!fingerDraws || pens.current.seen) {
        touches.current.set(e.pointerId, { x: sx, y: sy, t: performance.now() });
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
    if (gesture.current.mode) return;

    capture(canvasRef.current, e.pointerId);
    const [wx, wy] = toWorld(cam.current, sx, sy);

    if (isPenEraser(e) || tool === "eraser") {
      gesture.current = { mode: "erase", id: e.pointerId, erased: [], straightened: false };
      setEraserAt({ x: sx, y: sy });
      eraseAt(sx, sy);
      return;
    }

    if (tool === "move") {
      const sel = images.current.find((m) => m.id === selectedRef.current);
      if (sel && Math.hypot((sel.x + sel.w - wx) * cam.current.z, (sel.y + sel.h - wy) * cam.current.z) <= HANDLE_PX) {
        gesture.current = { mode: "resize", id: e.pointerId, erased: [], straightened: false, img: { before: { ...sel }, ox: 0, oy: 0 } };
        return;
      }
      const hit = imageAt(images.current, wx, wy);
      select(hit?.id ?? null);
      if (hit) gesture.current = { mode: "drag", id: e.pointerId, erased: [], straightened: false, img: { before: { ...hit }, ox: wx - hit.x, oy: wy - hit.y } };
      requestDraw();
      return;
    }

    const p: Pt = [wx, wy, isPen ? e.pressure || 0.5 : 0.5];
    // Width stays the same on screen at any zoom.
    const w = size / cam.current.z;
    // White ink would vanish on a white page: on a picture it writes in charcoal.
    const ink = color === COLORS[0].value && imageAt(images.current, wx, wy) ? "#1B1E21" : color;
    if (tool === "line") {
      current.current = { id: newId(), kind: "line", color: ink, size: w, pts: [p, p] };
      gesture.current = { mode: "line", id: e.pointerId, erased: [], straightened: true };
    } else {
      current.current = { id: newId(), kind: "ink", color: ink, size: w, pts: [p] };
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
        const dt = Math.max(1, now - prev.t);
        velocity.current = { vx: dx / dt, vy: dy / dt };
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
        const next = smoothPoint(last, [px, py, pr]);
        hold.current.path += Math.hypot(next[0] - last[0], next[1] - last[1]) * cam.current.z;
        s.pts.push(next);
      }
      // Restart the "hold still" timer whenever the pen really moves.
      if (Math.hypot(sx - hold.current.x, sy - hold.current.y) > HOLD_STILL_PX) armHold(sx, sy);
    }
    requestDraw();
    sendLive();
  };

  const endGesture = (e: React.PointerEvent<HTMLCanvasElement>, cancelled = false) => {
    logPen(e, cancelled ? "cancel" : "up");
    if (e.pointerType === "pen") {
      pens.current.active = false;
      pens.current.lastAt = Date.now();
    }
    if (touches.current.has(e.pointerId)) {
      const wasSingle = touches.current.size === 1;
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
      if (wasSingle && !cancelled && !tap2.current) startGlide(velocity.current.vx, velocity.current.vy);
      if (gesture.current.mode === "pan" && gesture.current.id === e.pointerId) gesture.current = { mode: null, id: -1, erased: [], straightened: false };
      return;
    }
    const g = gesture.current;
    if (g.id !== e.pointerId) return;
    clearHold();
    setAngle(null);
    if (g.mode === "erase") {
      if (g.erased.length) commit({ type: "erase", s: g.erased });
      if (tool !== "eraser") setEraserAt(null);
    } else if ((g.mode === "drag" || g.mode === "resize") && g.img) {
      const before = g.img.before;
      const after = images.current.find((m) => m.id === before.id);
      if (after && (after.x !== before.x || after.y !== before.y || after.w !== before.w)) {
        commit({ type: "img-edit", before, after });
        if (!after.url.startsWith("blob:")) send({ t: "img", m: after });
      }
    } else if ((g.mode === "draw" || g.mode === "line") && current.current) {
      const s = current.current;
      current.current = null;
      const tooShort = s.kind === "line" && Math.hypot(s.pts[1][0] - s.pts[0][0], s.pts[1][1] - s.pts[0][1]) * cam.current.z < 3;
      if (!cancelled && !tooShort) {
        strokes.current = [...strokes.current, s];
        commit({ type: "add", s });
        send({ t: "add", s: packStroke(s) });
      } else {
        send(fullBoard());
      }
    }
    gesture.current = { mode: null, id: -1, erased: [], straightened: false };
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
    setTool(t);
    if (t !== "move") select(null);
    if (t !== "eraser") setEraserAt(null);
    requestDraw();
  };

  // Keyboard on a laptop: P/L/E/V tools, Ctrl+Z / Ctrl+Shift+Z, space to pan, Delete.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
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

  const viewerUrl = typeof window !== "undefined" ? `${window.location.origin}/board-lab/view?room=${room}` : "";
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(viewerUrl);
    } catch {
      window.prompt("Student link", viewerUrl);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const hasContent = meta.content > 0;

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#141618] text-[#f0ede8] [-webkit-touch-callout:none]" style={{ fontFamily: "var(--font-sans)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: tool === "eraser" ? "none" : tool === "move" ? "grab" : "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endGesture(e)}
        onPointerCancel={(e) => endGesture(e, true)}
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

      {/* Eraser ring */}
      {eraserAt && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full border border-white/70 bg-white/5"
          style={{ left: eraserAt.x - ERASER_PX, top: eraserAt.y - ERASER_PX, width: ERASER_PX * 2, height: ERASER_PX * 2 }}
        />
      )}

      {/* Angle readout while drawing a line */}
      {angle && (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-[#FBC159] px-2.5 py-1 text-xs font-bold tabular-nums text-[#141618] shadow-lg"
          style={{ left: angle.x + 18, top: angle.y - 34 }}
        >
          {angle.deg}°
        </span>
      )}

      {/* Top bar: brand, live status, student link */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#1c1f22]/80 px-4 py-2.5 backdrop-blur-xl">
          <span style={{ fontFamily: "var(--font-caveat)" }} className="text-xl leading-none text-[#FBC159]">
            hamzateaches
          </span>
          <span className="h-4 w-px bg-white/10" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#80868c]">Board · {room}</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-[#1c1f22]/80 p-1.5 pl-3.5 backdrop-blur-xl">
          <span className="flex items-center gap-2 text-xs font-semibold text-[#b9bec3]">
            <span className={`h-2 w-2 rounded-full ${viewers ? "bg-[#7FD1A6] shadow-[0_0_8px_#7FD1A6]" : "bg-[#5a6066]"}`} />
            {viewers ? `${viewers} watching` : "No one watching"}
          </span>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="flex h-9 items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 text-xs font-semibold text-[#f0ede8] transition-colors hover:bg-white/[0.1] [&_svg]:h-4 [&_svg]:w-4"
          >
            {I.link}
            {copied ? "Copied" : "Student link"}
          </button>
        </div>
      </div>

      {/* Zoom + palm settings (top right, clear of the toolbar on a portrait tablet) */}
      <div className="absolute right-4 top-[76px] flex items-center gap-1 rounded-2xl border border-white/[0.07] bg-[#1c1f22]/80 p-1.5 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setFingerDraws((v) => !v)}
          className={`h-9 rounded-xl px-3 text-xs font-semibold transition-colors ${fingerDraws ? "bg-white/[0.08] text-[#f0ede8]" : "text-[#80868c] hover:text-[#f0ede8]"}`}
          title="For phones without a pen. On your tablet, leave this off: only the S Pen draws."
        >
          {fingerDraws ? "Finger draws" : "Pen only"}
        </button>
        <span className="w-12 text-center text-xs font-semibold tabular-nums text-[#80868c]">{zoom}%</span>
        <ToolButton label="Fit the whole board" onClick={fit}>{I.fit}</ToolButton>
      </div>

      {/* Picture actions, when one is selected */}
      {selectedId && tool === "move" && (
        <div className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-[#FBC159]/30 bg-[#1c1f22]/90 p-1.5 pl-4 backdrop-blur-xl">
          <span className="text-xs font-semibold text-[#b9bec3]">Drag to move · gold dot to resize</span>
          <button type="button" onClick={deleteSelected} className="flex h-9 items-center gap-1.5 rounded-xl bg-[#F07A6A]/15 px-3 text-xs font-bold text-[#F07A6A] [&_svg]:h-4 [&_svg]:w-4">
            {I.trash}
            Remove
          </button>
        </div>
      )}

      {/* Main toolbar */}
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[22px] border border-white/[0.08] bg-[#1c1f22]/85 p-1.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
        <ToolButton label="Pen (P)" active={tool === "pen"} onClick={() => pickTool("pen")}>{I.pen}</ToolButton>
        <ToolButton label="Straight line (L)" active={tool === "line"} onClick={() => pickTool("line")}>{I.line}</ToolButton>
        <ToolButton label="Eraser (E), or hold the pen's side button" active={tool === "eraser"} onClick={() => pickTool("eraser")}>{I.eraser}</ToolButton>
        <ToolButton label="Move pictures (V)" active={tool === "move"} onClick={() => pickTool("move")}>{I.move}</ToolButton>
        <ToolButton label="Insert a picture or PDF" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#FBC159]/30 border-t-[#FBC159]" /> : I.insert}
        </ToolButton>
        <Divider />
        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-label={c.name}
            aria-pressed={color === c.value}
            onClick={() => {
              setColor(c.value);
              if (tool === "eraser" || tool === "move") pickTool("pen");
            }}
            className="flex h-11 w-9 items-center justify-center"
          >
            <span
              className={`block rounded-full transition-all duration-200 ${color === c.value ? "h-6 w-6 ring-2 ring-[#FBC159] ring-offset-2 ring-offset-[#1c1f22]" : "h-5 w-5 opacity-80 hover:opacity-100"}`}
              style={{ background: c.value }}
            />
          </button>
        ))}
        <Divider />
        {SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-label={`${s.name} pen`}
            aria-pressed={size === s.value}
            onClick={() => setSize(s.value)}
            className={`flex h-11 w-9 items-center justify-center rounded-xl transition-colors ${size === s.value ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"}`}
          >
            <span className="block rounded-full" style={{ width: s.value * 2.4, height: s.value * 2.4, background: size === s.value ? "#FBC159" : "#a6acb2" }} />
          </button>
        ))}
        <Divider />
        <ToolButton label="Undo (Ctrl+Z, or tap with two fingers)" disabled={!meta.undo} onClick={undo}>{I.undo}</ToolButton>
        <ToolButton label="Redo" disabled={!meta.redo} onClick={redo}>{I.redo}</ToolButton>
        <ToolButton label="Clear the board" disabled={!hasContent} onClick={() => setConfirmClear(true)}>{I.trash}</ToolButton>
      </div>

      {/* Short messages: "Undone", upload progress, errors */}
      {(notice || busy) && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-[#1c1f22]/95 px-4 py-2 text-xs font-semibold text-[#f0ede8] shadow-lg">
          {busy ?? notice}
        </div>
      )}

      {/* Pen diagnostics (?debug=1): what the tablet reports for the pen and its button */}
      {debug && (
        <div className="pointer-events-none absolute left-4 top-20 max-w-[90vw] rounded-lg bg-black/80 px-3 py-2 font-mono text-[11px] text-[#7FD1A6]">{debug}</div>
      )}

      {/* Clear confirm */}
      {confirmClear && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setConfirmClear(false)}>
          <div className="w-[320px] rounded-2xl border border-white/10 bg-[#1c1f22] p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Clear the whole board?</p>
            <p className="mt-1 text-sm text-[#a6acb2]">Writing and pictures go. Undo brings them back.</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setConfirmClear(false)} className="h-11 flex-1 rounded-xl bg-white/[0.06] text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAll();
                  setConfirmClear(false);
                }}
                className="h-11 flex-1 rounded-xl bg-[#FBC159] text-sm font-bold text-[#141618]"
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

export function ViewerBoard({ room }: { room: string }) {
  const strokes = useRef<Stroke[]>([]);
  const images = useRef<BoardImage[]>([]);
  const live = useRef<Stroke | null>(null);
  const cam = useRef<Camera>({ x: -60, y: -60, z: 1 });
  const teacherView = useRef<View | null>(null);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  const [teacherHere, setTeacherHere] = useState(false);
  const [got, setGot] = useState(false);

  const { canvasRef, size: screen, requestDraw } = useCanvas((ctx, w, h, again) =>
    paint(ctx, w, h, cam.current, images.current, strokes.current, [live.current], again),
  );

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const followTeacher = useCallback(() => {
    const v = teacherView.current;
    const { w, h } = screen.current;
    if (v && w && h) cam.current = fitView(v, w, h);
    requestDraw();
  }, [screen, requestDraw]);

  useEffect(() => {
    const l = connectBoard(
      room,
      "viewer",
      (m) => {
        if (m.t === "set") {
          strokes.current = m.strokes;
          images.current = m.images ?? [];
          live.current = null;
          setGot(true);
        } else if (m.t === "add") {
          strokes.current = [...strokes.current.filter((s) => s.id !== m.s.id), m.s];
          if (live.current?.id === m.s.id) live.current = null;
          setGot(true);
        } else if (m.t === "del") {
          const ids = new Set(m.ids);
          strokes.current = strokes.current.filter((s) => !ids.has(s.id));
        } else if (m.t === "live") {
          live.current = m.s;
          setGot(true);
        } else if (m.t === "img") {
          images.current = [...images.current.filter((x) => x.id !== m.m.id), m.m];
          setGot(true);
        } else if (m.t === "imgdel") {
          const ids = new Set(m.ids);
          images.current = images.current.filter((x) => !ids.has(x.id));
        } else if (m.t === "view") {
          teacherView.current = m.v;
          if (followRef.current) followTeacher();
        }
        requestDraw();
      },
      (_n, t) => setTeacherHere(t),
    );
    return () => l.close();
  }, [room, requestDraw, followTeacher]);

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
    <div className="fixed inset-0 select-none overflow-hidden bg-[#141618] text-[#f0ede8]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={(e) => {
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
          stopFollow();
          const [x, y] = local(e);
          if (e.ctrlKey || e.metaKey) cam.current = zoomAt(cam.current, Math.exp(-e.deltaY * 0.01), x, y);
          else cam.current = { ...cam.current, x: cam.current.x + e.deltaX / cam.current.z, y: cam.current.y + e.deltaY / cam.current.z };
          requestDraw();
        }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4">
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

      {!follow && (
        <button
          type="button"
          onClick={() => {
            followRef.current = true;
            setFollow(true);
            followTeacher();
          }}
          className="absolute bottom-5 left-1/2 h-11 -translate-x-1/2 rounded-full bg-[#FBC159] px-5 text-sm font-bold text-[#141618] shadow-[0_12px_30px_-10px_rgba(251,193,89,0.6)]"
        >
          Follow Hamza&apos;s board
        </button>
      )}
    </div>
  );
}
