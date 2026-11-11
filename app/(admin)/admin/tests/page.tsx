"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TestStatus } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter, useStickyFilter } from "@/lib/admin-filter";
import { archivedCohortIds, cohortById, isArchivedTest, liveStatus, submissionsForTest, testStats } from "@/lib/data/selectors";
import { ArchiveTabs, archiveFromUrl, type ArchiveView } from "@/components/admin/ArchiveTabs";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Badge, Pill, CohortTag, EmptyState, Modal, Icon, Select } from "@/components/ui";
import { FilterChips } from "@/components/admin/FilterChips";
import { BulkBar, ConfirmBulk, NameList, OneByOne, RowCheck, SelectAll, chaseSteps, downloadCsv, outcome, plural, type BulkAction, type Step } from "@/components/admin/BulkBar";
import { useSelection } from "@/lib/use-selection";
import { displayName } from "@/lib/display-name";
import { gradeSubmission } from "@/lib/grading";
import { isFullyGraded } from "@/lib/scoring";
import { formatWhen, fromLocalInput } from "@/lib/time";
import { useNow } from "@/hooks/useNow";
import { buttonClasses } from "@/components/ui/Button";
import { PastPaperSheet, type PastPaperBuild } from "@/components/admin/PastPaperSheet";
import { questionFromBuilt, testMinutes } from "@/lib/paper-builder";

const STATUS_TONE: Record<TestStatus, "neutral" | "success" | "warning"> = {
  draft: "neutral",
  active: "success",
  closed: "warning",
};

/** The time right now, read when an action runs (not while drawing the page). */
const clock = () => Date.now();

