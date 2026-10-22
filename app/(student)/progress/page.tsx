"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { studentById, submissionsForStudent, testById, testsForStudent } from "@/lib/data/selectors";
import { gradeLetter, gradeSubmission } from "@/lib/grading";
import { topicMastery } from "@/lib/scoring";
import { GRADE_FLOOR, performanceSnapshot, sameSubject } from "@/lib/performance";
import { formatDate } from "@/lib/time";
import { studentSubjects } from "@/components/student/Welcome";
import { EmptyState, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { Mission } from "@/components/student/FocusMode";

const FocusMode = dynamic(() => import("@/components/student/FocusMode"), { ssr: false });

/**
 * My progress, in the order a student asks: Where am I? Which subject needs
 * me? Which topics? How did each test go? Then their Groundwork study time.
 */
export default function ProgressPage() {
  const { session, profile } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const [practise, setPractise] = useState<Mission | null>(null);

  const data = useMemo(() => {
    if (!student) return null;
    const released = submissionsForStudent(db, student.id)
      .filter((s) => s.status === "released")
      .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""));
    const results = released.flatMap((s) => {
      const t = testById(db, s.testId);
      return t ? [{ test: t, sub: s, pct: gradeSubmission(t, s).percent }] : [];
    });
    const topics = topicMastery(
      results.map((r) => r.test),
      results.map((r) => r.sub),
    ).filter((m) => m.available > 0);
    const set = testsForStudent(db, student).filter((t) => +new Date(t.opensAt) <= nowMs);
    const handedIn = new Set(submissionsForStudent(db, student.id).filter((s) => s.status !== "in_progress").map((s) => s.testId));
    return {
      results,
      snap: performanceSnapshot(db, student),
      weak: topics.filter((m) => m.percent < 60).slice(0, 5),
      strong: [...topics].filter((m) => m.percent >= 75).sort((a, b) => b.percent - a.percent).slice(0, 5),
      handed: set.filter((t) => handedIn.has(t.id)).length,
      setCount: set.length,
    };
  }, [db, student, nowMs]);

  if (!student || !data) return null;
  const { results, snap } = data;
  const targetFor = (subject: string) => {
    const key = Object.keys(profile.targets ?? {}).find((k) => sameSubject(k, subject));
    const t = key ? profile.targets![key] : undefined;
    return typeof t === "string" && t in GRADE_FLOOR ? t : undefined;
  };
  const noteFor = (topic: string) => db.notes.some((n) => n.title.toLowerCase().includes(topic.toLowerCase()));

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 sm:px-6">
      <h1 className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink">My progress</h1>

      {!snap ? (
        <EmptyState icon={<Icon.Chart />} title="Your progress starts with your first marked test" message="Once Hamza releases a result, your grade, subjects and topics show up here." />
      ) : (
        <>
          {/* 1. Where am I? */}
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-brand/30 bg-[linear-gradient(135deg,rgba(251,193,89,0.14),rgba(251,193,89,0.03))] p-5 sm:col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-brand">Working at</p>
              <div className="mt-2 flex items-end gap-4">
                <span className="text-6xl font-extrabold leading-none tracking-tight text-brand">{snap.grade}</span>
                <div className="pb-1">
                  <p className="text-lg font-semibold tabular-nums text-ink">{Math.round(snap.recent)}%</p>
                  <p className="text-xs text-ink-3">average of your last {Math.min(5, snap.marked)} tests</p>
                </div>
              </div>
              {snap.delta != null && Math.abs(snap.delta) >= 1 && (
                <p className={cn("mt-3 text-sm font-semibold", snap.delta > 0 ? "text-success" : "text-warning")}>
                  {snap.delta > 0 ? "▲ Up" : "▼ Down"} {Math.abs(Math.round(snap.delta))}% on the tests before
                </p>
              )}
            </div>
            <div className="rounded-lg border border-border bg-surface p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-3">Tests done</p>
              <p className="mt-2 text-3xl font-extrabold tabular-nums text-ink">
                {data.handed}
                <span className="text-lg font-semibold text-ink-3"> / {data.setCount}</span>
              </p>
              <p className="mt-1 text-xs text-ink-3">{data.setCount - data.handed > 0 ? `${data.setCount - data.handed} missed` : "None missed"}</p>
            </div>
          </section>

          {/* 2. Which subject needs me? */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink">By subject</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {snap.bySubject.map((s) => {
                const target = targetFor(s.subject);
                const gap = target ? Math.max(0, Math.ceil(GRADE_FLOOR[target] - s.recent)) : null;
                return (
                  <div key={s.subject} className="rounded-lg border border-border bg-surface p-4">
                    <p className="truncate text-sm text-ink-2">{s.subject}</p>
                    <p className="mt-1 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-ink">{s.grade}</span>
                      <span className="text-sm tabular-nums text-ink-3">{Math.round(s.recent)}%</span>
                    </p>
                    {target && (
                      <>
                        <div className="relative mt-3 h-1.5 rounded-full bg-surface-2" aria-hidden>
                          <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, s.recent)}%` }} />
                          <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-ink" style={{ left: `${GRADE_FLOOR[target]}%` }} />
                        </div>
                        <p className={cn("mt-2 text-xs font-semibold", gap ? "text-warning" : "text-success")}>
                          {gap ? `${gap}% to your ${target}` : `On track for ${target}`}
                        </p>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. Which topics? */}
          {(data.weak.length > 0 || data.strong.length > 0) && (
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface p-5">
                <h2 className="text-base font-semibold text-ink">Fix these next</h2>
                {data.weak.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-2">No weak topics right now. Nice.</p>
                ) : (
                  <ul className="mt-3 space-y-2.5">
                    {data.weak.map((m) => (
                      <li key={m.topic} className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-ink">{m.name}</span>
                          <span className="block text-xs text-ink-3">
                            {m.subject} · {Math.round(m.percent)}%
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setPractise({ subject: m.subject, topic: m.name, noteHref: noteFor(m.name) ? "/notes" : undefined })}
                          className="h-9 shrink-0 rounded-full bg-brand px-3.5 text-xs font-semibold text-on-brand"
                        >
                          Practise
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded-lg border border-border bg-surface p-5">
                <h2 className="text-base font-semibold text-ink">Your strengths</h2>
                {data.strong.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-2">Topics at 75% or more show here.</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {data.strong.map((m) => (
                      <li key={m.topic} className="rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
                        {m.name} {Math.round(m.percent)}%
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {/* 4. How did each test go? */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink">Results</h2>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {results.map(({ test, sub, pct }) => (
                <li key={sub.id}>
                  <Link href={`/results/${test.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2">
                    <span className="w-10 shrink-0 text-center text-lg font-extrabold text-brand">{gradeLetter(pct)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{test.title}</span>
                      <span className="block text-xs text-ink-3">
                        {test.subject}
                        {sub.submittedAt ? ` · ${formatDate(sub.submittedAt)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-sm font-semibold text-ink">{Math.round(pct)}%</span>
                    <Icon.ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <Link href="/groundwork" className="block rounded-lg border border-border bg-surface px-5 py-4 text-sm text-ink-2 transition-colors hover:border-border-strong">
        Your study time, level and streak are in <span className="font-semibold text-brand">Groundwork →</span>
      </Link>

      {practise &&
        createPortal(<FocusMode subjects={studentSubjects(db, student)} mission={practise} onClose={() => setPractise(null)} />, document.body)}
    </div>
  );
}
