"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import { useAdminFilter } from "@/lib/admin-filter";
import { useDatabase } from "@/lib/data/store";
import { archivedCohortIds } from "@/lib/data/selectors";
import { DEMO } from "@/lib/demo";
import { displayName, isTestAccount } from "@/lib/display-name";
import { parentNotifications, studentNotifications } from "@/lib/portal-messages";
import { waDigits } from "@/lib/phone";
import { supabase } from "@/lib/supabase";

/**
 * Today: how many students have class reminders on, and who still needs a nudge,
 * each with a WhatsApp message ready to send. Quiet when everyone has them.
 */
export function NotifyCoverage() {
  const db = useDatabase();
  const { cohortId } = useAdminFilter();
  const [on, setOn] = useState<Set<string> | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (DEMO) {
          if (alive) setOn(new Set(db.students.slice(0, 2).map((s) => s.id)));
          return;
        }
        const { data } = await supabase().auth.getSession();
        const res = await fetch("/api/push/coverage", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, cache: "no-store" });
        const j = (await res.json().catch(() => ({}))) as { ids?: string[]; ready?: boolean };
        if (alive && res.ok && j.ready !== false) setOn(new Set(j.ids ?? []));
      } catch {}
    })();
    return () => {
      alive = false;
    };
    // The roster only matters for the demo's example, so it isn't a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { total, missing } = useMemo(() => {
    const off = archivedCohortIds(db);
    // Hamza's own test account is neither counted nor chased to turn reminders on.
    const all = db.students.filter((s) => !off.has(s.cohortId) && !isTestAccount(s) && (!cohortId || s.cohortId === cohortId));
    return { total: all.length, missing: all.filter((s) => !on?.has(s.id)).sort((a, b) => a.username.localeCompare(b.username)) };
  }, [db, cohortId, on]);

  if (!on || total === 0 || missing.length === 0) return null;
  const have = total - missing.length;

  return (
    <Card className="mb-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Class reminders</h2>
          <p className="mt-0.5 text-sm tabular-nums text-ink-3">
            On for {have} of {total} students. {missing.length} {missing.length === 1 ? "has" : "have"} not turned them on yet.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Hide" : "Who and how to remind"}
        </Button>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-ink-3" style={{ width: `${Math.round((have / total) * 100)}%` }} />
      </div>
      {open && (
        <ul className="mt-4 divide-y divide-border">
          {missing.map((s) => {
            const number = s.phone ?? s.whatsapp;
            const text = s.phone ? studentNotifications({ id: s.id, username: s.username }) : parentNotifications({ id: s.id, username: s.username });
            return (
              <li key={s.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
                <span className="font-medium text-ink">{displayName(s.username)}</span>
                {number ? (
                  <a
                    href={`https://wa.me/${waDigits(number)}?text=${encodeURIComponent(text)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline"
                  >
                    Remind on WhatsApp{s.phone ? "" : " (parent)"}
                  </a>
                ) : (
                  <span className="text-xs text-ink-3">No number saved</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
