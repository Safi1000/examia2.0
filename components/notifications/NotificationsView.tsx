"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDataReady } from "@/lib/data/store";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { Button, EmptyState, Icon, Modal, Skeleton, Tabs, type TabItem } from "@/components/ui";
import { categoryOf, matchesQuery, type NotificationCategory } from "@/lib/notifications";
import type { Activity } from "@/types";
import { EmptyArt, PageHeader } from "@/components/student/PortalKit";

/** Rows added each time the sentinel scrolls into view. */
const PAGE_SIZE = 20;

const FILTERS: { id: NotificationCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "tests", label: "Tests" },
  { id: "notes", label: "Notes" },
  { id: "results", label: "Results" },
  { id: "announcements", label: "Announcements" },
  { id: "activities", label: "Activities" },
];

/**
 * The full notification history + activity feed.
 *
 * Mounted once per role shell (student and admin) so each keeps its own header
 * and chrome, but the list itself is this one component — and it reads the same
 * store cache and realtime channel as the bell, so the two can never disagree.
 */
export function NotificationsView() {
  const router = useRouter();
  const ready = useDataReady();
  const { activities, unreadCount, isUnread, markRead, markAllRead, clearOne, clearAll, resolveLink } =
    useNotifications();

  const [filter, setFilter] = useState<NotificationCategory>("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [confirmClear, setConfirmClear] = useState(false);

  const visible = useMemo(
    () =>
      activities.filter((a) => {
        if (!matchesQuery(a, query)) return false;
        if (filter === "all") return true;
        if (filter === "unread") return isUnread(a);
        return categoryOf(a.type) === filter;
      }),
    [activities, query, filter, isUnread],
  );

  // Narrowing the list must not leave it paginated deep into a count that no
  // longer applies, so both inputs rewind it as they change.
  const changeFilter = useCallback((id: string) => {
    setFilter(id as NotificationCategory);
    setLimit(PAGE_SIZE);
  }, []);
  const changeQuery = useCallback((q: string) => {
    setQuery(q);
    setLimit(PAGE_SIZE);
  }, []);

  const shown = visible.slice(0, limit);
  const hasMore = visible.length > shown.length;

  // Infinite scroll: grow the window when the sentinel comes into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setLimit((n) => n + PAGE_SIZE);
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
    // `limit` too: if the next page still leaves the marker on screen (a tall
    // screen, short rows), a fresh observer reports it again and loading carries on.
  }, [hasMore, limit]);

  const onSelect = useCallback(
    (a: Activity) => {
      if (isUnread(a)) markRead([a.id]);
      const href = resolveLink(a);
      // Internal pages only: never follow an outside link from a notification.
      if (href && href.startsWith("/") && !href.startsWith("//")) router.push(href);
    },
    [isUnread, markRead, resolveLink, router],
  );

  // Only the filters that have something in them (plus All, and whichever is open).
  const present = new Set(activities.map((a) => categoryOf(a.type)));
  const tabs: TabItem[] = FILTERS.filter((f) => f.id === "all" || f.id === filter || (f.id === "unread" ? unreadCount > 0 : present.has(f.id as never))).map((f) => ({
    id: f.id,
    label: f.label,
    // Only the unread tab carries a count; the rest would just be noise.
    count: f.id === "unread" && unreadCount > 0 ? unreadCount : undefined,
  }));

  return (
    <div className="rise mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
      {/* The same title block as every other screen (student and teacher). */}
      <PageHeader
        title="Notifications"
        className="mb-10"
        aside={
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="secondary" size="sm" onClick={markAllRead}>
              <Icon.Check className="h-4 w-4" />
              Mark all as read
            </Button>
          )}
          {activities.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setConfirmClear(true)}>
              <Icon.Trash className="h-4 w-4" />
              Clear all
            </Button>
          )}
        </div>
        }
      >
        <span className="tabular-nums">
          {unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
            : "You're all caught up."}
        </span>
      </PageHeader>

      {/* Search and filters only once there is enough to search through. */}
      {(activities.length > 5 || query) && (
      <div className="relative mb-4">
        <Icon.Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
        {/* The same search field as Notes: a pill, 16px type so phones don't zoom. */}
        <input
          type="search"
          value={query}
          onChange={(e) => changeQuery(e.target.value)}
          placeholder="Search notifications and activity…"
          aria-label="Search notifications"
          className="h-12 w-full rounded-full border border-field bg-surface pl-12 pr-4 text-base text-ink placeholder:text-ink-3 transition-colors duration-150 hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        />
      </div>

      )}

      {tabs.length > 1 && <Tabs tabs={tabs} active={filter} onChange={changeFilter} className="mb-5" />}

      {!ready ? (
        // Shaped like the list it becomes: one card, a row each.
        <div className="surface divide-y divide-hairline overflow-hidden rounded-card" aria-busy>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 px-5 py-4">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Icon.Bell className="h-5 w-5" />}
          art={query || filter !== "all" ? undefined : <EmptyArt name="empty-all-caught-up" />}
          title={query || filter !== "all" ? "No matches" : "Nothing yet"}
          message={
            query || filter !== "all"
              ? "No notifications match this search or filter."
              : "New tests, notes, results and announcements will appear here."
          }
          action={
            query || filter !== "all" ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { changeQuery(""); changeFilter("all"); }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="surface overflow-hidden rounded-card">
          {shown.map((a) => (
            <NotificationItem
              key={a.id}
              activity={a}
              unread={isUnread(a)}
              variant="full"
              onSelect={onSelect}
              onClear={clearOne}
            />
          ))}

          {hasMore && (
            <div ref={sentinel} className="p-4 text-center text-sm text-ink-3" aria-hidden>
              Loading more…
            </div>
          )}
        </div>
      )}

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear all notifications?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => { clearAll(); setConfirmClear(false); }}
            >
              Clear all
            </Button>
          </>
        }
      >
        <p className="text-base text-ink-2">
          Are you sure you want to clear all your notifications?
        </p>
        <p className="mt-2 text-sm text-ink-3">
          This empties your list. You can&apos;t undo it.
        </p>
      </Modal>
    </div>
  );
}
