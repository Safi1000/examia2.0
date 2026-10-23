"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Annotation, Annotations } from "@/types";
import { Button, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { inkOutlinePath, isPenEraser, snapLine, type Pt } from "@/components/board/engine";

/**
 * Grader markup over submitted pages.
 *
 * Everything here is an image: a submitted PDF is stored as one image URL per
 * page (see `uploadPdfPages`), so one viewer covers photos and PDFs alike.
 * Shapes are stored in each image's own pixel coordinates and the overlay SVG
 * uses the natural size as its viewBox — markup lines up at any display size.
 */

const COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#111827"];
type Tool = "pen" | "line" | "highlight" | "mark" | "tick" | "cross" | "text" | "erase";

/** Same feel as the whiteboard: hold the pen still to straighten a stroke. */
const HOLD_MS = 480;
const HOLD_STILL_PX = 4;
const MIN_HOLD_PATH_PX = 28;
/** Fingers stay locked out this long after the pen was last near the screen. */
const PALM_LOCK_MS = 350;
type Stroke = Extract<Annotation, { t: "draw" }>;

const nid = () => Math.random().toString(36).slice(2, 10);

/** Share of the card taken by the script; the rest is the marking margin. */
const PAGE_FRACTION = 0.84;

/** Flat [x, y, x, y, ...] in image pixels → an SVG polyline path. */
/** True for contacts that should not draw: a resting hand, or any finger once a
 *  stylus is in use. `width`/`height` are the contact patch in CSS pixels. */
function isPalm(e: React.PointerEvent, penSeen: boolean) {
  if (e.pointerType !== "touch") return false;
  if (penSeen) return true;
  return e.width > 40 || e.height > 40;
}

function pathFor(pts: number[]) {
  let d = "";
  for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? "L" : "M"}${pts[i]} ${pts[i + 1]} `;
  return d;
}

/**
 * Read-only markup layer.
 *
 * The viewBox spans the page PLUS the marking margin, matching the editor, so a
 * number written beside the work shows up here instead of being cut off.
 */
export function AnnotationLayer({ shapes, w, h }: { shapes: Annotation[]; w: number; h: number }) {
  if (!shapes.length || !w || !h) return null;
  return (
    <svg viewBox={`0 0 ${w / PAGE_FRACTION} ${h}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {shapes.map((s) => (
        <Shape key={s.id} s={s} />
      ))}
    </svg>
  );
}

function Shape({ s }: { s: Annotation }) {
  if (s.t === "mark") {
    return (
      <text x={s.x} y={s.y} fill={s.color} fontSize={s.size} fontWeight={700} textAnchor="middle">
        {s.value}
      </text>
    );
  }
  if (s.t === "text") {
    return (
      <text x={s.x} y={s.y} fill={s.color} fontSize={s.size} fontWeight={700}>
        {s.s}
      </text>
    );
  }
  if (s.p && !s.line) return <path d={inkOutlinePath(s.pts, s.p, s.w)} fill={s.color} />;
  return (
    <path
      d={pathFor(s.pts)}
      fill="none"
      stroke={s.color}
      strokeWidth={s.w}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeOpacity={s.w > 20 ? 0.35 : 1}
    />
  );
}

/** Distance from a point to a segment (for erasing straight lines). */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Topmost shape under the pointer, or undefined.
 *
 * Erasing used to rely on the SVG hit-testing the stroke itself, which meant
 * having to land exactly on a hairline path — mostly a miss. Distance testing
 * against the stored points with a visible-radius tolerance is what makes the
 * eraser feel like an eraser.
 */
function shapeAt(shapes: Annotation[], x: number, y: number, tolerance: number) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (s.t === "draw") {
      const r = Math.max(s.w, tolerance);
      if (s.pts.length === 2 && Math.hypot(x - s.pts[0], y - s.pts[1]) <= r) return s;
      for (let j = 0; j + 3 < s.pts.length; j += 2) {
        if (segDist(x, y, s.pts[j], s.pts[j + 1], s.pts[j + 2], s.pts[j + 3]) <= r) return s;
      }
    } else {
      // Text sits on its baseline, so the box is above y. A mark is centred on
      // x, everything else starts there.
      const label = s.t === "mark" ? String(s.value) : s.s;
      const w = label.length * s.size * 0.6;
      const left = s.t === "mark" ? s.x - w / 2 : s.x;
      if (x >= left - tolerance && x <= left + w + tolerance && y >= s.y - s.size && y <= s.y + s.size * 0.3) return s;
    }
  }
  return undefined;
}

