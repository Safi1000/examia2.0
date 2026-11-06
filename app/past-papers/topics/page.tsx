import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs } from "@/components/study/StudyBits";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { PAPER_LEVELS, PAST_PAPER_SYLLABI, codesLabel } from "@/lib/past-papers";
import { hasTopical } from "@/lib/topical";

const title = "Topical Past Papers: Accounting, Business, Economics";
const description = "Cambridge O Level, IGCSE and A Level past paper questions sorted by syllabus topic, Paper 1 and Paper 2, with mark schemes. Free, no ads.";

export const metadata: Metadata = {
  title: { absolute: `${title} | Hamza Teaches` },
  description,
  alternates: { canonical: "/past-papers/topics" },
  openGraph: { title, description, url: "/past-papers/topics", type: "website", images: ["/opengraph-image"] },
};

export default function TopicsHub() {
  const list = PAST_PAPER_SYLLABI.filter((s) => hasTopical(s.code));
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-8 md:pt-12">
        <PastPapersNav className="w-fit max-w-full" />
        <div className="mt-8">
          <Crumbs trail={[{ name: "Past papers", href: "/past-papers" }, { name: "Topical" }]} />
        </div>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground md:text-5xl">Topical past papers</h1>
        <p className="mt-4 max-w-[54ch] text-lg leading-relaxed text-muted-foreground">Every Paper 1 and Paper 2 question, filed under the topic it tests. Weak on one topic? Do every question ever set on it, back to back.</p>
        <div className="mt-10 space-y-8">
          {PAPER_LEVELS.map((lvl) => {
            const here = list.filter((s) => s.level === lvl);
            if (!here.length) return null;
            return (
              <section key={lvl} aria-labelledby={`tl-${lvl}`}>
                <h2 id={`tl-${lvl}`} className="text-[13px] font-semibold uppercase tracking-[0.2em] text-faint">
                  {lvl}
                </h2>
                <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
                  {here.map((s) => (
                    <li key={s.code}>
                      <Link href={`/past-papers/${s.slug}/topics`} className="group flex min-h-14 items-center justify-between gap-4 py-3">
                        <span className="font-semibold text-foreground group-hover:text-gold">{s.subject === "Business" && s.level !== "AS and A Level" ? "Business Studies" : s.subject}</span>
                        <span className="text-[14px] tabular-nums text-faint">{codesLabel(s)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </MarketingShell>
  );
}
