"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui";

/**
 * A PDF reader inside the portal: every page drawn on the page itself, with
 * zoom that works everywhere (trackpad pinch on Mac and Windows, Safari's
 * gesture zoom, two-finger pinch on phones, and the +/− buttons).
 *
 * PDF.js comes from cdnjs, only when a PDF is opened, so the portal itself
 * carries none of its weight. If it can't load, `onFail` falls back.
 */
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";
const MIN = 0.5;
const MAX = 4;

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
};

const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z));

export function PdfView({ url, onFail }: { url: string; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [sizes, setSizes] = useState<Array<{ w: number; h: number }>>([]);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  // Pages are redrawn sharply a moment after zooming stops; until then CSS scales them.
  const [drawZoom, setDrawZoom] = useState(1);
  const canvases = useRef<Array<HTMLCanvasElement | null>>([]);

  // Load PDF.js and the file.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const lib = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ PDFJS)) as {
          GlobalWorkerOptions: { workerSrc: string };
          getDocument: (o: { url: string }) => { promise: Promise<PdfDoc> };
        };
        lib.GlobalWorkerOptions.workerSrc = WORKER;
        const d = await lib.getDocument({ url }).promise;
        const pages = await Promise.all(Array.from({ length: d.numPages }, (_, i) => d.getPage(i + 1)));
        if (!alive) return;
        setSizes(pages.map((p) => {
          const v = p.getViewport({ scale: 1 });
          return { w: v.width, h: v.height };
        }));
        setDoc(d);
      } catch (e) {
        console.error("[pdf] load", e);
        if (alive) onFail();
      }
    })();
    return () => {
      alive = false;
    };
  }, [url, onFail]);

  // Fit-to-width base size follows the window.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(el.clientWidth - 24, 1000)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDrawZoom(zoom), 250);
    return () => clearTimeout(t);
  }, [zoom]);

  // Draw (or redraw) every page at the settled zoom.
  useEffect(() => {
    if (!doc || !width) return;
    let alive = true;
    void (async () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      for (let i = 0; i < doc.numPages && alive; i++) {
        const page = await doc.getPage(i + 1);
        const c = canvases.current[i];
        if (!c || !alive) continue;
        const fit = width / page.getViewport({ scale: 1 }).width;
        const vp = page.getViewport({ scale: fit * drawZoom * dpr });
        c.width = vp.width;
        c.height = vp.height;
        const ctx = c.getContext("2d");
        if (ctx) await page.render({ canvasContext: ctx, viewport: vp }).promise.catch(() => {});
      }
    })();
    return () => {
      alive = false;
    };
  }, [doc, width, drawZoom]);

  /** Zoom around a point on screen, keeping that spot under the fingers. */
  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const el = box.current;
    setZoom((z) => {
      const next = clamp(z * factor);
      if (el && next !== z) {
        const r = el.getBoundingClientRect();
        const x = (clientX ?? r.left + r.width / 2) - r.left + el.scrollLeft;
        const y = (clientY ?? r.top + r.height / 2) - r.top + el.scrollTop;
        const k = next / z;
        requestAnimationFrame(() => {
          el.scrollLeft = x * k - ((clientX ?? r.left + r.width / 2) - r.left);
          el.scrollTop = y * k - ((clientY ?? r.top + r.height / 2) - r.top);
        });
      }
      return next;
    });
  }, []);

  // Trackpad pinch (Chrome, Edge, Firefox send ctrl+wheel), Safari gestures, phone pinch.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    let gestureStart = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      zoomAt(ge.scale / gestureStart, ge.clientX, ge.clientY);
      gestureStart = ge.scale;
    };
    let pinch: { d: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) pinch = { d: dist(e.touches) };
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const d = dist(e.touches);
      zoomAt(d / pinch.d, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      pinch.d = d;
    };
    const onTouchEnd = () => {
      pinch = null;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart);
    el.addEventListener("gesturechange", onGestureChange);
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [zoomAt]);

  const btn = "flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold text-ink hover:bg-surface-2";
  return (
    <div className="relative h-full w-full">
      <div ref={box} className="h-full w-full overflow-auto overscroll-contain" style={{ touchAction: "pan-x pan-y" }}>
        {!doc ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size={28} className="text-ink-3" />
          </div>
        ) : (
          <div className="mx-auto flex flex-col items-center gap-3 py-3" style={{ width: width * zoom + 24 }}>
            {sizes.map((s, i) => (
              <canvas
                key={i}
                ref={(c) => {
                  canvases.current[i] = c;
                }}
                className="block rounded-sm bg-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]"
                style={{ width: width * zoom, height: (width * zoom * s.h) / s.w }}
              />
            ))}
          </div>
        )}
      </div>
      {doc && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-[#1d2023]/95 p-1 shadow-lg backdrop-blur">
          <button type="button" className={btn} onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom out">
            −
          </button>
          <button type="button" onClick={() => setZoom(1)} className="h-10 min-w-16 rounded-full px-2 text-sm font-semibold tabular-nums text-ink-2 hover:bg-surface-2" aria-label="Fit to width">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className={btn} onClick={() => zoomAt(1.25)} aria-label="Zoom in">
            +
          </button>
        </div>
      )}
    </div>
  );
}
