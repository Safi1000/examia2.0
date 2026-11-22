import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { PrintButton } from "@/components/tools/PrintButton";
import { FORMULA_SHEETS, formulaCount, formulaSheetBySlug, type Formula } from "@/lib/formula-sheets";
import { PAST_PAPER_SYLLABI } from "@/lib/past-papers";
import { breadcrumbLd, fitTitle } from "@/lib/seo";
import "@/components/tools/formula-sheet.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return FORMULA_SHEETS.map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = formulaSheetBySlug((await params).slug);
  if (!s) return {};
  const url = `/tools/formula-sheet/${s.slug}`;
  return {
    title: fitTitle(s.title),
    description: s.description,
    alternates: { canonical: url },
    openGraph: { title: s.title, description: s.description, url, type: "website", images: ["/opengraph-image"] },
  };
}

function Fraction({ top, bottom, times }: { top: string; bottom?: string; times?: string }) {
  if (!bottom) return <span className="text-foreground">{top}</span>;
  return (
    <span className="inline-flex items-center gap-2.5 align-middle">
      <span className="inline-flex flex-col items-center text-center">
        <span style={{ borderBottomColor: "rgba(255,255,255,0.6)" }} className="self-stretch border-b-[1.5px] px-2 pb-1.5 text-foreground">{top}</span>
        <span className="px-2 pt-1.5 text-foreground">{bottom}</span>
      </span>
      {times && <span className="whitespace-nowrap text-foreground">{times}</span>}
    </span>
  );
}

function Row({ x }: { x: Formula }) {
  return (
    <li className="fs-row px-5 py-5 md:px-6">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-lg font-bold text-ink">{x.name}</span>
        {x.unit && <span className="text-sm font-semibold text-muted-foreground">{x.unit.startsWith("ratio") ? `Answer as a ${x.unit}` : `Answer in ${x.unit}`}</span>}
        {x.tag && <span className="rounded-full border border-hairline-strong px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{x.tag}</span>}
      </p>
      <div className="mt-3 flex flex-col items-start gap-2 text-base leading-snug">
        <Fraction top={x.top} bottom={x.bottom} times={x.times} />
        {x.or && (
          <>
            <span className="text-sm font-semibold text-faint">or</span>
            <Fraction {...x.or} />
          </>
        )}
      </div>
      {x.where && <p className="mt-3 text-sm leading-relaxed text-body">{x.where}</p>}
      <p className="fs-tells mt-2.5 text-sm leading-relaxed text-muted-foreground">{x.tells}</p>
    </li>
  );
}

export default async function FormulaSheetPage({ params }: Props) {
  const s = formulaSheetBySlug((await params).slug);
  if (!s) notFound();
  const path = `/tools/formula-sheet/${s.slug}`;
  const pp = PAST_PAPER_SYLLABI.find((p) => p.code === s.code || p.next?.code === s.code);
  const links = [
    ...s.links,
    { href: `/syllabus/${s.syllabus.slug}`, label: `${s.syllabus.name} syllabus checklist` },
    ...(pp ? [{ href: `/past-papers/${pp.slug}/topics`, label: `${pp.name} questions by topic` }] : []),
  ];
  const others = FORMULA_SHEETS.filter((o) => o.slug !== s.slug && o.syllabus.subject === s.syllabus.subject);

  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Free tools", path: "/tools" }, { name: "Formula sheets", path: "/tools/formula-sheet" }, { name: s.h1, path }])} />
      <div className="fs-page mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <div className="fs-noprint">
          <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Free tools", href: "/tools" }, { name: "Formula sheets", href: "/tools/formula-sheet" }, { name: s.code }]} />
        </div>

        <div className="fs-sheet">
          <h1 className="mt-8 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{s.h1}</h1>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <PrintButton label="Print this sheet" what={s.code} />
            <p className="text-sm font-semibold tabular-nums text-muted-foreground">
              {formulaCount(s)} formulas, for exams in {s.syllabus.exams}
            </p>
          </div>

          {s.groups.map((g) => (
            <section key={g.title} className="mt-10">
              <h2 className="text-xl font-bold text-foreground md:text-2xl">{g.title}</h2>
              <ul className="fs-list pc-surface mt-4 divide-y divide-hairline overflow-hidden rounded-card">
                {g.formulas.map((x) => (
                  <Row key={x.name} x={x} />
                ))}
              </ul>
            </section>
          ))}

          {s.rules.length > 0 && (
            <section className="mt-10">
              <h2 className="text-xl font-bold text-foreground md:text-2xl">Rules for the exam</h2>
              <ul className="mt-4 list-disc space-y-2 pl-6 text-base leading-relaxed text-body marker:text-faint">
                {s.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
                <li>Write the formula, then the figures, then the answer with its unit.</li>
              </ul>
            </section>
          )}

          <p className="fs-printonly">
            {s.source} hamzateaches.com{path}
          </p>
        </div>

        <div className="fs-noprint">
          <nav aria-label="Use these formulas" className="mt-12">
            <p className="text-sm font-semibold text-muted-foreground">Use these formulas</p>
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
            from={`tool:formula-sheet:${s.code}`}
            classes
            subject={s.syllabus.subject}
            level={s.syllabus.levelName}
            title="Know the formula. Win the marks."
            body="The calculation is half the marks. The other half is explaining what it means, which is what my classes drill every week. Start with one free lesson."
          />

          {others.length > 0 && (
            <nav aria-label="Other formula sheets" className="mt-14">
              <p className="text-sm font-semibold text-muted-foreground">Other {s.syllabus.subject} sheets</p>
              <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
                {others.map((o) => (
                  <li key={o.slug}>
                    <Link href={`/tools/formula-sheet/${o.slug}`} className="flex min-h-14 items-center py-3 text-lg font-semibold text-foreground transition-colors duration-200 hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                      {o.h1}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <section aria-labelledby="about-sheet" className="mt-12 border-t border-hairline pt-6">
            <h2 id="about-sheet" className="text-sm font-semibold text-muted-foreground">About this sheet</h2>
            <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-faint">
              {s.source}{" "}
              {s.official ? "Nothing has been added and nothing left out. " : ""}
              <a href={s.syllabus.source} target="_blank" rel="noopener noreferrer" className="font-semibold text-muted-foreground underline decoration-hairline-strong underline-offset-4 hover:decoration-current">
                Official syllabus PDF
              </a>
            </p>
          </section>
        </div>
      </div>
    </MarketingShell>
  );
}
