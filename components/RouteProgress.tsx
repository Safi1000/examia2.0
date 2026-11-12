"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * A thin gold line across the top while the next page opens, so a tap always
 * shows it was heard. It starts on a click of an internal link, fills quickly
 * then slows, and finishes the moment the new page is on screen. Decorative.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timers = useRef<number[]>([]);
  const first = useRef(true);

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  const finish = useCallback(() => {
    clear();
    setState((s) => (s === "loading" ? "done" : s));
    timers.current.push(window.setTimeout(() => setState("idle"), 450));
  }, [clear]);

  useEffect(() => {
    // The click on a link, and whether it got through to the page. A guard such
    // as "Leave without saving?" stops the click before it reaches the link; the
    // line then never starts, instead of creeping for 12s.
    let started: MouseEvent | null = null;
    let reached = false;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      started = e;
      reached = false;
      const from = location.pathname;
      // Decided once the click has finished its journey, so a stopped click
      // never shows the line at all (nor does a page that already opened).
      window.setTimeout(() => {
        if (started !== e || !reached || location.pathname !== from) return;
        clear();
        setState("loading");
        // Never left hanging if the page doesn't change after all.
        timers.current.push(window.setTimeout(finish, 12000));
      }, 0);
    };
    const onClickArrived = (e: MouseEvent) => {
      if (e === started) reached = true;
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("click", onClickArrived);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("click", onClickArrived);
    };
  }, [clear, finish]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    finish();
  }, [pathname, finish]);

  useEffect(() => clear, [clear]);

  if (state === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px]">
      <div
        className={`route-line h-full origin-left rounded-r-full bg-gradient-to-r from-brand/50 via-brand to-[#ffe0a3] shadow-[0_0_10px_rgba(251,193,89,0.55)] ${
          state === "loading" ? "route-fill" : "route-done"
        }`}
      />
    </div>
  );
}
