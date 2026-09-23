"use client";

import { useMemo, useRef, useState } from "react";
import type { Assignment } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { studentById } from "@/lib/data/selectors";
import { uploadAsImages } from "@/lib/cloudinary";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { PageStack } from "@/components/PageStack";
import { Card, Button, Input, Textarea, Select, Label, Badge, Modal, EmptyState, Icon } from "@/components/ui";
import { formatTimestamp, toLocalInput, fromLocalInput } from "@/lib/time";
import { useNow } from "@/hooks/useNow";

type Form = {
  title: string;
  instructions: string;
  attachments: string[];
  dueAt: string;
  cohortId: string;
  classId: string;
  subjectId: string;
};

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

export default function AdminAssignmentsPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();
  const nowMs = useNow();

  const [editing, setEditing] = useState<Assignment | "new" | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const assignments = useMemo(
    () =>
      db.assignments
        .filter((a) => (cohortId ? a.cohortId === cohortId || a.cohortId === null : true))
        .sort((a, b) => +new Date(b.dueAt) - +new Date(a.dueAt)),
    [db.assignments, cohortId],
  );

  function openNew() {
    setEditing("new");
    setForm(blank(cohortId ?? db.cohorts[0]?.id ?? ""));
  }
  function openEdit(a: Assignment) {
    setEditing(a);
    setForm({
      title: a.title,
      instructions: a.instructions ?? "",
      attachments: [...a.attachments],
      dueAt: toLocalInput(a.dueAt),
      cohortId: a.cohortId ?? "",
      classId: a.classId ?? "",
      subjectId: a.subjectId ?? "",
    });
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
    if (!form.title.trim()) return toast("Give the assignment a title.", "error");
    const payload = {
      title: form.title.trim(),
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
    toast("Assignment saved.", "success");
  }

  const open = openId ? db.assignments.find((a) => a.id === openId) ?? null : null;
  const target = deleteId ? db.assignments.find((a) => a.id === deleteId) ?? null : null;

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Assignments"
        subtitle={`${assignments.length} posted`}
        actions={<Button onClick={openNew}><Icon.Plus className="h-4 w-4" /> New assignment</Button>}
      />

      {assignments.length === 0 ? (
        <EmptyState
          icon={<Icon.Doc />}
          title="No assignments yet"
          message="Post work with a deadline; students hand in photos or a PDF."
          action={<Button onClick={openNew}><Icon.Plus className="h-4 w-4" /> New assignment</Button>}
        />
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => {
            const handIns = db.assignmentSubmissions.filter((s) => s.assignmentId === a.id);
            const overdue = +new Date(a.dueAt) < nowMs;
            const cohort = db.cohorts.find((c) => c.id === a.cohortId);
            const cls = db.classes.find((c) => c.id === a.classId);
            const subj = db.subjects.find((x) => x.id === a.subjectId);
            return (
              <Card key={a.id} ruled className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={overdue ? "warning" : "success"}>{overdue ? "Closed" : "Open"}</Badge>
                      <span className="text-sm text-ink-2">Due {formatTimestamp(a.dueAt)}</span>
                    </div>
                    <h3 className="mt-1.5 text-lg font-bold text-ink">{a.title}</h3>
                    <p className="mt-0.5 text-sm text-ink-3">
                      {[cohort?.name, cls?.name, subj?.name].filter(Boolean).join(" › ") || "All students"}
                      {" · "}
                      {handIns.length} handed in
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setOpenId(a.id)}>
                      Hand-ins ({handIns.length})
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => openEdit(a)}>
                      <Icon.Edit className="h-4 w-4" /> Edit
                    </Button>
                    <button
                      onClick={() => setDeleteId(a.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-md text-ink-3 hover:bg-error-soft hover:text-error"
                      aria-label={`Delete ${a.title}`}
                    >
                      <Icon.Trash className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit */}
      <Modal
        open={!!form}
        onClose={() => { setForm(null); setEditing(null); }}
        title={editing === "new" ? "New assignment" : "Edit assignment"}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setForm(null); setEditing(null); }}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Week 5 — Partnership accounts" required />
            <Textarea label="Instructions (optional)" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="What the students have to do…" />

            <div>
              <Label>Deadline</Label>
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                className="h-12 w-full rounded-md border border-border-strong bg-surface px-3 text-ink"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Select label="Cohort" value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value })}>
                <option value="">All cohorts</option>
                {db.cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select label="Class" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">All classes</option>
                {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select label="Subject" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                <option value="">All subjects</option>
                {db.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </div>

            <div>
              <Label>Worksheet (optional)</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="sr-only"
                onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
                aria-label="Attach a PDF or images"
              />
              {form.attachments.length > 0 && (
                <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {form.attachments.map((url, i) => (
                    <li key={url} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Page ${i + 1}`} className="h-24 w-full rounded border border-border bg-surface-2 object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, attachments: form.attachments.filter((_, idx) => idx !== i) })}
                        aria-label={`Remove page ${i + 1}`}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-paper/85 text-ink-2 hover:bg-error hover:text-paper"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="secondary" size="sm" type="button" loading={uploading} onClick={() => fileRef.current?.click()}>
                {form.attachments.length ? "Add more pages" : "Attach PDF or image"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Hand-ins + feedback */}
      <Modal
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open ? open.title : ""}
        description={open ? `Due ${formatTimestamp(open.dueAt)} · feedback only, no marks` : ""}
        size="lg"
      >
        {open && (
          <HandIns assignmentId={open.id} />
        )}
      </Modal>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete assignment?"
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

function HandIns({ assignmentId }: { assignmentId: string }) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const rows = db.assignmentSubmissions.filter((s) => s.assignmentId === assignmentId);

  if (!rows.length) return <p className="text-sm italic text-ink-3">Nobody has handed in yet.</p>;

  return (
    <div className="space-y-5">
      {rows.map((s) => {
        const student = studentById(db, s.studentId);
        return (
          <div key={s.id} className="border-b border-border pb-5 last:border-0 last:pb-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-semibold capitalize text-ink">{student?.username ?? "Unknown"}</span>
              <span className="text-xs text-ink-3">handed in {formatTimestamp(s.submittedAt)}</span>
            </div>
            <PageStack urls={s.fileUrls} label={`${student?.username ?? "Student"}'s work`} />
            <FeedbackBox
              initial={s.feedback ?? ""}
              onSave={(text) => { store.setAssignmentFeedback(s.id, text); toast("Feedback sent.", "success"); }}
            />
          </div>
        );
      })}
    </div>
  );
}

function FeedbackBox({ initial, onSave }: { initial: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <div className="mt-3">
      <Textarea
        label="Feedback"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What they did well, what to fix…"
        className="min-h-20"
      />
      <Button size="sm" className="mt-2" disabled={text.trim() === initial.trim()} onClick={() => onSave(text.trim())}>
        Send feedback
      </Button>
    </div>
  );
}
