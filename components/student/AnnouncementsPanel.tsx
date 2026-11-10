"use client";

import { useState } from "react";
import type { Student } from "@/types";
import { useDismissibleAnnouncements } from "@/hooks/useDismissibleAnnouncements";
import { Icon } from "@/components/ui";
import { formatDate } from "@/lib/time";
import { SectionTitle } from "@/components/student/PortalKit";

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
    <section aria-labelledby="ann-title">
      <SectionTitle id="ann-title">From Hamza</SectionTitle>
      <ul className="surface divide-y divide-hairline overflow-hidden rounded-xl">
        {shown.map((a) => {
          const isOpen = open === a.id;
          return (
            <li key={a.id} className="flex items-start gap-3 py-3.5 pl-5 pr-2 sm:pl-6">
              {a.pinned ? <Icon.Flag className="mt-1 h-4 w-4 shrink-0 text-ink-2" /> : <Icon.Megaphone className="mt-1 h-4 w-4 shrink-0 text-ink-3" />}
              <button type="button" onClick={() => setOpen(isOpen ? null : a.id)} aria-expanded={isOpen} className="min-w-0 flex-1 text-left">
                <p className={`text-base text-ink ${isOpen ? "whitespace-pre-wrap" : "line-clamp-2"}`}>{a.body}</p>
                <p className="mt-0.5 text-xs text-ink-3">
                  {a.pinned ? "Pinned · " : ""}
                  {formatDate(a.createdAt)}
                </p>
              </button>
              {!a.pinned && (
                <button
                  onClick={() => dismiss(a.id)}
                  aria-label="Dismiss announcement"
                  className="flex h-11 w-11 -mr-2 -mt-1 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
                >
                  <Icon.Close className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {items.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-1 inline-flex min-h-11 items-center px-1 text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
