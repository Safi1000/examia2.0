/**
 * Domain model — the 8 core entities plus the supporting shapes the UI needs.
 * Every component is typed against these. Strict mode is on.
 */

// ----------------------------------------------------------------------------
// 1. Cohorts
// ----------------------------------------------------------------------------

/** Index into the six cohort-dot tokens (--color-cohort-1..6). */
export type CohortColor = 1 | 2 | 3 | 4 | 5 | 6;

export interface Cohort {
  id: string;
  name: string;
  color: CohortColor;
  createdAt: string; // ISO
}

// ----------------------------------------------------------------------------
// 2. Students
// ----------------------------------------------------------------------------

export interface Student {
  id: string;
  username: string;
  email?: string;
  cohortId: string;
  /**
   * Mock only stores a plaintext temp password so the demo can log in.
   * TODO(auth): replace with server-side PBKDF2 hash; never store plaintext.
   */
  tempPassword: string;
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 3. + 8. Questions and the reusable question bank
// ----------------------------------------------------------------------------

export type QuestionType = "mcq" | "text" | "photo";

/** Type-specific payload, discriminated on `type`. */
export type QuestionVariant =
  | {
      type: "mcq";
      options: string[]; // exactly 4 in the UI
      /** TODO(security): answer key belongs server-side, never shipped to students. */
      correctIndex: number;
    }
  | { type: "text"; maxLength?: number; showCounter?: boolean }
  | { type: "photo" };

export interface QuestionCommon {
  id: string;
  prompt: string;
  marks: number;
  topic: string;
}

/** A question as embedded in a test (carries display order). */
export type Question = QuestionCommon & QuestionVariant & { order: number };

/** A reusable bank question (carries subject, no order until imported). */
export type QuestionBankItem = QuestionCommon & QuestionVariant & { subject: string };

// ----------------------------------------------------------------------------
// 4. Tests
// ----------------------------------------------------------------------------

export type TestStatus = "draft" | "active" | "closed";

export interface Test {
  id: string;
  title: string;
  subject: string;
  durationMinutes: number;
  /** null = open to all cohorts. */
  cohortId: string | null;
  opensAt: string; // ISO
  closesAt: string; // ISO
  testCode: string;
  status: TestStatus;
  questions: Question[];
  createdAt: string;
}

// ----------------------------------------------------------------------------
// 5. + 6. Submissions and answers
// ----------------------------------------------------------------------------

export interface Answer {
  questionId: string;
  type: QuestionType;
  /** MCQ selection. */
  selectedIndex?: number;
  /** Text answer body. */
  text?: string;
  /** Mock: a data URL. TODO(cloudinary): replace with uploaded asset URL. */
  photoDataUrl?: string;
  /** Grading — undefined until scored. */
  marksAwarded?: number;
  feedback?: string;
}

export type SubmissionStatus = "in_progress" | "submitted" | "released";

export interface Submission {
  id: string;
  testId: string;
  studentId: string;
  answers: Answer[];
  status: SubmissionStatus;
  startedAt: string;
  submittedAt?: string;
  autoSubmitted?: boolean;
  durationSeconds?: number;
  releasedAt?: string;
}

// ----------------------------------------------------------------------------
// 7. Announcements
// ----------------------------------------------------------------------------

export interface Announcement {
  id: string;
  body: string; // <= 250 chars (enforced in the editor)
  pinned: boolean;
  /** null = visible to all cohorts. */
  cohortId: string | null;
  createdAt: string;
  /** studentIds that dismissed an unpinned announcement (mock persistence). */
  dismissedBy: string[];
}

// ----------------------------------------------------------------------------
// Supporting shapes (auth, drafts) — not entities, but needed by the UI.
// ----------------------------------------------------------------------------

export type Role = "student" | "admin";

export interface Session {
  role: Role;
  studentId?: string; // present when role === "student"
}

/** Autosaved test-runner draft (survives refresh; per student+test). */
export interface Draft {
  testId: string;
  studentId: string;
  answers: Answer[];
  currentIndex: number;
  startedAt: string;
  savedAt: string;
}

/** Per-test derived statistics for admin lists. */
export interface TestStats {
  submissionCount: number;
  averagePercent: number | null;
  completionPercent: number;
}
