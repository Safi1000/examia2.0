import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { PaperView, type ViewDoc } from "@/components/past-papers/PaperView";
import { PaperSearch } from "@/components/past-papers/PaperSearch";
import {
  PAST_PAPER_SYLLABI,
  answerKey,
  cieCode,
  fileName,
  filesFor,
  paperBySlug,
  paperHref,
  paperTitle,
  papersFor,
  pastPaperSyllabus,
  sessionLabel,
  thresholdsFor,
  type Paper,
} from "@/lib/past-papers";
import { absolute, breadcrumbLd } from "@/lib/seo";
import paperText from "@/lib/past-paper-text.json";
import { topicsInPaper } from "@/lib/topical";

export const dynamicParams = false;
export function generateStaticParams() {
  return PAST_PAPER_SYLLABI.flatMap((s) => papersFor(s.code).map((p) => ({ slug: s.slug, paper: p.slug })));
}

type Props = { params: Promise<{ slug: string; paper: string }> };

async function load(params: Props["params"]) {
  const { slug, paper } = await params;
  const s = pastPaperSyllabus(slug);
  const p = s ? paperBySlug(s.code, paper) : null;
  return s && p ? { s, p } : null;
}

const variantText = (p: Paper) => (p.pv.length > 1 ? `, variant ${p.pv.slice(-1)}` : "");
const time = (m: number) => (m < 60 ? `${m} minutes` : `${Math.floor(m / 60)} hour${m >= 120 ? "s" : ""}${m % 60 ? ` ${m % 60} minutes` : ""}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const x = await load(params);
  if (!x) return {};
  const { s, p } = x;
  const qpFile = fileName(p.code, p.session, "qp", p.pv);
  const title = `${cieCode(p)} Past Paper & Mark Scheme (${qpFile})`;
  const description = `${s.name} ${sessionLabel(p.session)} ${paperTitle(p)}${variantText(p)}: question paper ${qpFile}${p.ms ? `, mark scheme ${fileName(p.code, p.session, "ms", p.pv)}` : ""}${p.insert ? ", insert" : ""}.${s.next ? ` Practice for ${s.next.code} too.` : ""} Read online, practise timed${p.mcq ? ", marked instantly" : ""}. No ads.`;
  const url = paperHref(s.slug, p);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article", images: ["/opengraph-image"] },
  };
}

const pill =
  "inline-flex min-h-11 items-center rounded-full border border-hairline px-4 text-[15px] font-semibold text-foreground transition-colors hover:border-gold-border hover:text-gold";

export default async function PaperPage({ params }: Props) {
  const x = await load(params);
  if (!x) notFound();
  const { s, p } = x;
  const f = filesFor(p);
  const all = papersFor(s.code);
  const t = thresholdsFor(p);
  const key = answerKey(p);
  const code = cieCode(p);
  const url = paperHref(s.slug, p);

  // The paper's own words, for search engines and screen readers. Skipped when
  // the PDF's text lost its spaces (some older papers), as it would read badly.
  const textPages = ((paperText as unknown as Record<string, Array<[string, string]>>)[f.qp.name] ?? []).filter(([, t]) => (t.match(/ /g)?.length ?? 0) > t.length / 9);
  const inPaper = topicsInPaper(s.code, p.key).slice(0, 10);
  const levelWord = s.level === "AS and A Level" ? "Cambridge International AS and A Level" : `Cambridge ${s.level}`;
  const topA = t?.grades.find(([g]) => g === "A");
  const about = [
    `${p.code}/${p.pv} is ${paperTitle(p)}${p.pv.length > 1 ? ` (variant ${p.pv.slice(-1)})` : ""} of ${levelWord} ${s.subject === "Business" && s.level !== "AS and A Level" ? "Business Studies" : s.subject}, sat in ${sessionLabel(p.session)}.`,
    p.minutes && p.marks ? `It lasts ${time(p.minutes)} and is marked out of ${p.marks}${key ? `, with ${key.length} multiple choice questions` : ""}.` : "",
    topA && t ? `A grade A on this paper needed ${topA[1]} out of ${t.max}.` : "",
    `The question paper${f.ms ? ", mark scheme" : ""}${f.insert ? ", insert" : ""}${f.er ? " and the examiner report for the series" : ""} are all here, free to read, download and print.`,
    s.next ? `From ${s.next.from} this syllabus is ${s.next.code}; these ${p.code} papers are still the closest practice for it.` : "",
    key ? "Practise it timed on this page and your answers are marked the moment you finish." : "Practise it timed on this page, mark it with the mark scheme, and see the grade your mark gets.",
  ]
    .filter(Boolean)
    .join(" ");

  const docs: ViewDoc[] = [
    { id: "qp", label: "Question paper", pdf: f.qp.pdf, name: f.qp.name, pages: f.qp.pages, ratios: f.qp.ratios },
    ...(f.ms ? [{ id: "ms" as const, label: "Mark scheme", pdf: f.ms.pdf, name: f.ms.name, pages: f.ms.pages, ratios: f.ms.ratios }] : []),
    ...(f.insert ? [{ id: "in" as const, label: "Insert", pdf: f.insert.pdf, name: f.insert.name, pages: f.insert.pages, ratios: f.insert.ratios }] : []),
  ];

  const sameSeries = all.filter((o) => o.session === p.session && o.key !== p.key);
  const otherYears = all.filter((o) => o.num === p.num && o.session !== p.session && (o.pv.slice(-1) === p.pv.slice(-1) || o.session.s === "m"));
  const i = all.findIndex((o) => o.key === p.key);
  const newer = all[i - 1] ?? null;
  const older = all[i + 1] ?? null;

  return (
    <MarketingShell>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "LearningResource",
          name: `${code} ${s.name} ${sessionLabel(p.session)} ${paperTitle(p)}`,
          url: absolute(url),
          learningResourceType: "Past paper",
          educationalLevel: s.level,
          about: s.subject,
          inLanguage: "en",
          isAccessibleForFree: true,
          ...(p.minutes ? { timeRequired: `PT${p.minutes}M` } : {}),
          provider: { "@type": "Organization", name: "Hamza Teaches", url: absolute("/") },
        }}
      />
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Past papers", path: "/past-papers" },
          { name: s.name, path: `/past-papers/${s.slug}` },
          { name: code, path: url },
        ])}
      />
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-5 md:pt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Crumbs trail={[{ name: "Past papers", href: "/past-papers" }, { name: s.short, href: `/past-papers/${s.slug}` }, { name: code }]} />
          <PaperSearch compact className="w-full sm:w-[320px]" />
        </div>

        <header className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground md:text-4xl">
              <span className="tabular-nums">{code}</span>
              <span className="block text-[17px] font-medium leading-snug text-muted-foreground md:text-xl">
                {s.name} · {sessionLabel(p.session)} · {paperTitle(p)}
                {variantText(p)}
              </span>
            </h1>
          </div>
          <ul className="flex flex-wrap gap-2 text-[14px] text-muted-foreground">
            {p.minutes && <li className="rounded-full border border-hairline px-3 py-1">{time(p.minutes)}</li>}
            {p.marks && <li className="rounded-full border border-hairline px-3 py-1">{p.marks} marks</li>}
            {f.qp.pages > 0 && <li className="rounded-full border border-hairline px-3 py-1">{f.qp.pages} pages</li>}
          </ul>
          <p className="w-full text-[13px] tabular-nums text-faint">
            Files: {f.qp.name}
            {f.ms ? ` · ${f.ms.name}` : ""}
            {f.insert ? ` · ${f.insert.name}` : ""}
          </p>
        </header>

        <div className="mt-5">
          <PaperView
            pkey={p.key}
            code={code}
            label={`${s.short} · ${sessionLabel(p.session)} · ${paperTitle(p)}`}
            url={url}
            minutes={p.minutes}
            marks={p.marks}
            docs={docs}
            answer={key}
            thresholds={t ? { ...t, series: sessionLabel(p.session) } : null}
            report={f.er}
          />
        </div>

        <section aria-labelledby="about-h" className="mt-14 max-w-[70ch]">
          <h2 id="about-h" className="text-lg font-semibold text-foreground">
            About this paper
          </h2>
          <p className="mt-2 text-[16px] leading-relaxed text-muted-foreground">{about}</p>
          {inPaper.length > 0 && (
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              Topics in this paper:{" "}
              {inPaper.map((t, i) => (
                <span key={t.slug}>
                  {i > 0 && " · "}
                  <Link href={`/past-papers/${s.slug}/topics/${t.slug}`} className="text-foreground underline decoration-gold/40 underline-offset-4 hover:decoration-gold">
                    {t.sub.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </section>

        {textPages.length > 0 && (
          <details className="group mt-8 max-w-[70ch] rounded-[18px] border border-hairline bg-card px-5 py-1 open:pb-5">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-[15px] font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              Read the question paper as text
              <span aria-hidden className="text-gold transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="mt-2 space-y-5 text-[15px] leading-relaxed text-muted-foreground">
              {textPages.map(([n, t]) => (
                <section key={n} aria-label={`Page ${n}`}>
                  <h3 className="text-[13px] font-semibold text-faint">Page {n}</h3>
                  <p className="mt-1 whitespace-pre-line">{t}</p>
                </section>
              ))}
            </div>
          </details>
        )}

        <div className="mt-10 grid gap-10 md:grid-cols-[1fr_1fr] md:gap-12">
          {t ? (
            <section aria-labelledby="gt-h">
              <h2 id="gt-h" className="text-lg font-semibold text-foreground">
                Grade thresholds
              </h2>
              <p className="mt-1 text-[15px] text-muted-foreground">
                Minimum marks out of {t.max} on {p.code}/{p.pv}, {sessionLabel(p.session)}.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {t.grades.map(([g, n]) => (
                  <li key={g} className="min-w-[64px] rounded-[14px] border border-hairline bg-card px-3 py-2.5 text-center">
                    <span className="block text-[13px] font-semibold text-muted-foreground">{g}</span>
                    <span className="block text-xl font-bold tabular-nums text-foreground">{n}</span>
                  </li>
                ))}
              </ul>
              {(f.er || f.gt) && (
                <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[15px]">
                  {f.er && (
                    <a href={f.er} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-semibold text-gold hover:underline">
                      Examiner report
                    </a>
                  )}
                  {f.gt && (
                    <a href={f.gt} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-semibold text-gold hover:underline">
                      Full threshold table
                    </a>
                  )}
                </p>
              )}
            </section>
          ) : (
            <span />
          )}

          <nav aria-labelledby="more-h">
            <h2 id="more-h" className="text-lg font-semibold text-foreground">
              Keep going
            </h2>
            <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
              {[...(newer ? [{ o: newer, l: "Newer" }] : []), ...(older ? [{ o: older, l: "Older" }] : []), ...sameSeries.slice(0, 3).map((o) => ({ o, l: "Same series" })), ...otherYears.slice(0, 3).map((o) => ({ o, l: `Paper ${p.num}` }))]
                .filter((x, i, a) => a.findIndex((y) => y.o.key === x.o.key) === i)
                .slice(0, 7)
                .map(({ o, l }) => (
                  <li key={o.key}>
                    <Link href={paperHref(s.slug, o)} className="group flex min-h-12 items-center justify-between gap-3 py-2.5">
                      <span className="font-semibold tabular-nums text-foreground group-hover:text-gold">{cieCode(o)}</span>
                      <span className="text-[14px] text-faint">{l}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>
        </div>

        <div className="mx-auto max-w-4xl">
          <TrialBox
            from={`past-paper:${code}`}
            subject={s.subject}
            level={s.trialLevel}
            title="Lost marks you can't explain?"
            body={`That's what I fix in class: the exact ${s.short} questions you keep dropping marks on, with the mark scheme open. Start with one free lesson.`}
          />
        </div>

        <p className="mt-12 text-sm text-faint">Papers, mark schemes and reports are © Cambridge University Press &amp; Assessment, shared here for students&apos; revision.</p>
      </div>
    </MarketingShell>
  );
}
