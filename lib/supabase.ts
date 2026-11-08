"use client";

/**
 * The browser Supabase client (singleton). Auth + every table read/write in the
 * app goes through this; Row-Level Security on the project enforces cohort
 * scoping and hides answer keys (see the SQL migrations). The publishable/anon
 * key is safe to ship — it carries no privileges of its own.
 *
 * The client is created lazily and the env check happens on first use (not at
 * module load) so server prerendering during `next build` never evaluates it —
 * supabase() is only ever called from client effects/handlers.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO, demoClient } from "@/lib/demo";
import { inApp } from "@/lib/in-app";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!client && DEMO) client = demoClient() as SupabaseClient;
  if (!client) {
    if (!url || !anonKey) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in your environment (Vercel project settings, or .env.local locally).",
      );
    }
    // Inside the phone app several pages can be open at once, all sharing one
    // sign-in. Only the app renews it (a refresh token used twice signs the
    // student out); it hands each page the new session through __htSetSession.
    const app = inApp();
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: !app,
        detectSessionInUrl: false,
      },
    });
    if (app) {
      const c = client;
      (window as Window & { __htSetSession?: (json: string) => void }).__htSetSession = (json: string) => {
        try {
          const s = JSON.parse(json) as { access_token?: string; refresh_token?: string };
          if (s.access_token && s.refresh_token) void c.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
        } catch {}
      };
    }
  }
  return client;
}
