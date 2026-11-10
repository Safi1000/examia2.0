"use client";

import { useEffect, useRef, useState } from "react";
import { WORLDS, type WorldId } from "@/lib/groundwork-worlds";

/**
 * The Groundwork world picker, in the spirit of the iOS wallpaper picker: four
 * portrait stills in a row with a short name under each, the current one
 * ringed. No paragraphs; the full line about each world is its accessible
 * description. Opens with a small scale and fade (none with reduced motion),
 * closes on a pick, a tap outside it or Escape, and hands focus back to its
 * button (the one with aria-expanded next to it). One tab stop; arrow keys
 * move between worlds. Used on the Groundwork start screen and in the focus room.
 */
export function WorldPicker({
  current,
  onPick,
  onClose,
  placement = "above",
}: {
  current: WorldId;
  onPick: (id: WorldId) => void;
  onClose: () => void;
  /** "above": opens upward from a button at the bottom left. "below": opens downward from a button at the top right. */
  placement?: "above" | "below";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Parents pass a fresh onClose each render (the focus room re-renders every second),
  // so it lives in a ref: the open effect below runs once and never resets focus or the close timer.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const node = ref.current;
    // The button that opened it toggles it itself (closing here would open it again on the click).
    const toggle = node?.parentElement?.querySelector<HTMLButtonElement>("button[aria-expanded]");
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && !toggle?.contains(e.target as Node) && close.current();
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Handled: the focus room behind it stays open.
      e.preventDefault();
      close.current();
    };
    const t = setTimeout(() => document.addEventListener("pointerdown", away));
    const raf = requestAnimationFrame(() => setOpen(true));
    document.addEventListener("keydown", esc);
    ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
      if (closing.current) clearTimeout(closing.current);
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
      // Closed with focus inside it (a pick, Escape): focus goes back to the button that opened it.
      const at = document.activeElement;
      if (!at || at === document.body || node?.contains(at)) toggle?.focus({ preventScroll: true });
    };
  }, []);

  const pick = (id: WorldId) => {
    if (id !== current) onPick(id);
    // Let the ring land on the new world before the card closes.
    if (closing.current) clearTimeout(closing.current);
    closing.current = setTimeout(() => close.current(), 260);
  };

  // Arrow keys move between worlds, like any radio group.
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[role=radio]") ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    e.preventDefault();
    const step = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
    buttons[(i + step + buttons.length) % buttons.length]?.focus();
  };

  const above = placement === "above";

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Choose your world"
      className={`absolute z-20 w-[min(22.5rem,calc(100vw-2rem))] rounded-[26px] border border-white/[0.12] bg-[rgba(22,23,26,0.62)] p-3.5 text-left text-white shadow-[0_30px_80px_-24px_rgba(0,0,0,.85),inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-2xl backdrop-saturate-150 motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] ${
        above ? "bottom-full left-0 mb-2.5 origin-bottom-left" : "right-0 top-full mt-2.5 origin-top-right"
      } ${open ? "scale-100 opacity-100" : "scale-[0.96] opacity-0"}`}
    >
      <p className="px-1 pb-3 text-[13px] font-semibold tracking-[-0.01em] text-white/90">World</p>
      <div role="radiogroup" aria-label="World" onKeyDown={onKey} className="grid grid-cols-4 gap-2.5">
        {WORLDS.map((w) => {
          const on = w.id === current;
          const short = w.title.replace(/^The\s+/, "");
          return (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={w.title}
              aria-describedby={`world-${w.id}-line`}
              title={w.blurb}
              tabIndex={on ? 0 : -1}
              onClick={() => pick(w.id)}
              className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl outline-none"
            >
              <span
                className={`relative block aspect-[9/14] w-full overflow-hidden rounded-[14px] ring-offset-[3px] ring-offset-[rgb(22,23,26)] motion-safe:transition motion-safe:duration-200 group-active:scale-[0.96] group-focus-visible:ring-2 group-focus-visible:ring-white/70 ${
                  on ? "ring-2 ring-white" : "ring-1 ring-white/10 group-hover:ring-white/30"
                }`}
                style={{ background: w.sky }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={w.thumb}
                  alt=""
                  width={78}
                  height={121}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </span>
              <span className={`max-w-full truncate text-[12px] leading-none ${on ? "font-semibold text-white" : "font-medium text-white/60"}`}>
                {short}
              </span>
              <span id={`world-${w.id}-line`} className="sr-only">
                {w.blurb}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A small mountain in a frame: the world picker's button. */
export function WorldGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m3 17 6-7 4 4 3-2.5 5 5.5" />
      <path d="M16 7.5v3" />
      <path d="M16 7.5h2.2l-.6.8.6.8H16" />
    </svg>
  );
}
