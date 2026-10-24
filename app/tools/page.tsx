import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section } from "@/components/study/StudyBits";
import { WaitlistBox } from "@/components/tools/WaitlistBox";
import { breadcrumbLd, fitTitle } from "@/lib/seo";

const title = "Free Tools for Accounting, Business and Economics";
const description =
  "Free tools for O Level, IGCSE and A Level students: grade predictor, grade thresholds, accounting ratio, break-even, elasticity, depreciation and investment calculators.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/tools" },
  openGraph: { title, description, url: "/tools", type: "website", images: ["/opengraph-image"] },
};

const GROUPS: Array<{ title: string; tools: Array<{ href: string; name: string; what: string }> }> = [
  {
    title: "Plan and track",
    tools: [
      { href: "/syllabus", name: "Syllabus checklists", what: "The full Cambridge syllabus for your subject. Mark what you know, see your weak topics." },
      { href: "/tools/revision-planner", name: "Revision planner", what: "A week-by-week plan to your exam, weak topics first." },
    ],
  },
  {
    title: "Grades",
    tools: [
      { href: "/tools/grade-predictor", name: "Grade predictor", what: "Enter your mock marks, see the grade Cambridge would have given." },
      { href: "/grade-thresholds", name: "Grade thresholds", what: "Official minimum marks for every grade, every variant, June 2024 to June 2026." },
    ],
  },
  {
    title: "Accounting",
    tools: [
      { href: "/tools/ratio-calculator", name: "Ratio calculator", what: "Every IGCSE and O Level ratio with Cambridge's formulas and what each answer means." },
      { href: "/tools/depreciation-calculator", name: "Depreciation calculator", what: "Straight line and reducing balance, year by year." },
    ],
  },
  {
    title: "Business",
    tools: [
      { href: "/tools/break-even-calculator", name: "Break-even calculator", what: "Break-even output, contribution and margin of safety." },
      { href: "/tools/investment-appraisal-calculator", name: "Investment appraisal", what: "Payback, ARR and NPV for A Level Business." },
    ],
  },
  {
    title: "Economics",
    tools: [{ href: "/tools/elasticity-calculator", name: "Elasticity calculator", what: "PED, YED and XED with the working and what the number means." }],
  },
];

export default function ToolsHub() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }])} />
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Free tools" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">
          Free tools for Accounting, Business and Economics
        </h1>
        <p className="mt-5 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">
          Built for O Level, IGCSE and A Level students. Each one shows the working the way the mark scheme expects it.
        </p>
        {GROUPS.map((g) => (
          <Section key={g.title} title={g.title}>
            <ul className="grid gap-3 sm:grid-cols-2">
              {g.tools.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="block h-full rounded-[16px] border border-hairline bg-card px-5 py-4 hover:border-gold-border">
                    <span className="block font-semibold text-foreground">{t.name}</span>
                    <span className="mt-1 block text-[15px] text-muted-foreground">{t.what}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ))}
        <WaitlistBox source="/tools" />
      </div>
    </MarketingShell>
  );
}
