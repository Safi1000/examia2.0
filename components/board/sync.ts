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
  | { t: "clear" } // everything off the board
  | { t: "view"; v: View } // what Hamza's screen shows, for "follow"
  | { t: "hello" } // a viewer (or the other device joining) asking for the full board
  | { t: "rev"; n: number; last: string }; // teacher's heartbeat: item count + newest stroke, so viewers can self-check

/**
 * The room for the "Student link": worked out from the private room, never the
 * other way round, so having the link doesn't let anyone into Hamza's room.
 */
export function viewerRoom(room: string): string {
  let h1 = 0xdeadbeef ^ room.length;
  let h2 = 0x41c6ce57 ^ room.length;
  for (let i = 0; i < room.length; i++) {
    const c = room.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `v-${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}

export interface BoardLink {
  send: (m: BoardMsg) => void;
  close: () => void;
}

export function connectBoard(
  room: string,
  role: "teacher" | "viewer",
  onMsg: (m: BoardMsg) => void,
  /** viewers watching, and how many OTHER teacher devices (tablet or laptop) are here. */
  onPeople?: (viewers: number, teachers: number) => void,
  /** Ask for the full board on joining and on waking (viewers always do; the laptop editor too). */
  askOnJoin = role === "viewer",
): BoardLink {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    const bc = new BroadcastChannel(`ht-board-${room}`);
    bc.onmessage = (e) => onMsg(e.data as BoardMsg);
    onPeople?.(0, role === "viewer" ? 1 : 0);
    let open = true;
    const post = (m: BoardMsg) => open && bc.postMessage(m);
    if (askOnJoin) setTimeout(() => post({ t: "hello" }), 0);
    return {
      send: post,
      close: () => {
        open = false;
        bc.close();
      },
    };
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
      onPeople?.(
        keys.filter((k) => k.startsWith("viewer")).length,
        keys.filter((k) => k.startsWith("teacher") && k !== presenceKey).length,
      );
    });
    c.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void c.track({ role });
        if (askOnJoin) void c.send({ type: "broadcast", event: "m", payload: { t: "hello" } });
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
    if (document.visibilityState === "visible" && askOnJoin) ch?.send({ type: "broadcast", event: "m", payload: { t: "hello" } });
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
