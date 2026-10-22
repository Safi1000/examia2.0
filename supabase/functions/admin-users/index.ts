// Examia — privileged student provisioning.
//
// Creating/updating/deleting a Supabase Auth user needs the service role, which
// must never reach the browser. The admin app calls this function with the
// signed-in admin's JWT; we verify the caller is an admin, then use a
// service-role client to manage both the auth user and the students row.
//
// Students log in by username, so their auth email is synthesized as
// `${username}@${DOMAIN}` (kept in sync with lib/config.ts STUDENT_EMAIL_DOMAIN).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

const DOMAIN = "students.examia.local";

// Only the portal itself (and local development) may call this from a browser.
const ALLOWED = /^https:\/\/(www\.)?hamzateaches\.com$|^https:\/\/[a-z0-9-]+\.vercel\.app$|^http:\/\/localhost(:\d+)?$/;
function corsFor(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.test(origin) ? origin : "https://www.hamzateaches.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(cors: Record<string, string>, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const USERNAME = /^[a-z0-9._-]{3,30}$/;
const badUsername = (u: unknown) => typeof u !== "string" || !USERNAME.test(u.trim().toLowerCase());
const badPassword = (p: unknown) => typeof p !== "string" || p.length < 8 || p.length > 72;

const loginEmail = (username: string) => `${username.trim().toLowerCase()}@${DOMAIN}`;

Deno.serve(async (req: Request) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1. Verify the caller is an authenticated admin (their JWT, anon client).
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const {
      data: { user },
      error: authErr,
    } = await caller.auth.getUser();
    if (authErr || !user) return json(cors, { error: "unauthorized" }, 401);
    if ((user.app_metadata as Record<string, unknown>)?.role !== "admin") {
      return json(cors, { error: "forbidden" }, 403);
    }

    // 2. Perform the privileged work with the service role.
    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const body = await req.json();

    switch (body.action) {
      case "create": {
        const { username, email, cohortId, password } = body;
        if (badUsername(username)) return json(cors, { error: "Username: 3 to 30 letters, numbers, dots or dashes" }, 400);
        if (badPassword(password)) return json(cors, { error: "Password must be at least 8 characters" }, 400);
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
          email: loginEmail(username),
          password,
          email_confirm: true,
          app_metadata: { role: "student" },
        });
        if (cErr || !created.user) return json(cors, { error: cErr?.message ?? "create failed" }, 400);

        const { data: row, error: iErr } = await admin
          .from("students")
          .insert({
            user_id: created.user.id,
            username: String(username).trim(),
            email: email || null,
            cohort_id: cohortId || null,
          })
          .select()
          .single();
        if (iErr) {
          await admin.auth.admin.deleteUser(created.user.id); // roll back the auth user
          return json(cors, { error: iErr.message }, 400);
        }
        return json(cors, { student: row });
      }

      case "update": {
        const { studentId, username, email, cohortId, password } = body;
        if (password !== undefined && badPassword(password)) return json(cors, { error: "Password must be at least 8 characters" }, 400);
        const { data: existing, error: eErr } = await admin
          .from("students")
          .select("user_id, username")
          .eq("id", studentId)
          .single();
        if (eErr || !existing) return json(cors, { error: "not found" }, 404);
        // Older usernames are left alone; only a new one has to follow the rule.
        const renamed = username !== undefined && String(username).trim() !== existing.username;
        if (renamed && badUsername(username)) return json(cors, { error: "Username: 3 to 30 letters, numbers, dots or dashes" }, 400);

        const attrs: Record<string, unknown> = {};
        if (renamed) attrs.email = loginEmail(username); // username drives login email
        if (password) attrs.password = password;
        if (existing.user_id && Object.keys(attrs).length > 0) {
          const { error } = await admin.auth.admin.updateUserById(existing.user_id, attrs);
          if (error) return json(cors, { error: error.message }, 400);
        }

        // Only the fields that were sent: editing one thing never wipes another.
        const patch: Record<string, unknown> = {};
        if (username !== undefined) patch.username = String(username).trim();
        if ("email" in body) patch.email = email || null;
        if ("cohortId" in body) patch.cohort_id = cohortId || null;
        const { data: row, error: uErr } = await admin
          .from("students")
          .update(patch)
          .eq("id", studentId)
          .select()
          .single();
        if (uErr) return json(cors, { error: uErr.message }, 400);
        return json(cors, { student: row });
      }

      case "delete": {
        const { studentId } = body;
        const { data: existing } = await admin
          .from("students")
          .select("user_id")
          .eq("id", studentId)
          .single();
        await admin.from("students").delete().eq("id", studentId);
        if (existing?.user_id) await admin.auth.admin.deleteUser(existing.user_id);
        return json(cors, { ok: true });
      }

      default:
        return json(cors, { error: "unknown action" }, 400);
    }
  } catch (e) {
    console.error(e);
    return json(cors, { error: "Something went wrong. Try again." }, 500);
  }
});
