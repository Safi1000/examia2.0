"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  COLORS,
  SIZES,
  type Camera,
  type Pt,
  type Stroke,
  type View,
  boundsOf,
  drawGrid,
  drawStroke,
  fitView,
  hitStroke,
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

/**
 * Hamza's live whiteboard.
 *
 * Teacher: draws with the S Pen. Palm rejection is built in: only the pen (or
 * a mouse on a laptop) draws; fingers move and zoom the board, and every
 * touch is ignored while the pen is on or hovering over the screen.
 * Hold the pen still at the end of a stroke and it straightens into a line,
 * snapping to 0°, 45° or 90°. The pen's side button erases.
 *
 * Viewer: the same board, live, read-only, following Hamza's screen.
 */

const BG = "#141618";
const HOLD_MS = 480;
const HOLD_STILL_PX = 4;
const MIN_HOLD_PATH_PX = 28;
const PALM_LOCK_MS = 650;
const ERASER_PX = 14;

type Tool = "pen" | "line" | "eraser";
type Action = { type: "add"; s: Stroke } | { type: "erase"; s: Stroke[] } | { type: "clear"; s: Stroke[] };

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

function useCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
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
        drawRef.current(ctx, w, h);
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

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera, strokes: Stroke[], extra: (Stroke | null)[]) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);
  drawGrid(ctx, cam, w, h);
  for (const s of strokes) drawStroke(ctx, s);
  for (const s of extra) if (s) drawStroke(ctx, s);
  ctx.restore();
}

// ---------------------------------------------------------------- icons

const I = {
  pen: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20l1.2-4.4L15.6 5.2a2 2 0 012.8 0l.4.4a2 2 0 010 2.8L8.4 18.8 4 20z" />
      <path d="M13.8 7l3.2 3.2" />
    </svg>
  ),
  line: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M5 19L19 5" />
      <circle cx="5" cy="19" r="1.6" fill="currentColor" />
      <circle cx="19" cy="5" r="1.6" fill="currentColor" />
    </svg>
  ),
  eraser: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 19.5h11M4.6 14.6l8.8-8.8a2 2 0 012.8 0l2.5 2.5a2 2 0 010 2.8l-7.3 7.3a2 2 0 01-1.4.6H8.3a2 2 0 01-1.4-.6l-2.3-2.3a1 1 0 010-1.5z" />
      <path d="M9.5 9.7l4.8 4.8" />
    </svg>
  ),
  undo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 7L4.5 11.5 9 16" />
      <path d="M5 11.5h9.5a5 5 0 010 10H12" />
    </svg>
  ),
  redo: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 7l4.5 4.5L15 16" />
      <path d="M19 11.5H9.5a5 5 0 000 10H12" />
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 7h15M9.5 7V5h5v2M6.5 7l.8 12a1.5 1.5 0 001.5 1.4h6.4a1.5 1.5 0 001.5-1.4l.8-12" />
    </svg>
  ),
  fit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </svg>
  ),
};

