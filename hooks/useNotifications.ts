"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAuth } from "@/lib/auth-context";
import { submissionFor, testById } from "@/lib/data/selectors";
import { resolveActivityLink } from "@/lib/notifications";
import type { Activity } from "@/types";

/**
 * The notification feed for the current session.
 *
 * Shared by the bell and /notifications so both read the same list, the same
 * unread count and the same realtime channel — the store cache is the single
 * source, so marking one read updates both without any cross-talk between them.
 *
 * What this session is allowed to see is decided by RLS, not here.
 */
export function useNotifications() {
  const db = useDatabase();
  const store = useStore();
  const { session } = useAuth();
  const [userId, setUserId] = useState<string | null>(null);

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

  // Live feed. Push, not poll.
  useEffect(() => store.subscribeToActivities(), [store]);

  // Cleared entries are hidden from THIS user only — the row itself lives on for
  // everyone else the notification was addressed to.
  const activities = useMemo(
    () =>
      userId
        ? db.activities.filter((a) => !a.clearedBy.includes(userId))
        : db.activities, // already newest-first from the store
    [db.activities, userId],
  );

  const isUnread = useCallback(
    (a: Activity) => !!userId && !a.readBy.includes(userId),
    [userId],
  );

  const unread = useMemo(() => activities.filter(isUnread), [activities, isUnread]);

  const markRead = useCallback(
    (ids: string[]) => {
      if (userId && ids.length) store.markActivitiesRead(ids, userId);
    },
    [store, userId],
  );

  const markAllRead = useCallback(() => {
    markRead(unread.map((a) => a.id));
  }, [markRead, unread]);

  const clearOne = useCallback(
    (id: string) => {
      if (userId) store.clearActivities([id], userId);
    },
    [store, userId],
  );

  const clearAll = useCallback(() => {
    if (userId) store.clearAllActivities(userId);
  }, [store, userId]);

  /**
   * Where a notification should navigate, decided now rather than when it was
   * written — a test's state moves under a notification that outlives it.
   */
  const resolveLink = useCallback(
    (a: Activity): string | undefined => {
      const studentId = session?.studentId;
      const test = a.testId ? testById(db, a.testId) : null;
      return resolveActivityLink(a, {
        test,
        submission: studentId && test ? submissionFor(db, studentId, test.id) : null,
        nowMs: Date.now(),
      });
    },
    [db, session?.studentId],
  );

  return {
    activities,
    unread,
    unreadCount: unread.length,
    userId,
    isUnread,
    markRead,
    markAllRead,
    clearOne,
    clearAll,
    resolveLink,
  };
}