/** An image with its saved markup burnt on top; click to open the editor. */
export function AnnotatedImage({
  url,
  shapes,
  alt,
  className,
  onClick,
}: {
  url: string;
  shapes: Annotation[];
  alt: string;
  className?: string;
  onClick?: () => void;
}) {
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const marked = shapes.length > 0;
  const inner = (
    <span className="relative block">
      <span className="flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          onLoad={(e) => setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          className={className}
          style={marked ? { width: `${PAGE_FRACTION * 100}%` } : undefined}
        />
        {/* Only reserve the marking margin once there is markup to show in it,
            so an unmarked page still fills the width it always did. */}
        {marked && (
          <span
            className="shrink-0 border-l border-dashed border-border bg-[#fdfdfb]"
            style={{ width: `${(1 - PAGE_FRACTION) * 100}%` }}
            aria-hidden
          />
        )}
      </span>
      <AnnotationLayer shapes={shapes} w={dim.w} h={dim.h} />
    </span>
  );
  if (!onClick) return inner;
  return (
    <button type="button" onClick={onClick} className="block w-full text-left" aria-label={`Annotate ${alt}`}>
      {inner}
    </button>
  );
}

/**
 * Full-screen annotation editor over every page of one answer.
 *
 * Pages stack and scroll like a document viewer, each at the width of the
 * reading column rather than shrunk to fit the viewport height. Every change is
 * handed to `onChange`, which the caller debounces into the database — there is
 * no explicit save.
 */
