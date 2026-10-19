"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { track, type LevelName, type SubjectName } from "@/lib/landing";
import { BookingFlow } from "./BookingFlow";

type OpenArgs = { subject?: SubjectName; level?: LevelName; from: string };
const Ctx = createContext<{ open: (args: OpenArgs) => void } | null>(null);

/** Opens the booking calendar from any button on the public pages. */
export function useBooking() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("BookingProvider missing");
  return ctx;
}

export function BookingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OpenArgs | null>(null);
  // Bumped on every open so the flow starts fresh with the new pre-selection.
  const [run, setRun] = useState(0);
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const open = useCallback((args: OpenArgs) => {
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    setState(args);
    setRun((n) => n + 1);
    track("book_open", { from: args.from });
  }, []);

  const close = useCallback(() => {
    setState(null);
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && dialogRef.current) {
        const nodes = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input:not([type=radio]), input[type=radio]:checked, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const id = setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("button")?.focus(), 30);
    return () => {
      clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [state, close]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {state && (
        <div
          className="landing-portal fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(0,0,0,0.7)] backdrop-blur-sm sm:items-center sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="booking-title"
            className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-[24px] border border-hairline bg-card sm:rounded-[24px]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-5 md:px-8">
              <div>
                <h2 id="booking-title" className="text-xl font-bold text-foreground md:text-2xl">
                  Book your free trial lesson
                </h2>
                <p className="mt-1 text-[15px] text-muted-foreground">Pick what suits you. I confirm on WhatsApp.</p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-faint hover:bg-card-raised hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M2 2l10 10M12 2L2 12" />
                </svg>
              </button>
            </div>
            <div
              className="overflow-y-auto overscroll-contain px-6 py-6 md:px-8"
              style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
            >
              <BookingFlow key={run} subject={state.subject} level={state.level} from={state.from} />
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** A button that opens the calendar. Styling comes from the caller. */
export function BookButton({
  from,
  subject,
  level,
  className,
  children,
}: {
  from: string;
  subject?: SubjectName;
  level?: LevelName;
  className?: string;
  children: ReactNode;
}) {
  const { open } = useBooking();
  return (
    <button type="button" onClick={() => open({ from, subject, level })} className={className}>
      {children}
    </button>
  );
}
