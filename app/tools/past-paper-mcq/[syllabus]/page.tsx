import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { TopicPractice } from "@/components/tools/TopicPractice";
import { liveSyllabuses, paperName, questionLink, paperSlug, papersFor, syllabusBySlug, syllabusName, topicQuestions } from "@/lib/mcq-papers";
import { breadcrumbLd } from "@/lib/seo";
import "@/components/landing/public-calm.css";

export const dynamicParams = false;
export function generateStaticParams() {
  return liveSyllabuses().map((s) => ({ syllabus: s.slug }));
}

type Props = { params: Promise<{ syllabus: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = syllabusBySlug((await params).syllabus);
  if (!s) return {};
  const url = `/tools/past-paper-mcq/${s.slug}`;
  const title = `${syllabusName(s)} Paper ${s.paper} Past Papers: MCQ Checker`;
  const description = `Mark real Cambridge ${syllabusName(s)} Paper ${s.paper} multiple-choice past papers instantly, under exam timing or one topic at a time.`;
  return {
    title: `${title} | Hamza Teaches`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: ["/opengraph-image"] },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
  };
}

export default async function McqSyllabusPage({ params }: Props) {
  const s = syllabusBySlug((await params).syllabus);
  if (!s) notFound();
  const papers = papersFor(s.slug);
  const topics = topicQuestions(s.slug).map(([topic, qs]) => ({
    topic,
    items: qs.map(({ paper, n }) => ({
      paper: paperName(s, paper),
      questionPaper: questionLink(paper, n),
      n,
      correct: paper.answers[n - 1],
      note: paper.notes?.[n],
    })),
  }));
  const name = `${syllabusName(s)}, Paper ${s.paper}`;

  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Past paper MCQ checker", path: "/tools/past-paper-mcq" },
          { name, path: `/tools/past-paper-mcq/${s.slug}` },
        ])}
      />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past paper MCQ checker", href: "/tools/past-paper-mcq" }, { name }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{name}: past paper checker</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Pick a paper for a timed mock, or practise one topic at a time from real past paper questions.
        </p>

        <Section title="Timed mock papers">
          <ul className="pc-surface divide-y divide-hairline overflow-hidden rounded-card">
            {papers.map((p) => (
              <li key={paperSlug(p)}>
                <Link
                  href={`/tools/past-paper-mcq/${s.slug}/${paperSlug(p)}`}
                  className="row-link flex min-h-16 items-center justify-between gap-4 px-5 py-4 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold"
                >
                  <span className="min-w-0 text-base font-semibold">{paperName(s, p)}</span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {p.answers.length} questions · {p.minutes} min
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        {topics.length > 0 && (
          <Section title="Practise by topic" intro={<p>Choose a topic. Each question is checked as soon as you answer it.</p>}>
            <TopicPractice topics={topics} syllabus={s.slug} />
          </Section>
        )}

        <TrialBox
          from={`tools:mcq:${s.slug}`}
          subject={s.subject}
          title="Know your score. Fix the gaps."
          body="Bring your marked papers to a free trial lesson, and we will work through the questions that keep costing you marks."
        />

        <p className="mt-12 text-sm leading-relaxed text-faint">
          Question papers and mark schemes are Cambridge&apos;s, linked from its{" "}
          <a href={s.pastPapers} className="underline underline-offset-4 hover:text-muted-foreground" rel="noopener">
            {s.code} past papers page
          </a>
          . Topic tags and explanations are mine.
        </p>
      </div>
    </MarketingShell>
  );
}
