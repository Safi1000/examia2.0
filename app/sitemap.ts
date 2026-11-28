import { DIAGRAM_SETS } from "@/lib/econ-diagrams";
import { FORMULA_SHEETS } from "@/lib/formula-sheets";
import type { MetadataRoute } from "next";
import { allArticles } from "@/lib/blog";
import { CITY_PAGES } from "@/lib/city-pages";
import { COUNTRY_PAGES } from "@/lib/country-pages";
import { SYLLABI } from "@/lib/syllabus";
import { EDEXCEL } from "@/lib/edexcel";
import { GULF_CITY_PAGES } from "@/lib/gulf-pages";
import { PAPERS, liveSyllabuses, paperSlug } from "@/lib/mcq-papers";
import { PUBLIC_ROUTES, absolute } from "@/lib/seo";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";
import { PAST_PAPER_SYLLABI, paperHref, papersFor, seriesHref } from "@/lib/past-papers";
import { seriesFor } from "@/lib/series";
import { hasTopical, topicalFor } from "@/lib/topical";
import { EXAMINER_REPORTS, EXAMINER_REPORTS_HUB, reportHref, reportPublished } from "@/lib/examiner-reports";
import { LEVEL_PAGES, SUBJECT_PAGES, levelPath, tuitionPath } from "@/lib/subjects";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await allArticles();
  return [
    ...PUBLIC_ROUTES.map((r) => ({
      url: absolute(r.path),
      changeFrequency: "monthly" as const,
      priority: r.priority,
    })),
    // Subject tuition pages: Accounting, Business, Economics, under the /tuition hub.
    { url: absolute("/tuition"), changeFrequency: "monthly" as const, priority: 0.8 },
    ...SUBJECT_PAGES.map((s) => ({ url: absolute(tuitionPath(s.slug)), changeFrequency: "monthly" as const, priority: 0.8 })),
    ...LEVEL_PAGES.map((p) => ({ url: absolute(levelPath(p.subjectSlug, p.slug)), changeFrequency: "monthly" as const, priority: 0.8 })),
    // One page per syllabus: refreshed when a new session's thresholds are added.
    ...THRESHOLD_PAGES.map((p) => ({
      url: absolute(`/grade-thresholds/${p.slug}`),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...PAST_PAPER_SYLLABI.map((p) => ({ url: absolute(`/past-papers/${p.slug}`), changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: absolute(EXAMINER_REPORTS_HUB), lastModified: EXAMINER_REPORTS.map(reportPublished).sort().at(-1), changeFrequency: "monthly" as const, priority: 0.6 },
    ...EXAMINER_REPORTS.map((r) => ({ url: absolute(reportHref(r)), lastModified: reportPublished(r), changeFrequency: "yearly" as const, priority: 0.6 })),
    // One page per exam series: every paper, the grade marks and the topics tested.
    ...PAST_PAPER_SYLLABI.flatMap((s) => seriesFor(s).map((x) => ({ url: absolute(seriesHref(s.slug, x)), changeFrequency: "yearly" as const, priority: 0.7 }))),
    { url: absolute("/past-papers/search"), changeFrequency: "monthly" as const, priority: 0.6 },
    { url: absolute("/past-papers/topics"), changeFrequency: "monthly" as const, priority: 0.8 },
    { url: absolute("/past-papers/2027-changes"), changeFrequency: "monthly" as const, priority: 0.8 },
    ...PAST_PAPER_SYLLABI.filter((s) => hasTopical(s.code)).flatMap((s) => [
      { url: absolute(`/past-papers/${s.slug}/topics`), changeFrequency: "monthly" as const, priority: 0.8 },
      { url: absolute(`/past-papers/${s.slug}/most-repeated-topics`), changeFrequency: "monthly" as const, priority: 0.7 },
      ...topicalFor(s.code)
        .filter((e) => e.questions.length)
        .map((e) => ({ url: absolute(`/past-papers/${s.slug}/topics/${e.slug}`), changeFrequency: "monthly" as const, priority: 0.7 })),
    ]),
    ...PAST_PAPER_SYLLABI.flatMap((s) => papersFor(s.code).map((p) => ({ url: absolute(paperHref(s.slug, p)), changeFrequency: "yearly" as const, priority: 0.6 }))),
    ...SYLLABI.map((s) => ({ url: absolute(`/syllabus/${s.slug}`), changeFrequency: "monthly" as const, priority: 0.7 })),
    ...["/syllabus/edexcel", ...EDEXCEL.map((q) => `/syllabus/edexcel/${q.slug}`)].map((path) => ({ url: absolute(path), lastModified: "2026-11-24", changeFrequency: "monthly" as const, priority: 0.6 })),
    ...COUNTRY_PAGES.map((c) => ({ url: absolute(`/online-classes/${c.slug}`), changeFrequency: "monthly" as const, priority: 0.6 })),
    ...[...CITY_PAGES, ...GULF_CITY_PAGES].map((c) => ({
      url: absolute(`/online-classes/${c.slug}`),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    { url: absolute("/tools/formula-sheet"), changeFrequency: "monthly" as const, priority: 0.7 },
    ...FORMULA_SHEETS.map((f) => ({ url: absolute(`/tools/formula-sheet/${f.slug}`), changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: absolute("/tools/economics-diagrams"), changeFrequency: "monthly" as const, priority: 0.7 },
    ...DIAGRAM_SETS.flatMap((d) => SYLLABI.filter((x) => x.code === d.code)).map((x) => ({ url: absolute(`/tools/economics-diagrams/${x.slug}`), changeFrequency: "monthly" as const, priority: 0.7 })),
    // The MCQ checker is listed only once it has papers (lib/mcq-papers.ts).
    ...(PAPERS.length ? ["/tools/past-paper-mcq"] : []).map((path) => ({ url: absolute(path), changeFrequency: "monthly" as const, priority: 0.6 })),
    ...liveSyllabuses().map((m) => ({ url: absolute(`/tools/past-paper-mcq/${m.slug}`), changeFrequency: "monthly" as const, priority: 0.5 })),
    ...PAPERS.map((p) => ({ url: absolute(`/tools/past-paper-mcq/${p.syllabus}/${paperSlug(p)}`), changeFrequency: "yearly" as const, priority: 0.4 })),
    ...articles.map((a) => ({
      url: absolute(`/blog/${a.slug}`),
      lastModified: a.updated ?? a.date,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
