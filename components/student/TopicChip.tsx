import type { PlanTopic } from "@/lib/study-plan";
import { cn } from "@/lib/cn";

/** A topic with the student's mark so far ("new" when never tested). */
export function TopicChip({ t }: { t: PlanTopic }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border-strong px-3 py-1.5 text-sm">
      <span className="font-semibold text-ink">{t.name}</span>
      <span
        className={cn(
          "tabular-nums",
          t.percent === null ? "text-ink-3" : t.percent < 50 ? "text-error" : t.percent < 70 ? "text-warning" : "text-success",
        )}
      >
        {t.percent === null ? "new" : `${t.percent}%`}
      </span>
    </span>
  );
}
