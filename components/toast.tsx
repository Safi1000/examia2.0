"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type ToastTone = "default" | "success" | "error" | "info";

/** An optional one-tap action on a toast, e.g. Undo. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

// More than this and the oldest goes, so a burst of saves cannot stack up the screen.
const MAX_TOASTS = 3;

/** How long a toast stays: longer for errors and long messages, so they can be read. */
function displayMs(message: string, tone: ToastTone, action?: ToastAction): number {
  // A toast with an action (Undo) stays a little longer, so there's time to tap it.
  const base = action ? 7000 : tone === "error" ? 6000 : 3600;
  return Math.min(10000, Math.max(base, 2000 + message.length * 45));
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Measured as the toast is raised, so it appears in the right place at once instead of moving.
  const [lift, setLift] = useState(0);

  const toast = useCallback((message: string, tone: ToastTone = "default", action?: ToastAction) => {
    const id = nextId++;
    setLift(avoidLift());
    setToasts((t) => [...t, { id, message, tone, action }].slice(-MAX_TOASTS));
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), displayMs(message, tone, action));
  }, []);

  // A stable value: showing a toast re-renders the toasts, not every screen that uses useToast.
  const value = useMemo(() => ({ toast }), [toast]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} lift={lift} onLift={setLift} />
    </ToastContext.Provider>
  );
}

const toneStyles: Record<ToastTone, string> = {
  default: "border-border-strong bg-surface text-ink",
  success: "border-success bg-success-soft text-success",
  error: "border-error bg-error-soft text-error",
  info: "border-info bg-info-soft text-info",
};

// The usual resting place: above the phone menu dock and the test's Back/Next bar.
const BASE_BOTTOM = "calc(6.5rem + env(safe-area-inset-bottom))";

/**
 * How far up the toasts must sit to clear anything pinned to the bottom of the
 * screen that marks itself `data-toast-avoid` (the bar that appears once rows
 * are ticked, a sticky action bar). 0 when nothing is there.
 */
function avoidLift(): number {
  if (typeof window === "undefined") return 0;
  const vh = window.innerHeight;
  let lift = 0;
  document.querySelectorAll<HTMLElement>("[data-toast-avoid]").forEach((el) => {
    const r = el.getBoundingClientRect();
    // Only something on screen and resting in the lower part of it.
    if (!r.width || !r.height || r.bottom < vh * 0.5 || r.top > vh) return;
    lift = Math.max(lift, vh - r.top + 12);
  });
  return Math.round(lift);
}

function ToastViewport({
  toasts,
  onDismiss,
  lift,
  onLift,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
  lift: number;
  onLift: (px: number) => void;
}) {
  const showing = toasts.length > 0;

  // While a toast is up, keep it clear of bottom bars as the page scrolls or resizes.
  useEffect(() => {
    if (!showing) return;
    const measure = () => onLift(avoidLift());
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [showing, onLift]);

  if (typeof document === "undefined") return null;
  return createPortal(
    // Sits above the phone menu dock and the test's Back/Next bar, and above any
    // bar marked data-toast-avoid, so a message never covers a button someone
    // is about to tap.
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ bottom: lift ? `max(${BASE_BOTTOM}, ${lift}px)` : BASE_BOTTOM }}
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-sm animate-toast-in items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-[var(--shadow-md)] ${toneStyles[t.tone]}`}
        >
          <button type="button" onClick={() => onDismiss(t.id)} className="min-h-6 flex-1 text-left">
            {t.message}
          </button>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.onClick();
                onDismiss(t.id);
              }}
              className="-my-1.5 -mr-1.5 inline-flex min-h-11 shrink-0 items-center rounded-lg px-3 text-sm font-bold underline-offset-4 transition-colors hover:bg-white/[0.06] hover:underline"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>,
    document.body,
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
