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
  Announcement,
  Answer,
  Cohort,
  CohortColor,
  Question,
  QuestionBankItem,
  QuestionCommon,
  QuestionVariant,
  Student,
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
  cohorts: [],
  students: [],
  tests: [],
  submissions: [],
  announcements: [],
  bank: [],
};

// ---------------------------------------------------------------------------
// Row <-> domain mappers (snake_case columns <-> camelCase types).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;

const mapCohort = (r: Row): Cohort => ({
  id: r.id as string,
  name: r.name as string,
  color: r.color as CohortColor,
  createdAt: r.created_at as string,
});

const mapStudent = (r: Row): Student => ({
  id: r.id as string,
  username: r.username as string,
  email: (r.email as string) ?? undefined,
  cohortId: (r.cohort_id as string) ?? "",
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

const mapAnswer = (r: Row): Answer => ({
  questionId: r.question_id as string,
  type: r.type as Answer["type"],
  selectedIndex: (r.selected_index as number) ?? undefined,
  text: (r.text as string) ?? undefined,
  photoDataUrl: (r.photo_url as string) ?? undefined,
  marksAwarded: (r.marks_awarded as number) ?? undefined,
  feedback: (r.feedback as string) ?? undefined,
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
  /** Hydrate the cache from Supabase (scoped by RLS for the current session). */
  async load() {
    const sb = supabase();
    const [coh, stu, tst, sub, ann, bnk, keys] = await Promise.all([
      sb.from("cohorts").select("*").order("created_at"),
      sb.from("students").select("*").order("created_at"),
      sb.from("tests").select("*, questions(*)").order("created_at"),
      sb.from("submissions").select("*, answers(*)"),
      sb.from("announcements").select("*").order("created_at", { ascending: false }),
      sb.from("question_bank").select("*").order("created_at"),
      sb.from("question_keys").select("*"), // admin-only: empty for students
    ]);

    const firstError = [coh, stu, tst, sub, ann, bnk].find((r) => r.error)?.error;
    if (firstError) this.report(`load: ${firstError.message}`);

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
      opensAt: t.opens_at as string,
      closesAt: t.closes_at as string,
      testCode: t.test_code as string,
      status: t.status as TestStatus,
      createdAt: t.created_at as string,
      questions: ((t.questions as Row[]) ?? [])
        .map((q) => mapQuestion(q, correctByQ.get(q.id as string)))
        .sort((a, b) => a.order - b.order),
    }));

    this.state = {
      cohorts: ((coh.data as Row[]) ?? []).map(mapCohort),
      students: ((stu.data as Row[]) ?? []).map(mapStudent),
      tests,
      submissions: ((sub.data as Row[]) ?? []).map(mapSubmission),
      announcements: ((ann.data as Row[]) ?? []).map(mapAnnouncement),
      bank: ((bnk.data as Row[]) ?? []).map(mapBank),
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
    this.commit((d) => d.cohorts.push({ id, name, color, createdAt }));
    this.run(supabase().from("cohorts").insert({ id, name, color, created_at: createdAt }), "addCohort");
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
        this.commit((d) => d.students.push(mapStudent(row)));
      });
  }
  updateStudent(id: string, patch: Partial<Omit<Student, "id" | "createdAt">>) {
    this.commit((d) => {
      const s = d.students.find((x) => x.id === id);
      if (s) Object.assign(s, { username: patch.username ?? s.username, email: patch.email, cohortId: patch.cohortId ?? s.cohortId });
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
        opens_at: input.opensAt,
        closes_at: input.closesAt,
        test_code: input.testCode,
        status: input.status,
        created_at: createdAt,
      }),
      "addTest",
    );
    return id;
  }
  updateTest(id: string, patch: Partial<Omit<Test, "id" | "createdAt" | "questions">>) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
    });
    this.run(supabase().from("tests").update(testPatchToRow(patch)).eq("id", id), "updateTest");
  }
  setTestStatus(id: string, status: TestStatus) {
    this.updateTest(id, { status });
  }
  deleteTest(id: string) {
    this.commit((d) => {
      d.tests = d.tests.filter((t) => t.id !== id);
      d.submissions = d.submissions.filter((s) => s.testId !== id);
    });
    this.run(supabase().from("tests").delete().eq("id", id), "deleteTest");
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
    this.run(sb.from("questions").insert(questionToRow(testId, id, q, order)), "addQuestion");
    if (v.type === "mcq") {
      this.run(sb.from("question_keys").insert({ question_id: id, correct_index: v.correctIndex }), "addQuestion/key");
    }
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
    this.run(sb.from("questions").update(fields).eq("id", questionId), "updateQuestion");
    if (v.type === "mcq") {
      this.run(
        sb.from("question_keys").upsert({ question_id: questionId, correct_index: v.correctIndex }),
        "updateQuestion/key",
      );
    } else {
      this.run(sb.from("question_keys").delete().eq("question_id", questionId), "updateQuestion/key-clear");
    }
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
        const q = { ...rest, id, order } as Question;
        t.questions.push(q);
        this.run(sb.from("questions").insert(questionToRow(testId, id, rest as Omit<Question, "id" | "order">, order)), "importBank");
        if (item.type === "mcq") {
          this.run(sb.from("question_keys").insert({ question_id: id, correct_index: item.correctIndex }), "importBank/key");
        }
      });
    });
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
    const rows = input.answers.map((a) => ({
      submission_id: id,
      question_id: a.questionId,
      type: a.type,
      selected_index: a.selectedIndex ?? null,
      text: a.text ?? null,
      photo_url: a.photoDataUrl ?? null,
    }));
    if (rows.length) {
      const { error: ansErr } = await sb.from("answers").insert(rows);
      if (ansErr) this.report(`submitTest/answers: ${ansErr.message}`);
    }
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
    this.commit((d) => {
      const sub = d.submissions.find((s) => s.id === submissionId);
      if (sub) { sub.status = "released"; sub.releasedAt = releasedAt; }
    });
    this.run(
      supabase().from("submissions").update({ status: "released", released_at: releasedAt }).eq("id", submissionId),
      "releaseSubmission",
    );
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
