"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SearchRow } from "@/lib/past-papers";
import { cn } from "@/lib/cn";

/**
 * One box that finds any paper: the code printed on it (2281/12/M/J/25), the
 * file name (2281_s25_qp_12) or plain words ("economics may june 2024 paper 2").
 * The list of papers loads the first time the box is used.
 */
let rowsPromise: Promise<SearchRow[]> | null = null;
/** Resolves to null when the list can't be fetched (offline, slow network), and forgets the failure so the next try fetches again. */
const loadRows = (): Promise<SearchRow[] | null> =>
  (rowsPromise ??= fetch("/past-papers/search.json").then((r) => {
    if (!r.ok) throw new Error(String(r.status));
    return r.json() as Promise<SearchRow[]>;
  })).catch(() => {
    rowsPromise = null;
    return null;
  });

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const fileName = /^(\d{4})_([msw])(\d{2})(?:_(?:qp|ms|in))?(?:_(\d{1,2}))?$/;
const SERIES_FROM_FILE: Record<string, string> = { m: "fm", s: "mj", w: "on" };

function match(rows: SearchRow[], q: string): SearchRow[] {
  const raw = q.trim().toLowerCase();
  if (!raw) return [];
  // A file name: 2281_s25_qp_12 → 2281/12/M/J/25
  const f = raw.replace(/\.pdf$/, "").match(fileName);
  // Without a paper number ("2281_s25") the code alone would match every 2281 paper: list that series instead.
  if (f && !f[4]) return rows.filter((r) => r.w.includes(`${f[1]}_${f[2]}${f[3]}`));
  const asCode = f ? `${f[1]}${f[4]}${SERIES_FROM_FILE[f[2]]}${f[3]}` : null;
  const sq = asCode ?? squash(raw);
  // The code on the paper, typed in full or in part.
  if (/^\d{4}/.test(sq)) {
    const hits = rows.filter((r) => squash(r.c).startsWith(sq));
    if (hits.length) return hits;
    if (f) return rows.filter((r) => r.w.includes(`${f[1]}_${f[2]}${f[3]}`));
  }
  // "paper 2" → "p2", "variant 3" → "v3"; numbers must match exactly (2024, 24, 12).
  const tokens = raw
    .replace(/\b(?:paper|p)\s*(\d)\b/g, "p$1")
    .replace(/\b(?:variant|v)\s*(\d)\b/g, "v$1")
    .split(/[\s,/]+/)
    .filter(Boolean);
  return rows.filter((r) => {
    const words = r.w.split(" ");
    return tokens.every((t) => (/^\d+$/.test(t) ? words.includes(t) : words.some((w) => w.startsWith(t))));
  });
}

export function PaperSearch({ autoFocus, compact, quiet, className }: { autoFocus?: boolean; compact?: boolean; quiet?: boolean; className?: string }) {
  const [rows, setRows] = useState<SearchRow[] | null>(null);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const id = useId();
  const box = useRef<HTMLDivElement>(null);

  const results = useMemo(() => (rows ? match(rows, q) : []), [rows, q]);
  const shown = results.slice(0, 8);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const [failed, setFailed] = useState(false);
  const warm = () => {
    if (rows) return;
    setFailed(false);
    void loadRows().then((r) => (r ? setRows(r) : setFailed(true)));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(shown.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && shown[active]) {
      e.preventDefault();
      router.push(shown[active].u);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && q.trim().length > 0;
  return (
    <div ref={box} className={cn("relative", className)}>
      <label htmlFor={`${id}-q`} className={compact || quiet ? "sr-only" : "mb-2 block text-[15px] font-semibold text-foreground"}>
        Find a paper
      </label>
      <div className="relative">
        <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id={`${id}-q`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={`${id}-list`}
          aria-activedescendant={showList && shown[active] ? `${id}-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
          value={q}
          onFocus={() => {
            warm();
            setOpen(true);
          }}
          onChange={(e) => {
            warm();
            setQ(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKey}
          placeholder={compact ? "Search any paper, e.g. 2281/12/M/J/25" : "Try 2281/12/M/J/25 or economics june 2024"}
          className={cn(
            "w-full rounded-full border border-hairline-strong bg-card pl-14 pr-5 text-[16px] text-foreground placeholder:text-faint focus:border-gold-border focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-gold",
            compact ? "h-12" : "h-14 md:h-16 md:text-[17px]",
          )}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {showList && rows ? `${results.length} ${results.length === 1 ? "paper" : "papers"} found` : ""}
      </p>
      {showList && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-[20px] border border-hairline-strong bg-card-raised shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)]">
          {!rows && failed ? (
            <div className="px-5 py-4 text-[15px] text-muted-foreground">
              <p>Couldn&apos;t load the list of papers. Check your connection.</p>
              <button type="button" onClick={warm} className="mt-2 inline-flex min-h-11 items-center font-semibold text-gold hover:underline">
                Try again
              </button>
            </div>
          ) : !rows ? (
            <p className="px-5 py-4 text-[15px] text-muted-foreground">Loading papers…</p>
          ) : shown.length === 0 ? (
            <div className="px-5 py-4 text-[15px] text-muted-foreground">
              <p>No paper code matches that.</p>
              <Link href={`/past-papers/search?q=${encodeURIComponent(q.trim())}`} className="mt-2 inline-flex min-h-11 items-center font-semibold text-gold hover:underline">
                Search inside the papers for &ldquo;{q.trim()}&rdquo; →
              </Link>
            </div>
          ) : (
            <ul id={`${id}-list`} role="listbox" aria-label="Matching papers" className="max-h-[60dvh] overflow-y-auto py-2">
              {shown.map((r, i) => (
                <li key={r.u} id={`${id}-${i}`} role="option" aria-selected={i === active}>
                  <Link
                    href={r.u}
                    onMouseEnter={() => setActive(i)}
                    className={cn("flex min-h-14 flex-col justify-center px-5 py-2.5", i === active ? "bg-gold-tint" : "hover:bg-gold-tint")}
                  >
                    <span className="font-semibold tabular-nums text-foreground">{r.c}</span>
                    <span className="text-[14px] leading-snug text-muted-foreground">{r.l}</span>
                  </Link>
                </li>
              ))}
              {!/^\d/.test(q.trim()) && (
                <li>
                  <Link href={`/past-papers/search?q=${encodeURIComponent(q.trim())}`} className="flex min-h-12 items-center border-t border-hairline px-5 text-[15px] font-semibold text-gold hover:bg-gold-tint">
                    Search inside the papers for &ldquo;{q.trim()}&rdquo; →
                  </Link>
                </li>
              )}
              {results.length > shown.length && (
                <li className="px-5 pb-2 pt-1 text-[14px] text-faint">
                  {results.length - shown.length} more. Add a year or paper number to narrow it.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
