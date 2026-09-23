"use client";

import { useState } from "react";

/**
 * Read-only viewer for attached pages.
 *
 * A PDF is stored as one image URL per page, so "showing the PDF" is just
 * showing those images — no download, no plugin. One page is displayed at a
 * time inside its own scroller: a 50-page paper must not push everything below
 * it (the answer box, the marks) a mile down the screen.
 */
export function PageStack({ urls, label }: { urls: string[]; label: string }) {
  const [page, setPage] = useState(0);
  if (!urls.length) return null;

  const shown = Math.min(page, urls.length - 1);
  const url = urls[shown];

  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="max-h-[32rem] overflow-auto bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`${label} — page ${shown + 1}`} className="block w-full" />
      </div>
      <figcaption className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-xs text-ink-3">
        {urls.length > 1 && (
          <>
            <button
              onClick={() => setPage(Math.max(0, shown - 1))}
              disabled={shown === 0}
              className="h-8 rounded-md border border-border-strong px-2.5 text-ink-2 disabled:opacity-40"
              aria-label="Previous page"
            >
              ‹
            </button>
            <span className="tabular">Page {shown + 1} of {urls.length}</span>
            <button
              onClick={() => setPage(Math.min(urls.length - 1, shown + 1))}
              disabled={shown === urls.length - 1}
              className="h-8 rounded-md border border-border-strong px-2.5 text-ink-2 disabled:opacity-40"
              aria-label="Next page"
            >
              ›
            </button>
          </>
        )}
        <span className="truncate">{label}</span>
        <a href={url} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-brand hover:underline">
          Open in new tab
        </a>
      </figcaption>
    </figure>
  );
}
