import { PRACTICE_CODES, PRACTICE_HEADERS, practicePack } from "@/lib/practice-feed";

/** One syllabus's past paper practice pack for the phone app (PracticePack). Static, one file per code. */
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return PRACTICE_CODES.map((code) => ({ code }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const pack = practicePack((await params).code);
  if (!pack) return Response.json({ error: "Unknown syllabus code" }, { status: 404 });
  return Response.json(pack, { headers: PRACTICE_HEADERS });
}
