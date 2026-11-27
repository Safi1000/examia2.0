"use client";

import { useIsStaff } from "@/lib/staff";
import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Student } from "@/types";
import { StudentLinksError, useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { cohortById } from "@/lib/data/selectors";
import { AT_RISK, NEEDS_YOU, buildAttention } from "@/lib/attention";
import { useNow } from "@/hooks/useNow";
import { useToast } from "@/components/toast";
import { isValidPhone, normalizePhone, waDigits } from "@/lib/phone";
import { inPersonIds as tagged } from "@/lib/in-person";
import { Checkbox } from "@/components/ui/Choice";
import { squareThumbnail } from "@/lib/image";
import { BulkBar, ConfirmBulk, NameList, OneByOne, RowCheck, SelectAll, copyText, downloadCsv, outcome, plural, waLink, type BulkAction, type Step } from "@/components/admin/BulkBar";
import { useSelection } from "@/lib/use-selection";
import { parentNotifications, studentCheckIn, studentNotifications } from "@/lib/portal-messages";
import { introNeeded } from "@/lib/sent-log";
import { uploadImage } from "@/lib/cloudinary";
import { RowMenu } from "@/components/admin/RowMenu";
import { PageHeader } from "@/components/admin/PageHeader";
import { archiveFromUrl } from "@/components/admin/ArchiveTabs";
import { Card, Button, Input, Select, Label, CohortDot, Modal, EmptyState, Icon, Badge, Tabs, chipClass } from "@/components/ui";
import { FilterChips } from "@/components/admin/FilterChips";
import { StudentQuickLook } from "@/components/admin/StudentQuickLook";
import { useStudentAccess } from "@/components/admin/StudentAccess";
import { pct, studentFigures } from "@/components/admin/student-figures";
import { formatDate } from "@/lib/time";
import { cld } from "@/lib/cld";
import { LoginDetails } from "@/components/admin/LoginDetails";
import { ImportStudents } from "@/components/admin/ImportStudents";
import { newPassword } from "@/lib/password";
import { fixPhone } from "@/lib/import-students";
import { displayName, isTestAccount } from "@/lib/display-name";
import { leftLabel, reasonLabel } from "@/lib/paused";

type RosterView = "current" | "archive" | "left";

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
            className={chipClass(on)}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

/** "Ali Khan" → "AK": first letters of the first and last name, as the roster shows it. */
const initialsOf = (username: string) => {
  const parts = displayName(username).split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? ""))).toUpperCase();
};

/** A small speech bubble for the WhatsApp button (a people icon read as "group"). Drawn like the console's other icons. */
function WhatsAppMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
      <path d="M4.5 19.5l1.2-3.6A7.5 7.5 0 1 1 8.4 18.6z" />
    </svg>
  );
}

