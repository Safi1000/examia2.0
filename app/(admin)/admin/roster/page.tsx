"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Student } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { cohortById } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Input, Select, CohortDot, Modal, EmptyState, Icon } from "@/components/ui";

function genPassword() {
  const words = ["maple", "river", "amber", "delta", "lunar", "cedar", "north", "ochre"];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}${Math.floor(100 + Math.random() * 900)}`;
}

export default function RosterPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [form, setForm] = useState({ username: "", email: "", cohortId: "", tempPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);

  const students = useMemo(
    () =>
      db.students
        .filter((s) => (cohortId ? s.cohortId === cohortId : true))
        .filter((s) => (search.trim() ? (s.username + (s.email ?? "")).toLowerCase().includes(search.toLowerCase()) : true))
        .sort((a, b) => a.username.localeCompare(b.username)),
    [db.students, cohortId, search],
  );

  function openNew() {
    setEditing("new");
    setForm({ username: "", email: "", cohortId: cohortId ?? db.cohorts[0]?.id ?? "", tempPassword: genPassword() });
    setError(null);
  }
  function openEdit(s: Student) {
    setEditing(s);
    setForm({ username: s.username, email: s.email ?? "", cohortId: s.cohortId, tempPassword: s.tempPassword });
    setError(null);
  }
  function save() {
    if (!form.username.trim()) return setError("Username is required.");
    if (!form.cohortId) return setError("Choose a cohort.");
    const exceptId = editing !== "new" && editing ? editing.id : undefined;
    if (store.usernameTaken(form.username, exceptId)) return setError("That username is already taken.");
    if (!form.tempPassword.trim()) return setError("Set a temporary password.");
    if (editing === "new") {
      store.addStudent({ username: form.username.trim(), email: form.email.trim() || undefined, cohortId: form.cohortId, tempPassword: form.tempPassword.trim() });
      toast("Student added.", "success");
    } else if (editing) {
      store.updateStudent(editing.id, { username: form.username.trim(), email: form.email.trim() || undefined, cohortId: form.cohortId, tempPassword: form.tempPassword.trim() });
      toast("Student updated.", "success");
    }
    setEditing(null);
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Roster"
        subtitle={`${students.length} students`}
        actions={<Button onClick={openNew} disabled={db.cohorts.length === 0}><Icon.Plus className="h-4 w-4" /> Add student</Button>}
      />

      <div className="mb-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" className="max-w-xs" aria-label="Search students" />
      </div>

      {students.length === 0 ? (
        <EmptyState icon={<Icon.Users />} title="No students" message="Add a student to get started." />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {students.map((s) => {
            const cohort = cohortById(db, s.cohortId);
            const released = db.submissions.filter((x) => x.studentId === s.id && x.status === "released").length;
            return (
              <Card key={s.id} className="flex items-center justify-between gap-3 p-4">
                <Link href={`/admin/roster/${s.id}`} className="flex min-w-0 items-center gap-3 hover:opacity-80">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 font-display text-sm font-bold uppercase text-ink-2">
                    {s.username.slice(0, 2)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold capitalize text-ink">{s.username}</p>
                    <p className="flex items-center gap-1.5 text-sm text-ink-2">
                      {cohort && <CohortDot color={cohort.color} />}
                      <span className="truncate">{cohort?.name ?? "—"}</span>
                      <span className="text-ink-3">· {released} results</span>
                    </p>
                  </div>
                </Link>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => openEdit(s)} className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Edit ${s.username}`}>
                    <Icon.Edit className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleting(s)} className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-error-soft hover:text-error" aria-label={`Delete ${s.username}`}>
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add student" : "Edit student"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>{editing === "new" ? "Add" : "Save"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Username" value={form.username} onChange={(e) => { setForm({ ...form, username: e.target.value }); setError(null); }} required autoCapitalize="none" />
          <Input label="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Select label="Cohort" value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value })}>
            <option value="">Choose…</option>
            {db.cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-2">Temporary password</label>
            <div className="flex gap-2">
              <Input value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} className="flex-1" aria-label="Temporary password" />
              <Button type="button" variant="secondary" onClick={() => setForm({ ...form, tempPassword: genPassword() })}>Generate</Button>
            </div>
            <p className="mt-1.5 text-xs text-ink-3">Share this with the student for their first sign-in.</p>
          </div>
          {error && <p className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete student?"
        description={deleting ? `${deleting.username} and their submissions will be removed.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deleting) store.deleteStudent(deleting.id); setDeleting(null); toast("Student deleted.", "success"); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This action cannot be undone.</p>
      </Modal>
    </div>
  );
}
