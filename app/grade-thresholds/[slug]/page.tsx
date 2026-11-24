import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { GradePredictor } from "@/components/landing/GradePredictor";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { ScrollTable as Table } from "./ScrollTable";
import "@/components/landing/public-calm.css";
import { RelatedLinks, syllabusLinks } from "@/components/study/RelatedLinks";
import { breadcrumbLd, faqLd, fitTitle } from "@/lib/seo";
import { fitDescription } from "@/lib/topic-seo";
import { NEXT_SESSION } from "@/lib/grade-thresholds";
import {
  THRESHOLD_PAGES,
  averagePct,
  gradeShown,
  gradesOf,
  pct,
  safeTargets,
  sessionsOf,
  spread,
  thresholdPage,
} from "@/lib/threshold-pages";

/**
 * Syllabuses whose papers change size for 2027 exams: the percentages still
 * guide you, but the per-paper split uses today's paper sizes.
 */
const CHANGES_2027: Record<string, { note: string; href: string }> = {
  "2281": {
    note: "From 2027, Paper 1 is out of 40 and Paper 2 out of 80, so use the percentage column as your target; the paper split below uses the 2026 papers.",
    href: "/blog/o-level-economics-2281-syllabus-2027-changes",
  },
  "0455": {
    note: "From 2027, Paper 1 has 40 questions instead of 30, so use the percentage column as your target; the paper split below uses the 2026 papers.",
    href: "/blog/o-level-igcse-economics-paper-1-mcq-tips",
  },
  "0450": {
    note: "IGCSE Business Studies 0450 is replaced by IGCSE Business 0264 for 2027 exams. These are the last 0450 thresholds, and the best guide to 0264 until Cambridge publishes its first.",
    href: "/blog/igcse-business-0450-justify-evaluate-questions",
  },
  "7115": {
    note: "O Level Business Studies 7115 is replaced by O Level Business 7081 from June 2027. These are the last 7115 thresholds, and the best guide to 7081 until Cambridge publishes its first.",
    href: "/blog/o-level-business-7115-syllabus-explained",
  },
  "7707": {
    note: "From 2027, Paper 1 is out of 40, so use the percentage column as your target; the paper split below uses the 2026 papers.",
    href: "/blog/o-level-accounting-7707-syllabus-2027",
  },
};

/** Business syllabuses renamed for 2027 exams. */
const NEW_CODES: Record<string, string> = { "0450": "0264", "7115": "7081" };

/**
 * The snippet opens with the real headline number for the latest session (the
 * A* minimum where the syllabus has one, else the top grade), then what else
 * the page holds. 140 to 158 characters.
 */
function thresholdDescription(p: NonNullable<ReturnType<typeof thresholdPage>>): string {
  const s = p.syllabuses.find((x) => gradesOf(x)[0] === "A*") ?? p.syllabuses[0];
  const latest = sessionsOf(s)[0];
  const oldest = sessionsOf(s).at(-1);
  const top = gradesOf(s)[0];
  const a = spread(s, latest, top);
  const shown = gradeShown(s.qualification, top);
  const grade = shown === "A*" ? "An A*" : /^[aeiou]/i.test(shown) ? `An ${shown}` : `A ${shown}`;
  const who = `${s.qualification} ${p.subject === "Business" && s.qualification !== "A Level" ? "Business Studies" : p.subject} ${p.code}`;
  const renamed = NEW_CODES[p.code] ? ` (now ${NEW_CODES[p.code]})` : "";
  const fallback = `Official Cambridge ${p.name}${renamed} grade thresholds, ${oldest} to ${latest}, every variant, and the marks you need for an A* or A in 2027.`;
  if (!a) return fitDescription([fallback]);
  const marks =
    a.low.min === a.high.min
      ? `${a.low.min} out of ${a.low.max} (${pct(a.low.min, a.low.max)}%)`
      : `${a.low.min} to ${a.high.min} out of ${a.low.max} (${pct(a.low.min, a.low.max)}% to ${pct(a.high.min, a.high.max)}%)`;
  const head = `${grade} in ${who} needed ${marks} in ${latest}.`;
  return fitDescription([
    `${head} Every variant since ${oldest}, plus 2027 target marks and a grade checker.`,
    `${head} Every variant since ${oldest}, plus 2027 target marks.`,
    `${head} Official thresholds for every variant since ${oldest}, plus 2027 target marks and a grade checker.`,
    `${head} Official thresholds for every variant since ${oldest}, plus 2027 targets.`,
    `${head} Every variant since ${oldest} and 2027 targets.`,
    `${head} Every variant and 2027 targets.`,
    head,
  ]);
}

