import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ChecklistProvider, Progress, Rate } from "@/components/syllabus/Checklist";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { RelatedLinks, syllabusLinks } from "@/components/study/RelatedLinks";
import { WaitlistBox } from "@/components/tools/WaitlistBox";
import { articleSlugs, getArticle } from "@/lib/blog";
import { breadcrumbLd, fitTitle } from "@/lib/seo";
import { SYLLABI, type SyllabusInfo, pointCount, resourcesFor, splitPoint, subtopicCount, syllabusBySlug } from "@/lib/syllabus";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";
import { topicalHrefFor } from "@/lib/topical";

export const dynamicParams = false;
export function generateStaticParams() {
  return SYLLABI.map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

/** "2027, 2028 and 2029" becomes "2027 to 2029"; a single year stays as it is. */
function yearRange(exams: string): string {
  const years = exams.match(/\d{4}/g) ?? [];
  return years.length > 1 ? `${years[0]} to ${years[years.length - 1]}` : (years[0] ?? exams);
}

/** "<code> Syllabus <years>: Topic List and Official PDF", shortened step by step to fit 60 characters. */
function syllabusTitle(s: SyllabusInfo): string {
  const first = (s.exams.match(/\d{4}/) ?? [s.exams])[0];
  const options = [
    `${s.code} Syllabus ${yearRange(s.exams)}: Topic List and Official PDF`,
    `${s.code} Syllabus ${yearRange(s.exams)}: Topic List and PDF`,
    `${s.code} Syllabus ${first}: Topic List and PDF`,
  ];
  return options.find((t) => t.length <= 60) ?? options[options.length - 1];
}

/** 140 to 158 characters: what the syllabus holds, its years, the PDF and the checklist. */
function syllabusDescription(s: SyllabusInfo): string {
  const facts = `${s.topics.length} topics, ${subtopicCount(s)} subtopics, ${pointCount(s)} learning points`;
  const end = "plus the official Cambridge PDF and a checklist to track what you know.";
  const options = [`${s.name}`, `${s.subject} ${s.code}`, s.code].map((who) => `${who} syllabus ${yearRange(s.exams)}: ${facts}, ${end}`);
  return options.find((d) => d.length <= 158) ?? options[options.length - 1];
}

/** The "syllabus 2027 changes" article for this code, matched by the code in the article's meta. */
async function changesArticle(s: SyllabusInfo): Promise<{ href: string } | null> {
  const codeRe = new RegExp(`\\b${s.code}\\b`);
  for (const slug of articleSlugs().filter((x) => x.includes("syllabus"))) {
    const a = await getArticle(slug);
    if (a && codeRe.test(a.code)) return { href: `/blog/${a.slug}` };
  }
  return s.changes ? { href: s.changes } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = syllabusBySlug((await params).slug);
  if (!s) return {};
  const title = syllabusTitle(s);
  const description = syllabusDescription(s);
  return {
    title: fitTitle(title),
    description,
    alternates: { canonical: `/syllabus/${s.slug}` },
    openGraph: { title, description, url: `/syllabus/${s.slug}`, type: "article", images: ["/opengraph-image"] },
  };
}

export default async function SyllabusPage({ params }: Props) {
  const s = syllabusBySlug((await params).slug);
  if (!s) notFound();
  const subtopics = s.topics.flatMap((t) =>
    t.subs.map((u) => ({ num: u.num, name: u.name, topic: t.name, links: resourcesFor(`${t.name} ${u.name} ${u.parts.map((p) => p.name).join(" ")}`) })),
  );
  const changes = await changesArticle(s);
  const thresholds = THRESHOLD_PAGES.find((t) => t.code === s.code || (s.replaces && t.code === s.replaces));

  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Syllabus checklists", path: "/syllabus" },
          { name: s.name, path: `/syllabus/${s.slug}` },
        ])}
      />
      <ChecklistProvider code={s.code}>
        <article className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
          <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Syllabus checklists", href: "/syllabus" }, { name: s.name }]} />
          <h1 className="mt-8 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{s.name} syllabus {yearRange(s.exams)}</h1>
          <div className="mt-5 flex flex-wrap gap-2">
            <a
              href={s.source}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-hairline-strong px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:border-foreground hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Official syllabus PDF (Cambridge)
              <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 4H4v12h12v-4M11 4h5v5M16 4l-7 7" />
              </svg>
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            {changes && (
              <Link
                href={changes.href}
                className="inline-flex min-h-11 items-center rounded-full border border-hairline-strong px-4 text-sm font-semibold text-foreground transition-colors duration-150 hover:border-foreground hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              >
                What changed for 2027
              </Link>
            )}
          </div>
          <p className="mt-5 text-base text-muted-foreground">
            {s.topics.length} topics, {subtopicCount(s)} subtopics, {pointCount(s)} learning points.{s.replaces ? ` Replaces ${s.replaces} from 2027.` : ""}
          </p>

          <div className="mt-8">
            <Progress code={s.code} name={s.name} subtopics={subtopics} />
          </div>

          {s.topics.map((t) => (
            <section key={t.num} className="mt-14">
              <h2 className="text-2xl font-bold leading-tight text-foreground md:text-3xl">
                {t.num}. {t.name}
              </h2>
              <ul className="pc-surface mt-5 divide-y divide-hairline overflow-hidden rounded-card">
                {t.subs.map((u) => {
                  const topical = topicalHrefFor(s.code, u.num);
                  const links = [...(topical ? [{ href: topical, label: "Past paper questions on this" }] : []), ...resourcesFor(`${t.name} ${u.name} ${u.parts.map((p) => p.name).join(" ")}`)];
                  return (
                    <li key={u.num} id={`s-${u.num}`} className="scroll-mt-28">
                      <details className="group">
                        <summary className="row-link flex min-h-14 cursor-pointer list-none items-start gap-4 px-5 pb-2 pt-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold [&::-webkit-details-marker]:hidden">
                          <span className="w-9 shrink-0 pt-px text-sm tabular-nums leading-6 text-faint">{u.num}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold leading-6 text-foreground">{u.name}</span>
                            <span className="mt-0.5 block text-sm text-muted-foreground group-open:hidden">Tap to see what you need to know</span>
                          </span>
                          <svg aria-hidden viewBox="0 0 20 20" className="mt-1 h-4 w-4 shrink-0 text-faint transition-transform duration-200 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m5 8 5 5 5-5" />
                          </svg>
                        </summary>
                        <div className="ml-[3.25rem] mr-5 mt-2 space-y-4 border-t border-hairline py-4">
                          {u.parts.map((p) => (
                            <div key={p.num + p.name}>
                              {p.name !== u.name && (
                                <p className="text-base font-semibold text-foreground">
                                  <span className="mr-1.5 tabular-nums text-faint">{p.num}</span>
                                  {p.name}
                                </p>
                              )}
                              {p.points.length > 0 && (
                                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-base leading-relaxed text-body">
                                  {p.points.map((pt, i) => {
                                    const { lead, items } = splitPoint(pt);
                                    return (
                                      <li key={i}>
                                        {lead}
                                        {items.length > 0 && (
                                          <ul className="mt-1 list-[circle] space-y-0.5 pl-5">
                                            {items.map((it, j) => (
                                              <li key={j}>{it}</li>
                                            ))}
                                          </ul>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          ))}
                          {links.length > 0 && (
                            <p className="text-sm">
                              <span className="text-muted-foreground">Free help: </span>
                              {links.map((l, i) => (
                                <span key={l.href}>
                                  {i > 0 && " · "}
                                  <Link href={l.href} className="text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground">
                                    {l.label}
                                  </Link>
                                </span>
                              ))}
                            </p>
                          )}
                        </div>
                      </details>
                      <div className="flex justify-end px-5 pb-3">
                        <Rate num={u.num} name={u.name} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <div className="mt-14 space-y-2 text-sm text-muted-foreground">
            {thresholds && (
              <p>
                Marks needed for each grade:{" "}
                <Link href={`/grade-thresholds/${thresholds.slug}`} className="text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground">
                  {thresholds.name} grade thresholds
                </Link>
              </p>
            )}
            <p>
              Source: Cambridge International,{" "}
              <a href={s.source} className="text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground" rel="noopener">
                {s.name} syllabus for {s.exams}
              </a>
              . © Cambridge University Press &amp; Assessment.
            </p>
          </div>

          <section aria-labelledby="about-syl" className="mt-12 border-t border-hairline pt-6">
            <h2 id="about-syl" className="text-sm font-semibold text-muted-foreground">About this checklist</h2>
            <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-faint">
              The full Cambridge syllabus for exams in {s.exams}: {s.topics.length} topics, {subtopicCount(s)} subtopics and {pointCount(s)} learning
              points, word for word. Tap a subtopic to see exactly what you need to know, then mark it Not sure or Confident.
              {s.replaces ? ` This replaces ${s.replaces} from 2027 exams.` : ""}
            </p>
          </section>

          <RelatedLinks
            links={[
              ...syllabusLinks(s.code, ["checklist", "thresholds", "tool"]),
              ...syllabusLinks(s.code, ["papers", "topical", "checklist", "thresholds"]),
              { href: "/tools/revision-planner", label: "Revision planner" },
            ]}
          />

          <TrialBox
            from={`syllabus:${s.code}`}
            classes
            subject={s.subject}
            level={s.levelName}
            title="Every topic. Taught properly."
            body="Live small-group classes that cover this whole syllabus, with weekly tests I mark myself. Start with one free lesson."
          />
          <WaitlistBox source={`/syllabus/${s.slug}`} />
        </article>
      </ChecklistProvider>
    </MarketingShell>
  );
}
