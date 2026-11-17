import type { ReactNode } from "react";

/**
 * A plain wrapper. It used to make its child lean toward the cursor; that pull
 * was dropped in the November look and feel pass (nothing moves on its own or
 * chases the cursor). Kept so the buttons it wraps hold the same layout.
 */
export function Magnetic({
  children,
  block = false,
  className = "",
}: {
  children: ReactNode;
  /** No longer used; kept so existing callers need no change. */
  strength?: number;
  /** Full-width buttons: the wrapper stretches instead of hugging the button. */
  block?: boolean;
  className?: string;
}) {
  return <span className={`${block ? "flex w-full" : "inline-flex"} ${className}`}>{children}</span>;
}
