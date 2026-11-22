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
  /** The focus room's colours, sampled from the scene (see WorldPalette). */
  palette: WorldPalette;
}

/**
 * The focus room's colours for a world, sampled from the scene itself so the timer's text, glass and shade belong
 * to it: `ink` is off-white leaning to the scene's light, `light` the key light (the glass is a little of it),
 * `shade` and `shadeLow` the scene's own darks at the top and the foot (the gentle scrim behind text), `glow` the
 * warm or cool light a finished block glows with. Text and glass are derived from these in the focus room.
 */
export interface WorldPalette {
  ink: string;
  light: string;
  shade: string;
  shadeLow: string;
  glow: string;
}

export const WORLDS: WorldInfo[] = [
  {
    id: "summit",
    title: "The Summit",
    blurb: "A climber walks a mountain trail as you focus and plants a gold flag at the top.",
    thumb: "/groundwork/worlds/summit.jpg",
    still: "/groundwork/worlds/summit-tall.jpg",
    sky: "linear-gradient(180deg,#2a2433 0%,#3e3448 45%,#1a1820 100%)",
    // Moonlit night: blue grey and mauve.
    palette: { ink: "#f3f0f7", light: "#d6cdee", shade: "#0b0812", shadeLow: "#1c1418", glow: "#ddd0f7" },
  },
  {
    id: "tower",
    title: "The Tower",
    blurb: "A stone tower rises block by block, and a gold lantern lights the top when you finish.",
    thumb: "/groundwork/worlds/tower.jpg",
    still: "/groundwork/worlds/tower-tall.jpg",
    sky: "linear-gradient(180deg,#3a3934 0%,#2b2b27 45%,#1c1c1a 100%)",
    // Grey stone at dusk, a warm lantern.
    palette: { ink: "#f4f2ec", light: "#ebe3cc", shade: "#06090c", shadeLow: "#101514", glow: "#f3d9a4" },
  },
  {
    id: "bridge",
    title: "The Bridge",
    blurb: "A builder lays a timber bridge between two misty headlands, one plank at a time, from blue dawn to a gold evening.",
    thumb: "/groundwork/worlds/bridge.jpg",
    still: "/groundwork/worlds/bridge-tall.jpg",
    sky: "linear-gradient(180deg,#242a33 0%,#3b4351 45%,#4d535c 100%)",
    // Misty blue dawn to a soft gold evening: the brightest world.
    palette: { ink: "#f7f5f2", light: "#e2e6ef", shade: "#161a22", shadeLow: "#2a2526", glow: "#f2d29a" },
  },
  {
    id: "astar",
    title: "The Gold A*",
    blurb: "A polished gold A* rises on a hilltop at dusk while a small craftsman finishes it.",
    thumb: "/groundwork/worlds/astar.jpg",
    still: "/groundwork/worlds/astar-tall.jpg",
    sky: "linear-gradient(180deg,#121012 0%,#2e211c 45%,#26231a 100%)",
    // Warm amber dusk.
    palette: { ink: "#fcf1e6", light: "#ffcfa4", shade: "#0c0507", shadeLow: "#1f1309", glow: "#ffc988" },
  },
];

export const DEFAULT_WORLD: WorldId = "summit";

/** The chosen world, or The Summit when nothing (or something unknown) is saved. */
export function worldFor(id: string | undefined | null): WorldInfo {
  return WORLDS.find((w) => w.id === id) ?? WORLDS.find((w) => w.id === DEFAULT_WORLD)!;
}
