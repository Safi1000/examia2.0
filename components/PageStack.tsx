"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui";

/**
 * Read-only viewer for attached pages.
 *
 * A PDF is stored as one image URL per page, so "showing the PDF" is just
 * showing those images — no download, no plugin. One page is displayed at a
 * time inside its own scroller: a 50-page paper must not push everything below
 * it (the answer box, the marks) a mile down the screen. Clicking it opens the
 * same full-screen reader the grader gets for answers, minus the markup tools.
 */
export function PageStack({ urls, label }: { urls: string[]; label: string }) {
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  if (!urls.length) return null;

  const shown = Math.min(page, urls.length - 1);
  const url = urls[shown];

  return (
    <figure className="overflow-hidden rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block max-h-[32rem] w-full overflow-auto bg-surface-2 text-left"
        aria-label={`Open ${label} full screen`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`${label} — page ${shown + 1}`} className="block w-full" />
      </button>
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
        <button onClick={() => setOpen(true)} className="font-semibold text-brand hover:underline">
          Open full screen
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="ml-auto font-semibold text-brand hover:underline">
          Open in new tab
        </a>
      </figcaption>

      {open && <PageViewerModal urls={urls} startAt={shown} label={label} onClose={() => setOpen(false)} />}
    </figure>
  );
}

/** Every page in one scrollable reader. Read-only — no markup tools. */
function PageViewerModal({
  urls,
  startAt,
  label,
  onClose,
}: {
  urls: string[];
  startAt: number;
  label: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(startAt);
  const scrollRef = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;

  function goto(i: number) {
    const clamped = Math.max(0, Math.min(urls.length - 1, i));
    setPage(clamped);
    scrollRef.current?.querySelector(`[data-page="${clamped}"]`)?.scrollIntoView({ block: "start" });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-paper" role="dialog" aria-modal="true" aria-label={label}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2 sm:px-4">
        <span className="truncate text-sm font-semibold text-ink">{label}</span>
        {urls.length > 1 && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5 text-sm text-ink-2">
            <button onClick={() => goto(page - 1)} disabled={page === 0} className="h-9 rounded-md border border-border-strong px-2.5 disabled:opacity-40" aria-label="Previous page">‹</button>
            <span className="tabular">{page + 1} / {urls.length}</span>
            <button onClick={() => goto(page + 1)} disabled={page === urls.length - 1} className="h-9 rounded-md border border-border-strong px-2.5 disabled:opacity-40" aria-label="Next page">›</button>
          </div>
        )}
        <button
          onClick={onClose}
          aria-label="Close"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink ${urls.length > 1 ? "" : "ml-auto"}`}
        >
          <Icon.Close className="h-5 w-5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-surface-2/40 px-2 py-3 sm:px-4 sm:py-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          {urls.map((u, i) => (
            <div key={u} data-page={i}>
              {urls.length > 1 && (
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Page {i + 1} of {urls.length}</p>
              )}
              <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-sm)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={u}
                  alt={`${label} — page ${i + 1}`}
                  className="block w-full"
                  onLoad={i === startAt ? (e) => e.currentTarget.scrollIntoView({ block: "start" }) : undefined}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
