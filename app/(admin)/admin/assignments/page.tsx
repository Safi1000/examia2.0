"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Assignment } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { archivedCohortIds, startedMs, studentById } from "@/lib/data/selectors";
import { isTestAccount } from "@/lib/display-name";
import { studentHomeworkDue } from "@/lib/portal-messages";
import { uploadAsImages } from "@/lib/cloudinary";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { PageStack, PaperImage } from "@/components/PageStack";
import { PastPaperSheet, classHistoryIds, paperBuilder, type PastPaperBuild } from "@/components/admin/PastPaperSheet";
import { familyOfCode, newSeed, parseId, withSourcesLine, type BuiltQuestion } from "@/lib/paper-builder";
import { Card, Button, Input, Textarea, Select, Label, Badge, Modal, EmptyState, Icon } from "@/components/ui";
import { formatTimestamp, formatWhen, toLocalInput, fromLocalInput } from "@/lib/time";
import { BulkBar, ConfirmBulk, NameList, OneByOne, RowCheck, SelectAll, plural, waLink, type BulkAction, type Step } from "@/components/admin/BulkBar";
import { useSelection } from "@/lib/use-selection";
import { displayName } from "@/lib/display-name";
import { useNow } from "@/hooks/useNow";
import { useActivity } from "@/lib/activity-admin";
import { fmtTime } from "@/lib/activity";
import { nextClassStart, pkDate } from "@/lib/timetable";

type Form = {
  title: string;
  instructions: string;
  attachments: string[];
  dueAt: string;
  cohortId: string;
  classId: string;
  subjectId: string;
};

// A class later today is too soon for homework set now: the deadline is the lesson after it.
const SOON_MS = 12 * 3_600_000;

const blank = (cohortId: string): Form => ({
  title: "",
  instructions: "",
  attachments: [],
  // A week out, which is what "weekly assignment" means in practice.
  dueAt: toLocalInput(new Date(Date.now() + 7 * 86_400_000).toISOString()),
  cohortId,
  classId: "",
  subjectId: "",
});

type Db = ReturnType<typeof useDatabase>;

/** Who a homework was set for (its cohort, and level/subject when set) and hasn't handed in. */
function owedFor(db: Db, a: Assignment, off = archivedCohortIds(db)) {
  const handed = new Set(db.assignmentSubmissions.filter((s) => s.assignmentId === a.id).map((r) => r.studentId));
  return db.students.filter(
    (s) =>
      !off.has(s.cohortId) &&
      // Hamza's own test account never shows as owing homework.
      !isTestAccount(s) &&
      a.cohortId === s.cohortId &&
      // Joined after the deadline: this homework was never theirs to hand in.
      startedMs(db, s, a.classId, a.subjectId) < +new Date(a.dueAt) &&
      (!a.classId || s.classIds.includes(a.classId)) &&
      (!a.subjectId || s.subjectIds.includes(a.subjectId)) &&
      !handed.has(s.id),
  );
}

/** The deadline as the reminder message words it ("Fri 14 Nov, 9:00 pm"). */
const dueWords = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** The time right now, read when an action runs (not while drawing the page). */
const clock = () => Date.now();

