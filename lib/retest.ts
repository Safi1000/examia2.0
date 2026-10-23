/**
 * "Retest weak topics": find where a cohort is losing marks, and build a short
 * practice test on exactly that topic from questions Hamza already wrote
 * (question bank first, then earlier tests). Pure reads + existing store
 * actions only; nothing new in the database.
 */
import { archivedCohortIds, isArchivedSubmission } from "@/lib/data/selectors";
import type { Question, QuestionBankItem, Test } from "@/types";
import type { Database } from "@/lib/data/seed";
import { topicMastery, type TopicMastery } from "@/lib/scoring";
import { testCoversStudent } from "@/lib/data/selectors";

const MAX_QUESTIONS = 10;
const norm = (s: string) => s.trim().toLowerCase();

/** Weakest topics for a cohort (null = everyone), from released results only. */
export function weakTopics(db: Database, cohortId: string | null, limit = 3): TopicMastery[] {
  // Current students only: switched-off (archived) cohorts and their tests
  // don't count towards today's weak topics.
  const off = archivedCohortIds(db);
  const studentIds = new Set(
    db.students
      .filter((s) => !off.has(s.cohortId) && (cohortId === null || s.cohortId === cohortId))
      .map((s) => s.id),
  );
  const subs = db.submissions.filter(
    (s) => s.status === "released" && studentIds.has(s.studentId) && !isArchivedSubmission(db, s, off),
  );
  return topicMastery(db.tests, subs)
    .filter((t) => t.available > 0 && t.percent < 70)
    .slice(0, limit);
}

export type RetestSource =
  | { kind: "bank"; item: QuestionBankItem }
  | { kind: "test"; question: Question };

/** Up to 10 questions on the topic, bank first, no repeated prompts. */
export function retestQuestions(db: Database, subject: string, topic: string): RetestSource[] {
  const seen = new Set<string>();
  const out: RetestSource[] = [];
  const matches = (subj: string, top: string) => norm(subj) === norm(subject) && norm(top) === norm(topic);

  for (const item of db.bank) {
    if (out.length >= MAX_QUESTIONS) break;
    if (!matches(item.subject, item.topic) || seen.has(norm(item.prompt))) continue;
    seen.add(norm(item.prompt));
    out.push({ kind: "bank", item });
  }
  for (const t of db.tests) {
    for (const q of t.questions) {
      if (out.length >= MAX_QUESTIONS) break;
      if (!matches(t.subject, q.topic) || seen.has(norm(q.prompt))) continue;
      seen.add(norm(q.prompt));
      out.push({ kind: "test", question: q });
    }
  }
  return out;
}

/** Writing time: about 1.5 minutes per mark, rounded to 5, between 10 and 60. */
export function retestMinutes(sources: RetestSource[]): number {
  const marks = sources.reduce((n, s) => n + (s.kind === "bank" ? s.item.marks : s.question.marks), 0);
  return Math.min(60, Math.max(10, Math.round((marks * 1.5) / 5) * 5));
}

/** Students a retest for this cohort would reach (for the button label). */
export function retestReach(db: Database, cohortId: string | null): number {
  const probe = { cohortId, classId: null, subjectId: null } as Test;
  return db.students.filter((s) => testCoversStudent(probe, s)).length;
}

type StoreLike = {
  addTest: (input: Omit<Test, "id" | "createdAt" | "questions">) => string;
  importBankItems: (testId: string, bankIds: string[]) => void;
  addQuestion: (testId: string, q: Omit<Question, "id" | "order">) => void;
};

/**
 * Who a retest is for: the level and subject of the tests the weak topic came
 * from (the most common), so "All cohorts" never sends it to every level.
 */
export function retestTarget(db: Database, subject: string, topic: string): { classId: string | null; subjectId: string | null } {
  const from = db.tests.filter((t) => norm(t.subject) === norm(subject) && t.questions.some((q) => norm(q.topic) === norm(topic)));
  const most = (ids: Array<string | null>) => {
    const n = new Map<string, number>();
    for (const id of ids) if (id) n.set(id, (n.get(id) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  return {
    classId: most(from.map((t) => t.classId)),
    subjectId: most(from.map((t) => t.subjectId)) ?? db.subjects.find((x) => norm(x.name) === norm(subject))?.id ?? null,
  };
}

/** How many current students a test with this target reaches. */
export function reachOf(db: Database, target: Pick<Test, "cohortId" | "classId" | "subjectId">): number {
  const off = archivedCohortIds(db);
  return db.students.filter((s) => !off.has(s.cohortId) && testCoversStudent(target as Test, s)).length;
}

/**
 * Creates the retest as a DRAFT (students can't see it) so Hamza can check it
 * and press publish. Returns the new test id, or null if there was nothing to use.
 */
export function createRetest(
  store: StoreLike,
  db: Database,
  input: { cohortId: string | null; subject: string; topic: string },
): string | null {
  const sources = retestQuestions(db, input.subject, input.topic);
  if (!sources.length) return null;
  const now = Date.now();
  const target = retestTarget(db, input.subject, input.topic);
  const id = store.addTest({
    title: `Retest: ${input.topic}`,
    subject: input.subject,
    subjectId: target.subjectId,
    classId: target.classId,
    durationMinutes: retestMinutes(sources),
    uploadMinutes: 0,
    cohortId: input.cohortId,
    opensAt: new Date(now).toISOString(),
    closesAt: new Date(now + 7 * 86_400_000).toISOString(),
    testCode: `RT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    status: "draft",
  });
  const bankIds = sources.flatMap((s) => (s.kind === "bank" ? [s.item.id] : []));
  if (bankIds.length) store.importBankItems(id, bankIds);
  for (const s of sources) {
    if (s.kind !== "test") continue;
    const { id: _id, order: _order, ...rest } = s.question;
    void _id; void _order;
    store.addQuestion(id, rest);
  }
  return id;
}
