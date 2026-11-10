import { cn } from "@/lib/cn";

/** A placeholder block with a soft gold shimmer passing over it (see .skeleton). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} aria-hidden />;
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
