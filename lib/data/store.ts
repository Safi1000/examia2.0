"use client";

/**
 * ============================================================================
 * THE SINGLE DATA SEAM.
 *
 * Every read and write in the app goes through this module. It is a mock,
 * localStorage-backed store today; to ship a real backend you reimplement the
 * action methods against Supabase (with RLS doing the cohort filtering that the
 * `*ForStudent` selectors approximate here). Components never touch storage.
 *
 * TODO(backend): swap the in-memory mutations for async Supabase calls.
 * TODO(rls): the cohort-scoping in selectors must be enforced server-side.
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
  Student,
  Submission,
  Test,
  TestStatus,
} from "@/types";
import { autoGradeMcq } from "@/lib/grading";
import { createSeed, type Database } from "@/lib/data/seed";

const STORAGE_KEY = "examia.db.v1";

function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

function load(): Database {
  if (typeof window === "undefined") return createSeed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Database;
  } catch {
    /* fall through to seed */
  }
  const seeded = createSeed();
  persist(seeded);
  return seeded;
}

function persist(db: Database) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* ignore quota errors in the mock */
  }
}

class Store {
  private state: Database;
  private listeners = new Set<() => void>();

  constructor() {
    this.state = load();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  private commit(mutator: (draft: Database) => void) {
    const next: Database = structuredClone(this.state);
    mutator(next);
    this.state = next;
    persist(next);
    this.listeners.forEach((l) => l());
  }

  resetToSeed() {
    this.state = createSeed();
    persist(this.state);
    this.listeners.forEach((l) => l());
  }

  // ---- Auth (mock) -----------------------------------------------------
  authenticateStudent(username: string, password: string): Student | null {
    const s = this.state.students.find(
      (x) => x.username.toLowerCase() === username.trim().toLowerCase(),
    );
    // TODO(auth): replace plaintext comparison with server-side hash verify.
    return s && s.tempPassword === password ? s : null;
  }
  verifyAdmin(password: string): boolean {
    return password === this.state.adminPassword;
  }

  // ---- Cohorts ---------------------------------------------------------
  addCohort(name: string, color: CohortColor) {
    this.commit((d) => {
      d.cohorts.push({ id: genId("co"), name, color, createdAt: new Date().toISOString() });
    });
  }
  updateCohort(id: string, patch: Partial<Pick<Cohort, "name" | "color">>) {
    this.commit((d) => {
      const c = d.cohorts.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    });
  }
  deleteCohort(id: string, reassignToId: string) {
    this.commit((d) => {
      d.students.forEach((s) => {
        if (s.cohortId === id) s.cohortId = reassignToId;
      });
      d.tests.forEach((t) => {
        if (t.cohortId === id) t.cohortId = reassignToId;
      });
      d.announcements.forEach((a) => {
        if (a.cohortId === id) a.cohortId = reassignToId;
      });
      d.cohorts = d.cohorts.filter((c) => c.id !== id);
    });
  }

  // ---- Students --------------------------------------------------------
  usernameTaken(username: string, exceptId?: string): boolean {
    return this.state.students.some(
      (s) => s.username.toLowerCase() === username.trim().toLowerCase() && s.id !== exceptId,
    );
  }
  addStudent(input: Omit<Student, "id" | "createdAt">) {
    this.commit((d) => {
      d.students.push({ ...input, id: genId("st"), createdAt: new Date().toISOString() });
    });
  }
  updateStudent(id: string, patch: Partial<Omit<Student, "id" | "createdAt">>) {
    this.commit((d) => {
      const s = d.students.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    });
  }
  deleteStudent(id: string) {
    this.commit((d) => {
      d.students = d.students.filter((s) => s.id !== id);
      d.submissions = d.submissions.filter((s) => s.studentId !== id);
    });
  }

  // ---- Tests + questions ----------------------------------------------
  addTest(input: Omit<Test, "id" | "createdAt" | "questions"> & { questions?: Question[] }): string {
    const id = genId("te");
    this.commit((d) => {
      d.tests.push({
        ...input,
        id,
        questions: input.questions ?? [],
        createdAt: new Date().toISOString(),
      });
    });
    return id;
  }
  updateTest(id: string, patch: Partial<Omit<Test, "id" | "createdAt" | "questions">>) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === id);
      if (t) Object.assign(t, patch);
    });
  }
  setTestStatus(id: string, status: TestStatus) {
    this.updateTest(id, { status });
  }
  deleteTest(id: string) {
    this.commit((d) => {
      d.tests = d.tests.filter((t) => t.id !== id);
      d.submissions = d.submissions.filter((s) => s.testId !== id);
    });
  }
  addQuestion(testId: string, q: Omit<Question, "id" | "order">) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      if (t) t.questions.push({ ...q, id: genId("q"), order: t.questions.length } as Question);
    });
  }
  updateQuestion(testId: string, questionId: string, q: Omit<Question, "id" | "order">) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      const idx = t?.questions.findIndex((x) => x.id === questionId);
      if (t && idx != null && idx >= 0) {
        t.questions[idx] = { ...q, id: questionId, order: t.questions[idx].order } as Question;
      }
    });
  }
  deleteQuestion(testId: string, questionId: string) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      if (t) {
        t.questions = t.questions
          .filter((q) => q.id !== questionId)
          .map((q, i) => ({ ...q, order: i }));
      }
    });
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
  }
  importBankItems(testId: string, bankIds: string[]) {
    this.commit((d) => {
      const t = d.tests.find((x) => x.id === testId);
      if (!t) return;
      bankIds.forEach((bid) => {
        const item = d.bank.find((b) => b.id === bid);
        if (!item) return;
        const { subject: _subject, id: _id, ...rest } = item;
        void _subject;
        void _id;
        t.questions.push({ ...rest, id: genId("q"), order: t.questions.length } as Question);
      });
    });
  }

  // ---- Submissions -----------------------------------------------------
  submitTest(input: {
    testId: string;
    studentId: string;
    answers: Answer[];
    startedAt: string;
    autoSubmitted: boolean;
    durationSeconds: number;
  }): string {
    const test = this.state.tests.find((t) => t.id === input.testId);
    const graded = test ? autoGradeMcq(test, input.answers) : input.answers;
    const id = genId("sub");
    this.commit((d) => {
      // one submission per student+test
      d.submissions = d.submissions.filter(
        (s) => !(s.testId === input.testId && s.studentId === input.studentId),
      );
      d.submissions.push({
        id,
        testId: input.testId,
        studentId: input.studentId,
        answers: graded,
        status: "submitted",
        startedAt: input.startedAt,
        submittedAt: new Date().toISOString(),
        autoSubmitted: input.autoSubmitted,
        durationSeconds: input.durationSeconds,
      });
    });
    return id;
  }
  gradeAnswer(submissionId: string, questionId: string, marksAwarded: number, feedback?: string) {
    this.commit((d) => {
      const sub = d.submissions.find((s) => s.id === submissionId);
      const ans = sub?.answers.find((a) => a.questionId === questionId);
      if (ans) {
        ans.marksAwarded = marksAwarded;
        if (feedback !== undefined) ans.feedback = feedback;
      }
    });
  }
  releaseSubmission(submissionId: string) {
    this.commit((d) => {
      const sub = d.submissions.find((s) => s.id === submissionId);
      if (sub) {
        sub.status = "released";
        sub.releasedAt = new Date().toISOString();
      }
    });
  }
  bulkReleaseForTest(testId: string) {
    this.commit((d) => {
      d.submissions
        .filter((s) => s.testId === testId && s.status === "submitted")
        .forEach((s) => {
          s.status = "released";
          s.releasedAt = new Date().toISOString();
        });
    });
  }
  unreleaseSubmission(submissionId: string) {
    this.commit((d) => {
      const sub = d.submissions.find((s) => s.id === submissionId);
      if (sub) {
        sub.status = "submitted";
        sub.releasedAt = undefined;
      }
    });
  }
  deleteSubmission(submissionId: string) {
    this.commit((d) => {
      d.submissions = d.submissions.filter((s) => s.id !== submissionId);
    });
  }

  // ---- Announcements ---------------------------------------------------
  addAnnouncement(input: Omit<Announcement, "id" | "createdAt" | "dismissedBy">) {
    this.commit((d) => {
      d.announcements.unshift({
        ...input,
        id: genId("an"),
        createdAt: new Date().toISOString(),
        dismissedBy: [],
      });
    });
  }
  updateAnnouncement(id: string, patch: Partial<Pick<Announcement, "body" | "pinned" | "cohortId">>) {
    this.commit((d) => {
      const a = d.announcements.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
    });
  }
  deleteAnnouncement(id: string) {
    this.commit((d) => {
      d.announcements = d.announcements.filter((a) => a.id !== id);
    });
  }
  dismissAnnouncement(id: string, studentId: string) {
    this.commit((d) => {
      const a = d.announcements.find((x) => x.id === id);
      if (a && !a.dismissedBy.includes(studentId)) a.dismissedBy.push(studentId);
    });
  }

  // ---- Question bank ---------------------------------------------------
  addBankItem(item: Omit<QuestionBankItem, "id">) {
    this.commit((d) => {
      d.bank.push({ ...item, id: genId("bk") } as QuestionBankItem);
    });
  }
  updateBankItem(id: string, item: Omit<QuestionBankItem, "id">) {
    this.commit((d) => {
      const idx = d.bank.findIndex((b) => b.id === id);
      if (idx >= 0) d.bank[idx] = { ...item, id } as QuestionBankItem;
    });
  }
  deleteBankItem(id: string) {
    this.commit((d) => {
      d.bank = d.bank.filter((b) => b.id !== id);
    });
  }
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

/** The action surface (stable singleton). */
export function useStore(): Store {
  return getStore();
}
