"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/landing";
import { cn } from "@/lib/cn";

type Hit = { u: string; c: string; l: string; p: number; s: string; n: number };

const chip = (on: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
    on ? "border-white/[0.16] bg-white/[0.09] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "border-hairline-strong text-muted-foreground hover:border-white/25 hover:text-foreground",
  );

/** "⟦word⟧" in a snippet marks the match. */
function Snip({ s }: { s: string }) {
  const parts = s.split(/⟦|⟧/);
  return (
    <>
      {parts.map((t, i) =>
        i % 2 ? (
          <mark key={i} className="rounded bg-white/[0.1] px-0.5 font-semibold text-foreground">
            {t}
          </mark>
        ) : (
          <span key={i}>{t}</span>
        ),
      )}
    </>
  );
}

/**
 * Search the words inside every question paper ("price elasticity",
 * "depreciation", "exchange rate"), then jump straight to the page.
 */
export function SearchInside({ syllabi, suggestions }: { syllabi: Array<{ code: string; label: string }>; suggestions: string[] }) {
  const [q, setQ] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [res, setRes] = useState<{ hits: Hit[]; total: number; papers: number } | null>(null);
  const [busy, setBusy] = useState(false);
  /** The search could not reach the server (offline, timeout): not the same as "no paper mentions that". */
  const [failed, setFailed] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  /** Only the newest search may show its results: tapping chips quickly must not let an older, slower answer win. */
  const latest = useRef(0);

  const run = async (text: string, c: string | null) => {
    const t = text.trim();
    const params = new URLSearchParams();
    if (t) params.set("q", t);
    if (c) params.set("code", c);
    // Keep any other parameters in the address (campaign tags), change only ours. Back to this page brings the search back.
    const url = new URLSearchParams(window.location.search);
    url.delete("q");
    url.delete("code");
    for (const [k, v] of params) url.set(k, v);
    window.history.replaceState(null, "", url.toString() ? `?${url}` : window.location.pathname);
    const ticket = ++latest.current;
    setFailed(false);
    if (t.replace(/[^a-z0-9]/gi, "").length < 3) {
      setRes(null);
      setBusy(false);
      setTooShort(t.length > 0);
      return;
    }
    setTooShort(false);
    setBusy(true);
    try {
      const r = await fetch(`/api/past-papers/search?${params}`);
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      if (ticket !== latest.current) return;
      setRes(data);
      track("paper_text_search", { q: t, code: c });
    } catch {
      if (ticket !== latest.current) return;
      setRes(null);
      setFailed(true);
    } finally {
      if (ticket === latest.current) setBusy(false);
    }
  };

  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    const startQ = u.get("q") ?? "";
    // An old or mistyped link with an unknown code would quietly find nothing: search everything instead.
    const c = u.get("code");
    const startC = c && syllabi.some((s) => s.code === c) ? c : null;
    /* eslint-disable react-hooks/set-state-in-effect */
    setQ(startQ);
    setCode(startC);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (startQ) void run(startQ, startC);
    else input.current?.focus();
    // Once, on arrival: the address is read a single time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void run(q, code);
        }}
        className="flex gap-2"
      >
        <label htmlFor="inside-q" className="sr-only">
          Words to find inside the papers
        </label>
        <input
          ref={input}
          id="inside-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. price elasticity, depreciation, exchange rate"
          className="h-14 min-w-0 flex-1 rounded-full border border-hairline-strong bg-card px-6 text-base text-foreground transition-colors duration-150 placeholder:text-faint hover:border-white/25 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-gold"
        />
        <button type="submit" className="h-14 shrink-0 rounded-full bg-gold px-6 text-base font-semibold text-band-b transition-[background-color,transform] duration-150 hover:bg-gold-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
          Search
        </button>
      </form>

      <div role="group" aria-label="Syllabus" className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <button
          type="button"
          aria-pressed={!code}
          onClick={() => {
            setCode(null);
            void run(q, null);
          }}
          className={chip(!code)}
        >
          All syllabuses
        </button>
        {syllabi.map((s) => (
          <button
            key={s.code}
            type="button"
            aria-pressed={code === s.code}
            onClick={() => {
              setCode(s.code);
              void run(q, s.code);
            }}
            className={chip(code === s.code)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="mt-8">
        {busy && <p className="text-base text-muted-foreground">Searching every paper…</p>}
        {!busy && failed && (
          <div className="pc-surface rounded-tile px-5 py-4 text-base text-muted-foreground">
            <p>The search didn&apos;t go through. Check your connection and try again.</p>
            <button type="button" onClick={() => void run(q, code)} className="mt-2 inline-flex min-h-11 items-center font-semibold text-foreground underline decoration-hairline-strong underline-offset-4 hover:decoration-foreground">
              Try again
            </button>
          </div>
        )}
        {!busy && tooShort && <p className="mb-4 text-base text-muted-foreground">Type at least three letters.</p>}
        {!busy && !res && !failed && (
          <div>
            <p className="text-base text-muted-foreground">Try one of these:</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => {
                      setQ(s);
                      void run(s, code);
                    }}
                    className={chip(false)}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!busy && res && (
          <>
            <p className="text-base text-muted-foreground">
              {res.total ? (
                <>
                  Found on {res.total} {res.total === 1 ? "page" : "pages"} in {res.papers} {res.papers === 1 ? "paper" : "papers"}
                  {res.total > res.hits.length ? `, newest ${res.hits.length} shown` : ""}.
                </>
              ) : (
                "No paper mentions that. Try a shorter phrase or another spelling."
              )}
            </p>
            <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
              {res.hits.map((h) => (
                <li key={`${h.c}-${h.p}`}>
                  <Link href={h.u} className="group block py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="text-base font-semibold tabular-nums text-foreground underline-offset-4 group-hover:underline">{h.c}</span>
                      <span className="text-sm tabular-nums text-faint">
                        Page {h.p}
                        {h.n > 1 ? ` · ${h.n} mentions` : ""}
                      </span>
                    </span>
                    <span className="block text-sm text-muted-foreground">{h.l}</span>
                    {h.s && (
                      <span className="mt-1.5 block text-sm leading-relaxed text-body">
                        <Snip s={h.s} />
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
