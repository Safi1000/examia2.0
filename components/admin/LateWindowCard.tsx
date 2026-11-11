"use client";

import { useMemo, useState } from "react";
import type { Student, Test } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { archivedCohortIds, lateWindows, testCoversStudent } from "@/lib/data/selectors";
import { useNow } from "@/hooks/useNow";
import { useToast } from "@/components/toast";
import { Card, CardHeader, CardBody, Button, Select } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { SITE_URL } from "@/lib/seo";
import { parentReopened, studentReopened } from "@/lib/portal-messages";

const HOURS = [4, 6, 12, 24] as const;

const nameOf = (s: Student) => s.username.charAt(0).toUpperCase() + s.username.slice(1);
const pkTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true });
const left = (ms: number) => {
  const mins = Math.max(1, Math.round(ms / 60_000));
  return mins < 60 ? `${mins} min left` : `${Math.round(mins / 60)} h left`;
};

/**
 * A student missed the test and asks to sit it later: open it for just them,
 * for a few hours. Everyone else still sees it closed, and results for the
 * test are held until their window ends.
 */
export function LateWindowCard({ test }: { test: Test }) {
  const db = useDatabase();
  const store = useStore();
  const nowMs = useNow();
  const { toast } = useToast();

  const handedIn = useMemo(() => new Set(db.submissions.filter((s) => s.testId === test.id).map((s) => s.studentId)), [db.submissions, test.id]);
  // Current students this test is for, who haven't handed it in.
  const candidates = useMemo(() => {
    const off = archivedCohortIds(db);
    return db.students
      .filter((s) => !off.has(s.cohortId) && testCoversStudent(test, s) && !handedIn.has(s.id))
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [db, test, handedIn]);

  const windows = lateWindows(db)
    .filter((e) => e.testId === test.id && (+new Date(e.until) > nowMs || handedIn.has(e.studentId)))
    .map((e) => ({ ...e, student: db.students.find((s) => s.id === e.studentId) }))
    .filter((e): e is typeof e & { student: Student } => !!e.student)
    .sort((a, b) => +new Date(a.until) - +new Date(b.until));

  const [studentId, setStudentId] = useState("");
  const [hours, setHours] = useState<number>(6);
  const picked = candidates.find((s) => s.id === studentId) ?? null;

  const closesMs = +new Date(test.closesAt);
  const stillOpen = test.status !== "closed" && closesMs > nowMs;
  const endsBeforeClose = stillOpen && nowMs + hours * 3_600_000 <= closesMs;
  const resultsOut = db.submissions.some((s) => s.testId === test.id && s.status === "released");

  function open() {
    if (!picked) return;
    const until = store.reopenForStudent(test.id, picked.id, hours);
    toast(`Open for ${nameOf(picked)} until ${pkTime(until)}. Only they can see it.`, "success");
    setStudentId("");
  }

  function whatsapp(s: Student, until: string) {
    const link = `${SITE_URL}/test/${test.id}`;
    if (s.phone) {
      const text = studentReopened({ id: s.id, username: s.username, title: test.title, until: pkTime(until), link });
      return `https://wa.me/${s.phone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
    }
    if (s.whatsapp) {
      const text = parentReopened({ id: s.id, username: s.username, title: test.title, until: pkTime(until) });
      return `https://wa.me/${s.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
    }
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Let one student sit it late</h2>
        <p className="mt-1 text-sm text-ink-3">For a student who missed it. Only they see it open; everyone else still sees it closed.</p>
      </CardHeader>
      <CardBody className="space-y-4">
        {windows.length > 0 && (
          <ul className="divide-y divide-border rounded-md border border-border">
            {windows.map((w) => {
              const done = handedIn.has(w.studentId);
              const wa = done ? null : whatsapp(w.student, w.until);
              return (
                <li key={w.studentId} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{nameOf(w.student)}</p>
                    <p className={cn("text-xs", done ? "text-success" : "text-ink-3")}>
                      {done ? "Handed in" : `Open until ${pkTime(w.until)} · ${left(+new Date(w.until) - nowMs)}`}
                    </p>
                  </div>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      WhatsApp
                    </a>
                  )}
                  {!done && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        store.endReopen(test.id, w.studentId);
                        toast(`Closed again for ${nameOf(w.student)}.`, "success");
                      }}
                    >
                      Close now
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {candidates.length === 0 ? (
          <p className="text-sm text-ink-3">Everyone this test is for has handed it in.</p>
        ) : (
          <>
            <Select label="Student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Choose a student</option>
              {candidates.map((s) => (
                <option key={s.id} value={s.id}>
                  {nameOf(s)}
                </option>
              ))}
            </Select>
            <fieldset>
              <legend className="mb-1.5 block text-sm font-semibold text-ink-2">Open for</legend>
              <div className="grid grid-cols-4 gap-2">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={hours === h}
                    onClick={() => setHours(h)}
                    className={cn(
                      "h-11 rounded-md border text-sm font-semibold tabular-nums transition",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                      hours === h ? "border-brand bg-brand/12 text-brand" : "border-border-strong bg-surface text-ink-2 hover:text-ink",
                    )}
                  >
                    {h} hours
                  </button>
                ))}
              </div>
            </fieldset>
            {endsBeforeClose && (
              <p className="text-xs text-ink-3">The test is open for everyone until {pkTime(test.closesAt)}, so this window changes nothing yet. Pick a longer one, or come back after it closes.</p>
            )}
            {resultsOut && (
              <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
                Some results for this test are already out, so classmates may have seen the answers.
              </p>
            )}
            <Button fullWidth disabled={!picked || endsBeforeClose} onClick={open}>
              {picked ? `Open for ${nameOf(picked)} for ${hours} hours` : "Open for this student"}
            </Button>
            <p className="text-xs text-ink-3">They get a notification, and their timer is the normal {test.durationMinutes} minutes. Results for this test wait until their window ends, and you release theirs yourself after marking.</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}
