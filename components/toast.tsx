"use client";

import { createContext, useCallback, useContext, useState } from "react";
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = "default", action?: ToastAction) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, tone, action }]);
    // A toast with an action (Undo) stays a little longer, so there's time to tap it.
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 7000 : 3600);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
    </ToastContext.Provider>
  );
}

const toneStyles: Record<ToastTone, string> = {
  default: "border-border-strong bg-surface text-ink",
  success: "border-success bg-success-soft text-success",
  error: "border-error bg-error-soft text-error",
  info: "border-info bg-info-soft text-info",
};

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    // Sits above the phone menu dock and the test's Back/Next bar, so a
    // message never covers a button someone is about to tap.
    <div
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ bottom: "calc(6.5rem + env(safe-area-inset-bottom))" }}
      role="region"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex w-full max-w-sm animate-slide-in items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-[var(--shadow-md)] ${toneStyles[t.tone]}`}
        >
          <button onClick={() => onDismiss(t.id)} className="flex-1 text-left">
            {t.message}
          </button>
          {t.action && (
            <button
              onClick={() => {
                t.action!.onClick();
                onDismiss(t.id);
              }}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-bold underline-offset-4 hover:underline"
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
