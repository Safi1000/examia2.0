"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isPaperImage, parseCrop, type Crop } from "@/lib/paper-builder";

/**
 * One past paper question cut out of its page image (see cropUrl in
 * lib/paper-builder.ts). Drawn as an SVG whose view box is the crop, so the
 * browser clips it exactly, whatever the screen or zoom, and nothing outside
 * it (the neighbouring questions, the page footer) can ever scroll into view.
 * A small paper white box covers the printed question number when the crop
 * could not simply start to its right. Nothing else on the page is touched.
 *
 * The space is kept at the picture's own shape while it loads (no jump), and
 * a picture that fails says so with a Try again button.
 */
export function PaperCrop({
  crop,
  alt,
  onLoad,
}: {
  crop: Crop;
  alt: string;
  onLoad?: (el: Element) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const src = attempt ? `${crop.src}?retry=${attempt}` : crop.src;
  const [state, setState] = useState<{ src: string; status: "loading" | "ready" | "failed" }>({ src, status: "loading" });
  const status = state.src === src ? state.status : "loading";
  const svgRef = useRef<SVGSVGElement>(null);
  const onLoadRef = useRef(onLoad);
  useEffect(() => {
    onLoadRef.current = onLoad;
  });
  useEffect(() => {
    if (status === "ready" && svgRef.current) onLoadRef.current?.(svgRef.current);
  }, [status]);

  useEffect(() => {
    let live = true;
    const im = new Image();
    im.decoding = "async";
    im.onload = () => live && setState({ src, status: "ready" });
    im.onerror = () => live && setState({ src, status: "failed" });
    im.src = src;
    return () => {
      live = false;
    };
  }, [src]);

  const w = crop.r - crop.l;
  const h = (crop.b - crop.t) * crop.ratio;
  const box = { aspectRatio: `${w} / ${h}` };

  if (status === "failed")
    return (
      <div role="alert" className="flex w-full flex-col items-center justify-center gap-2 bg-surface-2 px-4 py-6 text-center" style={{ ...box, minHeight: "8rem" }}>
        <p className="text-sm text-ink-2">This picture didn&apos;t load. Check your internet.</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAttempt((n) => n + 1);
          }}
          className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 text-sm font-semibold text-ink"
        >
          Try again
        </button>
      </div>
    );

  return (
    // A little paper white around the question, so its first letters never touch the edge.
    <div className="w-full bg-white px-2 py-1.5">
    <div className="relative w-full" style={box}>
      {status === "loading" ? (
        <div className="skeleton absolute inset-0" aria-label="Loading the question" />
      ) : (
        <svg
          viewBox={`${crop.l} ${crop.t * crop.ratio} ${w} ${h}`}
          preserveAspectRatio="xMidYMin meet"
          role="img"
          aria-label={alt}
          className="absolute inset-0 block h-full w-full"
          ref={svgRef}
        >
          <image href={src} x={0} y={0} width={1} height={crop.ratio} preserveAspectRatio="none" />
          {crop.cover && <rect x={crop.cover[0]} y={crop.cover[1] * crop.ratio} width={crop.cover[2]} height={crop.cover[3] * crop.ratio} fill="#fff" />}
        </svg>
      )}
    </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pictures saved before the crops were measured again
// ---------------------------------------------------------------------------

/** Old link → new link (null: not shown, e.g. an insert's cover page). Shared by every viewer. */
const fixed = new Map<string, string | null>();
const waiting = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

const needsFix = (url: string) => isPaperImage(url) && (!parseCrop(url) || parseCrop(url)!.legacy);

function request(urls: string[]) {
  for (const u of urls) if (needsFix(u) && !fixed.has(u)) waiting.add(u);
  if (!waiting.size || timer) return;
  timer = setTimeout(async () => {
    timer = null;
    const batch = [...waiting].slice(0, 300);
    for (const u of batch) waiting.delete(u);
    try {
      const res = await fetch("/api/paper-builder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "view", urls: batch }) });
      const body = res.ok ? ((await res.json()) as { urls?: Array<string | null> }) : null;
      batch.forEach((u, i) => fixed.set(u, body?.urls && i < body.urls.length ? body.urls[i] : u));
    } catch {
      // Offline: the old picture still shows.
      for (const u of batch) fixed.set(u, u);
    }
    version++;
    for (const l of listeners) l();
    if (waiting.size) request([]);
  }, 0);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * The links to show, with any older past paper picture swapped for its
 * measured crop (same question, printed number covered) and an insert's cover
 * page dropped. While the answer is on its way, `ready` is false.
 */
export function usePaperUrls(urls: string[]): { urls: string[]; ready: boolean } {
  useSyncExternalStore(subscribe, () => version, () => 0);
  const pending = urls.some((u) => needsFix(u) && !fixed.has(u));
  useEffect(() => {
    if (pending) request(urls);
  });
  if (!urls.some(needsFix)) return { urls, ready: true };
  return {
    urls: urls.flatMap((u) => {
      if (!needsFix(u)) return [u];
      const v = fixed.get(u);
      return v === undefined ? [u] : v === null ? [] : [v];
    }),
    ready: !pending,
  };
}
