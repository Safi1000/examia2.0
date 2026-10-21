"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LogoTight } from "@/components/Brand";
import { cn } from "@/lib/cn";

/**
 * The sign-in door for students and the teacher: near-black, two slow gold
 * lights, the wordmark, one quiet line, and the form. No box, no clutter.
 *
 * `onSecret` turns the logo into a hidden door: press and hold it for a
 * moment (mouse or finger), or press Alt+Shift+A. Nothing on screen says so.
 */
export function AuthShell({
  kicker,
  title,
  greeting,
  children,
  footer,
  onSecret,
}: {
  /** Tiny line under the logo, e.g. "Private · Students only". */
  kicker: string;
  /** The page's heading for screen readers. */
  title: string;
  /** Optional handwritten gold line. */
  greeting?: string;
  children: ReactNode;
  footer?: ReactNode;
  onSecret?: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startHold = () => {
    if (!onSecret) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onSecret();
    }, 1200);
  };
  const endHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  useEffect(() => {
    if (!onSecret) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.code === "KeyA") {
        e.preventDefault();
        onSecret();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onSecret]);

  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-[#0f1113] px-6 py-14">
      {/* Two slow gold lights, a vignette and a whisper of grain. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="auth-orb-a absolute left-1/2 top-1/2 h-[520px] w-[520px] rounded-full opacity-[0.16] blur-[90px]"
          style={{ background: "radial-gradient(closest-side, var(--color-brand), transparent)" }}
        />
        <div
          className="auth-orb-b absolute left-1/2 top-1/2 h-[380px] w-[620px] rounded-full opacity-[0.08] blur-[100px]"
          style={{ background: "radial-gradient(closest-side, #e8a24a, transparent)" }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.65) 100%)" }}
        />
        <div
          className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />
      </div>

      <div className="w-full max-w-[340px]">
        <h1 className="sr-only">{title}</h1>

        <div className="auth-reveal text-center" style={{ animationDelay: "80ms" }}>
          <div
            onPointerDown={startHold}
            onPointerUp={endHold}
            onPointerLeave={endHold}
            onPointerCancel={endHold}
            onContextMenu={(e) => onSecret && e.preventDefault()}
            className={cn(
              "mx-auto inline-block select-none [-webkit-touch-callout:none] transition-[filter,transform] duration-[1200ms] ease-out",
              holding && "scale-[1.05] drop-shadow-[0_0_18px_rgba(251,193,89,0.55)]",
            )}
          >
            <LogoTight className="pointer-events-none mx-auto block h-9 sm:h-10" />
          </div>
        </div>

        <p
          className="auth-reveal mt-7 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.38em] text-ink-3"
          style={{ animationDelay: "260ms" }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 018 0v3" />
          </svg>
          {kicker}
        </p>

        {greeting && (
          <p
            className="auth-reveal mt-5 text-center text-[32px] leading-none text-brand"
            style={{ fontFamily: "var(--font-caveat)", animationDelay: "420ms" }}
          >
            {greeting}
          </p>
        )}

        <div className="auth-reveal mt-10" style={{ animationDelay: "560ms" }}>
          {children}
        </div>

        {footer && (
          <div className="auth-reveal mt-10 text-center text-[12px] text-ink-3" style={{ animationDelay: "760ms" }}>
            {footer}
          </div>
        )}
      </div>
    </main>
  );
}

/** Tiny tracked label above a field. */
export const labelClass = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.28em] text-ink-3";

export const fieldClass =
  "peer w-full h-12 border-0 border-b border-white/15 bg-transparent px-0 text-[17px] tracking-wide text-ink " +
  "placeholder:text-ink-3/50 transition-colors hover:border-white/30 " +
  "focus:border-white/30 focus:outline-none focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  "[&:-webkit-autofill]:[-webkit-text-fill-color:var(--color-ink)] [&:-webkit-autofill]:[transition:background-color_9999s]";

/** Wraps a field so a gold line draws under it on focus (styles in globals.css). */
export function Field({ children }: { children: ReactNode }) {
  return <div className="auth-field">{children}</div>;
}

/** Password input with a show/hide button and a Caps Lock warning. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  disabled,
  autoComplete = "current-password",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  autoComplete?: string;
}) {
  const [shown, setShown] = useState(false);
  const [caps, setCaps] = useState(false);
  const checkCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="auth-field relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={checkCaps}
          onKeyUp={checkCaps}
          onBlur={() => setCaps(false)}
          autoComplete={autoComplete}
          required
          disabled={disabled}
          aria-describedby={caps ? `${id}-caps` : undefined}
          className={cn(fieldClass, "pr-12")}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute -right-2 top-1 flex h-10 w-10 items-center justify-center rounded-md text-ink-3 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
        >
          {shown ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.4 1-1.2 2.3-2.4 3.5M6.6 6.6C4.5 8 3 10 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.4 4.4-1.1" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {caps && (
        <p id={`${id}-caps`} className="mt-2 text-xs font-medium tracking-wide text-warning">
          Caps Lock is on.
        </p>
      )}
    </div>
  );
}

export function AuthAlert({ tone, children }: { tone: "error" | "warning"; children: ReactNode }) {
  return (
    <p
      role="alert"
      className={cn(
        "mt-6 flex items-start gap-2 text-[13px] leading-snug",
        tone === "error" ? "text-error" : "text-warning",
      )}
    >
      <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-current" />
      <span>{children}</span>
    </p>
  );
}

export function SubmitButton({ busy, disabled, children }: { busy: boolean; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className={cn(
        "auth-btn group relative mt-10 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-full px-4",
        "bg-[linear-gradient(180deg,#ffd27e,#f2b44a)] text-[14px] font-semibold uppercase tracking-[0.2em] text-[#1a1d20]",
        "shadow-[0_10px_30px_-10px_rgba(251,193,89,0.55)] transition-[filter,transform,opacity] active:scale-[0.99]",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:border disabled:border-brand/25 disabled:bg-none disabled:bg-transparent disabled:text-brand/55 disabled:shadow-none",
      )}
    >
      {busy ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#1a1d20]/25 border-t-[#1a1d20]" aria-label="Signing in" />
      ) : (
        <>
          {children}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform group-hover:translate-x-0.5">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </>
      )}
    </button>
  );
}
