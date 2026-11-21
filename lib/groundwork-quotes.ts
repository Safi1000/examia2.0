/**
 * Which Groundwork line shows while a focus block runs. The same rule as the
 * phone app's own timer (mobile-1.2 src/features/groundwork/quotes.ts), so the
 * two feel like one product:
 *  - the FIRST line of the list shows when a block starts;
 *  - the LAST line is the closing line, for the final CLOSING_MIN minutes;
 *  - the lines in between follow list order, spread evenly through the block,
 *    never closer than MIN_GAP_MIN minutes apart and never twice in a block;
 *  - at most MAX_CHANGES changes in one block.
 * The lines themselves are the site's QUOTES list (lib/groundwork.ts); this
 * file only decides which one and when. Pure and deterministic for a seed.
 */

/** The fewest minutes between two changes of line. */
export const MIN_GAP_MIN = 3;
/** The most changes of line in one block (the closing line counts as one). */
export const MAX_CHANGES = 6;
/** The closing line covers this many final minutes. */
export const CLOSING_MIN = 2;

export type QuoteStep = { atMs: number; index: number };

/** A small seeded random number in [0, 1), the same for the same seed. */
function rand(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * When each line shows in a block of `lengthMin` minutes, for a list of
 * `count` lines: steps in time order, the first at 0 (index 0).
 */
export function quoteSchedule(lengthMin: number, seed: number, count: number): QuoteStep[] {
  if (count < 1) return [];
  const steps: QuoteStep[] = [{ atMs: 0, index: 0 }];
  if (count < 2 || !(lengthMin > 0)) return steps;
  const closingAt = lengthMin - CLOSING_MIN;
  // Too short to change line and still keep the gap: the first line all through.
  if (closingAt < MIN_GAP_MIN) return steps;

  const middle = count - 2;
  const slots = Math.max(0, Math.min(middle, MAX_CHANGES - 1, Math.floor(closingAt / MIN_GAP_MIN) - 1));
  let prev = -1;
  for (let i = 1; i <= slots; i++) {
    const at = (i * closingAt) / (slots + 1);
    // Where this moment falls in the list of middle lines, give or take a window.
    const centre = (at / lengthMin) * middle - 0.5;
    const half = Math.max(0, (middle / slots - 1) / 2);
    const lo = Math.ceil(centre - half);
    const hi = Math.floor(centre + half);
    let pick = hi < lo ? Math.round(centre) : lo + Math.floor(rand(seed * 31 + i) * (hi - lo + 1));
    // In order, never twice, and leave room for the slots still to come.
    pick = Math.min(Math.max(pick, prev + 1), middle - 1 - (slots - i));
    prev = pick;
    steps.push({ atMs: Math.round(at * 60_000), index: pick + 1 });
  }
  steps.push({ atMs: Math.round(closingAt * 60_000), index: count - 1 });
  return steps;
}

/** The line to show `elapsedMs` into a block of `lengthMin` minutes. */
export function pickQuote<Q>(list: readonly Q[], lengthMin: number, elapsedMs: number, seed: number): Q | undefined {
  let index = 0;
  for (const s of quoteSchedule(lengthMin, seed, list.length)) if (elapsedMs >= s.atMs) index = s.index;
  return list[index];
}
