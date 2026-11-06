import { searchRows } from "@/lib/past-papers";

/** Every paper in one small list for the search box. Built once at deploy. */
export const dynamic = "force-static";

export function GET() {
  return Response.json(searchRows(), { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
