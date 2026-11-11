"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui";
import { loadPdfJs } from "@/lib/notes-client";

/**
 * A PDF reader inside the portal: every page drawn on the page itself, with
 * zoom that works everywhere (trackpad pinch on Mac and Windows, Safari's
 * gesture zoom, two-finger pinch on phones, and the +/− buttons).
 *
 * PDF.js comes from cdnjs, only when a PDF is opened, so the portal itself
 * carries none of its weight. If it can't load, `onFail` falls back.
 *
 * Long notes open as soon as page 1 is in: the other pages are laid out at
 * page 1's size and fetched only when they come near the screen. Pages that
 * scroll far away give their drawing memory back, which keeps iPhone Safari
 * from running out of memory on a 60-page handout.
 */
const MIN = 0.5;
const MAX = 4;

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy?: () => Promise<void> };
type TextItem = { str: string; transform: number[]; width: number };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number; transform: number[] };
  getTextContent: () => Promise<{ items: TextItem[] }>;
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void>; cancel: () => void };
};

const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z));

/** A highlighted word on a page, in fractions of the page's size. */
type Mark = { l: number; t: number; w: number; h: number };

/** A spot of the document (page and position on it) and where on the screen it sits. */
type Anchor = { i: number; fx: number; fy: number; sx: number; sy: number };

type Props = {
  url: string;
  /** The reader's sign-in, sent with the file request (a student's note link only opens with it). */
  authToken?: string;
  onFail: () => void;
  /** Open at this page (from a search result, or where they left off). */
  startPage?: number;
  /** Words to mark in yellow (from a search). */
  highlight?: string[];
  /** Told the page in view, for "Continue reading". */
  onPage?: (page: number, pages: number) => void;
  /** Take the keyboard once the file is open, so arrows, Space and Page Down scroll it. */
  autoFocus?: boolean;
};

export function PdfView(props: Props) {
  // A different file starts a fresh reader, so nothing drawn for the last one lingers.
  return <PdfReader key={props.url} {...props} />;
}

