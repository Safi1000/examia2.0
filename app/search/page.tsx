import type { Metadata } from "next";
import { MarketingShell } from "@/components/landing/MarketingShell";
import "@/components/landing/public-calm.css";
import { SiteSearch } from "@/components/SiteSearch";

/** One search for the whole site. Kept out of search engines: results pages are not content. */
export const metadata: Metadata = {
  title: "Search | Hamza Teaches",
  description: "Search Hamza Teaches: past papers, questions by topic, articles, grade thresholds, syllabus checklists and free tools for Accounting, Business and Economics.",
  alternates: { canonical: "/search" },
  robots: { index: false, follow: true },
};

export default function SearchPage() {
  return (
    <MarketingShell>
      <div className="public-calm mx-auto max-w-2xl px-4 pb-24 pt-8 sm:px-5 md:pt-14">
        <h1 className="text-4xl font-bold tracking-tight text-ink md:text-5xl">Search</h1>
        <div className="mt-6">
          <SiteSearch />
        </div>
      </div>
    </MarketingShell>
  );
}
