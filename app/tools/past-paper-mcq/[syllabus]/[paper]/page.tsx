import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { McqChecker } from "@/components/tools/McqChecker";
import { PAPERS, paperFor, paperName, paperSlug, syllabusBySlug, syllabusName } from "@/lib/mcq-papers";
import { breadcrumbLd } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() {
  return PAPERS.map((p) => ({ syllabus: p.syllabus, paper: paperSlug(p) }));
}

type Props = { params: Promise<{ syllabus: string; paper: string }> };

async function load(params: Props["params"]) {
  const { syllabus, paper } = await params;
  const s = syllabusBySlug(syllabus);
  const p = s ? paperFor(s.slug, paper) : null;
  return s && p ? { s, p } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const x = await load(params);
  if (!x) return {};
  const { s, p } = x;
  const url = `/tools/past-paper-mcq/${s.slug}/${paperSlug(p)}`;
  const title = `${s.code}/${p.variant} ${p.session} MCQ: Mark Your Answers`;
  const description = `Mark your answers to Cambridge ${syllabusName(s)} ${s.code}/${p.variant}, ${p.session}, instantly, with a ${p.minutes}-minute exam timer and a topic breakdown.`;
  return {
    title: `${title} | Hamza Teaches`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images: ["/opengraph-image"] },
    twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
  };
}

export default async function McqPaperPage({ params }: Props) {
  const x = await load(params);
  if (!x) notFound();
  const { s, p } = x;
  const name = paperName(s, p);
  const base = `/tools/past-paper-mcq/${s.slug}`;

  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Past paper MCQ checker", path: "/tools/past-paper-mcq" },
          { name: syllabusName(s), path: base },
          { name, path: `${base}/${paperSlug(p)}` },
        ])}
      />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-14 md:pt-20">
        <Crumbs
          trail={[
            { name: "Home", href: "/" },
            { name: "Past paper MCQ checker", href: "/tools/past-paper-mcq" },
            { name: syllabusName(s), href: base },
            { name: `${s.code}/${p.variant}` },
          ]}
        />
        <h1 className="mt-8 text-4xl font-bold leading-[1.08] tracking-tight text-foreground md:text-5xl">
          {syllabusName(s)} Paper {s.paper}, {p.session}, variant {p.variant}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          A timed mock with the real paper. Shade your answers, then mark it to see your score and every question to look at again.
        </p>

        <div className="mt-12">
          <McqChecker paper={p} name={name} id={`${s.slug}/${paperSlug(p)}`} />
        </div>

        <p className="mt-10 text-[15px] leading-relaxed text-muted-foreground">
          Got your score? Put it into the{" "}
          <Link href="/tools/grade-predictor" className="text-gold hover:underline">
            grade predictor
          </Link>{" "}
          with your other paper&apos;s mark to see the grade it points to. More papers for this syllabus are on the{" "}
          <Link href={base} className="text-gold hover:underline">
            {s.code} checker page
          </Link>
          .
        </p>

        <TrialBox
          from={`tools:mcq:${s.slug}:${paperSlug(p)}`}
          subject={s.subject}
          title="One paper marked. Now fix it."
          body="Bring this paper to a free trial lesson. We will go through the questions you got wrong and the method behind each one."
        />
      </div>
    </MarketingShell>
  );
}
