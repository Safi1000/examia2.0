"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";

/**
 * Makes its child lean toward the cursor and spring back when the cursor
 * leaves. The outer span is a slightly larger catch area (12px around the
 * button), so the pull starts just before the cursor touches it.
 * Mouse and trackpad only; touch screens get the plain button.
 */
export function Magnetic({
  children,
  strength = 0.35,
  block = false,
  className = "",
}: {
  children: ReactNode;
  /** Share of the cursor's offset the button follows (0 to 1). */
  strength?: number;
  /** Full-width buttons: the wrapper stretches instead of hugging the button. */
  block?: boolean;
  className?: string;
}) {
  const inner = useRef<HTMLSpanElement>(null);
  const fine = useRef(false);

  useEffect(() => {
    fine.current = window.matchMedia("(pointer: fine)").matches;
  }, []);

  const onMove = (e: PointerEvent<HTMLSpanElement>) => {
    const el = inner.current;
    if (!fine.current || !el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width / 2)) * strength;
    const y = (e.clientY - (r.top + r.height / 2)) * strength * 1.3;
    el.style.transition = "transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)";
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  };

  const onLeave = () => {
    const el = inner.current;
    if (!el) return;
    el.style.transition = "transform 0.7s cubic-bezier(0.22, 1.5, 0.36, 1)";
    el.style.transform = "translate3d(0, 0, 0)";
  };

  return (
    <span
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`${block ? "flex w-full" : "inline-flex"} -m-3 p-3 ${className}`}
    >
      <span ref={inner} className={`${block ? "flex w-full" : "inline-flex"} will-change-transform`}>
        {children}
      </span>
    </span>
  );
}
