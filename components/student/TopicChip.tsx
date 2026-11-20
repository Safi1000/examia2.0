import Link from "next/link";
import type { PlanTopic } from "@/lib/study-plan";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * A topic with the student's mark so far ("not tested yet" when never tested). With
 * `href` it opens that topic's notes; without, it is plain text (it may sit
 * inside a card that is already a link).
 */
export function TopicChip({ t, href, label }: { t: PlanTopic; href?: string; label?: string }) {
  const inner = (
    <>
      <span className="font-semibold text-ink">{t.name}</span>
      {/* Plain grey, not red, amber and green: gold stays the one colour on the page. */}
      <span className={cn("tabular-nums", t.percent === null ? "text-ink-3" : "text-ink-2")}>
        {t.percent === null ? "not tested yet" : `${t.percent}%`}
      </span>
    </>
  );
  if (!href) {
    return <span className="inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1.5 text-sm">{inner}</span>;
  }
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-strong px-3 text-sm transition-colors hover:border-ink-3 hover:bg-surface-2"
    >
      {inner}
      <span className="sr-only">, {label ?? "Read the notes"}</span>
      <Icon.ChevronRight aria-hidden className="h-3.5 w-3.5 text-ink-3" />
    </Link>
  );
}