export default function RosterPage() {
  const staff = useIsStaff();
  const router = useRouter();
  // Set when the edit box was opened from a student's own page: after saving, go back there.
  const returnTo = useRef<string | null>(null);
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();

  // The search stays while Hamza opens a student and comes back (this tab only).
  const [search, setSearchState] = useState(() => {
    try {
      return typeof window === "undefined" ? "" : (sessionStorage.getItem("roster-search") ?? "");
    } catch {
      return "";
    }
  });
  const setSearch = (v: string) => {
    setSearchState(v);
    try {
      sessionStorage.setItem("roster-search", v);
    } catch {}
  };
  const [editing, setEditing] = useState<Student | "new" | null>(null);
  const [form, setForm] = useState({ inPerson: false, username: "", email: "", whatsapp: "", phone: "", photoUrl: "", cohortId: "", tempPassword: "", classIds: [] as string[], subjectIds: [] as string[], levelSubjects: {} as Record<string, string[]> });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // The just-added student's login, for the ready-made welcome message.
  const [sent, setSent] = useState<{ id?: string; username: string; password: string; phone?: string; parent?: string; kind?: "welcome" | "reset" | "username" } | null>(null);
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
      setError(err instanceof Error ? err.message : "Couldn't upload that photo. Check your internet and try again.");
    } finally {
      setPhotoBusy(false);
      if (photoRef.current) photoRef.current.value = "";
    }
  }
  // One student's Delete: "Pause access" is offered first (nothing is lost); Delete for good sits behind it.
  const [deleting, setDeletingRaw] = useState<Student | null>(null);
  const [deleteStep, setDeleteStep] = useState<"pause" | "delete">("delete");
  const setDeleting = (s: Student | null, step: "pause" | "delete" = "delete") => {
    setDeletingRaw(s);
    setDeleteStep(step);
  };
  // Paused students (the pause screen, no reminders, not marked absent) and students who have left
  // (always paused too). Pause, resume, mark as left and bring back are Hamza's.
  const clearTicks = useRef<() => void>(() => {});
  const accessActions = useStudentAccess({ onChanged: () => clearTicks.current() });
  const { access } = accessActions;
  const pausedIds = access.paused;
  const leftOf = access.left;
  // The quick look: the student whose row was tapped.
  const [peek, setPeek] = useState<string | null>(null);
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
  // "Left" lists students who finished or dropped out (their usernames were freed).
  const [view, setView] = useState<RosterView>("current");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (archiveFromUrl()) setView("archive");
  }, []);
  const off = useMemo(() => new Set(db.cohorts.filter((c) => !c.active).map((c) => c.id)), [db.cohorts]);
  const leftCount = db.students.filter((s) => leftOf[s.id]).length;
  const pastCount = db.students.filter((s) => off.has(s.cohortId) && !leftOf[s.id]).length;
  // Physical students sit in the normal groups, tagged "In person".
  const inPersonIds = useMemo(() => tagged(db), [db]);
  const [bulkTag, setBulkTag] = useState<"" | "in" | "out">("");
  // Filter chips: nothing picked in a row means all of it.
  const [modes, setModes] = useState<string[]>([]);
  const [levelIds, setLevelIds] = useState<string[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const filtered = modes.length + levelIds.length + subjectIds.length + statuses.length > 0;
  // Hamza only: sort by the same "needs you" ranking as Today, or by a figure (lowest first).
  const [sortBy, setSortBy] = useState<"name" | "needs" | "attendance" | "homework" | "average">("name");
  const nowMs = useNow();
  const tick = Math.floor(nowMs / 300_000) * 300_000;

  // Hamza only (staff never see who is slipping): attendance this month, homework
  // done and test average per current student, the same sums as the student's
  // own page, and Today's "needs you" score for the dot, the filter and the sort.
  const drift = useMemo(() => {
    if (staff) return null;
    const current = db.students.filter((s) => !off.has(s.cohortId) && !leftOf[s.id] && !isTestAccount(s));
    const figures = studentFigures(db, current, tick);
    // As on Today: online students who aren't paused.
    const online = current.filter((s) => !inPersonIds.has(s.id) && !pausedIds.has(s.id));
    const { all } = buildAttention(db, {
      students: online,
      tests: db.tests.filter((t) => t.status !== "draft"),
      nowMs: tick,
      checked: {},
      profiles: {},
      profilesReady: false,
      activity: null,
      recordings: [],
    });
    return { figures, score: new Map(all.map((r) => [r.student.id, r.score])) };
  }, [staff, db, off, inPersonIds, tick, leftOf, pausedIds]);

  const students = useMemo(() => {
    const q = search.trim().toLowerCase();
    // A number typed the local way ("0300 123…") still finds +92300123…: digits only, without the leading 0.
    // Staff search names only, so a typed number can never reveal whose it is.
    const qDigits = !staff && /^[\d\s+()-]+$/.test(q) ? q.replace(/\D/g, "").replace(/^0+/, "") : "";
    // Lowest first for a figure; nothing to count goes last.
    const figureOf = (id: string) => {
      const f = drift?.figures.get(id);
      const v = sortBy === "attendance" ? f?.attendance : sortBy === "homework" ? f?.homeworkDone : sortBy === "average" ? f?.average : null;
      return v ?? Infinity;
    };
    return db.students
      .filter((s) => (view === "left" ? !!leftOf[s.id] : !leftOf[s.id] && (view === "archive") === off.has(s.cohortId)))
      .filter((s) => (cohortId ? s.cohortId === cohortId : true))
      .filter((s) => (modes.length ? modes.includes(inPersonIds.has(s.id) ? "inperson" : "online") : true))
      .filter((s) => (levelIds.length ? s.classIds.some((c) => levelIds.includes(c)) : true))
      .filter((s) => (subjectIds.length ? s.subjectIds.some((c) => subjectIds.includes(c)) : true))
      .filter((s) => {
        if (!statuses.length || view === "left") return true;
        const paused = pausedIds.has(s.id);
        return (statuses.includes("active") && !paused) || (statuses.includes("paused") && paused) || (statuses.includes("needs") && (drift?.score.get(s.id) ?? 0) >= NEEDS_YOU);
      })
      .filter((s) => {
        if (!q) return true;
        // The name as it reads on screen too ("amelia k" finds amelia.k).
        if ((staff ? `${s.username} ${displayName(s.username)}` : `${s.username} ${displayName(s.username)} ${s.email ?? ""} ${s.phone ?? ""} ${s.whatsapp ?? ""}`).toLowerCase().includes(q)) return true;
        // Each number compared as bare digits, so a saved "+92 300 123…" still matches "0300123…".
        return qDigits.length >= 4 && [s.phone, s.whatsapp].some((p) => (p ?? "").replace(/\D/g, "").includes(qDigits));
      })
      .sort((a, b) => {
        if (view === "left") return (leftOf[b.id]?.at ?? "").localeCompare(leftOf[a.id]?.at ?? "") || a.username.localeCompare(b.username);
        if (view === "current" && drift && sortBy === "needs") return (drift.score.get(b.id) ?? 0) - (drift.score.get(a.id) ?? 0) || a.username.localeCompare(b.username);
        if (view === "current" && drift && sortBy !== "name") {
          const x = figureOf(a.id);
          const y = figureOf(b.id);
          if (x !== y) return x === Infinity ? 1 : y === Infinity ? -1 : x - y;
        }
        return a.username.localeCompare(b.username);
      });
  }, [db.students, cohortId, search, view, off, modes, inPersonIds, sortBy, drift, staff, levelIds, subjectIds, statuses, pausedIds, leftOf]);

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
  useEffect(() => {
    clearTicks.current = sel.clear;
  });
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
            ? studentCheckIn({ id: s.id, username: s.username, intro: introNeeded(db, s.id, "student") })
            : msgTo === "parent"
              ? parentNotifications({ id: s.id, username: s.username, intro: introNeeded(db, s.id, "parent") })
              : studentNotifications({ id: s.id, username: s.username, intro: introNeeded(db, s.id, "student") });
      const href = waLink(to, message);
      return {
        // A blank chat is not a pre-written message: nothing to log.
        log: message ? { studentId: s.id, audience: msgTo === "parent" ? ("parent" as const) : ("student" as const), what: msgKind === "checkin" ? "check_in" : "notifications" } : undefined,
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
        Status: leftOf[s.id] ? `Left (${leftLabel(leftOf[s.id].kind).toLowerCase()})` : pausedIds.has(s.id) ? "Paused" : "Active",
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
    ...(view === "left"
      ? [
          { id: "farewell", label: "Send farewell", run: () => accessActions.sendFarewell(chosen) },
          { id: "back", label: "Bring back", run: () => accessActions.bringBack(chosen) },
        ]
      : [
          { id: "cohort", label: view === "archive" ? "Add to cohort" : "Move to cohort", run: () => setAsk("cohort") },
          ...(db.classes.length ? [{ id: "level", label: "Set level", run: () => setAsk("level") }] : []),
          ...(db.subjects.length ? [{ id: "subjects", label: "Set subjects", run: () => setAsk("subjects") }] : []),
          { id: "tag", label: "Tag in person or online", run: () => setAsk("tag") },
        ]),
    { id: "export", label: "Download spreadsheet", run: exportRows },
    ...(view !== "left" && real.some((s) => !pausedIds.has(s.id)) ? [{ id: "pause", label: "Pause access", run: () => accessActions.askPause(chosen) }] : []),
    ...(view !== "left" && chosen.some((s) => pausedIds.has(s.id)) ? [{ id: "resume", label: "Resume access", run: () => accessActions.resume(chosen.filter((s) => pausedIds.has(s.id))) }] : []),
    // Past students too, so their usernames can be freed for new ones.
    ...(view !== "left" ? [{ id: "leave", label: "Mark as left…", run: () => accessActions.askLeave(chosen) }] : []),
    { id: "delete", label: "Delete", danger: true, run: () => setAsk("delete") },
  ];

  // Classes/subjects available for the selected cohort in the form
  const selectedCohort = db.cohorts.find((c) => c.id === form.cohortId);
  // Every level, the cohort's own first: a student can also take a second level (AS and A2 together).
  const availableClasses = db.classes.toSorted(
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
    if (staff) return;
    setEditing("new");
    setForm({ inPerson: false, username: "", email: "", whatsapp: "", phone: "", photoUrl: "", cohortId: cohortId ?? db.cohorts.find((c) => c.active)?.id ?? db.cohorts[0]?.id ?? "", tempPassword: genPassword(), classIds: [], subjectIds: [], levelSubjects: {} });
    setError(null);
  }
  // "Edit details" on a student's own page opens their edit box here (?edit=id).
  const editAsked = useRef(false);
  useEffect(() => {
    if (editAsked.current) return;
    const id = new URLSearchParams(window.location.search).get("edit");
    if (!id) return;
    // Staff look students up; they never open the edit box, however it is asked for.
    if (staff) return void window.history.replaceState(null, "", window.location.pathname);
    const s = db.students.find((x) => x.id === id);
    if (!s) return;
    editAsked.current = true;
    returnTo.current = s.id;
    window.history.replaceState(null, "", window.location.pathname);
    openEdit(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.students]);

  function openEdit(s: Student) {
    if (staff) return;
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
    if (store.usernameTaken(form.username, exceptId)) {
      const past = db.students.find((x) => x.id !== exceptId && x.username.toLowerCase() === form.username.trim().toLowerCase() && off.has(x.cohortId));
      return setError(past ? `${displayName(past.username)} is a past student. Open Past students, tick them and use Add to cohort to bring them back with their old marks.` : "That username is already taken.");
    }
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
      return setError("Student's WhatsApp must include the country code, e.g. +923001234567.");
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
        setSent({ id, username: fields.username, password: fields.tempPassword, phone: fields.phone, parent: fields.whatsapp });
      } else if (editing) {
        // An emptied box is sent as an empty value, not left out, so removing a
        // number, the photo or the email really saves (the store writes it as empty).
        await store.updateStudent(editing.id, { ...fields, email: fields.email ?? "", whatsapp, phone, photoUrl: form.photoUrl || "" });
        store.setInPerson(editing.id, form.inPerson);
        // A new password: send it. Only a new username: send just that, the password stays.
        if (fields.tempPassword) setSent({ id: editing.id, username: fields.username, password: fields.tempPassword, phone: fields.phone, parent: fields.whatsapp, kind: "reset" });
        else if (editing.username !== fields.username) setSent({ id: editing.id, username: fields.username, password: "", phone: fields.phone, parent: fields.whatsapp, kind: "username" });
        else {
          toast("Student updated. Their login hasn't changed.", "success");
          if (returnTo.current === editing.id) router.push(`/admin/roster/${editing.id}`);
        }
      }
      if (fields.levelSubjects && store.levelsSaveFailed) toast("Saved, but the subjects for each level didn't save. Open the student and save again.", "error");
      setEditing(null);
    } catch (err) {
      if (err instanceof StudentLinksError) {
        // The account exists: show its login (the password is never shown again), and say what didn't save.
        if (form.inPerson) store.setInPerson(err.studentId, true);
        setSent({ id: err.studentId, username: fields.username, password: fields.tempPassword, phone: fields.phone, parent: fields.whatsapp });
        setEditing(null);
        toast(err.message, "error");
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't save this student. Check your internet and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      {bulk && !staff && <ImportStudents open onClose={() => setBulk(false)} defaultCohort={cohortId ?? db.cohorts.find((c) => c.active)?.id ?? ""} />}
      {sent && (
        <LoginDetails open studentId={sent.id} kind={sent.kind ?? "welcome"} onClose={() => setSent(null)} username={sent.username} password={sent.password} phone={sent.phone} parent={sent.parent} />
      )}
      <PageHeader
        title="Roster"
        subtitle={`${students.length} ${students.length === 1 ? "student" : "students"}`}
        actions={
          <span data-owner className="contents">
            <Button variant="secondary" onClick={() => setBulk(true)} disabled={db.cohorts.length === 0}>Import students</Button>
            <Button onClick={openNew} disabled={db.cohorts.length === 0}><Icon.Plus className="h-4 w-4" /> Add student</Button>
          </span>
        }
      />


      {/* Tests, notes and assignments reach students through their level and subjects. */}
      {(() => {
        const unset = db.students.filter((s) => !off.has(s.cohortId) && !leftOf[s.id] && (!s.classIds.length || !s.subjectIds.length));
        // Setting a student's level is Hamza's: staff don't get the strip or its edit buttons.
        if (staff || !unset.length || !db.classes.length) return null;
        return (
          <div className="mb-4 rounded-tile border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-relaxed text-ink">
            {unset.length === 1 ? "1 student has" : `${unset.length} students have`} no level or subjects set, so subject tests, notes and homework
            don&apos;t reach them. Tap a name to pick them:{" "}
            {unset.slice(0, 12).map((s, i, all) => (
              // The comma stays glued to its name, so a line never starts with one.
              <span key={s.id}>
                <span className="whitespace-nowrap">
                  <button type="button" onClick={() => openEdit(s)} className="font-semibold text-ink underline decoration-warning/60 underline-offset-4 hover:decoration-warning pointer-coarse:inline-block pointer-coarse:py-2.5">
                    {displayName(s.username)}
                  </button>
                  {i < all.length - 1 && ","}
                </span>
                {i < all.length - 1 && " "}
              </span>
            ))}
            {unset.length > 12 && ` and ${unset.length - 12} more`}.
          </div>
        );
      })()}

      {/* The monthly report goes to the parent's WhatsApp: say who has no number saved. */}
      {(() => {
        if (staff) return null;
        const noParent = db.students.filter((s) => !off.has(s.cohortId) && !leftOf[s.id] && !s.whatsapp && !inPersonIds.has(s.id) && !isTestAccount(s));
        if (!noParent.length) return null;
        return (
          <div className="mb-4 rounded-tile border border-hairline-strong bg-surface-2 px-4 py-3 text-sm leading-relaxed text-ink-2">
            {noParent.length === 1 ? "1 student has" : `${noParent.length} students have`} no parent WhatsApp saved, so their monthly report can&apos;t be sent. Tap a name to add it:{" "}
            {noParent.slice(0, 8).map((s, i, all) => (
              <span key={s.id}>
                <span className="whitespace-nowrap">
                  <button type="button" onClick={() => openEdit(s)} className="font-semibold text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-ink-3 pointer-coarse:inline-block pointer-coarse:py-2.5">
                    {displayName(s.username)}
                  </button>
                  {i < all.length - 1 && ","}
                </span>
                {i < all.length - 1 && " "}
              </span>
            ))}
            {noParent.length > 8 && ` and ${noParent.length - 8} more`}.
          </div>
        );
      })()}

      {/* Past students only show when opened from a switched-off cohort's card; Left once anyone has left. */}
      {view !== "current" && (
        <Tabs
          className="mb-4"
          active={view}
          onChange={(id) => { setView(id as RosterView); sel.clear(); }}
          tabs={[
            { id: "current", label: "Current students", count: db.students.length - pastCount - leftCount },
            ...(view === "archive" || pastCount > 0 ? [{ id: "archive", label: "Past students", count: pastCount }] : []),
            { id: "left", label: "Left", count: leftCount },
          ]}
        />
      )}
      {view === "archive" && (
        <p className="mb-4 text-sm text-ink-2">
          Students from switched-off cohorts.
          <span data-owner> Tick the ones coming back, then use Add to cohort in the bar. Not coming back? Mark them as left to free their usernames.</span> Their old tests and marks stay in the archive.
        </p>
      )}
      {view === "left" && (
        <p className="mb-4 text-sm text-ink-2">
          Students who finished or dropped out. Their usernames are free for new students, and they see a farewell screen when they sign in. Nothing of theirs is deleted.
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input compact type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" wrapperClassName="w-full sm:w-80" aria-label="Search students" />
        {drift && view === "current" && (
          <Select compact aria-label="Sort students" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} wrapperClassName="w-full sm:w-56">
            <option value="name">By name</option>
            <option value="needs">Needs attention first</option>
            <option value="attendance">Attendance, lowest first</option>
            <option value="homework">Homework, lowest first</option>
            <option value="average">Average, lowest first</option>
          </Select>
        )}
        {view === "current" && leftCount > 0 && (
          <button
            type="button"
            onClick={() => { setView("left"); sel.clear(); }}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink-3 underline-offset-4 hover:text-ink hover:underline sm:ml-auto"
          >
            Left <span className="tabular-nums">{leftCount}</span>
          </button>
        )}
      </div>
      <div className="mb-4 space-y-2">
        {view !== "left" && (
          <FilterChips
            label="Status"
            options={[
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              ...(drift && view === "current" ? [{ value: "needs", label: "Needs you" }] : []),
            ]}
            selected={statuses}
            onChange={setStatuses}
          />
        )}
        {db.classes.length > 1 && <FilterChips label="Level" options={db.classes.map((c) => ({ value: c.id, label: c.name }))} selected={levelIds} onChange={setLevelIds} />}
        {db.subjects.length > 1 && <FilterChips label="Subject" options={db.subjects.map((c) => ({ value: c.id, label: c.name }))} selected={subjectIds} onChange={setSubjectIds} />}
        {inPersonIds.size > 0 && (
          <FilterChips label="Taught" options={[{ value: "online", label: "Online" }, { value: "inperson", label: "In person" }]} selected={modes} onChange={setModes} />
        )}
      </div>

      {students.length === 0 ? (
        <EmptyState
          icon={<Icon.Users />}
          title={search.trim() ? "No student matches that" : view === "archive" ? "No past students" : view === "left" ? "Nobody has left" : "No students"}
          message={
            search.trim()
              ? "Check the spelling, or clear the search."
              : view === "archive"
                ? "Students from archived cohorts appear here."
                : view === "left"
                  ? "Students you mark as left appear here."
                : cohortId || filtered
                  ? staff
                    ? "Nobody here yet. Pick another cohort or filter."
                    : "Nobody here yet. Pick another cohort or filter, or add a student."
                  : staff
                    ? "No students yet."
                    : "Add a student to get started."
          }
        />
      ) : (
        <div role="group" aria-label="Students" onKeyDown={sel.listKeyDown}>
        {/* Owner only: the assistant looks students up, she does not change or message them. */}
        <span data-owner className="contents"><SelectAll sel={sel} noun="student" /></span>
        <Card className="divide-y divide-hairline overflow-hidden p-0">
          {students.map((s) => {
            const cohort = cohortById(db, s.cohortId);
            const released = releasedCount.get(s.id) ?? 0;
            const fig = view === "current" ? drift?.figures.get(s.id) : undefined;
            const gone = leftOf[s.id];
            const score = view === "current" ? (drift?.score.get(s.id) ?? 0) : 0;
            const classNames = s.classIds.map((cid) => db.classes.find((x) => x.id === cid)?.name).filter(Boolean);
            const subjectNames = s.subjectIds.map((sid) => db.subjects.find((x) => x.id === sid)?.name).filter(Boolean);
            const nameOf = (sid: string) => db.subjects.find((x) => x.id === sid)?.name;
            // Two levels with their own subjects: "AS: Economics" and "A2: Accounting".
            const perLevel = s.classIds.length > 1 && s.levelSubjects
              ? db.classes.filter((c) => s.classIds.includes(c.id)).map((c) => c.id).map((cid) => `${db.classes.find((x) => x.id === cid)?.name ?? ""}: ${(s.levelSubjects?.[cid] ?? s.subjectIds).map(nameOf).filter(Boolean).join(", ")}`)
              : null;
            return (
              <div key={s.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-5 py-3 transition-colors hover:bg-white/[0.02] sm:flex-nowrap sm:items-center">
                <span data-owner className="pt-2.5 sm:pt-0">
                  <RowCheck id={s.id} checked={sel.isSelected(s.id)} onToggle={sel.toggle} label={`Select ${displayName(s.username)}`} />
                </span>
                {/* A tap opens the quick look; Cmd or Ctrl-click still opens the full page in a new tab. */}
                <Link
                  href={`/admin/roster/${s.id}`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    setPeek(s.id);
                  }}
                  className="group flex min-w-0 flex-1 basis-[calc(100%-2.5rem)] items-start gap-3 sm:basis-auto sm:items-center"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 font-display text-sm font-bold uppercase text-ink-2">
                    {s.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cld(s.photoUrl, 96)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      initialsOf(s.username)
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-base font-semibold capitalize text-ink underline-offset-4 group-hover:underline">{displayName(s.username)}</span>
                      {inPersonIds.has(s.id) && <Badge tone="neutral" className="shrink-0">In person</Badge>}
                      {/* Hamza's practice account: left out of reminders, Today, activity, analytics and the leaderboard. */}
                      {isTestAccount(s) && <Badge tone="neutral" className="shrink-0">Test account</Badge>}
                      {gone ? (
                        <Badge tone="neutral" className="shrink-0">{leftLabel(gone.kind)}</Badge>
                      ) : (
                        pausedIds.has(s.id) && <Badge tone="warning" className="shrink-0">Paused{access.reasons[s.id] ? ` · ${reasonLabel(access.reasons[s.id])}` : ""}</Badge>
                      )}
                      {/* Hamza only: one quiet dot when Today's "needs you" score says so, red when at risk of leaving. */}
                      {score >= NEEDS_YOU && (
                        <span role="img" aria-label={score >= AT_RISK ? "At risk of leaving" : "Needs you"} title={score >= AT_RISK ? "At risk of leaving" : "Needs you"} className={`h-2 w-2 shrink-0 rounded-full ${score >= AT_RISK ? "bg-error" : "bg-warning"}`} />
                      )}
                    </p>
                    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-ink-2">
                      {cohort && <CohortDot color={cohort.color} />}
                      <span className="truncate">{cohort?.name ?? "No cohort"}</span>
                      {gone ? (
                        <span className="tabular-nums text-ink-3">
                          · Left {formatDate(gone.at)}
                          {gone.farewell?.rating ? ` · Rated ${gone.farewell.rating} of 5` : ""}
                        </span>
                      ) : fig ? (
                        // Hamza only: attendance this month, homework done, test average ("–" when nothing to count).
                        <span className="basis-full tabular-nums text-ink-3 sm:basis-auto">
                          <span className="hidden sm:inline">· </span>Attendance {pct(fig.attendance)} · Homework {pct(fig.homeworkDone)} · Average {pct(fig.average)}
                        </span>
                      ) : (
                        <span className="tabular-nums text-ink-3">· {released} {released === 1 ? "result" : "results"}</span>
                      )}
                    </p>
                    {(classNames.length > 0 || subjectNames.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {perLevel ? perLevel.map((n) => (
                          <span key={n} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{n}</span>
                        )) : <>
                        {classNames.map((n) => (
                          <span key={n} className="rounded-full border border-hairline-strong px-2 py-0.5 text-xs text-ink-2">{n}</span>
                        ))}
                        {subjectNames.map((n) => (
                          <span key={n} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{n}</span>
                        ))}
                        </>}
                      </div>
                    )}
                  </div>
                </Link>
                {/* On a phone the actions sit on their own line, so nothing runs off the screen. */}
                <div data-owner className="ml-auto flex shrink-0 gap-1">
                  {s.phone && (
                    <a
                      href={`https://wa.me/${waDigits(s.phone)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-10 w-10 items-center justify-center rounded-full transition-colors max-md:h-11 max-md:w-11 text-ink-3 hover:bg-surface-2 hover:text-ink"
                      aria-label={`WhatsApp ${displayName(s.username)}`}
                      title={`WhatsApp ${displayName(s.username)}: ${s.phone}`}
                    >
                      <WhatsAppMark />
                    </a>
                  )}
                  {/* Straight to the report dialog, which is where the send lives. In-person students get no monthly report. */}
                  {/* No parent number: the faded report button opens the edit box (where the number goes), not a dead end with a hover tip phones never show. */}
                  {!inPersonIds.has(s.id) &&
                    (s.whatsapp ? (
                      <Link
                        href={`/admin/roster/${s.id}?report=1`}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink max-md:h-11 max-md:w-11"
                        aria-label={`Monthly report for ${displayName(s.username)}`}
                        title={`Monthly report, sent to ${s.whatsapp}`}
                      >
                        <Icon.Doc className="h-5 w-5" />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3/50 transition-colors hover:bg-surface-2 hover:text-ink max-md:h-11 max-md:w-11"
                        aria-label={`Add the parent's WhatsApp for ${displayName(s.username)}, for the monthly report`}
                        title="Add the parent's WhatsApp first"
                      >
                        <Icon.Doc className="h-5 w-5" />
                      </button>
                    ))}
                  <button onClick={() => openEdit(s)} className="flex h-10 w-10 items-center justify-center rounded-full transition-colors max-md:h-11 max-md:w-11 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Edit ${displayName(s.username)}`}>
                    <Icon.Edit className="h-5 w-5" />
                  </button>
                  <RowMenu label={`More for ${displayName(s.username)}`} items={[
                    ...(gone
                      ? [
                          { label: "Send farewell", onSelect: () => accessActions.sendFarewell([s]) },
                          { label: "Bring back", onSelect: () => accessActions.bringBack([s]) },
                        ]
                      : [
                          pausedIds.has(s.id) ? { label: "Resume access", onSelect: () => accessActions.resume([s]) } : { label: "Pause access", onSelect: () => accessActions.askPause([s]) },
                          { label: "Mark as left…", onSelect: () => accessActions.askLeave([s]) },
                        ]),
                    { label: "Delete", danger: true, onSelect: () => setDeleting(s, pausedIds.has(s.id) ? "delete" : "pause") },
                  ]} />
                </div>
              </div>
            );
          })}
        </Card>
        </div>
      )}

      <span data-owner className="contents"><BulkBar count={sel.count} onClear={sel.clear} actions={actions} /></span>

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
        description="Students taught in person keep no phone numbers and get no register, monthly report or parent messages."
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
        description="Their sign ins, test papers and marks, homework, attendance and monthly reports are removed for good. This cannot be undone. To keep their work, use Pause access instead."
        confirmLabel={`Delete ${plural(chosen.length, "student")}`}
        danger
        ack={`I understand ${chosen.length === 1 ? "this student's" : `these ${chosen.length} students'`} work and marks will be deleted.`}
        onConfirm={runDelete}
      >
        <NameList names={names} max={12} />
      </ConfirmBulk>

      <OneByOne onClose={() => setSteps(null)} title="Message one by one" steps={steps} />

      {!staff && accessActions.ui}

      <StudentQuickLook
        studentId={peek}
        order={ids}
        onMove={setPeek}
        onClose={() => setPeek(null)}
        staff={staff}
        access={access}
        actions={
          staff
            ? undefined
            : {
                // The sheet closes first, so the next window isn't stacked on it.
                edit: (s) => { setPeek(null); openEdit(s); },
                pause: (s) => { setPeek(null); accessActions.askPause([s]); },
                resume: (s) => accessActions.resume([s]),
                leave: (s) => { setPeek(null); accessActions.askLeave([s]); },
                bringBack: (s) => accessActions.bringBack([s]),
                farewell: (s) => { setPeek(null); accessActions.sendFarewell([s]); },
              }
        }
      />

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
          <div className="rounded-tile bg-surface-2 px-4 py-3">
            <Checkbox
              checked={form.inPerson}
              onChange={(v) => setForm({ ...form, inPerson: v })}
              label={<span className="font-semibold text-ink">Taught in person</span>}
            />
            <p className="mt-1.5 pl-[30px] text-sm text-ink-3">
              Comes to class in person: classes, recordings and tests in the portal. No phone numbers, register, monthly report or parent messages.
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
              label="Student's WhatsApp"
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
                  (form.username ? initialsOf(form.username) : "?")
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
                  className="min-h-11 text-sm font-semibold text-ink-3 transition-colors hover:text-error"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="mt-1.5 text-sm text-ink-3">Cropped to a square and shrunk to 512px before upload.</p>
          </div>
          {/* One cohort switched on, and they are in it: nothing to choose. */}
          {!(db.cohorts.filter((c) => c.active).length === 1 && db.cohorts.find((c) => c.active)?.id === form.cohortId) && (
            <Select label="Cohort" value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value, classIds: [], subjectIds: [], levelSubjects: {} })}>
              <option value="">Choose…</option>
              {db.cohorts.filter((c) => c.active || c.id === form.cohortId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <div>
            <Label>Level</Label>
            <p className="mb-2 text-sm text-ink-3">
              {form.cohortId ? "Pick their level. Taking two (AS and A2 together)? Pick both." : "Select a cohort first to see its levels."}
            </p>
            <ChipToggle
              items={availableClasses}
              selected={form.classIds}
              onToggle={toggleClass}
              placeholder={form.cohortId ? "No levels set for this cohort yet." : ""}
            />
          </div>
          {twoLevels ? (
            <div className="space-y-3">
              <div>
                <Label>Subjects at each level</Label>
                <p className="text-sm text-ink-3">Their timetable, Join button, reminders, tests and notes follow these.</p>
              </div>
              {db.classes.filter((c) => form.classIds.includes(c.id)).map(({ id: cid, name }) => (
                <div key={cid} className="rounded-tile bg-surface-2 p-4">
                  <p className="mb-2 text-sm font-semibold text-ink">{name}</p>
                  <ChipToggle items={availableSubjects} selected={form.levelSubjects[cid] ?? []} onToggle={(id) => toggleLevelSubject(cid, id)} />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <Label>Subjects</Label>
              <p className="mb-2 text-sm text-ink-3">
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
            <p className="mt-1.5 text-sm text-ink-3">
              {editing === "new"
                ? "Share this with the student for the first time they sign in."
                : "Leave blank and their password stays the same. Changing the username or numbers never changes it."}
            </p>
          </div>
          {error && <p className="rounded-field border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
        </div>
      </Modal>

      {/* Pausing keeps everything and can be undone, so it comes first. */}
      <ConfirmBulk
        open={!!deleting && deleteStep === "pause"}
        onClose={() => setDeleting(null)}
        title={deleting ? `Pause ${displayName(deleting.username)} instead?` : "Pause instead?"}
        description="They see the pause screen, get no reminders and are left out of attendance. Their work, marks and reports are all kept, and you can resume them any time."
        confirmLabel="Pause access…"
        onConfirm={() => {
          if (!deleting) return;
          const who = deleting;
          setDeleting(null);
          // Next: what they see while paused.
          accessActions.askPause([who]);
        }}
      >
        <button
          type="button"
          onClick={() => deleting && setDeleting(deleting, "delete")}
          className="min-h-11 text-sm font-semibold text-ink-3 underline underline-offset-4 transition-colors hover:text-error"
        >
          Delete for good instead
        </button>
      </ConfirmBulk>

      {/* The same confirm as the bulk Delete, with its tick box. */}
      <ConfirmBulk
        open={!!deleting && deleteStep === "delete"}
        onClose={() => setDeleting(null)}
        title={deleting ? `Delete ${displayName(deleting.username)}?` : "Delete student?"}
        description="Their sign in, test papers and marks, homework, attendance and monthly reports are removed for good. This cannot be undone."
        confirmLabel="Delete student"
        danger
        ack="I understand this student's work and marks will be deleted."
        onConfirm={async () => {
          if (!deleting) return;
          const who = deleting;
          // Say "deleted" only once the server has done it.
          try {
            await store.deleteStudent(who.id);
            setDeleting(null);
            toast(`${displayName(who.username)} deleted.`, "success");
          } catch {
            setDeleting(null);
            toast(`${displayName(who.username)} wasn't deleted. Check your internet and try again.`, "error");
          }
        }}
      />
    </div>
  );
}
