"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TestStatus } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter, useStickyFilter } from "@/lib/admin-filter";
import { archivedCohortIds, cohortById, isArchivedTest, liveStatus, testStats } from "@/lib/data/selectors";
import { ArchiveTabs, type ArchiveView } from "@/components/admin/ArchiveTabs";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Badge, Pill, CohortTag, EmptyState, Modal, Icon } from "@/components/ui";
import { FilterChips } from "@/components/admin/FilterChips";
import { RemindersPanel } from "@/components/admin/RemindersPanel";
import { BulkBar, RowCheck } from "@/components/admin/BulkBar";
import { fromLocalInput } from "@/lib/time";
import { buttonClasses } from "@/components/ui/Button";

const STATUS_TONE: Record<TestStatus, "neutral" | "success" | "warning"> = {
  draft: "neutral",
  active: "success",
  closed: "warning",
};

export default function AdminTestsPage() {
  const db = useDatabase();
  const store = useStore();
  const router = useRouter();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();

  const [subjectFilter, setSubjects] = useStickyFilter("tests.subject");
  const [statuses, setStatuses] = useStickyFilter("tests.status");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Bulk edit: tick rows, then change them all in one go.
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkClose, setBulkClose] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  const subjects = useMemo(() => Array.from(new Set(db.tests.map((t) => t.subject))).sort(), [db.tests]);

  // Tests for switched-off cohorts live in the archive.
  const [view, setView] = useState<ArchiveView>("current");
  const archived = useMemo(() => {
    const off = archivedCohortIds(db);
    return new Set(db.tests.filter((t) => isArchivedTest(db, t, off)).map((t) => t.id));
  }, [db]);

  const tests = useMemo(() => {
    return db.tests
      .filter((t) => (view === "archive") === archived.has(t.id))
      .filter((t) => (cohortId ? t.cohortId === cohortId || t.cohortId === null : true))
      .filter((t) => (subjectFilter.length === 0 ? true : subjectFilter.includes(t.subject)))
      .filter((t) => (statuses.length === 0 ? true : statuses.includes(liveStatus(t))))
      .sort(
        (a, b) =>
          (liveStatus(a) === "closed" ? 1 : 0) - (liveStatus(b) === "closed" ? 1 : 0) ||
          +new Date(b.createdAt) - +new Date(a.createdAt),
      );
  }, [db.tests, cohortId, subjectFilter, statuses, view, archived]);

  function createTest() {
    const now = Date.now();
    const code = `NEW-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const id = store.addTest({
      title: "Untitled test",
      subject: "General",
      subjectId: null,
      classId: null,
      durationMinutes: 30,
      uploadMinutes: 0,
      cohortId: cohortId ?? null,
      opensAt: new Date(now).toISOString(),
      closesAt: new Date(now + 7 * 86_400_000).toISOString(),
      testCode: code,
      // A new test is a draft: students see nothing until Hamza presses Publish.
      status: "draft",
    });
    router.push(`/admin/tests/${id}`);
  }

  const target = deleteId ? db.tests.find((t) => t.id === deleteId) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Tests"
        subtitle={`${tests.length} ${tests.length === 1 ? "test" : "tests"}`}
        actions={<Button onClick={createTest}><Icon.Plus className="h-4 w-4" /> New test</Button>}
      />

      {/* Admins land here, so this is where what-needs-chasing lives. */}
      <RemindersPanel />

      <BulkBar count={picked.length} noun="test" onClear={() => setPicked([])}>
        <label className="flex items-center gap-1.5 text-sm text-ink-2">
          Close date
          <input
            type="datetime-local"
            value={bulkClose}
            onChange={(e) => setBulkClose(e.target.value)}
            className="h-9 rounded-md border border-border-strong bg-surface px-2 text-sm text-ink"
            aria-label="New close date for the selected tests"
          />
        </label>
        <Button
          size="sm"
          disabled={!bulkClose}
          onClick={() => {
            const closesAt = fromLocalInput(bulkClose);
            picked.forEach((id) => store.updateTest(id, { closesAt }));
            toast(`Close date changed on ${picked.length} tests.`, "success");
            setPicked([]);
          }}
        >
          Apply
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setConfirmClose(true)}
        >
          Close now
        </Button>
      </BulkBar>

      <ArchiveTabs
        view={view}
        onChange={(v) => { setView(v); setPicked([]); }}
        currentLabel="Current"
        currentCount={db.tests.length - archived.size}
        archiveCount={archived.size}
      />

      <div className="mb-4 space-y-2">
        <FilterChips
          label="Subject"
          options={subjects.map((s) => ({ value: s, label: s }))}
          selected={subjectFilter}
          onChange={setSubjects}
        />
        <FilterChips
          label="Status"
          options={[
            { value: "active", label: "Active" },
            { value: "closed", label: "Closed" },
            { value: "draft", label: "Draft" },
          ]}
          selected={statuses}
          onChange={setStatuses}
        />
      </div>

      {tests.length === 0 ? (
        <EmptyState
          icon={<Icon.Doc />}
          title="No tests match"
          message="Adjust your filters, or create a new test to get started."
          action={<Button onClick={createTest}><Icon.Plus className="h-4 w-4" /> New test</Button>}
        />
      ) : (
        <div className="space-y-3">
          {tests.map((t) => {
            const stats = testStats(db, t);
            const cohort = cohortById(db, t.cohortId);
            return (
              <Card key={t.id} ruled className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="pt-1">
                      <RowCheck
                        checked={picked.includes(t.id)}
                        onChange={(on) => setPicked((prev) => (on ? [...prev, t.id] : prev.filter((x) => x !== t.id)))}
                        label={`Select ${t.title}`}
                      />
                    </span>
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill>{t.testCode}</Pill>
                      <Badge tone={STATUS_TONE[liveStatus(t)]} className="capitalize">{liveStatus(t)}</Badge>
                    </div>
                    <h3 className="mt-1.5 text-lg font-bold text-ink">{t.title}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-ink-2">
                      <span>{t.subject}</span>
                      <span>·</span>
                      <span>{t.questions.length} Q</span>
                      <span>·</span>
                      <span>{t.durationMinutes} min</span>
                      {cohort ? <CohortTag color={cohort.color} name={cohort.name} className="text-xs" /> : <span className="text-xs text-ink-3">All cohorts</span>}
                    </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/tests/${t.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      <Icon.Edit className="h-4 w-4" /> Edit
                    </Link>
                    <button
                      onClick={() => setDeleteId(t.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-md text-ink-3 hover:bg-error-soft hover:text-error"
                      aria-label={`Delete ${t.title}`}
                    >
                      <Icon.Trash className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                  <Stat label="Submissions" value={String(stats.submissionCount)} />
                  {stats.averagePercent != null ? (
                    <Stat label="Average" value={`${stats.averagePercent}%`} />
                  ) : (
                    <Stat
                      label={stats.pendingCount > 0 ? "Awaiting" : "Average"}
                      value={stats.pendingCount > 0 ? `${stats.pendingCount} to mark` : "—"}
                    />
                  )}
                  <Stat label="Completion" value={`${stats.completionPercent}%`} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Closing stops students handing in, so it's confirmed, and it can be undone. */}
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title={`Close ${picked.length} test${picked.length === 1 ? "" : "s"} now?`}
        description="Students who haven't handed in won't be able to any more."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClose(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const before = picked.map((id) => ({ id, status: db.tests.find((t) => t.id === id)?.status ?? "active" }));
                picked.forEach((id) => store.updateTest(id, { status: "closed" }));
                setConfirmClose(false);
                setPicked([]);
                toast(`${before.length} test${before.length === 1 ? "" : "s"} closed.`, "success", {
                  label: "Undo",
                  onClick: () => before.forEach((b) => store.updateTest(b.id, { status: b.status })),
                });
              }}
            >
              Close now
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">You can reopen a test, or give one more day, from its edit page.</p>
      </Modal>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete test?"
        description={target ? `"${target.title}" and its submissions will be removed.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleteId) store.deleteTest(deleteId);
                setDeleteId(null);
                toast("Test deleted.", "success");
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-mono text-lg font-bold text-ink">{value}</p>
      <p className="text-xs text-ink-3">{label}</p>
    </div>
  );
}
