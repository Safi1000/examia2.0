"use client";

import { useEffect, useRef, useState } from "react";
import { PaperImage } from "@/components/PageStack";
import { paperBuilder } from "@/components/admin/PastPaperSheet";
import { idsInText, sourceLabel } from "@/lib/paper-builder";

type Ms = { name: string; start: number; pages: number };

/**
 * Beside a written past paper answer in the marking screen: the Cambridge mark
 * scheme, opened at the page where this question's answers start, with the
 * pages before and after a tap away. Found from the source line in the prompt.
 */
export function MarkSchemePanel({ prompt }: { prompt: string }) {
  const id = idsInText(prompt)[0] ?? null;
  // "none": the paper has no mark scheme on file; "failed": it could not be loaded.
  const [ms, setMs] = useState<Ms | null | "none" | "failed">(null);
  const [attempt, setAttempt] = useState(0);
  const [page, setPageRaw] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  // A new page starts at its top, not wherever the last one was scrolled to.
  const setPage = (next: number | ((p: number) => number)) => {
    setPageRaw(next);
    box.current?.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (!id) return;
    let live = true;
    paperBuilder<{ ms: Ms | null }>({ action: "ms", id })
      .then((r) => {
        if (!live) return;
        setMs(r.ms ?? "none");
        if (r.ms) setPageRaw(r.ms.start);
      })
      .catch(() => live && setMs("failed"));
    return () => {
      live = false;
    };
  }, [id, attempt]);

  if (!id) return null;
  // Said plainly, instead of leaving an empty half of the screen beside the answer.
  if (ms === "none" || ms === "failed") {
    return (
      <section aria-label="Mark scheme" className="min-w-0 rounded-md border border-border bg-surface-2/40 p-4 text-sm text-ink-2">
        <p className="font-semibold text-ink">Mark scheme</p>
        {ms === "none" ? (
          <p className="mt-1">There is no mark scheme on file for {sourceLabel(id)}.</p>
        ) : (
          <>
            <p className="mt-1">The mark scheme didn&apos;t load. Check the connection and try again.</p>
            <button
              type="button"
              onClick={() => { setMs(null); setAttempt((n) => n + 1); }}
              className="mt-2 inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              Try again
            </button>
          </>
        )}
      </section>
    );
  }
  const url = ms ? `/papers/img/${ms.name}/${page}.jpg` : "";

  return (
    <section aria-label={`Mark scheme for ${sourceLabel(id)}`} className="min-w-0 space-y-2">
      <p className="text-sm font-semibold text-ink">Mark scheme</p>
      <div ref={box} className="max-h-[26rem] overflow-auto rounded-md border border-border bg-white">
        {ms ? <PaperImage key={url} url={url} width={1100} alt={`Mark scheme, page ${page}`} loading="eager" /> : <div className="skeleton h-72" aria-busy="true" aria-label="Loading the mark scheme" />}
      </div>
      {ms && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-11 min-w-11 rounded-full border border-border-strong px-3 text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-40"
            aria-label="Previous mark scheme page"
          >
            ‹
          </button>
          <span className="tabular-nums">Page {page} of {ms.pages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(ms.pages, p + 1))}
            disabled={page >= ms.pages}
            className="h-11 min-w-11 rounded-full border border-border-strong px-3 text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-40"
            aria-label="Next mark scheme page"
          >
            ›
          </button>
          {page !== ms.start && (
            <button type="button" onClick={() => setPage(ms.start)} className="inline-flex min-h-11 items-center px-1 font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
              Back to this question
            </button>
          )}
          <a href={url} target="_blank" rel="noreferrer" className="ml-auto inline-flex min-h-11 items-center font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
            Open in new tab
          </a>
        </div>
      )}
    </section>
  );
}
