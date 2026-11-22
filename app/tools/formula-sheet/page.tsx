import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs } from "@/components/study/StudyBits";
import { FORMULA_SHEETS, formulaCount } from "@/lib/formula-sheets";
import { breadcrumbLd, fitTitle } from "@/lib/seo";
import "@/components/landing/public-calm.css";

const title = "Formula Sheets: Accounting, Business and Economics";
const description =
  "Free printable formula sheets for Cambridge O Level, IGCSE and A Level Accounting, Business and Economics. Every formula for your syllabus code on one page.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/tools/formula-sheet" },
  openGraph: { title, description, url: "/tools/formula-sheet", type: "website", images: ["/opengraph-image"] },
};

const SUBJECTS = ["Accounting", "Business", "Economics"] as const;

export default function FormulaSheetHub() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: "Formula sheets", path: "/tools/formula-sheet" }])} />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Free tools", href: "/tools" }, { name: "Formula sheets" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">Formula sheets</h1>
        <p className="mt-4 text-lg text-muted-foreground">Pick your syllabus code.</p>
        {SUBJECTS.map((sub) => (
          <section key={sub} className="mt-10">
            <h2 className="text-xl font-bold text-foreground md:text-2xl">{sub}</h2>
            <ul className="pc-surface mt-4 divide-y divide-hairline overflow-hidden rounded-card">
              {FORMULA_SHEETS.filter((s) => s.syllabus.subject === sub).map((s) => (
                <li key={s.slug}>
                  <Link
                    href={`/tools/formula-sheet/${s.slug}`}
                    className="row-link flex min-h-16 items-center justify-between gap-4 px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold"
                  >
                    <span className="text-lg font-semibold text-foreground">{s.syllabus.name}</span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{formulaCount(s)} formulas</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section aria-labelledby="about-sheets" className="mt-12 border-t border-hairline pt-6">
          <h2 id="about-sheets" className="text-sm font-semibold text-muted-foreground">About these sheets</h2>
          <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-faint">
            The Accounting and Business sheets hold exactly the formulas Cambridge prints in each syllabus. The Economics syllabuses name the calculations but print no formulas, so those sheets give the standard forms. Each sheet prints on A4.
          </p>
        </section>
      </div>
    </MarketingShell>
  );
}
