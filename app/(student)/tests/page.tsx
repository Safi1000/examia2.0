"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNow } from "@/hooks/useNow";
import { useDatabase } from "@/lib/data/store";
import { studentById, submissionFor, testsForStudent } from "@/lib/data/selectors";
import { TestCard } from "@/components/student/TestCard";
import { EmptyState, Icon } from "@/components/ui";
import { testWindow } from "@/lib/time";
import { EmptyArt, PageHeader, SectionTitle } from "@/components/student/PortalKit";

/** Past tests shown before "Show all": the newest, so results stay a short scroll away. */
const PAST_SHOWN = 8;

/** Every test in one place: open now, coming up, and finished (handed in, marked or closed). */
export default function TestsPage() {
  const { session } = useAuth();
  const db = useDatabase();
  const nowMs = useNow();
  const [allPast, setAllPast] = useState(false);
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
        <Section title="Open now">
          {groups.open.map((t, i) => (
            <TestCard key={t.id} test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} lead={i === 0} />
          ))}
        </Section>
      )}

      {groups.upcoming.length > 0 && (
        <Section title="Coming up">
          {groups.upcoming.map((t) => (
            <TestCard key={t.id} test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} calendar />
          ))}
        </Section>
      )}

      {groups.past.length > 0 && (
        // Handed in (even while still open for others), marked, or closed without
        // an attempt. "Finished" was untrue for a test the student never sat.
        <Section title="Past tests">
          {(allPast ? groups.past : groups.past.slice(0, PAST_SHOWN)).map((t) => (
            <TestCard key={t.id} test={t} submission={submissionFor(db, student.id, t.id)} nowMs={nowMs} />
          ))}
          {groups.past.length > PAST_SHOWN && (
            <button
              type="button"
              onClick={() => setAllPast(!allPast)}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline"
            >
              {allPast ? "Show fewer" : `Show all ${groups.past.length}`}
            </button>
          )}
        </Section>
      )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
