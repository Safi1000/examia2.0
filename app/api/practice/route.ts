import { PRACTICE_HEADERS, practiceIndex } from "@/lib/practice-feed";

/** Every syllabus the phone app can practise (PracticeIndex). Static, built at deploy. */
export const dynamic = "force-static";

export function GET() {
  return Response.json(practiceIndex(), { headers: PRACTICE_HEADERS });
}
