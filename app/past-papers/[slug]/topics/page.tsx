import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { TopicProgress } from "@/components/past-papers/TopicProgress";
import { PAST_PAPER_SYLLABI, pastPaperSyllabus, searchName } from "@/lib/past-papers";
import { currentSyllabus, hasTopical, topicalFor } from "@/lib/topical";
import { breadcrumbLd } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() {
  return PAST_PAPER_SYLLABI.filter((s) => hasTopical(s.code)).map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = pastPaperSyllabus((await params).slug);
  if (!s) return {};
  const title = `${searchName(s)} Topical Past Papers`;
  const description = `${s.name}${s.next ? ` and ${s.next.code}` : ""} past paper questions sorted by syllabus topic: Paper 1 and Paper 2, with mark schemes. Answer multiple choice on screen. Free, no ads.`;
  const url = `/past-papers/${s.slug}/topics`;
  return { title: { absolute: `${title} | Hamza Teaches` }, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website", images: ["/opengraph-image"] } };
}

export default async function TopicIndex({ params }: Props) {
  const s = pastPaperSyllabus((await params).slug);
  if (!s || !hasTopical(s.code)) notFound();
  const syl = currentSyllabus(s)!;
  const entries = topicalFor(s.code);
  const url = `/past-papers/${s.slug}/topics`;
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Past papers", path: "/past-papers" },
          { name: s.name, path: `/past-papers/${s.slug}` },
          { name: "Topical", path: url },
        ])}
      />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-8 md:pt-12">
        <PastPapersNav className="w-fit max-w-full" />
        <div className="mt-8">
          <Crumbs trail={[{ name: "Past papers", href: "/past-papers" }, { name: s.short, href: `/past-papers/${s.slug}` }, { name: "Topical" }]} />
        </div>
        <h1 className="mt-4 text-4xl font-bold leading-[1.06] tracking-tight text-foreground md:text-5xl">{searchName(s)} topical past papers</h1>
        <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
          Every Paper 1 and Paper 2 question, sorted by the topic it tests{s.next ? `, using the new ${s.next.code} topics` : s.revised ? `, using the new ${s.revised} syllabus` : ""}. Pick the one that keeps biting you.
        </p>

        <div className="mt-10 space-y-10">
          {syl.topics.map((topic) => {
            const subs = entries.filter((e) => e.topic.num === topic.num);
            return (
              <section key={topic.num} aria-labelledby={`t-${topic.num}`}>
                <h2 id={`t-${topic.num}`} className="flex items-baseline gap-3 text-xl font-bold text-foreground">
                  <span className="tabular-nums text-faint">{topic.num}</span>
                  {topic.name}
                </h2>
                <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
                  {subs.map((e) => {
                    const mcq = e.questions.some((q) => q.kind === "mcq");
                    const written = e.questions.some((q) => q.kind === "written");
                    if (!e.questions.length)
                      return (
                        <li key={e.sub.num} className="flex min-h-14 items-center gap-3 py-3 text-faint">
                          <span className="w-10 shrink-0 text-[14px] tabular-nums">{e.sub.num}</span>
                          <span className="flex-1">{e.sub.name}</span>
                          <span className="text-[13px]">New topic</span>
                        </li>
                      );
                    return (
                      <li key={e.sub.num}>
                        <Link href={`${url}/${e.slug}`} className="group flex min-h-14 items-center gap-3 py-3">
                          <span className="w-10 shrink-0 text-[14px] tabular-nums text-faint">{e.sub.num}</span>
                          <span className="flex-1 font-semibold text-foreground group-hover:text-gold">{e.sub.name}</span>
                          <span className="hidden text-[13px] text-faint sm:inline">{[mcq && "MCQ", written && "Written"].filter(Boolean).join(" · ")}</span>
                          <TopicProgress ids={e.questions.map((q) => q.id)} />
                          <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-faint group-hover:text-gold" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m8 5 5 5-5 5" />
                          </svg>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <TrialBox
          from={`topical:${s.code}`}
          subject={s.subject}
          level={s.trialLevel}
          title="A topic that just won't click?"
          body={`That's what my classes are for: we take the ${s.short} topics you find hardest and work through them until they make sense. Start with one free lesson.`}
        />
      </div>
    </MarketingShell>
  );
}
