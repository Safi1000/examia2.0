"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Scroll animations for the public pages. Marks every [data-reveal] block
 * `.is-in` the first time enough of it is on screen; the styles
 * (app/globals.css, "Scroll reveals") do the rest: the block eases up into
 * place and anything inside it marked va-* plays once (bars fill, ticks appear,
 * lines draw).
 *
 * Positions are read directly on scroll (a handful of blocks, checked at most
 * every 60ms), not left to IntersectionObserver: that can stay silent in an
 * embedded or background tab, and a block that is never marked would stay
 * invisible. Sideways scrolling inside the swipe rows is caught too (capture).
 * Blocks already on screen when the page opens are marked before anything is
 * hidden, so nothing flickers.
 * Without JavaScript or with reduced motion, everything is simply there.
 */
export function Reveal() {
  const pathname = usePathname();
  useEffect(() => {
    const root = document.documentElement;
    let left = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const check = () => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      left = left.filter((b) => {
        const r = b.getBoundingClientRect();
        const on = r.top < vh * 0.9 && r.bottom > vh * 0.04 && r.left < vw * 0.86 && r.right > vw * 0.14;
        if (on) b.classList.add("is-in");
        return !on;
      });
      if (!left.length) stop();
    };
    let timer = 0;
    const onScroll = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        check();
      }, 60);
    };
    // A slow second look on a timer, until every block is in: scroll events are
    // not delivered everywhere (an embedded preview, a tab being restored), and
    // nothing may ever be left hidden because one was missed.
    const guard = window.setInterval(check, 500);
    const stop = () => {
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.clearInterval(guard);
    };
    check(); // what is already on screen is shown before anything is hidden
    root.classList.add("reveal-on");
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      stop();
      window.clearTimeout(timer);
      root.classList.remove("reveal-on");
    };
  }, [pathname]);
  return null;
}
