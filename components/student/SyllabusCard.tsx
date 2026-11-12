"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LEVEL_SHORT } from "@/lib/notes-library";
import { topicalFor, type BookProgress, type TopicalIndex } from "@/lib/syllabus-progress";

let cached: TopicalIndex | null = null;
let pending: Promise<TopicalIndex | null> | null = null;

/** The small topical question index, fetched once per visit. */
export function useTopicalIndex(): TopicalIndex | null {
  const [index, setIndex] = useState<TopicalIndex | null>(cached);
  useEffect(() => {
    if (cached) return;
    pending ??= fetch("/api/topical-index")
      .then((r) => (r.ok ? (r.json() as Promise<TopicalIndex>) : null))
      .catch(() => null);
    let live = true;
    pending.then((x) => {
      cached = x;
      if (!x) pending = null;
      if (live) setIndex(x);
    });
    return () => {
      live = false;
    };
  }, []);
  return index;
}

/**
 * Where each class is in the syllabus, from the notes released so far, and
 * the past paper questions for every chapter covered.
 */
export function SyllabusCard({ books, index }: { books: BookProgress[]; index: TopicalIndex | null }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!books.length) return null;
  const multiLevel = new Set(books.map((b) => b.level)).size > 1;

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {books.map((b) => {
        const pct = b.total ? Math.round((b.covered / b.total) * 100) : 0;
        // Next in teaching order after the newest chapter out.
        const at = b.latest ? b.chapters.indexOf(b.latest) : -1;
        const next = b.chapters.slice(at + 1).find((c) => !c.out) ?? b.chapters.find((c) => !c.out);
        const latest = b.latest ? topicalFor(index, b.paperCode, b.latest.num) : null;
        const open = openKey === b.key;
        const done = b.chapters.filter((c) => c.out);
        return (
          <li key={b.key} className="px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate text-[16px] font-semibold text-ink">{multiLevel ? `${LEVEL_SHORT[b.level]} ${b.subject}` : b.subject}</p>
              <p className="shrink-0 text-sm tabular-nums text-ink-2">
                {b.covered} of {b.total} chapters
              </p>
            </div>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.subject}: ${pct}% of the syllabus covered`}>
              <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${Math.max(pct, b.covered ? 3 : 0)}%` }} />
            </div>

            {b.latest ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <p className="min-w-0 text-sm text-ink-3">
                  Latest: <span className="text-ink-2">{b.latest.name}</span>
                  {next && <span className="hidden sm:inline"> · next up: {next.name}</span>}
                </p>
                {latest && (
                  <Link href={latest.href} className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-brand/12 px-3.5 text-sm font-semibold text-brand transition hover:bg-brand/20">
                    {latest.count} past paper questions
                  </Link>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-3">The first chapter shows up here as soon as its notes are out.</p>
            )}

            {done.length > 1 && (
              <>
                <button type="button" onClick={() => setOpenKey(open ? null : b.key)} aria-expanded={open} className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-2 hover:text-ink">
                  {open ? "Hide chapters" : `All ${done.length} chapters covered`}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>
                {open && (
                  <ul className="mt-1 space-y-0.5">
                    {done.map((c) => {
                      const t = topicalFor(index, b.paperCode, c.num);
                      return (
                        <li key={c.num} className="flex min-h-10 items-center gap-3 text-[14px]">
                          <span className="w-10 shrink-0 tabular-nums text-ink-3">{c.num}</span>
                          <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
                          {t ? (
                            <Link href={t.href} className="inline-flex min-h-11 shrink-0 items-center text-sm font-medium text-brand hover:underline">
                              {t.count} questions
                            </Link>
                          ) : (
                            <span className="shrink-0 text-sm text-ink-3">No questions yet</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
