"use client";

import { useEffect, useState } from "react";

const pill =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-hairline-strong px-4 text-sm font-semibold text-muted-foreground transition-colors duration-150 hover:border-white/25 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/**
 * Share this exact paper page. On a phone: the phone's own share sheet. On a
 * computer: copies the link and says so quietly. WhatsApp sits beside it, the
 * same wa.me link the articles use.
 */
export function SharePaper({ url, title }: { url: string; title: string; code?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(t);
  }, [copied]);

  const share = async () => {
    const phone = typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches;
    if (phone) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* closed the sheet */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Older browsers: a hidden box, selected and copied.
      const box = document.createElement("textarea");
      box.value = url;
      box.setAttribute("readonly", "");
      box.style.cssText = "position:fixed;opacity:0;pointer-events:none";
      document.body.appendChild(box);
      box.select();
      document.execCommand("copy");
      box.remove();
    }
    setCopied(true);
  };

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={share} className={pill}>
        <svg aria-hidden viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d={copied ? "M4.5 10.5l3.5 3.5 7.5-8" : "M10 12.5V3.5m0 0L6.5 7M10 3.5 13.5 7M4.5 10.5v5h11v-5"} />
        </svg>
        <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Share on WhatsApp"
        title="Share on WhatsApp"
        className={`${pill} w-11 px-0`}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="fill-current">
          <path d="M12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45C18.6 23.8 23.94 18.46 23.94 11.9 23.94 5.34 18.6 0 12.05 0Zm0 21.79a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.89 9.89-9.89 5.45 0 9.88 4.44 9.88 9.89 0 5.45-4.43 9.89-9.88 9.89Zm5.42-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.47-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.91-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.28-.2-.57-.35Z" />
        </svg>
      </a>
    </div>
  );
}
