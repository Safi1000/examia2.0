import Link from "next/link";
import { cn } from "@/lib/cn";
import { EXAMINER_REPORTS, reportHref } from "@/lib/examiner-reports";
import {
  filesFor,
  paperHref,
  sessionKey,
  sessionLabel,
  sessionsFor,
  type Paper,
  type PaperSession,
  type PastPaperSyllabus,
} from "@/lib/past-papers";
import { THRESHOLD_PAGES, sessionsOf, type Session } from "@/lib/threshold-pages";

/*
 * Moving around one paper's series, server-rendered (no script):
 * SessionSwitch sits above the viewer (older and newer series, other variants),
 * SessionFiles below it (every file this series has on the site).
 * Links only to files and pages that exist in the data. The viewer remembers
 * Paper, Mark scheme or Side by side, so switching keeps the same view.
 */

const SHORT: Record<PaperSession["s"], string> = { m: "Feb/Mar", s: "May/Jun", w: "Oct/Nov" };
const short = (x: PaperSession) => `${SHORT[x.s]} ${x.y}`;

const chip =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-semibold tabular-nums transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const chipOff = "text-muted-foreground hover:bg-white/5 hover:text-foreground";
const chipOn = "bg-white/[0.09] text-foreground";

/** The same paper (same variant if it was sat, else the nearest one) in another series. */
function inSeries(all: Paper[], k: string, p: Paper) {
  const list = all.filter((o) => sessionKey(o.session) === k && o.num === p.num);
  return list.find((o) => o.pv === p.pv) ?? list.find((o) => o.pv.slice(-1) === p.pv.slice(-1)) ?? list[0] ?? null;
}

function neighbours(s: PastPaperSyllabus, all: Paper[], p: Paper) {
  // Newest series first.
  const series = sessionsFor(s.code).map(sessionKey);
  const i = series.indexOf(sessionKey(p.session));
  let newer: Paper | null = null;
  let older: Paper | null = null;
  for (let j = i - 1; j >= 0 && !newer; j--) newer = inSeries(all, series[j], p);
  for (let j = i + 1; j < series.length && !older; j++) older = inSeries(all, series[j], p);
  return { newer, older };
}

export function SessionSwitch({ s, all, p }: { s: PastPaperSyllabus; all: Paper[]; p: Paper }) {
  const { newer, older } = neighbours(s, all, p);
  const variants = all.filter((o) => sessionKey(o.session) === sessionKey(p.session) && o.num === p.num);
  if (!newer && !older && variants.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
      <nav aria-label="Other series of this paper" className={cn("flex items-center", older && "-ml-3")}>
        {older ? (
          <Link href={paperHref(s.slug, older)} className={cn(chip, chipOff, "gap-1.5")} aria-label={`Older: ${sessionLabel(older.session)}, paper ${older.pv}`}>
            <span aria-hidden>‹</span>
            {short(older.session)}
          </Link>
        ) : null}
        <span className="px-2 text-sm font-semibold text-foreground">{short(p.session)}</span>
        {newer ? (
          <Link href={paperHref(s.slug, newer)} className={cn(chip, chipOff, "gap-1.5")} aria-label={`Newer: ${sessionLabel(newer.session)}, paper ${newer.pv}`}>
            {short(newer.session)}
            <span aria-hidden>›</span>
          </Link>
        ) : null}
      </nav>
      {variants.length > 1 && (
        <nav aria-label={`Paper ${p.num} variants, ${sessionLabel(p.session)}`} className="flex items-center gap-1">
          <span className="pr-1 text-sm text-faint">Variant</span>
          {variants.map((o) =>
            o.key === p.key ? (
              <span key={o.key} aria-current="page" className={cn(chip, chipOn)}>
                {o.pv}
              </span>
            ) : (
              <Link key={o.key} href={paperHref(s.slug, o)} className={cn(chip, chipOff)} aria-label={`Paper ${o.pv}`}>
                {o.pv}
              </Link>
            ),
          )}
        </nav>
      )}
    </div>
  );
}

/** The grade threshold page's name for a series, when it has one ("June 2025"). */
const thresholdSession = (x: PaperSession) => `${x.s === "s" ? "June" : x.s === "w" ? "November" : "March"} ${x.y}` as Session;

export function SessionFiles({ s, all, p }: { s: PastPaperSyllabus; all: Paper[]; p: Paper }) {
  const k = sessionKey(p.session);
  const papers = all.filter((o) => sessionKey(o.session) === k);
  const f = filesFor(p);
  const report = EXAMINER_REPORTS.find((r) => r.code === s.code && r.series === k);
  const tp = THRESHOLD_PAGES.find((t) => t.code === s.code && t.syllabuses.some((x) => sessionsOf(x).includes(thresholdSession(p.session))));
  const extras = [
    report ? { href: reportHref(report), label: "Examiner report", internal: true } : f.er ? { href: f.er, label: "Examiner report (PDF)", internal: false } : null,
    tp ? { href: `/grade-thresholds/${tp.slug}`, label: "Grade thresholds", internal: true } : f.gt ? { href: f.gt, label: "Grade thresholds (PDF)", internal: false } : null,
  ].filter((x) => !!x);
  const count = papers.reduce((n, o) => n + 1 + (o.ms ? 1 : 0) + (o.insert ? 1 : 0), 0) + extras.length;
  const fileLink =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2.5 text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold";

  return (
    <section aria-labelledby="session-h" className="pc-surface mt-8 rounded-card px-4 pb-3 pt-4 sm:px-5">
      <h2 id="session-h" className="flex flex-wrap items-baseline justify-between gap-x-4 text-base font-semibold text-foreground">
        Everything from {sessionLabel(p.session)}
        <span className="text-sm font-normal tabular-nums text-faint">
          {count} file{count === 1 ? "" : "s"}
        </span>
      </h2>
      <ul className="mt-2 grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {papers.map((o) => {
          const href = paperHref(s.slug, o);
          const here = o.key === p.key;
          return (
            <li key={o.key} className={cn("flex items-center justify-between gap-2 border-b border-hairline py-0.5", here && "-mx-2 rounded-tile border-transparent bg-white/[0.04] px-2")}>
              <span className="min-w-0 truncate text-sm tabular-nums text-foreground" aria-current={here ? "page" : undefined}>
                <span className="font-semibold">Paper {o.pv}</span>
                {o.title ? <span className="text-faint"> · {o.title}</span> : null}
              </span>
              <span className="flex shrink-0">
                <Link prefetch={false} href={`${href}?doc=qp`} className={fileLink} aria-label={`Paper ${o.pv} question paper`}>
                  QP
                </Link>
                {o.ms && (
                  <Link prefetch={false} href={`${href}?doc=ms`} className={fileLink} aria-label={`Paper ${o.pv} mark scheme`}>
                    MS
                  </Link>
                )}
                {o.insert && (
                  <Link prefetch={false} href={`${href}?doc=in`} className={fileLink} aria-label={`Paper ${o.pv} insert`}>
                    Insert
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {extras.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-5">
          {extras.map((x) =>
            x.internal ? (
              <Link key={x.href} href={x.href} className="inline-flex min-h-11 items-center text-sm font-semibold text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground">
                {x.label}
              </Link>
            ) : (
              <a key={x.href} href={x.href} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-sm font-semibold text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground">
                {x.label}
              </a>
            ),
          )}
        </p>
      )}
    </section>
  );
}
