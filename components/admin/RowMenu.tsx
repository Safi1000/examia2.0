"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export type RowMenuItem = {
  label: string;
  onSelect: () => void;
  /** Red text, for Delete. */
  danger?: boolean;
  disabled?: boolean;
  title?: string;
};

const MENU_W = 192; // w-48

/**
 * A row's "More" menu: a quiet three-dot button that opens a small list of
 * actions under it. Used to keep Delete away from a row's main action.
 * Closes on an outside click, Escape, scrolling and after a choice; focus
 * goes back to the button. Fixed to the screen, so a scrolling table never
 * clips it.
 */
export function RowMenu({ items, label = "More", className }: { items: RowMenuItem[]; label?: string; className?: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = pos !== null;

  const close = (refocus: boolean) => {
    setPos(null);
    if (refocus) btn.current?.focus();
  };

  const toggle = () => {
    if (open) return close(true);
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    const below = r.bottom + 4;
    // Near the bottom of the screen: open above the button instead.
    const room = window.innerHeight - below;
    const top = room < items.length * 44 + 16 ? Math.max(8, r.top - 4 - (items.length * 44 + 8)) : below;
    setPos({ top, left });
  };

  // Listeners only while open; state changes happen inside them, never in the effect body.
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setPos(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPos(null);
        btn.current?.focus();
      }
    };
    const onMove = () => setPos(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  const choose = (e: React.MouseEvent<HTMLButtonElement>) => {
    const item = items[Number(e.currentTarget.dataset.i)];
    close(true);
    item?.onSelect();
  };

  // Up and down move between the items; Tab closes.
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") return close(true);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const list = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? []);
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (at + 1) % list.length : (at - 1 + list.length) % list.length;
    list[next]?.focus();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink max-md:h-11 max-md:w-11 pointer-coarse:h-11 pointer-coarse:w-11",
          open && "bg-surface-2 text-ink",
          className,
        )}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>
      {pos && (
        <div
          ref={menu}
          id={id}
          role="menu"
          onKeyDown={onMenuKey}
          style={{ top: pos.top, left: pos.left, width: MENU_W }}
          className="fixed z-50 overflow-hidden rounded-tile border border-hairline-strong bg-surface-2 py-1 shadow-[var(--shadow-lg)]"
        >
          {items.map((it, i) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              data-i={i}
              onClick={choose}
              disabled={it.disabled}
              title={it.title}
              className={cn(
                "flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold disabled:opacity-50",
                it.danger ? "text-error hover:bg-error-soft focus-visible:bg-error-soft" : "text-ink-2 hover:bg-white/[0.05] hover:text-ink focus-visible:bg-white/[0.05]",
                "focus-visible:outline-none",
              )}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
