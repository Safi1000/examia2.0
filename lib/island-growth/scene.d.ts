// Types for scene.js (plain JS so the design mockups can load it in the browser too).
export type IslandTimeOfDay = "dawn" | "day" | "dusk" | "night";
export interface IslandHandle {
  /** What to show. Pieces with index >= riseFrom rise in gently (none by default). */
  set(state: { seed: string | number; pieces: number; timeOfDay: IslandTimeOfDay; riseFrom?: number }): void;
  /** CSS pixels; device pixel ratio is handled inside. */
  resize(w: number, h: number): void;
  renderNow(): void;
  /** Stop drawing while something covers the island (the focus room), and pick up again after. */
  hold(on: boolean): void;
  info(): { calls: number; triangles: number; textures: number; geometries: number; pixelRatio: number };
  dispose(): void;
}
export interface IslandMountOptions {
  quality?: "low" | "high";
  reduceMotion?: boolean;
  preserveDrawingBuffer?: boolean;
  /** Pause while off screen (IntersectionObserver). Default true. */
  observe?: boolean;
}
export declare function mountIsland(canvas: HTMLCanvasElement, opts?: IslandMountOptions): IslandHandle;
declare const mod: { mount: typeof mountIsland };
export default mod;