export default function AdminAssignmentsPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();
  const nowMs = useNow();

  const [editing, setEditing] = useState<Assignment | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  // The form as it was opened, so closing can ask before throwing away typed work.
  const [formStart, setFormStart] = useState("");
  const [uploading, setUploading] = useState(false);
  // Today's "Homework to reply to" opens straight onto that homework's hand-ins.
  const [openId, setOpenId] = useState<string | null>(null);
  const [papersOpen, setPapersOpen] = useState(false);
  // "Set homework" on a class opens the past paper builder with that level and subject chosen.
  const [papersFor, setPapersFor] = useState<{ classId?: string; subjectId?: string }>({});
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("open");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) setOpenId(id);
    if (q.get("set") === "papers") {
      setPapersFor({ classId: q.get("class") ?? undefined, subjectId: q.get("subject") ?? undefined });
      setPapersOpen(true);
    }
  }, []);
  // With one cohort switched on there is nothing to choose: it is used, and its picker is hidden.
  const activeCohorts = db.cohorts.filter((c) => c.active);
  const soleCohort = activeCohorts.length === 1 ? activeCohorts[0].id : "";
  // The deadline follows the class and subject (their next class) until Hamza sets one himself.
  const [dueTyped, setDueTyped] = useState(false);
  const dueFor = (classId: string, subjectId: string, fallback: string) => {
    const next = classId && subjectId ? nextClassStart(db, classId, subjectId, nowMs + SOON_MS) : null;
    return next ? toLocalInput(new Date(next).toISOString()) : fallback;
  };
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Hand-ins with feedback typed but not sent, so closing the window can ask first.
  const unsent = useRef(new Set<string>());

  // From past papers: the questions' pictures go on a normal homework, with a
  // line naming their sources. Kept here while the form is open, for Swap and Remove.
  const [ppQs, setPpQs] = useState<BuiltQuestion[] | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const urlsOf = (qs: BuiltQuestion[]) => [...new Set(qs.flatMap((q) => q.attachments))];

  function fromPapers(b: PastPaperBuild) {
    const topic = b.topicNames.length > 1 ? `${b.topicNames[0]} and ${b.topicNames.length - 1} more` : (b.topicNames[0] ?? "Past papers");
    setPapersOpen(false);
    setEditing("new");
    // The builder already chose the deadline (the class's next lesson, or the one picked there).
    setDueTyped(true);
    setPpQs(b.questions);
    // Built from past papers is already work worth keeping: any close asks.
    setFormStart("");
    setForm({
      title: `${b.subjectName.replace(/ Studies$/, "")}: ${topic}`,
      instructions: withSourcesLine("", b.questions.map((q) => q.id)),
      attachments: urlsOf(b.questions),
      dueAt: toLocalInput(b.closesAt),
      cohortId: b.cohortId,
      classId: b.classId ?? "",
      subjectId: b.subjectId ?? "",
    });
  }

  /** Puts a new list of past paper questions on the open form (pictures and the sources line). */
  function setPapers(next: BuiltQuestion[]) {
    if (!form || !ppQs) return;
    const old = new Set(urlsOf(ppQs));
    setForm({
      ...form,
      attachments: [...form.attachments.filter((u) => !old.has(u)), ...urlsOf(next)],
      instructions: withSourcesLine(form.instructions, next.map((q) => q.id)),
    });
    setPpQs(next);
  }

  async function swapPaper(q: BuiltQuestion) {
    if (!form || !ppQs) return;
    const family = familyOfCode(parseId(q.id)?.code ?? "");
    if (!family) return;
    setSwapping(q.id);
    try {
      const { question } = await paperBuilder<{ question: BuiltQuestion | null }>({
        action: "swap",
        syllabus: family.syllabus,
        codes: family.codes,
        id: q.id,
        exclude: [...classHistoryIds(db, form.cohortId || null, form.classId || null), ...ppQs.map((x) => x.id)],
        seed: newSeed(),
      });
      if (!question) toast("Every other question on this topic has been set for this class already.");
      else setPapers(ppQs.map((x) => (x.id === q.id ? { ...question, topic: q.topic } : x)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't work. Try again.", "error");
    } finally {
      setSwapping(null);
    }
  }

  const assignments = useMemo(
    () =>
      db.assignments
        .filter((a) => (cohortId ? a.cohortId === cohortId || a.cohortId === null : true))
        .sort((a, b) => +new Date(b.dueAt) - +new Date(a.dueAt)),
    [db.assignments, cohortId],
  );

  // Bulk work on ticked homework (only ever what the cohort filter shows).
  const ids = useMemo(() => assignments.map((a) => a.id), [assignments]);
  const sel = useSelection(ids);
  const chosen = useMemo(() => assignments.filter((a) => sel.isSelected(a.id)), [assignments, sel]);
  const [ask, setAsk] = useState<null | "extend" | "due" | "delete">(null);
  const [bulkDue, setBulkDue] = useState("");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const openHw = chosen.filter((a) => +new Date(a.dueAt) > nowMs);
  const handInsLost = chosen.reduce((n, a) => n + db.assignmentSubmissions.filter((s) => s.assignmentId === a.id).length, 0);
  const bulkDueIso = bulkDue ? fromLocalInput(bulkDue) : null;
  const bulkDueProblem = bulkDueIso && +new Date(bulkDueIso) <= nowMs ? "That time has passed." : null;

  const payloadOf = (a: Assignment) => ({ title: a.title, instructions: a.instructions, attachments: a.attachments, dueAt: a.dueAt, cohortId: a.cohortId, classId: a.classId, subjectId: a.subjectId });
  const undoDue = (before: Assignment[]) => ({
    label: "Undo",
    onClick: () => {
      before.forEach((a) => store.updateAssignment(a.id, payloadOf(a)));
      toast(`Deadline put back on ${plural(before.length, "homework", "homeworks")}.`, "success");
    },
  });

  function runExtend() {
    const at = clock();
    const before = chosen.map((a) => ({ ...a }));
    chosen.forEach((a) => store.updateAssignment(a.id, { ...payloadOf(a), dueAt: new Date(Math.max(at, +new Date(a.dueAt)) + 86_400_000).toISOString() }));
    setAsk(null);
    sel.clear();
    toast(`${plural(before.length, "homework", "homeworks")} given one more day.`, "success", undoDue(before));
  }

  function runDue() {
    if (!bulkDueIso || bulkDueProblem) return;
    const before = chosen.map((a) => ({ ...a }));
    chosen.forEach((a) => store.updateAssignment(a.id, { ...payloadOf(a), dueAt: bulkDueIso }));
    setAsk(null);
    sel.clear();
    setBulkDue("");
    toast(`${plural(before.length, "homework", "homeworks")} now due ${formatWhen(bulkDueIso)}.`, "success", undoDue(before));
  }

  function runDelete() {
    const n = chosen.length;
    chosen.forEach((a) => store.deleteAssignment(a.id));
    setAsk(null);
    sel.clear();
    toast(`${plural(n, "homework", "homeworks")} deleted.`, "success");
  }

  // Before the deadline only, as on each homework: no nudging towards late work.
  function startReminders() {
    if (!openHw.length) return toast("These have all closed. Reminders are only for homework still open.", "info");
    const list: Step[] = openHw.flatMap((a) =>
      owedFor(db, a).map((s) => {
        const message = studentHomeworkDue({ id: s.id, username: s.username, title: a.title, due: dueWords(a.dueAt) });
        const href = waLink(s.phone, message);
        return { id: `${a.id}|${s.id}`, name: displayName(s.username), detail: `${a.title}${s.phone ? ` · ${s.phone}` : ""}`, message, href, missing: href ? undefined : "no student number saved" };
      }),
    );
    if (!list.length) return toast("Everyone has handed these in.", "success");
    setSteps(list);
  }

  const bulkActions: BulkAction[] = [
    ...(openHw.length ? [{ id: "remind", label: "Remind who hasn't handed in", primary: true, run: startReminders }] : []),
    { id: "extend", label: "One more day", primary: !openHw.length, run: () => setAsk("extend") },
    { id: "due", label: "Change deadline", run: () => setAsk("due") },
    { id: "delete", label: "Delete", danger: true, run: () => setAsk("delete") },
  ];

  function openNew() {
    setPpQs(null);
    setEditing("new");
    setDueTyped(false);
    const f = blank(cohortId ?? (soleCohort || activeCohorts[0]?.id) ?? "");
    setFormStart(JSON.stringify(f));
    setForm(f);
  }
  function openEdit(a: Assignment) {
    setPpQs(null);
    setEditing(a);
    const f = {
      title: a.title,
      instructions: a.instructions ?? "",
      attachments: [...a.attachments],
      dueAt: toLocalInput(a.dueAt),
      cohortId: a.cohortId ?? "",
      classId: a.classId ?? "",
      subjectId: a.subjectId ?? "",
    };
    setFormStart(JSON.stringify(f));
    setForm(f);
  }

  function closeForm() {
    if (form && JSON.stringify(form) !== formStart && !window.confirm("Close without saving this homework? What you typed will be lost.")) return;
    setForm(null);
    setEditing(null);
    setPpQs(null);
  }

  function markUnsent(id: string, on: boolean) {
    if (on) unsent.current.add(id);
    else unsent.current.delete(id);
  }

  function closeHandIns() {
    if (unsent.current.size > 0 && !window.confirm("Some feedback is typed but not sent. Close without sending it?")) return;
    unsent.current.clear();
    setOpenId(null);
  }

  async function addFiles(files: File[]) {
    const accepted = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!accepted.length || !form) return;
    setUploading(true);
    try {
      const pages = (await Promise.all(accepted.map((f) => uploadAsImages(f)))).flat();
      setForm((f) => (f ? { ...f, attachments: [...f.attachments, ...pages] } : f));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed. Try again.", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    if (!form) return;
    if (!form.dueAt) return toast("Set a due date.", "error");
    if (!form.cohortId) return toast("Choose a cohort.", "error");
    // Pages still uploading would be left off the homework.
    if (uploading) return toast("The worksheet is still uploading. Save once it has finished.", "error");
    if (editing === "new" && +new Date(fromLocalInput(form.dueAt)) <= Date.now()) return toast("That deadline has already passed. Choose a later one.", "error");
    const payload = {
      // No title typed: it names itself, "Accounting homework, 13 Nov".
      title:
        form.title.trim() ||
        `${(db.subjects.find((x) => x.id === form.subjectId)?.name ?? "").replace(/ Studies$/, "")} homework, ${new Date(nowMs).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short" })}`.trim().replace(/^homework/, "Homework"),
      instructions: form.instructions.trim() || undefined,
      attachments: form.attachments,
      dueAt: fromLocalInput(form.dueAt),
      cohortId: form.cohortId || null,
      classId: form.classId || null,
      subjectId: form.subjectId || null,
    };
    if (editing === "new") store.addAssignment(payload);
    else if (editing) store.updateAssignment(editing.id, payload);
    setEditing(null);
    setForm(null);
    setPpQs(null);
    toast("Assignment saved.", "success");
  }

  const ppUrls = new Set(ppQs ? urlsOf(ppQs) : []);
  const open = openId ? db.assignments.find((a) => a.id === openId) ?? null : null;
  const target = deleteId ? db.assignments.find((a) => a.id === deleteId) ?? null : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <PageHeader
        title="Homework"
        subtitle={`${assignments.length} posted`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPapersOpen(true)}><Icon.Layers className="h-4 w-4" /> From past papers</Button>
            <Button onClick={openNew}><Icon.Plus className="h-4 w-4" /> New homework</Button>
          </>
        }
      />

      {assignments.length === 0 ? (
        <EmptyState
          icon={<Icon.Doc />}
          title="No homework yet"
          message="Post work with a deadline; students hand in photos or a PDF."
          action={<Button onClick={openNew}><Icon.Plus className="h-4 w-4" /> New homework</Button>}
        />
      ) : (
        <div role="group" aria-label="Homework" onKeyDown={sel.listKeyDown}>
        <SelectAll sel={sel} noun="homework" />
        <Card className="divide-y divide-border overflow-hidden p-0">
          {assignments.map((a) => {
            const handIns = db.assignmentSubmissions.filter((s) => s.assignmentId === a.id);
            const overdue = +new Date(a.dueAt) < nowMs;
            const cohort = db.cohorts.find((c) => c.id === a.cohortId);
            const cls = db.classes.find((c) => c.id === a.classId);
            const subj = db.subjects.find((x) => x.id === a.subjectId);
            return (
              <div key={a.id} className="flex items-start gap-3 px-4 py-4 transition-colors hover:bg-white/[0.018]">
                <span className="pt-1">
                  <RowCheck id={a.id} checked={sel.isSelected(a.id)} onToggle={sel.toggle} label={`Select ${a.title}`} />
                </span>
                <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={overdue ? "warning" : "success"}>{overdue ? "Closed" : "Open"}</Badge>
                      <span className="text-sm tabular-nums text-ink-3">Due {formatTimestamp(a.dueAt)}</span>
                    </div>
                    <h3 className="mt-1.5 text-base font-semibold tracking-[-0.01em] text-ink">{a.title}</h3>
                    <p className="mt-0.5 text-sm tabular-nums text-ink-3">
                      {[cohort?.name, cls?.name, subj?.name].filter(Boolean).join(" › ") || "All students"}
                      {" · "}
                      {handIns.length} handed in
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => setOpenId(a.id)}>
                      Hand-ins ({handIns.length})
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(a)}>
                      <Icon.Edit className="h-4 w-4" /> Edit
                    </Button>
                    <button
                      onClick={() => setDeleteId(a.id)}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-error-soft hover:text-error"
                      aria-label={`Delete ${a.title}`}
                    >
                      <Icon.Trash className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
        </div>
      )}

      <BulkBar count={sel.count} onClear={sel.clear} actions={bulkActions} />

      <ConfirmBulk
        open={ask === "extend"}
        onClose={() => setAsk(null)}
        title={`Give ${plural(chosen.length, "homework", "homeworks")} one more day?`}
        description="Each is due a day after its deadline, or a day from now if it has already closed (it opens again)."
        confirmLabel="Give one more day"
        onConfirm={runExtend}
      >
        <NameList names={chosen.map((a) => a.title)} />
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "due"}
        onClose={() => setAsk(null)}
        title={`New deadline for ${plural(chosen.length, "homework", "homeworks")}`}
        description="Pakistan time."
        confirmLabel="Change deadline"
        disabled={!bulkDueIso || !!bulkDueProblem}
        onConfirm={runDue}
      >
        <input
          type="datetime-local"
          value={bulkDue}
          onChange={(e) => setBulkDue(e.target.value)}
          className="h-12 w-full rounded-md border border-border-strong bg-surface px-3 text-base tabular-nums text-ink"
          aria-label="New deadline (Pakistan time)"
          aria-invalid={!!bulkDueProblem}
        />
        {bulkDueProblem && <p role="alert" className="font-medium text-error">{bulkDueProblem}</p>}
        <NameList names={chosen.map((a) => a.title)} />
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "delete"}
        onClose={() => setAsk(null)}
        title={`Delete ${plural(chosen.length, "homework", "homeworks")}?`}
        description={handInsLost ? `Their ${plural(handInsLost, "hand-in")} and your feedback go too. This cannot be undone.` : "This cannot be undone."}
        confirmLabel={`Delete ${plural(chosen.length, "homework", "homeworks")}`}
        danger
        ack={handInsLost ? `I understand ${plural(handInsLost, "student hand-in")} will be deleted for good.` : undefined}
        onConfirm={runDelete}
      >
        <NameList names={chosen.map((a) => a.title)} />
      </ConfirmBulk>

      <OneByOne onClose={() => setSteps(null)} title="Remind who hasn't handed in" steps={steps} />

      {/* Create / edit */}
      <Modal
        open={!!form}
        onClose={closeForm}
        title={editing === "new" ? "New homework" : "Edit homework"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeForm}>Cancel</Button>
            <Button onClick={save} disabled={uploading}>Save</Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Input label="Title (optional)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Left empty, it names itself: Accounting homework, 13 Nov" />
            <Textarea label="Instructions (optional)" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="What the students have to do…" />

            <div>
              <Label htmlFor="hw-due">Deadline (Pakistan time)</Label>
              <input
                id="hw-due"
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => {
                  setDueTyped(true);
                  setForm({ ...form, dueAt: e.target.value });
                }}
                className="h-12 w-full rounded-md border border-border-strong bg-surface px-3 text-base tabular-nums text-ink"
              />
            </div>

            <div className={`grid grid-cols-1 gap-3 ${soleCohort && form.cohortId === soleCohort ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
              {!(soleCohort && form.cohortId === soleCohort) && (
                <Select label="Cohort" value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value })}>
                  {/* An assignment needs a cohort: without one, no student can see it. */}
                  <option value="">Choose a cohort</option>
                  {db.cohorts.filter((c) => c.active || c.id === form.cohortId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
              <Select label="Class" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value, ...(editing === "new" && !dueTyped ? { dueAt: dueFor(e.target.value, form.subjectId, form.dueAt) } : {}) })}>
                <option value="">All classes</option>
                {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select label="Subject" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value, ...(editing === "new" && !dueTyped ? { dueAt: dueFor(form.classId, e.target.value, form.dueAt) } : {}) })}>
                <option value="">All subjects</option>
                {db.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </div>

            {ppQs && (
              <div>
                <Label>Past paper questions ({ppQs.length})</Label>
                {ppQs.length === 0 ? (
                  <p className="text-sm text-ink-3">All removed. Attach a worksheet below, or close and build again.</p>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {ppQs.map((q) => (
                      <li key={q.id} className="flex items-center gap-3 py-2 pl-2 pr-1">
                        <div className="w-16 shrink-0 overflow-hidden rounded border border-border bg-white sm:w-20">
                          <div className="max-h-14 overflow-hidden">
                            <PaperImage url={q.attachments[0]} width={300} alt={`${q.label}, first page`} />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">{q.label}</p>
                          <p className="truncate text-xs text-ink-3">{q.kind === "mcq" ? "Multiple choice" : "Written"} · {q.topic}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void swapPaper(q)}
                          disabled={swapping !== null}
                          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                          aria-label={`Swap ${q.label}`}
                          title="Replace it with another past paper question on the same topic"
                        >
                          <Icon.Refresh className="h-4 w-4" /> <span className="hidden sm:inline">{swapping === q.id ? "Swapping…" : "Swap"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPapers(ppQs.filter((x) => x.id !== q.id))}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-error-soft hover:text-error"
                          aria-label={`Remove ${q.label}`}
                        >
                          <Icon.Close className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div>
              <Label>{ppQs ? "Your own worksheet (optional)" : "Worksheet (optional)"}</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="sr-only"
                onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
                aria-label="Attach a PDF or images"
              />
              {form.attachments.some((u) => !ppUrls.has(u)) && (
                <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {form.attachments.map((url, i) => ppUrls.has(url) ? null : (
                    <li key={url} className="relative">
                      <div className="h-24 w-full overflow-hidden rounded border border-border bg-surface-2">
                        <PaperImage url={url} width={400} alt={`Page ${i + 1}`} className="h-24 w-full object-cover" />
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, attachments: form.attachments.filter((_, idx) => idx !== i) })}
                        aria-label={`Remove page ${i + 1}`}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-paper/85 text-ink-2 before:absolute before:-inset-2.5 before:content-[''] hover:bg-error hover:text-paper"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="secondary" size="sm" type="button" loading={uploading} onClick={() => fileRef.current?.click()}>
                {form.attachments.some((u) => !ppUrls.has(u)) ? "Add more pages" : "Attach PDF or image"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <PastPaperSheet open={papersOpen} onClose={() => setPapersOpen(false)} mode="homework" defaultCohortId={cohortId ?? null} onBuilt={fromPapers} defaultClassId={papersFor.classId} defaultSubjectId={papersFor.subjectId} />

      {/* Hand-ins + feedback */}
      <Modal
        open={!!open}
        onClose={closeHandIns}
        title={open ? open.title : ""}
        description={open ? `Due ${formatTimestamp(open.dueAt)} · feedback only, no marks` : ""}
        size="lg"
      >
        {open && (
          <HandIns assignmentId={open.id} onUnsent={markUnsent} />
        )}
      </Modal>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete this homework?"
        description={target ? `"${target.title}" and every hand-in will be removed.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deleteId) store.deleteAssignment(deleteId); setDeleteId(null); toast("Assignment deleted.", "success"); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This action cannot be undone.</p>
      </Modal>
    </div>
  );
}

