"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { STUDENT_EMAIL_DOMAIN } from "@/lib/config";
import { isLeftKind, isPauseReason, readLeft, type LeftMark, type PauseReason } from "@/lib/farewell-copy";

export type AccessState = {
  /** Hamza has paused this student's access (always true for a student who has left). */
  paused: boolean;
  /** Why, when Hamza gave a reason. */
  reason: PauseReason | null;
  /** Set when the student has left (finished the course or dropped out). */
  left: LeftMark | null;
  /** The login's username now ("" until known). */
  username: string;
  /** They have already sent Hamza a farewell note. */
  farewellSent: boolean;
};

const OPEN: AccessState = { paused: false, reason: null, left: null, username: "", farewellSent: false };

type AuthUser = { app_metadata?: unknown; email?: string | null } | null | undefined;

function stateOf(user: AuthUser): AccessState {
  const m = (user?.app_metadata ?? {}) as Record<string, unknown>;
  const left = readLeft(m.left);
  const email = user?.email ?? "";
  const suffix = `@${STUDENT_EMAIL_DOMAIN}`;
  return {
    paused: m.paused === true || !!left,
    reason: isPauseReason(m.pause_reason) ? m.pause_reason : null,
    left,
    username: email.endsWith(suffix) ? email.slice(0, -suffix.length) : "",
    farewellSent: !!m.farewell && typeof m.farewell === "object",
  };
}

const same = (a: AccessState, b: AccessState) =>
  a.paused === b.paused && a.reason === b.reason && a.username === b.username && a.farewellSent === b.farewellSent &&
  a.left?.kind === b.left?.kind && a.left?.at === b.left?.at && a.left?.username === b.left?.username;

/**
 * Whether Hamza has paused this student's access (set from Students in the
 * teacher console), why, and whether they have left. Read first from the
 * sign-in already on the device, then fresh from the server; checked again
 * whenever the portal comes back to the front and every few minutes, so a
 * pause, a resume or a farewell shows without signing out. A failed check
 * (weak signal) keeps the last answer.
 */
export function useAccessPaused(on: boolean): AccessState {
  const [state, setState] = useState<AccessState>(OPEN);
  useEffect(() => {
    // Local preview only (never on the live site):
    //   /dashboard?demo=student&paused=1&reason=fees|break   the paused screen
    //   /dashboard?demo=student&left=finished|dropped         the farewell screen
    if (DEMO) {
      const q = new URLSearchParams(window.location.search);
      const kind = q.get("left");
      const reason = q.get("reason");
      const left = isLeftKind(kind) ? { kind, at: new Date().toISOString(), username: "" } : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the address bar, client only
      setState({ paused: q.get("paused") === "1" || !!left, reason: isPauseReason(reason) ? reason : null, left, username: "", farewellSent: false });
      return;
    }
    if (!on) return;
    let alive = true;
    const apply = (next: AccessState) => setState((prev) => (same(prev, next) ? prev : next));
    const check = async () => {
      try {
        const { data, error } = await supabase().auth.getUser();
        if (alive && !error && data.user) apply(stateOf(data.user));
      } catch {
        /* keep the last answer */
      }
    };
    void supabase()
      .auth.getSession()
      .then(({ data }) => {
        const s = stateOf(data.session?.user);
        if (alive && s.paused) apply(s);
      })
      .catch(() => {});
    void check();
    const onShow = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShow);
    const every = setInterval(() => void check(), 5 * 60_000);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onShow);
      clearInterval(every);
    };
  }, [on]);
  return on || DEMO ? state : OPEN;
}
