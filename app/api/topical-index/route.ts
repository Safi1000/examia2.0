import { PAST_PAPER_SYLLABI } from "@/lib/past-papers";
import { topicalFor } from "@/lib/topical";
import type { TopicalIndex } from "@/lib/syllabus-progress";

/**
 * How many topical past paper questions each syllabus topic has, and its
 * page, for the portal's syllabus progress. Built once at deploy (the
 * question data only changes with a deploy), so it is a small static file.
 */
export const dynamic = "force-static";

export function GET() {
  const index: TopicalIndex = {};
  for (const s of PAST_PAPER_SYLLABI) {
    const topics: TopicalIndex[string]["topics"] = {};
    for (const e of topicalFor(s.code)) {
      if (!e.questions.length) continue;
      const mcq = e.questions.filter((q) => q.kind === "mcq").length;
      topics[e.sub.num] = [e.slug, mcq, e.questions.length - mcq];
    }
    index[s.code] = { slug: s.slug, topics };
  }
  return Response.json(index, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}
