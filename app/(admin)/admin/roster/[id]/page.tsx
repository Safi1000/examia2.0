"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useDatabase } from "@/lib/data/store";
import { cohortById, studentById, submissionsForStudent, testById } from "@/lib/data/selectors";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Badge, CohortDot, EmptyState, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";
import { MasteryBar } from "@/components/charts/MasteryBar";
import { gradeSubmission } from "@/lib/grading";
import { topicMastery } from "@/lib/scoring";
import { formatTimestamp } from "@/lib/time";

export default function StudentDetailPage() {
  const params = useParams();
  const id = String(params.id);
  const db = useDatabase();
  const student = studentById(db, id);

  const data = useMemo(() => {
    if (!student) return null;
    const subs = submissionsForStudent(db, student.id).sort(
      (a, b) => +new Date(a.submittedAt ?? 0) - +new Date(b.submittedAt ?? 0),
    );
    const released = subs.filter((s) => s.status === "released");
    const tests = released.map((s) => testById(db, s.testId)).filter((t): t is NonNullable<typeof t> => !!t);
    const points: LinePoint[] = released.map((s, i) => {
      const t = testById(db, s.testId);
      return { label: String(i + 1), value: t ? gradeSubmission(t, s).percent : 0 };
    });
    const avg = points.length ? Math.round((points.reduce((a, p) => a + p.value, 0) / points.length) * 10) / 10 : 0;
    return { subs, released, mastery: topicMastery(tests, released), points, avg };
  }, [db, student]);

  if (!student || !data) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <PageHeader title="Student not found" back={{ href: "/admin/roster", label: "Roster" }} />
        <EmptyState icon={<Icon.Users />} title="No such student" />
      </div>
    );
  }

  const cohort = cohortById(db, student.cohortId);

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title={student.username}
        subtitle={student.email}
        back={{ href: "/admin/roster", label: "Roster" }}
        actions={cohort ? <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2"><CohortDot color={cohort.color} />{cohort.name}</span> : undefined}
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Submissions" value={String(data.subs.length)} />
        <Stat label="Released" value={String(data.released.length)} />
        <Stat label="Average" value={`${data.avg}%`} />
      </div>

      {data.released.length > 0 ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-ink-2">Score trend</h2>
            <LineChart points={data.points} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-2">Topic mastery</h2>
            <div className="space-y-3.5">
              {data.mastery.map((m) => <MasteryBar key={m.topic} topic={m.topic} percent={m.percent} band={m.band} />)}
            </div>
          </Card>
        </div>
      ) : (
        <EmptyState className="mt-5" icon={<Icon.Chart />} title="No released results yet" message="Release a result to build this student's analytics." />
      )}

      <h2 className="mb-2.5 mt-7 text-sm font-bold uppercase tracking-wide text-ink-2">Submissions</h2>
      {data.subs.length === 0 ? (
        <EmptyState icon={<Icon.Inbox />} title="No submissions" />
      ) : (
        <div className="space-y-2">
          {data.subs.map((s) => {
            const test = testById(db, s.testId);
            const grade = test ? gradeSubmission(test, s) : null;
            return (
              <Card key={s.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{test?.title ?? "—"}</p>
                  <p className="text-sm text-ink-2">{s.submittedAt ? formatTimestamp(s.submittedAt) : "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.status === "released" && grade ? (
                    <Badge tone="success">{grade.percent}% · {grade.letter}</Badge>
                  ) : (
                    <Badge tone="warning">Awaiting</Badge>
                  )}
                  <Link href={`/admin/grading/${s.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    {s.status === "released" ? "Review" : "Grade"}
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4 text-center">
      <p className="font-display text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-xs text-ink-3">{label}</p>
    </Card>
  );
}
