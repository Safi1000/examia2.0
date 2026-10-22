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
  /** All-time minutes (for levels). */
  totalMinutes?: number;
  /** Minutes per day (YYYY-MM-DD), last ~4 months, for the study calendar. */
  days?: Record<string, number>;
}

export interface Profile {
  avatar?: string;
  /** Target grade per subject name ("Accounting": "A"). */
  targets?: Record<string, Target>;
  weeklyGoal?: number;
  /** Already asked once about notifications outside the welcome flow. */
  notifyAsked?: boolean;
  /** Finished (or skipped) the welcome flow. */
  onboarded?: boolean;
  focus?: FocusStats;
}

/** Portal avatars (public/avatars/*.webp), cut from Hamza's illustrated set. */
export const AVATARS: Array<{ id: string; label: string }> = [
  { id: "pakol-boy", label: "Pakol" },
  { id: "dupatta-girl", label: "Dupatta" },
  { id: "glasses-boy", label: "Glasses" },
  { id: "ajrak-girl", label: "Ajrak" },
  { id: "turban-man", label: "Turban" },
  { id: "chitrali-girl", label: "Chitrali" },
  { id: "curly-boy", label: "Curls" },
  { id: "clown", label: "Clown" },
  { id: "hijab-girl", label: "Hijab" },
];
