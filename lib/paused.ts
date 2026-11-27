"use client";

import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";

/**
 * The teacher console's view of students' access (see app/api/admin/access).
 *
 * Paused: the student signs in to the pause screen, gets no reminders, is not
 * marked absent, and is left out of Today's lists and the parent reminders
 * until resumed. A pause can carry a reason the student sees (fees due, on a
 * break).
 *
 * Left: the student finished the course or dropped out. A left student is
 * always paused too (so every exclusion above applies), their username was
 * freed for a new student, and they see a farewell screen with a feedback ask.
 *
 * Loaded once per visit; the Students pages update it after a change. If it
 * can't be read, nobody counts as paused or left.
 */
export type PauseReason = "fees" | "break";
export type LeftKind = "finished" | "dropped";
export type FarewellNote = { rating: 1 | 2 | 3 | 4 | 5 | null; helped?: string; change?: string; at: string };
export type LeftInfo = {
  kind: LeftKind;
  at: string;
  /** Their username before it was freed. */
  username: string;
  /** Only for Hamza: staff get the rating without the texts. */
  farewell?: FarewellNote;
  /** The farewell link, if the server sends it with the list. */
  link?: string;
};
export type AccessState = {
  paused: Set<string>;
  reasons: Record<string, PauseReason>;
  left: Record<string, LeftInfo>;
};

let state: AccessState = { paused: new Set(), reasons: {}, left: {} };
let started = false;
const listeners = new Set<() => void>();

export const isPausedId = (id: string) => state.paused.has(id);

function emit(next: AccessState) {
  state = next;
  listeners.forEach((l) => l());
}

export function setPausedIds(next: Set<string>) {
  emit({ ...state, paused: next });
}

/** Change part of the access view on this screen (after a save the server confirmed). */
export function patchAccess(fn: (now: AccessState) => AccessState) {
  emit(fn(state));
}

const isReason = (v: unknown): v is PauseReason => v === "fees" || v === "break";

async function authHeader() {
  const { data } = await supabase().auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

async function load() {
  try {
    const res = await fetch("/api/admin/access", { headers: await authHeader() });
    if (!res.ok) return;
    const out = (await res.json()) as { paused?: string[]; reasons?: Record<string, unknown>; left?: Record<string, LeftInfo> };
    const reasons: Record<string, PauseReason> = {};
    for (const [id, r] of Object.entries(out.reasons ?? {})) if (isReason(r)) reasons[id] = r;
    const left: Record<string, LeftInfo> = {};
    for (const [id, l] of Object.entries(out.left ?? {})) {
      if (l && (l.kind === "finished" || l.kind === "dropped") && typeof l.username === "string") left[id] = l;
    }
    emit({ paused: new Set(out.paused ?? []), reasons, left });
  } catch {
    /* keep what we have */
  }
}

/** Read the list again from the server. */
export const reloadAccess = () => load();

export type AccessReply = {
  ok?: boolean;
  done?: string[];
  failed?: Array<{ id: string; why: string }>;
  renamed?: Record<string, string>;
  links?: Record<string, string>;
  notRestored?: string[];
  error?: string;
};

/**
 * One change on the server (Hamza only): pause or resume with a reason, mark
 * as left, or bring back. Returns the server's answer, or an error line the
 * teacher can act on. Never throws.
 */
export async function postAccess(
  body: { ids: string[]; paused: boolean; reason?: PauseReason | null } | { ids: string[]; left: LeftKind | null },
): Promise<{ ok: true; out: AccessReply } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/admin/access", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => null)) as AccessReply | null;
    if (!res.ok || !out) return { ok: false, error: out?.error && res.status !== 403 ? out.error : "Couldn't change access. Try again." };
    return { ok: true, out };
  } catch {
    return { ok: false, error: "Couldn't change access. Check your connection and try again." };
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const emptyState: AccessState = { paused: new Set(), reasons: {}, left: {} };

function useStart() {
  useEffect(() => {
    if (started) return;
    started = true;
    void load();
  }, []);
}

/** The paused students' ids (left students included); re-renders when the list loads or changes. */
export function usePausedIds(): Set<string> {
  useStart();
  return useSyncExternalStore(subscribe, () => state.paused, () => emptyState.paused);
}

/** Paused ids, pause reasons and left students together. */
export function useAccess(): AccessState {
  useStart();
  return useSyncExternalStore(subscribe, () => state, () => emptyState);
}

/** "fees due" / "on a break", for the teacher's lists. */
export const reasonLabel = (r: PauseReason | undefined) => (r === "fees" ? "fees due" : r === "break" ? "on a break" : "");
/** "Finished" / "Dropped out". */
export const leftLabel = (k: LeftKind) => (k === "finished" ? "Finished" : "Dropped out");
