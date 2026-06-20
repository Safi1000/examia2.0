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

  /** Bring up a session: resolve role, hydrate the data cache, then publish. */
  const establish = useCallback(async (user: User) => {
    const next = await resolveSession(user);
    await getStore().load();
    currentUserId.current = user.id;
    setSession(next);
  }, []);

  useEffect(() => {
    let active = true;
    const sb = supabase();

    sb.auth.getSession()
      .then(async ({ data }) => {
        if (active && data.session?.user) await establish(data.session.user);
      })
      .catch((e) => {
        // Stale/invalid session (e.g. the user was deleted) — sign out cleanly.
        console.error("auth init failed", e);
        void sb.auth.signOut();
        getStore().reset();
      })
      .finally(() => {
        if (active) setInitializing(false);
      });

    const { data: sub } = sb.auth.onAuthStateChange(async (event, sess) => {
      if (!active) return;
      if (event === "SIGNED_OUT" || !sess?.user) {
        currentUserId.current = null;
        getStore().reset();
        setSession(null);
        return;
      }
      // Avoid redundant reloads on token refresh for the same user.
      if (sess.user.id === currentUserId.current) return;
      try {
        await establish(sess.user);
      } catch (e) {
        console.error("auth state change failed", e);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [establish]);

  const loginStudent = useCallback(
    async (username: string, password: string) => {
      const { data, error } = await supabase().auth.signInWithPassword({
        email: studentEmail(username),
        password,
      });
      if (error || !data.user) return false;
      await establish(data.user);
      return true;
    },
    [establish],
  );

  const loginAdmin = useCallback(
    async (password: string) => {
      const { data, error } = await supabase().auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password,
      });
      if (error || !data.user) return false;
      if ((data.user.app_metadata as Record<string, unknown>)?.role !== "admin") {
        await supabase().auth.signOut();
        return false;
      }
      await establish(data.user);
      return true;
    },
    [establish],
  );

  const logout = useCallback(() => {
    void supabase().auth.signOut();
    // onAuthStateChange clears the session + cache; clear eagerly too.
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
