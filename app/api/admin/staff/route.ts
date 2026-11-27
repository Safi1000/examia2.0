import { type NextRequest, NextResponse } from "next/server";
import { adminIdFromRequest, staffFromRequest } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/push-server";
import { DEFAULT_ACCESS, cleanAccess, isStaffArea } from "@/lib/staff-areas";
import { addStaffLine, readStaffLog as readLog } from "@/lib/staff-log-server";

/**
 * Staff accounts (a teaching assistant, or anyone Hamza gives a sign-in) and their log.
 *
 * Owner only:
 *   GET                       staff accounts (name, email, paused, access) and the last 200 log lines
 *   POST   { name, email, password }   make a staff account (starts with lib/staff-areas.ts DEFAULT_ACCESS)
 *   PATCH  { id, action: "pause" | "resume" | "password" | "access" | "name", password?, access?, name? }
 *   DELETE { id }             remove their account for good
 * Staff (the staff member themselves, or Hamza):
 *   PUT    { what }           add one line to the log ("released ...", "replied to ...")
 *   GET    ?me=1              their own name and switched on parts, fresh (403 once paused or removed)
 *
 * Their account carries role "admin" plus staff "ta" and `access` (see lib/admin-auth.ts).
 * Only accounts with that mark can be changed here, never Hamza's or a student's.
 * The log is a private JSON file in Supabase Storage (no database change).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

type Sb = ReturnType<typeof serviceClient>;
const ready = () => !!(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: noStore });
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const okPassword = (v: unknown): v is string => typeof v === "string" && v.length >= 10 && v.length <= 72;

async function assistants(sb: Sb) {
  const out: Array<{ id: string; name: string; email: string; paused: boolean; lastSeen: string | null; access: string[] }> = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const u of data.users) {
      const m = u.app_metadata as { role?: string; staff?: string; name?: string; access?: unknown };
      if (m?.role === "admin" && m.staff === "ta") {
        const until = (u as { banned_until?: string | null }).banned_until;
        out.push({ id: u.id, name: m.name ?? "", email: u.email ?? "", paused: !!until && +new Date(until) > Date.now(), lastSeen: u.last_sign_in_at ?? null, access: cleanAccess(m.access) });
      }
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

/** The account, only if it is an assistant's. */
async function assistant(sb: Sb, id: string) {
  const { data } = await sb.auth.admin.getUserById(id);
  const m = data.user?.app_metadata as { role?: string; staff?: string } | undefined;
  return data.user && m?.role === "admin" && m.staff === "ta" ? data.user : null;
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("me") === "1") {
    const me = await staffFromRequest(req);
    if (!me) return bad("forbidden", 403);
    return NextResponse.json({ staff: me.ta, name: me.name, access: me.access }, { headers: noStore });
  }
  if (!(await adminIdFromRequest(req))) return bad("forbidden", 403);
  if (!ready()) return NextResponse.json({ staff: [], log: [] }, { headers: noStore });
  const sb = serviceClient();
  try {
    const [staff, log] = await Promise.all([assistants(sb), readLog(sb)]);
    return NextResponse.json({ staff, log: log.slice(-200).reverse() }, { headers: noStore });
  } catch {
    return bad("Couldn't load. Try again.", 502);
  }
}

export async function POST(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return bad("forbidden", 403);
  if (!ready()) return bad("This isn't set up on the server yet.", 503);
  const b = (await req.json().catch(() => null)) as { name?: unknown; email?: unknown; password?: unknown } | null;
  const name = typeof b?.name === "string" ? b.name.trim().slice(0, 60) : "";
  const email = typeof b?.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!name) return bad("Add their name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("That email doesn't look right.");
  if (!okPassword(b?.password)) return bad("The password needs at least 10 characters.");
  const sb = serviceClient();
  const { data, error } = await sb.auth.admin.createUser({ email, password: b.password, email_confirm: true, app_metadata: { role: "admin", staff: "ta", name, access: [...DEFAULT_ACCESS] } });
  if (error || !data.user) return bad(/already|registered|exists/i.test(error?.message ?? "") ? "That email already has an account." : "Couldn't make the account. Try again.", 409);
  return NextResponse.json({ ok: true, id: data.user.id }, { headers: noStore });
}

export async function PATCH(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return bad("forbidden", 403);
  if (!ready()) return bad("This isn't set up on the server yet.", 503);
  const b = (await req.json().catch(() => null)) as { id?: unknown; action?: unknown; password?: unknown; access?: unknown; name?: unknown } | null;
  if (!isUuid(b?.id)) return bad("bad request");
  const sb = serviceClient();
  const user = await assistant(sb, b.id);
  if (!user) return bad("That isn't a staff account.", 404);
  if (b.action === "access") {
    if (!Array.isArray(b.access) || !b.access.every(isStaffArea)) return bad("bad request");
    const { error } = await sb.auth.admin.updateUserById(b.id, { app_metadata: { ...(user.app_metadata ?? {}), access: cleanAccess(b.access) } });
    if (error) return bad("Couldn't save that. Try again.", 502);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (b.action === "pause" || b.action === "resume") {
    // About 100 years: paused until Hamza resumes it.
    const { error } = await sb.auth.admin.updateUserById(b.id, { ban_duration: b.action === "pause" ? "876000h" : "none" });
    if (error) return bad("Couldn't change that. Try again.", 502);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (b.action === "name") {
    // A typo fixed in place: only the name changes, never the sign-in or the switches.
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
    if (!name) return bad("Add their name.");
    const { error } = await sb.auth.admin.updateUserById(b.id, { app_metadata: { ...(user.app_metadata ?? {}), name } });
    if (error) return bad("Couldn't save that. Try again.", 502);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (b.action === "password") {
    if (!okPassword(b.password)) return bad("The password needs at least 10 characters.");
    const { error } = await sb.auth.admin.updateUserById(b.id, { password: b.password });
    if (error) return bad("Couldn't change the password. Try again.", 502);
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  return bad("bad request");
}

export async function DELETE(req: NextRequest) {
  if (!(await adminIdFromRequest(req))) return bad("forbidden", 403);
  if (!ready()) return bad("This isn't set up on the server yet.", 503);
  const b = (await req.json().catch(() => null)) as { id?: unknown } | null;
  if (!isUuid(b?.id)) return bad("bad request");
  const sb = serviceClient();
  if (!(await assistant(sb, b.id))) return bad("That isn't a staff account.", 404);
  const { error } = await sb.auth.admin.deleteUser(b.id);
  if (error) return bad("Couldn't remove the account. Try again.", 502);
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function PUT(req: NextRequest) {
  const who = await staffFromRequest(req);
  if (!who) return bad("forbidden", 403);
  if (!ready()) return NextResponse.json({ ok: true }, { headers: noStore });
  const b = (await req.json().catch(() => null)) as { what?: unknown } | null;
  const what = typeof b?.what === "string" ? b.what.replace(/\s+/g, " ").trim().slice(0, 200) : "";
  if (!what) return bad("bad request");
  await addStaffLine(serviceClient(), who.ta ? who.name || "Staff" : "Hamza", what);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