function HandIns({ assignmentId, onUnsent }: { assignmentId: string; onUnsent: (id: string, on: boolean) => void }) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const nowMs = useNow();
  // Still waiting for a reply first, oldest hand-in first.
  const rows = db.assignmentSubmissions
    .filter((s) => s.assignmentId === assignmentId)
    .sort((a, b) => Number(!!a.feedback) - Number(!!b.feedback) || a.submittedAt.localeCompare(b.submittedAt));
  const a = db.assignments.find((x) => x.id === assignmentId);
  // Who it was set for (its cohort, and level/subject when set) and hasn't handed in.
  const off = archivedCohortIds(db);
  const owed = a ? owedFor(db, a, off) : [];
  const open = a ? +new Date(a.dueAt) > nowMs : false;
  const nameOf = (u: string) => u.charAt(0).toUpperCase() + u.slice(1);
  const due = a ? dueWords(a.dueAt) : "";

  // Groundwork time on this homework, from blocks started on it. One request for everyone (the
  // activity route sends this month's and last month's per-homework time whatever the start day).
  const [from] = useState(() => pkDate(Date.now()));
  const { data: activity } = useActivity(from, db);
  const focusSecs = (studentId: string) => activity?.[studentId]?.focusHomework?.[assignmentId] ?? 0;
  const focusNote = (studentId: string) => {
    const secs = focusSecs(studentId);
    return secs >= 60 ? <span className="text-xs tabular-nums text-ink-3">{fmtTime(secs)} in Groundwork</span> : null;
  };
  // Everyone it was set for (handed in or not), without Hamza's test account.
  const setFor = [...new Set([...rows.map((r) => r.studentId), ...owed.map((s) => s.id)])].filter((id) => !isTestAccount(studentById(db, id)));
  const used = setFor.filter((id) => focusSecs(id) >= 60);
  const usedSecs = used.reduce((n, id) => n + focusSecs(id), 0);
  // Kept at its height while loading, so the list doesn't jump when the numbers arrive.
  const summary = setFor.length > 0 && (
    <p className="min-h-5 text-sm tabular-nums text-ink-2" aria-live="polite">
      {activity
        ? `${used.length} of ${setFor.length} used Groundwork for this${used.length ? `, ${fmtTime(usedSecs)} in total` : ""}.`
        : "\u00a0"}
    </p>
  );

  const missing = owed.length > 0 && (
    <details className="rounded-md border border-border bg-surface-2/40 px-4 py-3">
      <summary className="cursor-pointer select-none text-sm font-semibold text-ink">Not handed in yet ({owed.length})</summary>
      <ul className="mt-2 divide-y divide-border">
        {owed.map((s) => (
          <li key={s.id} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="text-ink-2">{nameOf(s.username)}</span>
              {focusNote(s.id)}
            </span>
            {/* Before the deadline only: no nudging towards late work. */}
            {open && s.phone && (
              <a
                href={`https://wa.me/${s.phone.replace(/\D/g, "")}?text=${encodeURIComponent(studentHomeworkDue({ id: s.id, username: s.username, title: a!.title, due }))}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-brand hover:underline"
              >
                Remind on WhatsApp
              </a>
            )}
          </li>
        ))}
      </ul>
    </details>
  );

  if (!rows.length)
    return (
      <div className="space-y-3">
        {summary}
        <p className="text-sm italic text-ink-3">Nobody has handed in yet.</p>
        {missing}
      </div>
    );

  return (
    <div className="space-y-5">
      {summary}
      {missing}
      {rows.map((s) => {
        const student = studentById(db, s.studentId);
        return (
          <div key={s.id} className="border-b border-border pb-5 last:border-0 last:pb-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-semibold capitalize text-ink">{student?.username ?? "Unknown"}</span>
              <span className="text-xs text-ink-3">handed in {formatTimestamp(s.submittedAt)}</span>
              {focusNote(s.studentId)}
            </div>
            <PageStack urls={s.fileUrls} label={`${student?.username ?? "Student"}'s work`} />
            <FeedbackBox
              initial={s.feedback ?? ""}
              onDirty={(on) => onUnsent(s.id, on)}
              onSave={(text) => { store.setAssignmentFeedback(s.id, text); onUnsent(s.id, false); toast("Feedback sent.", "success"); }}
            />
          </div>
        );
      })}
    </div>
  );
}

function FeedbackBox({ initial, onSave, onDirty }: { initial: string; onSave: (text: string) => void; onDirty: (dirty: boolean) => void }) {
  const [text, setText] = useState(initial);
  return (
    <div className="mt-3">
      <Textarea
        label="Feedback"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onDirty(e.target.value.trim() !== initial.trim());
        }}
        placeholder="What they did well, what to fix…"
        className="min-h-20"
      />
      <Button size="sm" className="mt-2" disabled={text.trim() === initial.trim()} onClick={() => onSave(text.trim())}>
        Send feedback
      </Button>
    </div>
  );
}
