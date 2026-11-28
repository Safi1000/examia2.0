import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section, Table, TrialBox } from "@/components/study/StudyBits";
import { RelatedLinks, syllabusLinks } from "@/components/study/RelatedLinks";
import { PaperSearch } from "@/components/past-papers/PaperSearch";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { formatDate } from "@/lib/time";
import {
  PAPERS_UPDATED,
  cieCode,
  fileName,
  paperHref,
  pdfUrl,
  seriesHref,
  sessionKey,
  sessionLabel,
  type PaperSession,
  type PastPaperSyllabus,
} from "@/lib/past-papers";
import { absolute, breadcrumbLd } from "@/lib/seo";
import { reportHref, reportPublished } from "@/lib/examiner-reports";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";
import { seriesData, seriesFor } from "@/lib/series";

const time = (m: number) => (m < 60 ? `${m} minutes` : `${Math.floor(m / 60)} hour${m >= 120 ? "s" : ""}${m % 60 ? ` ${m % 60} minutes` : ""}`);
const SHORT: Record<PaperSession["s"], string> = { m: "Feb/March", s: "May/June", w: "Oct/Nov" };

const quiet =
  "font-semibold text-foreground underline decoration-hairline-strong underline-offset-[6px] transition-colors duration-150 hover:decoration-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const chip =
  "inline-flex min-h-11 items-center rounded-full border border-hairline px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:bg-card-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const arrow = (
  <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-faint transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-foreground" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m8 5 5 5-5 5" />
  </svg>
);

