"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TestStatus } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter, useStickyFilter } from "@/lib/admin-filter";
import { archivedCohortIds, cohortById, isArchivedTest, liveStatus, testStats } from "@/lib/data/selectors";
import { ArchiveTabs, archiveFromUrl, type ArchiveView } from "@/components/admin/ArchiveTabs";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Badge, Pill, CohortTag, EmptyState, Modal, Icon } from "@/components/ui";
import { FilterChips } from "@/components/admin/FilterChips";
import { BulkBar, RowCheck } from "@/components/admin/BulkBar";
import { fromLocalInput } from "@/lib/time";
import { useNow } from "@/hooks/useNow";
import { buttonClasses } from "@/components/ui/Button";
import { PastPaperSheet, type PastPaperBuild } from "@/components/admin/PastPaperSheet";
import { questionFromBuilt, testMinutes } from "@/lib/paper-builder";

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
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (archiveFromUrl()) setView("archive");
  }, []);
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

  // Worked out once per data change, not again for every row each time a box is ticked.
  const statsById = useMemo(() => new Map(tests.map((t) => [t.id, testStats(db, t)])), [db, tests]);

  // Bulk actions only touch ticked tests that are still on screen: a filter
  // change must not leave hidden tests silently included.
  const shown = useMemo(() => new Set(tests.map((t) => t.id)), [tests]);
  const chosen = picked.filter((id) => shown.has(id));

  // The close date is Pakistan time; it must be in the future and after each test opens.
  const now = useNow();
  const bulkCloseIso = bulkClose ? fromLocalInput(bulkClose) : null;
  const bulkCloseProblem = !bulkCloseIso
    ? null
    : +new Date(bulkCloseIso) <= now
      ? "That time has passed."
      : chosen.some((id) => {
            const t = db.tests.find((x) => x.id === id);
            return t ? +new Date(bulkCloseIso) <= +new Date(t.opensAt) : false;
          })
        ? "That is before a test opens."
        : null;

  // Duplicate: a copy of the test (questions and answers) as a hidden draft, opened to edit.
  const [copying, setCopying] = useState<string | null>(null);
  async function duplicate(id: string) {
    setCopying(id);
    try {
      const copy = await store.duplicateTest(id);
      router.push(`/admin/tests/${copy}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "The copy didn't save. Try again.", "error");
      setCopying(null);
    }
  }

  // One tap, one test: a double click used to make two "Untitled test" drafts.
  const creating = useRef(false);
  function createTest() {
    if (creating.current) return;
    creating.current = true;
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

  // From past papers: a draft test, questions and answers in, opened to check and publish.
  const [papersOpen, setPapersOpen] = useState(false);
  async function fromPapers(b: PastPaperBuild) {
    const topic = b.topicNames.length > 1 ? `${b.topicNames[0]} and ${b.topicNames.length - 1} more` : (b.topicNames[0] ?? "Past papers");
    const id = store.addTest({
      title: `${b.subjectName.replace(/ Studies$/, "")}: ${topic}`,
      subject: b.subjectName,
      subjectId: b.subjectId,
      classId: b.classId,
      durationMinutes: testMinutes(b.questions),
      // Written answers are photographed: a few minutes after the writing time.
      uploadMinutes: b.questions.some((q) => q.kind === "written") ? 5 : 0,
      cohortId: b.cohortId,
      opensAt: b.opensAt,
      closesAt: b.closesAt,
      testCode: `PP-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      status: "draft",
    });
    // Questions only once the test row is saved (they point at it).
    await store.testSaved(id);
    if (!store.getSnapshot().tests.some((t) => t.id === id)) {
      setPapersOpen(false);
      toast("The test didn't save. Try again.", "error");
      return;
    }
    for (const q of b.questions) store.addQuestion(id, questionFromBuilt(q), { bank: false });
    setPapersOpen(false);
    router.push(`/admin/tests/${id}`);
  }

  const target = deleteId ? db.tests.find((t) => t.id === deleteId) : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Tests"
        subtitle={`${tests.length} ${tests.length === 1 ? "test" : "tests"}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPapersOpen(true)}><Icon.Layers className="h-4 w-4" /> From past papers</Button>
            <Button onClick={createTest}><Icon.Plus className="h-4 w-4" /> New test</Button>
          </>
        }
      />

      {/* Admins land here, so this is where what-needs-chasing lives. */}

      <BulkBar count={chosen.length} noun="test" onClear={() => setPicked([])}>
        <label className="flex items-center gap-1.5 text-sm text-ink-2">
          Close date
          <input
            type="datetime-local"
            value={bulkClose}
            onChange={(e) => setBulkClose(e.target.value)}
            className="h-10 rounded-lg border border-border-strong bg-surface px-2.5 text-sm tabular-nums text-ink"
            aria-label="New close date for the selected tests (Pakistan time)"
            aria-invalid={!!bulkCloseProblem}
          />
        </label>
        {bulkCloseProblem && <span role="alert" className="text-sm font-medium text-error">{bulkCloseProblem}</span>}
        <Button
          size="sm"
          disabled={!bulkCloseIso || !!bulkCloseProblem}
          onClick={() => {
            if (!bulkCloseIso || bulkCloseProblem) return;
            const before = chosen.map((id) => ({ id, closesAt: db.tests.find((t) => t.id === id)?.closesAt }));
            chosen.forEach((id) => store.updateTest(id, { closesAt: bulkCloseIso }));
            toast(`Close date changed on ${chosen.length} test${chosen.length === 1 ? "" : "s"}.`, "success", {
              label: "Undo",
              onClick: () => before.forEach((b) => b.closesAt && store.updateTest(b.id, { closesAt: b.closesAt })),
            });
            setPicked([]);
            setBulkClose("");
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
        <Card className="divide-y divide-border overflow-hidden p-0">
          {tests.map((t) => {
            const stats = statsById.get(t.id) ?? testStats(db, t);
            const cohort = cohortById(db, t.cohortId);
            return (
              <div key={t.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 px-4 py-4 transition-colors hover:bg-white/[0.018] xl:grid-cols-[auto_minmax(0,1fr)_19rem_auto] xl:items-center xl:gap-x-5">
                    <span className="pt-0.5 xl:pt-0">
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
                    <h3 className="mt-1.5 text-base font-semibold tracking-[-0.01em] text-ink">
                      <Link href={`/admin/tests/${t.id}`} className="underline-offset-4 hover:underline">{t.title}</Link>
                    </h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm tabular-nums text-ink-3">
                      <span>{t.subject}</span>
                      <span>·</span>
                      <span>{t.questions.length} Q</span>
                      <span>·</span>
                      <span>{t.durationMinutes} min</span>
                      {cohort ? <CohortTag color={cohort.color} name={cohort.name} className="text-xs" /> : <span className="text-xs text-ink-3">All cohorts</span>}
                    </p>
                    </div>

                <div className="col-span-2 grid grid-cols-3 gap-2 border-t border-border pt-3 xl:col-span-1 xl:border-0 xl:pt-0">
                  <Stat label="Submissions" value={String(stats.submissionCount)} />
                  {stats.averagePercent != null ? (
                    <Stat label="Average" value={`${stats.averagePercent}%`} />
                  ) : (
                    <Stat
                      label={stats.pendingCount > 0 ? "Awaiting" : "Average"}
                      value={stats.pendingCount > 0 ? `${stats.pendingCount} to mark` : stats.submissionCount > 0 ? "All marked" : "None yet"}
                    />
                  )}
                  <Stat label="Completion" value={`${stats.completionPercent}%`} />
                </div>

                  <div className="col-span-2 flex items-center justify-end gap-1.5 xl:col-span-1">
                    <Link href={`/admin/tests/${t.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                      <Icon.Edit className="h-4 w-4" /> Edit
                    </Link>
                    <button
                      onClick={() => void duplicate(t.id)}
                      disabled={copying !== null}
                      className="flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50 xl:h-10"
                      aria-label={`Duplicate ${t.title}`}
                      title="Make a copy to edit: same questions and answers, as a hidden draft"
                    >
                      <Icon.Layers className="h-[18px] w-[18px]" />
                      <span className="hidden sm:inline">{copying === t.id ? "Copying…" : "Duplicate"}</span>
                    </button>
                    <button
                      onClick={() => setDeleteId(t.id)}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-error-soft hover:text-error"
                      aria-label={`Delete ${t.title}`}
                    >
                      <Icon.Trash className="h-[18px] w-[18px]" />
                    </button>
                  </div>
              </div>
            );
          })}
        </Card>
      )}

      <PastPaperSheet open={papersOpen} onClose={() => setPapersOpen(false)} mode="test" defaultCohortId={cohortId ?? null} onBuilt={(b) => void fromPapers(b)} />

      {/* Closing stops students handing in, so it's confirmed, and it can be undone. */}
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title={`Close ${chosen.length} test${chosen.length === 1 ? "" : "s"} now?`}
        description="Students who haven't handed in won't be able to any more."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClose(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const before = chosen.map((id) => ({ id, status: db.tests.find((t) => t.id === id)?.status ?? "active" }));
                chosen.forEach((id) => store.updateTest(id, { status: "closed" }));
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
    <div className="xl:text-right">
      <p className="text-[15px] font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-ink-3">{label}</p>
    </div>
  );
}