/**
 * "Why are economics grade thresholds so high?", answered only from the
 * tables: the average A minimum against the other subjects at the same level
 * in the same session. Returns null unless economics really is the highest.
 */
function economicsFaq(p: NonNullable<ReturnType<typeof thresholdPage>>): { q: string; a: string } | null {
  if (p.subject !== "Economics") return null;
  const s = p.syllabuses.find((x) => x.qualification !== "AS Level") ?? p.syllabuses[0];
  const latest = sessionsOf(s)[0];
  const mine = averagePct(s, latest, "A");
  if (mine === null) return null;
  const rivals = THRESHOLD_PAGES.filter((o) => o.subject !== "Economics" && o.level === p.level)
    .map((o) => {
      const r = o.syllabuses.find((x) => x.qualification === s.qualification);
      const v = r ? averagePct(r, latest, "A") : null;
      return v === null || !r ? null : { name: `${r.qualification} ${o.subject === "Business" && r.qualification !== "A Level" ? "Business Studies" : o.subject} ${o.code}`, v };
    })
    .filter((x): x is { name: string; v: number } => x !== null);
  if (!rivals.length || rivals.some((r) => r.v >= mine)) return null;
  const list = rivals.map((r) => `${r.v}% in ${r.name}`);
  const against = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return {
    q: "Why are economics grade thresholds so high?",
    a: `They are higher than in the other subjects on this site. In ${latest} the average minimum for an A in ${s.qualification} Economics ${p.code} was ${mine}% of the total, against ${against}. Cambridge sets each threshold after marking, so it follows how the papers worked out rather than a fixed percentage. A high threshold means every lost mark counts for more.`,
  };
}

type Page = NonNullable<ReturnType<typeof thresholdPage>>;

const rank = (q: string) => (q === "A Level" ? 0 : q === "AS Level" ? 2 : 1);

/**
 * The answer people search for, first on the page: the A* and A minimums
 * (AS Level: a) in the latest series, A Level before AS Level.
 */
function topAnswerOf(p: Page) {
  const latest = sessionsOf(p.syllabuses[0])[0];
  const rows = [...p.syllabuses]
    .sort((x, y) => rank(x.qualification) - rank(y.qualification))
    .flatMap((s) => {
      const own = sessionsOf(s)[0];
      return gradesOf(s)
        .filter((gr) => gr === "A*" || gr === "A")
        .map((gr) => {
          const a = spread(s, own, gr);
          if (!a) return null;
          const shown = gradeShown(s.qualification, gr);
          const who = p.syllabuses.length > 1 ? `${s.qualification} grade ${shown}` : `Grade ${shown}`;
          const marks =
            a.low.min === a.high.min
              ? `${a.low.min} out of ${a.low.max} (${pct(a.low.min, a.low.max)}%)`
              : `${a.low.min} to ${a.high.min} out of ${a.low.max} (${pct(a.low.min, a.low.max)}% to ${pct(a.high.min, a.high.max)}%)`;
          return { label: own === latest ? who : `${who}, ${own}`, marks };
        })
        .filter((r): r is { label: string; marks: string } => r !== null);
    });
  return { latest, rows };
}

