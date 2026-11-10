/**
 * The teacher console's surface ladder, kept local to the admin side.
 *
 *   Page (paper)  →  Panel (surface, 1px hairline, faint light along the top)
 *
 * Inside a panel, group with dividers and spacing, never another panel.
 * Gold stays for actions; amber and red only for real status.
 */

/** A raised panel: the same recipe as the shared Card, for links and sections. */
export const panel =
  "rounded-xl border border-border bg-surface bg-[linear-gradient(180deg,rgba(255,255,255,0.028),rgba(255,255,255,0)_42%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.045)]";

/** A panel that is itself a link or button: a quiet lift on hover. */
export const panelLink = `${panel} transition-[border-color,background-color] duration-150 ease-[var(--ease-out)] hover:border-border-strong hover:bg-surface-2`;

/** Section heading inside a panel. */
export const panelTitle = "text-[15px] font-semibold tracking-[-0.01em] text-ink";

/** Small neutral count pill (not gold: gold is for actions). */
export const countPill = "inline-flex items-center rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-ink-2";

/**
 * Long tables inside a panel: the header row stays put while the rows scroll.
 * Put on the TableScroll wrapper (it becomes the scroll box on wide screens)
 * and `stickyHead` on the Table.
 */
export const tableBox = "lg:max-h-[calc(100dvh-13rem)]";
export const stickyHead =
  "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-surface [&_thead_th:first-child]:z-20 [&_thead_th:first-child]:bg-surface [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-white/[0.018] [&_tbody_tr:last-child_td]:border-b-0 [&_td]:tabular-nums";
