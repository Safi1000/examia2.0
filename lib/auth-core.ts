"use client";

import { createContext, useContext } from "react";
import type { Profile } from "@/lib/profile";
import type { Role, Session } from "@/types";

/**
 * The auth context object on its own, with no Supabase or data store behind it,
 * so surfaces that only read the session (the public Nav) stay light.
 * AuthProvider (lib/auth-context.tsx) fills it in.
 */
export interface AuthContextValue {
  session: Session | null;
  /** True while a session is being brought up (initial load or login). */
  initializing: boolean;
  /** Signed in, but the portal couldn't load (weak signal). `retryLoad` tries again. */
  loadFailed: boolean;
  retryLoad: () => void;
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

export const AuthContext = createContext<AuthContextValue | null>(null);

/** For surfaces that may render outside AuthProvider (the public pages). */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}
