"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter, useStickyFilter } from "@/lib/admin-filter";
import { archivedCohortIds, cohortById, inLateWindow, isArchivedSubmission } from "@/lib/data/selectors";
import { displayName } from "@/lib/display-name";
import { ArchiveTabs, archiveFromUrl, type ArchiveView } from "@/components/admin/ArchiveTabs";
import { useToast } from "@/components/toast";
import { stickyHead, tableBox } from "@/components/admin/surface";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Badge, CohortDot, EmptyState, Icon, TableScroll, Table, Th, Td, Modal } from "@/components/ui";
import { FilterChips } from "@/components/admin/FilterChips";
import { BulkBar, RowCheck } from "@/components/admin/BulkBar";
import { cn } from "@/lib/cn";
import { buttonClasses } from "@/components/ui/Button";
import { gradeSubmission, isAllMcq } from "@/lib/grading";
import { isFullyGraded } from "@/lib/scoring";
import { formatTimestamp } from "@/lib/time";

export default function SubmissionsPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();

  const [subjectFilter, setSubjects] = useStickyFilter("submissions.subject");
  const [classFilter, setClasses] = useStickyFilter("submissions.class");
  const [statuses, setStatuses] = useStickyFilter("submissions.status");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmPicked, setConfirmPicked] = useState(false);

  // Subjects that actually have submissions — filtering by an empty one is a
  // dead end the chips shouldn't offer.
  const subjects = useMemo(() => {
    const withSubs = new Set(db.submissions.map((s) => s.testId));
    return Array.from(new Set(db.tests.filter((t) => withSubs.has(t.id)).map((t) => t.subject))).sort();
  }, [db.tests, db.submissions]);

  // Work for switched-off cohorts lives in the archive.
  const [view, setView] = useState<ArchiveView>("current");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (archiveFromUrl()) setView("archive");
  }, []);
  const archived = useMemo(() => {
    const off = archivedCohortIds(db);
    return new Set(db.submissions.filter((s) => isArchivedSubmission(db, s, off)).map((s) => s.id));
  }, [db]);

  // Lookups as maps (not a search per row), and 50 rows at a time.
  const [limit, setLimit] = useState(50);
  const rows = useMemo(() => {
    const testsById = new Map(db.tests.map((t) => [t.id, t]));
    const studentsById = new Map(db.students.map((st) => [st.id, st]));
    return db.submissions
      .filter((sub) => (view === "archive") === archived.has(sub.id))
      .map((sub) => ({ sub, test: testsById.get(sub.testId) ?? null, student: studentsById.get(sub.studentId) ?? null }))
      .filter((r): r is { sub: typeof r.sub; test: NonNullable<typeof r.test>; student: typeof r.student } => r.test !== null)
      .filter((r) => (cohortId ? r.student?.cohortId === cohortId : true))
      .filter((r) => (subjectFilter.length === 0 ? true : subjectFilter.includes(r.test.subject)))
      .filter((r) => (classFilter.length === 0 ? true : r.student?.classIds.some((c) => classFilter.includes(c)) ?? false))
      .filter((r) => (statuses.length === 0 ? true : statuses.includes(r.sub.status)))
      // Worked out once per row here, not several times per row on every render.
      .map((r) => ({ ...r, grade: gradeSubmission(r.test, r.sub), lateWindow: inLateWindow(db, r.sub) }))
      // Anything still needing a grade floats to the top; released work sinks.
      .sort(
        (a, b) =>
          (a.sub.status === "released" ? 1 : 0) - (b.sub.status === "released" ? 1 : 0) ||
          +new Date(b.sub.submittedAt ?? 0) - +new Date(a.sub.submittedAt ?? 0),
      );
  }, [db, cohortId, subjectFilter, classFilter, statuses, view, archived]);

  // Bulk release covers exactly what the filters are showing: every awaiting
  // submission on an all-MCQ test, which needs no human marking.
  const releasable = rows.filter((r) => r.sub.status === "submitted" && isAllMcq(r.test));

  // Ticked rows still on screen (a filter change must not leave hidden ones included).
  const shown = new Set(rows.map((r) => r.sub.id));
  const chosen = picked.filter((id) => shown.has(id));
  // Only fully marked papers that haven't gone out yet. Unmarked written
  // work would reach students as zeros; released ones would notify twice.
  const ready = rows.filter((r) => chosen.includes(r.sub.id) && r.sub.status === "submitted" && isFullyGraded(r.test, r.sub));

  /**
   * Releases each paper. A test that is still open refuses every paper, so
   * after its first refusal the rest of that test are skipped: one message,
   * not one per script.
   */
  function releaseMany(list: typeof rows): number {
    const refused = new Set<string>();
    let out = 0;
    for (const r of list) {
      if (refused.has(r.test.id)) continue;
      if (store.releaseSubmission(r.sub.id)) out++;
      else refused.add(r.test.id);
    }
    return out;
  }

  if (db.tests.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        <PageHeader title="Submissions" />
        <EmptyState icon={<Icon.Inbox />} title="No tests yet" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Submissions"
        subtitle={`${rows.length} submission${rows.length === 1 ? "" : "s"}`}
        actions={releasable.length > 0 ? <Button onClick={() => setBulkOpen(true)}><Icon.Check className="h-4 w-4" /> Release all (MCQ)</Button> : undefined}
      />

      <ArchiveTabs
        view={view}
        onChange={(v) => { setView(v); setPicked([]); }}
        currentLabel="Current"
        currentCount={db.submissions.length - archived.size}
        archiveCount={archived.size}
      />

      <div className="mb-4 space-y-2">
        <FilterChips
          label="Subject"
          options={subjects.map((sub) => ({ value: sub, label: sub }))}
          selected={subjectFilter}
          onChange={setSubjects}
        />
        <FilterChips
          label="Class"
          options={db.classes.map((c) => ({ value: c.id, label: c.name }))}
          selected={classFilter}
          onChange={setClasses}
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

      <BulkBar count={chosen.length} noun="submission" onClear={() => setPicked([])}>
        <Button
          size="sm"
          onClick={() => {
            if (ready.length === 0) {
              toast("Nothing to release: the ticked papers aren't fully marked yet, or are already released.", "info");
              return;
            }
            // Students are told the moment a result goes out, so it is confirmed first.
            setConfirmPicked(true);
          }}
        >
          Release results
        </Button>
      </BulkBar>

      {rows.length === 0 ? (
        <EmptyState icon={<Icon.Inbox />} title="No submissions" message="Nothing matches the current filters." />
      ) : (
        <Card className="overflow-hidden p-0">
          <TableScroll className={tableBox}>
            <Table stickyFirst className={stickyHead}>
              <thead>
                <tr>
                  <Th className="w-10">
                    <RowCheck
                      checked={chosen.length > 0 && chosen.length === rows.length}
                      onChange={(on) => setPicked(on ? rows.map((r) => r.sub.id) : [])}
                      label="Select every row"
                    />
                  </Th>
                  <Th>Student</Th>
                  <Th>Test</Th>
                  <Th className="hidden xl:table-cell">Cohort</Th>
                  <Th className="hidden md:table-cell">Status</Th>
                  <Th className="hidden md:table-cell">Score</Th>
                  <Th className="hidden md:table-cell">Submitted</Th>
                  <Th><span className="max-md:sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map(({ sub, test, student, grade, lateWindow }) => {
                  const cohort = student ? cohortById(db, student.cohortId) : null;
                  return (
                    <tr key={sub.id}>
                      <Td>
                        <RowCheck
                          checked={picked.includes(sub.id)}
                          onChange={(on) => setPicked((prev) => (on ? [...prev, sub.id] : prev.filter((x) => x !== sub.id)))}
                          label={`Select ${student?.username ?? "submission"}`}
                        />
                      </Td>
                      <Td className="font-semibold capitalize">
                        {/* On a phone the actions sit off to the side: the name opens the paper too. */}
                        <Link href={`/admin/grading/${sub.id}`} className="underline-offset-4 hover:underline">
                          {student?.username ?? "Removed student"}
                        </Link>
                      </Td>
                      <Td className="min-w-[8rem] text-ink-2 xl:min-w-[10rem]">
                        {/* On a phone the status and score sit here, so nothing scrolls sideways. */}
                        <Link href={`/admin/grading/${sub.id}`} className="md:pointer-events-none">{test.title}</Link>
                        <span className="block text-xs text-ink-3">{test.subject}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs md:hidden">
                          {sub.status === "released" ? (
                            <span className="font-semibold tabular-nums text-ink">{grade.percent}% · {grade.letter}</span>
                          ) : (
                            <Badge tone="warning">Awaiting</Badge>
                          )}
                          {sub.late && !lateWindow && <span className="font-semibold text-error">late</span>}
                        </span>
                      </Td>
                      <Td className="hidden xl:table-cell">{cohort ? <span className="inline-flex items-center gap-1.5 text-ink-2"><CohortDot color={cohort.color} />{cohort.name}</span> : "No cohort"}</Td>
                      <Td className="hidden md:table-cell">
                        {sub.status === "released" ? <Badge tone="success">Released</Badge> : <Badge tone="warning">Awaiting</Badge>}
                        {sub.autoSubmitted && <span className="ml-1 text-xs text-ink-3">auto</span>}
                        {sub.late &&
                          (lateWindow ? (
                            <span className="ml-1 text-xs text-ink-3">late window</span>
                          ) : (
                            <span className="ml-1 text-xs font-semibold text-error">late</span>
                          ))}
                      </Td>
                      <Td className="hidden whitespace-nowrap font-semibold tabular-nums md:table-cell">{sub.status === "released" ? `${grade.percent}% · ${grade.letter}` : <span className="font-normal text-ink-3">Not yet</span>}</Td>
                      <Td className="hidden min-w-[6.5rem] tabular-nums text-ink-2 md:table-cell xl:whitespace-nowrap">{sub.submittedAt ? formatTimestamp(sub.submittedAt) : "Not yet"}</Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Link href={`/admin/grading/${sub.id}`} className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "max-md:hidden")}>
                            {sub.status === "released" ? "Review" : "Grade"}
                          </Link>
                          <button onClick={() => setDeleteId(sub.id)} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-error-soft hover:text-error" aria-label={`Delete ${student?.username ?? "this"} submission`}>
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
          {rows.length > limit && (
            <div className="flex justify-center border-t border-border p-2">
              <button type="button" onClick={() => setLimit((n) => n + 100)} className="h-11 rounded-full px-5 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
                Show more ({rows.length - limit} left)
              </button>
            </div>
          )}
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
            <Button
              onClick={() => {
                const out = releaseMany(releasable);
                setBulkOpen(false);
                if (out) toast(`${out} result${out === 1 ? "" : "s"} released.`, "success");
              }}
            >
              Release all
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Every question is multiple choice and marked automatically, so results can be released in one click.</p>
      </Modal>

      <Modal
        open={confirmPicked}
        onClose={() => setConfirmPicked(false)}
        title={`Release ${ready.length} result${ready.length === 1 ? "" : "s"}?`}
        description="Each student sees their mark and feedback straight away and gets a notice."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmPicked(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const out = releaseMany(ready);
                const skipped = chosen.length - out;
                setConfirmPicked(false);
                setPicked([]);
                toast(
                  out
                    ? `${out} result${out === 1 ? "" : "s"} released.${skipped ? ` ${skipped} skipped: not fully marked, already released, or the test is still open.` : ""}`
                    : "Nothing released: the test is still open.",
                  out ? "success" : "info",
                );
              }}
            >
              Release
            </Button>
          </>
        }
      >
        {chosen.length > ready.length && (
          <p className="text-sm text-ink-2">
            {chosen.length - ready.length} of the ticked papers {chosen.length - ready.length === 1 ? "is" : "are"} not fully marked or already released, so {chosen.length - ready.length === 1 ? "it stays" : "they stay"} as {chosen.length - ready.length === 1 ? "it is" : "they are"}.
          </p>
        )}
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
        <p className="text-sm text-ink-2">
          {(() => {
            const sub = db.submissions.find((x) => x.id === deleteId);
            const who = db.students.find((x) => x.id === sub?.studentId)?.username;
            const what = db.tests.find((x) => x.id === sub?.testId)?.title;
            return who && what ? `This permanently removes ${displayName(who)}'s submission for ${what}.` : "This permanently removes the student's submission.";
          })()}
        </p>
      </Modal>
    </div>
  );
}
