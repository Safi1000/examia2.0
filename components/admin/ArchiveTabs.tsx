"use client";

import { Tabs } from "@/components/ui";

export type ArchiveView = "current" | "archive";

/**
 * Current / Archive switch for admin lists. The archive holds everything from
 * switched-off cohorts. Hidden until there is something in it.
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
  if (archiveCount === 0 && view === "current") return null;
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
