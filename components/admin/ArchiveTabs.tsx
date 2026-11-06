"use client";

import { Tabs } from "@/components/ui";

export type ArchiveView = "current" | "archive";

/**
 * Current / Archive switch for admin lists. The archive holds everything from
 * switched-off cohorts. It never shows on its own: archived work is only
 * reached from that cohort's card on the Cohorts page (which opens the page
 * with ?archive=1), so old cohorts never clutter the everyday screens.
 */
export function ArchiveTabs({
  view,
  onChange,
  currentLabel,
  archiveLabel = "Archive",
  currentCount,
  archiveCount,
}: {
  view: ArchiveView;
  onChange: (v: ArchiveView) => void;
  currentLabel: string;
  archiveLabel?: string;
  currentCount: number;
  archiveCount: number;
}) {
  if (view === "current") return null;
  return (
    <Tabs
      className="mb-4"
      active={view}
      onChange={(id) => onChange(id as ArchiveView)}
      tabs={[
        { id: "current", label: currentLabel, count: currentCount },
        { id: "archive", label: archiveLabel, count: archiveCount },
      ]}
    />
  );
}

/** Pages opened from an archived cohort's card come with ?archive=1. */
export function archiveFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("archive") === "1";
}
