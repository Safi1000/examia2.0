import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { PAST_PAPER_SYLLABI, paperCount } from "@/lib/past-papers";
import { breadcrumbLd, fitTitle } from "@/lib/seo";

const title = "Cambridge Past Papers 2022 to 2026: Accounting, Business, Economics";
const description =
  "Every O Level, IGCSE and A Level Accounting, Business and Economics past paper from 2022 to 2026, with mark schemes, inserts, examiner reports and grade thresholds.";

export const metadata: Metadata = {
  title: fitTitle("Cambridge Past Papers 2022 to 2026"),
  description,
  alternates: { canonical: "/past-papers" },
  openGraph: { title, description, url: "/past-papers", type: "website", images: ["/opengraph-image"] },
};

const LEVELS = ["O Level", "IGCSE", "AS and A Level"] as const;

export default function PastPapersHub() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Past papers", path: "/past-papers" }])} />
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past papers" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">
          Past papers for Accounting, Business and Economics
        </h1>
        <p className="mt-5 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">
          Every paper from 2022 to 2026, sorted by series, with the mark scheme, insert, examiner report and grade thresholds next to it. Pick your syllabus.
        </p>
        {LEVELS.map((lvl) => (
          <Section key={lvl} title={lvl}>
            <ul className="grid gap-3 sm:grid-cols-3">
              {PAST_PAPER_SYLLABI.filter((s) => s.level === lvl).map((s) => (
                <li key={s.code}>
                  <Link href={`/past-papers/${s.slug}`} className="block h-full rounded-[16px] border border-hairline bg-card px-5 py-4 hover:border-gold-border">
                    <span className="block font-semibold text-foreground">{s.short}</span>
                    <span className="mt-1 block text-[15px] text-muted-foreground">{paperCount(s.code)} papers with mark schemes</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ))}
        <TrialBox
          from="past-papers"
          title="Past papers show you the gaps. Classes close them."
          body="Doing papers tells you what you keep losing marks on. In my classes we fix exactly that, every week, with the mark scheme open. Start with one free lesson."
        />
      </div>
    </MarketingShell>
  );
}
