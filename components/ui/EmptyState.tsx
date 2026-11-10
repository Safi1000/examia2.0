import { cn } from "@/lib/cn";

/**
 * Calm, in-voice empty state. `art` is an optional picture (it sits above the
 * title); `icon` is the small decorative mark, shown until a picture loads.
 */
export function EmptyState({
  icon,
  art,
  title,
  message,
  action,
  className,
}: {
  icon?: React.ReactNode;
  art?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "empty-state surface-quiet flex flex-col items-center justify-center rounded-xl px-6 py-12 text-center",
        className,
      )}
    >
      {art}
      {icon && (
        <div
          className="empty-state__icon mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-hairline bg-surface-2 text-ink-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] [&_svg]:h-5 [&_svg]:w-5"
          aria-hidden
        >
          {icon}
        </div>
      )}
      <h3 className="text-lg font-bold tracking-[-0.01em] text-ink">{title}</h3>
      {message && <p className="mt-1.5 max-w-sm text-base text-pretty text-ink-2">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
