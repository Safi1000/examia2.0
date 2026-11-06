import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { SyllabusBrowser, type BrowserSeries } from "@/components/past-papers/SyllabusBrowser";
import { PaperSearch } from "@/components/past-papers/PaperSearch";
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
  const next = s.next ? syllabusByCode(s.next.code) : null;
  const faq = [
    {
      q: `Where can I find ${s.name} mark schemes?`,
      a: `Open any paper on this page and tap Mark scheme. Every ${s.code} paper from ${YEAR_RANGE} has its mark scheme, and the insert where the paper uses one. On a laptop you can put the paper and mark scheme side by side.`,
    },
    {
      q: "What does the variant number mean?",
      a: "Cambridge sets more than one version of each paper for different time zones. Paper 1, variant 2 is written 12 on the file. The content and the standard are the same, so practise with any variant.",
    },
    {
      q: "How should I use past papers?",
      a: "Do one paper under timed conditions, mark it with the mark scheme, then read the examiner report for that series. Write down every mark you lost and why. That list is what you revise next.",
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
        <p className="mt-4 max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
          Every paper from {YEAR_RANGE} with its mark scheme. Open one to read it, practise it timed, and see your grade.
        </p>
        <nav aria-label="Switch subject or level" className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {others.map((o) => (
            <Link key={o.code} href={`/past-papers/${o.slug}`} className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-hairline px-4 text-[14px] font-semibold text-muted-foreground transition-colors hover:border-gold-border hover:text-foreground">
              {o.level === s.level ? o.short : `${o.level === "AS and A Level" ? "A Level" : o.level} ${o.code}`}
            </Link>
          ))}
        </nav>
        {hasPractice(s.code) && (
          <Link
            href={`/past-papers/${s.slug}/practice`}
            className="mt-6 flex items-center justify-between gap-4 rounded-[20px] border border-gold-border bg-card-raised px-5 py-4 transition-colors hover:bg-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            <span>
              <span className="block font-semibold text-foreground">Practise the multiple choice questions</span>
              <span className="block text-[15px] text-muted-foreground">One at a time, marked as you tap. Mistakes saved.</span>
            </span>
            <span className="shrink-0 rounded-full bg-gold px-4 py-2 text-[14px] font-semibold text-[#1b1e21]">Start</span>
          </Link>
        )}
        {s.next && (
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
            From {s.next.from}, {s.code} is replaced by <span className="font-semibold text-foreground">{s.next.code}</span>. These papers are still the best practice there is.
            {next && (
              <>
                {" "}
                <Link href={`/syllabus/${next.slug}`} className="font-semibold text-gold hover:underline">
                  {s.next.code} syllabus
                </Link>
              </>
            )}
          </p>
        )}

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

        <Section title="Also for this syllabus">
          <nav aria-label="Also for this syllabus" className="flex flex-wrap gap-2">
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
