"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { studentById, submissionFor, testsForStudent } from "@/lib/data/selectors";
import { TestCard } from "@/components/student/TestCard";
import { AddToCalendar } from "@/components/student/AddToCalendar";
import { EmptyState, Icon } from "@/components/ui";
import { testWindow } from "@/lib/time";
import { EmptyArt, PageHeader, SectionTitle } from "@/components/student/PortalKit";

/** Every test in one place: open now, coming up, and past (with results). */
export default function TestsPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const student = session?.studentId ? studentById(db, session.studentId) : null;

  const groups = useMemo(() => {
    if (!student) return { open: [], upcoming: [], past: [] };
    const tests = testsForStudent(db, student);
    const open = [], upcoming = [], past = [];
    for (const t of tests) {
      const w = testWindow(t.opensAt, t.closesAt, nowMs);
      const sub = submissionFor(db, student.id, t.id);
      if (w === "open" && !sub) open.push(t);
      else if (w === "future") upcoming.push(t);
      else past.push(t);
    }
    open.sort((a, b) => +new Date(a.closesAt) - +new Date(b.closesAt));
    upcoming.sort((a, b) => +new Date(a.opensAt) - +new Date(b.opensAt));
    past.sort((a, b) => +new Date(b.closesAt) - +new Date(a.closesAt));
    return { open, upcoming, past };
  }, [db, student, nowMs]);

  if (!student) return null;
  const empty = !groups.open.length && !groups.upcoming.length && !groups.past.length;

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-10">
      <PageHeader title="Tests">
          {groups.open.length
            ? `${groups.open.length === 1 ? "One test is" : `${groups.open.length} tests are`} open now.`
            : groups.upcoming.length
              ? "Nothing open right now. Your next tests are below."
              : "Nothing to sit right now."}
      </PageHeader>

      {empty && (
        <EmptyState
          icon={<Icon.Doc />}
          art={<EmptyArt name="empty-no-tests-yet" />}
          title="No tests yet"
          message="Tests I set for you will appear here."
        />
      )}

      {groups.open.length > 0 && (
        <Section title="Open now" live>
          {groups.open.map((t, i) => (
            <TestCard key={t.id} test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} lead={i === 0} />
          ))}
        </Section>
      )}

      {groups.upcoming.length > 0 && (
        <Section title="Coming up">
          {groups.upcoming.map((t) => (
            <div key={t.id}>
              <TestCard test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} />
              <div className="mt-1 flex justify-end pr-1">
                <AddToCalendar test={t} />
              </div>
            </div>
          ))}
        </Section>
      )}

      {groups.past.length > 0 && (
        <Section title="Past tests">
          {groups.past.map((t) => (
            <TestCard key={t.id} test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} />
          ))}
        </Section>
      )}
      </div>
    </div>
  );
}

function Section({ title, live, children }: { title: string; live?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <SectionTitle live={live}>{title}</SectionTitle>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
