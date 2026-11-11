import Link from "next/link";
import { cn } from "@/lib/cn";
import { PAST_PAPER_SYLLABI, type PastPaperSyllabus } from "@/lib/past-papers";
import { SYLLABI } from "@/lib/syllabus";
import { THRESHOLD_PAGES } from "@/lib/threshold-pages";
import { hasTopical, topicalFor } from "@/lib/topical";

/**
 * "Keep exploring": a short list of plain text links to the pages that belong
 * with this one (the same syllabus's papers, topics, checklist, thresholds and
 * calculator). Every link is built from the same data that builds those pages,
 * so a link only appears when its page exists.
 */
export type RelatedLink = { href: string; label: string };
export type RelatedKind = "papers" | "topical" | "checklist" | "thresholds" | "tool";

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

/** The past paper syllabus for a code, old or new (7081 finds the 7115 papers, 0264 the 0450 papers). */
const paperSyllabus = (code: string): PastPaperSyllabus | null =>
  PAST_PAPER_SYLLABI.find((s) => s.code === code) ?? PAST_PAPER_SYLLABI.find((s) => s.next?.code === code) ?? null;

/** Everything on the site for one syllabus, in the order a student revises: papers, topics, checklist, thresholds, a calculator. */
export function syllabusLinks(code: string, omit: RelatedKind[] = []): RelatedLink[] {
  const pp = paperSyllabus(code);
  const syl = SYLLABI.find((s) => s.code === code) ?? (pp ? SYLLABI.find((s) => s.code === pp.code || s.replaces === pp.code) : undefined);
  const gt = pp ? THRESHOLD_PAGES.find((t) => t.code === pp.code) : undefined;
  const tool = pp ? TOOL[pp.code] : undefined;
  const all: Array<[RelatedKind, RelatedLink | null]> = [
    ["papers", pp ? { href: `/past-papers/${pp.slug}`, label: `${pp.name} past papers` } : null],
    ["topical", pp && hasTopical(pp.code) ? { href: `/past-papers/${pp.slug}/topics`, label: `${pp.name} past paper questions by topic` } : null],
    ["checklist", syl ? { href: `/syllabus/${syl.slug}`, label: `${syl.name} syllabus checklist` } : null],
    ["thresholds", gt ? { href: `/grade-thresholds/${gt.slug}`, label: `Grade thresholds for ${gt.name}` } : null],
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
 * `className` replaces the default top margin.
 */
export function RelatedLinks({ links, small, className }: { links: RelatedLink[]; small?: boolean; className?: string }) {
  const list = links.filter((l, i) => links.findIndex((x) => x.href === l.href) === i).slice(0, 6);
  if (!list.length) return null;
  return (
    <nav aria-labelledby="keep-exploring-h" className={className ?? (small ? "mt-12" : "mt-16")}>
      <h2
        id="keep-exploring-h"
        className={small ? "text-lg font-semibold text-foreground" : "text-2xl font-bold leading-tight text-foreground md:text-3xl"}
      >
        Keep exploring
      </h2>
      <ul className={cn("divide-y divide-hairline border-y border-hairline text-[17px]", small ? "mt-3" : "mt-6")}>
        {list.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="group flex min-h-14 items-center justify-between gap-4 py-3 font-semibold text-foreground transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              {l.label}
              <span aria-hidden className="text-faint transition-colors group-hover:text-gold">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
