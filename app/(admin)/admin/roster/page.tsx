"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Student } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { cohortById } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { isValidPhone, normalizePhone, waDigits } from "@/lib/phone";
import { squareThumbnail } from "@/lib/image";
import { BulkBar, RowCheck } from "@/components/admin/BulkBar";
import { uploadImage } from "@/lib/cloudinary";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Input, Select, Label, CohortDot, Modal, EmptyState, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

function genPassword() {
  const words = ["maple", "river", "amber", "delta", "lunar", "cedar", "north", "ochre"];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}${Math.floor(100 + Math.random() * 900)}`;
}

function ChipToggle({
  items,
  selected,
  onToggle,
  placeholder,
}: {
  items: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-ink-3">{placeholder ?? "None available."}</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors",
              on
                ? "border-brand bg-brand-soft text-brand"
                : "border-border text-ink-2 hover:border-border-strong hover:text-ink",
            )}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

export default function RosterPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [form, setForm] = useState({ username: "", email: "", whatsapp: "", phone: "", photoUrl: "", cohortId: "", tempPassword: "", classIds: [] as string[], subjectIds: [] as string[] });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const square = await squareThumbnail(file);
      const url = await uploadImage(square);
      setForm((f) => ({ ...f, photoUrl: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that photo.");
    } finally {
      setPhotoBusy(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  }
  const [deleting, setDeleting] = useState<Student | null>(null);
  // Bulk move: tick students, then put them all in another class or cohort.
  const [picked, setPicked] = useState<string[]>([]);
  const [bulkClass, setBulkClass] = useState("");
  const [bulkCohort, setBulkCohort] = useState("");

  const students = useMemo(
    () =>
      db.students
        .filter((s) => (cohortId ? s.cohortId === cohortId : true))
        .filter((s) => (search.trim() ? (s.username + (s.email ?? "")).toLowerCase().includes(search.toLowerCase()) : true))
        .sort((a, b) => a.username.localeCompare(b.username)),
    [db.students, cohortId, search],
  );

  // Classes/subjects available for the selected cohort in the form
  const selectedCohort = db.cohorts.find((c) => c.id === form.cohortId);
  const availableClasses = selectedCohort
    ? db.classes.filter((c) => selectedCohort.classIds.includes(c.id))
    : db.classes;
  const availableSubjects = selectedCohort
    ? db.subjects.filter((s) => selectedCohort.subjectIds.includes(s.id))
    : db.subjects;

  function toggleClass(id: string) {
    setForm((f) => ({
      ...f,
      classIds: f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id],
    }));
  }
  function toggleSubject(id: string) {
    setForm((f) => ({
      ...f,
      subjectIds: f.subjectIds.includes(id) ? f.subjectIds.filter((x) => x !== id) : [...f.subjectIds, id],
    }));
  }

  function openNew() {
    setEditing("new");
    setForm({ username: "", email: "", whatsapp: "", phone: "", photoUrl: "", cohortId: cohortId ?? db.cohorts[0]?.id ?? "", tempPassword: genPassword(), classIds: [], subjectIds: [] });
    setError(null);
  }
  function openEdit(s: Student) {
    setEditing(s);
    setForm({ username: s.username, email: s.email ?? "", whatsapp: s.whatsapp ?? "", phone: s.phone ?? "", photoUrl: s.photoUrl ?? "", cohortId: s.cohortId, tempPassword: s.tempPassword ?? "", classIds: [...s.classIds], subjectIds: [...s.subjectIds] });
    setError(null);
  }
  async function save() {
    if (!form.username.trim()) return setError("Username is required.");
    if (!form.cohortId) return setError("Choose a cohort.");
    const exceptId = editing !== "new" && editing ? editing.id : undefined;
    if (store.usernameTaken(form.username, exceptId)) return setError("That username is already taken.");
    // Passwords live in Supabase auth and are never read back, so the field is
    // always blank when editing — blank there means "keep the current one".
    if (editing === "new" && !form.tempPassword.trim()) return setError("Set a temporary password.");

    const whatsapp = form.whatsapp.trim() ? normalizePhone(form.whatsapp) : "";
    if (whatsapp && !isValidPhone(whatsapp)) {
      return setError("Parent's WhatsApp must include the country code, e.g. +923001234567.");
    }
    const phone = form.phone.trim() ? normalizePhone(form.phone) : "";
    if (phone && !isValidPhone(phone)) {
      return setError("Student's number must include the country code, e.g. +923001234567.");
    }

    const fields = {
      username: form.username.trim(),
      email: form.email.trim() || undefined,
      whatsapp: whatsapp || undefined,
      phone: phone || undefined,
      photoUrl: form.photoUrl || undefined,
      cohortId: form.cohortId,
      tempPassword: form.tempPassword.trim(),
      classIds: form.classIds,
      subjectIds: form.subjectIds,
    };
    // Provisioning happens in an edge function, so it can genuinely fail. Wait
    // for it: reporting success and closing the dialog before the round trip
    // finished is what made a failed create look like a mystery.
    setSaving(true);
    try {
      if (editing === "new") {
        await store.addStudent(fields);
        toast("Student added.", "success");
      } else if (editing) {
        await store.updateStudent(editing.id, fields);
        toast("Student updated.", "success");
      }
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this student.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Roster"
        subtitle={`${students.length} students`}
        actions={<Button onClick={openNew} disabled={db.cohorts.length === 0}><Icon.Plus className="h-4 w-4" /> Add student</Button>}
      />

      <BulkBar count={picked.length} noun="student" onClear={() => setPicked([])}>
        <Select value={bulkClass} onChange={(e) => setBulkClass(e.target.value)} className="h-9 w-auto min-w-36" aria-label="Move to class">
          <option value="">Move to class…</option>
          {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={bulkCohort} onChange={(e) => setBulkCohort(e.target.value)} className="h-9 w-auto min-w-36" aria-label="Move to cohort">
          <option value="">Move to cohort…</option>
          {db.cohorts.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Button
          size="sm"
          disabled={!bulkClass && !bulkCohort}
          onClick={() => {
            picked.forEach((id) => {
              const st = db.students.find((x) => x.id === id);
              if (!st) return;
              // Moving class replaces the class list; the cohort is a straight swap.
              if (bulkClass) store.setStudentClasses(id, [bulkClass]);
              if (bulkCohort) void store.updateStudent(id, { cohortId: bulkCohort, username: st.username });
            });
            toast(`${picked.length} students moved.`, "success");
            setPicked([]);
          }}
        >
          Move
        </Button>
      </BulkBar>

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
            const classNames = s.classIds.map((cid) => db.classes.find((x) => x.id === cid)?.name).filter(Boolean);
            const subjectNames = s.subjectIds.map((sid) => db.subjects.find((x) => x.id === sid)?.name).filter(Boolean);
            return (
              <Card key={s.id} className="flex items-start justify-between gap-3 p-4">
                <span className="pt-1">
                  <RowCheck
                    checked={picked.includes(s.id)}
                    onChange={(on) => setPicked((prev) => (on ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                    label={`Select ${s.username}`}
                  />
                </span>
                <Link href={`/admin/roster/${s.id}`} className="flex min-w-0 flex-1 items-start gap-3 hover:opacity-80">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-display text-sm font-bold uppercase text-ink-2">
                    {s.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.photoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      s.username.slice(0, 2)
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold capitalize text-ink">{s.username}</p>
                    <p className="flex items-center gap-1.5 text-sm text-ink-2">
                      {cohort && <CohortDot color={cohort.color} />}
                      <span className="truncate">{cohort?.name ?? "—"}</span>
                      <span className="text-ink-3">· {released} results</span>
                    </p>
                    {(classNames.length > 0 || subjectNames.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {classNames.map((n) => (
                          <span key={n} className="rounded border border-border px-1.5 py-0.5 text-xs text-ink-2">{n}</span>
                        ))}
                        {subjectNames.map((n) => (
                          <span key={n} className="rounded border border-brand/40 bg-brand-soft px-1.5 py-0.5 text-xs text-brand">{n}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
                <div className="flex shrink-0 gap-1">
                  {s.phone && (
                    <a
                      href={`https://wa.me/${waDigits(s.phone)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
                      aria-label={`WhatsApp ${s.username}`}
                      title={`Chat with ${s.username} — ${s.phone}`}
                    >
                      <Icon.Users className="h-4 w-4" />
                    </a>
                  )}
                  {/* Straight to the report dialog, which is where the send lives. */}
                  <Link
                    href={`/admin/roster/${s.id}?report=1`}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded",
                      s.whatsapp ? "text-success hover:bg-success-soft" : "pointer-events-none text-ink-3/40",
                    )}
                    aria-label={s.whatsapp ? `Send ${s.username}'s report on WhatsApp` : `${s.username} has no WhatsApp number`}
                    title={s.whatsapp ? `Send report to ${s.whatsapp}` : "Add the parent's WhatsApp number first"}
                  >
                    <Icon.Megaphone className="h-4 w-4" />
                  </Link>
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
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button loading={saving} onClick={() => void save()}>{editing === "new" ? "Add" : "Save"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Username" value={form.username} onChange={(e) => { setForm({ ...form, username: e.target.value }); setError(null); }} required autoCapitalize="none" />
          <Input label="Email (optional)" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Parent's WhatsApp"
              type="tel"
              inputMode="tel"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              onBlur={(e) => setForm({ ...form, whatsapp: e.target.value.trim() ? normalizePhone(e.target.value) : "" })}
              placeholder="+923001234567"
              hint="Country code required — reports go here."
            />
            <Input
              label="Student's number"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              onBlur={(e) => setForm({ ...form, phone: e.target.value.trim() ? normalizePhone(e.target.value) : "" })}
              placeholder="+923001234567"
              hint="Country code required."
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-2">Profile photo</label>
            <div className="flex items-center gap-3">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-display text-lg font-bold uppercase text-ink-2">
                {form.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  form.username.slice(0, 2) || "—"
                )}
              </span>
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void pickPhoto(e.target.files?.[0])}
                aria-label="Upload a profile photo"
              />
              <Button type="button" variant="secondary" size="sm" loading={photoBusy} onClick={() => photoRef.current?.click()}>
                {form.photoUrl ? "Change photo" : "Upload photo"}
              </Button>
              {form.photoUrl && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, photoUrl: "" })}
                  className="text-sm font-semibold text-ink-3 hover:text-error"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-ink-3">Cropped to a square and shrunk to 512px before upload.</p>
          </div>
          <Select label="Cohort" value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value, classIds: [], subjectIds: [] })}>
            <option value="">Choose…</option>
            {db.cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div>
            <Label>Classes</Label>
            <p className="mb-2 text-xs text-ink-3">
              {form.cohortId ? "Select which classes this student takes." : "Select a cohort first to see available classes."}
            </p>
            <ChipToggle
              items={availableClasses}
              selected={form.classIds}
              onToggle={toggleClass}
              placeholder={form.cohortId ? "No classes assigned to this cohort yet." : ""}
            />
          </div>
          <div>
            <Label>Subjects</Label>
            <p className="mb-2 text-xs text-ink-3">
              {form.cohortId ? "Select which subjects this student takes." : "Select a cohort first to see available subjects."}
            </p>
            <ChipToggle
              items={availableSubjects}
              selected={form.subjectIds}
              onToggle={toggleSubject}
              placeholder={form.cohortId ? "No subjects assigned to this cohort yet." : ""}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-2">
              {editing === "new" ? "Temporary password" : "Reset password (optional)"}
            </label>
            <div className="flex gap-2">
              <Input value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} className="flex-1" aria-label="Temporary password" />
              <Button type="button" variant="secondary" onClick={() => setForm({ ...form, tempPassword: genPassword() })}>Generate</Button>
            </div>
            <p className="mt-1.5 text-xs text-ink-3">
              {editing === "new"
                ? "Share this with the student for their first sign-in."
                : "Leave blank to keep the student's current password."}
            </p>
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
