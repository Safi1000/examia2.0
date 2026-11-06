import type { Metadata } from "next";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs } from "@/components/study/StudyBits";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { ProgressView, type ProgressSyllabus } from "@/components/past-papers/ProgressView";
import { EXAMS } from "@/lib/study-plan";
import { PAST_PAPER_SYLLABI, cieCode, hasPractice, paperHref, paperTitle, papersFor } from "@/lib/past-papers";

export const metadata: Metadata = {
  title: "My past paper progress | Hamza Teaches",
  description: "Your past paper scores, grades and mistakes, saved on your device.",
  alternates: { canonical: "/past-papers/progress" },
  robots: { index: false, follow: true },
};

export default function ProgressPage() {
  const syllabi: ProgressSyllabus[] = PAST_PAPER_SYLLABI.map((s) => ({
    code: s.code,
    short: s.short,
    level: s.level,
    slug: s.slug,
    practice: hasPractice(s.code),
    papers: papersFor(s.code).map((p) => ({ k: p.key, c: cieCode(p), u: paperHref(s.slug, p), t: paperTitle(p) })),
  }));
  return (
    <MarketingShell>
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-10 md:pt-14">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past papers", href: "/past-papers" }, { name: "My progress" }]} />
        <PastPapersNav className="mt-6 w-fit max-w-full" />
        <h1 className="mt-8 text-3xl font-bold leading-[1.1] tracking-tight text-foreground md:text-5xl">My progress</h1>
        <div className="mt-8">
          <ProgressView syllabi={syllabi} exam={{ name: EXAMS.name, start: EXAMS.start }} />
        </div>
      </div>
    </MarketingShell>
  );
}
