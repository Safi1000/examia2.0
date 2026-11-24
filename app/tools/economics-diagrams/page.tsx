import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs } from "@/components/study/StudyBits";
import { DIAGRAM_SETS, diagramCount } from "@/lib/econ-diagrams";
import { breadcrumbLd, fitTitle } from "@/lib/seo";
import { SYLLABI } from "@/lib/syllabus";
import "@/components/landing/public-calm.css";

const title = "Economics Diagrams: IGCSE 0455, O Level 2281, AS 9708";
const description = "Every diagram the Cambridge IGCSE, O Level and AS Level Economics syllabuses ask you to draw, each with what it shows and how to draw it in the exam.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/tools/economics-diagrams" },
  openGraph: { title, description, url: "/tools/economics-diagrams", type: "website", images: ["/opengraph-image"] },
};

const PAGES = DIAGRAM_SETS.flatMap((d) => SYLLABI.filter((s) => s.code === d.code).map((s) => ({ ...s, set: d })));

export default function EconomicsDiagramsHub() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: "Economics diagrams", path: "/tools/economics-diagrams" }])} />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Free tools", href: "/tools" }, { name: "Economics diagrams" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">Economics diagrams</h1>
        <p className="mt-4 text-lg text-muted-foreground">Pick your syllabus code.</p>
        <ul className="pc-surface mt-6 divide-y divide-hairline overflow-hidden rounded-card">
          {PAGES.map((s) => (
            <li key={s.slug}>
              <Link href={`/tools/economics-diagrams/${s.slug}`} className="row-link flex min-h-16 items-center justify-between gap-4 px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold">
                <span className="text-lg font-semibold text-foreground">{s.set.h1.replace(" diagrams", "")}</span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{diagramCount(s.set)} diagrams</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </MarketingShell>
  );
}
