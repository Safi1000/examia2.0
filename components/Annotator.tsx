"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Annotation } from "@/types";
import { Button, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Grader markup over a submitted image.
 *
 * Shapes are stored in the image's own pixel coordinates, and the overlay SVG
 * uses the natural size as its viewBox — so markup lines up at any display
 * size and stroke widths scale with the image instead of the viewport.
 */

const COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#eab308", "#111827"];
type Tool = "pen" | "highlight" | "text" | "erase";
type Stroke = Extract<Annotation, { t: "draw" }>;

const nid = () => Math.random().toString(36).slice(2, 10);

/** Flat [x, y, x, y, ...] in image pixels → an SVG polyline path. */
function pathFor(pts: number[]) {
  let d = "";
  for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? "L" : "M"}${pts[i]} ${pts[i + 1]} `;
  return d;
}

/** Read-only markup layer; sits on top of an image of the same aspect ratio. */
export function AnnotationLayer({ shapes, w, h }: { shapes: Annotation[]; w: number; h: number }) {
  if (!shapes.length || !w || !h) return null;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
    >
      {shapes.map((s) => (
        <Shape key={s.id} s={s} />
      ))}
    </svg>
  );
}

function Shape({ s, onErase }: { s: Annotation; onErase?: () => void }) {
  const hit = onErase
    ? { onPointerDown: onErase, className: "cursor-pointer", style: { pointerEvents: "all" as const } }
    : {};
  if (s.t === "text") {
    return (
      <text x={s.x} y={s.y} fill={s.color} fontSize={s.size} fontWeight={700} {...hit}>
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
      {...hit}
    />
  );
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
 * Full-screen annotation editor. Every change is handed to `onChange`, which
 * the caller debounces into the database — there is no explicit save.
 */
export function AnnotatorModal({
  open,
  url,
  initial,
  onChange,
  onClose,
}: {
  open: boolean;
  url: string;
  initial: Annotation[];
  onChange: (shapes: Annotation[]) => void;
  onClose: () => void;
}) {
  // Seeded once per mount — callers key the modal by image URL.
  const [shapes, setShapes] = useState<Annotation[]>(initial);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(1);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<SVGPathElement>(null);
  const drawing = useRef<Stroke | null>(null);

  // Esc + scroll lock. onClose is read through a ref so a new inline handler
  // from the parent can't re-run this effect mid-drag (which would restore an
  // already-locked scroll position and re-bind the listener every frame).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
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

  if (!open || typeof document === "undefined") return null;

  function apply(next: Annotation[]) {
    setShapes(next);
    onChange(next);
  }

  /** Client point → image pixel coordinates. */
  function at(e: React.PointerEvent) {
    const r = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * dim.w,
      y: ((e.clientY - r.top) / r.height) * dim.h,
    };
  }

  // Stroke width scales with the image so a pen stroke looks the same on a
  // phone photo and a 4000px scan.
  const strokeFor = (t: Tool) => (Math.max(dim.w, dim.h) / 260) * size * (t === "highlight" ? 8 : 1);

  function down(e: React.PointerEvent) {
    if (!dim.w || tool === "erase") return;
    const p = at(e);
    if (tool === "text") {
      const s = window.prompt("Comment text");
      if (!s?.trim()) return;
      apply([...shapes, { id: nid(), t: "text", color, x: p.x, y: p.y, size: (dim.w / 28) * size, s: s.trim() }]);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = { id: nid(), t: "draw", color, w: strokeFor(tool), pts: [p.x, p.y] };
    paintLive();
  }

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

  function move(e: React.PointerEvent) {
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
    const d = drawing.current;
    if (!d) return;
    drawing.current = null;
    paintLive();
    apply([...shapes, d]);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-paper" role="dialog" aria-modal="true" aria-label="Annotate answer">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2.5">
        {(["pen", "highlight", "text", "erase"] as Tool[]).map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            aria-pressed={tool === t}
            className={cn(
              "h-9 rounded-md border px-3 text-sm font-semibold capitalize",
              tool === t ? "border-brand bg-brand text-on-brand" : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2",
            )}
          >
            {t}
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            aria-label={`Colour ${c}`}
            aria-pressed={color === c}
            className={cn("h-7 w-7 rounded-full border-2", color === c ? "border-ink ring-2 ring-brand" : "border-border")}
            style={{ background: c }}
          />
        ))}
        <span className="mx-1 h-6 w-px bg-border" />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Size
          <input type="range" min={0.5} max={3} step={0.5} value={size} onChange={(e) => setSize(+e.target.value)} className="w-24" />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => apply(shapes.slice(0, -1))} disabled={!shapes.length}>
            Undo
          </Button>
          <Button variant="secondary" size="sm" onClick={() => apply([])} disabled={!shapes.length}>
            Clear
          </Button>
          <span className="text-xs text-ink-3">Saved automatically</span>
          <button onClick={onClose} aria-label="Close annotator" className="flex h-9 w-9 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
            <Icon.Close className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="relative mx-auto w-fit" style={{ maxWidth: "100%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Student answer"
            onLoad={(e) => setDim({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            className="block max-h-[82dvh] w-auto max-w-full select-none rounded-md bg-surface-2"
            draggable={false}
          />
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
                <Shape
                  key={s.id}
                  s={s}
                  onErase={tool === "erase" ? () => apply(shapes.filter((x) => x.id !== s.id)) : undefined}
                />
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
      </div>
    </div>,
    document.body,
  );
}
