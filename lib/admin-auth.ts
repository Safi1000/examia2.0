import { createClient } from "@supabase/supabase-js";

/** True when the request carries a signed-in admin's Supabase token. */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return false;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data } = await sb.auth.getUser();
  return (data.user?.app_metadata as { role?: string } | undefined)?.role === "admin";
}
