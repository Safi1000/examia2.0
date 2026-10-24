import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, Section } from "@/components/study/StudyBits";
import { breadcrumbLd, fitTitle } from "@/lib/seo";
import { SYLLABI, pointCount, subtopicCount } from "@/lib/syllabus";

const title = "Cambridge Syllabus Checklists: Accounting, Business, Economics";
const description =
  "Interactive Cambridge syllabus checklists for O Level, IGCSE and A Level Accounting, Business and Economics, for 2027 exams. Every topic, every learning point.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/syllabus" },
  openGraph: { title, description, url: "/syllabus", type: "website", images: ["/opengraph-image"] },
};

export default function SyllabusHub() {
  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Syllabus checklists", path: "/syllabus" }])} />
      <div className="mx-auto max-w-4xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Syllabus checklists" }]} />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">Syllabus checklists</h1>
        <p className="mt-5 max-w-[62ch] text-lg leading-relaxed text-muted-foreground">
          The full Cambridge syllabus for each subject, word for word, as a checklist. Mark what you know, see your weak topics, and get a
          revision plan built from them.
        </p>
        {(["O Level", "IGCSE", "AS and A Level"] as const).map((level) => (
          <Section key={level} title={level}>
            <ul className="grid gap-3 sm:grid-cols-3">
              {SYLLABI.filter((s) => s.level === level).map((s) => (
                <li key={s.code}>
                  <Link href={`/syllabus/${s.slug}`} className="block h-full rounded-[16px] border border-hairline bg-card px-5 py-4 hover:border-gold-border">
                    <span className="block font-semibold text-foreground">
                      {s.subject} {s.code}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {subtopicCount(s)} subtopics · {pointCount(s)} points
                    </span>
                    {s.replaces && <span className="mt-1 block text-xs text-gold">Replaces {s.replaces}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </div>
    </MarketingShell>
  );
}
