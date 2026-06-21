"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { Role, Session } from "@/types";
import { supabase } from "@/lib/supabase";
import { getStore } from "@/lib/data/store";
import { ADMIN_EMAIL, studentEmail } from "@/lib/config";

interface AuthContextValue {
  session: Session | null;
  /** True until the initial Supabase session check resolves. */
  initializing: boolean;
  loginStudent: (username: string, password: string) => Promise<boolean>;
  loginAdmin: (password: string) => Promise<boolean>;
  logout: () => void;
  isRole: (role: Role) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
  const currentUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const sb = supabase();

    // IMPORTANT: do NOT await Supabase calls *inside* the onAuthStateChange
    // callback — supabase-js holds an auth lock during it and any awaited auth
    // call (token read, queries, getStore().load()) deadlocks, hanging the app
    // on "Loading…". We defer all real work to a microtask outside the callback.
    // onAuthStateChange also fires once on subscribe with the current session,
    // so it doubles as our initial bootstrap (no separate getSession needed).
    const establish = (user: User) => {
      currentUserId.current = user.id;
      setTimeout(async () => {
        if (!active) return;
        try {
          const next = await resolveSession(user);
          await getStore().load();
          if (active) setSession(next);
        } catch (e) {
          console.error("auth establish failed", e);
        } finally {
          if (active) setInitializing(false);
        }
      }, 0);
    };

    const { data: sub } = sb.auth.onAuthStateChange((_event, sess) => {
      if (!active) return;
      if (!sess?.user) {
        currentUserId.current = null;
        getStore().reset();
        setSession(null);
        setInitializing(false);
        return;
      }
      // Ignore token-refresh churn for the already-active user.
      if (sess.user.id === currentUserId.current) return;
      // Hold layouts in "Loading…" (not "redirect to login") until establish finishes.
      setInitializing(true);
      establish(sess.user);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Login just authenticates; onAuthStateChange (above) loads data + publishes
  // the session. Returning quickly lets the caller navigate while the
  // destination layout shows its own "Loading…" until the cache is ready.
  const loginStudent = useCallback(async (username: string, password: string) => {
    const { error } = await supabase().auth.signInWithPassword({ email: studentEmail(username), password });
    if (error) return false;
    setInitializing(true); // keep the destination layout in Loading until establish runs
    return true;
  }, []);

  const loginAdmin = useCallback(async (password: string) => {
    const { data, error } = await supabase().auth.signInWithPassword({ email: ADMIN_EMAIL, password });
    if (error || !data.user) return false;
    if ((data.user.app_metadata as Record<string, unknown>)?.role !== "admin") {
      await supabase().auth.signOut();
      return false;
    }
    setInitializing(true);
    return true;
  }, []);

  const logout = useCallback(() => {
    void supabase().auth.signOut(); // onAuthStateChange clears session + cache
    currentUserId.current = null;
    getStore().reset();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      initializing,
      loginStudent,
      loginAdmin,
      logout,
      isRole: (role) => session?.role === role,
    }),
    [session, initializing, loginStudent, loginAdmin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
