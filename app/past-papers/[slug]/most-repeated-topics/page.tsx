import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { RepeatedTopicsTable } from "@/components/past-papers/RepeatedTopicsTable";
import { PAST_PAPER_SYLLABI, pastPaperSyllabus } from "@/lib/past-papers";
import { hasTopical } from "@/lib/topical";
import { countedLine, repeatedDescription, repeatedTitle, repeatedTopics } from "@/lib/repeated-topics";
import { breadcrumbLd } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() {
  return PAST_PAPER_SYLLABI.filter((s) => hasTopical(s.code)).map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

async function load(params: Props["params"]) {
  const s = pastPaperSyllabus((await params).slug);
  if (!s || !hasTopical(s.code)) return null;
  const d = repeatedTopics(s);
  return d.rows.length ? { s, d } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const x = await load(params);
  if (!x) return {};
  const title = repeatedTitle(x.s);
  const description = repeatedDescription(x.s, x.d);
  const url = `/past-papers/${x.s.slug}/most-repeated-topics`;
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website", images: ["/opengraph-image"] } };
}

const link = "text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export default async function MostRepeatedTopicsPage({ params }: Props) {
  const x = await load(params);
  if (!x) notFound();
  const { s, d } = x;
  const path = `/past-papers/${s.slug}/most-repeated-topics`;
  const all = d.scopes[0];
  const papers = d.scopes.filter((p) => p.id !== "all");
  const range = d.firstYear === d.lastYear ? `${d.firstYear}` : `${d.firstYear} to ${d.lastYear}`;
  const oldCode = s.next ? ` Older ${s.code} questions are filed under the new ${s.next.code} topics, so the list matches what you will sit.` : "";
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Past papers", path: "/past-papers" },
          { name: s.name, path: `/past-papers/${s.slug}` },
          { name: "Most repeated topics", path },
        ])}
      />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-8 md:pt-12">
        <PastPapersNav className="w-fit max-w-full" />
        <div className="mt-8">
          <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past papers", href: "/past-papers" }, { name: s.short, href: `/past-papers/${s.slug}` }, { name: "Most repeated topics" }]} />
        </div>
        <h1 className="mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{s.short} most repeated topics</h1>
        <p className="mt-3 text-base text-muted-foreground">{countedLine(d)}</p>

        <div className="mt-8">
          <RepeatedTopicsTable rows={d.rows} scopes={d.scopes} />
        </div>

        <section aria-labelledby="how" className="mt-14">
          <h2 id="how" className="text-xl font-bold text-foreground">How to use this</h2>
          <ul className="mt-4 list-disc space-y-3 pl-5 text-lg leading-relaxed text-body marker:text-faint">
            <li>Start at the top. Do every past paper question on your top five topics, with the mark scheme open.</li>
            <li>Switch to the paper you are weakest on. The ranking changes: some topics are mostly multiple choice, others mostly written.</li>
            <li>Do not skip the bottom of the list. A rare topic can still be a full written question, so cover every topic at least once.</li>
          </ul>
          <p className="mt-5 text-base text-muted-foreground">
            <Link href={`/past-papers/${s.slug}/topics`} className={link}>
              All {s.short} questions by topic
            </Link>{" "}
            ·{" "}
            <Link href={`/past-papers/${s.slug}`} className={link}>
              Full papers
            </Link>
          </p>
        </section>

        <TrialBox
          from={`repeated-topics:${s.code}`}
          classes
          subject={s.subject}
          level={s.trialLevel}
          title="Know the topics but still dropping marks?"
          body={`In class we work through the ${s.short} questions that come up most, with the mark scheme open. Start with one free lesson.`}
        />

        <section aria-labelledby="about" className="mt-12 border-t border-hairline pt-6">
          <h2 id="about" className="text-sm font-semibold text-muted-foreground">About these counts</h2>
          <div className="mt-2 max-w-[70ch] space-y-2 text-sm leading-relaxed text-faint">
            <p>
              Counted from the {s.short} past papers on this site, {range}: {all.questions.toLocaleString("en-GB")} questions from {d.papers} question papers across {all.series} exam series
              {papers.length ? ` (${papers.map((p) => `Paper ${p.id}, ${p.kind}`).join("; ")})` : ""}. Other papers are not tagged by topic yet, so they are not counted.
            </p>
            <p>
              Every question on these papers is tagged to the syllabus subtopic it tests, using the current Cambridge syllabus.{oldCode} Each question counts once, under its main topic. A topic page can show a few more
              questions, because it also lists written questions where that topic is the second one tested.
            </p>
            <p>
              A written question counts once with all its parts. Every variant counts separately (Paper 1 variant 1, 2 and 3 are different papers with different questions). Series counts how many exam series (for example May/June 2024) had at least
              one question on the topic, in any variant.
              {d.removed > 0 && ` ${d.removed} multiple choice ${d.removed === 1 ? "question" : "questions"} Cambridge removed from marking ${d.removed === 1 ? "is" : "are"} left out.`}
              {d.untagged > 0 && ` ${d.untagged} ${d.untagged === 1 ? "question" : "questions"} without a topic tag ${d.untagged === 1 ? "is" : "are"} left out.`}
            </p>
            <p>A topic that came up often is likely to come up again, but Cambridge can set any topic in the syllabus. Use this to order your revision, not to drop topics.</p>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
