"use client";

import type { ReactNode } from "react";
import { track } from "@/lib/landing";

/** An outbound link that reports its click to the pixel, for server-rendered pages. */
export function TrackedLink({
  href,
  event = "whatsapp_click",
  props,
  className,
  children,
}: {
  href: string;
  event?: string;
  props?: Record<string, unknown>;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track(event, props)}
      className={className}
    >
      {children}
    </a>
  );
}
