"use client";

import { useState, type ReactNode } from "react";
import { Logo } from "@/components/Brand";
import { cn } from "@/lib/cn";

/**
 * Shared frame for the student and teacher sign-in screens. Desktop: a quiet
 * brand panel on the left (what the portal is for) and the form on the right.
 * Phones: logo, title and form only, so the form sits on the first screen.
 */
export function AuthShell({
  eyebrow,
  title,
  note,
  points,
  children,
  footer,
}: {
  /** Small label above the title, e.g. "Student portal". */
  eyebrow: string;
  title: string;
  /** Short handwritten line in gold (desktop panel only). */
  note?: string;
  /** What the portal gives you, shown on the desktop panel. */
  points: Array<{ title: string; text: string }>;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-paper px-4 py-10">
      {/* Faint grid and a soft gold light, the same atmosphere as the public site. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in srgb, var(--color-ink) 6%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--color-ink) 6%, transparent) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at center, #000 30%, transparent 75%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(closest-side, var(--color-brand), transparent)" }}
      />

      <div className="relative grid w-full max-w-4xl animate-fade-up items-center gap-10 md:grid-cols-[1fr_400px] md:gap-14">
        {/* Brand panel (desktop) */}
        <section className="hidden md:block">
          <Logo className="h-12" />
          <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.25em] text-brand">{eyebrow}</p>
          <h1 className="mt-3 max-w-[16ch] text-4xl font-extrabold leading-[1.05] tracking-tight text-ink">{title}</h1>
          {note && (
            <p className="mt-3 text-2xl leading-tight text-brand" style={{ fontFamily: "var(--font-caveat)" }}>
              {note}
            </p>
          )}
          <ul className="mt-9 space-y-4">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brand/50 text-brand">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.2l2.3 2.3 4.7-5" />
                  </svg>
                </span>
                <span>
                  <span className="block text-[15px] font-semibold text-ink">{p.title}</span>
                  <span className="block text-sm text-ink-2">{p.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Form */}
        <section className="mx-auto w-full max-w-sm md:max-w-none">
          <div className="mb-7 text-center md:hidden">
            <Logo className="mx-auto h-11" />
            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.25em] text-brand">{eyebrow}</p>
            <h1 className="mt-2 text-[26px] font-extrabold leading-tight tracking-tight text-ink">{title}</h1>
          </div>
          <div className="rounded-2xl border border-border bg-surface/90 p-6 shadow-[var(--shadow-md)] backdrop-blur sm:p-7">
            {children}
          </div>
          {footer && <div className="mt-5 text-center text-sm text-ink-3">{footer}</div>}
        </section>
      </div>
    </main>
  );
}

export const fieldClass =
  "w-full h-12 rounded-lg border border-border-strong bg-surface-2 px-3.5 text-base text-ink " +
  "placeholder:text-ink-3 transition-colors hover:border-ink-3 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:opacity-60";

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
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-ink-2">
        {label}
      </label>
      <div className="relative">
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
          className="absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-md text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-brand"
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
        <p id={`${id}-caps`} className="mt-1.5 text-sm font-medium text-warning">
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
        "mt-4 rounded-lg border px-3 py-2 text-sm font-medium",
        tone === "error" ? "border-error/30 bg-error-soft text-error" : "border-warning/30 bg-warning-soft text-warning",
      )}
    >
      {children}
    </p>
  );
}

export function SubmitButton({ busy, disabled, children }: { busy: boolean; disabled: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className={cn(
        "mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand px-4 text-[15px] font-semibold text-on-brand",
        "transition-[filter,transform] hover:brightness-110 active:scale-[0.99] active:brightness-95",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      {busy ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-on-brand/30 border-t-on-brand" aria-label="Signing in" />
      ) : (
        children
      )}
    </button>
  );
}
