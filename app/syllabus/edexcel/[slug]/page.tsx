import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { FaqList, MarketingShell } from "@/components/landing/MarketingShell";
import "@/components/landing/public-calm.css";
import { Crumbs, Section, Table, TrialBox } from "@/components/study/StudyBits";
import { RelatedLinks, syllabusLinks } from "@/components/study/RelatedLinks";
import { EDEXCEL, EDEXCEL_CLASSES, edexcelBySlug, edexcelCodes } from "@/lib/edexcel";
import { articleLd, breadcrumbLd, faqLd, fitTitle } from "@/lib/seo";

/**
 * One Pearson Edexcel qualification: codes, papers, content and exam series,
 * all from Pearson's own documents (lib/edexcel.ts lists them per page).
 */
const CHECKED = "2026-11-24";

export const dynamicParams = false;
export function generateStaticParams() {
  return EDEXCEL.map((q) => ({ slug: q.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const q = edexcelBySlug((await params).slug);
  if (!q) return {};
  const path = `/syllabus/edexcel/${q.slug}`;
  return {
    title: fitTitle(q.title),
    description: q.description,
    alternates: { canonical: path },
    openGraph: { title: q.title, description: q.description, url: path, type: "article", images: ["/opengraph-image"] },
  };
}

const inLink = "text-ink underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:decoration-current";
const srcLink = "underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:text-muted-foreground";

export default async function EdexcelGuide({ params }: Props) {
  const q = edexcelBySlug((await params).slug);
  if (!q) notFound();
  const path = `/syllabus/edexcel/${q.slug}`;
  const h1 = `Edexcel ${q.name} ${q.code}`;
  const isIal = q.level === "International A Level";
  const unit = isIal ? "unit" : "paper";
  const siblings = EDEXCEL.filter((x) => x.slug !== q.slug && (x.subject === q.subject || x.level === q.level));

  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Syllabus checklists", path: "/syllabus" },
          { name: "Edexcel", path: "/syllabus/edexcel" },
          { name: `${q.name} ${q.code}`, path },
        ])}
      />
      <JsonLd data={articleLd({ path, headline: q.title, description: q.description, datePublished: CHECKED, section: q.subject, about: [`Pearson Edexcel ${q.name}`, q.code] })} />
      <JsonLd data={faqLd(q.faq)} />

      <article className="public-calm mx-auto max-w-3xl px-5 pb-24 pt-12 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Syllabus checklists", href: "/syllabus" }, { name: "Edexcel", href: "/syllabus/edexcel" }, { name: `${q.name} ${q.code}` }]} />
        <h1 className="mt-8 text-balance text-title leading-[1.1] sm:text-title-lg">{h1}</h1>
        <p className="mt-4 text-base text-muted-foreground">Checked against Pearson on 24 November 2026.</p>

        <div className="mt-8">
          <Table
            caption={`${q.name} at a glance`}
            head={["", q.name]}
            rows={[
              ["Code", edexcelCodes(q)],
              [isIal ? "Units" : "Papers", <span key="s" className="whitespace-normal">{q.shape}</span>],
              ["Grades", q.grading],
              ["Exam series", q.series],
              ["First taught", q.teaching],
              ["First exams", q.firstExam],
            ]}
          />
        </div>

        <Section title={isIal ? "The units" : "The papers"}>
          <Table
            caption={`${q.name} ${isIal ? "units" : "papers"}`}
            head={[isIal ? "Unit" : "Paper", "Length", "Marks", "Weight"]}
            rows={q.papers.map((p) => [p.code, p.length, p.marks, <span key="w" className="whitespace-normal">{p.weight}</span>])}
          />
          <div className="mt-8 space-y-8">
            {q.papers.map((p) => (
              <div key={p.code}>
                <h3 className="text-lg font-semibold text-foreground">
                  {p.name} <span className="font-normal tabular-nums text-faint">({p.code})</span>
                </h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-lg leading-relaxed text-body">
                  {p.holds.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section title="What you study">
          <div className="space-y-8">
            {q.content.map((c) => (
              <div key={c.heading}>
                <h3 className="text-lg font-semibold text-foreground">{c.heading}</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-lg leading-relaxed text-body">
                  {c.items.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Worth knowing">
          <ul className="list-disc space-y-2 pl-5 text-lg leading-relaxed text-body">
            {q.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Section>

        <Section title="On Cambridge instead?">
          <p className="max-w-[64ch] text-lg leading-relaxed text-body">
            If your school follows Cambridge for this subject, use the{" "}
            <Link href={`/syllabus/${q.cambridge.slug}`} className={inLink}>
              {q.cambridge.name} syllabus checklist
            </Link>
            . It has every topic and learning point, with past paper questions linked to each one.
          </p>
        </Section>

        <TrialBox
          from={`edexcel:${q.code}`}
          classes
          subject={q.subject}
          level={q.levelName}
          title={`Edexcel ${q.subject}? Start with a free lesson.`}
          body={`${EDEXCEL_CLASSES} Live online classes with weekly tests I mark myself.`}
        />

        <Section title={`Questions about Edexcel ${q.subject} ${q.code}`}>
          <FaqList items={q.faq} />
        </Section>

        <RelatedLinks
          links={[
            ...siblings.map((x) => ({ href: `/syllabus/edexcel/${x.slug}`, label: `Edexcel ${x.name} ${x.code}` })),
            { href: "/syllabus/edexcel", label: "All Edexcel syllabus guides" },
            ...syllabusLinks(q.cambridge.code, ["tool", "thresholds"]),
          ]}
        />

        <section aria-labelledby="about-edexcel" className="mt-12 border-t border-hairline pt-6">
          <h2 id="about-edexcel" className="text-sm font-semibold text-muted-foreground">About this guide</h2>
          <p className="mt-2 max-w-[64ch] text-sm leading-relaxed text-faint">
            A plain guide to the Pearson Edexcel {q.name} specification ({edexcelCodes(q)}): how many {unit}s there are, how long each one is, how
            many marks it carries and what share of the grade it is worth, the topics you study, and the exam series Pearson lists for 2026/2027.
            Everything here comes from Pearson&apos;s own pages and documents, written in my own words. Always check the latest specification
            before your exams, because Pearson updates its documents.
          </p>
        </section>

        <p className="mt-8 text-sm leading-relaxed text-faint">
          Sources:{" "}
          {q.sources.map((s, i) => (
            <span key={s.href}>
              {i > 0 && ", "}
              <a href={s.href} className={srcLink} rel="noopener">
                {s.label}
              </a>
            </span>
          ))}
          . Pearson Edexcel is a trademark of Pearson Education Limited.
        </p>
      </article>
    </MarketingShell>
  );
}
