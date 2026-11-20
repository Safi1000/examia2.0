"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAuth } from "@/lib/auth-context";
import { joinedMs, studentById, submissionFor, testForStudent } from "@/lib/data/selectors";
import { resolveActivityLink } from "@/lib/notifications";
import type { Activity, ActivityType } from "@/types";
import { isTa } from "@/lib/staff";
import { staffAllowed, type StaffArea } from "@/lib/staff-areas";

/**
 * Which part of the console each kind of news belongs to. A staff member sees
 * only news for the parts Hamza switched on for them. Kinds not listed here
 * (what a student opened or started, Well built notes, system alerts) are
 * never shown to staff.
 */
const STAFF_NEWS: Partial<Record<ActivityType, StaffArea[]>> = {
  test_submitted: ["marking"],
  test_completed: ["marking"],
  submission_reviewed: ["marking"],
  result_released: ["marking"],
  test_created: ["tests"],
  test_updated: ["tests"],
  test_deleted: ["tests"],
  notes_uploaded: ["notes"],
  notes_assigned: ["notes"],
  notes_deleted: ["notes"],
  announcement_posted: ["announcements"],
  student_joined_class: ["students"],
  student_subject_joined: ["students"],
  student_left_class: ["students"],
};
/** A hand-in with no test on it is homework. */
const newsParts = (a: Activity): StaffArea[] => (a.type === "test_submitted" && !a.testId ? ["homework"] : (STAFF_NEWS[a.type] ?? []));

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
    // The saved session already knows who this is: no extra trip to the server.
    void supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (active) setUserId(data.session?.user.id ?? null);
      });
    return () => { active = false; };
  }, []);

  // Live feed. Push, not poll.
  useEffect(() => store.subscribeToActivities(), [store]);

  // Cleared entries are hidden from THIS user only — the row itself lives on for
  // everyone else the notification was addressed to.
  // A student only sees what happened since their account was made.
  const me = session?.studentId ? studentById(db, session.studentId) : null;
  const since = me ? joinedMs(me) : 0;
  const staff = isTa(session);
  const staffParts = staff ? staffAllowed(session?.staffAccess).join() : "";
  const activities = useMemo(
    () =>
      db.activities.filter(
        (a) =>
          (!userId || !a.clearedBy.includes(userId)) &&
          (!since || +new Date(a.createdAt) >= since) &&
          // A late window is the student's news; Hamza manages it on the test page.
          (!!me || a.type !== "test_reopened") &&
          // In-person tags are bookkeeping, not news.
          a.type !== "student_in_person" &&
          // Staff: only news for a part switched on for them, and never a note addressed to one student.
          (!staff || (a.audience !== "student" && newsParts(a).some((k) => staffParts.split(",").includes(k)))),
      ), // already newest-first from the store
    [db.activities, userId, since, me, staff, staffParts],
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
      const test = a.testId ? testForStudent(db, a.testId, studentId) : null;
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
