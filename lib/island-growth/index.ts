/**
 * "Your island grows": every full focus block (25 minutes) adds a piece to the
 * student's own island in the Home header.
 *
 * The pure helpers (piecesFor, seedFrom) are safe anywhere. The 3D scene, and
 * three.js with it, loads only through loadIsland, in the browser, as its own
 * chunk (the same pattern as lib/groundwork-worlds).
 *
 * Files: layout.js (which pieces, where; no three.js) and scene.js (the live
 * header). Mockups and stills: design-mockups/portal-scenes/island-growth.html.
 */
export { piecesFor, seedFrom, BLOCK_MINUTES, MAX_PIECES } from "./layout.js";
export type { IslandHandle, IslandMountOptions, IslandTimeOfDay } from "./scene";

import type { mountIsland } from "./scene";

let pending: Promise<typeof mountIsland> | null = null;
export function loadIsland(): Promise<typeof mountIsland> {
  if (!pending) {
    pending = import("./scene.js").then((m) => m.mountIsland);
    // A failed fetch (offline, a new deploy) can be tried again next time.
    pending.catch(() => (pending = null));
  }
  return pending;
}
