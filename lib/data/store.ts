"use client";

/**
 * ============================================================================
 * THE SINGLE DATA SEAM (Supabase-backed).
 *
 * Every read and write in the app goes through this module. It keeps an
 * in-memory cache of the database (hydrated from Supabase per session, scoped by
 * Row-Level Security) so the rest of the app can stay synchronous: components
 * read `useDatabase()` and call store actions without awaiting. Actions update
 * the cache optimistically (using client-generated UUIDs so returned ids are
 * available immediately) and persist to Supabase in the background; failures are
 * surfaced through the registered error reporter.
 *
 * Security notes:
 *  - MCQ grading runs in a Postgres trigger; answer keys live in question_keys
 *    (admin-only) and are merged into the cache from there (admin) or from the
 *    student's own released answers (student). They never load mid-test.
 *  - Privileged user provisioning goes through the `admin-users` edge function.
 * ============================================================================
 */
import { useSyncExternalStore } from "react";
import type {
  Activity,
  ActivityType,
  Announcement,
  Answer,
  ClassItem,
  Cohort,
  CohortColor,
  Note,
  NoteAssignment,
  Question,
  QuestionBankItem,
  QuestionCommon,
  QuestionVariant,
  Student,
  SubjectItem,
  Submission,
  Test,
  TestStatus,
} from "@/types";
import type { Database } from "@/lib/data/seed";
import { supabase } from "@/lib/supabase";

/**
 * Discriminated "create" shapes. `Omit<Question, …>` collapses the variant union
 * (TS keeps only common keys), so we rebuild the union explicitly to read
 * type-specific fields (options/correctIndex/maxLength).
 */
type QuestionInput = Omit<QuestionCommon, "id"> & QuestionVariant;
type BankInput = Omit<QuestionCommon, "id"> & QuestionVariant & { subject: string };

function genId(): string {
  // Supabase columns are uuid; generating client-side keeps action returns sync.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback (older runtimes): RFC4122-ish.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const EMPTY: Database = {
  activities: [],
  cohorts: [],
  students: [],
  tests: [],
  submissions: [],
  announcements: [],
  bank: [],
  classes: [],
  subjects: [],
  notes: [],
  noteAssignments: [],
};

// ---------------------------------------------------------------------------
// Row <-> domain mappers (snake_case columns <-> camelCase types).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

const mapCohort = (r: Row, classIds: string[] = [], subjectIds: string[] = []): Cohort => ({
  id: r.id as string,
  name: r.name as string,
  color: r.color as CohortColor,
  classIds,
  subjectIds,
  createdAt: r.created_at as string,
});

const mapStudent = (r: Row, classIds: string[] = [], subjectIds: string[] = []): Student => ({
  id: r.id as string,
  username: r.username as string,
  email: (r.email as string) ?? undefined,
  cohortId: (r.cohort_id as string) ?? "",
  classIds,
  subjectIds,
  createdAt: r.created_at as string,
});

const mapClass = (r: Row): ClassItem => ({
  id: r.id as string,
  name: r.name as string,
  createdAt: r.created_at as string,
});

const mapSubject = (r: Row): SubjectItem => ({
  id: r.id as string,
  name: r.name as string,
  createdAt: r.created_at as string,
});

const mapNote = (r: Row): Note => ({
  id: r.id as string,
  title: r.title as string,
  fileUrl: r.file_url as string,
  fileType: r.file_type as string,
  fileName: r.file_name as string,
  createdAt: r.created_at as string,
});

const mapNoteAssignment = (r: Row): NoteAssignment => ({
  id: r.id as string,
  noteId: r.note_id as string,
  cohortId: r.cohort_id as string,
  classId: (r.class_id as string) ?? null,
  subjectId: (r.subject_id as string) ?? null,
  createdAt: r.created_at as string,
});

function mapQuestion(r: Row, correctIndex: number | undefined): Question {
  const base = {
    id: r.id as string,
    prompt: r.prompt as string,
    marks: r.marks as number,
    topic: r.topic as string,
    order: (r.sort_order as number) ?? 0,
  };
  if (r.type === "mcq") {
    // -1 means "withheld" — the student client has no key until results release.
    return { ...base, type: "mcq", options: (r.options as string[]) ?? [], correctIndex: correctIndex ?? -1 };
  }
  if (r.type === "text") {
    return {
      ...base,
      type: "text",
      maxLength: (r.max_length as number) ?? undefined,
      showCounter: (r.show_counter as boolean) ?? undefined,
    };
  }
  return { ...base, type: "photo" };
}

const mapAnswer = (r: Row): Answer => {
  // photo_urls is the full set; photo_url stays the first image so any code
  // still reading the single URL (grading, results, evaluation) is unaffected.
  const urls = ((r.photo_urls as string[]) ?? []).filter(Boolean);
  const first = (r.photo_url as string) ?? undefined;
  return {
    questionId: r.question_id as string,
    type: r.type as Answer["type"],
    selectedIndex: (r.selected_index as number) ?? undefined,
    text: (r.text as string) ?? undefined,
    photoDataUrl: first ?? urls[0],
    photoUrls: urls.length ? urls : first ? [first] : undefined,
    marksAwarded: (r.marks_awarded as number) ?? undefined,
    feedback: (r.feedback as string) ?? undefined,
  };
};

const mapActivity = (r: Row): Activity => ({
  id: r.id as string,
  type: r.type as ActivityType,
  title: r.title as string,
  description: (r.description as string) ?? undefined,
  studentId: (r.student_id as string) ?? undefined,
  testId: (r.test_id as string) ?? undefined,
  noteId: (r.note_id as string) ?? undefined,
  submissionId: (r.submission_id as string) ?? undefined,
  link: (r.link as string) ?? undefined,
  audience: r.audience as Activity["audience"],
  readBy: (r.read_by as string[]) ?? [],
  createdAt: r.created_at as string,
});