function PdfReader({ url, authToken, onFail, startPage, highlight, onPage, autoFocus }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  // Page sizes at scale 1. Until a page is fetched it borrows page 1's size.
  const [sizes, setSizes] = useState<Array<{ w: number; h: number }>>([]);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  // Pages are redrawn sharply a moment after zooming stops; until then CSS scales them.
  const [drawZoom, setDrawZoom] = useState(1);
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);
  // Pages near the screen (only these are drawn, so long notes stay light on phones).
  const [near, setNear] = useState<Set<number>>(() => {
    const s = Math.max(1, Math.floor(startPage ?? 1)) - 1;
    return new Set(s > 0 ? [s - 1, s, s + 1] : [0, 1]);
  });
  const [page, setPage] = useState(1);
  const drawn = useRef(new Map<number, number>()); // page index -> size it was drawn at
  const tasks = useRef(new Map<number, { cancel: () => void; key: number }>()); // drawings in progress, and the size they're for
  const pageRef = useRef(1);
  const pagesRef = useRef(0);
  const toldRef = useRef(0);
  const utilRef = useRef<{ transform: (a: number[], b: number[]) => number[] } | null>(null);
  const [marks, setMarks] = useState<Record<number, Mark[]>>({});
  const marked = useRef(new Set<number>());
  const started = useRef(false);
  // The spot to keep still on screen through the next change of size (zoom, or the phone turning).
  const anchor = useRef<Anchor | null>(null);
  const [slow, setSlow] = useState(false);

  // The callers' handlers are read through refs: a new inline function on their
  // side must not reload the file or lose the page.
  const onFailRef = useRef(onFail);
  const onPageRef = useRef(onPage);
  useEffect(() => {
    onFailRef.current = onFail;
    onPageRef.current = onPage;
  }, [onFail, onPage]);

  // Load PDF.js, the file and page 1 (enough to show the reader).
  useEffect(() => {
    let alive = true;
    let loading: { destroy?: () => Promise<void> } | null = null;
    let loaded: PdfDoc | null = null;
    // A long note on a slow connection: say it is still coming.
    const slowTimer = setTimeout(() => alive && setSlow(true), 7000);
    void (async () => {
      try {
        const lib = await loadPdfJs();
        if (!alive) return;
        utilRef.current = lib.Util;
        // PDF.js sends the header with every request for the file. Built apart
        // from the call because the shared PdfLib type only lists url and data.
        const source: { url: string; httpHeaders?: Record<string, string> } = authToken ? { url, httpHeaders: { Authorization: `Bearer ${authToken}` } } : { url };
        const task = lib.getDocument(source);
        loading = task;
        const d = (await task.promise) as unknown as PdfDoc;
        loaded = d;
        if (!alive) return;
        const first = (await d.getPage(1)).getViewport({ scale: 1 });
        if (!alive) return;
        pagesRef.current = d.numPages;
        setSizes(Array.from({ length: d.numPages }, () => ({ w: first.width, h: first.height })));
        setDoc(d);
      } catch (e) {
        if (!alive) return;
        console.error("[pdf] load", e);
        onFailRef.current();
      } finally {
        clearTimeout(slowTimer);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(slowTimer);
      // Closed while still downloading: stop the download too, not only a finished file.
      void (loaded?.destroy?.() ?? loading?.destroy?.())?.catch(() => {});
    };
  }, [url, authToken]);

  // Closing the reader: give every page's drawing memory back straight away,
  // and remember the page even when it closes right after a scroll.
  useEffect(() => {
    const list = canvases;
    const running = tasks;
    return () => {
      running.current.forEach((t) => t.cancel());
      running.current.clear();
      list.current.forEach((c) => {
        if (c) {
          c.width = 0;
          c.height = 0;
        }
      });
      if (toldRef.current && pageRef.current !== toldRef.current && pagesRef.current) onPageRef.current?.(pageRef.current, pagesRef.current);
    };
  }, []);

  /** The spot of the document under a point of the reader (its centre when no point is given). */
  const anchorAt = useCallback((clientX?: number, clientY?: number): Anchor | null => {
    const el = box.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const sx = clientX === undefined ? r.width / 2 : clientX - r.left;
    const sy = clientY === undefined ? r.height / 2 : clientY - r.top;
    let best: { i: number; pr: DOMRect } | null = null;
    for (let i = 0; i < canvases.current.length; i++) {
      const w = canvases.current[i]?.parentElement;
      if (!w) continue;
      const pr = w.getBoundingClientRect();
      if (best && pr.top > r.top + sy) break;
      best = { i, pr };
    }
    if (!best || !best.pr.width || !best.pr.height) return null;
    return { i: best.i, fx: (r.left + sx - best.pr.left) / best.pr.width, fy: (r.top + sy - best.pr.top) / best.pr.height, sx, sy };
  }, []);

  // Fit-to-width base size follows the window. When the phone is turned the
  // pages change height, so the part of the note at the top is held in place.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.min(el.clientWidth - 24, 1000);
      if (w === widthRef.current) return;
      if (widthRef.current) anchor.current = anchorAt(undefined, el.getBoundingClientRect().top + 1) ?? anchor.current;
      widthRef.current = w;
      setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchorAt]);

  // After a zoom or a turn of the phone: put the held spot back where it was on screen.
  // Done before the browser paints, so the page never jumps and settles.
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = box.current;
    anchor.current = null;
    const w = a ? canvases.current[a.i]?.parentElement : null;
    if (!a || !el || !w) return;
    const r = el.getBoundingClientRect();
    const pr = w.getBoundingClientRect();
    el.scrollLeft += pr.left + a.fx * pr.width - (r.left + a.sx);
    el.scrollTop += pr.top + a.fy * pr.height - (r.top + a.sy);
  }, [zoom, width]);

  useEffect(() => {
    const t = setTimeout(() => setDrawZoom(zoom), 250);
    return () => clearTimeout(t);
  }, [zoom]);

  // Watch which pages are on (or near) the screen, and which one is in view.
  useEffect(() => {
    const root = box.current;
    if (!doc || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        setNear((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const i = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(i);
            else next.delete(i);
          }
          return next;
        });
      },
      { root, rootMargin: "100% 0px" },
    );
    canvases.current.forEach((c) => c && io.observe(c));
    return () => io.disconnect();
  }, [doc, sizes.length]);

  // The page in view: the last one whose top is above a third of the way down the screen.
  useEffect(() => {
    const el = box.current;
    // Wait for the pages to be laid out, or every page looks "above the fold".
    if (!doc || !el || !width) return;
    const onScroll = () => {
      const mark = el.scrollTop + el.clientHeight * 0.35;
      let p = 1;
      canvases.current.forEach((c, i) => {
        const w = c?.parentElement;
        if (w && w.offsetTop <= mark) p = i + 1;
      });
      // At the very end the last page counts as reached, even when it is too short to climb that high.
      if (el.scrollTop > 0 && el.scrollTop + el.clientHeight >= el.scrollHeight - 2) p = canvases.current.length || p;
      pageRef.current = p;
      setPage(p);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [doc, sizes.length, width]);

  // Draw the nearby pages at the settled zoom; release the ones that moved away.
  useEffect(() => {
    if (!doc || !width) return;
    let alive = true;
    for (const i of new Set([...drawn.current.keys(), ...tasks.current.keys()])) {
      if (near.has(i)) continue;
      tasks.current.get(i)?.cancel();
      tasks.current.delete(i);
      drawn.current.delete(i);
      const c = canvases.current[i];
      if (c) {
        c.width = 0;
        c.height = 0;
      }
    }
    void (async () => {
      // Phones have three screen dots to a point: draw for them, so small text stays crisp.
      // Wide screens stop at two, where a page is already several megapixels.
      const dpr = Math.min(window.devicePixelRatio || 1, width < 600 ? 3 : 2);
      // Keep each canvas small enough that phones never run out of canvas memory
      // (tighter on touch devices, which have the least to spare).
      const maxPixels = window.matchMedia?.("(pointer: coarse)").matches ? 8_000_000 : 16_000_000;
      const key = drawZoom * width;
      // The page in view first, then outwards from it.
      const here = (started.current ? pageRef.current : startPage || 1) - 1;
      for (const i of [...near].sort((a, b) => Math.abs(a - here) - Math.abs(b - here) || a - b)) {
        if (!alive) return;
        if (drawn.current.get(i) === key) continue;
        // Already being drawn at this size: let it finish rather than start again.
        if (tasks.current.get(i)?.key === key) continue;
        const c = canvases.current[i];
        if (!c) continue;
        const pg = await doc.getPage(i + 1).catch(() => null);
        if (!alive) return;
        if (!pg) continue;
        const base = pg.getViewport({ scale: 1 });
        // Now its real size is known: correct the borrowed one if it differs.
        setSizes((prev) => {
          const was = prev[i];
          if (!was || (Math.abs(was.w - base.width) < 0.5 && Math.abs(was.h - base.height) < 0.5)) return prev;
          const next = prev.slice();
          next[i] = { w: base.width, h: base.height };
          return next;
        });
        const fit = width / base.width;
        const scale = Math.min(fit * drawZoom * dpr, Math.sqrt(maxPixels / (base.width * base.height)));
        const vp = pg.getViewport({ scale });
        tasks.current.get(i)?.cancel();
        // A page already showing keeps its drawing until the sharper one is ready,
        // so zooming never flashes the page white.
        const redo = drawn.current.has(i) && c.width > 0;
        const target = redo ? document.createElement("canvas") : c;
        target.width = Math.floor(vp.width);
        target.height = Math.floor(vp.height);
        const ctx = target.getContext("2d");
        if (!ctx) continue;
        let task: { promise: Promise<void>; cancel: () => void };
        try {
          task = pg.render({ canvasContext: ctx, viewport: vp });
        } catch {
          continue;
        }
        const entry = { cancel: task.cancel.bind(task), key };
        tasks.current.set(i, entry);
        const ok = await task.promise.then(
          () => true,
          () => false,
        );
        // Released (scrolled away) or replaced by a newer drawing while this one ran: it doesn't count.
        const mine = tasks.current.get(i) === entry;
        if (mine) tasks.current.delete(i);
        if (redo) {
          if (ok && mine && c.width > 0) {
            c.width = target.width;
            c.height = target.height;
            c.getContext("2d")?.drawImage(target, 0, 0);
          }
          target.width = 0;
          target.height = 0;
        }
        if (ok && mine && c.width > 0) drawn.current.set(i, key);
      }
    })();
    return () => {
      alive = false;
    };
  }, [doc, width, drawZoom, near, startPage]);

  // Open at the asked-for page once the reader is laid out.
  useEffect(() => {
    if (!doc || !width || started.current) return;
    started.current = true;
    const i = Math.min(Math.max(1, Math.floor(startPage ?? 1)), sizes.length) - 1;
    if (i <= 0) return;
    requestAnimationFrame(() => {
      const c = canvases.current[i];
      if (c && box.current) box.current.scrollTop = (c.parentElement?.offsetTop ?? c.offsetTop) - 12;
    });
  }, [doc, width, startPage, sizes.length]);

  // The keyboard goes to the pages, so arrows, Space and Page Down scroll them.
  useEffect(() => {
    if (doc && autoFocus) box.current?.focus({ preventScroll: true });
  }, [doc, autoFocus]);

  // Tell the page in view (a moment after scrolling stops).
  const hasOnPage = !!onPage;
  useEffect(() => {
    if (!doc || !hasOnPage) return;
    const t = setTimeout(() => {
      toldRef.current = page;
      onPageRef.current?.(page, sizes.length);
    }, 600);
    return () => clearTimeout(t);
  }, [doc, page, sizes.length, hasOnPage]);

  // Find the searched words on the pages near the screen and mark them.
  const terms = (highlight ?? []).map((w) => w.toLowerCase()).filter((w) => w.length >= 2);
  const termKey = terms.join(" ");
  useEffect(() => {
    if (!doc || !termKey) return;
    const want = termKey.split(" ");
    let alive = true;
    void (async () => {
      for (const i of near) {
        if (!alive) return;
        if (marked.current.has(i)) continue;
        marked.current.add(i);
        const pg = await doc.getPage(i + 1).catch(() => null);
        const util = utilRef.current;
        if (!pg || !util) continue;
        const vp = pg.getViewport({ scale: 1 });
        const { items } = await pg.getTextContent().catch(() => ({ items: [] as TextItem[] }));
        // Scrolled on while this page was being read: leave it to the next pass, or its words would never be marked.
        if (!alive) {
          marked.current.delete(i);
          return;
        }
        const found: Mark[] = [];
        for (const it of items) {
          const low = it.str.toLowerCase();
          if (!low || !it.width) continue;
          const tx = util.transform(vp.transform, it.transform);
          const fh = Math.hypot(tx[2], tx[3]);
          for (const w of want) {
            let at = low.indexOf(w);
            while (at !== -1) {
              const x = tx[0] >= 0 ? tx[4] : tx[4] - it.width;
              found.push({
                l: (x + (it.width * at) / low.length) / vp.width,
                t: (tx[5] - fh * 0.92) / vp.height,
                w: ((it.width * w.length) / low.length) / vp.width,
                h: (fh * 1.18) / vp.height,
              });
              at = low.indexOf(w, at + w.length);
            }
          }
        }
        if (found.length) setMarks((m) => ({ ...m, [i]: found }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [doc, near, termKey]);

  /** Zoom around a point on screen, keeping that spot under the fingers. */
  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const next = clamp(zoomRef.current * factor);
      if (next === zoomRef.current) return;
      anchor.current = anchorAt(clientX, clientY) ?? anchor.current;
      zoomRef.current = next;
      setZoom(next);
    },
    [anchorAt],
  );
  const fitWidth = useCallback(() => {
    if (zoomRef.current === 1) return;
    anchor.current = anchorAt() ?? anchor.current;
    zoomRef.current = 1;
    setZoom(1);
  }, [anchorAt]);

  // Trackpad pinch (Chrome, Edge, Firefox send ctrl+wheel), Safari gestures, phone pinch.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    // Fingers on the glass. iPhones and iPads report a pinch twice, as touches and
    // as a "gesture": only the touches are used there, or it would zoom twice as fast.
    let fingers = 0;
    let gestureStart = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (fingers > 0) return;
      const ge = e as Event & { scale: number; clientX?: number; clientY?: number };
      zoomAt(ge.scale / gestureStart, ge.clientX, ge.clientY);
      gestureStart = ge.scale;
    };
    let pinch: { d: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      fingers = e.touches.length;
      pinch = e.touches.length === 2 ? { d: dist(e.touches) } : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const d = dist(e.touches);
      if (pinch.d > 0 && d > 0) zoomAt(d / pinch.d, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      pinch.d = d;
    };
    const onTouchEnd = (e: TouchEvent) => {
      fingers = e.touches.length;
      pinch = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [zoomAt]);

  const btn = "flex h-11 w-11 items-center justify-center rounded-full text-lg font-semibold text-ink hover:bg-surface-2 disabled:opacity-40";
  return (
    <div className="relative h-full w-full">
      <div
        ref={box}
        // Focusable, so the keyboard can scroll the pages.
        tabIndex={0}
        role="group"
        aria-label="Pages"
        className="h-full w-full overflow-auto overscroll-contain outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/50"
        style={{ touchAction: "pan-x pan-y" }}
      >
        {!doc ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center" role="status">
            <Spinner size={28} className="text-ink-3" />
            <span className="sr-only">Loading</span>
            {slow && <span className="max-w-xs text-sm text-ink-3">Still loading. A long file can take a little while on a slow connection.</span>}
          </div>
        ) : (
          <div className="mx-auto flex flex-col items-center gap-3 py-3" style={{ width: width * zoom + 24 }}>
            {sizes.map((s, i) => (
              <div key={i} className="relative" style={{ width: width * zoom, height: (width * zoom * s.h) / s.w }}>
                <canvas
                  data-page={i}
                  ref={(c) => {
                    canvases.current[i] = c;
                  }}
                  className="block h-full w-full rounded-sm bg-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]"
                />
                {marks[i]?.map((m, k) => (
                  <span
                    key={k}
                    aria-hidden
                    className="pointer-events-none absolute rounded-[2px] bg-brand/45 mix-blend-multiply"
                    style={{ left: `${m.l * 100}%`, top: `${m.t * 100}%`, width: `${m.w * 100}%`, height: `${m.h * 100}%` }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      {doc && (
        <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-paper/90 p-1 shadow-lg backdrop-blur-xl">
          <span className="whitespace-nowrap pl-3 pr-1 text-xs tabular-nums text-ink-2">
            <span className="sr-only">
              Page {page} of {sizes.length}
            </span>
            <span aria-hidden>
              {page} / {sizes.length}
            </span>
          </span>
          <button type="button" className={btn} onClick={() => zoomAt(1 / 1.25)} disabled={zoom <= MIN} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={fitWidth} className="h-11 min-w-16 rounded-full px-2 text-sm font-semibold tabular-nums text-ink-2 hover:bg-surface-2" aria-label={`Zoom ${Math.round(zoom * 100)}%. Fit to width`}>
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className={btn} onClick={() => zoomAt(1.25)} disabled={zoom >= MAX} aria-label="Zoom in">
            +
          </button>
        </div>
      )}
    </div>
  );
}
