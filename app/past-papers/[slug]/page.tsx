import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { PAST_PAPER_SYLLABI, fileUrl, paperCount, paperLabel, pastPaperSyllabus, sessionLabel, sessionsFor, type PaperSession } from "@/lib/past-papers";
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
  const title = `${s.name} Past Papers 2022 to 2026`;
  const description = `All ${s.name} past papers from 2022 to 2026 with mark schemes, inserts, examiner reports and grade thresholds, sorted by series. Free.`;
  return {
    title: fitTitle(title),
    description,
    alternates: { canonical: `/past-papers/${s.slug}` },
    openGraph: { title, description, url: `/past-papers/${s.slug}`, type: "website", images: ["/opengraph-image"] },
  };
}

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
const pill =
  "inline-flex min-h-11 items-center rounded-full border border-hairline px-4 text-[15px] font-semibold text-foreground transition-colors hover:border-gold-border hover:text-gold";

function SessionBlock({ code, s }: { code: string; s: PaperSession }) {
  const papers = Object.entries(s.p).filter(([, t]) => t.includes("q") || t.includes("m"));
  return (
    <div>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {papers.map(([pv, t]) => (
          <li key={pv} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <span className="font-semibold text-foreground">{paperLabel(pv)}</span>
            <span className="flex flex-wrap gap-2">
              {t.includes("q") && (
                <a href={fileUrl(code, s, "qp", pv)} {...ext} className={pill}>
                  Question paper
                </a>
              )}
              {t.includes("m") && (
                <a href={fileUrl(code, s, "ms", pv)} {...ext} className={pill}>
                  Mark scheme
                </a>
              )}
              {t.includes("i") && (
                <a href={fileUrl(code, s, "in", pv)} {...ext} className={pill}>
                  Insert
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
      {(s.er || s.gt) && (
        <p className="mt-3 flex flex-wrap gap-2">
          {s.er && (
            <a href={fileUrl(code, s, "er")} {...ext} className={pill}>
              Examiner report
            </a>
          )}
          {s.gt && (
            <a href={fileUrl(code, s, "gt")} {...ext} className={pill}>
              Grade thresholds
            </a>
          )}
        </p>
      )}
    </div>
  );
}

export default async function PastPaperSyllabusPage({ params }: Props) {
  const s = pastPaperSyllabus((await params).slug);
  if (!s) notFound();
  const sessions = sessionsFor(s.code);
  const thresholds = THRESHOLD_PAGES.find((p) => p.code === s.code);
  const syllabus = syllabusByCode(s.code) ?? SYLLABI.find((x) => x.replaces === s.code) ?? null;
  const next = s.next ? syllabusByCode(s.next.code) : null;
  const faq = [
    {
      q: `Where can I find ${s.name} mark schemes?`,
      a: `Next to each paper on this page. Every ${s.code} paper from 2022 to 2026 has its mark scheme, and inserts where the paper uses one.`,
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
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past papers", href: "/past-papers" }, { name: s.short }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{s.name} past papers</h1>
        <p className="mt-5 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">
          {paperCount(s.code)} papers from 2022 to 2026, newest first, each with its mark scheme. Examiner reports and grade thresholds sit under each series.
        </p>
        {s.next && (
          <p className="mt-5 rounded-[16px] border border-gold-border bg-card px-5 py-4 text-[17px] leading-relaxed text-muted-foreground">
            From {s.next.from}, {s.code} is replaced by <span className="font-semibold text-foreground">{s.next.code}</span>. These papers are still the best practice you can get.
            {next && (
              <>
                {" "}
                <Link href={`/syllabus/${next.slug}`} className="font-semibold text-gold hover:underline">
                  See the {s.next.code} syllabus
                </Link>
              </>
            )}
          </p>
        )}
        <nav aria-label="Also for this syllabus" className="mt-6 flex flex-wrap gap-2">
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

        {sessions.slice(0, 2).map((x) => (
          <Section key={`${x.y}${x.s}`} title={sessionLabel(x)}>
            <SessionBlock code={s.code} s={x} />
          </Section>
        ))}

        <TrialBox
          from={`past-papers:${s.code}`}
          subject={s.subject}
          level={s.trialLevel}
          title="Marked your paper and lost marks you can't explain?"
          body={`That is what I fix in class: the exact ${s.short} questions you keep dropping marks on, with the mark scheme open. Start with one free lesson.`}
        />

        <Section title="Earlier series">
          <div className="space-y-3">
            {sessions.slice(2).map((x) => (
              <details key={`${x.y}${x.s}`} className="group rounded-[16px] border border-hairline bg-card px-5 py-1 open:pb-5">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between font-semibold text-foreground">
                  {sessionLabel(x)}
                  <span aria-hidden className="text-gold transition-transform group-open:rotate-45">+</span>
                </summary>
                <div className="mt-2">
                  <SessionBlock code={s.code} s={x} />
                </div>
              </details>
            ))}
          </div>
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
          Papers are © Cambridge University Press &amp; Assessment. Links open the files on PapaCambridge, a free public archive.
        </p>
      </div>
    </MarketingShell>
  );
}