const mapSubmission = (r: Row): Submission => ({
  id: r.id as string,
  testId: r.test_id as string,
  studentId: r.student_id as string,
  status: r.status as Submission["status"],
  startedAt: r.started_at as string,
  submittedAt: (r.submitted_at as string) ?? undefined,
  autoSubmitted: (r.auto_submitted as boolean) ?? undefined,
  durationSeconds: (r.duration_seconds as number) ?? undefined,
  releasedAt: (r.released_at as string) ?? undefined,
  answers: ((r.answers as Row[]) ?? []).map(mapAnswer),
});

const mapAnnouncement = (r: Row): Announcement => ({
  id: r.id as string,
  body: r.body as string,
  pinned: r.pinned as boolean,
  cohortId: (r.cohort_id as string) ?? null,
  createdAt: r.created_at as string,
  dismissedBy: (r.dismissed_by as string[]) ?? [],
});

function mapBank(r: Row): QuestionBankItem {
  const base = {
    id: r.id as string,
    subject: r.subject as string,
    prompt: r.prompt as string,
    marks: r.marks as number,
    topic: r.topic as string,
  };
  if (r.type === "mcq") {
    return { ...base, type: "mcq", options: (r.options as string[]) ?? [], correctIndex: (r.correct_index as number) ?? 0 };
  }
  if (r.type === "text") {
    return {
      ...base,
      type: "text",
      maxLength: (r.max_length as number) ?? undefined,
      showCounter: (r.show_counter as boolean) ?? undefined,
    };
  }
  return { ...base, type: "photo" };
}

// Domain -> insert/update row shapes.
function questionToRow(testId: string, id: string, q: Omit<Question, "id" | "order">, order: number): Row {
  const v = q as QuestionInput;
  return {
    id,
    test_id: testId,
    type: v.type,
    prompt: v.prompt,
    marks: v.marks,
    topic: v.topic,
    options: v.type === "mcq" ? v.options : null,
    max_length: v.type === "text" ? v.maxLength ?? null : null,
    show_counter: v.type === "text" ? v.showCounter ?? null : null,
    sort_order: order,
  };
}

function testPatchToRow(patch: Partial<Omit<Test, "id" | "createdAt" | "questions">>): Row {
  const row: Row = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.subject !== undefined) row.subject = patch.subject;
  if (patch.durationMinutes !== undefined) row.duration_minutes = patch.durationMinutes;
  if (patch.cohortId !== undefined) row.cohort_id = patch.cohortId;
  if (patch.classId !== undefined) row.class_id = patch.classId;
  if (patch.subjectId !== undefined) row.subject_id = patch.subjectId;
  if (patch.opensAt !== undefined) row.opens_at = patch.opensAt;
  if (patch.closesAt !== undefined) row.closes_at = patch.closesAt;
  if (patch.testCode !== undefined) row.test_code = patch.testCode;
  if (patch.status !== undefined) row.status = patch.status;
  return row;
}

// ---------------------------------------------------------------------------
class Store {
  private state: Database = EMPTY;
  private listeners = new Set<() => void>();
  ready = false;
  private report: (msg: string) => void = (m) => console.error("[store]", m);

  setErrorReporter(fn: (msg: string) => void) {
    this.report = fn;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.state;
  getReady = () => this.ready;

  private notify() {
    this.listeners.forEach((l) => l());
  }
  private commit(mutator: (draft: Database) => void) {
    const next: Database = structuredClone(this.state);
    mutator(next);
    this.state = next;
    this.notify();
  }
  /** Fire-and-forget a Supabase write; surface failures through the reporter. */
  private run(p: PromiseLike<{ error: { message: string } | null }>, label: string) {
    Promise.resolve(p)
      .then(({ error }) => {
        if (error) this.report(`${label}: ${error.message}`);
      })
      .catch((e) => this.report(`${label}: ${String(e)}`));
  }

  // ---- Lifecycle -------------------------------------------------------
  /**
   * Hydrate the cache from Supabase (scoped by RLS for the current session).
   *
   * `load()` is the first hydration (flips `ready`); `refresh()` re-runs the same
   * fetch against a live cache. Both funnel through here so there is exactly one
   * fetch definition. Every query is error-checked: a slice that fails KEEPS its
   * previous value instead of silently collapsing to [] (which used to make live
   * rows — notes especially — look as though they had vanished).
   */
  async load() {
    await this.hydrate(true);
  }

  /**
   * Re-read the database into the cache. Used when the app regains focus and
   * before a student opens a test, so writes made in another session (a teacher
   * editing an MCQ) are picked up. Coalesces concurrent calls.
   */
  async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.hydrate(false).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }
  private refreshing: Promise<void> | null = null;

  /**
   * Pull one test and its questions straight from the database and merge them
   * into the cache. This is the guarantee that a student always sits the LATEST
   * version of a paper: option text, option order, marks and the question set
   * itself are re-read immediately before the runner builds its answer sheet.
   */
  async refreshTest(testId: string): Promise<void> {
    const sb = supabase();
    const [tst, keys] = await Promise.all([
      sb.from("tests").select("*, questions(*)").eq("id", testId).maybeSingle(),
      sb.from("question_keys").select("*"), // admin-only; empty for students
    ]);
    if (tst.error) {
      this.report(`refreshTest: ${tst.error.message}`);
      return;
    }
    const t = tst.data as Row | null;
    if (!t) return;

    const correctByQ = new Map<string, number>();
    for (const k of (keys.data as Row[]) ?? []) {
      correctByQ.set(k.question_id as string, k.correct_index as number);
    }

    const fresh: Test = {
      id: t.id as string,
      title: t.title as string,
      subject: t.subject as string,
      durationMinutes: t.duration_minutes as number,
      cohortId: (t.cohort_id as string) ?? null,
      classId: (t.class_id as string) ?? null,
      subjectId: (t.subject_id as string) ?? null,
      opensAt: t.opens_at as string,
      closesAt: t.closes_at as string,
      testCode: t.test_code as string,
      status: t.status as TestStatus,
      createdAt: t.created_at as string,
      questions: ((t.questions as Row[]) ?? [])
        .map((q) => mapQuestion(q, correctByQ.get(q.id as string)))
        .sort((a, b) => a.order - b.order),
    };

    this.commit((d) => {
      const idx = d.tests.findIndex((x) => x.id === testId);
      if (idx >= 0) d.tests[idx] = fresh;
      else d.tests.push(fresh);
    });
  }

