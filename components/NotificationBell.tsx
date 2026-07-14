"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useDatabase, useStore } from "@/lib/data/store";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Activity, ActivityType } from "@/types";

/** Short relative stamp: "just now", "4m", "3h", "2d". */
function ago(iso: string): string {
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86_400)}d ago`;
}

/** One icon per activity family, reusing the existing Icon set. */
function ActivityIcon({ type }: { type: ActivityType }) {
  const cls = "h-4 w-4";
  switch (type) {
    case "test_started":
    case "test_submitted":
    case "test_completed":
    case "test_created":
    case "test_updated":
    case "test_deleted":
      return <Icon.Doc className={cls} />;
    case "submission_reviewed":
      return <Icon.Check className={cls} />;
    case "notes_uploaded":
    case "notes_assigned":
    case "notes_accessed":
    case "notes_downloaded":
    case "notes_deleted":
      return <Icon.Doc className={cls} />;
    case "student_joined_class":
    case "student_left_class":
      return <Icon.Users className={cls} />;
    default:
      return <Icon.Bell className={cls} />;
  }
}

/**
 * Recent-activity bell. Sits beside Sign out in both the student and admin
 * headers. Rows arrive by Supabase realtime (see store.subscribeToActivities)
 * and persist in the `activities` table, so the feed and its read state survive
 * a refresh. Nothing here polls.
 */
export function NotificationBell() {
  const db = useDatabase();
  const store = useStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // read_by holds auth.uid()s, which the session owns — not the student row id.
  useEffect(() => {
    let active = true;
    void supabase()
      .auth.getUser()
      .then(({ data }) => {
        if (active) setUserId(data.user?.id ?? null);
      });
    return () => { active = false; };
  }, []);

  // Live feed. RLS decides what this session is allowed to receive.
  useEffect(() => store.subscribeToActivities(), [store]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activities = db.activities; // already newest-first from the store
  const unread = useMemo(
    () => (userId ? activities.filter((a) => !a.readBy.includes(userId)) : []),
    [activities, userId],
  );

  function markAllRead() {
    if (!userId || !unread.length) return;
    store.markActivitiesRead(unread.map((a) => a.id), userId);
  }

  function onSelect(a: Activity) {
    if (userId && !a.readBy.includes(userId)) store.markActivitiesRead([a.id], userId);
    setOpen(false);
    if (a.link) router.push(a.link);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread.length ? `Notifications (${unread.length} unread)` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative flex h-11 w-11 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <Icon.Bell className="h-[18px] w-[18px]" />
        {unread.length > 0 && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-on-brand"
          >
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-scale-in overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-lg)]"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-bold text-ink">Recent activity</p>
            {unread.length > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-semibold text-brand hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {activities.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-3">Nothing yet.</p>
            ) : (
              activities.map((a) => {
                const isUnread = !!userId && !a.readBy.includes(userId);
                return (
                  <button
                    key={a.id}
                    role="menuitem"
                    onClick={() => onSelect(a)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 transition-colors hover:bg-surface-2",
                      isUnread && "bg-brand-soft/30",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                        isUnread ? "bg-brand-soft text-brand" : "bg-surface-2 text-ink-3",
                      )}
                    >
                      <ActivityIcon type={a.type} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={cn("truncate text-sm", isUnread ? "font-bold text-ink" : "font-semibold text-ink-2")}>
                          {a.title}
                        </span>
                        {isUnread && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />}
                      </span>
                      {a.description && (
                        <span className="mt-0.5 block truncate text-xs text-ink-3">{a.description}</span>
                      )}
                      <span className="mt-1 block text-[11px] text-ink-3 tabular">{ago(a.createdAt)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
