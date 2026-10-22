"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { BoardImage, Stroke, View } from "@/components/board/engine";

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
  | { t: "set"; strokes: Stroke[]; images?: BoardImage[] } // full board (join, undo, redo, clear)
  | { t: "img"; m: BoardImage } // picture added, moved or resized
  | { t: "imgdel"; ids: string[] }
  | { t: "view"; v: View } // what Hamza's screen shows, for "follow"
  | { t: "hello" } // a viewer asking for the full board
  | { t: "rev"; n: number; last: string }; // teacher's heartbeat: item count + newest stroke, so viewers can self-check

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
  const presenceKey = `${role}-${Math.random().toString(36).slice(2, 8)}`;
  let ch: RealtimeChannel | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;

  // (Re)join the room. If the connection drops (Wi-Fi blip, laptop sleep),
  // join again by itself and ask for the full board, so nothing is missed.
  const join = () => {
    if (closed) return;
    const c = sb.channel(`board:${room}`, { config: { broadcast: { self: false }, presence: { key: presenceKey } } });
    ch = c;
    c.on("broadcast", { event: "m" }, ({ payload }) => onMsg(payload as BoardMsg));
    c.on("presence", { event: "sync" }, () => {
      const keys = Object.keys(c.presenceState());
      onPeople?.(keys.filter((k) => k.startsWith("viewer")).length, keys.some((k) => k.startsWith("teacher")));
    });
    c.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void c.track({ role });
        if (role === "viewer") void c.send({ type: "broadcast", event: "m", payload: { t: "hello" } });
      } else if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") && !closed) {
        if (retry) return;
        retry = setTimeout(() => {
          retry = null;
          void sb.removeChannel(c);
          join();
        }, 1500);
      }
    });
  };
  join();

  // Coming back to the tab (laptop woke up): make sure we're still in sync.
  const onVisible = () => {
    if (document.visibilityState === "visible" && role === "viewer") ch?.send({ type: "broadcast", event: "m", payload: { t: "hello" } });
  };
  document.addEventListener("visibilitychange", onVisible);

  return {
    send: (m) => void ch?.send({ type: "broadcast", event: "m", payload: m }),
    close: () => {
      closed = true;
      if (retry) clearTimeout(retry);
      document.removeEventListener("visibilitychange", onVisible);
      void sb.removeAllChannels();
    },
  };
}
