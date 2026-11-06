import type { Metadata } from "next";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs } from "@/components/study/StudyBits";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { SearchInside } from "@/components/past-papers/SearchInside";
import { PAST_PAPER_SYLLABI } from "@/lib/past-papers";
import { fitTitle } from "@/lib/seo";

const title = "Search Inside Past Papers: Find Questions by Topic";
const description = "Type a topic like price elasticity, depreciation or motivation and see every Cambridge Accounting, Business and Economics past paper question that mentions it.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/past-papers/search" },
  openGraph: { title, description, url: "/past-papers/search", type: "website", images: ["/opengraph-image"] },
};

const SUGGESTIONS = ["price elasticity", "depreciation", "inflation", "exchange rate", "break-even", "market failure", "working capital", "motivation", "partnership", "cash flow"];

export default function SearchInsidePage() {
  const syllabi = PAST_PAPER_SYLLABI.map((s) => ({ code: s.code, label: `${s.level === "AS and A Level" ? "A Level" : s.level} ${s.short}` }));
  return (
    <MarketingShell>
      <div className="mx-auto max-w-3xl px-5 pb-24 pt-8 md:pt-12">
        <PastPapersNav className="w-fit max-w-full" />
        <div className="mt-8">
          <Crumbs trail={[{ name: "Past papers", href: "/past-papers" }, { name: "Search inside papers" }]} />
        </div>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-foreground md:text-5xl">Search inside papers</h1>
        <p className="mt-3 max-w-[54ch] text-lg leading-relaxed text-muted-foreground">Remember a question about coffee prices or a bakery&apos;s cash flow? Type a few words. I&apos;ll find the page.</p>
        <div className="mt-8">
          <SearchInside syllabi={syllabi} suggestions={SUGGESTIONS} />
        </div>
      </div>
    </MarketingShell>
  );
}
