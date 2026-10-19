/**
 * Preview-only demo mode. Loads the sample data in lib/data/seed.ts instead of
 * Supabase so the portal can be reviewed locally without real keys or logins.
 *
 * It can never switch on in a live deploy: it needs BOTH a development build
 * (`next dev`) and NEXT_PUBLIC_DEMO_MODE=1. Run it with `npm run dev:demo`,
 * then open /dashboard?demo=student or /admin?demo=admin.
 */
export const DEMO =
  process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export type DemoRole = "student" | "admin";
const KEY = "examia_demo_role";

/** Reads ?demo=student|admin (and remembers it), else the last choice. */
export function demoRole(): DemoRole | null {
  if (!DEMO || typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("demo");
  if (q === "student" || q === "admin") {
    try {
      localStorage.setItem(KEY, q);
    } catch {}
    return q;
  }
  try {
    const v = localStorage.getItem(KEY);
    return v === "student" || v === "admin" ? v : null;
  } catch {
    return null;
  }
}

export function setDemoRole(role: DemoRole | null) {
  try {
    if (role) localStorage.setItem(KEY, role);
    else localStorage.removeItem(KEY);
  } catch {}
}

/** The sample student the demo signs in as. */
export const DEMO_STUDENT_ID = "st_amelia";

/**
 * Stand-in for the Supabase client: every call chains, every await resolves
 * to "no data, no error", so writes are accepted and silently dropped.
 */
export function demoClient(): unknown {
  const rows = { data: null, error: null, count: 0 };
  // Auth calls are read as `data.user` / `data.session`, so they get a shape.
  const auth = { data: { user: null, session: null, subscription: { unsubscribe() {} } }, error: null };
  const make = (result: unknown = rows): unknown => {
    const target = function () {};
    const proxy: unknown = new Proxy(target, {
      get(_t, prop) {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve(result);
        if (prop === "auth") return make(auth);
        return make(result);
      },
      apply() {
        return proxy;
      },
    });
    return proxy;
  };
  return make();
}
