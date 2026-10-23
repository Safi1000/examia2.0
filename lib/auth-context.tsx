"use client";

import type { Profile } from "@/lib/profile";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Role, Session } from "@/types";
import { supabase } from "@/lib/supabase";
import { getStore } from "@/lib/data/store";
import { studentEmail } from "@/lib/config";
import { DEMO, DEMO_STUDENT_ID, demoRole, setDemoRole, type DemoRole } from "@/lib/demo";
import {
  DEFAULT_THEME_ID,
  loadLastThemeId,
  loadThemeId,
  saveThemeId,
  themeUserKey,
} from "@/lib/theme";

interface AuthContextValue {
  session: Session | null;
  /** True while a session is being brought up (initial load or login). */
  initializing: boolean;
  loginStudent: (username: string, password: string) => Promise<boolean>;
  loginAdmin: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isRole: (role: Role) => boolean;
  /** Current accent theme id; persists per user (server + local cache). */
  themeId: string;
  setTheme: (id: string) => void;
  /** The student's own settings (avatar, targets, exam session, study stats). */
  profile: Profile;
  /** A patch, or a function of the latest saved profile (use that for counters like study time). */
  updateProfile: (patch: Partial<Profile> | ((latest: Profile) => Partial<Profile>)) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const DEMO_PROFILE_KEY = "ht_demo_profile";

/** Resolve a Supabase user into the app's session shape (role + studentId). */
async function resolveSession(user: User): Promise<Session> {
  const isAdmin = (user.app_metadata as Record<string, unknown>)?.role === "admin";
  if (isAdmin) return { role: "admin" };
  const { data } = await supabase().from("students").select("id").eq("user_id", user.id).maybeSingle();
  return { role: "student", studentId: (data?.id as string) ?? undefined };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [themeId, setThemeId] = useState<string>(() => loadLastThemeId());
  const [profile, setProfile] = useState<Profile>({});
  const currentUserId = useRef<string | null>(null);

  /**
   * Bring up a session: resolve role, hydrate the data cache, publish. Idempotent
   * per user — the synchronous guard+set runs atomically, so whichever of login
   * or the auth listener reaches it first wins and the other no-ops. Safe to call
   * from login (outside the auth lock) but NEVER directly inside onAuthStateChange.
   */
  /** Loads the signed-in user's portal. Returns false if it couldn't. */
  const establish = useCallback(async (user: User): Promise<boolean> => {
    if (currentUserId.current === user.id) return true;
    currentUserId.current = user.id;
    setInitializing(true);
    try {
      // Role is known from the sign-in itself; load the portal while the
      // student record is looked up, instead of one after the other.
      getStore().setAudience((user.app_metadata as Record<string, unknown>)?.role === "admin" ? "admin" : "student");
      const [next] = await Promise.all([resolveSession(user), getStore().load()]);
      setSession(next);
      // Server-stored preference is the source of truth; fall back to this
      // device's last choice, then default. Sync the local cache either way.
      setProfile(((user.user_metadata as Record<string, unknown>)?.profile as Profile) ?? {});
      const serverTheme = (user.user_metadata as Record<string, unknown>)?.theme as string | undefined;
      const tid = serverTheme || loadThemeId(themeUserKey(next)) || DEFAULT_THEME_ID;
      setThemeId(tid);
      saveThemeId(themeUserKey(next), tid);
    } catch (e) {
      console.error("auth establish failed", e);
      currentUserId.current = null; // so trying again actually retries
      return false;
    } finally {
      setInitializing(false);
    }
    return true;
  }, []);

  /** Preview-only sign-in as a sample student or the admin (lib/demo.ts). */
  const establishDemo = useCallback(async (role: DemoRole) => {
    setDemoRole(role);
    await getStore().load();
    setSession(role === "admin" ? { role: "admin" } : { role: "student", studentId: DEMO_STUDENT_ID });
    try {
      setProfile(JSON.parse(localStorage.getItem(DEMO_PROFILE_KEY) ?? "{}") as Profile);
    } catch {}
    setInitializing(false);
  }, []);

  useEffect(() => {
    if (DEMO) {
      // Deferred like the real bootstrap below, so no setState runs in the effect body.
      const t = setTimeout(() => {
        const role = demoRole();
        if (role) void establishDemo(role);
        else setInitializing(false);
      }, 0);
      return () => clearTimeout(t);
    }
    let active = true;
    const sb = supabase();

    // onAuthStateChange fires once on subscribe with the current session, so it
    // doubles as our initial bootstrap. We must NOT await Supabase calls inside
    // this callback (it runs under an auth lock and would deadlock), so establish
    // is deferred to a macrotask outside the callback.
    const { data: sub } = sb.auth.onAuthStateChange((_event, sess) => {
      if (!active) return;
      if (!sess?.user) {
        currentUserId.current = null;
        getStore().reset();
        setSession(null);
        setInitializing(false);
        return;
      }
      if (sess.user.id === currentUserId.current) return; // ignore token-refresh churn
      setTimeout(() => {
        if (active) void establish(sess.user);
      }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [establish, establishDemo]);

  const loginStudent = useCallback(
    async (username: string, password: string) => {
      if (DEMO) {
        await establishDemo("student");
        return true;
      }
      const { data, error } = await supabase().auth.signInWithPassword({
        email: studentEmail(username),
        password,
      });
      // No internet is not a wrong password: never count it towards the lockout.
      if (error && (error.status === 0 || /fetch|network/i.test(error.message))) throw new Error("network");
      if (error || !data.user) return false;
      // Fully ready before the caller navigates. A right password whose portal
      // then fails to load is not a wrong password: tell the page apart.
      if (!(await establish(data.user))) throw new Error("portal-load-failed");
      return true;
    },
    [establish, establishDemo],
  );

  const loginAdmin = useCallback(
    async (email: string, password: string) => {
      if (DEMO) {
        await establishDemo("admin");
        return true;
      }
      const { data, error } = await supabase().auth.signInWithPassword({ email, password });
      if (error || !data.user) return false;
      if ((data.user.app_metadata as Record<string, unknown>)?.role !== "admin") {
        await supabase().auth.signOut();
        return false;
      }
      await establish(data.user);
      return true;
    },
    [establish, establishDemo],
  );

  const logout = useCallback(() => {
    if (DEMO) setDemoRole(null);
    // Signing out of a shared phone stops this student's notifications on it.
    void (async () => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          await sub.unsubscribe();
        }
      } catch {}
      await supabase().auth.signOut();
    })(); // onAuthStateChange clears session + cache
    currentUserId.current = null;
    getStore().reset();
    setSession(null);
    setThemeId(DEFAULT_THEME_ID);
    setProfile({});
  }, []);

  /**
   * Save part of the student's profile. Shows at once, then saves one change
   * at a time on top of the latest copy on their account, so a phone and a
   * laptop never undo each other.
   */
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const updateProfile = useCallback((patch: Partial<Profile> | ((latest: Profile) => Partial<Profile>)) => {
    const apply = (base: Profile) => ({ ...base, ...(typeof patch === "function" ? patch(base) : patch) });
    setProfile((cur) => apply(cur));
    saving.current = saving.current.then(async () => {
      if (DEMO) {
        let base: Profile = {};
        try {
          base = JSON.parse(localStorage.getItem(DEMO_PROFILE_KEY) ?? "{}") as Profile;
        } catch {}
        const next = apply(base);
        try {
          localStorage.setItem(DEMO_PROFILE_KEY, JSON.stringify(next));
        } catch {}
        return;
      }
      try {
        const { data } = await supabase().auth.getUser();
        const latest = ((data.user?.user_metadata as Record<string, unknown> | undefined)?.profile as Profile) ?? {};
        const next = apply(latest);
        const { data: saved } = await supabase().auth.updateUser({ data: { profile: next } });
        setProfile(((saved.user?.user_metadata as Record<string, unknown> | undefined)?.profile as Profile) ?? next);
      } catch (e) {
        console.error("[profile] save", e);
      }
    });
  }, []);

  // Coming back to the tab: pick up changes made on another device.
  useEffect(() => {
    if (DEMO || session?.role !== "student") return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      void supabase()
        .auth.getUser()
        .then(({ data }) => {
          const p = (data.user?.user_metadata as Record<string, unknown> | undefined)?.profile as Profile | undefined;
          if (p) setProfile(p);
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [session?.role]);

  /** Persist the accent choice for this user: state + local cache + server. */
  const setTheme = useCallback(
    (id: string) => {
      setThemeId(id);
      saveThemeId(themeUserKey(session), id);
      void supabase().auth.updateUser({ data: { theme: id } });
    },
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      loginStudent,
      loginAdmin,
      logout,
      isRole: (role) => session?.role === role,
      themeId,
      setTheme,
      profile,
      updateProfile,
    }),
    [session, initializing, loginStudent, loginAdmin, logout, themeId, setTheme, profile, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** For surfaces that may render outside AuthProvider (the public pages). */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
