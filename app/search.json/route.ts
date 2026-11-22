import { siteRows } from "@/lib/site-search";

/** Everything searchable besides the papers, in one small list. Built once at deploy. */
export const dynamic = "force-static";

export async function GET() {
  return Response.json(await siteRows(), { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
