"use client";

/**
 * One search for the whole site: type a topic, a syllabus code or a paper code
 * and get articles, topic questions, tools, thresholds and the papers
 * themselves, grouped. Both lists load the first time the box is used.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SearchRow } from "@/lib/past-papers";
import type { SiteKind, SiteRow } from "@/lib/site-search";

type Data = { site: SiteRow[]; papers: SearchRow[] };
let dataPromise: Promise<Data | null> | null = null;
const load = () =>
  (dataPromise ??= Promise.all([fetch("/search.json").then((r) => r.json()), fetch("/past-papers/search.json").then((r) => r.json())])
    .then(([site, papers]) => ({ site, papers }) as Data)
    .catch(() => {
      dataPromise = null;
      return null;
    }));

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const ORDER: SiteKind[] = ["Article", "Questions by topic", "Most repeated topics", "Grade thresholds", "Syllabus", "Tool"];
const HEADING: Record<SiteKind, string> = {
  Article: "Articles",
  "Questions by topic": "Past paper questions by topic",
  "Most repeated topics": "Most repeated topics",
  "Grade thresholds": "Grade thresholds",
  Syllabus: "Syllabus",
  Tool: "Tools",
};
const TRY = ["7707 ratios", "inflation", "bank reconciliation", "9708 paper 4", "0452/22/M/J/25", "marketing mix"];

const row =
  "flex min-h-14 items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold";

export function SiteSearch() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  // A search can arrive in the address (?q=), for example from the menu.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const first = new URLSearchParams(window.location.search).get("q");
      if (first) setQ(first);
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!q.trim() || data) return;
    let on = true;
    load().then((d) => {
      if (!on) return;
      if (d) setData(d);
      else setFailed(true);
    });
    return () => {
      on = false;
    };
  }, [q, data]);

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!data || !words.length) return null;
    const site = data.site.filter((r) => words.every((w) => r.w.includes(w)));
    const sq = squash(q);
    const papers = data.papers.filter((r) => (/^\d{4}/.test(sq) && squash(r.c).startsWith(sq)) || words.every((w) => r.w.includes(w) || r.c.toLowerCase().includes(w))).slice(0, 8);
    const groups = ORDER.map((k) => ({ k, rows: site.filter((r) => r.k === k).slice(0, 6) })).filter((g) => g.rows.length);
    return { groups, papers, total: site.length + papers.length };
  }, [data, q]);

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search the site</span>
        <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-faint">
          <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m14 14 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="A topic, a syllabus code or a paper code"
          className="min-h-14 w-full rounded-full border border-hairline-strong bg-card pl-12 pr-5 text-lg text-ink placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        />
      </label>

      {!q.trim() && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-muted-foreground">Try</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {TRY.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setQ(t)}
                className="inline-flex min-h-11 items-center rounded-full border border-hairline-strong px-4 text-sm font-semibold text-body transition-colors duration-150 hover:border-white/25 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div aria-live="polite">
        {q.trim() && !data && !failed && <p className="mt-6 text-base text-faint">Searching</p>}
        {failed && <p className="mt-6 text-base text-muted-foreground">Search could not load. Check your connection and try again.</p>}
        {results && results.total === 0 && (
          <p className="mt-6 text-base text-muted-foreground">
            Nothing found for that. Try a shorter word, or a code like 7707.
          </p>
        )}
      </div>

      {results?.groups.map((g) => (
        <section key={g.k} className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground">{HEADING[g.k]}</h2>
          <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-card">
            {g.rows.map((r) => (
              <li key={r.u}>
                <Link href={r.u} className={row}>
                  <span className="min-w-0">
                    <span className="block text-base font-semibold leading-snug text-ink">{r.t}</span>
                    <span className="mt-0.5 block text-sm text-faint">{r.s}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {results && results.papers.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground">Past papers</h2>
          <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-card">
            {results.papers.map((r) => (
              <li key={r.u}>
                <Link href={r.u} className={row}>
                  <span className="min-w-0">
                    <span className="block text-base font-semibold tabular-nums text-ink">{r.c}</span>
                    <span className="mt-0.5 block text-sm text-faint">{r.l.replace(/ · /g, ", ")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
