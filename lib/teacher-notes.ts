"use client";

import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";

/**
 * Hamza's private note per student, shared by Today and the roster page.
 * Loaded once per visit from /api/admin/notes (a private file only the
 * teacher's server route can read); saves show straight away and roll back
 * with an error if the server says no. In the preview they stay in this browser.
 */

export type TeacherNote = { text: string; updatedAt: string };
export const NOTE_MAX = 600;

type State = { notes: Record<string, TeacherNote>; loaded: boolean; error: boolean };
const EMPTY: State = { notes: {}, loaded: false, error: false };
let state: State = EMPTY;
let started = false;
const listeners = new Set<() => void>();
const DEMO_KEY = "ht_demo_teacher_notes";

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

async function load() {
  if (DEMO) {
    try {
      set({ notes: JSON.parse(localStorage.getItem(DEMO_KEY) ?? "{}") as Record<string, TeacherNote>, loaded: true, error: false });
    } catch {
      set({ loaded: true });
    }
    return;
  }
  try {
    const res = await fetch("/api/admin/notes", { headers: await authHeader(), cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as { notes?: Record<string, TeacherNote> };
    set({ notes: body.notes ?? {}, loaded: true, error: false });
  } catch {
    // Allow a later visit to try again.
    started = false;
    set({ loaded: true, error: true });
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  if (!started) {
    started = true;
    void load();
  }
  return () => listeners.delete(l);
}

const snapshot = () => state;
const serverSnapshot = () => EMPTY;

/** Every note, plus whether they have loaded (or failed to). */
export function useTeacherNotes(): State {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/**
 * Save one note (blank removes it). Shows at once; on failure the old note
 * comes back and the returned message says what went wrong.
 */
export async function saveTeacherNote(studentId: string, raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = raw.trim().slice(0, NOTE_MAX);
  const before = state.notes[studentId];
  const next = { ...state.notes };
  if (text) next[studentId] = { text, updatedAt: new Date().toISOString() };
  else delete next[studentId];
  set({ notes: next });
  if (DEMO) {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(next));
    } catch {}
    return { ok: true };
  }
  const fallback = "Couldn't save the note. Check the connection and try again.";
  let error = fallback;
  try {
    const res = await fetch("/api/admin/notes", {
      method: "PUT",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, text }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; note?: TeacherNote | null };
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) error = "Couldn't save: your sign-in has run out. Sign in again, then save.";
      else if (body.error && res.status !== 400) error = body.error;
      throw new Error(error);
    }
    // The server's time wins, so both devices show the same "saved" time.
    if (body.note) set({ notes: { ...state.notes, [studentId]: body.note } });
    return { ok: true };
  } catch {
    const rolled = { ...state.notes };
    if (before) rolled[studentId] = before;
    else delete rolled[studentId];
    set({ notes: rolled });
    return { ok: false, error };
  }
}
