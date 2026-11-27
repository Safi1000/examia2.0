"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, Spinner, Textarea, buttonClasses } from "@/components/ui";
import { CalmShell } from "@/components/student/PausedScreen";
import { cn } from "@/lib/cn";
import { DEMO } from "@/lib/demo";
import { waTextLink } from "@/lib/landing";
import { FAREWELL_COPY, FAREWELL_TEXT_MAX, isLeftKind, type LeftKind, type Rating } from "@/lib/farewell-copy";

export type FarewellDraft = { rating: Rating | null; helped: string; change: string };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * The goodbye a student sees once Hamza marks them as left (signed in, in
 * place of the portal) and on the farewell link Hamza sends them. A warm
 * thank-you and one small feedback card. No other navigation.
 */
export function FarewellScreen({
  kind,
  name,
  sent,
  send,
  onSignOut,
}: {
  kind: LeftKind;
  /** Shown small above the title on the public link. */
  name?: string;
  /** They already sent a note before: open on the done state. */
  sent: boolean;
  /** Saves the note. Resolves true when it was saved. */
  send: (note: FarewellDraft) => Promise<boolean>;
  /** Signed in only: a quiet Sign out link. */
  onSignOut?: () => void;
}) {
  const words = FAREWELL_COPY[kind];
  const [phase, setPhase] = useState<"form" | "sending" | "done">(sent ? "done" : "form");
  const [already, setAlready] = useState(sent);
  const [rating, setRating] = useState<Rating | null>(null);
  const [helped, setHelped] = useState("");
  const [change, setChange] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [glow, setGlow] = useState(false);
  const doneRef = useRef<HTMLDivElement>(null);
  const ratingName = useId();
  const headingId = useId();

  useEffect(() => {
    if (!glow) return;
    const t = setTimeout(() => setGlow(false), 900);
    return () => clearTimeout(t);
  }, [glow]);

  const empty = rating === null && !helped.trim() && !change.trim();

  const submit = async () => {
    if (phase === "sending" || empty) return;
    setPhase("sending");
    setError(null);
    let ok = false;
    try {
      ok = await send({ rating, helped: helped.trim().slice(0, FAREWELL_TEXT_MAX), change: change.trim().slice(0, FAREWELL_TEXT_MAX) });
    } catch {
      ok = false;
    }
    if (!ok) {
      setPhase("form");
      setError(FAREWELL_COPY.error);
      return;
    }
    setAlready(false);
    setPhase("done");
    if (!reducedMotion()) setGlow(true);
    requestAnimationFrame(() => doneRef.current?.focus());
  };

  const another = () => {
    setRating(null);
    setHelped("");
    setChange("");
    setError(null);
    setAlready(false);
    setPhase("form");
  };

  return (
    <CalmShell>
      <div className="text-center motion-safe:animate-fade-up">
        {name && <p className="mb-2 text-sm font-medium text-ink-3">{name}</p>}
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-ink">{words.title}</h1>
        <p className="mx-auto mt-3 max-w-[24rem] text-pretty text-base leading-relaxed text-ink-2">{words.body}</p>
      </div>

      <section
        aria-labelledby={headingId}
        className={cn(
          "mt-9 rounded-2xl border bg-surface px-5 py-6 transition-[border-color] duration-700 ease-[var(--ease-out)] sm:px-6",
          glow ? "border-brand" : "border-hairline",
        )}
      >
        <h2 id={headingId} className={cn("text-lg font-semibold tracking-tight text-ink", phase === "done" && "sr-only")}>
          {FAREWELL_COPY.cardTitle}
        </h2>

        {phase === "done" ? (
          <div
            ref={doneRef}
            tabIndex={-1}
            role="status"
            className="mt-4 outline-none transition-opacity duration-500 motion-safe:animate-fade-up"
          >
            <p className="text-base leading-relaxed text-ink">{already ? FAREWELL_COPY.alreadySent : FAREWELL_COPY.doneTitle}</p>
            <p className="mt-4 font-hand text-xl text-brand">{FAREWELL_COPY.doneSign}</p>
            {already && (
              <button
                type="button"
                onClick={another}
                className="-mx-1 mt-5 inline-flex min-h-11 items-center px-1 text-sm font-medium text-ink-3 underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {FAREWELL_COPY.sendAnother}
              </button>
            )}
          </div>
        ) : (
          <form
            className="mt-1"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <p className="text-sm leading-relaxed text-ink-2">{FAREWELL_COPY.cardSub}</p>

            <fieldset className="mt-6">
              <legend className="sr-only">{FAREWELL_COPY.cardTitle}</legend>
              <div className="grid grid-cols-5 gap-2">
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <label key={n} className="relative">
                    <input
                      type="radio"
                      name={ratingName}
                      value={n}
                      checked={rating === n}
                      onChange={() => setRating(n)}
                      disabled={phase === "sending"}
                      className="peer sr-only"
                      aria-label={n === 1 ? `1, ${FAREWELL_COPY.ratingLow}` : n === 5 ? `5, ${FAREWELL_COPY.ratingHigh}` : String(n)}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-12 cursor-pointer select-none items-center justify-center rounded-xl border text-base font-semibold tabular-nums transition-colors",
                        "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
                        rating === n ? "border-brand bg-brand text-on-brand" : "border-hairline-strong text-ink-2 hover:border-ink-3 hover:text-ink",
                      )}
                    >
                      {n}
                    </span>
                  </label>
                ))}
              </div>
              <div aria-hidden className="mt-2 flex justify-between text-xs text-ink-3">
                <span>{FAREWELL_COPY.ratingLow}</span>
                <span>{FAREWELL_COPY.ratingHigh}</span>
              </div>
            </fieldset>

            <div className="mt-6 space-y-5 text-left">
              <Textarea
                label={FAREWELL_COPY.helped}
                value={helped}
                onChange={(e) => setHelped(e.target.value)}
                maxLength={FAREWELL_TEXT_MAX}
                disabled={phase === "sending"}
                rows={3}
                className="text-base"
              />
              <Textarea
                label={FAREWELL_COPY.change}
                value={change}
                onChange={(e) => setChange(e.target.value)}
                maxLength={FAREWELL_TEXT_MAX}
                disabled={phase === "sending"}
                rows={3}
                className="text-base"
              />
            </div>

            {error && (
              <p role="alert" className="mt-4 text-sm font-medium text-error">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" fullWidth className="mt-6" loading={phase === "sending"} disabled={empty}>
              {phase === "sending" ? FAREWELL_COPY.sending : FAREWELL_COPY.send}
            </Button>
          </form>
        )}
      </section>

      {onSignOut && (
        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-ink-3 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {FAREWELL_COPY.signOut}
          </button>
        </div>
      )}
    </CalmShell>
  );
}

