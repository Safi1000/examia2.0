/**
 * Per-user accent theming. Each option overrides the brand token group (the only
 * tokens that carry the app's accent); everything else in the Almanac palette is
 * untouched. Choices persist per user in localStorage (device-local UX state,
 * like drafts/dismissals). All values stay within the warm-paper identity —
 * no purple/pink, per the design rules.
 */
import type { Session } from "@/types";

export interface ThemeOption {
  id: string;
  name: string;
  brand: string;
  brandStrong: string;
  brandSoft: string;
  onBrand: string;
}

export const THEMES: ThemeOption[] = [
  { id: "teal",   name: "Petrol Teal", brand: "#0e6e68", brandStrong: "#0a5852", brandSoft: "#dfeceb", onBrand: "#fcfaf4" },
  { id: "indigo", name: "Indigo",      brand: "#3f5ba9", brandStrong: "#324a8c", brandSoft: "#e4e8f4", onBrand: "#fcfaf4" },
  { id: "coral",  name: "Coral",       brand: "#cf5a3a", brandStrong: "#b0472b", brandSoft: "#f6e3dc", onBrand: "#fcfaf4" },
  { id: "gold",   name: "Amber",       brand: "#b07d12", brandStrong: "#8f6410", brandSoft: "#f3e8cc", onBrand: "#fcfaf4" },
  { id: "olive",  name: "Olive",       brand: "#5f7d34", brandStrong: "#4d672a", brandSoft: "#e8eed7", onBrand: "#fcfaf4" },
  { id: "slate",  name: "Slate",       brand: "#4f6d88", brandStrong: "#3f5870", brandSoft: "#e3e9ef", onBrand: "#fcfaf4" },
];

export const DEFAULT_THEME_ID = THEMES[0].id;

export function themeById(id: string | null | undefined): ThemeOption {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

/** A stable per-user storage key so each account keeps its own choice. */
export function themeUserKey(session: Session | null): string {
  if (!session) return "guest";
  if (session.role === "admin") return "admin";
  return session.studentId ? `st:${session.studentId}` : "guest";
}

const storageKey = (userKey: string) => `examia.theme.${userKey}`;
// Last applied theme on this device — used to paint the right accent on first
// render (before the session/server preference has resolved), avoiding a flash.
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

/** Apply a theme by overriding the brand CSS custom properties on <html>. */
export function applyTheme(id: string): void {
  if (typeof document === "undefined") return;
  const t = themeById(id);
  const s = document.documentElement.style;
  s.setProperty("--color-brand", t.brand);
  s.setProperty("--color-brand-strong", t.brandStrong);
  s.setProperty("--color-brand-soft", t.brandSoft);
  s.setProperty("--color-on-brand", t.onBrand);
  s.setProperty("--ruled-margin", t.brand);
}
