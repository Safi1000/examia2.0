import { cn } from "@/lib/cn";
import { controlHeight } from "@/components/ui/Input";

/*
 * The two small switches every list page uses, drawn one way everywhere:
 *
 *   segmentGroup + segmentItem(on)   "Day | Weekly timetable", "Last 7 days | Last 30 days"
 *   chipClass(on)                    a row of filter chips ("All", "Biology", "Physics")
 *
 * Both are the height of a small button and a filter field (40px with a mouse,
 * 44px on touch screens), so a filter row lines up top and bottom. The chosen
 * one is a quiet off-white step, never gold: gold stays for the page's action.
 */

/** The pill that holds a two or three way switch. */
export const segmentGroup = "inline-flex shrink-0 items-center rounded-full border border-border bg-surface p-[3px]";

/** One option inside segmentGroup. Its tap area reaches the group's full height. */
export function segmentItem(on: boolean) {
  return cn(
    "relative inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-[background-color,color] duration-150 pointer-coarse:h-9 max-md:h-9",
    "before:absolute before:inset-x-0 before:-inset-y-[3px] before:content-['']",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    on ? "bg-white/[0.09] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "text-ink-3 hover:text-ink",
  );
}

/** A filter chip: one of a row of options, on or off. */
export function chipClass(on: boolean) {
  return cn(
    controlHeight,
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97] disabled:opacity-40",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
    on
      ? "border-white/[0.16] bg-white/[0.09] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      : "border-border bg-transparent text-ink-3 hover:border-border-strong hover:text-ink",
  );
}
