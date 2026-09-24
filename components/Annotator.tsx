"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Annotation, Annotations } from "@/types";
import { Button, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Grader markup over submitted pages.
 *
 * Everything here is an image: a submitted PDF is stored as one image URL per
 * page (see `uploadPdfPages`), so one viewer covers photos and PDFs alike.
 * Shapes are stored in each image's own pixel coordinates and the overlay SVG
 * uses the natural size as its viewBox — markup lines up at any display size.
 */

const COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#111827"];
type Tool = "pen" | "highlight" | "text" | "erase";
type Stroke = Extract<Annotation, { t: "draw" }>;

const nid = () => Math.random().toString(36).slice(2, 10);

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

/** Read-only markup layer; sits on top of an image of the same aspect ratio. */
export function AnnotationLayer({ shapes, w, h }: { shapes: Annotation[]; w: number; h: number }) {
  if (!shapes.length || !w || !h) return null;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {shapes.map((s) => (
        <Shape key={s.id} s={s} />
      ))}
    </svg>
  );
}

function Shape({ s }: { s: Annotation }) {
  if (s.t === "text") {
    return (
      <text x={s.x} y={s.y} fill={s.color} fontSize={s.size} fontWeight={700}>
        {s.s}
      </text>
    );
  }
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
      for (let j = 0; j + 1 < s.pts.length; j += 2) {
        if (Math.hypot(x - s.pts[j], y - s.pts[j + 1]) <= r) return s;
      }
    } else {
      // Text is anchored on its baseline, so the box sits above y.
      const w = s.s.length * s.size * 0.6;
      if (x >= s.x - tolerance && x <= s.x + w + tolerance && y >= s.y - s.size && y <= s.y + s.size * 0.3) return s;
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
  const inner = (
    <span className="relative block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        onLoad={(e) => setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        className={className}
      />
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
  onClose,
}: {
  urls: string[];
  /** Index of the page the grader clicked; it is scrolled into view on open. */
  startAt?: number;
  initial: Annotations;
  onChange: (url: string, shapes: Annotation[]) => void;
  onClose: () => void;
}) {
  // Seeded once per mount — callers key the modal by answer.
  const [byUrl, setByUrl] = useState<Annotations>(initial);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(1);
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
    setByUrl((prev) => ({ ...prev, [url]: shapes }));
    onChange(url, shapes);
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
          {(["pen", "highlight", "text", "erase"] as Tool[]).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              aria-pressed={tool === t}
              className={cn(
                "h-9 shrink-0 rounded-md border px-3 text-sm font-semibold capitalize",
                tool === t ? "border-brand bg-brand text-on-brand" : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              {t}
            </button>
          ))}
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
              <button onClick={() => goto(page - 1)} disabled={page === 0} className="h-9 rounded-md border border-border-strong px-2.5 disabled:opacity-40" aria-label="Previous page">‹</button>
              <span className="tabular">{page + 1} / {urls.length}</span>
              <button onClick={() => goto(page + 1)} disabled={page === urls.length - 1} className="h-9 rounded-md border border-border-strong px-2.5 disabled:opacity-40" aria-label="Next page">›</button>
            </div>
          )}
          <Button variant="secondary" size="sm" onClick={() => commit(current, currentShapes.slice(0, -1))} disabled={!currentShapes.length}>
            Undo
          </Button>
          <Button variant="secondary" size="sm" onClick={() => commit(current, [])} disabled={!currentShapes.length}>
            Clear
          </Button>
          <span className="hidden text-xs text-ink-3 xl:inline">Saved automatically</span>
          <button onClick={onClose} aria-label="Close annotator" className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink lg:ml-0">
            <Icon.Close className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-surface-2/40 px-2 py-3 sm:px-4 sm:py-6">
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
  scrollIntoViewOnLoad,
  onCommit,
}: {
  url: string;
  alt: string;
  shapes: Annotation[];
  tool: Tool;
  color: string;
  size: number;
  scrollIntoViewOnLoad?: boolean;
  onCommit: (shapes: Annotation[]) => void;
}) {
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<SVGPathElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const erasing = useRef(false);
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

  /** Client point → image pixel coordinates. */
  function at(e: React.PointerEvent) {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * dim.w,
      y: ((e.clientY - r.top) / r.height) * dim.h,
    };
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

  /**
   * The in-progress stroke is painted by writing straight to one <path>, NOT
   * through state: a drag fires pointermove ~120x/s, and re-rendering every
   * committed shape that often is what makes the tab die on a big scan.
   * React hears about the stroke once, on pointerup.
   */
  function paintLive() {
    const d = drawing.current;
    if (liveRef.current) liveRef.current.setAttribute("d", d ? pathFor(d.pts) : "");
  }

  function down(e: React.PointerEvent) {
    if (!dim.w) return;
    if (e.pointerType === "pen") sawPen.current = true;
    if (isPalm(e, sawPen.current)) return;
    const p = at(e);
    if (tool === "erase") {
      // Capture so a drag keeps rubbing out whatever it passes over.
      e.currentTarget.setPointerCapture(e.pointerId);
      erasing.current = true;
      eraseAt(p.x, p.y);
      return;
    }
    if (tool === "text") {
      const s = window.prompt("Comment text");
      if (!s?.trim()) return;
      onCommit([...shapes, { id: nid(), t: "text", color, x: p.x, y: p.y, size: (dim.w / 28) * size, s: s.trim() }]);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = { id: nid(), t: "draw", color, w: strokeFor(tool), pts: [p.x, p.y] };
    paintLive();
  }

  function move(e: React.PointerEvent) {
    if (erasing.current) {
      const p = at(e);
      eraseAt(p.x, p.y);
      return;
    }
    const d = drawing.current;
    if (!d) return;
    const p = at(e);
    // Drop points the stroke can't show anyway — bounds how long pts can grow.
    const n = d.pts.length;
    if (Math.hypot(p.x - d.pts[n - 2], p.y - d.pts[n - 1]) < d.w / 4) return;
    d.pts.push(p.x, p.y);
    paintLive();
  }

  function up() {
    erasing.current = false;
    const d = drawing.current;
    if (!d) return;
    drawing.current = null;
    paintLive();
    onCommit([...shapes, d]);
  }

  return (
    <div
      ref={wrapRef}
      className="relative select-none overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-sm)] [-webkit-touch-callout:none]"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        draggable={false}
        onLoad={(e) => {
          setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
          if (scrollIntoViewOnLoad) wrapRef.current?.scrollIntoView({ block: "start" });
        }}
        className="block w-full select-none"
      />
      {dim.w === 0 && (
        <p className="px-3 py-10 text-center text-sm text-ink-3">Loading page…</p>
      )}
      {dim.w > 0 && (
        <svg
          ref={svgRef}
          viewBox={`0 0 ${dim.w} ${dim.h}`}
          className={cn("absolute inset-0 h-full w-full touch-none", tool === "erase" ? "cursor-pointer" : "cursor-crosshair")}
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
            strokeWidth={strokeFor(tool)}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={tool === "highlight" ? 0.35 : 1}
          />
        </svg>
      )}
    </div>
  );
}
