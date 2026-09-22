"use client";

/**
 * Read-only viewer for attached pages.
 *
 * A PDF is stored as one image URL per page, so "showing the PDF" is just
 * stacking those images — no download, no plugin, and the page scrolls
 * normally. Each page also links to its full-size image for a new tab.
 */
export function PageStack({ urls, label }: { urls: string[]; label: string }) {
  if (!urls.length) return null;
  return (
    <div className="space-y-3">
      {urls.map((url, i) => (
        <figure key={url} className="overflow-hidden rounded-lg border border-border bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${label} — page ${i + 1}`} className="block w-full" />
          <figcaption className="flex items-center justify-between border-t border-border px-3 py-1.5 text-xs text-ink-3">
            <span className="tabular">{urls.length > 1 ? `Page ${i + 1} of ${urls.length}` : label}</span>
            <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-brand hover:underline">
              Open in new tab
            </a>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
