import { cn } from "@/lib/cn";

/** A placeholder block with a soft gold shimmer passing over it (see .skeleton). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
}

/** A sheet of paper still on its way: the shape of a page, with a few soft lines. */
export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("skeleton aspect-[210/297] w-full max-w-[min(100%,34rem)] rounded-md", className)} aria-hidden>
      <div className="space-y-3 p-[9%] opacity-60">
        <div className="h-4 w-2/5 rounded bg-ink/10" />
        <div className="h-2.5 w-full rounded bg-ink/[0.07]" />
        <div className="h-2.5 w-11/12 rounded bg-ink/[0.07]" />
        <div className="h-2.5 w-4/5 rounded bg-ink/[0.07]" />
        <div className="h-2.5 w-full rounded bg-ink/[0.07]" />
        <div className="h-2.5 w-3/5 rounded bg-ink/[0.07]" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="surface rounded-xl p-5">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-6 w-2/3" />
      <Skeleton className="mt-4 h-10 w-full" />
    </div>
  );
}
