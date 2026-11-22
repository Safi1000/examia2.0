import { useSyncExternalStore } from "react";
import { WORLDS, type WorldId } from "@/lib/groundwork-worlds/list";

/**
 * "Surprise me": the default world choice. A student who never picked a world (or picked Surprise me) gets a
 * random world for each block, never the same one twice in a row. An explicit pick (profile.world = a world id)
 * stays until they choose Surprise me again, which saves profile.world = SURPRISE.
 *
 * The current random world is shared by the start screen and the focus room (so opening the room never changes
 * the scene), and the last one is remembered on the device so the next visit starts somewhere new.
 */
export const SURPRISE = "surprise";

/** Nothing picked, Surprise me, or something unknown: the world is chosen at random. */
export const isSurprise = (w: string | undefined | null) => !w || w === SURPRISE || !WORLDS.some((x) => x.id === w);

const KEY = "gw_world_last";
let current: WorldId | null = null;
const subs = new Set<() => void>();

function readLast(): WorldId | null {
  try {
    const v = localStorage.getItem(KEY);
    return WORLDS.some((w) => w.id === v) ? (v as WorldId) : null;
  } catch {
    return null;
  }
}

function pickNew(avoid?: string): WorldId {
  const last = current ?? readLast();
  const pool = WORLDS.filter((w) => w.id !== last && w.id !== avoid);
  const id = pool[Math.floor(Math.random() * pool.length)].id;
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  return id;
}

/** Move on to a new random world: not the current random one, nor `avoid` (the world on screen now). */
export function nextSurprise(avoid?: string): WorldId {
  const id = pickNew(avoid);
  subs.forEach((f) => f());
  return id;
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
// The first read in the browser picks one (quietly: it happens during a render).
const snapshot = () => current ?? pickNew();

/** The current random world; null on the server and in the first hydration pass. */
export function useSurpriseWorld(): WorldId | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}
