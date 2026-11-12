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
import { BulkBar, ConfirmBulk, NameList, OneByOne, RowCheck, SelectAll, copyText, downloadCsv, outcome, plural, waLink, type BulkAction, type Step } from "@/components/admin/BulkBar";
import { useSelection } from "@/lib/use-selection";
import { parentNotifications, studentCheckIn, studentNotifications } from "@/lib/portal-messages";
import { uploadImage } from "@/lib/cloudinary";
import { PageHeader } from "@/components/admin/PageHeader";
import { ArchiveTabs, archiveFromUrl, type ArchiveView } from "@/components/admin/ArchiveTabs";
import { Card, Button, Input, Select, Label, CohortDot, Modal, EmptyState, Icon, Badge, segmentGroup, segmentItem } from "@/components/ui";
import { cn } from "@/lib/cn";
import { cld } from "@/lib/cld";
import { LoginDetails } from "@/components/admin/LoginDetails";
import { ImportStudents } from "@/components/admin/ImportStudents";
import { newPassword } from "@/lib/password";
import { fixPhone } from "@/lib/import-students";
import { displayName, isTestAccount } from "@/lib/display-name";

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
            aria-pressed={on}
            onClick={() => onToggle(item.id)}
            className={cn(
              "min-h-10 rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-md:min-h-11",
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
  // Bulk work: tick students, then act on them all in one go.
  const [bulkClass, setBulkClass] = useState("");
  const [bulkCohort, setBulkCohort] = useState("");
  const [bulkSubjects, setBulkSubjects] = useState<string[]>([]);
  const [ask, setAsk] = useState<null | "message" | "cohort" | "level" | "subjects" | "tag" | "delete">(null);
  const [msgTo, setMsgTo] = useState<"student" | "parent">("student");
  const [msgKind, setMsgKind] = useState<"checkin" | "notify" | "blank">("checkin");
  const [steps, setSteps] = useState<Step[] | null>(null);

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

  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    // A number typed the local way ("0300 123…") still finds +92300123…: digits only, without the leading 0.
    const qDigits = /^[\d\s+()-]+$/.test(q) ? q.replace(/\D/g, "").replace(/^0+/, "") : "";
    return db.students
      .filter((s) => (view === "archive") === off.has(s.cohortId))
      .filter((s) => (cohortId ? s.cohortId === cohortId : true))
      .filter((s) => (mode === "all" ? true : (mode === "inperson") === inPersonIds.has(s.id)))
      .filter((s) => {
        if (!q) return true;
        // The name as it reads on screen too ("amelia k" finds amelia.k).
        if (`${s.username} ${displayName(s.username)} ${s.email ?? ""} ${s.phone ?? ""} ${s.whatsapp ?? ""}`.toLowerCase().includes(q)) return true;
        // Each number compared as bare digits, so a saved "+92 300 123…" still matches "0300123…".
        return qDigits.length >= 4 && [s.phone, s.whatsapp].some((p) => (p ?? "").replace(/\D/g, "").includes(qDigits));
      })
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [db.students, cohortId, search, view, off, mode, inPersonIds]);

  // Counted once for the whole list: counting per row re-read every submission
  // for every student on each keystroke in the search box or the form.
  const releasedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of db.submissions) if (x.status === "released") m.set(x.studentId, (m.get(x.studentId) ?? 0) + 1);
    return m;
  }, [db.submissions]);

  // Ticked students: only ever ones the search and filters show.
  const ids = useMemo(() => students.map((s) => s.id), [students]);
  const sel = useSelection(ids);
  const chosen = useMemo(() => students.filter((s) => sel.isSelected(s.id)), [students, sel]);
  const names = chosen.map((s) => displayName(s.username));
  // Hamza's own test account is never messaged in bulk.
  const real = chosen.filter((s) => !isTestAccount(s));
  const twoLevel = (s: Student) => s.classIds.length > 1;

  /** Each save, then one honest line about how it went. */
  async function eachStudent(list: Student[], verb: string, save: (s: Student) => Promise<unknown> | unknown, undo?: () => void) {
    const results = await Promise.allSettled(list.map(async (s) => save(s)));
    const problems = results.flatMap((r, i) => (r.status === "rejected" ? [{ name: displayName(list[i].username), why: r.reason instanceof Error ? r.reason.message.replace(/\.$/, "") : "the save failed" }] : []));
    const done = list.length - problems.length;
    setAsk(null);
    sel.clear();
    toast(outcome(done, verb, problems, "student"), problems.length ? (done ? "info" : "error") : "success", done && undo ? { label: "Undo", onClick: undo } : undefined);
  }

  async function runCohort() {
    if (!bulkCohort) return;
    const list = chosen.filter((s) => s.cohortId !== bulkCohort);
    const before = list.map((s) => ({ id: s.id, username: s.username, cohortId: s.cohortId }));
    const to = db.cohorts.find((c) => c.id === bulkCohort)?.name ?? "the cohort";
    await eachStudent(list, view === "archive" ? `added to ${to}` : `moved to ${to}`, (s) => store.updateStudent(s.id, { cohortId: bulkCohort, username: s.username }), () => {
      before.forEach((b) => void store.updateStudent(b.id, { cohortId: b.cohortId, username: b.username }).catch(() => toast(`Couldn't move ${displayName(b.username)} back.`, "error")));
      toast(`Moving ${plural(before.length, "student")} back.`, "success");
    });
    setBulkCohort("");
  }

  async function runLevel() {
    if (!bulkClass) return;
    const list = chosen.filter((s) => !twoLevel(s));
    const skipped = chosen.filter(twoLevel);
    const before = list.map((s) => ({ id: s.id, classIds: [...s.classIds] }));
    const results = await Promise.allSettled(list.map((s) => store.setStudentClasses(s.id, [bulkClass])));
    const problems = [
      ...results.flatMap((r, i) => (r.status === "rejected" ? [{ name: displayName(list[i].username), why: "the save failed" }] : [])),
      ...skipped.map((s) => ({ name: displayName(s.username), why: "takes two levels, change it in their profile" })),
    ];
    const done = list.length - (problems.length - skipped.length);
    setAsk(null);
    sel.clear();
    setBulkClass("");
    toast(outcome(done, "given the new level", problems, "student"), problems.length ? (done ? "info" : "error") : "success", done ? {
      label: "Undo",
      onClick: () => before.forEach((b) => void store.setStudentClasses(b.id, b.classIds)?.catch(() => undefined)),
    } : undefined);
  }

  async function runSubjects() {
    if (!bulkSubjects.length) return;
    const list = chosen.filter((s) => !twoLevel(s));
    const skipped = chosen.filter(twoLevel);
    const before = list.map((s) => ({ id: s.id, subjectIds: [...s.subjectIds] }));
    const results = await Promise.allSettled(list.map((s) => store.setStudentSubjects(s.id, bulkSubjects)));
    const problems = [
      ...results.flatMap((r, i) => (r.status === "rejected" ? [{ name: displayName(list[i].username), why: "the save failed" }] : [])),
      ...skipped.map((s) => ({ name: displayName(s.username), why: "takes two levels, change it in their profile" })),
    ];
    const done = list.length - (problems.length - skipped.length);
    setAsk(null);
    sel.clear();
    setBulkSubjects([]);
    toast(outcome(done, "given the new subjects", problems, "student"), problems.length ? (done ? "info" : "error") : "success", done ? {
      label: "Undo",
      onClick: () => before.forEach((b) => void store.setStudentSubjects(b.id, b.subjectIds)?.catch(() => undefined)),
    } : undefined);
  }

  async function runTag() {
    if (!bulkTag) return;
    const on = bulkTag === "in";
    const list = chosen.filter((s) => inPersonIds.has(s.id) !== on);
    const before = list.map((s) => s.id);
    await eachStudent(list, on ? "tagged in person" : "tagged online", (s) => store.setInPerson(s.id, on), () => before.forEach((id) => store.setInPerson(id, !on)));
    setBulkTag("");
  }

  async function runDelete() {
    await eachStudent(chosen, "deleted", (s) => store.deleteStudent(s.id));
  }

  function startMessages() {
    const list: Step[] = real.map((s) => {
      const to = msgTo === "parent" ? s.whatsapp : s.phone;
      const message =
        msgKind === "blank"
          ? undefined
          : msgKind === "checkin"
            ? studentCheckIn({ id: s.id, username: s.username })
            : msgTo === "parent"
              ? parentNotifications({ id: s.id, username: s.username })
              : studentNotifications({ id: s.id, username: s.username });
      const href = waLink(to, message);
      return {
        id: s.id,
        name: displayName(s.username),
        detail: `${msgTo === "parent" ? "Parent" : "Student"}${to ? ` · ${to}` : ""}`,
        message,
        href,
        missing: inPersonIds.has(s.id) ? "taught in person, no numbers kept" : msgTo === "parent" ? "no parent's number saved" : "no student number saved",
      };
    });
    setAsk(null);
    setSteps(list);
  }

  async function copyNumbers(parent: boolean) {
    const withNo = real.filter((s) => (parent ? s.whatsapp : s.phone));
    const without = real.filter((s) => !(parent ? s.whatsapp : s.phone)).map((s) => displayName(s.username));
    if (!withNo.length) return toast(parent ? "None of them has a parent's number saved." : "None of them has a number saved.", "info");
    const ok = await copyText(withNo.map((s) => (parent ? s.whatsapp : s.phone)).join("\n"));
    if (!ok) return toast("Couldn't copy. Your browser blocked it; try again.", "error");
    toast(`${plural(withNo.length, parent ? "parent's number" : "number", parent ? "parents' numbers" : "numbers")} copied, one per line.${without.length ? ` No number for ${without.slice(0, 4).join(", ")}${without.length > 4 ? ` and ${without.length - 4} more` : ""}.` : ""}`, "success");
  }

  function exportRows() {
    const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? "";
    downloadCsv(
      chosen.map((s) => ({
        Name: displayName(s.username),
        Username: s.username,
        Cohort: nameOf(db.cohorts, s.cohortId),
        Level: s.classIds.map((c) => nameOf(db.classes, c)).join(" / "),
        Subjects: s.subjectIds.map((x) => nameOf(db.subjects, x)).join(" / "),
        "Student number": s.phone ?? "",
        "Parent's WhatsApp": s.whatsapp ?? "",
        Email: s.email ?? "",
        "In person": inPersonIds.has(s.id) ? "Yes" : "No",
        Results: releasedCount.get(s.id) ?? 0,
      })),
      "students",
    );
    toast(`Downloaded ${plural(chosen.length, "student")}.`, "success");
  }

  const actions: BulkAction[] = [
    { id: "message", label: "Message one by one", primary: true, run: () => (real.length ? setAsk("message") : toast("Your test account is left out of messages.", "info")) },
    { id: "copy", label: "Copy numbers", run: () => void copyNumbers(false) },
    { id: "copy-parents", label: "Copy parents' numbers", run: () => void copyNumbers(true) },
    { id: "cohort", label: view === "archive" ? "Add to cohort" : "Move to cohort", run: () => setAsk("cohort") },
    ...(db.classes.length ? [{ id: "level", label: "Set level", run: () => setAsk("level") }] : []),
    ...(db.subjects.length ? [{ id: "subjects", label: "Set subjects", run: () => setAsk("subjects") }] : []),
    { id: "tag", label: "Tag in person or online", run: () => setAsk("tag") },
    { id: "export", label: "Download as spreadsheet", run: exportRows },
    { id: "delete", label: "Delete", danger: true, run: () => setAsk("delete") },
  ];

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

  function toggleBulkSubject(id: string) {
    setBulkSubjects((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
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
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      {bulk && <ImportStudents open onClose={() => setBulk(false)} defaultCohort={cohortId ?? db.cohorts.find((c) => c.active)?.id ?? ""} />}
      {sent && (
        <LoginDetails open kind={sent.kind ?? "welcome"} onClose={() => setSent(null)} username={sent.username} password={sent.password} phone={sent.phone} parent={sent.parent} />
      )}
      <PageHeader
        title="Roster"
        subtitle={`${students.length} ${students.length === 1 ? "student" : "students"}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setBulk(true)} disabled={db.cohorts.length === 0}>Import students</Button>
            <Button onClick={openNew} disabled={db.cohorts.length === 0}><Icon.Plus className="h-4 w-4" /> Add student</Button>
          </>
        }
      />


      {/* Tests, notes and assignments reach students through their level and subjects. */}
      {(() => {
        const unset = db.students.filter((s) => !off.has(s.cohortId) && (!s.classIds.length || !s.subjectIds.length));
        if (!unset.length || !db.classes.length) return null;
        return (
          <div className="mb-4 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-relaxed text-ink">
            {unset.length === 1 ? "1 student has" : `${unset.length} students have`} no level or subjects set, so subject tests, notes and assignments
            don&apos;t reach them. Tap a name to pick them:{" "}
            {unset.slice(0, 12).map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <button type="button" onClick={() => openEdit(s)} className="font-semibold capitalize text-ink underline decoration-warning/60 underline-offset-4 hover:decoration-warning">
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
        onChange={(v) => { setView(v); sel.clear(); }}
        currentLabel="Current students"
        archiveLabel="Past students"
        currentCount={db.students.length - pastCount}
        archiveCount={pastCount}
      />
      {view === "archive" && (
        <p className="mb-4 text-sm text-ink-2">
          Students from switched-off cohorts. Tick the ones coming back, then use Add to cohort in the bar.
          Their old tests and marks stay in the archive.
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input compact type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" wrapperClassName="w-full sm:w-80" aria-label="Search students" />
        {inPersonIds.size > 0 && (
          <div role="group" aria-label="Show students" className={segmentGroup}>
            {([["all", "All"], ["online", "Online"], ["inperson", "In person"]] as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={mode === k}
                onClick={() => setMode(k)}
                className={segmentItem(mode === k)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon={<Icon.Users />}
          title={search.trim() ? "No student matches that" : view === "archive" ? "No past students" : "No students"}
          message={
            search.trim()
              ? "Check the spelling, or clear the search."
              : view === "archive"
                ? "Students from archived cohorts appear here."
                : cohortId || mode !== "all"
                  ? "Nobody here yet. Pick another cohort or filter, or add a student."
                  : "Add a student to get started."
          }
        />
      ) : (
        <div role="group" aria-label="Students" onKeyDown={sel.listKeyDown}>
        <SelectAll sel={sel} noun="student" />
        <Card className="divide-y divide-border overflow-hidden p-0">
          {students.map((s) => {
            const cohort = cohortById(db, s.cohortId);
            const released = releasedCount.get(s.id) ?? 0;
            const classNames = s.classIds.map((cid) => db.classes.find((x) => x.id === cid)?.name).filter(Boolean);
            const subjectNames = s.subjectIds.map((sid) => db.subjects.find((x) => x.id === sid)?.name).filter(Boolean);
            const nameOf = (sid: string) => db.subjects.find((x) => x.id === sid)?.name;
            // Two levels with their own subjects: "AS: Economics" and "A2: Accounting".
            const perLevel = s.classIds.length > 1 && s.levelSubjects
              ? db.classes.filter((c) => s.classIds.includes(c.id)).map((c) => c.id).map((cid) => `${db.classes.find((x) => x.id === cid)?.name ?? ""}: ${(s.levelSubjects?.[cid] ?? s.subjectIds).map(nameOf).filter(Boolean).join(", ")}`)
              : null;
            return (
              <div key={s.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-4 py-3 transition-colors hover:bg-white/[0.018] sm:flex-nowrap sm:items-center">
                <span className="pt-2.5 sm:pt-0">
                  <RowCheck id={s.id} checked={sel.isSelected(s.id)} onToggle={sel.toggle} label={`Select ${s.username}`} />
                </span>
                <Link href={`/admin/roster/${s.id}`} className="group flex min-w-0 flex-1 basis-[calc(100%-2.5rem)] items-start gap-3 sm:basis-auto sm:items-center">
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
                      <span className="truncate font-semibold capitalize text-ink underline-offset-4 group-hover:underline">{s.username}</span>
                      {inPersonIds.has(s.id) && <Badge tone="neutral" className="shrink-0">In person</Badge>}
                      {/* Hamza's practice account: left out of reminders, Today, activity, analytics and the leaderboard. */}
                      {isTestAccount(s) && <Badge tone="neutral" className="shrink-0">Test account</Badge>}
                    </p>
                    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-ink-2">
                      {cohort && <CohortDot color={cohort.color} />}
                      <span className="truncate">{cohort?.name ?? "No cohort"}</span>
                      <span className="tabular-nums text-ink-3">· {released} {released === 1 ? "result" : "results"}</span>
                    </p>
                    {(classNames.length > 0 || subjectNames.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {perLevel ? perLevel.map((n) => (
                          <span key={n} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">{n}</span>
                        )) : <>
                        {classNames.map((n) => (
                          <span key={n} className="rounded-md border border-border px-1.5 py-0.5 text-xs text-ink-2">{n}</span>
                        ))}
                        {subjectNames.map((n) => (
                          <span key={n} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2">{n}</span>
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
                      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors max-md:h-11 max-md:w-11 text-ink-3 hover:bg-surface-2 hover:text-ink"
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
                      "flex h-10 w-10 items-center justify-center rounded-full transition-colors max-md:h-11 max-md:w-11",
                      s.whatsapp ? "text-success hover:bg-success-soft" : "pointer-events-none text-ink-3/40",
                    )}
                    aria-label={s.whatsapp ? `Send ${s.username}'s report on WhatsApp` : `${s.username} has no WhatsApp number`}
                    title={s.whatsapp ? `Send report to ${s.whatsapp}` : "Add the parent's WhatsApp number first"}
                  >
                    <Icon.Megaphone className="h-4 w-4" />
                  </Link>
                  )}
                  <button onClick={() => openEdit(s)} className="flex h-10 w-10 items-center justify-center rounded-full transition-colors max-md:h-11 max-md:w-11 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Edit ${s.username}`}>
                    <Icon.Edit className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDeleting(s)} className="flex h-10 w-10 items-center justify-center rounded-full transition-colors max-md:h-11 max-md:w-11 text-ink-3 hover:bg-error-soft hover:text-error" aria-label={`Delete ${s.username}`}>
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </Card>
        </div>
      )}

      <BulkBar count={sel.count} onClear={sel.clear} actions={actions} />

      <ConfirmBulk
        open={ask === "message"}
        onClose={() => setAsk(null)}
        title={`Message ${plural(real.length, "student")} one by one`}
        description="WhatsApp opens one chat at a time. Each chat opens with the message typed in; you press send, then Next."
        confirmLabel="Start"
        onConfirm={startMessages}
      >
        <Select label="Send to" value={msgTo} onChange={(e) => {
          const to = e.target.value as "student" | "parent";
          setMsgTo(to);
          if (to === "parent" && msgKind === "checkin") setMsgKind("notify");
        }}>
          <option value="student">Each student</option>
          <option value="parent">Each parent</option>
        </Select>
        <Select label="Message" value={msgKind} onChange={(e) => setMsgKind(e.target.value as "checkin" | "notify" | "blank")}>
          {msgTo === "student" && <option value="checkin">Check in: how are things going</option>}
          <option value="notify">Turn on phone notifications</option>
          <option value="blank">An empty chat, I&apos;ll type</option>
        </Select>
        {chosen.length > real.length && <p>Your test account is left out.</p>}
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "cohort"}
        onClose={() => setAsk(null)}
        title={`${view === "archive" ? "Add" : "Move"} ${plural(chosen.length, "student")} to a cohort`}
        description={view === "archive" ? "They can sign in again and see that cohort's work. Their old marks stay in the archive." : "They see the new cohort's tests, notes and classes from now on."}
        confirmLabel={view === "archive" ? "Add to cohort" : "Move"}
        disabled={!bulkCohort}
        onConfirm={runCohort}
      >
        <Select label="Cohort" value={bulkCohort} onChange={(e) => setBulkCohort(e.target.value)}>
          <option value="">Choose…</option>
          {db.cohorts.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <NameList names={names} />
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "level"}
        onClose={() => setAsk(null)}
        title={`Set the level for ${plural(chosen.filter((s) => !twoLevel(s)).length, "student")}`}
        description="This replaces their level. Tests, notes and classes follow it."
        confirmLabel="Set level"
        disabled={!bulkClass || chosen.every(twoLevel)}
        onConfirm={runLevel}
      >
        <Select label="Level" value={bulkClass} onChange={(e) => setBulkClass(e.target.value)}>
          <option value="">Choose…</option>
          {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <NameList names={chosen.filter((s) => !twoLevel(s)).map((s) => displayName(s.username))} />
        {chosen.some(twoLevel) && <p>Left as they are (two levels, each with its own subjects): {chosen.filter(twoLevel).map((s) => displayName(s.username)).join(", ")}. Change those in their profile.</p>}
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "subjects"}
        onClose={() => setAsk(null)}
        title={`Set the subjects for ${plural(chosen.filter((s) => !twoLevel(s)).length, "student")}`}
        description="This replaces their subjects with the ones picked here."
        confirmLabel="Set subjects"
        disabled={!bulkSubjects.length || chosen.every(twoLevel)}
        onConfirm={runSubjects}
      >
        <ChipToggle items={db.subjects} selected={bulkSubjects} onToggle={toggleBulkSubject} />
        <NameList names={chosen.filter((s) => !twoLevel(s)).map((s) => displayName(s.username))} />
        {chosen.some(twoLevel) && <p>Left as they are (two levels, each with its own subjects): {chosen.filter(twoLevel).map((s) => displayName(s.username)).join(", ")}. Change those in their profile.</p>}
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "tag"}
        onClose={() => setAsk(null)}
        title={`Tag ${plural(chosen.length, "student")}`}
        description="In person students keep no phone numbers and get no register, monthly report or parent messages."
        confirmLabel="Tag"
        disabled={!bulkTag}
        onConfirm={runTag}
      >
        <Select label="Taught" value={bulkTag} onChange={(e) => setBulkTag(e.target.value as "" | "in" | "out")}>
          <option value="">Choose…</option>
          <option value="in">In person</option>
          <option value="out">Online</option>
        </Select>
        <NameList names={names} />
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "delete"}
        onClose={() => setAsk(null)}
        title={`Delete ${plural(chosen.length, "student")}?`}
        description="Their accounts, submissions and results are removed for good. This cannot be undone."
        confirmLabel={`Delete ${plural(chosen.length, "student")}`}
        danger
        ack={`I understand ${chosen.length === 1 ? "this student's" : `these ${chosen.length} students'`} work and marks will be deleted.`}
        onConfirm={runDelete}
      >
        <NameList names={names} max={12} />
      </ConfirmBulk>

      <OneByOne onClose={() => setSteps(null)} title="Message one by one" steps={steps} />

      <Modal
        open={editing !== null}
        // Not while it is saving: the window would close over the result, and a failed save would vanish unseen.
        onClose={() => !saving && setEditing(null)}
        title={editing === "new" ? "Add student" : "Edit student"}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button loading={saving} onClick={() => void save()}>{editing === "new" ? "Add" : "Save"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Username" value={form.username} onChange={(e) => { setForm({ ...form, username: e.target.value }); setError(null); }} required autoCapitalize="none" autoCorrect="off" spellCheck={false} />
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
              <Input value={form.tempPassword} onChange={(e) => setForm({ ...form, tempPassword: e.target.value })} className="flex-1" aria-label={editing === "new" ? "Temporary password" : "New password"} autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} />
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
