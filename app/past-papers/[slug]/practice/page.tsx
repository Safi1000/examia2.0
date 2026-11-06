import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { QuestionPractice } from "@/components/past-papers/QuestionPractice";
import { PAST_PAPER_SYLLABI, hasPractice, paperNumbers, pastPaperSyllabus, practiceQuestions } from "@/lib/past-papers";
import { breadcrumbLd, fitTitle } from "@/lib/seo";
import questionText from "@/lib/past-paper-qtext.json";

/** Topics students look for most, per subject. Only the ones with enough questions are shown. */
const TOPICS: Record<string, string[]> = {
  Accounting: ["depreciation", "partnership", "bank reconciliation", "trial balance", "inventory", "accruals", "control account", "irrecoverable", "ratio", "manufacturing", "suspense", "capital expenditure", "cash budget", "break-even", "budget"],
  Economics: ["price elasticity", "inflation", "exchange rate", "unemployment", "market failure", "opportunity cost", "tax", "monopoly", "balance of payments", "interest rate", "subsidy", "externalities", "supply", "economic growth", "trade union"],
  Business: [],
};
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const dynamicParams = false;
export function generateStaticParams() {
  return PAST_PAPER_SYLLABI.filter((s) => hasPractice(s.code)).map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = pastPaperSyllabus((await params).slug);
  if (!s) return {};
  const title = `${s.name} MCQ Practice by Topic`;
  const description = `Practise real ${s.name} multiple choice past paper questions by topic, one at a time, each marked instantly. Your mistakes are saved so you can redo them. Free, no ads.`;
  const url = `/past-papers/${s.slug}/practice`;
  return { title: fitTitle(title), description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website", images: ["/opengraph-image"] } };
}

export default async function PracticePage({ params }: Props) {
  const s = pastPaperSyllabus((await params).slug);
  if (!s || !hasPractice(s.code)) notFound();
  const questions = practiceQuestions(s.code);
  const nums = [...new Set(questions.map((q) => q.num))];
  const titles = Object.fromEntries(paperNumbers(s.code).map((p) => [p.num, p.title]));
  const papers = nums.map((num) => ({ num, label: `Paper ${num}${titles[num] ? `: ${titles[num]}` : ""}` }));
  const url = `/past-papers/${s.slug}/practice`;
  const live = new Set(questions.map((q) => q.id));
  const qt = Object.entries(questionText as unknown as Record<string, string>).filter(([id]) => live.has(id));
  const topics = (TOPICS[s.subject] ?? [])
    .map((t) => ({ t, n: qt.filter(([, x]) => x.includes(squash(t))).length }))
    .filter((x) => x.n >= 6)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Past papers", path: "/past-papers" },
          { name: s.name, path: `/past-papers/${s.slug}` },
          { name: "Question practice", path: url },
        ])}
      />
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-10 md:pt-14">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past papers", href: "/past-papers" }, { name: s.short, href: `/past-papers/${s.slug}` }, { name: "Question practice" }]} />
        <PastPapersNav className="mt-6 w-fit max-w-full" />
        <h1 className="mt-8 text-3xl font-bold leading-[1.1] tracking-tight text-foreground md:text-5xl">{s.name} question practice</h1>
        <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-muted-foreground">
          Real multiple choice questions from past papers, by topic. One at a time, marked the moment you answer. Anything you get wrong goes on your mistakes list.
        </p>
        <div className="mt-8">
          <QuestionPractice questions={questions} papers={papers} name={s.short} path={url} code={s.code} topics={topics} />
        </div>
        <TrialBox
          from={`practice:${s.code}`}
          subject={s.subject}
          level={s.trialLevel}
          title="Keep getting the same kind of question wrong?"
          body={`That pattern is exactly what I look for in class. We find the ${s.short} topics behind your mistakes and fix them. Start with one free lesson.`}
        />
      </div>
    </MarketingShell>
  );
}
