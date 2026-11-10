import type { Session } from "@/types";

export interface ThemeOption {
  id: string;
  name: string;
  brand: string;
  brandStrong: string;
  brandSoft: string;
  onBrand: string;
}

/** Gold is the only accent (Hamza, 10 Nov 2026): any colour saved before falls back to gold. */
export const THEMES: ThemeOption[] = [
  { id: "gold", name: "Gold", brand: "#FBC159", brandStrong: "#e5a832", brandSoft: "#2e2510", onBrand: "#1a1d20" },
];

export const DEFAULT_THEME_ID = "gold";

export function themeById(id: string | null | undefined): ThemeOption {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function themeUserKey(session: Session | null): string {
  if (!session) return "guest";
  if (session.role === "admin") return "admin";
  return session.studentId ? `st:${session.studentId}` : "guest";
}

const storageKey = (userKey: string) => `examia.theme.${userKey}`;
const LAST_KEY = "examia.theme.last";

export function loadThemeId(userKey: string): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    return window.localStorage.getItem(storageKey(userKey)) || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function loadLastThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    return window.localStorage.getItem(LAST_KEY) || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function saveThemeId(userKey: string, id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userKey), id);
    window.localStorage.setItem(LAST_KEY, id);
  } catch {
    /* ignore */
  }
}

export function applyTheme(id: string): void {
  if (typeof document === "undefined") return;
  const t = themeById(id);
  const s = document.documentElement.style;
  s.setProperty("--color-brand", t.brand);
  s.setProperty("--color-brand-strong", t.brandStrong);
  s.setProperty("--color-brand-soft", t.brandSoft);
  s.setProperty("--color-on-brand", t.onBrand);
}
