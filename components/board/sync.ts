"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { BoardImage, Stroke, ThemeId, View } from "@/components/board/engine";

/**
 * Live link between Hamza's tablet, his laptop, and the students watching.
 *
 * Uses Supabase Realtime "broadcast" (messages only, nothing stored in the
 * database). Without Supabase keys (local preview) it falls back to the
 * browser's BroadcastChannel, so two tabs on one computer still sync.
 *
 * Every change carries a number (`q`) that only goes up, so a message that
 * arrives late, twice, or out of order can never undo something newer: the
 * receiver keeps the newest word on each stroke (see Ledger).
 */

export type BoardMsg =
  | { t: "live"; s: Stroke } // stroke being drawn right now
  | { t: "add"; s: Stroke; q?: number }
  | { t: "del"; ids: string[]; q?: number }
  | { t: "set"; strokes: Stroke[]; images?: BoardImage[]; q?: number } // full board (join, repair)
  | { t: "img"; m: BoardImage; q?: number } // picture added, moved or resized
  | { t: "imgdel"; ids: string[]; q?: number }
  | { t: "clear"; q?: number } // everything off the board
  | { t: "batch"; ms: BoardMsg[] } // several changes that belong together, in order
  | { t: "theme"; v: ThemeId }
  | { t: "view"; v: View } // what the tablet shows, for "follow"
  | { t: "hello" } // asking for the full board
  | { t: "rev"; n: number; last: string; d?: string }; // heartbeat: item count, newest stroke and a fingerprint, so the other side can self-check

/** A short fingerprint of a board (which strokes and pictures, in their current form). */
export function boardDigest(strokes: Stroke[], images: BoardImage[]): string {
  let h = 0;
  const mix = (str: string) => {
    let x = 2166136261;
    for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619);
    h = (h + (x >>> 0)) >>> 0; // order does not matter
  };
  // No coordinates: they are rounded when sent, so the two sides could never agree exactly.
  for (const s of strokes) mix(`${s.id}|${s.kind}|${s.pts.length}|${s.text ?? ""}|${s.color}`);
  for (const m of images) mix(`${m.id}|${Math.round(m.x)}|${Math.round(m.y)}|${Math.round(m.w)}`);
  return `${strokes.length + images.length}.${h.toString(36)}`;
}

/**
 * Keeps changes in order across devices. Each change gets a number from a
 * clock that both devices keep ahead of anything they hear (a Lamport clock);
 * a change older than what a stroke already has is ignored.
 */
export class Ledger {
  private clock = 0;
  private floor = 0;
  private seen = new Map<string, number>();
  constructor(private tie: 0 | 1) {}

  /** A number for a change made here. */
  stamp(): number {
    this.clock++;
    return this.clock * 2 + this.tie;
  }
  /** Remember a change made here, so an older one arriving later is ignored. */
  mark(ids: string[], q: number) {
    for (const id of ids) this.seen.set(id, q);
  }
  /** Is this change from the other side newer than what we hold for that stroke? */
  fresh(id: string, q?: number): boolean {
    if (q === undefined) return true; // an older version of the site: no numbers
    this.clock = Math.max(this.clock, Math.floor(q / 2));
    if (q <= this.floor) return false;
    if ((this.seen.get(id) ?? 0) >= q) return false;
    this.seen.set(id, q);
    return true;
  }
  /** Has anything final been said about this stroke? (Then a late "live" preview is stale.) */
  known(id: string) {
    return this.seen.has(id);
  }
  /** A full board or a clear: everything numbered before it is already in it. */
  reset(q: number) {
    this.floor = Math.max(this.floor, q);
    this.seen.clear();
  }
  hear(q?: number) {
    if (q !== undefined) this.clock = Math.max(this.clock, Math.floor(q / 2));
  }
}

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

/** Hands a message (or each message in a batch, in order) to the board. */
function deliver(m: BoardMsg, onMsg: (m: BoardMsg) => void) {
  if (m.t === "batch") for (const x of m.ms) deliver(x, onMsg);
  else onMsg(m);
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
    bc.onmessage = (e) => deliver(e.data as BoardMsg, onMsg);
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

  // The default lets a client send only 10 messages a second, and drawing sends more:
  // the ones over the limit were dropped, and a dropped "remove" left a doubled line.
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 100 } },
  });
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
    c.on("broadcast", { event: "m" }, ({ payload }) => deliver(payload as BoardMsg, onMsg));
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