export function AnnotatorModal({
  urls,
  startAt = 0,
  initial,
  onChange,
  onMarksTotal,
  onClose,
}: {
  urls: string[];
  /** Index of the page the grader clicked; it is scrolled into view on open. */
  startAt?: number;
  initial: Annotations;
  onChange: (url: string, shapes: Annotation[]) => void;
  /** Sum of the marks stamped in the margins, whenever it changes. */
  onMarksTotal?: (total: number) => void;
  onClose: () => void;
}) {
  // Seeded once per mount — callers key the modal by answer.
  const [byUrl, setByUrl] = useState<Annotations>(initial);
  const [tool, setTool] = useState<Tool>("pen");
  // The page's ink just before Clear, so one Undo can bring it all back.
  const [cleared, setCleared] = useState<{ url: string; shapes: Annotations[string] } | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(1);
  const [markValue, setMarkValue] = useState(1);
  const [page, setPage] = useState(startAt);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Esc + scroll lock. onClose is read through a ref so a new inline handler
  // from the parent can't re-run this effect mid-drag.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  function commit(url: string, shapes: Annotation[]) {
    const next = { ...byUrl, [url]: shapes };
    setByUrl(next);
    onChange(url, shapes);
    // The marks written in the margin ARE the score: hand the caller the total
    // so nobody adds them up by hand and mistypes it. Only when the stamps
    // themselves change, so a pen stroke never overwrites a typed score.
    if (onMarksTotal) {
      const stamps = (list: Annotation[]) => list.filter((a): a is Extract<Annotation, { t: "mark" }> => a.t === "mark");
      const sum = (list: Annotation[]) => stamps(list).reduce((n, m) => n + m.value, 0);
      const before = Object.values(byUrl).flat();
      const after = Object.values(next).flat();
      if (stamps(before).length !== stamps(after).length || sum(before) !== sum(after)) onMarksTotal(sum(after));
    }
  }

  const current = urls[page] ?? urls[0];
  const currentShapes = byUrl[current] ?? [];

  function goto(i: number) {
    const clamped = Math.max(0, Math.min(urls.length - 1, i));
    setPage(clamped);
    scrollRef.current?.querySelector(`[data-page="${clamped}"]`)?.scrollIntoView({ block: "start" });
  }

  return createPortal(
    /* onContextMenu: a long press on a tablet otherwise pops the browser's
       copy / paste / back callout in the middle of marking. */
    <div
      className="fixed inset-0 z-50 flex select-none flex-col bg-paper [-webkit-touch-callout:none]"
      role="dialog"
      aria-modal="true"
      aria-label="Annotate answer"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Two rows on a tablet, one on a laptop. Every control keeps its size and
          the row scrolls sideways rather than dropping tools off the edge. */}
      <div className="shrink-0 border-b border-border bg-surface px-3 py-2 lg:flex lg:items-center lg:gap-3 lg:px-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          {(["pen", "line", "highlight", "mark", "tick", "cross", "text", "erase"] as Tool[]).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              aria-pressed={tool === t}
              className={cn(
                "h-9 shrink-0 rounded-md border px-3 text-sm font-semibold capitalize",
                tool === t ? "border-brand bg-brand text-on-brand" : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              {t === "tick" ? "✓" : t === "cross" ? "✗" : t}
            </button>
          ))}
          {tool === "mark" && (
            <label className="flex shrink-0 items-center gap-1.5 text-sm text-ink-2">
              Marks
              <input
                type="number"
                min={0}
                step={0.5}
                value={markValue}
                onChange={(e) => setMarkValue(Number(e.target.value))}
                className="h-9 w-16 rounded-md border border-border-strong bg-surface px-2 text-center font-mono text-sm font-semibold text-ink"
                aria-label="Marks to stamp"
              />
            </label>
          )}
          <span className="mx-0.5 h-6 w-px shrink-0 bg-border" />
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
              aria-pressed={color === c}
              className={cn("h-8 w-8 shrink-0 rounded-full border-2", color === c ? "border-ink ring-2 ring-brand" : "border-border")}
              style={{ background: c }}
            />
          ))}
          <label className="ml-1 flex shrink-0 items-center gap-2 text-sm text-ink-2">
            Size
            <input type="range" min={0.5} max={3} step={0.5} value={size} onChange={(e) => setSize(+e.target.value)} className="w-20" />
          </label>
        </div>

        <div className="mt-1.5 flex items-center gap-2 lg:ml-auto lg:mt-0">
          {urls.length > 1 && (
            <div className="flex shrink-0 items-center gap-1.5 text-sm text-ink-2">
              <button onClick={() => goto(page - 1)} disabled={page === 0} className="h-10 w-10 rounded-md border border-border-strong text-lg disabled:opacity-40" aria-label="Previous page">‹</button>
              <span className="tabular">{page + 1} / {urls.length}</span>
              <button onClick={() => goto(page + 1)} disabled={page === urls.length - 1} className="h-10 w-10 rounded-md border border-border-strong text-lg disabled:opacity-40" aria-label="Next page">›</button>
            </div>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              // Straight after Clear, Undo brings the whole page's ink back.
              if (!currentShapes.length && cleared?.url === current) {
                commit(current, cleared.shapes);
                setCleared(null);
              } else commit(current, currentShapes.slice(0, -1));
            }}
            disabled={!currentShapes.length && cleared?.url !== current}
          >
            Undo
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setCleared({ url: current, shapes: currentShapes });
              commit(current, []);
            }}
            disabled={!currentShapes.length}
          >
            Clear
          </Button>
          <span className="hidden text-xs text-ink-3 xl:inline">Saved automatically</span>
          <button onClick={onClose} aria-label="Close annotator" className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink lg:ml-0">
            <Icon.Close className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} data-annot-scroll className="flex-1 overflow-y-auto bg-surface-2/40 px-2 py-3 sm:px-4 sm:py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          {urls.map((u, i) => (
            <div key={u} data-page={i} onPointerDown={() => setPage(i)}>
              {urls.length > 1 && (
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Page {i + 1} of {urls.length}</p>
              )}
              <EditablePage
                url={u}
                alt={`Page ${i + 1}`}
                shapes={byUrl[u] ?? []}
                tool={tool}
                color={color}
                size={size}
                markValue={markValue}
                scrollIntoViewOnLoad={i === startAt}
                onCommit={(shapes) => commit(u, shapes)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One annotatable page. Owns its own natural size and in-progress stroke. */
function EditablePage({
  url,
  alt,
  shapes,
  tool,
  color,
  size,
  markValue,
  scrollIntoViewOnLoad,
  onCommit,
}: {
  url: string;
  alt: string;
  shapes: Annotation[];
  tool: Tool;
  color: string;
  size: number;
  markValue: number;
  scrollIntoViewOnLoad?: boolean;
  onCommit: (shapes: Annotation[]) => void;
}) {
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<SVGPathElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const erasing = useRef(false);
  // The pointer that started the stroke. A palm landing mid-stroke fires its
  // own up / cancel, and answering that is what chopped lines in half.
  const activePointer = useRef<number | null>(null);
  // A finger drag, once a stylus has been seen: we scroll the page ourselves
  // because the surface has to keep touch-action: none for the pen's sake.
  const touchScroll = useRef<{ id: number; y: number; el: HTMLElement } | null>(null);
  // Palm rejection: once this page has seen a stylus, finger and palm contacts
  // stop drawing — on a tablet the hand resting on the page would otherwise
  // scribble over the answer. Touch still draws on devices with no pen.
  const sawPen = useRef(false);
  // Shapes the caller has not re-rendered yet, so a fast drag erasing several
  // marks does not keep testing against the stale list.
  const liveShapes = useRef(shapes);
  useEffect(() => {
    liveShapes.current = shapes;
  }, [shapes]);

  // The drawing surface is wider than the page: a blank strip on the right
  // catches marks written past the edge of the script instead of clipping them.
  const canvasW = dim.w ? dim.w / PAGE_FRACTION : 0;

  /** Client point → image pixel coordinates (may land in the margin strip). */
  function at(e: React.PointerEvent) {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvasW,
      y: ((e.clientY - r.top) / r.height) * dim.h,
    };
  }

  /** Append a shape to the newest list we know of, not the last one rendered. */
  function add(s: Annotation) {
    const next = [...liveShapes.current, s];
    liveShapes.current = next;
    onCommit(next);
  }

  function eraseAt(x: number, y: number) {
    const list = liveShapes.current;
    const hit = shapeAt(list, x, y, (Math.max(dim.w, dim.h) / 260) * size * 2);
    if (!hit) return;
    const next = list.filter((s) => s.id !== hit.id);
    liveShapes.current = next;
    onCommit(next);
  }

  // Stroke width scales with the image so a pen stroke looks the same on a
  // phone photo and a 4000px scan.
  const strokeFor = (t: Tool) => (Math.max(dim.w, dim.h) / 260) * size * (t === "highlight" ? 8 : 1);

  // Pressure per point for the stroke being drawn, and the "hold still to
  // straighten" timer — the same pen feel as the whiteboard.
  const pressures = useRef<number[]>([]);
  const straight = useRef(false);
  const hold = useRef<{ x: number; y: number; path: number; timer: ReturnType<typeof setTimeout> | null }>({ x: 0, y: 0, path: 0, timer: null });
  const penNearAt = useRef(0);

  /** Image pixels per screen pixel, for screen-sized thresholds. */
  const pxScale = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r && r.width ? canvasW / r.width : 1;
  };

  /**
   * The in-progress stroke is painted by writing straight to one <path>, NOT
   * through state: a drag fires pointermove ~120x/s, and re-rendering every
   * committed shape that often is what makes the tab die on a big scan.
   * React hears about the stroke once, on pointerup.
   */
  function paintLive() {
    const d = drawing.current;
    const el = liveRef.current;
    if (!el) return;
    if (!d) {
      el.setAttribute("d", "");
      return;
    }
    if (d.p && !d.line) {
      // Pressure ink: a filled outline, exactly how it will be saved.
      el.setAttribute("d", inkOutlinePath(d.pts, d.p, d.w));
      el.setAttribute("fill", d.color);
      el.setAttribute("stroke", "none");
    } else {
      el.setAttribute("d", pathFor(d.pts));
      el.setAttribute("fill", "none");
      el.setAttribute("stroke", d.color);
    }
  }

  function clearHold() {
    if (hold.current.timer) clearTimeout(hold.current.timer);
    hold.current.timer = null;
  }

  /** Pen held still at the end of a stroke: it becomes a straight line (0/45/90° snap). */
  function armHold(cx: number, cy: number) {
    clearHold();
    hold.current.x = cx;
    hold.current.y = cy;
    hold.current.timer = setTimeout(() => {
      const d = drawing.current;
      if (!d || d.line || hold.current.path < MIN_HOLD_PATH_PX) return;
      const n = d.pts.length;
      const a: Pt = [d.pts[0], d.pts[1], 0.5];
      const b = snapLine(a, [d.pts[n - 2], d.pts[n - 1], 0.5]);
      d.pts = [a[0], a[1], b[0], b[1]];
      d.line = true;
      delete d.p;
      straight.current = true;
      try {
        navigator.vibrate?.(10);
      } catch {}
      paintLive();
    }, HOLD_MS);
  }

  function startErase(e: React.PointerEvent) {
    clearHold();
    drawing.current = null;
    paintLive();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    activePointer.current = e.pointerId;
    erasing.current = true;
    const p = at(e);
    eraseAt(p.x, p.y);
  }

  function down(e: React.PointerEvent) {
    if (!dim.w) return;
    if (e.pointerType === "pen") {
      sawPen.current = true;
      penNearAt.current = Date.now();
    }
    // Fingers scroll instead of drawing once the pen is in play. The browser
    // can't do it for us: touch-action has to stay `none` or Chrome steals a
    // slow downward pen stroke and scrolls with it instead.
    if (e.pointerType === "touch" && sawPen.current) {
      // Not while the pen is down or hovering, and not for a resting hand —
      // otherwise the palm holding the tablet steady would drag the script.
      const penNear = Date.now() - penNearAt.current < PALM_LOCK_MS;
      if (activePointer.current === null && !penNear && !isPalm(e, false)) {
        const el = e.currentTarget.closest<HTMLElement>("[data-annot-scroll]");
        if (el) {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
          touchScroll.current = { id: e.pointerId, y: e.clientY, el };
        }
      }
      return;
    }
    if (isPalm(e, sawPen.current)) return;
    // Another pointer is already drawing — ignore this one rather than
    // restarting the stroke half way through.
    if (activePointer.current !== null) return;

    const p = at(e);
    // The S Pen's side button and an eraser end both mean "rub out",
    // whichever tool is selected.
    const active: Tool = isPenEraser(e) ? "erase" : tool;

    if (active === "erase") {
      startErase(e);
      return;
    }
    if (active === "text") {
      const s = window.prompt("Comment text");
      if (!s?.trim()) return;
      add({ id: nid(), t: "text", color, x: p.x, y: p.y, size: (dim.w / 28) * size, s: s.trim() });
      return;
    }
    if (active === "mark") {
      add({ id: nid(), t: "mark", color, x: p.x, y: p.y, size: (dim.w / 22) * size, value: markValue });
      return;
    }
    if (active === "tick" || active === "cross") {
      // One tap, one stamp — the two marks a script needs most.
      add({
        id: nid(),
        t: "text",
        color: active === "tick" ? "#22c55e" : "#ef4444",
        x: p.x,
        y: p.y,
        size: (dim.w / 20) * size,
        s: active === "tick" ? "✓" : "✗",
      });
      return;
    }
    if (active !== "pen" && active !== "highlight" && active !== "line") return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    activePointer.current = e.pointerId;
    straight.current = active === "line";
    const pressure = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
    if (active === "pen") {
      // Pressure ink.
      pressures.current = [pressure];
      drawing.current = { id: nid(), t: "draw", color, w: strokeFor("pen"), pts: [p.x, p.y], p: pressures.current };
      hold.current.path = 0;
      armHold(e.clientX, e.clientY);
    } else if (active === "line") {
      drawing.current = { id: nid(), t: "draw", color, w: strokeFor("pen"), pts: [p.x, p.y, p.x, p.y], line: true };
    } else {
      drawing.current = { id: nid(), t: "draw", color, w: strokeFor(active), pts: [p.x, p.y] };
    }
    paintLive();
  }

  function move(e: React.PointerEvent) {
    if (e.pointerType === "pen") penNearAt.current = Date.now();
    const ts = touchScroll.current;
    if (ts && ts.id === e.pointerId) {
      ts.el.scrollTop -= (e.clientY - ts.y) * 1.15;
      ts.y = e.clientY;
      return;
    }
    if (activePointer.current !== e.pointerId) return;
    // Side button pressed after the pen touched down: erase from here on.
    if (!erasing.current && e.pointerType === "pen" && isPenEraser(e)) {
      startErase(e);
      return;
    }
    if (erasing.current) {
      const list = e.nativeEvent.getCoalescedEvents?.();
      for (const ev of list && list.length ? list : [e.nativeEvent]) {
        const r = svgRef.current!.getBoundingClientRect();
        eraseAt(((ev.clientX - r.left) / r.width) * canvasW, ((ev.clientY - r.top) / r.height) * dim.h);
      }
      return;
    }
    const d = drawing.current;
    if (!d) return;

    if (d.line) {
      const p = at(e);
      const b = snapLine([d.pts[0], d.pts[1], 0.5], [p.x, p.y, 0.5]);
      d.pts = [d.pts[0], d.pts[1], b[0], b[1]];
      paintLive();
      return;
    }

    // Every pen sample since the last frame: smoother curves on the S Pen.
    const r = svgRef.current!.getBoundingClientRect();
    const list = e.nativeEvent.getCoalescedEvents?.();
    const scale = pxScale();
    for (const ev of list && list.length ? list : [e.nativeEvent]) {
      const x = ((ev.clientX - r.left) / r.width) * canvasW;
      const y = ((ev.clientY - r.top) / r.height) * dim.h;
      const n = d.pts.length;
      const lx = d.pts[n - 2];
      const ly = d.pts[n - 1];
      const step = Math.hypot(x - lx, y - ly);
      // Drop points too close to show — bounds how long pts can grow.
      if (step < d.w / 8) continue;
      // Light smoothing steadies the line without lag.
      const sx = lx + (x - lx) * 0.55;
      const sy = ly + (y - ly) * 0.55;
      d.pts.push(sx, sy);
      if (d.p) d.p.push(e.pointerType === "pen" ? ev.pressure || 0.5 : 0.5);
      hold.current.path += step / scale;
    }
    if (d.p && Math.hypot(e.clientX - hold.current.x, e.clientY - hold.current.y) > HOLD_STILL_PX) armHold(e.clientX, e.clientY);
    paintLive();
  }

  /**
   * Ends the stroke — including on pointercancel, which the browser fires if it
   * decides mid-stroke that the gesture was a scroll. Keeping what was drawn so
   * far beats dropping the line on the floor.
   */
  function up(e: React.PointerEvent) {
    if (e.pointerType === "pen") penNearAt.current = Date.now();
    if (touchScroll.current?.id === e.pointerId) touchScroll.current = null;
    if (activePointer.current !== e.pointerId) return;
    clearHold();
    activePointer.current = null;
    erasing.current = false;
    straight.current = false;
    const d = drawing.current;
    if (!d) return;
    drawing.current = null;
    paintLive();
    if (d.line && Math.hypot(d.pts[2] - d.pts[0], d.pts[3] - d.pts[1]) / pxScale() < 3) return;
    // Keep saved pressure data compact.
    if (d.p) d.p = d.p.map((v) => Math.round(v * 100) / 100);
    d.pts = d.pts.map((v) => Math.round(v * 10) / 10);
    // liveShapes, not the prop: two quick strokes land before the parent has
    // re-rendered, and the second would otherwise wipe out the first.
    add(d);
  }

  return (
    <div
      ref={wrapRef}
      className="relative select-none overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-sm)] [-webkit-touch-callout:none]"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          draggable={false}
          onLoad={(e) => {
            setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
            if (scrollIntoViewOnLoad) wrapRef.current?.scrollIntoView({ block: "start" });
          }}
          className="block select-none"
          style={{ width: `${PAGE_FRACTION * 100}%` }}
        />
        {/* Marking margin: room to write a number or a comment beside the work. */}
        <div
          className="shrink-0 border-l border-dashed border-border bg-[#fdfdfb]"
          style={{ width: `${(1 - PAGE_FRACTION) * 100}%` }}
          aria-hidden
        />
      </div>
      {dim.w === 0 && (
        <p className="px-3 py-10 text-center text-sm text-ink-3">Loading page…</p>
      )}
      {dim.w > 0 && (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${canvasW} ${dim.h}`}
          className={cn(
            "absolute inset-0 h-full w-full touch-none",
            tool === "erase" ? "cursor-pointer" : "cursor-crosshair",
          )}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          {shapes.map((s) => (
            <Shape key={s.id} s={s} />
          ))}
          <path
            ref={liveRef}
            fill="none"
            stroke={color}
            strokeWidth={strokeFor(tool === "line" ? "pen" : tool)}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={tool === "highlight" ? 0.35 : 1}
          />
        </svg>
      )}
    </div>
  );
}
