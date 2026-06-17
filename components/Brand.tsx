import { COMPANY_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";

/** The booklet monogram — a ruled exam booklet, echoing the signature margin. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="3" y="2" width="26" height="28" rx="4" fill="var(--color-brand-soft)" />
      <rect x="3" y="2" width="6" height="28" rx="3" fill="var(--color-brand)" />
      <path d="M14 10h10M14 16h10M14 22h7" stroke="var(--color-brand)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ className, markSize = 28 }: { className?: string; markSize?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandMark size={markSize} />
      <span className="font-display text-lg font-extrabold tracking-tight text-ink">{COMPANY_NAME}</span>
    </span>
  );
}
