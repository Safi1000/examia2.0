"use client";

import { useState } from "react";
import type { Student } from "@/types";
import { useDismissibleAnnouncements } from "@/hooks/useDismissibleAnnouncements";
import { Icon } from "@/components/ui";
import { formatDate } from "@/lib/time";

/**
 * Hamza's notices, compact: one card, one line each (tap a line to read it
 * in full), pinned first. Three show; the rest open with "Show all".
 */
export function AnnouncementsPanel({ student }: { student: Student }) {
  const { pinned, dismissible, dismiss } = useDismissibleAnnouncements(student);
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const items = [...pinned.map((a) => ({ ...a, pinned: true })), ...dismissible.map((a) => ({ ...a, pinned: false }))];
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 3);

  return (
    <section aria-labelledby="ann-title" className="animate-fade-up">
      <h2 id="ann-title" className="mb-2.5 text-base font-semibold text-ink">
        From Hamza
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {shown.map((a) => {
          const isOpen = open === a.id;
          return (
            <li key={a.id} className="flex items-start gap-3 py-3 pl-4 pr-2">
              {a.pinned ? <Icon.Flag className="mt-1 h-4 w-4 shrink-0 text-brand" /> : <Icon.Megaphone className="mt-1 h-4 w-4 shrink-0 text-ink-3" />}
              <button type="button" onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen} className="min-w-0 flex-1 text-left">
                <p className={`text-[15px] text-ink ${isOpen ? "whitespace-pre-wrap" : "line-clamp-1"}`}>{a.body}</p>
                <p className="mt-0.5 text-xs text-ink-3">
                  {a.pinned ? "Pinned · " : ""}
                  {formatDate(a.createdAt)}
                </p>
              </button>
              {!a.pinned && (
                <button
                  onClick={() => dismiss(a.id)}
                  aria-label="Dismiss announcement"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
                >
                  <Icon.Close className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {items.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 text-sm font-semibold text-brand hover:underline">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
