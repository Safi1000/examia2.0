"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button, Icon, Modal } from "@/components/ui";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { useNotifications } from "@/hooks/useNotifications";
import type { Activity } from "@/types";

/** The dropdown is a preview, not the archive — the full history lives at /notifications. */
const PREVIEW_COUNT = 10;

/**
 * Notification bell. Sits beside Sign out in both the student and admin
 * headers. Rows arrive by Supabase realtime (see store.subscribeToActivities)
 * and persist in the `activities` table, so the feed and its read state survive
 * a refresh. Nothing here polls.
 */
export function NotificationBell() {
  const router = useRouter();
  const { session } = useAuth();
  const { activities, unreadCount, isUnread, markRead, markAllRead, clearOne, clearAll, resolveLink } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The bell is shared by both shells, but the two route groups have different
  // layouts and guards — sending an admin to the student route would bounce
  // them to /login.
  const allHref = session?.role === "admin" ? "/admin/notifications" : "/notifications";

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

  const preview = activities.slice(0, PREVIEW_COUNT);

  function onSelect(a: Activity) {
    if (isUnread(a)) markRead([a.id]);
    setOpen(false);
    const href = resolveLink(a);
    if (href) router.push(href);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount ? `Notifications (${unreadCount} unread)` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative flex h-11 w-11 items-center justify-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <Icon.Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold leading-4 text-on-brand"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] animate-scale-in overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-lg)]"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-bold text-ink">Notifications</p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-semibold text-brand hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {preview.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-3">Nothing yet.</p>
            ) : (
              preview.map((a) => (
                <NotificationItem
                  key={a.id}
                  activity={a}
                  unread={isUnread(a)}
                  onSelect={onSelect}
                  onClear={clearOne}
                />
              ))
            )}
          </div>

          <div className="border-t border-border bg-surface-2/50">
            <button
              onClick={() => { setOpen(false); router.push(allHref); }}
              className="flex w-full items-center justify-center gap-1.5 px-4 py-3 text-xs font-bold text-brand transition-colors hover:bg-surface-2"
            >
              Show All Notifications &amp; Activity
              <Icon.ChevronRight className="h-3.5 w-3.5" />
            </button>

            {activities.length > 0 && (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex w-full items-center justify-center gap-1.5 border-t border-border px-4 py-2.5 text-xs font-semibold text-ink-3 transition-colors hover:bg-error-soft hover:text-error"
              >
                <Icon.Trash className="h-3.5 w-3.5" />
                Clear All Notifications
              </button>
            )}
          </div>
        </div>
      )}

      {/* Portals out of the dropdown, so closing the dropdown behind it is fine. */}
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
              onClick={() => { clearAll(); setConfirmClear(false); setOpen(false); }}
            >
              Clear All
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          Are you sure you want to clear all your notifications?
        </p>
        <p className="mt-2 text-xs text-ink-3">
          This only clears your own feed. Everyone else keeps theirs.
        </p>
      </Modal>
    </div>
  );
}
