"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { VideoPlayer } from "./VideoPlayer";
import {
  submitLead,
  track,
  trialVideoFor,
  validatePhone,
  waLink,
  type LevelName,
  type SubjectName,
} from "@/lib/landing";

type OpenArgs = { subject: SubjectName; level: LevelName };
type Ctx = { open: (args: OpenArgs) => void };
const GateCtx = createContext<Ctx | null>(null);

export function useLeadGate() {
  const ctx = useContext(GateCtx);
  if (!ctx) throw new Error("LeadGate provider missing");
  return ctx;
}

export function LeadGateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<
    | { phase: "closed" }
    | { phase: "form"; subject: SubjectName; level: LevelName }
    | { phase: "video"; subject: SubjectName; level: LevelName }
  >({ phase: "closed" });
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const open = useCallback((args: OpenArgs) => {
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    setName("");
    setNumber("");
    setErr(null);
    setState({ phase: "form", subject: args.subject, level: args.level });
    track("gate_open", args);
  }, []);

  const close = useCallback(() => {
    setState({ phase: "closed" });
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (state.phase === "closed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab" && dialogRef.current) {
        const nodes = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
    setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    }, 20);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [state.phase, close]);

  const value = useMemo<Ctx>(() => ({ open }), [open]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.phase !== "form") return;
    if (!name.trim()) {
      setErr("Enter your name.");
      return;
    }
    if (!validatePhone(number)) {
      setErr("Enter a valid phone number.");
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      await submitLead({ name, number, level: state.level, subject: state.subject });
      setState({ phase: "video", subject: state.subject, level: state.level });
    } catch {
      setErr("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <GateCtx.Provider value={value}>
      {children}
      {state.phase !== "closed" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gate-title"
          className="landing-portal fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(0,0,0,0.7)] backdrop-blur-sm sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            ref={dialogRef}
            className="relative w-full max-w-lg rounded-t-[24px] border border-hairline bg-card p-7 shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:rounded-[24px]"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-faint hover:bg-card-raised hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>

            <span className="inline-flex items-center rounded-full border border-gold-border bg-gold-tint px-3 py-1 text-xs font-semibold text-gold">
              {state.level} · {state.subject}
            </span>

            {state.phase === "form" ? (
              <form onSubmit={onSubmit} className="mt-5">
                <h2 id="gate-title" className="text-2xl text-foreground">
                  One step and the lesson opens.
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Leave your name and number so I know who I am sending it to.
                </p>

                <label className="mt-6 block text-xs font-semibold uppercase tracking-wider text-faint" htmlFor="lead-name">
                  Name
                </label>
                <input
                  id="lead-name"
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 w-full rounded-full border border-hairline-strong bg-band-c px-5 py-3 text-sm text-foreground outline-none focus:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                />

                <label className="mt-4 block text-xs font-semibold uppercase tracking-wider text-faint" htmlFor="lead-num">
                  WhatsApp number
                </label>
                <input
                  id="lead-num"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="03XX XXXXXXX"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  className={`mt-2 w-full rounded-full border bg-band-c px-5 py-3 text-sm text-foreground outline-none focus:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
                    err && !validatePhone(number) ? "border-error-x" : "border-hairline-strong"
                  }`}
                />
                {err && <p className="mt-2 text-xs text-error-x">{err}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-6 w-full rounded-full bg-gold py-3.5 text-sm font-semibold text-[#1b1e21] transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  {loading ? "Opening..." : "Show me the lesson"}
                </button>
                <p className="mt-3 text-xs text-faint">
                  Your number stays with me. I use it to send the lesson and nothing else.
                </p>
              </form>
            ) : (
              <div className="mt-5">
                <h2 id="gate-title" className="text-2xl text-foreground">
                  Here is your free lesson.
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Watch it, then message me and we take it from there.
                </p>
                <div className="mt-5 aspect-video overflow-hidden rounded-2xl border border-hairline bg-band-c">
                  <VideoPlayer
                    src={trialVideoFor(state.subject, state.level)}
                    title={`${state.subject} ${state.level} lesson`}
                  />
                </div>
                <a
                  href={waLink({ subject: state.subject, level: state.level })}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    track("whatsapp_click", { from: "gate", subject: state.subject, level: state.level })
                  }
                  className="mt-6 flex w-full items-center justify-center rounded-full bg-gold py-3.5 text-sm font-semibold text-[#1b1e21] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                >
                  Continue on WhatsApp
                </a>
                <p className="mt-3 text-center text-xs text-faint">
                  Already enrolled?{" "}
                  <Link href="/login" className="font-semibold text-gold hover:underline">
                    Log in to your portal
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </GateCtx.Provider>
  );
}
