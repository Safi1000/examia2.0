"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Question } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { liveStatus, submissionsForTest, testById } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { QuestionModal, type QuestionDraft } from "@/components/admin/QuestionModal";
import { ImportBankModal } from "@/components/admin/ImportBankModal";
import { ImportDocModal } from "@/components/admin/ImportDocModal";
import { LateWindowCard } from "@/components/admin/LateWindowCard";
import { AnswerKeyModal } from "@/components/admin/AnswerKeyModal";
import { TestPdfModal } from "@/components/admin/TestPdfModal";
import { Card, CardHeader, CardBody, Button, Input, Select, Badge, Pill, Modal, Icon, EmptyState } from "@/components/ui";
import { formatWhen, fromLocalInput, toLocalInput } from "@/lib/time";
import { useNow } from "@/hooks/useNow";
import { classHistoryIds, paperBuilder, PastPaperPreview } from "@/components/admin/PastPaperSheet";
import { familyOfCode, idsInText, isPastPaper, newSeed, parseId, questionFromBuilt, sourceLabel, withoutSources, type BuiltQuestion } from "@/lib/paper-builder";
import { PaperText } from "@/components/PaperText";

/** The same words the marking screen uses. */
const TYPE_LABEL: Record<Question["type"], string> = { mcq: "Choice", text: "Written", photo: "Photo" };

function stripDraft(d: QuestionDraft): Omit<Question, "id" | "order"> {
  const { subject: _s, ...rest } = d;
  void _s;
  return rest as Omit<Question, "id" | "order">;
}

