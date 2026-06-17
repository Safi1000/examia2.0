"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Role, Session } from "@/types";
import { getStore } from "@/lib/data/store";

const SESSION_KEY = "examia.session.v1";

interface AuthContextValue {
  session: Session | null;
  loginStudent: (username: string, password: string) => boolean;
  loginAdmin: (password: string) => boolean;
  logout: () => void;
  isRole: (role: Role) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(SESSION_KEY);
  }, [session]);

  const loginStudent = useCallback((username: string, password: string) => {
    const student = getStore().authenticateStudent(username, password);
    if (!student) return false;
    setSession({ role: "student", studentId: student.id });
    return true;
  }, []);

  const loginAdmin = useCallback((password: string) => {
    if (!getStore().verifyAdmin(password)) return false;
    setSession({ role: "admin" });
    return true;
  }, []);

  const logout = useCallback(() => setSession(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loginStudent,
      loginAdmin,
      logout,
      isRole: (role) => session?.role === role,
    }),
    [session, loginStudent, loginAdmin, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
