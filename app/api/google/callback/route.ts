import { type NextRequest, NextResponse } from "next/server";
import { checkState, exchangeCode, googleReady } from "@/lib/google";
import { pushReady, serviceClient } from "@/lib/push-server";

/** Google sends Hamza back here after "Connect Google". Saves the account. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const back = (result: string) => NextResponse.redirect(new URL(`/admin/classes?google=${result}`, req.nextUrl.origin));
  const code = req.nextUrl.searchParams.get("code");
  if (!googleReady() || !pushReady() || !code || !checkState(req.nextUrl.searchParams.get("state"))) return back("failed");
  try {
    const { refreshToken, email } = await exchangeCode(code, req.nextUrl.origin);
    const { error } = await serviceClient()
      .from("google_account")
      .upsert({ id: 1, refresh_token: refreshToken, email, connected_at: new Date().toISOString() });
    return back(error ? "failed" : "connected");
  } catch (e) {
    console.error("[google] connect", e);
    return back("failed");
  }
}