export default function TestEditorPage() {
  const params = useParams();
  const id = String(params.id);
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const test = testById(db, id);
  const now = useNow();

  // Settings form (local until Save).
  const [form, setForm] = useState(() =>
    test
      ? {
          title: test.title,
          subject: test.subject,
          subjectId: test.subjectId ?? "",
          classId: test.classId ?? "",
          durationMinutes: test.durationMinutes,
          uploadMinutes: test.uploadMinutes,
          cohortId: test.cohortId ?? "",
          opensAt: toLocalInput(test.opensAt),
          closesAt: toLocalInput(test.closesAt),
          testCode: test.testCode,
        }
      : null,
  );

  // Unsaved settings: the browser asks before the tab is closed or reloaded.
  const savedForm = test
    ? JSON.stringify({ title: test.title, subject: test.subject, subjectId: test.subjectId ?? "", classId: test.classId ?? "", durationMinutes: test.durationMinutes, uploadMinutes: test.uploadMinutes, cohortId: test.cohortId ?? "", opensAt: toLocalInput(test.opensAt), closesAt: toLocalInput(test.closesAt), testCode: test.testCode })
    : "";
  const dirty = !!form && JSON.stringify(form) !== savedForm;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    // In-app links (the sidebar, "Tests") do not fire beforeunload, so they
    // are caught here, before Next.js handles the click.
    const onLink = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      if (a.origin !== window.location.origin || a.pathname === window.location.pathname) return;
      if (window.confirm("You have unsaved changes to this test's details. Leave without saving?")) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", onLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", onLink, true);
    };
  }, [dirty]);

  const [qModalOpen, setQModalOpen] = useState(false);
  const [editingQ, setEditingQ] = useState<Question | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [deleteQId, setDeleteQId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Past paper questions: look at one, or swap it for another on the same topic.
  const [viewing, setViewing] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);

  const questions = useMemo(() => (test ? [...test.questions].sort((a, b) => a.order - b.order) : []), [test]);

  if (!test || !form) {
    return (
      <div className="px-4 py-6">
        <PageHeader title="Test not found" back={{ href: "/admin/tests", label: "Tests" }} />
        <EmptyState icon={<Icon.Doc />} title="This test no longer exists" />
      </div>
    );
  }

  // Details can be saved any time; publishing needs at least one question.
  const canSave = form.title.trim().length > 0;
  // Written past paper questions whose marks the paper didn't make certain: typed once here.
  const noMarks = questions.filter((q) => q.marks <= 0).length;
  const canPublish = canSave && questions.length > 0 && noMarks === 0;
  // Scripts already handed in: editing a question now changes their marks.
  const sat = submissionsForTest(db, id).filter((x) => x.status !== "in_progress").length;
  const totalMarks = questions.reduce((n, q) => n + Math.max(0, q.marks), 0);

  async function swap(q: Question) {
    if (!test) return;
    const from = idsInText(q.prompt)[0];
    const family = from ? familyOfCode(parseId(from)?.code ?? "") : null;
    if (!from || !family) return;
    setSwapping(q.id);
    try {
      const exclude = [...classHistoryIds(db, test.cohortId, test.classId), ...questions.flatMap((x) => idsInText(x.prompt))];
      const { question } = await paperBuilder<{ question: BuiltQuestion | null }>({
        action: "swap",
        syllabus: family.syllabus,
        codes: family.codes,
        id: from,
        exclude,
        seed: newSeed(),
      });
      if (!question) {
        toast("Every other question on this topic has been set for this class already.");
        return;
      }
      const before = { ...q };
      const { id: _qid, order: _o, ...was } = before;
      void _qid; void _o;
      store.updateQuestion(id, q.id, questionFromBuilt(question));
      if (viewing === q.id) setViewing(null);
      toast(`Swapped for ${question.label}.`, "success", { label: "Undo", onClick: () => store.updateQuestion(id, q.id, was as Omit<Question, "id" | "order">) });
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't work. Try again.", "error");
    } finally {
      setSwapping(null);
    }
  }

  function setQuestionMarks(q: Question, marks: number) {
    const { id: _qid, order: _o, ...rest } = q;
    void _qid; void _o;
    store.updateQuestion(id, q.id, { ...rest, marks: Math.max(0, Math.min(100, Math.floor(marks) || 0)) } as Omit<Question, "id" | "order">);
  }

  /** Saves the details; false (with the reason shown) if they can't be saved. */
  function saveSettings(quiet = false, override?: { opensAt: string; closesAt: string }): boolean {
    if (!form || !canSave) return false;
    const opens = override?.opensAt ?? form.opensAt;
    const closes = override?.closesAt ?? form.closesAt;
    if (!opens || !closes) {
      toast("Set both an opening and a closing time.", "error");
      return false;
    }
    if (fromLocalInput(closes) <= fromLocalInput(opens)) {
      toast("The closing time must be after the opening time.", "error");
      return false;
    }
    // Whole minutes only (the database stores whole numbers), and the form is
    // set to exactly what was saved, so it does not stay "unsaved" after a
    // trailing space or an emptied minutes box.
    const saved = {
      title: form.title.trim(),
      subject: form.subject || "General",
      subjectId: form.subjectId,
      classId: form.classId,
      durationMinutes: Math.max(1, Math.round(form.durationMinutes) || 1),
      uploadMinutes: Math.max(0, Math.round(form.uploadMinutes) || 0),
      cohortId: form.cohortId,
      opensAt: opens,
      closesAt: closes,
      testCode: form.testCode.trim(),
    };
    store.updateTest(id, {
      ...saved,
      subjectId: saved.subjectId || null,
      classId: saved.classId || null,
      cohortId: saved.cohortId || null,
      opensAt: fromLocalInput(opens),
      closesAt: fromLocalInput(closes),
    });
    setForm(saved);
    if (!quiet) toast("Test saved.", "success");
    return true;
  }

  /** Publish, never into a window that has already closed. */
  function publish(now: number) {
    if (!form) return;
    let override: { opensAt: string; closesAt: string } | undefined;
    if (form.closesAt && new Date(fromLocalInput(form.closesAt)).getTime() <= now) {
      if (!window.confirm("This test's closing time has already passed, so students couldn't sit it. Publish it open from now for 7 days?")) return;
      override = { opensAt: toLocalInput(new Date(now).toISOString()), closesAt: toLocalInput(new Date(now + 7 * 86_400_000).toISOString()) };
      set("opensAt", override.opensAt);
      set("closesAt", override.closesAt);
    }
    if (!saveSettings(true, override)) return;
    store.setTestStatus(id, "active");
    const opensMs = new Date(fromLocalInput(override?.opensAt ?? form.opensAt)).getTime();
    toast(
      opensMs > now
        ? `Published. Students see it from ${formatWhen(new Date(opensMs).toISOString())}.`
        : "Published. Students can see it now.",
      "success",
    );
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...questions];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    store.reorderQuestions(id, next.map((q) => q.id));
  }

  function onDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    const next = [...questions];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    store.reorderQuestions(id, next.map((q) => q.id));
    setDragIndex(null);
  }

  const set = <K extends keyof NonNullable<typeof form>>(k: K, v: NonNullable<typeof form>[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Edit test"
        subtitle={test.title}
        back={{ href: "/admin/tests", label: "Tests" }}
        actions={
          <>
            <Pill>{test.testCode}</Pill>
            {questions.length > 0 && (
              <Button variant="secondary" onClick={() => setPdfOpen(true)}>
                <Icon.Download className="h-4 w-4" /> Download as PDF
              </Button>
            )}
            {test.status !== "draft" && (
              // Give a late student one more day, or reopen a closed test for a day.
              <Button
                variant="secondary"
                onClick={() => {
                  const was = new Date(test.closesAt).getTime();
                  const closed = test.status === "closed" || was <= Date.now();
                  const closesAt = new Date(Math.max(Date.now(), was) + 86_400_000).toISOString();
                  store.updateTest(id, { closesAt, status: "active" });
                  set("closesAt", toLocalInput(closesAt));
                  const when = formatWhen(closesAt);
                  toast(closed ? `Reopened until ${when}.` : `Now closes ${when}.`, "success", {
                    label: "Undo",
                    onClick: () => {
                      store.updateTest(id, { closesAt: test.closesAt, status: test.status });
                      set("closesAt", toLocalInput(test.closesAt));
                    },
                  });
                }}
              >
                {liveStatus(test, now) === "closed" ? "Reopen for 1 day" : "Extend 1 day"}
              </Button>
            )}
            <Button variant={test.status === "draft" ? "secondary" : "primary"} onClick={() => saveSettings()} disabled={!canSave}>Save</Button>
            {test.status === "draft" && (
              <Button
                disabled={!canPublish}
                onClick={() => publish(Date.now())}
              >
                Publish
              </Button>
            )}
          </>
        }
      />
      {test.status === "draft" && (
        <p className="mb-4 rounded-md border border-border bg-surface px-4 py-3 text-sm text-ink-2">
          <span className="font-semibold text-ink">Draft.</span> Students can&apos;t see this test yet. Check the questions, then press Publish.
        </p>
      )}
      {!canPublish && (
        <p className="mb-4 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          {!canSave
            ? "Give the test a title to save it."
            : questions.length === 0
              ? "Add at least one question before publishing."
              : `Type the marks for ${noMarks === 1 ? "1 written question" : `${noMarks} written questions`} below, then publish. The paper didn't show them clearly.`}
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Settings */}
        <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader><h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Details</h2></CardHeader>
          <CardBody className="space-y-4">
            <Input label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} required />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Writing time (min)" type="number" min={1} value={form.durationMinutes} onChange={(e) => set("durationMinutes", Number(e.target.value))} />
              {/* When the writing time ends the paper is hidden and only the
                  upload box is left, for this many more minutes. 0 = off. */}
              <Input
                label="Upload time (min)"
                type="number"
                min={0}
                value={form.uploadMinutes}
                onChange={(e) => set("uploadMinutes", Number(e.target.value))}
                hint={
                  !test.questions.some((q) => q.type === "photo")
                    ? "Only used when the test has a photo question."
                    : form.uploadMinutes > 10
                      ? "That's long: students may keep writing. 3 to 5 minutes is usually enough."
                      : form.uploadMinutes === 0
                        ? "No upload window: photos must be in before the writing time ends. 3 to 5 minutes is usual."
                        : "Paper hides, then this many minutes to photograph and upload. 3 to 5 is usual."
                }
              />
            </div>
            <Input label="Test code" value={form.testCode} onChange={(e) => set("testCode", e.target.value)} />
            <Select
              label="Cohort"
              value={form.cohortId}
              onChange={(e) => {
                set("cohortId", e.target.value);
                set("classId", "");
                set("subjectId", "");
                set("subject", "General");
              }}
            >
              <option value="">Open to all cohorts</option>
              {db.cohorts.filter((c) => c.active || c.id === form.cohortId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            {(() => {
              const cohort = db.cohorts.find((c) => c.id === form.cohortId);
              // A cohort that names no classes or subjects offers all of them (as the
              // past paper builder reads it). The test's own picks always stay listed.
              const classes = cohort ? db.classes.filter((cl) => !cohort.classIds.length || cohort.classIds.includes(cl.id) || cl.id === form.classId) : [];
              const subjects = cohort?.subjectIds.length ? db.subjects.filter((s) => cohort.subjectIds.includes(s.id) || s.id === form.subjectId) : db.subjects;
              return (
                <>
                  {classes.length > 0 && (
                    <Select
                      label="Class"
                      value={form.classId}
                      onChange={(e) => set("classId", e.target.value)}
                    >
                      <option value="">All classes in cohort</option>
                      {classes.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                    </Select>
                  )}
                  <Select
                    label="Subject"
                    value={form.subjectId}
                    onChange={(e) => {
                      const subj = db.subjects.find((s) => s.id === e.target.value);
                      set("subjectId", e.target.value);
                      set("subject", subj?.name ?? "General");
                    }}
                  >
                    <option value="">No subject</option>
                    {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </>
              );
            })()}
            {/* Stacked while the column is narrow (tablet), so the time is not cut off. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div>
                <label htmlFor="test-opens" className="mb-1.5 block text-sm font-semibold text-ink-2">Opens</label>
                <input id="test-opens" type="datetime-local" value={form.opensAt} onChange={(e) => set("opensAt", e.target.value)} className="h-12 w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-base tabular-nums text-ink" />
              </div>
              <div>
                <label htmlFor="test-closes" className="mb-1.5 block text-sm font-semibold text-ink-2">Closes</label>
                <input id="test-closes" type="datetime-local" value={form.closesAt} onChange={(e) => set("closesAt", e.target.value)} className="h-12 w-full min-w-0 rounded-md border border-border-strong bg-surface px-3 text-base tabular-nums text-ink" />
              </div>
            </div>
            <p className="text-xs text-ink-3">
              {test.status === "draft"
                ? "Pakistan time. Goes live when you press Publish; closes on its own at the close time."
                : "Pakistan time. Students see it from the open time; it closes on its own at the close time."}
            </p>
          </CardBody>
        </Card>
        {test.status !== "draft" && <LateWindowCard test={test} />}
        </div>

        {/* Questions */}
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                Questions <span className="tabular-nums text-ink-3">({questions.length})</span>
                {totalMarks > 0 && <span className="ml-2 text-sm font-normal tabular-nums text-ink-3">{totalMarks} mark{totalMarks === 1 ? "" : "s"}</span>}
              </h2>
              <div className="flex flex-wrap gap-2">
                {questions.some((q) => q.type === "mcq") && (
                  <Button variant="secondary" size="sm" onClick={() => setKeyOpen(true)}>
                    <Icon.Check className="h-4 w-4" /> Answer key
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
                  <Icon.Bank className="h-4 w-4" /> Import
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setDocOpen(true)}>
                  <Icon.Doc className="h-4 w-4" /> Paste or upload
                </Button>
                <Button size="sm" variant={questions.length ? "secondary" : "primary"} onClick={() => { setEditingQ(null); setQModalOpen(true); }}>
                  <Icon.Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {sat > 0 && questions.length > 0 && (
              <p className="mb-3 text-sm text-ink-2">
                {sat === 1 ? "1 student has" : `${sat} students have`} already handed this in. Changing or deleting a question changes their marks.
              </p>
            )}
            {questions.length === 0 ? (
              <EmptyState icon={<Icon.Doc />} title="No questions yet" message="Add a question or import from the bank." />
            ) : (
              <ul className="space-y-2">
                {questions.map((q, i) => (
                  <li
                    key={q.id}
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(i)}
                    className="rounded-md border border-border bg-surface p-3"
                  >
                    {/* One line of labels and tools, then the question at full width (roomy on a phone). */}
                    <div className="flex items-start gap-2">
                      <span className="mt-2.5 hidden cursor-grab text-ink-3 sm:block" aria-hidden><Icon.Grip className="h-4 w-4" /></span>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-2">
                        <span className="text-xs font-semibold tabular-nums text-ink-3">Q{i + 1}</span>
                        <Badge tone="neutral">{TYPE_LABEL[q.type]}</Badge>
                        {q.topic.trim() && <Badge tone="neutral" className="max-w-full truncate">{q.topic}</Badge>}
                        <Pill>{q.marks}m</Pill>
                      </div>
                      <div className="-mr-1 flex shrink-0 items-center">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="flex h-11 w-10 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30" aria-label={`Move question ${i + 1} up`}>
                          <Icon.ChevronLeft className="h-4 w-4 rotate-90" />
                        </button>
                        <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} className="flex h-11 w-10 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30" aria-label={`Move question ${i + 1} down`}>
                          <Icon.ChevronRight className="h-4 w-4 rotate-90" />
                        </button>
                        <button onClick={() => { setEditingQ(q); setQModalOpen(true); }} className="flex h-11 w-10 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink" aria-label={`Edit question ${i + 1}`}>
                          <Icon.Edit className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleteQId(q.id)} className="flex h-11 w-10 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-error-soft hover:text-error" aria-label={`Delete question ${i + 1}`}>
                          <Icon.Trash className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="min-w-0 sm:pl-6">
                      {isPastPaper(q) ? (
                        // Past paper: the wording students see (if typed), and the source in small text for Hamza only.
                        <>
                          {withoutSources(q.prompt) && <PaperText text={withoutSources(q.prompt)} className="mt-1.5 line-clamp-3 text-sm text-ink" />}
                          <p className="mt-1 text-xs text-ink-3">
                            {q.type === "mcq" ? (q.options.every((o) => /^[A-D]$/.test(o.trim())) ? "Picture with A to D" : "Typed") : "Pages, photo answer"} · {idsInText(q.prompt).map(sourceLabel).join(", ")}
                          </p>
                        </>
                      ) : q.prompt.trim() ? (
                        <p className="mt-1.5 text-sm text-ink">{q.prompt}</p>
                      ) : (
                        <p className="mt-1.5 text-sm italic text-ink-3">Answer the attached paper</p>
                      )}
                      {q.marks <= 0 && (
                        <label className="mt-2 flex items-center gap-2 text-sm text-ink-2">
                          Marks
                          <input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            placeholder="?"
                            onBlur={(e) => { if (Number(e.target.value) > 0) setQuestionMarks(q, Number(e.target.value)); }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            className="h-11 w-20 rounded-lg border border-warning/50 bg-surface px-3 text-center text-base font-semibold tabular-nums text-ink"
                            aria-label={`Marks for question ${i + 1}`}
                          />
                          <span className="text-xs text-ink-3">from the paper</span>
                        </label>
                      )}
                      {idsInText(q.prompt).length > 0 && (
                        <div className="-ml-2 mt-1 flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setViewing(viewing === q.id ? null : q.id)}
                            aria-expanded={viewing === q.id}
                            className="inline-flex min-h-11 items-center rounded-full px-2 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                          >
                            {viewing === q.id ? "Hide question" : "View question"}
                          </button>
                          <button
                            type="button"
                            onClick={() => void swap(q)}
                            disabled={swapping !== null}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                            title="Replace it with another past paper question on the same topic"
                          >
                            <Icon.Refresh className={`h-4 w-4 ${swapping === q.id ? "animate-spin motion-reduce:animate-none" : ""}`} /> {swapping === q.id ? "Swapping…" : "Swap"}
                          </button>
                        </div>
                      )}
                    </div>
                    {/* The question itself, full width under the row (readable on a phone). */}
                    {/* The question exactly as students will see it. */}
                    {viewing === q.id && (
                      <div className="mt-1 rounded-lg border border-hairline bg-paper/40 p-3 sm:ml-6 sm:p-4">
                        <PastPaperPreview question={q} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <QuestionModal
        // Remount per open/target so the form seeds from `initial` at mount.
        key={`${qModalOpen}-${editingQ?.id ?? "new"}`}
        open={qModalOpen}
        onClose={() => setQModalOpen(false)}
        initial={editingQ ? ({ ...editingQ } as QuestionDraft) : null}
        onSave={(draft) => {
          if (editingQ) store.updateQuestion(id, editingQ.id, stripDraft(draft));
          else store.addQuestion(id, stripDraft(draft));
          setQModalOpen(false);
          toast(editingQ ? "Question updated." : "Question added.", "success");
        }}
        onAddNext={(draft) => {
          store.addQuestion(id, stripDraft(draft));
          toast("Added. Next question.", "success");
        }}
      />

      <AnswerKeyModal
        open={keyOpen}
        onClose={() => setKeyOpen(false)}
        title={test.title}
        code={test.testCode}
        questions={questions}
        onMarkingSheet={() => {
          setKeyOpen(false);
          setPdfOpen(true);
        }}
      />
      {pdfOpen && <TestPdfModal open onClose={() => setPdfOpen(false)} test={test} className={db.classes.find((c) => c.id === test.classId)?.name ?? null} />}

      <ImportBankModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={(ids) => { store.importBankItems(id, ids); toast(`${ids.length} question${ids.length === 1 ? "" : "s"} imported.`, "success"); }}
      />

      {/* Bulk-create from PDF/DOC/DOCX/images. Saves through the same
          store.addQuestion path as manual entry, which stays available. */}
      <ImportDocModal
        open={docOpen}
        onClose={() => setDocOpen(false)}
        onImport={(qs) => {
          qs.forEach((q) => store.addQuestion(id, q));
          toast(`${qs.length} question${qs.length === 1 ? "" : "s"} added.`, "success");
        }}
      />

      <Modal
        open={!!deleteQId}
        onClose={() => setDeleteQId(null)}
        title="Delete question?"
        description={sat > 0 ? `${sat === 1 ? "1 student has" : `${sat} students have`} answered it. Their answer and marks for it go too.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteQId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deleteQId) store.deleteQuestion(id, deleteQId); setDeleteQId(null); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This removes the question from this test only.</p>
      </Modal>
    </div>
  );
}
