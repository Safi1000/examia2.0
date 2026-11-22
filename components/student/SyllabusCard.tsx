"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LEVEL_SHORT } from "@/lib/notes-library";
import { ProgressRing } from "@/components/student/PortalKit";
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
 * The topic tracker: where each class is in the syllabus, from the notes
 * released so far, as a ring and "2 of 19 chapters", with one quiet link per
 * subject to the past paper questions for the chapters covered.
 */
export function SyllabusCard({ books, index }: { books: BookProgress[]; index: TopicalIndex | null }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  if (!books.length) return null;
  const multiLevel = new Set(books.map((b) => b.level)).size > 1;

  return (
    <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
      {books.map((b) => {
        // Next in teaching order after the newest chapter out.
        const at = b.latest ? b.chapters.indexOf(b.latest) : -1;
        const next = b.chapters.slice(at + 1).find((c) => !c.out) ?? b.chapters.find((c) => !c.out);
        const latest = b.latest ? topicalFor(index, b.paperCode, b.latest.num) : null;
        const open = openKey === b.key;
        const done = b.chapters.filter((c) => c.out);
        const name = multiLevel ? `${LEVEL_SHORT[b.level]} ${b.subject}` : b.subject;
        const quiet = "inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline";
        return (
          <li key={b.key} className="px-5 py-4 sm:px-6">
            <div className="flex items-center gap-4">
              <span aria-hidden>
                <ProgressRing done={b.covered} total={b.total} size={40} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-ink">{name}</p>
                <p className="text-sm tabular-nums text-ink-2">
                  {b.covered} of {b.total} chapters
                </p>
              </div>
            </div>

            {b.latest ? (
              <p className="mt-3 min-w-0 text-sm text-ink-3">
                Latest: <span className="text-ink-2">{b.latest.name}</span>
                {next && <span className="hidden sm:inline">. Next up: {next.name}</span>}
              </p>
            ) : (
              <p className="mt-3 text-sm text-ink-3">The first chapter shows up here as soon as its notes are out.</p>
            )}

            {/* One quiet link per subject: every covered chapter's questions when there are a few, else the latest one's. */}
            {done.length <= 1 && latest && (
              <Link href={latest.href} className={quiet}>
                {latest.count} past paper {latest.count === 1 ? "question" : "questions"}
              </Link>
            )}
            {done.length > 1 && (
              <>
                <button type="button" onClick={() => setOpenKey(open ? null : b.key)} aria-expanded={open} className={quiet}>
                  {open ? "Hide chapters" : "Past paper questions by chapter"}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>
                {open && (
                  <ul className="mt-1 space-y-0.5">
                    {done.map((c) => {
                      const t = topicalFor(index, b.paperCode, c.num);
                      return (
                        <li key={c.num} className="flex min-h-10 items-center gap-3 text-sm">
                          <span className="w-10 shrink-0 tabular-nums text-ink-3">{c.num}</span>
                          <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
                          {t ? (
                            <Link href={t.href} className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-ink-2 hover:text-ink hover:underline">
                              {t.count} {t.count === 1 ? "question" : "questions"}
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
