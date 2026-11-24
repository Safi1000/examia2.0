import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { SyllabusBrowser, type BrowserSeries } from "@/components/past-papers/SyllabusBrowser";
import { PaperSearch } from "@/components/past-papers/PaperSearch";
import { hasTopical } from "@/lib/topical";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { syllabusLinks } from "@/components/study/RelatedLinks";
import { searchName, PAST_PAPER_SYLLABI, fileName, paperHref, paperNumbers, papersFor, pastPaperSyllabus, pdfUrl, sessionKey, sessionLabel, sessionsFor } from "@/lib/past-papers";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";
import { syllabusByCode, SYLLABI } from "@/lib/syllabus";
import { breadcrumbLd, faqLd } from "@/lib/seo";
import { hubDescription, hubIntro, hubTitle } from "@/lib/paper-seo";
import { reportHref, reportsFor } from "@/lib/examiner-reports";

export const dynamicParams = false;
export function generateStaticParams() {
  return PAST_PAPER_SYLLABI.map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = pastPaperSyllabus((await params).slug);
  if (!s) return {};
  // "7707 Past Papers 2022 to 2026: Papers and Mark Schemes", years from the papers held.
  const title = hubTitle(s);
  const description = hubDescription(s);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/past-papers/${s.slug}` },
    openGraph: { title, description, url: `/past-papers/${s.slug}`, type: "website", images: ["/opengraph-image"] },
  };
}

/** One row of the "Keep exploring" list: the same quiet rows as on every other study page. */
const pill =
  "flex min-h-14 items-center justify-between gap-4 py-3 font-semibold text-foreground transition-colors duration-150 after:shrink-0 after:font-normal after:text-faint after:content-['→'] hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export default async function PastPaperSyllabusPage({ params }: Props) {
  const s = pastPaperSyllabus((await params).slug);
  if (!s) notFound();
  const papers = papersFor(s.code);
  const series: BrowserSeries[] = sessionsFor(s.code).map((x) => ({
    id: sessionKey(x),
    label: sessionLabel(x),
    year: x.y,
    s: x.s,
    er: x.er ? pdfUrl(fileName(s.code, x, "er")) : null,
    gt: x.gt ? pdfUrl(fileName(s.code, x, "gt")) : null,
    papers: papers
      .filter((p) => p.session === x)
      .map((p) => ({ key: p.key, href: paperHref(s.slug, p), num: p.num, pv: p.pv, title: p.title, minutes: p.minutes, marks: p.marks, mcq: p.mcq, insert: p.insert })),
  }));
  const others = PAST_PAPER_SYLLABI.filter((o) => o.code !== s.code && (o.level === s.level || o.subject === s.subject));
  const thresholds = THRESHOLD_PAGES.find((p) => p.code === s.code);
  const syllabus = syllabusByCode(s.code) ?? SYLLABI.find((x) => x.replaces === s.code) ?? null;
  const next = s.next ? syllabusByCode(s.next.code) : s.revised ? syllabus : null;
  const intro = hubIntro(s);
  const tool = syllabusLinks(s.code).find((l) => l.href.startsWith("/tools/"));
  const faq = [
    {
      q: `Where are the ${s.code} mark schemes?`,
      a: `Right next to each paper. Open one and tap Mark scheme. On a laptop, put them side by side and mark as you go. Inserts are there too, for the papers that use one.`,
    },
    {
      q: "Variant 1, 2, 3: which one do I do?",
      a: "Any. Cambridge writes a few versions of each paper for different time zones, same standard, different questions. Paper 1 variant 2 is the 12 in the file name. More variants just means more practice.",
    },
    {
      q: "How do I actually use past papers?",
      a: "Sit one against the clock. Mark it honestly with the mark scheme. Read the examiner report for that series. Then write down every mark you lost and why. That list is your revision plan, and it's shorter than you think.",
    },
  ];
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Past papers", path: "/past-papers" }, { name: s.name, path: `/past-papers/${s.slug}` }])} />
      <JsonLd data={faqLd(faq)} />
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-8 md:pt-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PastPapersNav className="w-fit max-w-full" />
          <PaperSearch compact className="w-full sm:w-[300px]" />
        </div>
        <div className="mt-8"><Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past papers", href: "/past-papers" }, { name: s.short }]} /></div>
        <h1 className="mt-4 text-4xl font-bold leading-[1.06] tracking-tight text-foreground md:text-5xl">{searchName(s)} past papers</h1>
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-base font-semibold">
          {hasTopical(s.code) && (
            <Link href={`/past-papers/${s.slug}/topics`} className="inline-flex min-h-11 items-center text-foreground underline decoration-hairline-strong underline-offset-[6px] transition-colors duration-150 hover:decoration-foreground">
              Revise by topic
            </Link>
          )}
          {hasTopical(s.code) && (
            <Link href={`/past-papers/${s.slug}/most-repeated-topics`} className="inline-flex min-h-11 items-center text-muted-foreground underline decoration-hairline-strong underline-offset-[6px] transition-colors duration-150 hover:text-foreground">
              Most repeated topics
            </Link>
          )}
          {(s.next || s.revised) && next && (
            <Link href={`/syllabus/${next.slug}`} className="inline-flex min-h-11 items-center text-muted-foreground underline decoration-hairline-strong underline-offset-[6px] transition-colors duration-150 hover:text-foreground">
              What changed for 2027
            </Link>
          )}
        </p>

        <div className="mt-10">
          <SyllabusBrowser series={series} papers={paperNumbers(s.code)} />
        </div>

        <TrialBox
          from={`past-papers:${s.code}`}
          classes
          subject={s.subject}
          level={s.trialLevel}
          title="Marked your paper and lost marks you can't explain?"
          body={`That is what I fix in class: the exact ${s.short} questions you keep dropping marks on, with the mark scheme open. Start with one free lesson.`}
        />

        {intro.length > 0 && (
          <section aria-labelledby="about-p" className="mt-12 border-t border-hairline pt-6">
            <h2 id="about-p" className="text-sm font-semibold text-muted-foreground">About these papers</h2>
            <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-faint">{intro.join(" ")}</p>
          </section>
        )}

        <Section title="Keep exploring">
          <nav aria-label="Also for this syllabus" className="flex flex-col divide-y divide-hairline border-y border-hairline text-lg">
            {others.map((o) => (
              <Link key={o.code} href={`/past-papers/${o.slug}`} className={pill}>
                {o.level === s.level ? o.short : `${o.level === "AS and A Level" ? "A Level" : o.level} ${o.code}`} papers
              </Link>
            ))}
            {reportsFor(s.code)[0] && (
              <Link href={reportHref(reportsFor(s.code)[0])} className={pill}>
                Examiner report: common mistakes by paper
              </Link>
            )}
            {thresholds && (
              <Link href={`/grade-thresholds/${thresholds.slug}`} className={pill}>
                Grade thresholds for {thresholds.name}
              </Link>
            )}
            {syllabus && (
              <Link href={`/syllabus/${syllabus.slug}`} className={pill}>
                {syllabus.name} syllabus checklist
              </Link>
            )}
            {tool && (
              <Link href={tool.href} className={pill}>
                {tool.label}
              </Link>
            )}
            <Link href="/tools/grade-predictor" className={pill}>
              Grade predictor
            </Link>
          </nav>
        </Section>

        <Section title="Questions students ask">
          <dl className="space-y-6">
            {faq.map((f) => (
              <div key={f.q}>
                <dt className="font-semibold text-foreground">{f.q}</dt>
                <dd className="mt-1.5 text-lg leading-relaxed text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </Section>
        <p className="mt-12 text-sm text-faint">
          Papers, mark schemes and reports are © Cambridge University Press &amp; Assessment, shared here for students&apos; revision.
        </p>
      </div>
    </MarketingShell>
  );
}
