"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { studentById, submissionsForStudent, testById } from "@/lib/data/selectors";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";
import { MasteryBar } from "@/components/charts/MasteryBar";
import { Card, EmptyState, Icon, Badge } from "@/components/ui";
import { gradeSubmission } from "@/lib/grading";
import { topicMastery } from "@/lib/scoring";

export default function ProgressPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const student = session?.studentId ? studentById(db, session.studentId) : null;

  const data = useMemo(() => {
    if (!student) return null;
    const released = submissionsForStudent(db, student.id)
      .filter((s) => s.status === "released")
      .sort((a, b) => +new Date(a.submittedAt ?? a.startedAt) - +new Date(b.submittedAt ?? b.startedAt));

    const tests = released.map((s) => testById(db, s.testId)).filter((t): t is NonNullable<typeof t> => !!t);

    const points: LinePoint[] = released.map((s, i) => {
      const test = testById(db, s.testId);
      return { label: String(i + 1), value: test ? gradeSubmission(test, s).percent : 0 };
    });

    const mastery = topicMastery(tests, released);
    const avg =
      points.length > 0 ? Math.round((points.reduce((a, p) => a + p.value, 0) / points.length) * 10) / 10 : 0;

    return { released, points, mastery, avg };
  }, [db, student]);

  if (!student || !data) return null;

  const weak = data.mastery.filter((m) => m.band !== "mastery");

  if (data.released.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">My progress</h1>
        <EmptyState
          className="mt-5"
          icon={<Icon.Chart />}
          title="No results yet"
          message="Once your teacher releases results, your score trend and topic mastery will build up here."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <header className="animate-fade-up">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">My progress</h1>
        <p className="mt-0.5 text-sm text-ink-2">Across {data.released.length} released {data.released.length === 1 ? "result" : "results"}.</p>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Tests taken" value={String(data.released.length)} />
        <Stat label="Average score" value={`${data.avg}%`} />
      </div>

      <Card className="animate-fade-up p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-2">Score trend</h2>
        <p className="mb-2 text-xs text-ink-3">Each point is one released test, in order taken.</p>
        <LineChart points={data.points} />
      </Card>

      <Card className="animate-fade-up p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-2">Topic mastery</h2>
          {weak.length > 0 && <Badge tone="warning">{weak.length} to review</Badge>}
        </div>
        <div className="mt-4 space-y-4">
          {data.mastery.map((m) => (
            <MasteryBar key={m.topic} topic={m.topic} percent={m.percent} band={m.band} />
          ))}
        </div>
      </Card>

      {weak.length > 0 && (
        <Card className="animate-fade-up border-warning/30 bg-warning-soft/40 p-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-warning">
            <Icon.Flag className="h-4 w-4" /> Focus areas
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {weak.map((m) => (
              <li key={m.topic} className="flex items-center justify-between gap-2">
                <span>{m.topic}</span>
                <span className={m.band === "critical" ? "font-semibold text-error" : "font-semibold text-warning"}>
                  {m.band === "critical" ? "Critical" : "Weak"} · {Math.round(m.percent)}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Link href="/dashboard" className="block text-center text-sm font-semibold text-brand hover:underline">
        ← Back to dashboard
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="animate-fade-up p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold text-ink">{value}</p>
    </Card>
  );
}
