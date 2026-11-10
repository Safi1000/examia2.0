"use client";

import { useMemo, useState } from "react";
import type { QuestionBankItem } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { QuestionModal, type QuestionDraft } from "@/components/admin/QuestionModal";
import { Card, Button, Input, Select, Badge, Pill, Modal, EmptyState, Icon } from "@/components/ui";
import { RowCheck } from "@/components/admin/BulkBar";

export default function QuestionBankPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("all");
  const [topic, setTopic] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionBankItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importTestId, setImportTestId] = useState("");

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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function runImport() {
    if (!importTestId) return;
    store.importBankItems(importTestId, Array.from(selected));
    const test = db.tests.find((t) => t.id === importTestId);
    toast(`Imported ${selected.size} into "${test?.title ?? "test"}".`, "success");
    setSelected(new Set());
    setImportOpen(false);
    setImportTestId("");
  }

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

      {selected.size > 0 && (
        <div className="sticky top-[4.5rem] z-20 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-strong bg-surface-2/95 px-4 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_28px_-14px_rgba(0,0,0,0.7)] backdrop-blur">
          <span className="text-sm font-semibold tabular-nums text-ink">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button size="sm" onClick={() => setImportOpen(true)}><Icon.Doc className="h-4 w-4" /> Import into test</Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState icon={<Icon.Bank />} title="No questions found" message="Adjust filters or add a new reusable question." />
      ) : (
        <Card as="ul" className="divide-y divide-border overflow-hidden p-0">
          {items.slice(0, limit).map((b) => (
            <li key={b.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.018]">
              <div className="pt-0.5"><RowCheck checked={selected.has(b.id)} onChange={() => toggle(b.id)} label={`Select: ${b.prompt.slice(0, 60)}`} /></div>
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
      )}

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

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import into test"
        description={`Copy ${selected.size} question${selected.size === 1 ? "" : "s"} into a test.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={runImport} disabled={!importTestId}>Import</Button>
          </>
        }
      >
        <Select label="Target test" value={importTestId} onChange={(e) => setImportTestId(e.target.value)}>
          <option value="">Choose a test…</option>
          {db.tests.map((t) => <option key={t.id} value={t.id}>{t.title} ({t.testCode})</option>)}
        </Select>
      </Modal>

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
