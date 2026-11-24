import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { EconDiagram } from "@/components/tools/EconDiagram";
import { PrintButton } from "@/components/tools/PrintButton";
import { DIAGRAM_SETS, diagramCount } from "@/lib/econ-diagrams";
import { PAST_PAPER_SYLLABI } from "@/lib/past-papers";
import { breadcrumbLd, fitTitle } from "@/lib/seo";
import { SYLLABI } from "@/lib/syllabus";
import "@/components/tools/formula-sheet.css";
import "@/components/tools/diagram-bank.css";

const PAGES = DIAGRAM_SETS.flatMap((d) => SYLLABI.filter((s) => s.code === d.code).map((s) => ({ ...s, set: d })));

export const dynamicParams = false;

export function generateStaticParams() {
  return PAGES.map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = PAGES.find((x) => x.slug === slug);
  if (!s) return {};
  const url = `/tools/economics-diagrams/${s.slug}`;
  const { title, description } = s.set;
  return {
    title: fitTitle(title),
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: ["/opengraph-image"] },
  };
}

export default async function EconomicsDiagramsPage({ params }: Props) {
  const { slug } = await params;
  const s = PAGES.find((x) => x.slug === slug);
  if (!s) notFound();
  const path = `/tools/economics-diagrams/${s.slug}`;
  const pp = PAST_PAPER_SYLLABI.find((p) => p.code === s.code || p.next?.code === s.code);
  const others = PAGES.filter((x) => x.slug !== s.slug && x.set.groups !== s.set.groups);
  const groups = s.set.groups;
  const links = [
    { href: `/tools/formula-sheet/${s.slug}`, label: `${s.code} formula sheet` },
    { href: "/tools/elasticity-calculator", label: "Elasticity calculator" },
    { href: `/syllabus/${s.slug}`, label: `${s.name} syllabus checklist` },
    ...(pp ? [{ href: `/past-papers/${pp.slug}/topics`, label: `${pp.name} questions by topic` }] : []),
    ...others.map((o) => ({ href: `/tools/economics-diagrams/${o.slug}`, label: `${o.name} diagrams` })),
  ];

  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: "Economics diagrams", path: "/tools/economics-diagrams" }, { name: s.name, path }])} />
      <div className="fs-page mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <div className="fs-noprint">
          <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Free tools", href: "/tools" }, { name: "Economics diagrams", href: "/tools/economics-diagrams" }, { name: s.code }]} />
        </div>

        <div className="fs-sheet">
          <h1 className="mt-8 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{s.set.h1}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <PrintButton label="Print the diagrams" what={`diagrams-${s.code}`} />
            <p className="text-sm font-semibold tabular-nums text-muted-foreground">
              {diagramCount(s.set)} diagrams, for exams in {s.exams}
            </p>
          </div>

          <nav aria-label="Jump to a topic" className="fs-noprint mt-6">
            <ul className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <li key={g.id}>
                  <a href={`#${g.id}`} className="inline-flex min-h-11 items-center rounded-full border border-hairline-strong px-4 text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:border-white/25 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                    {g.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {groups.map((g) => (
            <section key={g.id} id={g.id} className="mt-12 scroll-mt-24">
              <h2 className="text-2xl font-bold leading-tight text-foreground md:text-3xl">{g.title}</h2>
              <div className="dg-grid mt-5 space-y-5">
                {g.diagrams.map((x) => (
                  <article key={x.id} id={x.id} className="dg-card pc-surface scroll-mt-24 rounded-card p-5 md:p-7">
                    <h3 className="text-lg font-bold leading-snug text-ink md:text-xl">{x.title}</h3>
                    {x.charts.length === 1 ? (
                      <div className="mx-auto mt-4 max-w-[26rem]">
                        <EconDiagram chart={x.charts[0]} title={x.title} />
                      </div>
                    ) : (
                      <div className="dg-minis mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
                        {x.charts.map((c) => (
                          <figure key={c.cap}>
                            <EconDiagram chart={c} small title={c.cap ?? x.title} />
                            <figcaption className="mt-1.5 text-center text-sm font-semibold leading-snug text-muted-foreground">{c.cap}</figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                    <p className="mt-5 text-base leading-relaxed text-body">{x.shows}</p>
                    <div className="dg-steps mt-5 border-t border-hairline pt-4">
                      <p className="text-sm font-semibold text-muted-foreground">Draw it in the exam</p>
                      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-base leading-relaxed text-body marker:font-semibold marker:text-faint">
                        {x.steps.map((st) => (
                          <li key={st}>{st}</li>
                        ))}
                      </ol>
                    </div>
                    <p className="mt-4 text-sm tabular-nums text-faint">Syllabus section {x.ref}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="fs-noprint">
          <nav aria-label="Go further" className="mt-12">
            <p className="text-sm font-semibold text-muted-foreground">Go further</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex min-h-11 items-center rounded-full border border-hairline-strong px-4 text-base font-semibold text-foreground transition-colors duration-200 hover:border-white/[0.28] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <TrialBox
            from={`tool:economics-diagrams:${s.code}`}
            classes
            subject="Economics"
            level={s.levelName}
            title="A diagram earns marks only when you explain it."
            body="In my classes we draw each diagram, label it, then write the two sentences the mark scheme wants beside it. Start with one free lesson."
          />

          <section aria-labelledby="about-diagrams" className="mt-12 border-t border-hairline pt-6">
            <h2 id="about-diagrams" className="text-sm font-semibold text-muted-foreground">About these diagrams</h2>
            <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-faint">
              These are the diagrams the Cambridge {s.name} syllabus for {s.exams} asks you to draw and interpret, with the section number beside each one. {s.set.note} The drawings are my own.{" "}
              <a href={s.source} target="_blank" rel="noopener noreferrer" className="font-semibold text-muted-foreground underline decoration-hairline-strong underline-offset-4 hover:decoration-current">
                Official syllabus PDF
              </a>
            </p>
          </section>
        </div>
      </div>
    </MarketingShell>
  );
}
