"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { QuestionBankItem } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { QuestionModal, type QuestionDraft } from "@/components/admin/QuestionModal";
import { Card, Button, Input, Select, Badge, Pill, Modal, EmptyState, Icon } from "@/components/ui";
import { BulkBar, ConfirmBulk, RowCheck, SelectAll, plural, type BulkAction } from "@/components/admin/BulkBar";
import { useSelection } from "@/lib/use-selection";
import { useAdminFilter } from "@/lib/admin-filter";

export default function QuestionBankPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("all");
  const [topic, setTopic] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionBankItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const router = useRouter();
  const { cohortId } = useAdminFilter();
  const [ask, setAsk] = useState<null | "import" | "tag" | "marks" | "delete">(null);
  const [importTestId, setImportTestId] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newMarks, setNewMarks] = useState("");

  const subjects = useMemo(() => Array.from(new Set(db.bank.map((b) => b.subject))).sort(), [db.bank]);
  // Only the topics of the chosen subject, so the menu never offers a dead end.
  const topics = useMemo(
    () => Array.from(new Set(db.bank.filter((b) => subject === "all" || b.subject === subject).map((b) => b.topic))).sort(),
    [db.bank, subject],
  );
  // A topic left over from another subject would show nothing at all.
  const activeTopic = topic !== "all" && topics.includes(topic) ? topic : "all";

  const items = useMemo(() => {
    // Every word must appear somewhere ("partnership goodwill" finds both), spaces ignored at the ends.
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return db.bank
      .filter((b) => (subject === "all" ? true : b.subject === subject))
      .filter((b) => (activeTopic === "all" ? true : b.topic === activeTopic))
      .filter((b) => {
        if (!words.length) return true;
        const hay = `${b.prompt} ${b.topic} ${b.subject}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
  }, [db.bank, subject, activeTopic, q]);

  // A few dozen at a time: a bank of hundreds rendered at once made typing in search lag.
  const [limit, setLimit] = useState(60);

  // Ticked questions: only ever ones the search and menus show.
  const ids = useMemo(() => items.map((b) => b.id), [items]);
  const sel = useSelection(ids);
  const chosen = useMemo(() => items.filter((b) => sel.isSelected(b.id)), [items, sel]);
  const strip = ({ id: _id, ...rest }: QuestionBankItem) => {
    void _id;
    return rest;
  };

  /** Put the questions back as they were (edits only). */
  const undoEdits = (before: QuestionBankItem[]) => ({
    label: "Undo",
    onClick: () => {
      before.forEach((b) => store.updateBankItem(b.id, strip(b)));
      toast(`${plural(before.length, "question")} put back.`, "success");
    },
  });

  // "Start a new test": one draft per tap, even on a double tap.
  const creating = useRef(false);
  async function runImport() {
    if (!importTestId) return;
    let testId = importTestId;
    if (importTestId === "new") {
      if (creating.current) return;
      creating.current = true;
      const subject = [...new Set(chosen.map((b) => b.subject))];
      const now = Date.now();
      testId = store.addTest({
        title: subject.length === 1 ? `${subject[0]}: practice` : "Practice test",
        subject: subject.length === 1 ? subject[0] : "General",
        subjectId: null,
        classId: null,
        durationMinutes: 30,
        uploadMinutes: chosen.some((b) => b.type === "photo") ? 5 : 0,
        cohortId: cohortId ?? null,
        opensAt: new Date(now).toISOString(),
        closesAt: new Date(now + 7 * 86_400_000).toISOString(),
        testCode: `NEW-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        status: "draft",
      });
      // Questions only once the test row is saved (they point at it).
      await store.testSaved(testId);
      creating.current = false;
      if (!store.getSnapshot().tests.some((t) => t.id === testId)) {
        toast("The new test didn't save. Try again.", "error");
        return;
      }
    }
    store.importBankItems(testId, chosen.map((b) => b.id));
    const test = store.getSnapshot().tests.find((t) => t.id === testId);
    toast(`${plural(chosen.length, "question")} added to "${test?.title ?? "the test"}".`, "success");
    sel.clear();
    setAsk(null);
    setImportTestId("");
    if (importTestId === "new") router.push(`/admin/tests/${testId}`);
  }

  function runTag() {
    const topic = newTopic.trim();
    const subj = newSubject.trim();
    if (!topic && !subj) return;
    const before = chosen.map((b) => ({ ...b }));
    chosen.forEach((b) => store.updateBankItem(b.id, { ...strip(b), ...(topic ? { topic } : {}), ...(subj ? { subject: subj } : {}) }));
    toast(`${plural(before.length, "question")} filed under ${[subj, topic].filter(Boolean).join(", ")}.`, "success", undoEdits(before));
    sel.clear();
    setAsk(null);
    setNewTopic("");
    setNewSubject("");
  }

  const marksValue = Number(newMarks);
  const marksOk = newMarks.trim() !== "" && Number.isInteger(marksValue) && marksValue >= 1 && marksValue <= 50;
  function runMarks() {
    if (!marksOk) return;
    const before = chosen.map((b) => ({ ...b }));
    chosen.forEach((b) => store.updateBankItem(b.id, { ...strip(b), marks: marksValue }));
    toast(`${plural(before.length, "question")} now worth ${plural(marksValue, "mark")}.`, "success", undoEdits(before));
    sel.clear();
    setAsk(null);
    setNewMarks("");
  }

  function runDelete() {
    const before = chosen.map((b) => ({ ...b }));
    chosen.forEach((b) => store.deleteBankItem(b.id));
    sel.clear();
    setAsk(null);
    toast(`${plural(before.length, "question")} deleted from the bank.`, "success", {
      label: "Undo",
      onClick: () => {
        before.forEach((b) => store.addBankItem(strip(b)));
        toast(`${plural(before.length, "question")} back in the bank.`, "success");
      },
    });
  }

  const actions: BulkAction[] = [
    { id: "import", label: "Add to a test", primary: true, run: () => setAsk("import") },
    { id: "tag", label: "Set topic or subject", run: () => setAsk("tag") },
    { id: "marks", label: "Set marks", run: () => setAsk("marks") },
    { id: "delete", label: "Delete", danger: true, run: () => setAsk("delete") },
  ];
  const allTopics = useMemo(() => Array.from(new Set(db.bank.map((b) => b.topic).filter((t) => t.trim()))).sort(), [db.bank]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Question bank"
        subtitle={`${db.bank.length} reusable questions`}
        actions={<Button onClick={() => { setEditing(null); setModalOpen(true); }}><Icon.Plus className="h-4 w-4" /> Add question</Button>}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {/* Search and the two menus share one row from tablet width up (each menu
            fills its own row otherwise, which pushed the list down). */}
        <div className="min-w-0 flex-1 basis-full md:basis-64"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search bank" /></div>
        <div className="min-w-0 flex-1 basis-40 md:max-w-56">
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject">
            <option value="all">All subjects</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div className="min-w-0 flex-1 basis-40 md:max-w-56">
          <Select value={activeTopic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
            <option value="all">All topics</option>
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
      </div>


      {items.length === 0 ? (
        <EmptyState icon={<Icon.Bank />} title="No questions found" message="Adjust filters or add a new reusable question." />
      ) : (
        <div role="group" aria-label="Questions" onKeyDown={sel.listKeyDown}>
        <SelectAll sel={sel} noun="question" />
        <Card as="ul" className="divide-y divide-border overflow-hidden p-0">
          {items.slice(0, limit).map((b) => (
            <li key={b.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.018]">
              <div className="pt-0.5"><RowCheck id={b.id} checked={sel.isSelected(b.id)} onToggle={sel.toggle} label={`Select: ${b.prompt.slice(0, 60)}`} /></div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{b.subject}</Badge>
                  {b.topic.trim() && <Badge tone="neutral">{b.topic}</Badge>}
                  <span className="text-xs text-ink-3">{b.type === "mcq" ? "Choice" : b.type === "photo" ? "Photo" : "Written"}</span>
                  <Pill>{b.marks}m</Pill>
                </div>
                <p className="mt-1.5 max-w-[75ch] text-pretty text-sm leading-relaxed text-ink">{b.prompt}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => { setEditing(b); setModalOpen(true); }} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink" aria-label="Edit question">
                  <Icon.Edit className="h-4 w-4" />
                </button>
                <button onClick={() => setDeleteId(b.id)} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-error-soft hover:text-error" aria-label="Delete question">
                  <Icon.Trash className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
          {items.length > limit && (
            <li className="flex justify-center p-2">
              <button type="button" onClick={() => setLimit((n) => n + 100)} className="h-11 rounded-full px-5 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
                Show more ({items.length - limit} left)
              </button>
            </li>
          )}
        </Card>
        </div>
      )}

      <BulkBar count={sel.count} onClear={sel.clear} actions={actions} />

      <QuestionModal
        // Remount per open/target so the form seeds from `initial` at mount.
        key={`${modalOpen}-${editing?.id ?? "new"}`}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        withSubject
        initial={editing ? ({ ...editing } as QuestionDraft) : null}
        onSave={(draft) => {
          const item = draft as Omit<QuestionBankItem, "id">;
          if (editing) store.updateBankItem(editing.id, item);
          else store.addBankItem(item);
          setModalOpen(false);
          toast(editing ? "Question updated." : "Question added to bank.", "success");
        }}
        onAddNext={(draft) => {
          store.addBankItem(draft as Omit<QuestionBankItem, "id">);
          toast("Added to the bank. Next question.", "success");
        }}
      />

      <ConfirmBulk
        open={ask === "import"}
        onClose={() => setAsk(null)}
        title={`Add ${plural(chosen.length, "question")} to a test`}
        description="Each question is copied in. Editing the copy in the test leaves the bank as it is."
        confirmLabel={importTestId === "new" ? "Start the test" : "Add"}
        disabled={!importTestId}
        onConfirm={runImport}
      >
        <Select label="Test" value={importTestId} onChange={(e) => setImportTestId(e.target.value)}>
          <option value="">Choose a test…</option>
          <option value="new">Start a new test with these</option>
          {db.tests.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.testCode}){t.status === "draft" ? ", draft" : ""}</option>)}
        </Select>
        {importTestId === "new" && <p>A hidden draft opens for you to check, then publish.</p>}
        {importTestId && importTestId !== "new" && db.tests.find((t) => t.id === importTestId)?.status !== "draft" && (
          <p>This test is already published: students see the new questions.</p>
        )}
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "tag"}
        onClose={() => setAsk(null)}
        title={`File ${plural(chosen.length, "question")}`}
        description="Leave a box empty to keep what each question has."
        confirmLabel="Save"
        disabled={!newTopic.trim() && !newSubject.trim()}
        onConfirm={runTag}
      >
        <Input label="Topic" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} list="bank-topics" placeholder="e.g. Partnerships" />
        <datalist id="bank-topics">{allTopics.map((t) => <option key={t} value={t} />)}</datalist>
        <Input label="Subject" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} list="bank-subjects" placeholder="e.g. Accounting" />
        <datalist id="bank-subjects">{subjects.map((t) => <option key={t} value={t} />)}</datalist>
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "marks"}
        onClose={() => setAsk(null)}
        title={`Marks for ${plural(chosen.length, "question")}`}
        description="Changes the bank only. Tests that already copied these questions keep their own marks."
        confirmLabel="Set marks"
        disabled={!marksOk}
        onConfirm={runMarks}
      >
        <Input label="Marks for each" type="number" inputMode="numeric" min={1} max={50} value={newMarks} onChange={(e) => setNewMarks(e.target.value)} />
        {newMarks.trim() !== "" && !marksOk && <p role="alert" className="font-medium text-error">A whole number from 1 to 50.</p>}
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "delete"}
        onClose={() => setAsk(null)}
        title={`Delete ${plural(chosen.length, "question")} from the bank?`}
        description="Tests that already copied them keep their copy. You can undo this straight after."
        confirmLabel={`Delete ${plural(chosen.length, "question")}`}
        danger
        onConfirm={runDelete}
      >
        <p className="text-ink-3">{chosen.slice(0, 3).map((b) => `"${b.prompt.slice(0, 50)}${b.prompt.length > 50 ? "…" : ""}"`).join(", ")}{chosen.length > 3 ? ` and ${chosen.length - 3} more` : ""}.</p>
      </ConfirmBulk>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete bank question?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deleteId) store.deleteBankItem(deleteId); setDeleteId(null); toast("Deleted.", "success"); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Tests that already imported it keep their copy.</p>
      </Modal>
    </div>
  );
}
