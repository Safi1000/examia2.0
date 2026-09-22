"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { cohortById, studentById, testById } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Badge, CohortDot, EmptyState, Icon, TableScroll, Table, Th, Td, Modal } from "@/components/ui";
import { FilterChips } from "@/components/admin/FilterChips";
import { buttonClasses } from "@/components/ui/Button";
import { gradeSubmission, isAllMcq } from "@/lib/grading";
import { formatTimestamp } from "@/lib/time";

export default function SubmissionsPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();

  const [subjectFilter, setSubjects] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Subjects that actually have submissions — filtering by an empty one is a
  // dead end the chips shouldn't offer.
  const subjects = useMemo(() => {
    const withSubs = new Set(db.submissions.map((s) => s.testId));
    return Array.from(new Set(db.tests.filter((t) => withSubs.has(t.id)).map((t) => t.subject))).sort();
  }, [db.tests, db.submissions]);

  const rows = useMemo(() => {
    return db.submissions
      .map((sub) => ({ sub, test: testById(db, sub.testId), student: studentById(db, sub.studentId) }))
      .filter((r): r is { sub: typeof r.sub; test: NonNullable<typeof r.test>; student: typeof r.student } => r.test !== null)
      .filter((r) => (cohortId ? r.student?.cohortId === cohortId : true))
      .filter((r) => (subjectFilter.length === 0 ? true : subjectFilter.includes(r.test.subject)))
      .filter((r) => (statuses.length === 0 ? true : statuses.includes(r.sub.status)))
      .map((r) => ({ ...r, grade: gradeSubmission(r.test, r.sub) }))
      // Anything still needing a grade floats to the top; released work sinks.
      .sort(
        (a, b) =>
          (a.sub.status === "released" ? 1 : 0) - (b.sub.status === "released" ? 1 : 0) ||
          +new Date(b.sub.submittedAt ?? 0) - +new Date(a.sub.submittedAt ?? 0),
      );
  }, [db, cohortId, subjectFilter, statuses]);

  // Bulk release covers exactly what the filters are showing: every awaiting
  // submission on an all-MCQ test, which needs no human marking.
  const releasable = rows.filter((r) => r.sub.status === "submitted" && isAllMcq(r.test));

  if (db.tests.length === 0) {
    return (
      <div className="px-4 py-6 sm:px-6">
        <PageHeader title="Submissions" />
        <EmptyState icon={<Icon.Inbox />} title="No tests yet" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Submissions"
        subtitle={`${rows.length} submission${rows.length === 1 ? "" : "s"}`}
        actions={releasable.length > 0 ? <Button onClick={() => setBulkOpen(true)}><Icon.Check className="h-4 w-4" /> Release all (MCQ)</Button> : undefined}
      />

      <div className="mb-4 space-y-2">
        <FilterChips
          label="Subject"
          options={subjects.map((sub) => ({ value: sub, label: sub }))}
          selected={subjectFilter}
          onChange={setSubjects}
        />
        <FilterChips
          label="Status"
          options={[
            { value: "submitted", label: "Awaiting grading" },
            { value: "released", label: "Released" },
          ]}
          selected={statuses}
          onChange={setStatuses}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Icon.Inbox />} title="No submissions" message="Nothing matches the current filters." />
      ) : (
        <Card className="p-0">
          <TableScroll>
            <Table stickyFirst>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Test</Th>
                  <Th>Cohort</Th>
                  <Th>Status</Th>
                  <Th>Score</Th>
                  <Th>Submitted</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ sub, test, student, grade }) => {
                  const cohort = student ? cohortById(db, student.cohortId) : null;
                  return (
                    <tr key={sub.id}>
                      <Td className="font-semibold capitalize">{student?.username ?? "—"}</Td>
                      <Td className="text-ink-2">{test.title}<span className="block text-xs text-ink-3">{test.subject}</span></Td>
                      <Td>{cohort ? <span className="inline-flex items-center gap-1.5 text-ink-2"><CohortDot color={cohort.color} />{cohort.name}</span> : "—"}</Td>
                      <Td>
                        {sub.status === "released" ? <Badge tone="success">Released</Badge> : <Badge tone="warning">Awaiting</Badge>}
                        {sub.autoSubmitted && <span className="ml-1 text-xs text-ink-3">auto</span>}
                      </Td>
                      <Td className="font-mono">{sub.status === "released" ? `${grade.percent}% · ${grade.letter}` : <span className="text-ink-3">—</span>}</Td>
                      <Td className="whitespace-nowrap text-ink-2">{sub.submittedAt ? formatTimestamp(sub.submittedAt) : "—"}</Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Link href={`/admin/grading/${sub.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                            {sub.status === "released" ? "Review" : "Grade"}
                          </Link>
                          <button onClick={() => setDeleteId(sub.id)} className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-error-soft hover:text-error" aria-label="Delete submission">
                            <Icon.Trash className="h-4 w-4" />
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableScroll>
        </Card>
      )}

      <Modal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Release all MCQ results?"
        description={`${releasable.length} ungraded submission${releasable.length === 1 ? "" : "s"} in the current filter.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button onClick={() => { releasable.forEach((r) => store.releaseSubmission(r.sub.id)); setBulkOpen(false); toast("Results released.", "success"); }}>Release all</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">All questions are auto-graded multiple choice, so results can be released in one click.</p>
      </Modal>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete submission?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deleteId) store.deleteSubmission(deleteId); setDeleteId(null); toast("Submission deleted.", "success"); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This permanently removes the student&apos;s submission.</p>
      </Modal>
    </div>
  );
}
