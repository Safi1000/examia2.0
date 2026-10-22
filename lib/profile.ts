/**
 * A student's own settings, set in the welcome flow and changeable later.
 * Stored on their sign-in account (Supabase user_metadata), so no database
 * change was needed. Hamza reads them through /api/admin/profiles.
 */

/** Weekly study goal outside class, in hours (Study timer counts towards it). */
export const WEEKLY_GOALS = [3, 5, 8, 12] as const;

export const TARGETS = ["A*", "A", "B", "C"] as const;
export type Target = (typeof TARGETS)[number];

export interface FocusStats {
  /** Days in a row with at least one finished focus session. */
  streak: number;
  /** YYYY-MM-DD (Pakistan) of the last finished session. */
  lastDay: string | null;
  /** Monday of the week the minutes below belong to. */
  weekOf: string | null;
  weekMinutes: number;
  bySubject: Record<string, number>;
}

export interface Profile {
  avatar?: string;
  /** Target grade per subject name ("Accounting": "A"). */
  targets?: Record<string, Target>;
  weeklyGoal?: number;
  /** Finished (or skipped) the welcome flow. */
  onboarded?: boolean;
  focus?: FocusStats;
}

/**
 * Portal avatars: a face on a colour, Netflix-style. Muted jewel tones that
 * sit well on the charcoal portal; the face is always warm off-white.
 */
export const AVATARS: Array<{ id: string; bg: string; face: "smile" | "grin" | "wink" | "cool" | "calm" | "wow" | "focus" | "joy" }> = [
  { id: "gold", bg: "#C9962F", face: "smile" },
  { id: "teal", bg: "#2F7F7A", face: "grin" },
  { id: "plum", bg: "#6E4A7E", face: "wink" },
  { id: "navy", bg: "#2E4C7A", face: "cool" },
  { id: "rust", bg: "#A4553A", face: "calm" },
  { id: "olive", bg: "#6B7A3A", face: "wow" },
  { id: "rose", bg: "#A34E66", face: "focus" },
  { id: "slate", bg: "#4A5560", face: "joy" },
];
