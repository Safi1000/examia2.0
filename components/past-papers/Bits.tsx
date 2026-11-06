"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProgress, useNight } from "./progress";
import { cn } from "@/lib/cn";

const SITE = "https://www.hamzateaches.com";

/** The three places in the past paper section, on every past paper page. */
export function PastPapersNav({ className }: { className?: string }) {
  const path = usePathname();
  const { done } = useProgress();
  const finished = Object.keys(done).length;
  const items = [
    { href: "/past-papers", label: "Papers", on: !/\/topics(\/|$)/.test(path) && !path.startsWith("/past-papers/progress") },
    { href: "/past-papers/topics", label: "Topics", on: /\/topics(\/|$)/.test(path) },
    { href: "/past-papers/progress", label: "Progress", on: path.startsWith("/past-papers/progress"), badge: finished ? String(finished) : null },
  ];
  return (
    <nav aria-label="Past papers" className={cn("flex gap-1 overflow-x-auto rounded-full border border-hairline bg-card p-1 [scrollbar-width:none]", className)}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.on ? "page" : undefined}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] font-semibold sm:gap-2 sm:px-4 sm:text-[15px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold",
            i.on ? "bg-gold text-[#1b1e21]" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {i.label}
          {i.badge && (
            <span className={cn("rounded-full px-2 py-0.5 text-[12px] tabular-nums", i.on ? "bg-[#1b1e21]/15" : "bg-gold-tint text-gold")}>{i.badge}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Light-on-dark paper pages for late-night study. */
export function NightToggle({ className }: { className?: string }) {
  const [on, toggle] = useNight();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? "Show papers in normal colours" : "Show papers in night colours"}
      title={on ? "Normal colours" : "Night colours"}
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        on ? "border-gold bg-gold-tint text-gold" : "border-hairline-strong text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z" />
      </svg>
    </button>
  );
}

/** "Share on WhatsApp": a student telling friends their score brings their friends here. */
export function ShareScore({ text, path, className }: { text: string; path: string; className?: string }) {
  const href = `https://wa.me/?text=${encodeURIComponent(`${text} Try it free: ${SITE}${path}`)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[rgba(37,211,102,0.4)] px-5 text-[15px] font-semibold text-[#5fe08e] transition-colors hover:bg-[rgba(37,211,102,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="fill-current">
        <path d="M12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45C18.6 23.8 23.94 18.46 23.94 11.9 23.94 5.34 18.6 0 12.05 0Zm0 21.79a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.89-9.89 5.45 0 9.88 4.44 9.88 9.89 0 5.45-4.43 9.89-9.88 9.89Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.91-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35Z" />
      </svg>
      Share on WhatsApp
    </a>
  );
}
