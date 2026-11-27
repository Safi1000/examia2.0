import Link from "next/link";
import { cn } from "@/lib/cn";
import { PAST_PAPER_SYLLABI, type PastPaperSyllabus } from "@/lib/past-papers";
import { SYLLABI } from "@/lib/syllabus";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";
import { hasTopical, topicalFor } from "@/lib/topical";
import { reportHref, reportMonthLabel, reportsFor } from "@/lib/examiner-reports";
import { FORMULA_SHEETS } from "@/lib/formula-sheets";
import { DIAGRAM_SETS } from "@/lib/econ-diagrams";
import { LEVEL_PAGES, levelPath } from "@/lib/subjects";
import { EDEXCEL } from "@/lib/edexcel";

/**
 * "Keep exploring": a short list of plain text links to the pages that belong
 * with this one (the same syllabus's papers, topics, checklist, thresholds and
 * calculator). Every link is built from the same data that builds those pages,
 * so a link only appears when its page exists.
 *
 * Every syllabus list also carries its tuition level page (the class page for
 * that subject and level), so the paper, topic, syllabus and threshold pages
 * all point at the page a student books from.
 */
export type RelatedLink = { href: string; label: string };
export type RelatedKind = "papers" | "topical" | "checklist" | "thresholds" | "tuition" | "report" | "sheet" | "diagrams" | "tool";

/** The calculator that fits each syllabus's most tested calculation. */
const TOOL: Record<string, RelatedLink> = {
  "7707": { href: "/tools/ratio-calculator", label: "Accounting ratio calculator" },
  "0452": { href: "/tools/ratio-calculator", label: "Accounting ratio calculator" },
  "9706": { href: "/tools/depreciation-calculator", label: "Depreciation calculator" },
  "2281": { href: "/tools/elasticity-calculator", label: "Elasticity calculator" },
  "0455": { href: "/tools/elasticity-calculator", label: "Elasticity calculator" },
  "9708": { href: "/tools/elasticity-calculator", label: "Elasticity calculator" },
  "7115": { href: "/tools/break-even-calculator", label: "Break-even calculator" },
  "0450": { href: "/tools/break-even-calculator", label: "Break-even calculator" },
  "9609": { href: "/tools/investment-appraisal-calculator", label: "Investment appraisal calculator" },
};

/** Which tuition level page teaches each syllabus code (old and new codes alike). */
const TUITION: Record<string, [subject: string, level: "o-level-igcse" | "a-level"]> = {
  "7707": ["accounting", "o-level-igcse"],
  "0452": ["accounting", "o-level-igcse"],
  "9706": ["accounting", "a-level"],
  "7115": ["business", "o-level-igcse"],
  "7081": ["business", "o-level-igcse"],
  "0450": ["business", "o-level-igcse"],
  "0264": ["business", "o-level-igcse"],
  "9609": ["business", "a-level"],
  "2281": ["economics", "o-level-igcse"],
  "0455": ["economics", "o-level-igcse"],
  "9708": ["economics", "a-level"],
};

/** The tuition level page for a syllabus code, or null. */
export function tuitionLink(code: string): RelatedLink | null {
  const t = TUITION[code];
  const page = t ? LEVEL_PAGES.find((p) => p.subjectSlug === t[0] && p.slug === t[1]) : undefined;
  if (!t || !page) return null;
  const subject = t[0][0].toUpperCase() + t[0].slice(1);
  return { href: levelPath(t[0], t[1]), label: `${page.name} ${subject} tutor: live online classes` };
}

/** The Edexcel guide that matches a Cambridge syllabus, or null. */
export function edexcelLink(code: string): RelatedLink | null {
  const q = EDEXCEL.find((x) => x.cambridge.code === code);
  return q ? { href: `/syllabus/edexcel/${q.slug}`, label: `On Edexcel? ${q.name} ${q.code} guide` } : null;
}

/** The past paper syllabus for a code, old or new (7081 finds the 7115 papers, 0264 the 0450 papers). */
const paperSyllabus = (code: string): PastPaperSyllabus | null =>
  PAST_PAPER_SYLLABI.find((s) => s.code === code) ?? PAST_PAPER_SYLLABI.find((s) => s.next?.code === code) ?? null;

