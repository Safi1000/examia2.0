"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import type { Student } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { cohortById } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { isValidPhone, normalizePhone, waDigits } from "@/lib/phone";
import { inPersonIds as tagged } from "@/lib/in-person";
import { Checkbox } from "@/components/ui/Choice";
import { squareThumbnail } from "@/lib/image";
import { BulkBar, RowCheck } from "@/components/admin/BulkBar";
import { uploadImage } from "@/lib/cloudinary";
import { PageHeader } from "@/components/admin/PageHeader";
import { ArchiveTabs, archiveFromUrl, type ArchiveView } from "@/components/admin/ArchiveTabs";
import { Card, Button, Input, Select, Label, CohortDot, Modal, EmptyState, Icon, Badge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cld } from "@/lib/cld";
import { LoginDetails } from "@/components/admin/LoginDetails";
import { ImportStudents } from "@/components/admin/ImportStudents";
import { newPassword } from "@/lib/password";
import { fixPhone } from "@/lib/import-students";

const genPassword = newPassword;

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
  const [form, setForm] = useState({ inPerson: false, username: "", email: "", whatsapp: "", phone: "", photoUrl: "", cohortId: "", tempPassword: "", classIds: [] as string[], subjectIds: [] as string[], levelSubjects: {} as Record<string, string[]> });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The just-added student's login, for the ready-made welcome message.
  const [sent, setSent] = useState<{ username: string; password: string; phone?: string; parent?: string; kind?: "welcome" | "reset" | "username" } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [bulk, setBulk] = useState(false);
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

  // Past students (in switched-off cohorts) are kept apart. Tick them and use
  // "Add to cohort" to bring them into a new cohort; they can sign in again.
  const [view, setView] = useState<ArchiveView>("current");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (archiveFromUrl()) setView("archive");
  }, []);
  const off = useMemo(() => new Set(db.cohorts.filter((c) => !c.active).map((c) => c.id)), [db.cohorts]);
  const pastCount = db.students.filter((s) => off.has(s.cohortId)).length;
  // Physical students sit in the normal groups, tagged "In person".
  const inPersonIds = useMemo(() => tagged(db), [db]);
  const [bulkTag, setBulkTag] = useState<"" | "in" | "out">("");
  const [mode, setMode] = useState<"all" | "online" | "inperson">("all");

  const students = useMemo(
    () =>
      db.students
        .filter((s) => (view === "archive") === off.has(s.cohortId))
        .filter((s) => (cohortId ? s.cohortId === cohortId : true))
        .filter((s) => (mode === "all" ? true : (mode === "inperson") === inPersonIds.has(s.id)))
        .filter((s) => (search.trim() ? `${s.username} ${s.email ?? ""} ${s.phone ?? ""} ${s.whatsapp ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()) : true))
        .sort((a, b) => a.username.localeCompare(b.username)),
    [db.students, cohortId, search, view, off, mode, inPersonIds],
  );

  // Classes/subjects available for the selected cohort in the form
  const selectedCohort = db.cohorts.find((c) => c.id === form.cohortId);
  // Every level, the cohort's own first: a student can also take a second level (AS and A2 together).
  const availableClasses = [...db.classes].sort(
    (a, b) => Number(!selectedCohort?.classIds.includes(a.id)) - Number(!selectedCohort?.classIds.includes(b.id)),
  );
  const twoLevels = form.classIds.length > 1;
  const availableSubjects = selectedCohort?.subjectIds.length
    ? db.subjects.filter((s) => selectedCohort.subjectIds.includes(s.id))
    : db.subjects;

  function toggleClass(id: string) {
    setForm((f) => {
      const classIds = f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id];
      // Each level keeps its own subjects; one already picked carries over to the first level.
      const levelSubjects: Record<string, string[]> = {};
      for (const c of classIds) levelSubjects[c] = f.levelSubjects[c] ?? (f.classIds.includes(c) ? f.subjectIds : []);
      // Back to one level: its subjects are simply theirs.
      const subjectIds = classIds.length === 1 ? (levelSubjects[classIds[0]] ?? []) : [...new Set(Object.values(levelSubjects).flat())];
      return { ...f, classIds, levelSubjects, subjectIds };
    });
  }
  function toggleLevelSubject(classId: string, id: string) {
    setForm((f) => {
      const now = f.levelSubjects[classId] ?? [];
      const levelSubjects = { ...f.levelSubjects, [classId]: now.includes(id) ? now.filter((x) => x !== id) : [...now, id] };
      return { ...f, levelSubjects, subjectIds: [...new Set(f.classIds.flatMap((c) => levelSubjects[c] ?? []))] };
    });
  }
  function toggleSubject(id: string) {
    setForm((f) => ({
      ...f,
      subjectIds: f.subjectIds.includes(id) ? f.subjectIds.filter((x) => x !== id) : [...f.subjectIds, id],
    }));
  }

  function openNew() {
    setEditing("new");
    setForm({ inPerson: false, username: "", email: "", whatsapp: "", phone: "", photoUrl: "", cohortId: cohortId ?? db.cohorts[0]?.id ?? "", tempPassword: genPassword(), classIds: [], subjectIds: [], levelSubjects: {} });
    setError(null);
  }
  function openEdit(s: Student) {
    setEditing(s);
    setForm({ inPerson: inPersonIds.has(s.id), username: s.username, email: s.email ?? "", whatsapp: s.whatsapp ?? "", phone: s.phone ?? "", photoUrl: s.photoUrl ?? "", cohortId: s.cohortId, tempPassword: "", classIds: [...s.classIds], subjectIds: [...s.subjectIds], levelSubjects: Object.fromEntries(s.classIds.map((c) => [c, [...(s.levelSubjects?.[c] ?? s.subjectIds)]])) });
    setError(null);
  }
  async function save() {
    if (!form.username.trim()) return setError("Username is required.");
    if (!form.cohortId) return setError("Choose a cohort.");
    // Tests, notes and the timetable reach students through their level and subjects.
    if (db.classes.length && form.classIds.length === 0) return setError("Pick their level, so the right tests, notes and classes reach them.");
    if (db.subjects.length && form.subjectIds.length === 0) return setError("Pick at least one subject.");
    if (twoLevels && db.subjects.length) {
      const empty = form.classIds.find((c) => !form.levelSubjects[c]?.length);
      if (empty) return setError(`Pick their ${db.classes.find((c) => c.id === empty)?.name ?? "second level"} subjects too.`);
    }
    const exceptId = editing !== "new" && editing ? editing.id : undefined;
    if (store.usernameTaken(form.username, exceptId)) return setError("That username is already taken.");
    // Passwords live in Supabase auth and are never read back, so the field is
    // always blank when editing — blank there means "keep the current one".
    if (editing === "new" && !form.tempPassword.trim()) return setError("Set a temporary password.");
    if (form.tempPassword.trim() && form.tempPassword.trim().length < 8) return setError("Passwords need at least 8 characters.");
    const nameChanged = editing === "new" || (editing && editing.username !== form.username.trim());
    if (nameChanged && !/^[a-z0-9._-]{3,30}$/i.test(form.username.trim())) {
      return setError("Usernames: 3 to 30 letters or numbers, no spaces (dots and dashes are fine).");
    }

    // 0300 1234567 and 92300… are tidied into +92300…, same as Import.
    // In-person students keep no numbers.
    const noNumbers = form.inPerson;
    const whatsapp = !noNumbers && form.whatsapp.trim() ? (fixPhone(form.whatsapp) ?? "") : "";
    if (whatsapp && !isValidPhone(whatsapp)) {
      return setError("Parent's WhatsApp must include the country code, e.g. +923001234567.");
    }
    const phone = !noNumbers && form.phone.trim() ? (fixPhone(form.phone) ?? "") : "";
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
      // Two levels: the subjects at each. One level: nothing extra (cleared if they had two before).
      ...(twoLevels
        ? { levelSubjects: Object.fromEntries(form.classIds.map((c) => [c, form.levelSubjects[c] ?? []])) }
        : editing !== "new" && editing?.levelSubjects
          ? { levelSubjects: {} }
          : {}),
    };
    // Provisioning happens in an edge function, so it can genuinely fail. Wait
    // for it: reporting success and closing the dialog before the round trip
    // finished is what made a failed create look like a mystery.
    setSaving(true);
    try {
      if (editing === "new") {
        const id = await store.addStudent(fields);
        if (form.inPerson) store.setInPerson(id, true);
        // Straight into the ready-made message with their login.
        setSent({ username: fields.username, password: fields.tempPassword, phone: fields.phone, parent: fields.whatsapp });
      } else if (editing) {
        await store.updateStudent(editing.id, fields);
        store.setInPerson(editing.id, form.inPerson);
        // A new password: send it. Only a new username: send just that, the password stays.
        if (fields.tempPassword) setSent({ username: fields.username, password: fields.tempPassword, phone: fields.phone, parent: fields.whatsapp, kind: "reset" });
        else if (editing.username !== fields.username) setSent({ username: fields.username, password: "", phone: fields.phone, parent: fields.whatsapp, kind: "username" });
        else toast("Student updated. Their login hasn't changed.", "success");
      }
      if (fields.levelSubjects && store.levelsSaveFailed) toast("Saved, but the subjects for each level didn't save. Open the student and save again.", "error");
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this student.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      {bulk && <ImportStudents open onClose={() => setBulk(false)} defaultCohort={cohortId ?? db.cohorts.find((c) => c.active)?.id ?? ""} />}
      {sent && (
        <LoginDetails open kind={sent.kind ?? "welcome"} onClose={() => setSent(null)} username={sent.username} password={sent.password} phone={sent.phone} parent={sent.parent} />
      )}
      <PageHeader
        title="Roster"
        subtitle={`${students.length} students`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setBulk(true)} disabled={db.cohorts.length === 0}>Import students</Button>
            <Button onClick={openNew} disabled={db.cohorts.length === 0}><Icon.Plus className="h-4 w-4" /> Add student</Button>
          </>
        }
      />

      <BulkBar count={picked.length} noun="student" onClear={() => setPicked([])}>
        <Select value={bulkClass} onChange={(e) => setBulkClass(e.target.value)} className="h-9 w-auto min-w-36" aria-label="Set level to">
          <option value="">Set level to… (replaces their level)</option>
          {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={bulkCohort} onChange={(e) => setBulkCohort(e.target.value)} className="h-9 w-auto min-w-36" aria-label="Move to cohort">
          <option value="">{view === "archive" ? "Add to cohort…" : "Move to cohort…"}</option>
          {db.cohorts.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={bulkTag} onChange={(e) => setBulkTag(e.target.value as "" | "in" | "out")} className="h-9 w-auto min-w-36" aria-label="Tag as">
          <option value="">Tag as…</option>
          <option value="in">In person</option>
          <option value="out">Online</option>
        </Select>
        <Button
          size="sm"
          disabled={!bulkClass && !bulkCohort && !bulkTag}
          onClick={async () => {
            // Wait for every save, then say how it went (never "moved" before it is).
            const results = await Promise.allSettled(
              picked.map(async (id) => {
                const st = db.students.find((x) => x.id === id);
                if (!st) return;
                // Moving class replaces the class list; the cohort is a straight swap.
                if (bulkClass) await store.setStudentClasses(id, [bulkClass]);
                if (bulkCohort) await store.updateStudent(id, { cohortId: bulkCohort, username: st.username });
                if (bulkTag) store.setInPerson(id, bulkTag === "in");
              }),
            );
            const failed = results.filter((r) => r.status === "rejected").length;
            const ok = picked.length - failed;
            if (failed) toast(`${failed} couldn't be moved. Try them again.`, "error");
            if (ok)
              toast(
                view === "archive" && bulkCohort
                  ? `${ok} past student${ok === 1 ? "" : "s"} added. They can sign in again.`
                  : `${ok} student${ok === 1 ? "" : "s"} ${bulkClass || bulkCohort ? "moved" : "updated"}.`,
                "success",
              );
            setPicked([]);
            setBulkTag("");
          }}
        >
          Apply
        </Button>
      </BulkBar>

      {/* Tests, notes and assignments reach students through their level and subjects. */}
      {(() => {
        const unset = db.students.filter((s) => !off.has(s.cohortId) && (!s.classIds.length || !s.subjectIds.length));
        if (!unset.length || !db.classes.length) return null;
        return (
          <div className="mb-4 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-ink">
            {unset.length === 1 ? "1 student has" : `${unset.length} students have`} no level or subjects set, so subject tests, notes and assignments
            don&apos;t reach them. Tap a name to pick them:{" "}
            {unset.slice(0, 12).map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <button type="button" onClick={() => openEdit(s)} className="font-semibold capitalize text-brand hover:underline">
                  {s.username}
                </button>
              </span>
            ))}
            {unset.length > 12 && ` and ${unset.length - 12} more`}.
          </div>
        );
      })()}

      <ArchiveTabs
        view={view}
        onChange={(v) => { setView(v); setPicked([]); }}
        currentLabel="Current students"
        archiveLabel="Past students"
        currentCount={db.students.length - pastCount}
        archiveCount={pastCount}
      />
      {view === "archive" && (
        <p className="mb-4 text-sm text-ink-2">
          Students from switched-off cohorts. Tick the ones coming back, then choose a cohort in the bar to add them.
          Their old tests and marks stay in the archive.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" className="max-w-xs" aria-label="Search students" />
        {inPersonIds.size > 0 && (
          <div role="group" aria-label="Show students" className="inline-flex rounded-full border border-border bg-surface p-1">
            {([["all", "All"], ["online", "Online"], ["inperson", "In person"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={mode === k}
                onClick={() => setMode(k)}
                className={cn(
                  "h-9 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                  mode === k ? "bg-brand text-on-brand" : "text-ink-2 hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
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
            const nameOf = (sid: string) => db.subjects.find((x) => x.id === sid)?.name;
            // Two levels with their own subjects: "AS: Economics" and "A2: Accounting".
            const perLevel = s.classIds.length > 1 && s.levelSubjects
              ? db.classes.filter((c) => s.classIds.includes(c.id)).map((c) => c.id).map((cid) => `${db.classes.find((x) => x.id === cid)?.name ?? ""}: ${(s.levelSubjects?.[cid] ?? s.subjectIds).map(nameOf).filter(Boolean).join(", ")}`)
              : null;
            return (
              <Card key={s.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 p-4 sm:flex-nowrap">
                <span className="pt-1">
                  <RowCheck
                    checked={picked.includes(s.id)}
                    onChange={(on) => setPicked((prev) => (on ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                    label={`Select ${s.username}`}
                  />
                </span>
                <Link href={`/admin/roster/${s.id}`} className="flex min-w-0 flex-1 basis-[calc(100%-2.5rem)] items-start gap-3 hover:opacity-80 sm:basis-auto">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-display text-sm font-bold uppercase text-ink-2">
                    {s.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cld(s.photoUrl, 96)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      s.username.slice(0, 2)
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-bold capitalize text-ink">{s.username}</span>
                      {inPersonIds.has(s.id) && <Badge tone="neutral" className="shrink-0">In person</Badge>}
                    </p>
                    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-ink-2">
                      {cohort && <CohortDot color={cohort.color} />}
                      <span className="truncate">{cohort?.name ?? "No cohort"}</span>
                      <span className="text-ink-3">· {released} results</span>
                    </p>
                    {(classNames.length > 0 || subjectNames.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {perLevel ? perLevel.map((n) => (
                          <span key={n} className="rounded border border-brand/40 bg-brand-soft px-1.5 py-0.5 text-xs text-brand">{n}</span>
                        )) : <>
                        {classNames.map((n) => (
                          <span key={n} className="rounded border border-border px-1.5 py-0.5 text-xs text-ink-2">{n}</span>
                        ))}
                        {subjectNames.map((n) => (
                          <span key={n} className="rounded border border-brand/40 bg-brand-soft px-1.5 py-0.5 text-xs text-brand">{n}</span>
                        ))}
                        </>}
                      </div>
                    )}
                  </div>
                </Link>
                {/* On a phone the actions sit on their own line, so nothing runs off the screen. */}
                <div className="ml-auto flex shrink-0 gap-1">
                  {s.phone && (
                    <a
                      href={`https://wa.me/${waDigits(s.phone)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
                      aria-label={`WhatsApp ${s.username}`}
                      title={`Chat with ${s.username}: ${s.phone}`}
                    >
                      <Icon.Users className="h-4 w-4" />
                    </a>
                  )}
                  {/* Straight to the report dialog, which is where the send lives. In-person students get no monthly report. */}
                  {!inPersonIds.has(s.id) && (
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
                  )}
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
          <div className="rounded-md border border-border bg-surface-2 px-4 py-3">
            <Checkbox
              checked={form.inPerson}
              onChange={(v) => setForm({ ...form, inPerson: v })}
              label={<span className="font-semibold text-ink">Taught in person</span>}
            />
            <p className="mt-1.5 pl-[30px] text-xs text-ink-3">
              A physical student: classes, recordings and tests in the portal. No phone numbers, register, monthly report or parent messages.
            </p>
          </div>
          {form.inPerson ? null : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Parent's WhatsApp"
              type="tel"
              inputMode="tel"
              value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              onBlur={(e) => setForm({ ...form, whatsapp: e.target.value.trim() ? normalizePhone(e.target.value) : "" })}
              placeholder="+923001234567"
              hint="Country code required. Reports go here."
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
          )}

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-2">Profile photo</label>
            <div className="flex items-center gap-3">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-display text-lg font-bold uppercase text-ink-2">
                {form.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  form.username.slice(0, 2) || "?"
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
          <Select label="Cohort" value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value, classIds: [], subjectIds: [], levelSubjects: {} })}>
            <option value="">Choose…</option>
            {db.cohorts.filter((c) => c.active || c.id === form.cohortId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div>
            <Label>Classes</Label>
            <p className="mb-2 text-xs text-ink-3">
              {form.cohortId ? "Pick their level. Taking two (AS and A2 together)? Pick both." : "Select a cohort first to see available classes."}
            </p>
            <ChipToggle
              items={availableClasses}
              selected={form.classIds}
              onToggle={toggleClass}
              placeholder={form.cohortId ? "No classes assigned to this cohort yet." : ""}
            />
          </div>
          {twoLevels ? (
            <div className="space-y-3">
              <div>
                <Label>Subjects at each level</Label>
                <p className="text-xs text-ink-3">Their timetable, Join button, reminders, tests and notes follow these.</p>
              </div>
              {db.classes.filter((c) => form.classIds.includes(c.id)).map(({ id: cid, name }) => (
                <div key={cid} className="rounded-xl border border-border p-3">
                  <p className="mb-2 text-sm font-semibold text-ink">{name}</p>
                  <ChipToggle items={availableSubjects} selected={form.levelSubjects[cid] ?? []} onToggle={(id) => toggleLevelSubject(cid, id)} />
                </div>
              ))}
            </div>
          ) : (
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
          )}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-2">
              {editing === "new" ? "Temporary password" : "New password (only if they need one)"}
            </label>
            <div className="flex gap-2">
              <Input value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} className="flex-1" aria-label="Temporary password" />
              <Button type="button" variant="secondary" onClick={() => setForm({ ...form, tempPassword: genPassword() })}>Generate</Button>
            </div>
            <p className="mt-1.5 text-xs text-ink-3">
              {editing === "new"
                ? "Share this with the student for the first time they sign in."
                : "Leave blank and their password stays the same. Changing the username or numbers never changes it."}
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
            <Button
              variant="danger"
              onClick={async () => {
                if (!deleting) return;
                const who = deleting;
                setDeleting(null);
                // Say "deleted" only once the server has done it.
                try {
                  await store.deleteStudent(who.id);
                  toast(`${who.username} deleted.`, "success");
                } catch {
                  toast(`Couldn't delete ${who.username}. Try again.`, "error");
                }
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