/** POST a note to /api/farewell. True when it was saved. */
export async function postFarewell(note: FarewellDraft, auth: { token: string } | { bearer: string }): Promise<boolean> {
  const res = await fetch("/api/farewell", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...("bearer" in auth ? { Authorization: `Bearer ${auth.bearer}` } : {}) },
    body: JSON.stringify({ ...note, ...("token" in auth ? { t: auth.token } : {}) }),
    cache: "no-store",
  });
  return res.ok;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The public farewell link (/farewell/<token>): reads who it is for, then
 * shows the same screen. /farewell/demo works in the local preview only.
 */
export function FarewellPublic({ token }: { token: string }) {
  const demo = DEMO && token === "demo";
  const [state, setState] = useState<
    { s: "loading" } | { s: "missing" } | { s: "offline" } | { s: "ok"; name: string; kind: LeftKind; sent: boolean }
  >(demo ? { s: "ok", name: "Ali", kind: "finished", sent: false } : { s: "loading" });

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/farewell?t=${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.status === 404) return setState({ s: "missing" });
      if (!res.ok) return setState({ s: "offline" });
      const d = (await res.json()) as { name?: unknown; kind?: unknown; sent?: unknown };
      if (typeof d.name !== "string" || !isLeftKind(d.kind)) return setState({ s: "missing" });
      setState({ s: "ok", name: d.name, kind: d.kind, sent: d.sent === true });
    } catch {
      setState({ s: "offline" });
    }
  }, [token]);

  useEffect(() => {
    if (demo) return;
    // Started on the next frame, not inside the effect body (no cascading render).
    const f = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(f);
  }, [demo, load]);

  if (state.s === "ok") {
    return (
      <FarewellScreen
        kind={state.kind}
        name={state.name}
        sent={state.sent}
        send={(note) => (demo ? wait(600).then(() => true) : postFarewell(note, { token }))}
      />
    );
  }
  if (state.s === "loading") {
    return (
      <CalmShell>
        <div className="flex justify-center">
          <Spinner size={22} className="text-ink-3" />
        </div>
      </CalmShell>
    );
  }
  return (
    <CalmShell>
      <div className="text-center">
        <p className="text-base font-semibold text-ink">
          {state.s === "missing" ? "This link isn't working." : "Couldn't load. Check your connection and try again."}
        </p>
        <div className="mt-6 flex flex-col items-stretch gap-3">
          {state.s === "offline" ? (
            <Button
              size="lg"
              fullWidth
              onClick={() => {
                setState({ s: "loading" });
                void load();
              }}
            >
              Try again
            </Button>
          ) : (
            <a
              href={waTextLink("hi, my farewell link isn't working")}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: "secondary", size: "lg", fullWidth: true })}
            >
              Message Hamza on WhatsApp
            </a>
          )}
        </div>
      </div>
    </CalmShell>
  );
}
