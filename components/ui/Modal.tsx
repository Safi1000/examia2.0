"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Every open dialog, oldest first. Only the one on top answers Escape and
// holds the Tab key, so a confirm box opened over a form closes on its own.
const openDialogs: object[] = [];

// The page scroll lock is counted, not saved and restored per dialog: two
// dialogs closing in the "wrong" order used to leave the page stuck unscrollable.
let scrollLocks = 0;
let overflowBefore = "";
function lockScroll() {
  if (scrollLocks === 0) {
    overflowBefore = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLocks += 1;
}
function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = overflowBefore;
}

// The last few focused elements. A field with autoFocus inside the dialog takes
// focus before the dialog's effect runs, so "what had focus when it opened" has
// to be looked up here, or focus could never go back to the opening button.
// Clicks and key presses are noted too, since focus events do not fire while
// the window itself is not focused.
const recentFocus: HTMLElement[] = [];
function remember(el: EventTarget | Element | null) {
  if (!(el instanceof HTMLElement) || recentFocus[recentFocus.length - 1] === el) return;
  recentFocus.push(el);
  if (recentFocus.length > 5) recentFocus.shift();
}
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => remember(e.target), true);
  document.addEventListener("click", () => remember(document.activeElement), true);
  document.addEventListener("keydown", () => remember(document.activeElement), true);
}
function openerOutside(panel: HTMLElement | null): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && !panel?.contains(active)) return active;
  for (let i = recentFocus.length - 1; i >= 0; i--) {
    const el = recentFocus[i];
    if (el.isConnected && !panel?.contains(el)) return el;
  }
  return null;
}

/**
 * Accessible dialog: Esc + backdrop close, focus moves in and stays in, scroll
 * locked. Near-full-screen on phones, centered card on larger screens.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const descId = useId();

  // Keep the latest onClose without making it an effect dependency — otherwise
  // a new inline onClose each parent render would re-run the effect and steal
  // focus back to the panel on every keystroke in a field inside the modal.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const token = {};
    openDialogs.push(token);
    const onTop = () => openDialogs[openDialogs.length - 1] === token;

    const onKey = (e: KeyboardEvent) => {
      if (!onTop()) return;
      if (e.key === "Escape") {
        // Something inside (a menu, a picker) may have used Escape for itself.
        if (!e.defaultPrevented) onCloseRef.current();
        return;
      }
      // Tab stays inside the dialog, and focus goes back where it was on close.
      const panel = panelRef.current;
      if (e.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        // Focus ended up behind the dialog (the focused button went away, or a
        // message outside was tapped): bring it back in.
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const panel = panelRef.current;
    const opener = openerOutside(panel);
    document.addEventListener("keydown", onKey);
    lockScroll();
    // A field inside that asked for focus (autoFocus) keeps it.
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      const at = openDialogs.indexOf(token);
      if (at !== -1) openDialogs.splice(at, 1);
      unlockScroll();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const sizeClass = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" }[size];

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-describedby={description ? descId : undefined}
    >
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-border bg-surface shadow-[var(--shadow-lg)] outline-none",
          // Phones: a sheet that rises from the bottom. Wider: a card that settles in place.
          "max-sm:animate-sheet-up sm:animate-scale-in sm:max-h-[88dvh] sm:rounded-xl",
          sizeClass,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-bold tracking-[-0.01em] text-ink">{title}</h2>
            {description && <p id={descId} className="mt-0.5 text-sm text-ink-2">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="-mr-2 -mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:bg-surface-2"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {/* overscroll-contain: reaching the end of the dialog never drags the page behind it (iOS). */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-paper/50 px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
