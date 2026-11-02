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
  ctx.fillStyle = look.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.scale(cam.z, cam.z);
  ctx.translate(-cam.x, -cam.y);
  drawGrid(ctx, cam, w, h);
  drawImages(ctx, images, onImage);
  // Only what is on screen gets drawn, so a full board stays smooth.
  const vx = cam.x, vy = cam.y, vw = w / cam.z, vh = h / cam.z;
  for (const s of strokes) {
    const b = strokeBox(s);
    if (b.x > vx + vw || b.y > vy + vh || b.x + b.w < vx || b.y + b.h < vy) continue;
    drawStroke(ctx, s);
  }
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
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-200 disabled:opacity-30 [&_svg]:h-[22px] [&_svg]:w-[22px] ${
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

const savedLook = (): ThemeId => {
  try {
    return localStorage.getItem("ht-board-look") === "night" ? "night" : "paper";
  } catch {
    return "paper";
  }
};

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
  const [viewers, setViewers] = useState(0);
  // The other device (laptop or tablet) on the private room.
  const [partner, setPartner] = useState(false);
  // Light (paper) or dark (night) board: shared with the other device and students.
  const [look, setLookState] = useState<ThemeId>(savedLook);
  const lookRef = useRef<ThemeId>(look);
  const setLook = (v: ThemeId) => {
    lookRef.current = v;
    setLookState(v);
  };
  const [ledger] = useState(() => new Ledger(lead ? 1 : 0));
  const remoteLiveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toolsHidden, setToolsHidden] = useState(false);
  // Typing: where the text box sits on screen, and what is in it.
  const [typing, setTyping] = useState<{ x: number; y: number; px: number; color: string } | null>(null);
  const typingRef = useRef<{ id: string; wx: number; wy: number; size: number; color: string; text: string; editing?: Stroke } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // What the other device is drawing or typing right now.
  const remoteLive = useRef<Stroke | null>(null);
  const peers = useRef({ own: 0, link: 0 });
  const [angle, setAngle] = useState<{ x: number; y: number; deg: number } | null>(null);
  const [eraserAt, setEraserAt] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(100);
  // What the toolbar needs to know, mirrored from the refs after each change.
  const [meta, setMeta] = useState({ undo: 0, redo: 0, content: 0 });
  const [copied, setCopied] = useState(false);
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
      try {
        // Pictures that only live in this browser (local preview) aren't kept.
        const keep = images.current.filter((m) => !m.url.startsWith("blob:"));
        localStorage.setItem(storeKey, JSON.stringify({ strokes: strokes.current, images: keep }));
      } catch {}
    }, 400);
  }, [storeKey]);

  // Everything goes to the private room (the laptop) and the student link's room.
  // Only the private room is listened to for anything but "send me the board".
  const viewLink = useRef<BoardLink | null>(null);
  const send = useCallback(
    (m: BoardMsg) => {
      const out = stampMsg(ledger, m);
      link.current?.send(out);
      // Students get finished strokes only (no live preview or pan updates here): a class of
      // them watching would otherwise be hundreds of messages a second.
      if (out.t !== "live" && out.t !== "view") viewLink.current?.send(out);
    },
    [ledger],
  );
  const fullBoard = useCallback(
    (): BoardMsg => ({ t: "set", strokes: strokes.current.map(packStroke), images: images.current.filter((m) => !m.url.startsWith("blob:")) }),
    [],
  );
  const sendView = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendViewStudents = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `screen` is a stable ref from useCanvas; the compiler just can't see that.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const shareView = useCallback(() => {
    if (!lead) return;
    if (!sendView.current)
      sendView.current = setTimeout(() => {
        sendView.current = null;
        const { w, h } = screen.current;
        if (w && h) link.current?.send({ t: "view", v: visibleView(cam.current, w, h) });
      }, 40); // ~25 position updates a second to the laptop, which glides between them
    if (!sendViewStudents.current)
      sendViewStudents.current = setTimeout(() => {
        sendViewStudents.current = null;
        const { w, h } = screen.current;
        if (w && h) viewLink.current?.send({ t: "view", v: visibleView(cam.current, w, h) });
      }, 250); // students glide too, with far fewer messages
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
    const loadSaved = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(storeKey) ?? "null");
        if (Array.isArray(saved)) strokes.current = saved as Stroke[];
        else if (saved) {
          strokes.current = saved.strokes ?? [];
          images.current = saved.images ?? [];
        }
      } catch {}
      requestDraw();
      syncMeta();
    };
    // The tablet opens its saved board. The laptop waits a moment for the tablet's
    // board, and only opens its own copy when the tablet isn't on.
    if (lead) loadSaved();
    const late = lead ? null : setTimeout(() => !gotBoard.current && loadSaved(), 1800);
    const t = setTimeout(syncMeta, 0);
    link.current = connectBoard(
      room,
      "teacher",
      (m) => onRemote.current(m),
      (n, others) => {
        peers.current.own = n;
        setViewers(peers.current.own + peers.current.link);
        setPartner(others > 0);
      },
      true,
    );
    // The student link's room: it can only ask for the board, never change it.
    viewLink.current = room.includes(".")
      ? connectBoard(
          viewerRoom(room),
          "teacher",
          (m) => {
            if (m.t !== "hello") return;
            // Answer the student who asked, on their own channel.
            viewLink.current?.send(stampMsg(ledger, fullBoard()));
            viewLink.current?.send({ t: "theme", v: lookRef.current });
            const { w, h } = screen.current;
            if (w && h) viewLink.current?.send({ t: "view", v: visibleView(cam.current, w, h) });
          },
          (n) => {
            peers.current.link = n;
            setViewers(peers.current.own + peers.current.link);
          },
        )
      : null;
    // Heartbeat (tablet only): the laptop and students compare it with what they have and fetch the board again if behind.
    const beat = lead
      ? setInterval(() => {
          const shared = images.current.filter((m) => !m.url.startsWith("blob:"));
          send({ t: "rev", n: strokes.current.length + shared.length, last: strokes.current[strokes.current.length - 1]?.id ?? "", d: boardDigest(strokes.current, shared) });
        }, 2000)
      : undefined;
    return () => {
      clearTimeout(t);
      if (late) clearTimeout(late);
      clearInterval(beat);
      link.current?.close();
      viewLink.current?.close();
    };
  }, [room, storeKey, requestDraw, send, screen, fullBoard, lead, ledger]);

  // The light or dark look: remembered on this device, and shared with the other device and students.
  useEffect(() => {
    setTheme(look);
    requestDraw();
    try {
      localStorage.setItem("ht-board-look", look);
    } catch {}
  }, [look, requestDraw]);
  const switchLook = () => {
    const next: ThemeId = look === "paper" ? "night" : "paper";
    setLook(next);
    send({ t: "theme", v: next });
  };

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
      followTarget.current = fitView(v, w, h);
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
          link.current?.send({ t: "theme", v: lookRef.current });
          const { w, h } = screen.current;
          if (lead && w && h) link.current?.send({ t: "view", v: visibleView(cam.current, w, h) });
          return;
        }
        case "theme":
          setLook(m.v);
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
          remoteLive.current = m.s;
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

  const logPen = (e: React.PointerEvent, what: string) => {
    if (!showDebug.current) return;
    setDebug(`${what} · ${e.pointerType} · button ${e.button} · buttons ${e.buttons} · pressure ${e.pressure.toFixed(2)} · size ${Math.round(e.width)}×${Math.round(e.height)}`);
  };

  const sendLive = () => {
    const now = performance.now();
    if (current.current && now - liveSend.current > 50) {
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
      gesture.current = { mode: "line", id: e.pointerId, erased: [], straightened: true };
    } else {
      current.current = { id: newId(), kind: "ink", color: ink, size: w, pts: [p] };
      lastRaw.current = p;
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
      if (e.key === "t") pickTool("text");
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

  const viewerUrl = typeof window !== "undefined" ? `${window.location.origin}/board-lab/view?room=${room.includes(".") ? viewerRoom(room) : room}` : "";
  const copyLink = async (present = false) => {
    // Inside the portal the laptop just opens /teach/present (it pairs by sign-in).
    const inPortal = window.location.pathname.startsWith("/teach");
    const url = present ? (inPortal ? `${window.location.origin}/teach/present` : `${viewerUrl}&present=1`) : viewerUrl;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt(present ? "Laptop link" : "Student link", url);
    }
    const set = present ? setCopiedPresent : setCopied;
    set(true);
    setTimeout(() => set(false), 1800);
  };

  const hasContent = meta.content > 0;

  return (
    <div data-board className="fixed inset-0 select-none overflow-hidden text-[#f0ede8] [-webkit-touch-callout:none]" style={{ fontFamily: "var(--font-sans)", background: THEMES[look].bg }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: tool === "eraser" ? "none" : tool === "move" ? "grab" : tool === "text" ? "text" : "crosshair" }}
        onPointerDown={onPointerDown}
        // Keeps the text box focused when the board is clicked or tapped to type.
        onMouseDown={(e) => tool === "text" && e.preventDefault()}
        onPointerMove={onPointerMove}
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
          typing ? "rounded-sm ring-1 ring-[#FBC159]/45 ring-offset-4 ring-offset-transparent" : "pointer-events-none opacity-0"
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
          className="pointer-events-none absolute rounded-full bg-[#FBC159] px-2.5 py-1 text-xs font-bold tabular-nums text-[#141618] shadow-lg"
          style={{ left: angle.x + 18, top: angle.y - 34 }}
        >
          {angle.deg}°
        </span>
      )}

      {/* Tools hidden (clean screen for sharing): a quiet mark and a way back. */}
      {toolsHidden && (
        <>
          <span style={{ fontFamily: "var(--font-caveat)" }} className={`pointer-events-none absolute bottom-4 right-5 text-lg ${look === "paper" ? "text-[#0F63A8]/70" : "text-[#FBC159]/60"}`}>
            hamzateaches
          </span>
          <button
            type="button"
            onClick={() => setToolsHidden(false)}
            className="absolute bottom-4 left-4 h-9 rounded-xl bg-white/[0.04] px-3 text-xs font-semibold text-[#80868c] transition-colors hover:bg-white/[0.08] hover:text-[#f0ede8]"
          >
            Show tools
          </button>
        </>
      )}

      {/* Top bar: brand, live status, student link */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4 ${toolsHidden ? "hidden" : ""}`}>
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-[#1c1f22]/80 px-4 py-2.5 backdrop-blur-xl">
          <span style={{ fontFamily: "var(--font-caveat)" }} className="text-xl leading-none text-[#FBC159]">
            hamzateaches
          </span>
          <span className="h-4 w-px bg-white/10" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#80868c]">{lead ? "Board" : "Board · laptop"}</span>
          <span className="h-4 w-px bg-white/10" />
          <span
            className="flex items-center gap-1.5 text-xs font-semibold text-[#b9bec3]"
            title={lead ? "Open the screen sharing view on your laptop: it draws too, and follows this tablet." : "Open the board on your tablet: when it pans or zooms, this screen follows."}
          >
            <span className={`h-2 w-2 rounded-full ${partner ? "bg-[#7FD1A6] shadow-[0_0_8px_#7FD1A6]" : "bg-[#5a6066]"}`} />
            {partner ? (lead ? "Laptop linked" : "Tablet linked") : lead ? "Laptop not open" : "Tablet not open"}
          </span>
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
          {lead && <button
            type="button"
            onClick={() => void copyLink(true)}
            title="Open this on your MacBook and share that screen in Meet: it mirrors this tablet, with no buttons on screen."
            className="flex h-9 items-center gap-1.5 rounded-xl bg-[#FBC159]/15 px-3 text-xs font-semibold text-[#FBC159] transition-colors hover:bg-[#FBC159]/25 [&_svg]:h-4 [&_svg]:w-4"
          >
            {copiedPresent ? "Copied" : "Laptop link"}
          </button>}
        </div>
      </div>

      {/* Zoom + palm settings (top right, clear of the toolbar on a portrait tablet) */}
      <div className={`absolute right-4 top-[76px] flex items-center gap-1 rounded-2xl border border-white/[0.07] bg-[#1c1f22]/80 p-1.5 backdrop-blur-xl ${toolsHidden ? "hidden" : ""}`}>
        <button
          type="button"
          onClick={() => setFingerDraws((v) => !v)}
          className={`h-9 rounded-xl px-3 text-xs font-semibold transition-colors ${fingerDraws ? "bg-white/[0.08] text-[#f0ede8]" : "text-[#80868c] hover:text-[#f0ede8]"}`}
          title="For phones without a pen. On your tablet, leave this off: only the S Pen draws."
        >
          {fingerDraws ? "Finger draws" : "Pen only"}
        </button>
        <button
          type="button"
          onClick={switchLook}
          className="h-9 rounded-xl px-3 text-xs font-semibold text-[#b9bec3] transition-colors hover:bg-white/[0.06] hover:text-[#f0ede8]"
          title="Switch between a light board (easiest to see on a TV) and a dark one. It changes on your laptop and the students' screens too."
        >
          {look === "paper" ? "Light board" : "Dark board"}
        </button>
        <span className="w-12 text-center text-xs font-semibold tabular-nums text-[#80868c]">{zoom}%</span>
        <ToolButton label="Fit the whole board" onClick={fit}>{I.fit}</ToolButton>
        <ToolButton label="Hide the tools for a clean shared screen (H)" onClick={() => setToolsHidden(true)}>{I.hide}</ToolButton>
      </div>

      {/* Picture actions, when one is selected */}
      {selectedId && !toolsHidden && (
        <div className="absolute left-1/2 top-20 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-[#FBC159]/30 bg-[#1c1f22]/90 p-1.5 pl-4 backdrop-blur-xl">
          <span className="text-xs font-semibold text-[#b9bec3]">{lead ? "Finger drags it · gold dot resizes" : "Drag to move · gold dot resizes"}</span>
          <button type="button" onClick={deleteSelected} className="flex h-9 items-center gap-1.5 rounded-xl bg-[#F07A6A]/15 px-3 text-xs font-bold text-[#F07A6A] [&_svg]:h-4 [&_svg]:w-4">
            {I.trash}
            Remove
          </button>
        </div>
      )}

      {/* Main toolbar */}
      <div className={`absolute bottom-5 left-1/2 max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-[22px] [scrollbar-width:none] ${toolsHidden ? "hidden" : "flex"} border border-white/[0.08] bg-[#1c1f22]/85 p-1.5 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl`}>
        <ToolButton label="Pen (P). Draw a T for a T account; hold still at the end to snap a line, box or circle" active={tool === "pen"} onClick={() => pickTool("pen")}>{I.pen}</ToolButton>
        <ToolButton label="Straight line (L)" active={tool === "line"} onClick={() => pickTool("line")}>{I.line}</ToolButton>
        <ToolButton label="Eraser (E), or hold the pen's side button" active={tool === "eraser"} onClick={() => pickTool("eraser")}>{I.eraser}</ToolButton>
        <ToolButton label="Type (T). Tap or click where the words go; Enter finishes, Shift+Enter for a new line" active={tool === "text"} onClick={() => pickTool("text")}>{I.text}</ToolButton>
        <ToolButton label="Move pictures (V)" active={tool === "move"} onClick={() => pickTool("move")}>{I.move}</ToolButton>
        <ToolButton label="Insert a picture or PDF" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#FBC159]/30 border-t-[#FBC159]" /> : I.insert}
        </ToolButton>
        <Divider />
        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-label={look === "paper" && c.value === COLORS[0].value ? "Ink" : c.name}
            aria-pressed={color === c.value}
            onClick={() => {
              setColor(c.value);
              if (tool === "eraser" || tool === "move") pickTool("pen");
            }}
            className="flex h-11 w-9 shrink-0 items-center justify-center"
          >
            <span
              className={`block rounded-full transition-all duration-200 ${color === c.value ? "h-6 w-6 ring-2 ring-[#FBC159] ring-offset-2 ring-offset-[#1c1f22]" : "h-5 w-5 opacity-80 hover:opacity-100"}`}
              style={{ background: inkOf(c.value), boxShadow: look === "paper" ? "inset 0 0 0 1px rgba(255,255,255,0.18)" : undefined }}
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
            className={`flex h-11 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${size === s.value ? "bg-white/[0.08]" : "hover:bg-white/[0.05]"}`}
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
  const [look, setLook] = useState<ThemeId>("paper");
  const [ledger] = useState(() => new Ledger(0));

  const { canvasRef, size: screen, requestDraw } = useCanvas((ctx, w, h, again) =>
    paint(ctx, w, h, cam.current, images.current, strokes.current, [live.current], again),
  );
  // Same light or dark board as the teacher's.
  useEffect(() => {
    setTheme(look);
    requestDraw();
  }, [look, requestDraw]);

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
  // Held in a ref so the live connection never has to restart to use it.
  const followFn = useRef<(jump?: boolean) => void>(() => {});
  useEffect(() => {
    followFn.current = (jump = false) => {
      const v = teacherView.current;
      const { w, h } = screen.current;
      if (!v || !w || !h) return;
      target.current = fitView(v, w, h);
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
          if (ledger.known(m.s.id)) return;
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
          setLook(m.v);
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
      <div className={`pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4 ${present ? "hidden" : ""}`}>
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
