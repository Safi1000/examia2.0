import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { GradePredictor } from "@/components/landing/GradePredictor";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { Crumbs, Section, Table, TrialBox } from "@/components/study/StudyBits";
import { breadcrumbLd, faqLd, fitTitle } from "@/lib/seo";
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
  const title = renamed
    ? fitTitle(`${p.name} Grade Thresholds (now ${renamed})`)
    : fitTitle(`${p.name} Grade Thresholds (${latest})`);
  const description = `Official Cambridge ${p.name} grade thresholds, June 2024 to ${latest}, every variant, and the marks you need for an A* or A in 2027.`;
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
  faq.push(
    {
      q: "Why are the thresholds different for each variant?",
      a: "Each variant is a different set of question papers. Cambridge sets the minimum marks after marking, so a harder variant gets lower thresholds and an easier one higher. Your variant is the second digit of your paper code, for example 12 or 22 is variant 2.",
    },
    {
      q: "When will the May / June 2027 thresholds come out?",
      a: "Cambridge publishes each session's thresholds on results day, not before. Until then, aim for the highest recent minimum in the targets table above: it would have been enough on every recent paper.",
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
        <p className="mt-5 max-w-[64ch] text-lg leading-relaxed text-muted-foreground">
          The official Cambridge minimum marks for every grade, {sessionsOf(p.syllabuses[0]).join(", ")}, for every paper
          variant. Below them: the totals that would have been enough on every one of those papers, so you know what to aim for
          in 2027.
        </p>
        <a href="#calculator" className="mt-6 inline-flex min-h-11 items-center rounded-full border border-hairline-strong px-5 text-[15px] font-semibold text-body hover:border-gold-border hover:text-foreground">
          Check your own marks
        </a>

        {p.syllabuses.map((s) => {
          const latest = sessionsOf(s)[0];
          const grades = gradesOf(s);
          const top = grades[0];
          const a = spread(s, latest, top);
          const targets = safeTargets(s);
          const g = (x: string) => gradeShown(s.qualification, x);
          return (
            <div key={s.qualification}>
              {p.syllabuses.length > 1 && (
                <h2 className="mt-16 border-t border-hairline pt-10 text-3xl font-bold text-foreground">{s.qualification}</h2>
              )}

              {a && (
                <div className="mt-8 rounded-[20px] border border-gold-border bg-card p-6 md:p-7">
                  <p className="text-sm font-semibold text-gold">{latest}, quick answer</p>
                  <p className="mt-2 text-xl font-semibold leading-snug text-foreground">
                    {g(top) === "A*" ? "An A*" : `Grade ${g(top)}`} needed{" "}
                    {a.low.min === a.high.min
                      ? `${a.low.min} out of ${a.low.max} (${pct(a.low.min, a.low.max)}%)`
                      : `${a.low.min} to ${a.high.min} out of ${a.low.max} (${pct(a.low.min, a.low.max)}% to ${pct(a.high.min, a.high.max)}%)`}
                    .
                  </p>
                </div>
              )}

              <Section
                title={`Marks to aim for in 2027${p.syllabuses.length > 1 ? ` (${s.qualification})` : ""}`}
                intro={
                  <p>
                    The highest minimum for each grade across every variant in {sessionsOf(s).length} sessions. Reach this total and you
                    would have got the grade on every one of those papers. The paper columns split it evenly across your papers.
                  </p>
                }
              >
                {CHANGES_2027[s.code] && (
                  <p className="mb-4 rounded-[14px] border border-hairline bg-card px-4 py-3 text-[15px] leading-relaxed text-muted-foreground">
                    {CHANGES_2027[s.code].note}{" "}
                    <Link href={CHANGES_2027[s.code].href} className="text-gold hover:underline">
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
                        <h3 className="mb-3 text-lg font-semibold text-foreground">
                          {sess}{" "}
                          <a href={s.sessions[sess]!.source} className="ml-2 text-sm font-normal text-gold hover:underline" rel="noopener">
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
          subject={p.subject}
          level={levelName}
          title="Know the target. Now reach it."
          body="Small live classes online, weekly tests I mark myself, and the exam technique that turns a 7-mark answer into an 11. Start with one free lesson."
        />

        <Section title="Questions students ask">
          <FaqList items={faq} />
        </Section>

        <Section title="Other syllabuses">
          <ul className="grid gap-3 sm:grid-cols-2">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/grade-thresholds/${o.slug}`} className="block rounded-[16px] border border-hairline bg-card px-5 py-4 text-foreground hover:border-gold-border">
                  {o.name} grade thresholds
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[15px] text-muted-foreground">
            Why there is no fixed percentage for an A:{" "}
            <Link href="/blog/cambridge-grade-thresholds-explained" className="text-gold hover:underline">
              grade thresholds explained
            </Link>
            .
          </p>
        </Section>
      </article>
    </MarketingShell>
  );
}