  private async hydrate(initial: boolean) {
    const sb = supabase();
    const [coh, stu, tst, sub, ann, bnk, keys, cls, subj, cCls, cSubj, sCls, sSubj, nts, nAssigns, acts] = await Promise.all([
      sb.from("cohorts").select("*").order("created_at"),
      sb.from("students").select("*").order("created_at"),
      sb.from("tests").select("*, questions(*)").order("created_at"),
      sb.from("submissions").select("*, answers(*)"),
      sb.from("announcements").select("*").order("created_at", { ascending: false }),
      sb.from("question_bank").select("*").order("created_at"),
      sb.from("question_keys").select("*"), // admin-only: empty for students
      sb.from("classes").select("*").order("name"),
      sb.from("subjects").select("*").order("name"),
      sb.from("cohort_classes").select("*"),
      sb.from("cohort_subjects").select("*"),
      sb.from("student_classes").select("*"),
      sb.from("student_subjects").select("*"),
      sb.from("notes").select("*").order("created_at", { ascending: false }),
      sb.from("note_assignments").select("*"),
      // Feed is capped: the bell only ever shows recent history.
      sb.from("activities").select("*").order("created_at", { ascending: false }).limit(100),
    ]);

    // Every slice is checked — not just the first six. A query that fails is
    // reported and keeps its previously cached value (see `keep` below), so a
    // transient failure can never masquerade as "you have no notes/tests".
    const labelled: Array<[string, { error: { message: string } | null }]> = [
      ["cohorts", coh], ["students", stu], ["tests", tst], ["submissions", sub],
      ["announcements", ann], ["question_bank", bnk], ["question_keys", keys],
      ["classes", cls], ["subjects", subj], ["cohort_classes", cCls],
      ["cohort_subjects", cSubj], ["student_classes", sCls], ["student_subjects", sSubj],
      ["notes", nts], ["note_assignments", nAssigns], ["activities", acts],
    ];
    const failed = labelled.filter(([, r]) => r.error);
    for (const [name, r] of failed) {
      this.report(`${initial ? "load" : "refresh"} ${name}: ${r.error!.message}`);
    }

    const prev = this.state;
    /** Use freshly fetched rows, or fall back to what we already had on error. */
    const keep = <T>(r: { error: unknown }, next: () => T[], previous: T[]): T[] =>
      r.error ? previous : next();

    // Correct-option lookup: admin gets it from question_keys; a student gets it
    // only from their own released answers (RLS withholds it otherwise).
    const correctByQ = new Map<string, number>();
    for (const k of (keys.data as Row[]) ?? []) correctByQ.set(k.question_id as string, k.correct_index as number);
    for (const s of (sub.data as Row[]) ?? []) {
      if (s.status !== "released") continue;
      for (const a of (s.answers as Row[]) ?? []) {
        if (a.type === "mcq" && a.correct_index != null) correctByQ.set(a.question_id as string, a.correct_index as number);
      }
    }

    const tests: Test[] = ((tst.data as Row[]) ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      subject: t.subject as string,
      durationMinutes: t.duration_minutes as number,
      cohortId: (t.cohort_id as string) ?? null,
      classId: (t.class_id as string) ?? null,
      subjectId: (t.subject_id as string) ?? null,
      opensAt: t.opens_at as string,
      closesAt: t.closes_at as string,
      testCode: t.test_code as string,
      status: t.status as TestStatus,
      createdAt: t.created_at as string,
      questions: ((t.questions as Row[]) ?? [])
        .map((q) => mapQuestion(q, correctByQ.get(q.id as string)))
        .sort((a, b) => a.order - b.order),
    }));

    // Build class/subject id maps for cohorts and students.
    const cohortClassMap = new Map<string, string[]>();
    const cohortSubjectMap = new Map<string, string[]>();
    for (const r of (cCls.data as Row[]) ?? []) {
      const cid = r.cohort_id as string;
      if (!cohortClassMap.has(cid)) cohortClassMap.set(cid, []);
      cohortClassMap.get(cid)!.push(r.class_id as string);
    }
    for (const r of (cSubj.data as Row[]) ?? []) {
      const cid = r.cohort_id as string;
      if (!cohortSubjectMap.has(cid)) cohortSubjectMap.set(cid, []);
      cohortSubjectMap.get(cid)!.push(r.subject_id as string);
    }

    const studentClassMap = new Map<string, string[]>();
    const studentSubjectMap = new Map<string, string[]>();
    for (const r of (sCls.data as Row[]) ?? []) {
      const sid = r.student_id as string;
      if (!studentClassMap.has(sid)) studentClassMap.set(sid, []);
      studentClassMap.get(sid)!.push(r.class_id as string);
    }
    for (const r of (sSubj.data as Row[]) ?? []) {
      const sid = r.student_id as string;
      if (!studentSubjectMap.has(sid)) studentSubjectMap.set(sid, []);
      studentSubjectMap.get(sid)!.push(r.subject_id as string);
    }

    this.state = {
      activities: keep(acts, () => ((acts.data as Row[]) ?? []).map(mapActivity), prev.activities),
      cohorts: keep(coh, () => ((coh.data as Row[]) ?? []).map((r) =>
        mapCohort(r, cohortClassMap.get(r.id as string) ?? [], cohortSubjectMap.get(r.id as string) ?? [])
      ), prev.cohorts),
      students: keep(stu, () => ((stu.data as Row[]) ?? []).map((r) =>
        mapStudent(r, studentClassMap.get(r.id as string) ?? [], studentSubjectMap.get(r.id as string) ?? [])
      ), prev.students),
      tests: keep(tst, () => tests, prev.tests),
      submissions: keep(sub, () => ((sub.data as Row[]) ?? []).map(mapSubmission), prev.submissions),
      announcements: keep(ann, () => ((ann.data as Row[]) ?? []).map(mapAnnouncement), prev.announcements),
      bank: keep(bnk, () => ((bnk.data as Row[]) ?? []).map(mapBank), prev.bank),
      classes: keep(cls, () => ((cls.data as Row[]) ?? []).map(mapClass), prev.classes),
      subjects: keep(subj, () => ((subj.data as Row[]) ?? []).map(mapSubject), prev.subjects),
      notes: keep(nts, () => ((nts.data as Row[]) ?? []).map(mapNote), prev.notes),
      noteAssignments: keep(nAssigns, () => ((nAssigns.data as Row[]) ?? []).map(mapNoteAssignment), prev.noteAssignments),
    };
    this.ready = true;
    this.notify();
  }

  reset() {
    this.state = EMPTY;
    this.ready = false;
    this.notify();
  }

  // ---- Cohorts ---------------------------------------------------------
  addCohort(name: string, color: CohortColor) {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.cohorts.push({ id, name, color, classIds: [], subjectIds: [], createdAt }));
    this.run(supabase().from("cohorts").insert({ id, name, color, created_at: createdAt }), "addCohort");
    return id;
  }
  updateCohort(id: string, patch: Partial<Pick<Cohort, "name" | "color">>) {
    this.commit((d) => {
      const c = d.cohorts.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    });
    this.run(supabase().from("cohorts").update(patch).eq("id", id), "updateCohort");
  }
  deleteCohort(id: string, reassignToId: string) {
    this.commit((d) => {
      d.students.forEach((s) => { if (s.cohortId === id) s.cohortId = reassignToId; });
      d.tests.forEach((t) => { if (t.cohortId === id) t.cohortId = reassignToId; });
      d.announcements.forEach((a) => { if (a.cohortId === id) a.cohortId = reassignToId; });
      d.cohorts = d.cohorts.filter((c) => c.id !== id);
    });
    const sb = supabase();
    this.run(sb.from("students").update({ cohort_id: reassignToId }).eq("cohort_id", id), "deleteCohort/students");
    this.run(sb.from("tests").update({ cohort_id: reassignToId }).eq("cohort_id", id), "deleteCohort/tests");
    this.run(sb.from("announcements").update({ cohort_id: reassignToId }).eq("cohort_id", id), "deleteCohort/announcements");
    // Delete only after reassignment so the FKs never dangle.
    Promise.resolve()
      .then(() => sb.from("cohorts").delete().eq("id", id))
      .then(({ error }) => { if (error) this.report(`deleteCohort: ${error.message}`); });
  }

  setCohortClasses(cohortId: string, classIds: string[]) {
    this.commit((d) => {
      const c = d.cohorts.find((x) => x.id === cohortId);
      if (c) c.classIds = classIds;
    });
    const sb = supabase();
    void (async () => {
      await sb.from("cohort_classes").delete().eq("cohort_id", cohortId);
      if (classIds.length) {
        const { error } = await sb.from("cohort_classes").insert(classIds.map((cid) => ({ cohort_id: cohortId, class_id: cid })));
        if (error) this.report(`setCohortClasses: ${error.message}`);
      }
    })();
  }
  setCohortSubjects(cohortId: string, subjectIds: string[]) {
    this.commit((d) => {
      const c = d.cohorts.find((x) => x.id === cohortId);
      if (c) c.subjectIds = subjectIds;
    });
    const sb = supabase();
    void (async () => {
      await sb.from("cohort_subjects").delete().eq("cohort_id", cohortId);
      if (subjectIds.length) {
        const { error } = await sb.from("cohort_subjects").insert(subjectIds.map((sid) => ({ cohort_id: cohortId, subject_id: sid })));
        if (error) this.report(`setCohortSubjects: ${error.message}`);
      }
    })();
  }

  // ---- Classes & Subjects (global catalogue) ---------------------------
  addClass(name: string): string {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.classes.push({ id, name, createdAt }));
    this.run(supabase().from("classes").insert({ id, name, created_at: createdAt }), "addClass");
    return id;
  }
  updateClass(id: string, name: string) {
    this.commit((d) => {
      const c = d.classes.find((x) => x.id === id);
      if (c) c.name = name;
    });
    this.run(supabase().from("classes").update({ name }).eq("id", id), "updateClass");
  }
  deleteClass(id: string) {
    this.commit((d) => {
      d.classes = d.classes.filter((c) => c.id !== id);
      d.cohorts.forEach((c) => { c.classIds = c.classIds.filter((ci) => ci !== id); });
      d.students.forEach((s) => { s.classIds = s.classIds.filter((ci) => ci !== id); });
      d.noteAssignments = d.noteAssignments.filter((na) => na.classId !== id);
    });
    this.run(supabase().from("classes").delete().eq("id", id), "deleteClass");
  }
  addSubject(name: string): string {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.subjects.push({ id, name, createdAt }));
    this.run(supabase().from("subjects").insert({ id, name, created_at: createdAt }), "addSubject");
    return id;
  }
  updateSubject(id: string, name: string) {
    this.commit((d) => {
      const s = d.subjects.find((x) => x.id === id);
      if (s) s.name = name;
    });
    this.run(supabase().from("subjects").update({ name }).eq("id", id), "updateSubject");
  }
  deleteSubject(id: string) {
    this.commit((d) => {
      d.subjects = d.subjects.filter((s) => s.id !== id);
      d.cohorts.forEach((c) => { c.subjectIds = c.subjectIds.filter((si) => si !== id); });
      d.students.forEach((s) => { s.subjectIds = s.subjectIds.filter((si) => si !== id); });
      d.noteAssignments = d.noteAssignments.filter((na) => na.subjectId !== id);
    });
    this.run(supabase().from("subjects").delete().eq("id", id), "deleteSubject");
  }

  // ---- Student class/subject enrolment ---------------------------------
  setStudentClasses(studentId: string, classIds: string[]) {
    const before = this.state.students.find((x) => x.id === studentId)?.classIds ?? [];
    const student = this.state.students.find((x) => x.id === studentId);
    const nameOf = (id: string) => this.state.classes.find((c) => c.id === id)?.name ?? "a class";

    for (const id of classIds.filter((c) => !before.includes(c))) {
      this.logActivity({
        type: "student_joined_class",
        title: "Student joined a class",
        description: `${student?.username ?? "Student"} → ${nameOf(id)}`,
        studentId,
        link: `/admin/roster/${studentId}`,
      });
    }
    for (const id of before.filter((c) => !classIds.includes(c))) {
      this.logActivity({
        type: "student_left_class",
        title: "Student left a class",
        description: `${student?.username ?? "Student"} → ${nameOf(id)}`,
        studentId,
        link: `/admin/roster/${studentId}`,
      });
    }

    this.commit((d) => {
      const s = d.students.find((x) => x.id === studentId);
      if (s) s.classIds = classIds;
    });
    const sb = supabase();
    void (async () => {
      await sb.from("student_classes").delete().eq("student_id", studentId);
      if (classIds.length) {
        const { error } = await sb.from("student_classes").insert(classIds.map((cid) => ({ student_id: studentId, class_id: cid })));
        if (error) this.report(`setStudentClasses: ${error.message}`);
      }
    })();
  }
  setStudentSubjects(studentId: string, subjectIds: string[]) {
    this.commit((d) => {
      const s = d.students.find((x) => x.id === studentId);
      if (s) s.subjectIds = subjectIds;
    });
    const sb = supabase();
    void (async () => {
      await sb.from("student_subjects").delete().eq("student_id", studentId);
      if (subjectIds.length) {
        const { error } = await sb.from("student_subjects").insert(subjectIds.map((sid) => ({ student_id: studentId, subject_id: sid })));
        if (error) this.report(`setStudentSubjects: ${error.message}`);
      }
    })();
  }

  // ---- Students (privileged: via the admin-users edge function) --------
  usernameTaken(username: string, exceptId?: string): boolean {
    return this.state.students.some(
      (s) => s.username.toLowerCase() === username.trim().toLowerCase() && s.id !== exceptId,
    );
  }
  addStudent(input: Omit<Student, "id" | "createdAt">) {
    supabase()
      .functions.invoke("admin-users", {
        body: {
          action: "create",
          username: input.username,
          email: input.email,
          cohortId: input.cohortId,
          password: input.tempPassword,
        },
      })
      .then(({ data, error }) => {
        if (error || (data as Row)?.error) {
          this.report(`addStudent: ${error?.message ?? (data as Row)?.error}`);
          return;
        }
        const row = (data as Row).student as Row;
        const student = mapStudent(row, input.classIds, input.subjectIds);
        this.commit((d) => d.students.push(student));
        if (input.classIds.length) this.setStudentClasses(student.id, input.classIds);
        if (input.subjectIds.length) this.setStudentSubjects(student.id, input.subjectIds);
      });
  }
  updateStudent(id: string, patch: Partial<Omit<Student, "id" | "createdAt">>) {
    this.commit((d) => {
      const s = d.students.find((x) => x.id === id);
      if (s) Object.assign(s, {
        username: patch.username ?? s.username,
        email: patch.email,
        cohortId: patch.cohortId ?? s.cohortId,
        classIds: patch.classIds ?? s.classIds,
        subjectIds: patch.subjectIds ?? s.subjectIds,
      });
    });
    const s = this.state.students.find((x) => x.id === id);
    supabase()
      .functions.invoke("admin-users", {
        body: {
          action: "update",
          studentId: id,
          username: patch.username ?? s?.username,
          email: patch.email,
          cohortId: patch.cohortId ?? s?.cohortId,
          password: patch.tempPassword || undefined,
        },
      })
      .then(({ data, error }) => {
        if (error || (data as Row)?.error) this.report(`updateStudent: ${error?.message ?? (data as Row)?.error}`);
      });
    if (patch.classIds !== undefined) this.setStudentClasses(id, patch.classIds);
    if (patch.subjectIds !== undefined) this.setStudentSubjects(id, patch.subjectIds);
  }
  deleteStudent(id: string) {
    this.commit((d) => {
      d.students = d.students.filter((s) => s.id !== id);
      d.submissions = d.submissions.filter((s) => s.studentId !== id);
    });
    supabase()
      .functions.invoke("admin-users", { body: { action: "delete", studentId: id } })
      .then(({ data, error }) => {
        if (error || (data as Row)?.error) this.report(`deleteStudent: ${error?.message ?? (data as Row)?.error}`);
      });
  }

  // ---- Tests + questions ----------------------------------------------
  addTest(input: Omit<Test, "id" | "createdAt" | "questions"> & { questions?: Question[] }): string {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) =>
      d.tests.push({ ...input, id, questions: input.questions ?? [], createdAt }),
    );
    this.run(
      supabase().from("tests").insert({
        id,
        title: input.title,
        subject: input.subject,
        duration_minutes: input.durationMinutes,
        cohort_id: input.cohortId,
        class_id: input.classId,
        subject_id: input.subjectId,
        opens_at: input.opensAt,
        closes_at: input.closesAt,
        test_code: input.testCode,
        status: input.status,
        created_at: createdAt,
      }),
      "addTest",
    );
    this.logActivity({
      type: "test_created",
      title: "Test created",
      description: input.title,
      testId: id,
      link: `/admin/tests/${id}`,
    });
    return id;
  }
  updateTest(id: string, patch: Partial<Omit<Test, "id" | "createdAt" | "questions">>) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
    });
    this.run(supabase().from("tests").update(testPatchToRow(patch)).eq("id", id), "updateTest");
    const title = this.state.tests.find((t) => t.id === id)?.title;
    this.logActivity({
      type: "test_updated",
      title: patch.status ? `Test marked ${patch.status}` : "Test updated",
      description: title,
      testId: id,
      link: `/admin/tests/${id}`,
    });
  }
  setTestStatus(id: string, status: TestStatus) {
    this.updateTest(id, { status });
  }
  deleteTest(id: string) {
    const title = this.state.tests.find((t) => t.id === id)?.title;
    this.commit((d) => {
      d.tests = d.tests.filter((t) => t.id !== id);
      d.submissions = d.submissions.filter((s) => s.testId !== id);
    });
    this.run(supabase().from("tests").delete().eq("id", id), "deleteTest");
    // No testId: the FK would cascade this entry away with the test itself.
    this.logActivity({ type: "test_deleted", title: "Test deleted", description: title });
  }
  addQuestion(testId: string, q: Omit<Question, "id" | "order">) {
    const id = genId();
    let order = 0;
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      if (t) {
        order = t.questions.length;
        t.questions.push({ ...q, id, order } as Question);
      }
    });
    const sb = supabase();
    const v = q as QuestionInput;
    // The key has a FK to questions(id), so it MUST be inserted after the
    // question row commits — otherwise a concurrent insert can lose the key and
    // the MCQ grades as wrong. Sequence the two writes.
    void (async () => {
      const { error: qErr } = await sb.from("questions").insert(questionToRow(testId, id, q, order));
      if (qErr) return this.report(`addQuestion: ${qErr.message}`);
      if (v.type === "mcq") {
        const { error: kErr } = await sb.from("question_keys").insert({ question_id: id, correct_index: v.correctIndex });
        if (kErr) this.report(`addQuestion/key: ${kErr.message}`);
      }
    })();
  }
  updateQuestion(testId: string, questionId: string, q: Omit<Question, "id" | "order">) {
    let order = 0;
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      const idx = t?.questions.findIndex((x) => x.id === questionId) ?? -1;
      if (t && idx >= 0) {
        order = t.questions[idx].order;
        t.questions[idx] = { ...q, id: questionId, order } as Question;
      }
    });
    const sb = supabase();
    const v = q as QuestionInput;
    const { id: _id, test_id: _t, sort_order: _o, ...fields } = questionToRow(testId, questionId, q, order);
    void _id; void _t; void _o;
    void (async () => {
      const { error: qErr } = await sb.from("questions").update(fields).eq("id", questionId);
      if (qErr) return this.report(`updateQuestion: ${qErr.message}`);
      if (v.type === "mcq") {
        const { error: kErr } = await sb
          .from("question_keys")
          .upsert({ question_id: questionId, correct_index: v.correctIndex });
        if (kErr) this.report(`updateQuestion/key: ${kErr.message}`);
      } else {
        const { error: kErr } = await sb.from("question_keys").delete().eq("question_id", questionId);
        if (kErr) this.report(`updateQuestion/key-clear: ${kErr.message}`);
      }
    })();
  }
  deleteQuestion(testId: string, questionId: string) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      if (t) t.questions = t.questions.filter((q) => q.id !== questionId).map((q, i) => ({ ...q, order: i }));
    });
    // question_keys row cascades on delete.
    this.run(supabase().from("questions").delete().eq("id", questionId), "deleteQuestion");
    this.persistReorder(testId);
  }
  reorderQuestions(testId: string, orderedIds: string[]) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      if (!t) return;
      t.questions = orderedIds
        .map((qid, i) => {
          const q = t.questions.find((x) => x.id === qid);
          return q ? { ...q, order: i } : null;
        })
        .filter((q): q is Question => q !== null);
    });
    this.persistReorder(testId);
  }
  private persistReorder(testId: string) {
    const t = this.state.tests.find((x) => x.id === testId);
    if (!t) return;
    const sb = supabase();
    t.questions.forEach((q) => {
      this.run(sb.from("questions").update({ sort_order: q.order }).eq("id", q.id), "reorderQuestions");
    });
  }
  importBankItems(testId: string, bankIds: string[]) {
    const sb = supabase();
    const pending: { id: string; rest: Omit<Question, "id" | "order">; order: number; correctIndex?: number }[] = [];
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      if (!t) return;
      bankIds.forEach((bid) => {
        const item = d.bank.find((b) => b.id === bid);
        if (!item) return;
        const id = genId();
        const order = t.questions.length;
        const { subject: _s, id: _i, ...rest } = item;
        void _s; void _i;
        t.questions.push({ ...rest, id, order } as Question);
        pending.push({
          id,
          rest: rest as Omit<Question, "id" | "order">,
          order,
          correctIndex: item.type === "mcq" ? item.correctIndex : undefined,
        });
      });
    });
    // Persist each question, then its key (FK ordering — see addQuestion).
    void (async () => {
      for (const p of pending) {
        const { error: qErr } = await sb.from("questions").insert(questionToRow(testId, p.id, p.rest, p.order));
        if (qErr) { this.report(`importBank: ${qErr.message}`); continue; }
        if (p.correctIndex !== undefined) {
          const { error: kErr } = await sb.from("question_keys").insert({ question_id: p.id, correct_index: p.correctIndex });
          if (kErr) this.report(`importBank/key: ${kErr.message}`);
        }
      }
    })();
  }

  // ---- Submissions -----------------------------------------------------
  async submitTest(input: {
    testId: string;
    studentId: string;
    answers: Answer[];
    startedAt: string;
    autoSubmitted: boolean;
    durationSeconds: number;
  }): Promise<string> {
    const id = genId();
    const submittedAt = new Date().toISOString();
    // Optimistic: show the submission immediately (MCQ marks fill in server-side).
    this.commit((d) => {
      d.submissions = d.submissions.filter(
        (s) => !(s.testId === input.testId && s.studentId === input.studentId),
      );
      d.submissions.push({
        id,
        testId: input.testId,
        studentId: input.studentId,
        answers: input.answers,
        status: "submitted",
        startedAt: input.startedAt,
        submittedAt,
        autoSubmitted: input.autoSubmitted,
        durationSeconds: input.durationSeconds,
      });
    });

    const sb = supabase();
    const { error: subErr } = await sb.from("submissions").insert({
      id,
      test_id: input.testId,
      student_id: input.studentId,
      status: "submitted",
      started_at: input.startedAt,
      submitted_at: submittedAt,
      auto_submitted: input.autoSubmitted,
      duration_seconds: input.durationSeconds,
    });
    if (subErr) {
      this.report(`submitTest: ${subErr.message}`);
      return id;
    }
    const rows = input.answers.map((a) => {
      // Keep photo_url populated with the first image so existing grading /
      // results / evaluation paths are untouched; photo_urls carries the rest.
      const urls = a.photoUrls?.filter(Boolean) ?? (a.photoDataUrl ? [a.photoDataUrl] : []);
      return {
        submission_id: id,
        question_id: a.questionId,
        type: a.type,
        selected_index: a.selectedIndex ?? null,
        text: a.text ?? null,
        photo_url: urls[0] ?? a.photoDataUrl ?? null,
        photo_urls: urls,
      };
    });
    if (rows.length) {
      const { error: ansErr } = await sb.from("answers").insert(rows);
      if (ansErr) this.report(`submitTest/answers: ${ansErr.message}`);
    }

    const test = this.state.tests.find((t) => t.id === input.testId);
    const student = this.state.students.find((s) => s.id === input.studentId);
    this.logActivity({
      type: input.autoSubmitted ? "test_completed" : "test_submitted",
      title: input.autoSubmitted ? "Test auto-submitted (time up)" : "Student submitted a test",
      description: [student?.username, test?.title].filter(Boolean).join(" — "),
      studentId: input.studentId,
      testId: input.testId,
      submissionId: id,
      link: `/admin/grading/${id}`,
    });
    return id;
  }
  gradeAnswer(submissionId: string, questionId: string, marksAwarded: number, feedback?: string) {
    this.commit((d) => {
      const ans = d.submissions.find((s) => s.id === submissionId)?.answers.find((a) => a.questionId === questionId);
      if (ans) {
        ans.marksAwarded = marksAwarded;
        if (feedback !== undefined) ans.feedback = feedback;
      }
    });
    const patch: Row = { marks_awarded: marksAwarded };
    if (feedback !== undefined) patch.feedback = feedback;
    this.run(
      supabase().from("answers").update(patch).eq("submission_id", submissionId).eq("question_id", questionId),
      "gradeAnswer",
    );
  }
  releaseSubmission(submissionId: string) {
    const releasedAt = new Date().toISOString();
    const sub = this.state.submissions.find((s) => s.id === submissionId);
    this.commit((d) => {
      const s = d.submissions.find((x) => x.id === submissionId);
      if (s) { s.status = "released"; s.releasedAt = releasedAt; }
    });
    this.run(
      supabase().from("submissions").update({ status: "released", released_at: releasedAt }).eq("id", submissionId),
      "releaseSubmission",
    );
    if (sub) {
      const test = this.state.tests.find((t) => t.id === sub.testId);
      // Addressed to the student: their result is now visible.
      this.logActivity({
        type: "submission_reviewed",
        title: "Your submission was reviewed",
        description: test?.title,
        studentId: sub.studentId,
        testId: sub.testId,
        submissionId,
        link: `/results/${sub.testId}`,
        audience: "student",
      });
    }
  }
  bulkReleaseForTest(testId: string) {
    const releasedAt = new Date().toISOString();
    this.commit((d) => {
      d.submissions
        .filter((s) => s.testId === testId && s.status === "submitted")
        .forEach((s) => { s.status = "released"; s.releasedAt = releasedAt; });
    });
    this.run(
      supabase()
        .from("submissions")
        .update({ status: "released", released_at: releasedAt })
        .eq("test_id", testId)
        .eq("status", "submitted"),
      "bulkReleaseForTest",
    );
  }
  unreleaseSubmission(submissionId: string) {
    this.commit((d) => {
      const sub = d.submissions.find((s) => s.id === submissionId);
      if (sub) { sub.status = "submitted"; sub.releasedAt = undefined; }
    });
    this.run(
      supabase().from("submissions").update({ status: "submitted", released_at: null }).eq("id", submissionId),
      "unreleaseSubmission",
    );
  }
  deleteSubmission(submissionId: string) {
    this.commit((d) => { d.submissions = d.submissions.filter((s) => s.id !== submissionId); });
    this.run(supabase().from("submissions").delete().eq("id", submissionId), "deleteSubmission");
  }

  // ---- Announcements ---------------------------------------------------
  addAnnouncement(input: Omit<Announcement, "id" | "createdAt" | "dismissedBy">) {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.announcements.unshift({ ...input, id, createdAt, dismissedBy: [] }));
    this.run(
      supabase().from("announcements").insert({
        id,
        body: input.body,
        pinned: input.pinned,
        cohort_id: input.cohortId,
        created_at: createdAt,
        dismissed_by: [],
      }),
      "addAnnouncement",
    );
  }
  updateAnnouncement(id: string, patch: Partial<Pick<Announcement, "body" | "pinned" | "cohortId">>) {
    this.commit((d) => {
      const a = d.announcements.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
    });
    const row: Row = {};
    if (patch.body !== undefined) row.body = patch.body;
    if (patch.pinned !== undefined) row.pinned = patch.pinned;
    if (patch.cohortId !== undefined) row.cohort_id = patch.cohortId;
    this.run(supabase().from("announcements").update(row).eq("id", id), "updateAnnouncement");
  }
  deleteAnnouncement(id: string) {
    this.commit((d) => { d.announcements = d.announcements.filter((a) => a.id !== id); });
    this.run(supabase().from("announcements").delete().eq("id", id), "deleteAnnouncement");
  }
  dismissAnnouncement(id: string, studentId: string) {
    this.commit((d) => {
      const a = d.announcements.find((x) => x.id === id);
      if (a && !a.dismissedBy.includes(studentId)) a.dismissedBy.push(studentId);
    });
    // Students can't UPDATE announcements directly — go through the RPC.
    this.run(supabase().rpc("dismiss_announcement", { p_id: id }), "dismissAnnouncement");
  }

  // ---- Question bank ---------------------------------------------------
  addBankItem(item: Omit<QuestionBankItem, "id">) {
    const id = genId();
    this.commit((d) => d.bank.push({ ...item, id } as QuestionBankItem));
    this.run(supabase().from("question_bank").insert(bankToRow(id, item)), "addBankItem");
  }
  updateBankItem(id: string, item: Omit<QuestionBankItem, "id">) {
    this.commit((d) => {
      const idx = d.bank.findIndex((b) => b.id === id);
      if (idx >= 0) d.bank[idx] = { ...item, id } as QuestionBankItem;
    });
    const { id: _id, ...fields } = bankToRow(id, item);
    void _id;
    this.run(supabase().from("question_bank").update(fields).eq("id", id), "updateBankItem");
  }
  deleteBankItem(id: string) {
    this.commit((d) => { d.bank = d.bank.filter((b) => b.id !== id); });
    this.run(supabase().from("question_bank").delete().eq("id", id), "deleteBankItem");
  }

  // ---- Notes -----------------------------------------------------------
  /**
   * Throws on failure. The optimistic row is rolled back first, so a note that
   * never reached the database can't linger in the UI looking uploaded and then
   * "disappear" on the next reload — the caller shows the real error instead.
   */
  async addNote(title: string, fileUrl: string, fileType: string, fileName: string): Promise<string> {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.notes.unshift({ id, title, fileUrl, fileType, fileName, createdAt }));
    const { error } = await supabase().from("notes").insert({
      id, title, file_url: fileUrl, file_type: fileType, file_name: fileName, created_at: createdAt,
    });
    if (error) {
      this.commit((d) => { d.notes = d.notes.filter((n) => n.id !== id); });
      this.report(`addNote: ${error.message}`);
      throw new Error(`Could not save the note: ${error.message}`);
    }
    this.logActivity({
      type: "notes_uploaded",
      title: "Notes uploaded",
      description: title,
      noteId: id,
      link: "/admin/notes",
    });
    return id;
  }
  deleteNote(id: string) {
    const title = this.state.notes.find((n) => n.id === id)?.title;
    this.commit((d) => {
      d.notes = d.notes.filter((n) => n.id !== id);
      d.noteAssignments = d.noteAssignments.filter((na) => na.noteId !== id);
    });
    this.run(supabase().from("notes").delete().eq("id", id), "deleteNote");
    // No noteId: the FK would cascade this entry away with the note itself.
    this.logActivity({ type: "notes_deleted", title: "Notes deleted", description: title });
  }
  /** Rolls the optimistic row back if the insert fails, so an assignment can
   *  never appear attached to a note without existing in the database. */
  async addNoteAssignment(noteId: string, cohortId: string, classId: string | null, subjectId: string | null): Promise<void> {
    const id = genId();
    const createdAt = new Date().toISOString();
    this.commit((d) => d.noteAssignments.push({ id, noteId, cohortId, classId, subjectId, createdAt }));
    const { error } = await supabase()
      .from("note_assignments")
      .insert({ id, note_id: noteId, cohort_id: cohortId, class_id: classId, subject_id: subjectId, created_at: createdAt });
    if (error) {
      this.commit((d) => { d.noteAssignments = d.noteAssignments.filter((na) => na.id !== id); });
      this.report(`addNoteAssignment: ${error.message}`);
      throw new Error(`Could not assign the note: ${error.message}`);
    }
    const note = this.state.notes.find((n) => n.id === noteId);
    const cohort = this.state.cohorts.find((c) => c.id === cohortId);
    this.logActivity({
      type: "notes_assigned",
      title: "Notes assigned",
      description: [note?.title, cohort?.name].filter(Boolean).join(" → "),
      noteId,
      link: "/admin/notes",
    });
  }
  deleteNoteAssignment(id: string) {
    this.commit((d) => { d.noteAssignments = d.noteAssignments.filter((na) => na.id !== id); });
    this.run(supabase().from("note_assignments").delete().eq("id", id), "deleteNoteAssignment");
  }

  // ---- Recent activity -------------------------------------------------
  /**
   * Append an entry to the activity feed.
   *
   * Deliberately best-effort: a feed write must never break the action that
   * produced it (a failed log should not fail a test submission), so errors are
   * reported and swallowed. RLS still guarantees a student can only log against
   * themselves. The row arrives back through realtime, so we do not commit
   * optimistically here — that would double up the entry for the actor.
   */
  logActivity(input: {
    type: ActivityType;
    title: string;
    description?: string;
    studentId?: string;
    testId?: string;
    noteId?: string;
    submissionId?: string;
    link?: string;
    audience?: Activity["audience"];
  }) {
    this.run(
      supabase().from("activities").insert({
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        student_id: input.studentId ?? null,
        test_id: input.testId ?? null,
        note_id: input.noteId ?? null,
        submission_id: input.submissionId ?? null,
        link: input.link ?? null,
        audience: input.audience ?? "admin",
      }),
      "logActivity",
    );
  }

  /** Mark entries read for the current user (server-side; no UPDATE grant). */
  markActivitiesRead(ids: string[], userId: string) {
    if (!ids.length) return;
    this.commit((d) => {
      d.activities.forEach((a) => {
        if (ids.includes(a.id) && !a.readBy.includes(userId)) a.readBy.push(userId);
      });
    });
    this.run(supabase().rpc("mark_activities_read", { p_ids: ids }), "markActivitiesRead");
  }

  /**
   * Live-stream new activities into the cache. One channel for the whole app;
   * RLS decides what each session actually receives. Push, not poll.
   */
  subscribeToActivities(): () => void {
    const sb = supabase();
    const channel = sb
      .channel("activities-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activities" },
        (payload) => {
          const row = payload.new as Row;
          this.commit((d) => {
            if (d.activities.some((a) => a.id === row.id)) return; // idempotent
            d.activities.unshift(mapActivity(row));
            if (d.activities.length > 100) d.activities.length = 100;
          });
        },
      )
      .subscribe();

    return () => { void sb.removeChannel(channel); };
  }
}

function bankToRow(id: string, item: Omit<QuestionBankItem, "id">): Row {
  const v = item as BankInput;
  return {
    id,
    subject: v.subject,
    type: v.type,
    prompt: v.prompt,
    marks: v.marks,
    topic: v.topic,
    options: v.type === "mcq" ? v.options : null,
    max_length: v.type === "text" ? v.maxLength ?? null : null,
    show_counter: v.type === "text" ? v.showCounter ?? null : null,
    correct_index: v.type === "mcq" ? v.correctIndex : null,
  };
}

// Module-level singleton (client only).
let storeSingleton: Store | null = null;
export function getStore(): Store {
  if (!storeSingleton) storeSingleton = new Store();
  return storeSingleton;
}

/** Reactive snapshot of the whole database. */
export function useDatabase(): Database {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Whether the cache has finished its initial Supabase hydration. */
export function useDataReady(): boolean {
  const store = getStore();
  return useSyncExternalStore(store.subscribe, store.getReady, () => false);
}

/** The action surface (stable singleton). */
export function useStore(): Store {
  return getStore();
}