/** Everything on the site for one syllabus, in the order a student revises: papers, topics, checklist, thresholds, a calculator. */
export function syllabusLinks(code: string, omit: RelatedKind[] = []): RelatedLink[] {
  const pp = paperSyllabus(code);
  const syl = SYLLABI.find((s) => s.code === code) ?? (pp ? SYLLABI.find((s) => s.code === pp.code || s.replaces === pp.code) : undefined);
  const gt = pp ? THRESHOLD_PAGES.find((t) => t.code === pp.code) : undefined;
  const tool = pp ? TOOL[pp.code] : undefined;
  // Formula sheet and diagram pages are keyed by the current syllabus (7081, 0264), so use the checklist's slug and code.
  const sheet = syl && FORMULA_SHEETS.some((f) => f.code === syl.code) ? { href: `/tools/formula-sheet/${syl.slug}`, label: `${syl.name} formula sheet` } : null;
  const diagrams = syl && DIAGRAM_SETS.some((d) => d.code === syl.code) ? { href: `/tools/economics-diagrams/${syl.slug}`, label: `${syl.name} diagrams` } : null;
  // Newest examiner report page for this syllabus.
  const report = pp ? reportsFor(pp.code)[0] : undefined;
  const all: Array<[RelatedKind, RelatedLink | null]> = [
    ["papers", pp ? { href: `/past-papers/${pp.slug}`, label: `${pp.name} past papers` } : null],
    ["topical", pp && hasTopical(pp.code) ? { href: `/past-papers/${pp.slug}/topics`, label: `${pp.name} past paper questions by topic` } : null],
    ["checklist", syl ? { href: `/syllabus/${syl.slug}`, label: `${syl.name} syllabus checklist` } : null],
    ["thresholds", gt ? { href: `/grade-thresholds/${gt.slug}`, label: `Grade thresholds for ${gt.name}` } : null],
    ["tuition", tuitionLink(code) ?? (pp ? tuitionLink(pp.code) : null)],
    ["report", report ? { href: reportHref(report), label: `${report.code} examiner report ${reportMonthLabel(report.series)}: common mistakes` } : null],
    ["sheet", sheet],
    ["diagrams", diagrams],
    ["tool", tool ?? null],
  ];
  return all.filter(([k, l]) => l && !omit.includes(k)).map(([, l]) => l!);
}

/** The topical page for one subtopic, named for what it holds, or null when it has no questions yet. */
export function topicLink(code: string, subNum: string): RelatedLink | null {
  const pp = paperSyllabus(code);
  const e = pp ? topicalFor(pp.code).find((x) => x.sub.num === subNum && x.questions.length) : null;
  return pp && e ? { href: `/past-papers/${pp.slug}/topics/${e.slug}`, label: `${e.sub.name}: ${pp.name} past paper questions` } : null;
}

/**
 * The block itself. Same rows as "Read next" on the tool pages. `small` uses
 * the heading size of pages whose own section headings are small (a paper page).
 * `className` replaces the default top margin. `max` caps the rows (8 by default).
 */
export function RelatedLinks({ links, small, className, max = 8 }: { links: RelatedLink[]; small?: boolean; className?: string; max?: number }) {
  const list = links.filter((l, i) => links.findIndex((x) => x.href === l.href) === i).slice(0, max);
  if (!list.length) return null;
  return (
    <nav aria-labelledby="keep-exploring-h" className={className ?? (small ? "mt-12" : "mt-16")}>
      <h2
        id="keep-exploring-h"
        className={small ? "text-lg font-semibold text-foreground" : "text-2xl font-bold leading-tight text-foreground md:text-3xl"}
      >
        Keep exploring
      </h2>
      <ul className={cn("divide-y divide-hairline border-y border-hairline text-lg", small ? "mt-3" : "mt-6")}>
        {list.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="group flex min-h-14 items-center justify-between gap-4 py-3 font-semibold text-foreground transition-colors duration-150 hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              {l.label}
              <span aria-hidden className="text-faint transition-colors duration-150 group-hover:text-foreground">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
