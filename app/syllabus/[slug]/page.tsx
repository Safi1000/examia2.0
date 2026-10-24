import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { ChecklistProvider, Progress, Rate } from "@/components/syllabus/Checklist";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { WaitlistBox } from "@/components/tools/WaitlistBox";
import { breadcrumbLd, fitTitle } from "@/lib/seo";
import { SYLLABI, pointCount, resourcesFor, splitPoint, subtopicCount, syllabusBySlug } from "@/lib/syllabus";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";

export const dynamicParams = false;
export function generateStaticParams() {
  return SYLLABI.map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = syllabusBySlug((await params).slug);
  if (!s) return {};
  const title = `${s.name} Syllabus ${s.exams.slice(0, 4)}: Full Checklist`;
  const description = `The full Cambridge ${s.name} syllabus for exams in ${s.exams}: every topic and learning point, with a checklist to track what you know.`;
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
          <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">{s.name} syllabus checklist</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            The full Cambridge syllabus for exams in {s.exams}: {s.topics.length} topics, {subtopicCount(s)} subtopics and {pointCount(s)} learning
            points, word for word. Tap a subtopic to see exactly what you need to know, then mark it Not sure or Confident.
          </p>
          {(s.replaces || s.changes) && (
            <p className="mt-4 text-[15px] text-muted-foreground">
              {s.replaces ? `This replaces ${s.replaces} from 2027 exams. ` : ""}
              {s.changes && (
                <Link href={s.changes} className="text-gold hover:underline">
                  What changed, explained
                </Link>
              )}
            </p>
          )}

          <div className="mt-8">
            <Progress code={s.code} name={s.name} subtopics={subtopics} />
          </div>

          {s.topics.map((t) => (
            <section key={t.num} className="mt-14">
              <h2 className="text-2xl font-bold leading-tight text-foreground md:text-3xl">
                {t.num}. {t.name}
              </h2>
              <ul className="mt-5 space-y-3">
                {t.subs.map((u) => {
                  const links = resourcesFor(`${t.name} ${u.name} ${u.parts.map((p) => p.name).join(" ")}`);
                  return (
                    <li key={u.num} id={`s-${u.num}`} className="scroll-mt-24 rounded-[16px] border border-hairline bg-card">
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                          <span className="min-w-0">
                            <span className="text-sm tabular-nums text-faint">{u.num}</span>
                            <span className="block font-semibold text-foreground">{u.name}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground group-open:hidden">Tap to see what you need to know</span>
                          </span>
                        </summary>
                        <div className="space-y-4 border-t border-hairline px-5 py-4">
                          {u.parts.map((p) => (
                            <div key={p.num + p.name}>
                              {p.name !== u.name && (
                                <p className="text-[15px] font-semibold text-foreground">
                                  <span className="mr-1.5 tabular-nums text-faint">{p.num}</span>
                                  {p.name}
                                </p>
                              )}
                              {p.points.length > 0 && (
                                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-body">
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
                                  <Link href={l.href} className="text-gold hover:underline">
                                    {l.label}
                                  </Link>
                                </span>
                              ))}
                            </p>
                          )}
                        </div>
                      </details>
                      <div className="flex justify-end border-t border-hairline px-5 py-3">
                        <Rate num={u.num} name={u.name} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <div className="mt-14 space-y-2 text-[15px] text-muted-foreground">
            {thresholds && (
              <p>
                Marks needed for each grade:{" "}
                <Link href={`/grade-thresholds/${thresholds.slug}`} className="text-gold hover:underline">
                  {thresholds.name} grade thresholds
                </Link>
              </p>
            )}
            <p>
              Source: Cambridge International,{" "}
              <a href={s.source} className="text-gold hover:underline" rel="noopener">
                {s.name} syllabus for {s.exams}
              </a>
              . © Cambridge University Press &amp; Assessment.
            </p>
          </div>

          <TrialBox
            from={`syllabus:${s.code}`}
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
