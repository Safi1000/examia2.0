import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { TopicalList } from "@/components/past-papers/TopicalList";
import { PAST_PAPER_SYLLABI, hasPractice, pastPaperSyllabus } from "@/lib/past-papers";
import { topicEntry, topicalFor } from "@/lib/topical";
import { breadcrumbLd } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() {
  return PAST_PAPER_SYLLABI.flatMap((s) =>
    topicalFor(s.code)
      .filter((e) => e.questions.length)
      .map((e) => ({ slug: s.slug, topic: e.slug })),
  );
}

type Props = { params: Promise<{ slug: string; topic: string }> };

async function load(params: Props["params"]) {
  const { slug, topic } = await params;
  const s = pastPaperSyllabus(slug);
  const e = s ? topicEntry(s.code, topic) : null;
  return s && e ? { s, e } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const x = await load(params);
  if (!x) return {};
  const { s, e } = x;
  const codes = s.next ? `${s.code}/${s.next.code}` : s.code;
  const title = `${e.sub.name}: ${codes} Topical Past Paper Questions`;
  const kinds = [e.questions.some((q) => q.kind === "mcq") && "multiple choice", e.questions.some((q) => q.kind === "written") && "written"].filter(Boolean).join(" and ");
  const description = `Every ${s.name} past paper ${kinds} question on ${e.sub.name.toLowerCase()} (topic ${e.sub.num}), newest first, with mark schemes. Answer MCQs on screen. Free, no ads.`;
  const url = `/past-papers/${s.slug}/topics/${e.slug}`;
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "website", images: ["/opengraph-image"] } };
}

export default async function TopicPage({ params }: Props) {
  const x = await load(params);
  if (!x) notFound();
  const { s, e } = x;
  const all = topicalFor(s.code).filter((t) => t.questions.length);
  const i = all.findIndex((t) => t.slug === e.slug);
  const prev = all[i - 1] ?? null;
  const next = all[i + 1] ?? null;
  const hasMcq = e.questions.some((q) => q.kind === "mcq");
  const hasWritten = e.questions.some((q) => q.kind === "written");
  // Newest first; multiple choice before written within a series, so a student checks the idea before writing.
  const questions = [...e.questions].sort((a, b) => b.y - a.y || a.s.localeCompare(b.s) || (a.kind === b.kind ? a.c.localeCompare(b.c) || a.n - b.n : a.kind === "mcq" ? -1 : 1));
  const base = `/past-papers/${s.slug}/topics`;
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Past papers", path: "/past-papers" },
          { name: s.name, path: `/past-papers/${s.slug}` },
          { name: "Topical", path: base },
          { name: e.sub.name, path: `${base}/${e.slug}` },
        ])}
      />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-8 md:pt-12">
        <PastPapersNav className="w-fit max-w-full" />
        <div className="mt-8">
          <Crumbs trail={[{ name: s.short, href: `/past-papers/${s.slug}` }, { name: "Topical", href: base }, { name: e.sub.num }]} />
        </div>
        <p className="mt-5 text-[14px] font-semibold text-gold">
          {e.topic.num} {e.topic.name}
        </p>
        <h1 className="mt-1 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{e.sub.name}</h1>
        <p className="mt-4 max-w-[58ch] text-[17px] leading-relaxed text-muted-foreground">
          {hasMcq && hasWritten
            ? "Every past paper question on this topic. Start with a few multiple choice to check the idea, then try a written one and mark it with the mark scheme."
            : hasMcq
              ? "Every past paper multiple choice question on this topic. Tap an answer to check it."
              : "Every past paper written question on this topic. Try one, then mark it with the mark scheme."}
        </p>
        {hasMcq && hasPractice(s.code) && (
          <p className="mt-5">
            <Link
              href={`/past-papers/${s.slug}/practice?topic=${encodeURIComponent(e.sub.num)}`}
              className="inline-flex min-h-11 items-center rounded-full border border-hairline-strong px-5 text-[15px] font-semibold text-foreground transition-colors hover:border-gold-border"
            >
              Quiz me on this topic
            </Link>
          </p>
        )}

        <div className="mt-8">
          <TopicalList questions={questions} hasMcq={hasMcq} hasWritten={hasWritten} />
        </div>

        <nav aria-label="Other topics" className="mt-12 grid gap-3 sm:grid-cols-2">
          {prev ? (
            <Link href={`${base}/${prev.slug}`} className="rounded-[16px] border border-hairline bg-card px-5 py-4 hover:border-gold-border">
              <span className="block text-[13px] text-faint">← {prev.sub.num}</span>
              <span className="block font-semibold text-foreground">{prev.sub.name}</span>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`${base}/${next.slug}`} className="rounded-[16px] border border-hairline bg-card px-5 py-4 text-right hover:border-gold-border">
              <span className="block text-[13px] text-faint">{next.sub.num} →</span>
              <span className="block font-semibold text-foreground">{next.sub.name}</span>
            </Link>
          )}
        </nav>

        <TrialBox
          from={`topical:${s.code}:${e.sub.num}`}
          subject={s.subject}
          level={s.trialLevel}
          title={`Stuck on ${e.sub.name.toLowerCase()}?`}
          body={`It's one of the topics I teach step by step in class, with past paper questions like these. Start with one free lesson.`}
        />
      </div>
    </MarketingShell>
  );
}
