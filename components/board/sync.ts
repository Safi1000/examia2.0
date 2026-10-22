"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { Stroke, View } from "@/components/board/engine";

/**
 * Live link between Hamza's board and the students watching it.
 *
 * Uses Supabase Realtime "broadcast" (messages only, nothing stored in the
 * database). Without Supabase keys (local preview) it falls back to the
 * browser's BroadcastChannel, so two tabs on one computer still sync.
 */

export type BoardMsg =
  | { t: "live"; s: Stroke } // stroke being drawn right now
  | { t: "add"; s: Stroke }
  | { t: "del"; ids: string[] }
  | { t: "set"; strokes: Stroke[] } // full board (join, undo, redo, clear)
  | { t: "view"; v: View } // what Hamza's screen shows, for "follow"
  | { t: "hello" }; // a viewer asking for the full board

export interface BoardLink {
  send: (m: BoardMsg) => void;
  close: () => void;
}

export function connectBoard(
  room: string,
  role: "teacher" | "viewer",
  onMsg: (m: BoardMsg) => void,
  onPeople?: (viewers: number, teacherHere: boolean) => void,
): BoardLink {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    const bc = new BroadcastChannel(`ht-board-${room}`);
    bc.onmessage = (e) => onMsg(e.data as BoardMsg);
    onPeople?.(0, role === "viewer");
    return { send: (m) => bc.postMessage(m), close: () => bc.close() };
  }

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ch: RealtimeChannel = sb.channel(`board:${room}`, {
    config: { broadcast: { self: false }, presence: { key: `${role}-${Math.random().toString(36).slice(2, 8)}` } },
  });
  ch.on("broadcast", { event: "m" }, ({ payload }) => onMsg(payload as BoardMsg));
  ch.on("presence", { event: "sync" }, () => {
    const keys = Object.keys(ch.presenceState());
    onPeople?.(keys.filter((k) => k.startsWith("viewer")).length, keys.some((k) => k.startsWith("teacher")));
  });
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      void ch.track({ role });
      if (role === "viewer") void ch.send({ type: "broadcast", event: "m", payload: { t: "hello" } });
    }
  });

  return {
    send: (m) => void ch.send({ type: "broadcast", event: "m", payload: m }),
    close: () => {
      void ch.unsubscribe();
      void sb.removeAllChannels();
    },
  };
}
