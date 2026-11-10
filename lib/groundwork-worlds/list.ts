/**
 * The list of Groundwork worlds: names, lines, stills and colours. No 3D code
 * here, so it is safe to import anywhere (server included). The worlds
 * themselves load through loadWorld in ./index.
 */
export type WorldId = "tower" | "bridge" | "summit" | "astar";

export interface WorldInfo {
  id: WorldId;
  title: string;
  /** One line for the picker. */
  blurb: string;
  /** Small portrait still for the picker. */
  thumb: string;
  /** Larger portrait still (share images). */
  still: string;
  /** The world's own dark colours, shown while it loads (and if 3D can't run). */
  sky: string;
}

export const WORLDS: WorldInfo[] = [
  {
    id: "summit",
    title: "The Summit",
    blurb: "A climber walks a mountain trail as you focus and plants a gold flag at the top.",
    thumb: "/groundwork/worlds/summit.jpg",
    still: "/groundwork/worlds/summit-tall.jpg",
    sky: "linear-gradient(180deg,#2a2433 0%,#3e3448 45%,#1a1820 100%)",
  },
  {
    id: "tower",
    title: "The Tower",
    blurb: "A stone tower rises block by block, and a gold lantern lights the top when you finish.",
    thumb: "/groundwork/worlds/tower.jpg",
    still: "/groundwork/worlds/tower-tall.jpg",
    sky: "linear-gradient(180deg,#3a3934 0%,#2b2b27 45%,#1c1c1a 100%)",
  },
  {
    id: "bridge",
    title: "The Bridge",
    blurb: "A builder lays a timber bridge between two misty headlands, one plank at a time, from blue dawn to a gold evening.",
    thumb: "/groundwork/worlds/bridge.jpg",
    still: "/groundwork/worlds/bridge-tall.jpg",
    sky: "linear-gradient(180deg,#242a33 0%,#3b4351 45%,#4d535c 100%)",
  },
  {
    id: "astar",
    title: "The Gold A*",
    blurb: "A polished gold A* rises on a hilltop at dusk while a small craftsman finishes it.",
    thumb: "/groundwork/worlds/astar.jpg",
    still: "/groundwork/worlds/astar-tall.jpg",
    sky: "linear-gradient(180deg,#121012 0%,#2e211c 45%,#26231a 100%)",
  },
];

export const DEFAULT_WORLD: WorldId = "summit";

/** The chosen world, or The Summit when nothing (or something unknown) is saved. */
export function worldFor(id: string | undefined | null): WorldInfo {
  return WORLDS.find((w) => w.id === id) ?? WORLDS.find((w) => w.id === DEFAULT_WORLD)!;
}
