"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { Avatar } from "@/components/student/Avatar";
import { cn } from "@/lib/cn";

/**
 * The study room: who else is in a Groundwork session right now. Studying
 * alongside others ("body doubling") makes starting easier, so the page shows
 * a live count and their avatars. Nothing is saved: it is a live presence
 * channel, gone when they stop. First names and avatar only.
 */
export interface Studier {
  id: string;
  name: string;
  avatar?: string;
  subject: string;
  since: number;
}

let channel: RealtimeChannel | null = null;
let joined = false;
let viewers = 0;
let mine: Studier | null = null;
let people: Studier[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const DEMO_PEOPLE: Studier[] = [
  { id: "d1", name: "Sara", avatar: "hijab-girl", subject: "Accounting", since: Date.now() - 18 * 60_000 },
  { id: "d2", name: "Ali", avatar: "pakol-boy", subject: "Economics", since: Date.now() - 6 * 60_000 },
  { id: "d3", name: "Zoya", avatar: "ajrak-girl", subject: "Business", since: Date.now() - 31 * 60_000 },
  { id: "d4", name: "Hassan", avatar: "glasses-boy", subject: "Accounting", since: Date.now() - 2 * 60_000 },
];

function open() {
  if (channel || DEMO) return;
  channel = supabase().channel("groundwork-room", { config: { presence: { key: Math.random().toString(36).slice(2) } } });
  channel.on("presence", { event: "sync" }, () => {
    const st = channel?.presenceState<Studier>() ?? {};
    const seen = new Map<string, Studier>();
    for (const list of Object.values(st)) for (const p of list) if (p?.id && !seen.has(p.id)) seen.set(p.id, { id: p.id, name: p.name, avatar: p.avatar, subject: p.subject, since: p.since });
    people = [...seen.values()].sort((a, b) => a.since - b.since);
    emit();
  });
  channel.subscribe((status) => {
    joined = status === "SUBSCRIBED";
    if (joined && mine) void channel?.track(mine);
  });
}

function closeIfIdle() {
  if (viewers > 0 || mine || !channel) return;
  void supabase().removeChannel(channel);
  channel = null;
  joined = false;
  people = [];
  emit();
}

/** Join the room as studying (a session started) or leave it (null). */
export function setStudying(p: Studier | null) {
  if (DEMO) {
    mine = p;
    emit();
    return;
  }
  mine = p;
  open();
  if (p) {
    if (joined) void channel?.track(p);
  } else {
    if (joined) void channel?.untrack();
    setTimeout(closeIfIdle, 1000);
  }
}

const snapshot = () => (DEMO ? (mine ? [...DEMO_PEOPLE, mine] : DEMO_PEOPLE) : people);
let demoCache: Studier[] = [];
const stable = () => {
  const s = snapshot();
  if (!DEMO) return s;
  if (s.length !== demoCache.length) demoCache = s;
  return demoCache;
};

/** Everyone studying right now (including this student while their timer runs). */
export function useStudyRoom(): Studier[] {
  useEffect(() => {
    viewers++;
    open();
    return () => {
      viewers--;
      setTimeout(closeIfIdle, 1000);
    };
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    stable,
    () => [],
  );
}

/** "Sara, Ali and 5 others are studying right now", with their avatars. */
export function StudyRoomStrip({ meId, onJoin, tone = "light", className }: { meId: string; onJoin?: () => void; tone?: "light" | "dark"; className?: string }) {
  const room = useStudyRoom();
  const others = room.filter((p) => p.id !== meId);
  const light = tone === "light";
  const names = others.slice(0, 2).map((p) => p.name);
  const rest = others.length - names.length;
  const line = !others.length
    ? "No one's studying right now. Be the first tonight."
    : `${names.join(names.length === 2 && !rest ? " and " : ", ")}${rest > 0 ? ` and ${rest} ${rest === 1 ? "other" : "others"}` : ""} ${others.length === 1 ? "is" : "are"} studying right now`;
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {others.length > 0 ? (
        <span className="flex shrink-0 -space-x-2.5">
          {others.slice(0, 4).map((p) => (
            <Avatar key={p.id} id={p.avatar} initials={p.name[0]} className={cn("h-8 w-8 text-xs ring-2", light ? "ring-black/30" : "ring-surface")} />
          ))}
        </span>
      ) : (
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", light ? "bg-white/15" : "bg-surface-2")} aria-hidden>
          <span className="h-2 w-2 rounded-full bg-[#7FD1A6]" />
        </span>
      )}
      <p className={cn("min-w-0 flex-1 text-sm leading-snug", light ? "text-white/90" : "text-ink-2")}>
        {others.length > 0 && <span className="mr-1.5 inline-block h-2 w-2 animate-[low-pulse_2s_ease-in-out_infinite] rounded-full bg-[#7FD1A6] align-middle" aria-hidden />}
        {line}
      </p>
      {onJoin && others.length > 0 && (
        <button
          type="button"
          onClick={onJoin}
          className={cn("h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition active:scale-[0.98]", light ? "bg-white/15 text-white backdrop-blur-md hover:bg-white/25" : "border border-border-strong text-ink")}
        >
          Join them
        </button>
      )}
    </div>
  );
}
