import { cn } from "@/lib/cn";

/** A gold arc that breathes as it turns. Takes the text colour, so it sits on gold buttons too. */
export function Spinner({ size = 20, className, label = "Loading" }: { size?: number; className?: string; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" role="status" aria-label={label} className={cn("arc-spinner shrink-0", /\btext-/.test(className ?? "") ? "" : "text-brand", className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2.5" />
      <circle className="arc-spinner__arc" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" pathLength="60" />
    </svg>
  );
}
