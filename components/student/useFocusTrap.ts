"use client";

import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps keyboard focus inside a full-screen dialog while it is open: focus
 * moves in when it opens (unless something inside already has it), Tab and
 * Shift+Tab wrap around inside it, and focus goes back to where it was when
 * the dialog closes.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!box.contains(document.activeElement)) box.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      // Anything actually drawn. (offsetParent is also null for a fixed-position
      // button, which left a pinned Close button out of the Tab loop.)
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
      if (!items.length) return;
      const head = items[0];
      const tail = items[items.length - 1];
      const active = document.activeElement;
      const outside = !box.contains(active);
      if (e.shiftKey && (active === head || active === box || outside)) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (active === tail || outside)) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before && before.isConnected) before.focus({ preventScroll: true });
    };
  }, [ref]);
}
