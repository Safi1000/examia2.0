/**
 * The contract every Groundwork world keeps (see
 * design-mockups/groundwork-3d/harness.html). A world is an ES module whose
 * default export is a WorldModule; mount draws it into a canvas and hands
 * back a small handle the timer drives.
 */
export type WorldPhase = "idle" | "building" | "paused" | "done";
export type WorldQuality = "low" | "high";

export interface WorldHandle {
  /** 0 to 1: how much of the current focus block is done. `instant` jumps there without animating. */
  setProgress(p: number, opts?: { instant?: boolean }): void;
  setPhase(phase: WorldPhase): void;
  /** CSS pixels; the world handles devicePixelRatio itself. */
  resize(w: number, h: number): void;
  dispose(): void;
  /**
   * false while the page isn't showing the world (hidden tab, scrolled out of
   * view): it stops drawing at once and keeps its last frame. Older worlds
   * without it simply keep drawing.
   */
  setShown?(shown: boolean): void;
  /**
   * Resolves once the world's shaders are compiled and it draws its first
   * real frame (until then it draws nothing, so the page can keep its
   * placeholder up). Older worlds without it are ready at once.
   */
  ready?: Promise<void>;
}

export interface WorldMountOptions {
  reduceMotion?: boolean;
  quality?: WorldQuality;
  /** Most frames drawn a second; 0 or unset: every frame the screen shows. */
  fps?: number;
  /** Highest device pixel ratio drawn at; unset: the tier's own (2 high, 1.25 low). */
  maxDpr?: number;
}

export interface WorldModule {
  id: string;
  title: string;
  blurb: string;
  mount(canvas: HTMLCanvasElement, opts?: WorldMountOptions): WorldHandle;
}