function ToolButton({ active, label, onClick, children }: { active?: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={label}
      onClick={onClick}
      className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200 [&_svg]:h-[22px] [&_svg]:w-[22px] ${
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
  const [, force] = useState(0);
  const [copied, setCopied] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const { canvasRef, size: screen, requestDraw } = useCanvas((ctx, w, h) => paint(ctx, w, h, cam.current, strokes.current, [current.current]));

  // ---- persistence + live link
  const storeKey = `ht-board-${room}`;
  const save = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persist = useCallback(() => {
    if (save.current) clearTimeout(save.current);
    save.current = setTimeout(() => {
      try {
        localStorage.setItem(storeKey, JSON.stringify(strokes.current));
      } catch {}
    }, 400);
  }, [storeKey]);

  const send = useCallback((m: BoardMsg) => link.current?.send(m), []);
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
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved) strokes.current = JSON.parse(saved) as Stroke[];
    } catch {}
    requestDraw();
    link.current = connectBoard(
      room,
      "teacher",
      (m) => {
        if (m.t === "hello") {
          send({ t: "set", strokes: strokes.current.map(packStroke) });
          const { w, h } = screen.current;
          if (w && h) send({ t: "view", v: visibleView(cam.current, w, h) });
        }
      },
      (n) => setViewers(n),
    );
    return () => link.current?.close();
  }, [room, storeKey, requestDraw, send, screen]);

  const refresh = useCallback(() => {
    requestDraw();
    setZoom(Math.round(cam.current.z * 100));
    shareView();
  }, [requestDraw, shareView]);

  // ---- history
  const commit = (a: Action) => {
    undoStack.current.push(a);
    redoStack.current = [];
    persist();
    force((n) => n + 1);
  };
  const applySet = () => {
    send({ t: "set", strokes: strokes.current.map(packStroke) });
    persist();
    requestDraw();
    force((n) => n + 1);
  };
  const undo = () => {
    const a = undoStack.current.pop();
    if (!a) return;
    if (a.type === "add") strokes.current = strokes.current.filter((s) => s.id !== a.s.id);
    else strokes.current = [...strokes.current, ...a.s];
    redoStack.current.push(a);
    applySet();
  };
  const redo = () => {
    const a = redoStack.current.pop();
    if (!a) return;
    if (a.type === "add") strokes.current = [...strokes.current, a.s];
    else {
      const ids = new Set(a.s.map((s) => s.id));
      strokes.current = strokes.current.filter((s) => !ids.has(s.id));
    }
    undoStack.current.push(a);
    applySet();
  };
  const clearAll = () => {
    if (!strokes.current.length) return;
    commit({ type: "clear", s: strokes.current });
    strokes.current = [];
    applySet();
  };

  // ---- input
  const pens = useRef({ active: false, lastAt: 0, seen: false });
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number } | null>(null);
  const gesture = useRef<{ mode: "draw" | "line" | "erase" | "pan" | null; id: number; erased: Stroke[]; straightened: boolean }>({
    mode: null,
    id: -1,
    erased: [],
    straightened: false,
  });
  const hold = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null; path: number }>({ x: 0, y: 0, timer: null, path: 0 });
  const liveSend = useRef(0);
  const spaceDown = useRef(false);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
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
    const ids = new Set(hit.map((s) => s.id));
    strokes.current = strokes.current.filter((s) => !ids.has(s.id));
    gesture.current.erased.push(...hit);
    send({ t: "del", ids: [...ids] });
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
      const [x, y] = [(b[0] - cam.current.x) * cam.current.z, (b[1] - cam.current.y) * cam.current.z];
      setAngle({ x, y, deg: lineAngle(a, b) });
      requestDraw();
      sendLive();
    }, HOLD_MS);
  };

  const isEraseButton = (e: React.PointerEvent) => (e.buttons & 2) !== 0 || (e.buttons & 32) !== 0 || e.button === 2 || e.button === 5;

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = local(e);
    const isPen = e.pointerType === "pen";
    const isMouse = e.pointerType === "mouse";
    const isTouch = e.pointerType === "touch";

    if (isPen) {
      pens.current.seen = true;
      pens.current.active = true;
      pens.current.lastAt = Date.now();
    }

    // Palm rejection: while the pen is down or was just near the screen, touches do nothing.
    if (isTouch) {
      if (pens.current.active || Date.now() - pens.current.lastAt < PALM_LOCK_MS) return;
      if ((e.width > 40 || e.height > 40) && !fingerDraws) return; // a palm, not a fingertip
      if (!fingerDraws || pens.current.seen) {
        touches.current.set(e.pointerId, { x: sx, y: sy });
        if (touches.current.size === 2) {
          const [p1, p2] = [...touches.current.values()];
          pinch.current = { d: Math.hypot(p1.x - p2.x, p1.y - p2.y), cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2 };
        }
        capture(canvasRef.current, e.pointerId);
        return;
      }
    }

    if (isMouse && (e.button === 1 || spaceDown.current)) {
      gesture.current = { mode: "pan", id: e.pointerId, erased: [], straightened: false };
      touches.current.set(e.pointerId, { x: sx, y: sy });
      capture(canvasRef.current, e.pointerId);
      return;
    }
    if (isMouse && e.button !== 0 && e.button !== 2) return;
    if (gesture.current.mode) return;

    capture(canvasRef.current, e.pointerId);
    const erase = tool === "eraser" || isEraseButton(e);
    if (erase) {
      gesture.current = { mode: "erase", id: e.pointerId, erased: [], straightened: false };
      setEraserAt({ x: sx, y: sy });
      eraseAt(sx, sy);
      return;
    }
    const [wx, wy] = toWorld(cam.current, sx, sy);
    const p: Pt = [wx, wy, isPen ? e.pressure || 0.5 : 0.5];
    // Width stays the same on screen at any zoom.
    const w = size / cam.current.z;
    if (tool === "line") {
      current.current = { id: newId(), kind: "line", color, size: w, pts: [p, p] };
      gesture.current = { mode: "line", id: e.pointerId, erased: [], straightened: true };
    } else {
      current.current = { id: newId(), kind: "ink", color, size: w, pts: [p] };
      gesture.current = { mode: "draw", id: e.pointerId, erased: [], straightened: false };
      hold.current.path = 0;
      armHold(sx, sy);
    }
    requestDraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = local(e);
    if (e.pointerType === "pen") pens.current.lastAt = Date.now(); // hovering counts: keeps palms locked out

    // Touch pan / pinch.
    if (touches.current.has(e.pointerId)) {
      const prev = touches.current.get(e.pointerId)!;
      touches.current.set(e.pointerId, { x: sx, y: sy });
      if (touches.current.size === 1 || gesture.current.mode === "pan") {
        cam.current = { ...cam.current, x: cam.current.x - (sx - prev.x) / cam.current.z, y: cam.current.y - (sy - prev.y) / cam.current.z };
      } else if (touches.current.size === 2 && pinch.current) {
        const [p1, p2] = [...touches.current.values()];
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        let c = zoomAt(cam.current, d / pinch.current.d, cx, cy);
        c = { ...c, x: c.x - (cx - pinch.current.cx) / c.z, y: c.y - (cy - pinch.current.cy) / c.z };
        cam.current = c;
        pinch.current = { d, cx, cy };
      }
      refresh();
      return;
    }

    const g = gesture.current;
    if (g.id !== e.pointerId || !g.mode) {
      if (tool === "eraser" && e.pointerType !== "touch") setEraserAt({ x: sx, y: sy });
      return;
    }

    if (g.mode === "erase") {
      setEraserAt({ x: sx, y: sy });
      const evs = coalesced(e.nativeEvent);
      for (const ev of evs) {
        const [x, y] = local(ev);
        eraseAt(x, y);
      }
      return;
    }

    const s = current.current;
    if (!s) return;
    const [wx, wy] = toWorld(cam.current, sx, sy);

    if (g.mode === "line" || (g.mode === "draw" && g.straightened)) {
      const a = s.pts[0];
      const b = snapLine(a, [wx, wy, 0.5]);
      s.pts = [a, b];
      setAngle({ x: (b[0] - cam.current.x) * cam.current.z, y: (b[1] - cam.current.y) * cam.current.z, deg: lineAngle(a, b) });
    } else {
      const evs = coalesced(e.nativeEvent);
      for (const ev of evs) {
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
    if (e.pointerType === "pen") {
      pens.current.active = false;
      pens.current.lastAt = Date.now();
    }
    if (touches.current.has(e.pointerId)) {
      touches.current.delete(e.pointerId);
      if (touches.current.size < 2) pinch.current = null;
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
    } else if ((g.mode === "draw" || g.mode === "line") && current.current) {
      const s = current.current;
      current.current = null;
      const tooShort = s.kind === "line" && Math.hypot(s.pts[1][0] - s.pts[0][0], s.pts[1][1] - s.pts[0][1]) * cam.current.z < 3;
      if (!cancelled && !tooShort) {
        strokes.current = [...strokes.current, s];
        commit({ type: "add", s });
        send({ t: "add", s: packStroke(s) });
      } else {
        send({ t: "set", strokes: strokes.current.map(packStroke) });
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

  // Keyboard on a laptop: P/L/E tools, Ctrl+Z / Ctrl+Shift+Z, space to pan.
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
      if (e.key === "p") setTool("pen");
      if (e.key === "l") setTool("line");
      if (e.key === "e") setTool("eraser");
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
    const { w, h } = screen.current;
    cam.current = b ? fitView(b, w, h) : { x: -60, y: -60, z: 1 };
    refresh();
  };

  const viewerUrl = typeof window !== "undefined" ? `${window.location.origin}/board-lab/view?room=${room}` : "";
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(viewerUrl);
    } catch {
      window.prompt("Viewer link", viewerUrl);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-[#141618] text-[#f0ede8]" style={{ fontFamily: "var(--font-sans)" }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: tool === "eraser" ? "none" : "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endGesture(e)}
        onPointerCancel={(e) => endGesture(e, true)}
        onPointerLeave={() => tool === "eraser" && gesture.current.mode !== "erase" && setEraserAt(null)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
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

      {/* Top bar: brand, live status, viewer link */}
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

      {/* Main toolbar */}
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-[22px] border border-white/[0.08] bg-[#1c1f22]/85 p-1.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl">
        <ToolButton label="Pen (P)" active={tool === "pen"} onClick={() => setTool("pen")}>{I.pen}</ToolButton>
        <ToolButton label="Straight line (L)" active={tool === "line"} onClick={() => setTool("line")}>{I.line}</ToolButton>
        <ToolButton label="Eraser (E), or hold the pen's side button" active={tool === "eraser"} onClick={() => setTool("eraser")}>{I.eraser}</ToolButton>
        <Divider />
        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-label={c.name}
            aria-pressed={color === c.value}
            onClick={() => {
              setColor(c.value);
              if (tool === "eraser") setTool("pen");
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
        <ToolButton label="Undo (Ctrl+Z)" onClick={undo}>{I.undo}</ToolButton>
        <ToolButton label="Redo" onClick={redo}>{I.redo}</ToolButton>
        <ToolButton label="Clear the board" onClick={() => strokes.current.length && setConfirmClear(true)}>{I.trash}</ToolButton>
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

      {/* Clear confirm */}
      {confirmClear && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setConfirmClear(false)}>
          <div className="w-[320px] rounded-2xl border border-white/10 bg-[#1c1f22] p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Clear the whole board?</p>
            <p className="mt-1 text-sm text-[#a6acb2]">Undo brings it back.</p>
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
  const live = useRef<Stroke | null>(null);
  const cam = useRef<Camera>({ x: -60, y: -60, z: 1 });
  const teacherView = useRef<View | null>(null);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  const [teacherHere, setTeacherHere] = useState(false);
  const [got, setGot] = useState(false);

  const { canvasRef, size: screen, requestDraw } = useCanvas((ctx, w, h) => paint(ctx, w, h, cam.current, strokes.current, [live.current]));

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
            cam.current = { ...cam.current, x: cam.current.x - (x - prev.x) / cam.current.z, y: cam.current.y - (y - prev.y) / cam.current.z };
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