export default function AdminTestsPage() {
  const db = useDatabase();
  const store = useStore();
  const router = useRouter();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();

  const [subjectFilter, setSubjects] = useStickyFilter("tests.subject");
  const [statuses, setStatuses] = useStickyFilter("tests.status");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Bulk work: tick rows, then act on them all in one go.
  const [bulkClose, setBulkClose] = useState("");
  const [ask, setAsk] = useState<null | "publish" | "draft" | "extend" | "close-at" | "close" | "release" | "cohort" | "duplicate" | "delete">(null);
  const [bulkCohort, setBulkCohort] = useState("");
  const [steps, setSteps] = useState<Step[] | null>(null);

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

  // Ticked tests: only ever ones the filters show (a filter change drops hidden ones).
  const ids = useMemo(() => tests.map((t) => t.id), [tests]);
  const sel = useSelection(ids);
  const chosen = useMemo(() => tests.filter((t) => sel.isSelected(t.id)), [tests, sel]);

  // The close date is Pakistan time; it must be in the future and after each test opens.
  const now = useNow();
  const bulkCloseIso = bulkClose ? fromLocalInput(bulkClose) : null;
  const bulkCloseProblem = !bulkCloseIso
    ? null
    : +new Date(bulkCloseIso) <= now
      ? "That time has passed."
      : chosen.some((t) => +new Date(bulkCloseIso) <= +new Date(t.opensAt))
        ? "That is before one of these tests opens."
        : null;

  // What each action would touch, worked out from the ticked tests.
  const drafts = chosen.filter((t) => t.status === "draft");
  const live = chosen.filter((t) => t.status !== "draft");
  const running = chosen.filter((t) => liveStatus(t, now) === "active");
  const handedIn = (id: string) => submissionsForTest(db, id).filter((x) => x.status !== "in_progress").length;
  // Only fully marked papers go out: unmarked written work would reach students as zeros.
  const waiting = (t: (typeof chosen)[number]) => submissionsForTest(db, t.id).filter((x) => x.status === "submitted");
  const markedOf = (t: (typeof chosen)[number]) => waiting(t).filter((x) => isFullyGraded(t, x));
  const pending = chosen.filter((t) => waiting(t).length > 0);
  const pendingCount = pending.reduce((n, t) => n + markedOf(t).length, 0);
  const unmarkedCount = pending.reduce((n, t) => n + waiting(t).length - markedOf(t).length, 0);
  const resultsLost = chosen.reduce((n, t) => n + handedIn(t.id), 0);
  const names = chosen.map((t) => t.title);

  /** Why a draft can't go live yet (the same checks as Publish on its edit page). */
  function publishProblem(t: (typeof chosen)[number]) {
    if (!t.title.trim()) return "no title";
    if (t.questions.length === 0) return "no questions yet";
    if (t.questions.some((q) => q.marks <= 0)) return "marks missing on a written question";
    if (+new Date(t.closesAt) <= now) return "its closing time has passed";
    return null;
  }

  const undoTests = (before: { id: string; closesAt: string; status: (typeof chosen)[number]["status"]; cohortId: string | null }[], fields: ("closesAt" | "status" | "cohortId")[]) => ({
    label: "Undo",
    onClick: () => {
      before.forEach((b) => store.updateTest(b.id, Object.fromEntries(fields.map((f) => [f, b[f]]))));
      toast(`Put back on ${plural(before.length, "test")}.`, "success");
    },
  });
  const snapshot = (list: typeof chosen) => list.map((t) => ({ id: t.id, closesAt: t.closesAt, status: t.status, cohortId: t.cohortId }));

  function runPublish() {
    const problems: { name: string; why: string }[] = [];
    let done = 0;
    for (const t of drafts) {
      const why = publishProblem(t);
      if (why) problems.push({ name: t.title, why });
      else {
        store.setTestStatus(t.id, "active");
        done++;
      }
    }
    setAsk(null);
    sel.clear();
    toast(outcome(done, "published", problems, "test"), problems.length ? (done ? "info" : "error") : "success");
  }

  function runDraft() {
    const ok = live.filter((t) => handedIn(t.id) === 0);
    const problems = live.filter((t) => handedIn(t.id) > 0).map((t) => ({ name: t.title, why: "students have handed it in" }));
    const before = snapshot(ok);
    ok.forEach((t) => store.setTestStatus(t.id, "draft"));
    setAsk(null);
    sel.clear();
    toast(outcome(ok.length, "moved back to draft", problems, "test"), problems.length && !ok.length ? "error" : "success", ok.length ? undoTests(before, ["status"]) : undefined);
  }

  /** One more day from now or from the close time, whichever is later; a closed test reopens (as on its edit page). */
  function runExtend() {
    const list = live;
    const before = snapshot(list);
    const at = clock();
    for (const t of list) {
      const was = new Date(t.closesAt).getTime();
      const closed = t.status === "closed" || was <= at;
      store.updateTest(t.id, { closesAt: new Date(Math.max(at, was) + 86_400_000).toISOString(), ...(closed ? { status: "active" as const } : {}) });
    }
    setAsk(null);
    sel.clear();
    toast(`${plural(list.length, "test")} given one more day.`, "success", undoTests(before, ["closesAt", "status"]));
  }

  function runCloseAt() {
    if (!bulkCloseIso || bulkCloseProblem) return;
    const before = snapshot(chosen);
    chosen.forEach((t) => store.updateTest(t.id, { closesAt: bulkCloseIso, ...(t.status === "closed" ? { status: "active" as const } : {}) }));
    setAsk(null);
    sel.clear();
    setBulkClose("");
    toast(`${plural(before.length, "test")} now close ${formatWhen(bulkCloseIso)}.`, "success", undoTests(before, ["closesAt", "status"]));
  }

  function runClose() {
    const before = snapshot(running);
    running.forEach((t) => store.updateTest(t.id, { status: "closed" }));
    setAsk(null);
    sel.clear();
    toast(`${plural(before.length, "test")} closed.`, "success", undoTests(before, ["status"]));
  }

  function runRelease() {
    let done = 0;
    const problems: { name: string; why: string }[] = [];
    for (const t of pending) {
      const marked = markedOf(t);
      const unmarked = waiting(t).length - marked.length;
      if (unmarked) problems.push({ name: `${t.title}: ${plural(unmarked, "paper")}`, why: "not fully marked yet" });
      if (!marked.length) continue;
      // A test still open refuses every paper: one line for the test, not one per paper.
      if (!store.releaseSubmission(marked[0].id)) {
        problems.push({ name: t.title, why: "still open" });
        continue;
      }
      done += 1;
      for (const x of marked.slice(1)) if (store.releaseSubmission(x.id)) done++;
    }
    setAsk(null);
    sel.clear();
    toast(outcome(done, "released", problems, "result"), problems.length ? (done ? "info" : "error") : "success");
  }

  function runCohort() {
    const to = bulkCohort === "all" ? null : bulkCohort;
    const before = snapshot(chosen);
    chosen.forEach((t) => store.updateTest(t.id, { cohortId: to }));
    const name = to ? (db.cohorts.find((c) => c.id === to)?.name ?? "that cohort") : "all cohorts";
    setAsk(null);
    sel.clear();
    setBulkCohort("");
    toast(`${plural(before.length, "test")} now set for ${name}.`, "success", undoTests(before, ["cohortId"]));
  }

  async function runDuplicate() {
    const copies: string[] = [];
    const problems: { name: string; why: string }[] = [];
    for (const t of chosen) {
      try {
        copies.push(await store.duplicateTest(t.id));
      } catch (e) {
        problems.push({ name: t.title, why: e instanceof Error ? e.message.replace(/\.$/, "") : "the copy didn't save" });
      }
    }
    setAsk(null);
    sel.clear();
    toast(
      `${outcome(copies.length, "copied", problems, "test")}${copies.length ? " The copies are hidden drafts at the top." : ""}`,
      problems.length ? (copies.length ? "info" : "error") : "success",
      copies.length
        ? {
            label: "Undo",
            onClick: () => {
              copies.forEach((id) => store.deleteTest(id));
              toast(`${plural(copies.length, "copy", "copies")} removed.`, "success");
            },
          }
        : undefined,
    );
  }

  function runDelete() {
    const n = chosen.length;
    chosen.forEach((t) => store.deleteTest(t.id));
    setAsk(null);
    sel.clear();
    toast(`${plural(n, "test")} deleted, with ${plural(resultsLost, "result")}.`, "success");
  }

  function exportResults() {
    const rows: Record<string, string | number>[] = [];
    for (const t of chosen) {
      for (const sub of submissionsForTest(db, t.id)) {
        if (sub.status === "in_progress") continue;
        const st = db.students.find((x) => x.id === sub.studentId);
        const g = gradeSubmission(t, sub);
        rows.push({
          Test: t.title,
          Code: t.testCode,
          Subject: t.subject,
          Student: st ? displayName(st.username) : "Removed student",
          Username: st?.username ?? "",
          Status: sub.status === "released" ? "Released" : "Awaiting marking",
          "Mark %": sub.status === "released" ? Math.round(g.percent) : "",
          Grade: sub.status === "released" ? g.letter : "",
          "Handed in": sub.submittedAt ? sub.submittedAt.slice(0, 16).replace("T", " ") : "",
        });
      }
    }
    if (!rows.length) return toast("No results yet in the selected tests.", "info");
    downloadCsv(rows, "test-results");
    toast(`Downloaded ${plural(rows.length, "result")} from ${plural(chosen.length, "test")}.`, "success");
  }

  function startChase() {
    const list = chaseSteps(db, live, now);
    if (!list.length) return toast(drafts.length === chosen.length ? "These are drafts: nobody has been set them yet." : "Everyone has handed these in.", "info");
    setSteps(list);
  }

  const actions: BulkAction[] = [
    ...(drafts.length ? [{ id: "publish", label: drafts.length === chosen.length ? "Publish" : `Publish ${plural(drafts.length, "draft")}`, run: () => setAsk("publish") }] : []),
    ...(pending.length ? [{ id: "release", label: "Release results", run: () => setAsk("release") }] : []),
    ...(live.length ? [{ id: "extend", label: "One more day", run: () => setAsk("extend") }] : []),
    { id: "close-at", label: "Change close time", run: () => setAsk("close-at") },
    ...(live.length ? [{ id: "chase", label: "Message who hasn't sat it", run: startChase }] : []),
    { id: "cohort", label: "Set cohort", run: () => setAsk("cohort") },
    ...(running.length ? [{ id: "close", label: "Close now", run: () => setAsk("close") }] : []),
    { id: "duplicate", label: "Duplicate", run: () => setAsk("duplicate") },
    { id: "export", label: "Download results", run: exportResults },
    ...(live.length ? [{ id: "draft", label: "Back to draft", run: () => setAsk("draft") }] : []),
    { id: "delete", label: "Delete", danger: true, run: () => setAsk("delete") },
  ];
  if (actions[0] && !actions[0].danger) actions[0] = { ...actions[0], primary: true };

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


      <ArchiveTabs
        view={view}
        onChange={(v) => { setView(v); sel.clear(); }}
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
        <>
        <div role="group" aria-label="Tests" onKeyDown={sel.listKeyDown}>
        <SelectAll sel={sel} noun="test" />
        <Card className="divide-y divide-border overflow-hidden p-0">
          {tests.map((t) => {
            const stats = statsById.get(t.id) ?? testStats(db, t);
            const cohort = cohortById(db, t.cohortId);
            return (
              <div key={t.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-3 px-4 py-4 transition-colors hover:bg-white/[0.018] xl:grid-cols-[auto_minmax(0,1fr)_19rem_auto] xl:items-center xl:gap-x-5">
                    <span className="pt-0.5 xl:pt-0">
                      <RowCheck id={t.id} checked={sel.isSelected(t.id)} onToggle={sel.toggle} label={`Select ${t.title}`} />
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
        </div>
        </>
      )}

      <BulkBar count={sel.count} onClear={sel.clear} actions={actions} />

      <PastPaperSheet open={papersOpen} onClose={() => setPapersOpen(false)} mode="test" defaultCohortId={cohortId ?? null} onBuilt={(b) => void fromPapers(b)} />

      {/* Every bulk change is confirmed, says how many, and can be undone where the store allows. */}
      <ConfirmBulk
        open={ask === "publish"}
        onClose={() => setAsk(null)}
        title={`Publish ${plural(drafts.length, "draft")}?`}
        description="Students in each test's cohort, level and subject see it at its opening time and get a notice."
        confirmLabel="Publish"
        onConfirm={runPublish}
      >
        <NameList names={drafts.map((t) => t.title)} />
        {drafts.some((t) => publishProblem(t)) && (
          <p>{plural(drafts.filter((t) => publishProblem(t)).length, "draft")} can&apos;t go live yet and will be left as drafts: {drafts.filter((t) => publishProblem(t)).map((t) => `${t.title} (${publishProblem(t)})`).join(", ")}.</p>
        )}
        {chosen.length > drafts.length && <p>{plural(chosen.length - drafts.length, "test")} already published {chosen.length - drafts.length === 1 ? "is" : "are"} left as {chosen.length - drafts.length === 1 ? "it is" : "they are"}.</p>}
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "draft"}
        onClose={() => setAsk(null)}
        title={`Move ${plural(live.length, "test")} back to draft?`}
        description="Students stop seeing them until you publish again."
        confirmLabel="Back to draft"
        onConfirm={runDraft}
      >
        <NameList names={live.map((t) => t.title)} />
        {live.some((t) => handedIn(t.id) > 0) && <p>Tests students have already handed in stay published, so their results are safe.</p>}
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "extend"}
        onClose={() => setAsk(null)}
        title={`Give ${plural(live.length, "test")} one more day?`}
        description="Each closes a day after its close time, or a day from now if it has already closed (it opens again)."
        confirmLabel="Give one more day"
        onConfirm={runExtend}
      >
        <NameList names={live.map((t) => t.title)} />
        {drafts.length > 0 && <p>{plural(drafts.length, "draft")} {drafts.length === 1 ? "is" : "are"} left out: change a draft&apos;s dates with Change close time.</p>}
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "close-at"}
        onClose={() => setAsk(null)}
        title={`New close time for ${plural(chosen.length, "test")}`}
        description="Pakistan time. A closed test opens again until then."
        confirmLabel="Change close time"
        disabled={!bulkCloseIso || !!bulkCloseProblem}
        onConfirm={runCloseAt}
      >
        <input
          type="datetime-local"
          value={bulkClose}
          onChange={(e) => setBulkClose(e.target.value)}
          className="h-12 w-full rounded-md border border-border-strong bg-surface px-3 text-base tabular-nums text-ink"
          aria-label="New close time (Pakistan time)"
          aria-invalid={!!bulkCloseProblem}
        />
        {bulkCloseProblem && <p role="alert" className="font-medium text-error">{bulkCloseProblem}</p>}
        <NameList names={names} />
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "close"}
        onClose={() => setAsk(null)}
        title={`Close ${plural(running.length, "test")} now?`}
        description="Students who haven't handed in won't be able to any more."
        confirmLabel="Close now"
        onConfirm={runClose}
      >
        <NameList names={running.map((t) => t.title)} />
        <p>You can undo this straight after, or give one more day later.</p>
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "release"}
        onClose={() => setAsk(null)}
        title={pendingCount ? `Release ${plural(pendingCount, "result")}?` : "Nothing is ready to release"}
        description={pendingCount ? "Each student sees their mark and feedback straight away and gets a notice. This can't be taken back from here." : undefined}
        confirmLabel="Release"
        disabled={pendingCount === 0}
        onConfirm={runRelease}
      >
        <NameList names={pending.map((t) => t.title)} />
        {unmarkedCount > 0 && <p>{plural(unmarkedCount, "paper")} not fully marked yet {unmarkedCount === 1 ? "stays" : "stay"} back. Mark {unmarkedCount === 1 ? "it" : "them"} first.</p>}
        {pending.some((t) => liveStatus(t, now) === "active") && <p>Tests still open are skipped: results go out once a test has closed.</p>}
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "cohort"}
        onClose={() => setAsk(null)}
        title={`Set the cohort for ${plural(chosen.length, "test")}`}
        description="Published tests appear for that cohort's students straight away."
        confirmLabel="Set cohort"
        disabled={!bulkCohort}
        onConfirm={runCohort}
      >
        <Select label="Cohort" value={bulkCohort} onChange={(e) => setBulkCohort(e.target.value)}>
          <option value="">Choose…</option>
          <option value="all">All cohorts</option>
          {db.cohorts.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <NameList names={names} />
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "duplicate"}
        onClose={() => setAsk(null)}
        title={`Copy ${plural(chosen.length, "test")}?`}
        description="Each copy has the same questions and answers, as a hidden draft. Students see nothing until you publish it."
        confirmLabel="Make copies"
        onConfirm={runDuplicate}
      >
        <NameList names={names} />
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "delete"}
        onClose={() => setAsk(null)}
        title={`Delete ${plural(chosen.length, "test")}?`}
        description={resultsLost ? `Their ${plural(resultsLost, "handed in paper")} and results go too. This cannot be undone.` : "This cannot be undone."}
        confirmLabel={`Delete ${plural(chosen.length, "test")}`}
        danger
        ack={resultsLost ? `I understand ${plural(resultsLost, "student result")} will be deleted for good.` : undefined}
        onConfirm={runDelete}
      >
        <NameList names={names} />
        {live.length > 0 && <p>Students who could see {live.length === 1 ? "it" : "them"} are told the test was cancelled.</p>}
      </ConfirmBulk>

      <OneByOne onClose={() => setSteps(null)} title="Message who hasn't sat it" steps={steps} />

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
