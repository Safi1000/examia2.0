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
import { YEAR_RANGE, hasPractice, searchName, PAST_PAPER_SYLLABI, fileName, paperHref, paperNumbers, papersFor, pastPaperSyllabus, pdfUrl, sessionKey, sessionLabel, sessionsFor } from "@/lib/past-papers";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";
import { syllabusByCode, SYLLABI } from "@/lib/syllabus";
import { breadcrumbLd, faqLd, fitTitle } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() {
  return PAST_PAPER_SYLLABI.map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = pastPaperSyllabus((await params).slug);
  if (!s) return {};
  const title = `${searchName(s)} Past Papers ${YEAR_RANGE}`;
  const description = `${s.name}${s.next ? ` (${s.next.code} from ${s.next.from})` : ""} past papers ${YEAR_RANGE} with mark schemes, inserts, examiner reports and grade thresholds. Read online, practise timed, no ads.`;
  return {
    title: fitTitle(title),
    description,
    alternates: { canonical: `/past-papers/${s.slug}` },
    openGraph: { title, description, url: `/past-papers/${s.slug}`, type: "website", images: ["/opengraph-image"] },
  };
}

const pill =
  "inline-flex min-h-11 items-center rounded-full border border-hairline px-4 text-[15px] font-semibold text-foreground transition-colors hover:border-gold-border hover:text-gold";

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
  const mcqCount = papers.filter((p) => p.mcq).length;
  const others = PAST_PAPER_SYLLABI.filter((o) => o.code !== s.code && (o.level === s.level || o.subject === s.subject));
  const thresholds = THRESHOLD_PAGES.find((p) => p.code === s.code);
  const syllabus = syllabusByCode(s.code) ?? SYLLABI.find((x) => x.replaces === s.code) ?? null;
  const next = s.next ? syllabusByCode(s.next.code) : s.revised ? syllabus : null;
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
        <div className="mt-8"><Crumbs trail={[{ name: "Past papers", href: "/past-papers" }, { name: s.short }]} /></div>
        <h1 className="mt-4 text-4xl font-bold leading-[1.06] tracking-tight text-foreground md:text-5xl">{searchName(s)} past papers</h1>
        {(s.next || s.revised) && (
          <p className="mt-3 text-[15px] text-muted-foreground">
            {s.next ? `${s.next.code} replaces ${s.code} from ${s.next.from}.` : `New syllabus from ${s.revised}, same code.`}
            {next && (
              <>
                {" "}
                <Link href={`/syllabus/${next.slug}`} className="text-gold hover:underline">
                  What changed
                </Link>
              </>
            )}
          </p>
        )}
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-semibold">
          {hasTopical(s.code) && (
            <Link href={`/past-papers/${s.slug}/topics`} className="text-foreground underline decoration-gold/50 underline-offset-[6px] hover:decoration-gold">
              Revise by topic
            </Link>
          )}
          {hasPractice(s.code) && (
            <Link href={`/past-papers/${s.slug}/practice`} className="text-foreground underline decoration-gold/50 underline-offset-[6px] hover:decoration-gold">
              Quick MCQ quiz
            </Link>
          )}
        </p>

        <div className="mt-10">
          <SyllabusBrowser series={series} papers={paperNumbers(s.code)} />
        </div>

        <TrialBox
          from={`past-papers:${s.code}`}
          subject={s.subject}
          level={s.trialLevel}
          title="Marked your paper and lost marks you can't explain?"
          body={`That is what I fix in class: the exact ${s.short} questions you keep dropping marks on, with the mark scheme open. Start with one free lesson.`}
        />

        <Section title="Keep exploring">
          <nav aria-label="Also for this syllabus" className="flex flex-wrap gap-2">
            {others.map((o) => (
              <Link key={o.code} href={`/past-papers/${o.slug}`} className={pill}>
                {o.level === s.level ? o.short : `${o.level === "AS and A Level" ? "A Level" : o.level} ${o.code}`} papers
              </Link>
            ))}
            {thresholds && (
              <Link href={`/grade-thresholds/${thresholds.slug}`} className={pill}>
                Grade thresholds
              </Link>
            )}
            {syllabus && (
              <Link href={`/syllabus/${syllabus.slug}`} className={pill}>
                Syllabus checklist
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
                <dd className="mt-1.5 text-[17px] leading-relaxed text-muted-foreground">{f.a}</dd>
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