/** Results day for the next series, until its thresholds are in the data. */
function pendingOf(p: Page) {
  const next = NEXT_SESSION;
  if (!next || p.syllabuses.some((s) => s.sessions[next.name])) return null;
  const byDate = new Map<string, string[]>();
  for (const s of [...p.syllabuses].sort((x, y) => rank(y.qualification) - rank(x.qualification))) {
    const d = next.resultsDay[s.qualification];
    byDate.set(d, [...(byDate.get(d) ?? []), s.qualification]);
  }
  const join = (xs: string[]) => (xs.length === 2 && xs[0] === "AS Level" && xs[1] === "A Level" ? "AS and A Level" : xs.join(" and "));
  const parts = [...byDate.entries()].map(([d, qs]) => `${join(qs)} results on ${d}`);
  return {
    name: next.name,
    checked: next.checked,
    source: next.source,
    text: `Cambridge releases ${next.name} ${parts.join(", and ")}.`,
  };
}

export const dynamicParams = false;
export function generateStaticParams() {
  return THRESHOLD_PAGES.map((p) => ({ slug: p.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = thresholdPage((await params).slug);
  if (!p) return {};
  const latest = sessionsOf(p.syllabuses[0])[0];
  const renamed = NEW_CODES[p.code];
  // Code and year first: students search "9609 threshold 2026".
  const year = String(latest).match(/\d{4}/)?.[0] ?? "";
  const who = `${p.level === "AS and A Level" ? "A Level" : p.level} ${p.subject}`;
  const full = `${p.code} Grade Thresholds ${year}: ${who} A* and A Marks`;
  const title = renamed
    ? fitTitle(`${p.code} Grade Thresholds ${year}: ${who} (now ${renamed})`)
    : fitTitle(full.length <= 60 ? full : `${p.code} Grade Thresholds ${year}: ${who} A* Marks`);
  const description = thresholdDescription(p);
  const url = `/grade-thresholds/${p.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article", images: ["/opengraph-image"] },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
  };
}

export default async function ThresholdSyllabusPage({ params }: Props) {
  const p = thresholdPage((await params).slug);
  if (!p) notFound();
  const levelName = p.level === "AS and A Level" ? "AS Level" : "O Level / IGCSE";
  const others = THRESHOLD_PAGES.filter((o) => o.slug !== p.slug && (o.level === p.level || o.subject === p.subject));
  const topAnswer = topAnswerOf(p);
  const pending = pendingOf(p);

  // Plain answers to the questions students search, built from the tables.
  const faq = p.syllabuses.flatMap((s) => {
    const latest = sessionsOf(s)[0];
    const top = gradesOf(s)[0];
    const pass = s.qualification === "AS Level" ? "c" : s.qualification === "A Level" ? "C" : "C";
    const a = spread(s, latest, top);
    const c = spread(s, latest, pass === "c" ? "c" : "C");
    const label = `${s.qualification} ${s.subject} ${s.code}`;
    const out: Array<{ q: string; a: string }> = [];
    if (a)
      out.push({
        q: `What mark did you need for ${gradeShown(s.qualification, top) === "A*" ? "an A*" : `a${/^[aeiou]/i.test(top) ? "n" : ""} ${gradeShown(s.qualification, top)}`} in ${label} in ${latest}?`,
        a:
          a.low.min === a.high.min
            ? `${a.low.min} out of ${a.low.max} (${pct(a.low.min, a.low.max)}%).`
            : `Between ${a.low.min} and ${a.high.min} out of ${a.low.max} (${pct(a.low.min, a.low.max)}% to ${pct(a.high.min, a.high.max)}%), depending on your paper variant. The lowest was variant ${a.low.variant}, the highest variant ${a.high.variant}.`,
      });
    if (c)
      out.push({
        q: `What mark did you need for a ${gradeShown(s.qualification, pass)} in ${label} in ${latest}?`,
        a:
          c.low.min === c.high.min
            ? `${c.low.min} out of ${c.low.max} (${pct(c.low.min, c.low.max)}%).`
            : `Between ${c.low.min} and ${c.high.min} out of ${c.low.max} (${pct(c.low.min, c.low.max)}% to ${pct(c.high.min, c.high.max)}%), depending on the variant.`,
      });
    return out;
  });
  const econ = economicsFaq(p);
  if (econ) faq.push(econ);
  if (pending)
    faq.push({
      q: `When are the ${pending.name} grade thresholds for ${p.code} out?`,
      a: `${pending.text} Cambridge publishes grade thresholds after each exam series, and they go on this page as soon as it does. Until then, the ${topAnswer.latest} tables above are the latest.`,
    });
  faq.push(
    {
      q: "Why are the thresholds different for each variant?",
      a: "Each variant is a different set of question papers. Cambridge sets the minimum marks after marking, so a harder variant gets lower thresholds and an easier one higher. Your variant is the second digit of your paper code, for example 12 or 22 is variant 2.",
    },
    {
      q: "When will the May / June 2027 thresholds come out?",
      a: "Cambridge publishes each session's thresholds after the series, never before the exams. Until then, aim for the highest recent minimum in the targets table above: it would have been enough on every recent paper.",
    },
  );

  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Grade thresholds", path: "/grade-thresholds" },
          { name: p.name, path: `/grade-thresholds/${p.slug}` },
        ])}
      />
      <JsonLd data={faqLd(faq)} />

      <article className="mx-auto max-w-4xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Grade thresholds", href: "/grade-thresholds" }, { name: p.name }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{p.name} grade thresholds{NEW_CODES[p.code] ? ` (now ${NEW_CODES[p.code]})` : ""}</h1>

        {topAnswer.rows.length > 0 && (
          <div className="pc-surface mt-8 rounded-card p-5 sm:p-6">
            <p className="text-sm font-semibold text-muted-foreground">Latest series: {topAnswer.latest}</p>
            <dl className="mt-3 space-y-3">
              {topAnswer.rows.map((r) => (
                <div key={r.label}>
                  <dt className="text-base font-semibold text-muted-foreground">{r.label}</dt>
                  <dd className="text-xl font-semibold leading-snug tabular-nums text-foreground">{r.marks}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-faint">Lowest to highest across paper variants. Your variant is the second digit of your paper code.</p>
            <a href="#calculator" className="mt-4 inline-flex min-h-11 items-center rounded-full border border-hairline-strong px-5 text-sm font-semibold text-foreground transition-[background-color,border-color,transform] duration-150 hover:border-white/25 hover:bg-white/[0.04] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
              Check your own marks
            </a>
          </div>
        )}

        {pending && (
          <p className="mt-4 rounded-tile border border-hairline px-4 py-3 text-base leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">{pending.name} thresholds: not out yet.</span> {pending.text} They go on this page as soon as Cambridge
            publishes them. Checked {pending.checked} against{" "}
            <a href={pending.source} rel="noopener" className="font-semibold text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground">
              Cambridge&apos;s key dates (PDF)
            </a>
            .
          </p>
        )}

        {p.syllabuses.map((s, i) => {
          const grades = gradesOf(s);
          const targets = safeTargets(s);
          const g = (x: string) => gradeShown(s.qualification, x);
          return (
            <div key={s.qualification}>
              {p.syllabuses.length > 1 && (
                <h2 className={i === 0 ? "mt-12 text-3xl font-bold text-foreground" : "mt-16 border-t border-hairline pt-10 text-3xl font-bold text-foreground"}>{s.qualification}</h2>
              )}

              <Section
                title={`Marks to aim for in 2027${p.syllabuses.length > 1 ? ` (${s.qualification})` : ""}`}
                intro={
                  <p>Enough for the grade on every variant in the last {sessionsOf(s).length} sessions, split evenly across your papers.</p>
                }
              >
                {CHANGES_2027[s.code] && (
                  <p className="pc-surface mb-4 rounded-tile px-4 py-3 text-base leading-relaxed text-muted-foreground">
                    {CHANGES_2027[s.code].note}{" "}
                    <Link href={CHANGES_2027[s.code].href} className="font-semibold text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground">
                      What changes in 2027
                    </Link>
                    .
                  </p>
                )}
                <Table
                  caption="Safe target totals"
                  head={["Grade", `Total out of ${s.max}`, "Percentage", ...s.papers.map((m, i) => `Paper ${i + 1} (/${m})`)]}
                  rows={targets.map((t) => [g(t.grade), t.safe, `${t.percent}%`, ...t.perPaper])}
                />
              </Section>

              <Section title="How the thresholds have moved" intro={<p>Average minimum across all variants, as a percentage of the total.</p>}>
                <Table
                  caption="Average threshold by session"
                  head={["Session", ...grades.slice(0, s.qualification === "AS Level" ? 5 : 5).map(g)]}
                  rows={sessionsOf(s).map((sess) => [sess, ...grades.slice(0, 5).map((gr) => {
                    const v = averagePct(s, sess, gr);
                    return v === null ? "" : `${v}%`;
                  })])}
                />
              </Section>

              <Section title="Every variant, every session" intro={<p>Minimum weighted total for each grade, exactly as Cambridge published it.</p>}>
                <div className="space-y-8">
                  {sessionsOf(s).map((sess) => {
                    const vs = Object.entries(s.sessions[sess]!.variants).sort(([x], [y]) => x.localeCompare(y));
                    return (
                      <div key={sess}>
                        <h3 className="mb-2 flex flex-wrap items-center gap-x-3 text-lg font-semibold text-foreground">
                          {sess}{" "}
                          <a href={s.sessions[sess]!.source} className="inline-flex min-h-11 items-center text-sm font-normal text-muted-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:text-foreground" rel="noopener">
                            Official table (PDF)
                          </a>
                        </h3>
                        <Table
                          caption={`${sess} thresholds`}
                          head={["Variant", "Out of", ...grades.map(g)]}
                          rows={vs.map(([v, set]) => [`Variant ${v}`, set.max, ...grades.map((gr) => set.thresholds[gr] ?? "")])}
                        />
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Section
                title="How your total is worked out"
                intro={
                  <p>
                    {s.factors.every((f) => f === 1)
                      ? `Your paper marks are simply added together: ${s.papers.map((m, i) => `Paper ${i + 1} out of ${m}`).join(", ")}, ${s.max} in total.`
                      : `Cambridge scales your raw paper marks into a weighted total out of ${s.max} before comparing it with the thresholds. On these tables, ${s.papers
                          .map((m, i) => `one mark on Paper ${i + 1} (out of ${m}) is worth about ${s.factors[i].toFixed(2)} marks of the total`)
                          .join(", and ")}. The predictor below takes your raw marks and does the scaling for you.`}
                  </p>
                }
              >
                {null}
              </Section>
            </div>
          );
        })}

        <Section id="calculator" title="Check your own marks" intro={<p>Enter your mock or past paper marks and see the grade they would have got.</p>}>
          <GradePredictor initial={{ subject: p.syllabuses[0].subject, qual: p.syllabuses[0].qualification }} />
        </Section>

        <TrialBox
          from={`thresholds:${p.slug}`}
          classes
          subject={p.subject}
          level={levelName}
          title="Know the target. Now reach it."
          body="Small live classes online, weekly tests I mark myself, and the exam technique that turns a 7-mark answer into an 11. Start with one free lesson."
        />

        <Section title="Questions students ask">
          <FaqList items={faq} />
        </Section>

        <section aria-labelledby="about-gt" className="mt-12 border-t border-hairline pt-6">
          <h2 id="about-gt" className="text-sm font-semibold text-muted-foreground">About these thresholds</h2>
          <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-faint">
            The official Cambridge minimum marks for every grade, {sessionsOf(p.syllabuses[0]).join(", ")}, for every paper variant. The
            targets table shows the highest minimum for each grade across every variant in those sessions: reach that total and you would have
            got the grade on every one of those papers, so you know what to aim for in 2027.
          </p>
        </section>

        <RelatedLinks links={syllabusLinks(p.code, ["thresholds"])} />

        <Section title="Other syllabuses">
          <ul className="pc-surface divide-y divide-hairline overflow-hidden rounded-card">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/grade-thresholds/${o.slug}`} className="row-link flex min-h-14 items-center px-5 py-3 text-base font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold">
                  {o.name} grade thresholds
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-base text-muted-foreground">
            Why there is no fixed percentage for an A:{" "}
            <Link href="/blog/cambridge-grade-thresholds-explained" className="font-semibold text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground">
              grade thresholds explained
            </Link>
            .
          </p>
        </Section>
      </article>
    </MarketingShell>
  );
}
