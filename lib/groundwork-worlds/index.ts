/**
 * Groundwork's four 3D worlds: the list (safe to import anywhere) and a
 * loader. The worlds themselves (and three.js with them) load only through
 * loadWorld, in the browser, so nothing 3D reaches the server or any page that
 * doesn't show a world.
 *
 * The world files (tower.js, bridge.js, summit.js, astar.js) are copies of
 * design-mockups/groundwork-3d/concept1..4.js. To bring in newer versions:
 *   node scripts/sync-groundwork-worlds.mjs
 */
import type { WorldModule } from "./types";

export type { WorldHandle, WorldModule, WorldPhase, WorldQuality } from "./types";

export { WORLDS, DEFAULT_WORLD, worldFor, type WorldId, type WorldInfo } from "./list";
import type { WorldId } from "./list";

/** Each world is its own chunk, fetched the first time it is shown. */
const LOADERS: Record<WorldId, () => Promise<{ default: WorldModule }>> = {
  tower: () => import("./tower.js"),
  bridge: () => import("./bridge.js"),
  summit: () => import("./summit.js"),
  astar: () => import("./astar.js"),
};

const cache = new Map<WorldId, Promise<WorldModule>>();
export function loadWorld(id: WorldId): Promise<WorldModule> {
  let p = cache.get(id);
  if (!p) {
    p = LOADERS[id]().then((m) => m.default);
    // A failed fetch (offline, a new deploy) can be tried again next time.
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