/** Every paper of one exam series, with the grade marks, examiner notes and topics for that series. */
export function SeriesPage({ s, x }: { s: PastPaperSyllabus; x: PaperSession }) {
  const d = seriesData(s, x);
  const label = sessionLabel(x);
  const k = sessionKey(x);
  const url = seriesHref(s.slug, x);
  const hub = `/past-papers/${s.slug}`;
  const subject = s.subject === "Business" && s.level !== "AS and A Level" ? "Business Studies" : s.subject;
  const levelWord = s.level === "AS and A Level" ? "Cambridge International AS and A Level" : `Cambridge ${s.level}`;
  const er = x.er ? pdfUrl(fileName(s.code, x, "er")) : null;
  const gt = x.gt ? pdfUrl(fileName(s.code, x, "gt")) : null;
  const thresholds = THRESHOLD_PAGES.find((p) => p.code === s.code);
  const updated = [PAPERS_UPDATED, ...(d.report ? [reportPublished(d.report)] : [])].sort().at(-1)!;
  const others = seriesFor(s);
  const years = [...new Set(others.map((o) => o.y))];
  const topTopics = d.topics.slice(0, 12);

  const jump = [
    { href: "#papers", label: "Papers" },
    ...(d.marks.length ? [{ href: "#grade-marks", label: "Grade marks" }] : []),
    ...(d.report ? [{ href: "#examiners", label: "Examiner report" }] : []),
    ...(topTopics.length ? [{ href: "#topics", label: "Topics tested" }] : []),
  ];

  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${s.name} ${label} past papers`,
          url: absolute(url),
          about: s.subject,
          inLanguage: "en",
          isAccessibleForFree: true,
          dateModified: updated,
          isPartOf: { "@type": "CollectionPage", name: `${s.name} past papers`, url: absolute(hub) },
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: d.papers.length,
            itemListElement: d.papers.map((p, i) => ({ "@type": "ListItem", position: i + 1, name: `${cieCode(p)} ${subject} question paper${p.ms ? " and mark scheme" : ""}`, url: absolute(paperHref(s.slug, p)) })),
          },
        }}
      />
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Past papers", path: "/past-papers" }, { name: s.name, path: hub }, { name: label, path: url }])} />
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-8 md:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PastPapersNav className="w-fit max-w-full" />
          <PaperSearch compact className="w-full sm:w-[300px]" />
        </div>
        <div className="mt-8">
          <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past papers", href: "/past-papers" }, { name: s.short, href: hub }, { name: label }]} />
        </div>

        <header>
          <h1 className="mt-4 text-4xl font-bold leading-[1.06] tracking-tight text-foreground md:text-5xl">
            <span className="tabular-nums">
              {s.code} {label}
            </span>{" "}
            past papers
          </h1>
          <p className="mt-5 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">
            Every {levelWord} {subject} paper from the {label} series, each with its mark scheme. Sit one against the clock, mark it, then check your mark against what each grade needed.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2 text-sm tabular-nums text-muted-foreground">
            <li className="rounded-full border border-hairline px-3 py-1">
              {d.counts.qp} question paper{d.counts.qp === 1 ? "" : "s"}
            </li>
            {d.counts.ms > 0 && (
              <li className="rounded-full border border-hairline px-3 py-1">
                {d.counts.ms} mark scheme{d.counts.ms === 1 ? "" : "s"}
              </li>
            )}
            {d.counts.insert > 0 && (
              <li className="rounded-full border border-hairline px-3 py-1">
                {d.counts.insert} insert{d.counts.insert === 1 ? "" : "s"}
              </li>
            )}
            <li className="rounded-full border border-hairline px-3 py-1">File code {k}</li>
          </ul>
          <p className="mt-4 text-xs tabular-nums text-faint">
            Prepared by Hamza Teaches · Updated <time dateTime={updated}>{formatDate(updated)}</time>
          </p>
          {jump.length > 1 && (
            <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2">
              {jump.map((j) => (
                <a key={j.href} href={j.href} className={chip}>
                  {j.label}
                </a>
              ))}
            </nav>
          )}
        </header>

        <Section id="papers" title={`The ${label} papers`}>
          <div className="space-y-8">
            {d.groups.map((g) => (
              <section key={g.num} aria-labelledby={`p-${g.num}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 id={`p-${g.num}`} className="text-lg font-bold text-foreground">
                    Paper {g.num}
                    {g.title ? <span className="font-medium text-muted-foreground"> · {g.title}</span> : null}
                  </h3>
                  <p className="text-sm tabular-nums text-faint">
                    {[g.minutes ? time(g.minutes) : "", g.marks ? `${g.marks} marks` : "", g.mcq ? "marked on screen" : ""].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <ul className="pc-surface mt-3 divide-y divide-hairline overflow-hidden rounded-card">
                  {g.papers.map((p) => {
                    const row = d.marks.find((r) => r.paper.key === p.key);
                    const mine = row?.t.grades.find(([grade]) => grade === d.top);
                    return (
                      <li key={p.key}>
                        <Link
                          href={paperHref(s.slug, p)}
                          className="row-link group flex min-h-16 items-center gap-4 px-4 py-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold sm:px-5"
                        >
                          <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-field bg-card-raised text-lg font-bold tabular-nums leading-none text-foreground">
                            {p.pv}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold tabular-nums leading-snug text-foreground">{cieCode(p)}</span>
                            <span className="mt-0.5 block break-words text-sm tabular-nums text-muted-foreground">
                              {k} qp {p.pv}
                              {p.ms ? ` · ms ${p.pv}` : ""}
                              {p.insert ? ` · insert ${p.pv}` : ""}
                            </span>
                          </span>
                          {mine && row && (
                            <span className="shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                              <span className="block text-xs text-faint">{d.top} grade</span>
                              <span className="font-semibold text-foreground">{mine[1]}</span> / {row.t.max}
                            </span>
                          )}
                          {arrow}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </Section>

        {d.marks.length > 0 && d.top && (
          <Section
            id="grade-marks"
            title={`What each grade needed in ${label}`}
            intro={
              <>
                Cambridge&apos;s minimum raw mark for each grade, paper by paper.
                {d.range && (
                  <>
                    {" "}
                    Grade {d.top} needed {d.range.low.topPct}% of the marks on Paper {d.range.low.paper.pv} and {d.range.high.topPct}% on Paper {d.range.high.paper.pv}.
                  </>
                )}
              </>
            }
          >
            <Table
              caption={`${s.code} ${label} grade thresholds by paper`}
              head={["Paper", "Out of", ...d.letters, ...(d.lastYear ? [`${d.top} vs ${d.lastYear.y}`] : [])]}
              rows={d.marks.map((r) => [
                <Link key="p" href={paperHref(s.slug, r.paper)} className="underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground">
                  Paper {r.paper.pv}
                </Link>,
                r.t.max,
                ...d.letters.map((g) => r.t.grades.find(([letter]) => letter === g)?.[1] ?? "–"),
                ...(d.lastYear ? [r.change === null ? "–" : r.change === 0 ? "same" : r.change > 0 ? `+${r.change}` : `−${Math.abs(r.change)}`] : []),
              ])}
            />
            {d.lastYear && (
              <p className="mt-3 text-sm leading-relaxed text-faint">
                The last column is the change in the {d.top} mark against the same paper in {sessionLabel(d.lastYear)}. A dash means the paper was out of a different total.
              </p>
            )}
            <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-base">
              {thresholds && (
                <Link href={`/grade-thresholds/${thresholds.slug}`} className={quiet}>
                  All {s.code} grade thresholds
                </Link>
              )}
              {gt && (
                <a href={gt} target="_blank" rel="noopener" className={quiet}>
                  Cambridge&apos;s threshold document (PDF)
                </a>
              )}
            </p>
          </Section>
        )}

        {d.report && (
          <Section id="examiners" title="What the examiners said" intro={`From my summary of the ${label} examiner report. These are the fixes I would start with.`}>
            <ul className="list-disc space-y-3 pl-5 text-lg leading-relaxed text-body marker:text-faint">
              {d.report.takeaways.slice(0, 3).map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {d.report.quote && (
              <blockquote className="mt-8 border-l-2 border-gold pl-5 text-lg leading-relaxed text-foreground">
                &ldquo;{d.report.quote.text}&rdquo;
                <footer className="mt-1 text-sm text-faint">The examiners, {label} report</footer>
              </blockquote>
            )}
            <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-base">
              <Link href={reportHref(d.report)} className={quiet}>
                Every mistake, paper by paper
              </Link>
              {er && (
                <a href={er} target="_blank" rel="noopener" className={quiet}>
                  Cambridge&apos;s full report (PDF)
                </a>
              )}
            </p>
          </Section>
        )}

        {topTopics.length > 0 && (
          <Section
            id="topics"
            title={d.topicPapers ? `Topics tested in Paper${d.topicPapers.includes(" and ") ? "s" : ""} ${d.topicPapers}` : `Topics tested in ${label}`}
            intro={`${d.topicPapers ? `The Paper ${d.topicPapers} questions from this series, sorted by syllabus topic: ${d.topics.length} topics came up.` : `${d.topics.length} syllabus topics came up across these papers.`} ${d.topics.length > topTopics.length ? "The ones with the most questions:" : "Most questions first:"}`}
          >
            <ul className="grid gap-x-10 border-t border-hairline sm:grid-cols-2">
              {topTopics.map(({ e, n }) => (
                <li key={e.slug} className="border-b border-hairline">
                  <Link
                    href={`${hub}/topics/${e.slug}`}
                    className="group flex min-h-14 items-center justify-between gap-4 py-3 transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  >
                    <span className="min-w-0 text-base font-semibold leading-snug text-foreground group-hover:text-muted-foreground">
                      <span className="mr-2 font-normal tabular-nums text-faint">{e.sub.num}</span>
                      {e.sub.name}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {n} question{n === 1 ? "" : "s"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-base">
              <Link href={`${hub}/topics`} className={quiet}>
                All {s.code} questions by topic
              </Link>
              <Link href={`${hub}/most-repeated-topics`} className={quiet}>
                Most repeated topics
              </Link>
            </p>
          </Section>
        )}

        {!d.report && er && (
          <p className="mt-10 text-base">
            <a href={er} target="_blank" rel="noopener" className={quiet}>
              {s.code} {label} examiner report (PDF)
            </a>
          </p>
        )}

        <TrialBox
          from={`past-papers:${s.code}`}
          classes
          subject={s.subject}
          level={s.trialLevel}
          title="Marked your paper and lost marks you can't explain?"
          body={`That is what I fix in class: the exact ${s.short} questions you keep dropping marks on, with the mark scheme open. Start with one free lesson.`}
        />

        <Section title={`Other ${s.code} series`}>
          {(d.older || d.newer) && (
            <nav aria-label="Next and previous series" className="grid gap-3 sm:grid-cols-2">
              {d.older ? (
                <Link href={seriesHref(s.slug, d.older)} className="pc-surface-link group flex min-h-16 items-center justify-between gap-4 rounded-card px-5 py-4">
                  <span>
                    <span className="block text-sm text-faint">Older</span>
                    <span className="block text-lg font-semibold text-foreground">{sessionLabel(d.older)}</span>
                  </span>
                  {arrow}
                </Link>
              ) : (
                <span />
              )}
              {d.newer && (
                <Link href={seriesHref(s.slug, d.newer)} className="pc-surface-link group flex min-h-16 items-center justify-between gap-4 rounded-card px-5 py-4">
                  <span>
                    <span className="block text-sm text-faint">Newer</span>
                    <span className="block text-lg font-semibold text-foreground">{sessionLabel(d.newer)}</span>
                  </span>
                  {arrow}
                </Link>
              )}
            </nav>
          )}
          <dl className="mt-8 space-y-3">
            {years.map((y) => (
              <div key={y} className="grid grid-cols-[3rem_1fr] items-start gap-x-3">
                <dt className="flex min-h-11 items-center text-base font-semibold tabular-nums text-muted-foreground">{y}</dt>
                <dd className="flex flex-wrap gap-2">
                  {others
                    .filter((o) => o.y === y)
                    .map((o) =>
                      o.s === x.s && o.y === x.y ? (
                        <span key={o.s} aria-current="page" className="inline-flex min-h-11 items-center rounded-full bg-white/[0.09] px-4 text-sm font-semibold text-foreground">
                          {SHORT[o.s]}
                        </span>
                      ) : (
                        <Link key={o.s} href={seriesHref(s.slug, o)} aria-label={`${s.code} ${sessionLabel(o)} past papers`} className={chip}>
                          {SHORT[o.s]}
                        </Link>
                      ),
                    )}
                </dd>
              </div>
            ))}
          </dl>
          {d.siblings.length > 0 && (
            <>
              <h3 className="mt-10 text-base font-semibold text-foreground">{label} in other subjects</h3>
              <p className="mt-3 flex flex-wrap gap-2">
                {d.siblings.map((o) => (
                  <Link key={o.s.code} href={o.href} aria-label={`${o.s.name} ${label} past papers`} className={chip}>
                    {o.s.level === s.level ? o.s.short : `${o.s.level === "AS and A Level" ? "A Level" : o.s.level} ${o.s.code}`}
                  </Link>
                ))}
              </p>
            </>
          )}
        </Section>

        <RelatedLinks links={syllabusLinks(s.code, ["tool"])} max={7} />

        <p className="mt-12 text-sm text-faint">Papers, mark schemes and reports are © Cambridge University Press &amp; Assessment, shared here for students&apos; revision.</p>
      </div>
    </MarketingShell>
  );
}
