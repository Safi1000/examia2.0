"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Answer } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useStore } from "@/lib/data/store";
import { studentById, testById, submissionFor } from "@/lib/data/selectors";
import { useCountdown } from "@/hooks/useCountdown";
import { useNow } from "@/hooks/useNow";
import { useDraftAutosave, loadDraft, clearDraft } from "@/hooks/useDraftAutosave";
import { useToast } from "@/components/toast";
import { CountdownTimer } from "@/components/student/CountdownTimer";
import { QuestionView } from "@/components/student/QuestionView";
import { Button, Modal, Pill, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { testWindow } from "@/lib/time";
import Link from "next/link";

function isAnswered(a: Answer): boolean {
  if (a.type === "mcq") return typeof a.selectedIndex === "number";
  if (a.type === "text") return (a.text ?? "").trim().length > 0;
  return !!a.photoDataUrl;
}

/** Resume point for an attempt: a saved draft, or a fresh start. */
type Boot = { startedAt: string; answers: Answer[] | null; index: number };

/**
 * Re-reads the paper from the database before the runner mounts.
 *
 * The cache is hydrated at login and a teacher can edit a question at any point
 * afterwards, so a student who signed in earlier would otherwise sit a stale
 * copy — answering against an old option list while the server grades their
 * choice against the new key. Gating the runner on a fresh fetch is what makes
 * "the latest MCQs are always used" true.
 */
export default function TestRunnerPage() {
  const params = useParams();
  const id = String(params.id);
  const store = useStore();
  const { session } = useAuth();
  const studentId = session?.studentId;

  // The draft read (localStorage) and the clock read are impure, so they happen
  // here in an effect — alongside the refetch the runner already waits on —
  // rather than during TestRunner's render. TestRunner then renders purely from
  // the resolved `boot`.
  const [boot, setBoot] = useState<Boot | null>(null);

  useEffect(() => {
    let active = true;
    void store.refreshTest(id).finally(() => {
      if (!active) return;
      const d = studentId ? loadDraft(studentId, id) : null;
      setBoot({
        startedAt: d?.startedAt ?? new Date().toISOString(),
        answers: d?.answers ?? null,
        index: d?.currentIndex ?? 0,
      });
    });
    return () => { active = false; };
  }, [id, studentId, store]);

  if (!boot) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-3">Loading test…</div>
    );
  }
  return <TestRunner id={id} boot={boot} />;
}

function TestRunner({ id, boot }: { id: string; boot: Boot }) {
  const router = useRouter();
  const { session } = useAuth();
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const nowMs = useNow();

  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const test = testById(db, id);
  const visible =
    test && test.status !== "draft" && (test.cohortId === null || test.cohortId === student?.cohortId);
  const existing = student && test ? submissionFor(db, student.id, test.id) : null;
  const window = test ? testWindow(test.opensAt, test.closesAt, nowMs) : "closed";

  // Reconcile any saved draft against the CURRENT question set by id, not by
  // array length: if a teacher edited the paper mid-attempt, a draft answer for
  // a removed/retyped question must be dropped rather than silently applied to
  // whatever question now sits at that position.
  const [answers, setAnswers] = useState<Answer[]>(() => {
    if (!test) return [];
    const draft = new Map((boot.answers ?? []).map((a) => [a.questionId, a]));
    return test.questions.map((q) => {
      const saved = draft.get(q.id);
      return saved && saved.type === q.type ? saved : ({ questionId: q.id, type: q.type } as Answer);
    });
  });
  const [index, setIndex] = useState(boot.index);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submittedRef = useRef(false);
  const prevState = useRef<string>("normal");

  // Log the attempt once, when the runner actually opens for a live sitting.
  const startLogged = useRef(false);
  useEffect(() => {
    if (startLogged.current || !test || !student || existing || window !== "open") return;
    startLogged.current = true;
    store.logActivity({
      type: "test_started",
      title: `${student.username} started "${test.title}"`,
      description: test.subject,
      studentId: student.id,
      testId: test.id,
      link: `/admin/tests/${test.id}`,
    });
  }, [test, student, existing, window, store]);

  const endMs = useMemo(() => {
    if (!test) return null;
    const byDuration = new Date(boot.startedAt).getTime() + test.durationMinutes * 60_000;
    const byClose = new Date(test.closesAt).getTime();
    return Math.min(byDuration, byClose);
  }, [test, boot.startedAt]);

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current || !test || !student) return;
      submittedRef.current = true;
      const duration = Math.min(
        test.durationMinutes * 60,
        Math.round((Date.now() - new Date(boot.startedAt).getTime()) / 1000),
      );
      await store.submitTest({
        testId: test.id,
        studentId: student.id,
        answers,
        startedAt: boot.startedAt,
        autoSubmitted: auto,
        durationSeconds: duration,
      });
      clearDraft(student.id, test.id);
      router.replace(`/test/${test.id}/submitted`);
    },
    [test, student, answers, store, router, boot.startedAt],
  );

  const { remaining, state } = useCountdown(endMs, () => doSubmit(true));

  useDraftAutosave({
    studentId: student?.id ?? "",
    testId: test?.id ?? "",
    answers,
    currentIndex: index,
    startedAt: boot.startedAt,
    enabled: !!test && !!student && !existing && window === "open",
  });

  // Final-five and final-minute warnings (announced once each).
  useEffect(() => {
    if (state !== prevState.current) {
      if (state === "warning") toast("5 minutes left. Wrap it up.", "info");
      if (state === "critical") toast("Last 60 seconds.", "error");
      prevState.current = state;
    }
  }, [state, toast]);

  // Already submitted, or not open → bounce out.
  useEffect(() => {
    if (existing) router.replace(existing.status === "released" ? `/results/${id}` : "/dashboard");
  }, [existing, id, router]);

  if (!student || !test || !visible) {
    return <RunnerNotice title="Test unavailable" message="Something's wrong. Head back and try again." />;
  }
  if (existing) return <RunnerNotice title="Already submitted" message="You've already done this one." />;
  if (window === "future") return <RunnerNotice title="Not open yet" message="Not live yet. Check back at the start time." />;
  if (window === "closed") return <RunnerNotice title="Test closed" message="You missed the window." />;

  const q = test.questions[index];
  const answer = answers[index];
  const answeredCount = answers.filter(isAnswered).length;
  const isLast = index === test.questions.length - 1;

  function update(next: Answer) {
    setAnswers((prev) => prev.map((a, i) => (i === index ? next : a)));
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Focus-mode header with the live countdown */}
      <header className="sticky top-0 z-30 border-b border-border bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{test.title}</p>
              <Pill>{test.testCode}</Pill>
            </div>
          </div>
          <CountdownTimer remaining={remaining} state={state} />
        </div>
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 pb-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-300"
              style={{ width: `${((index + 1) / test.questions.length) * 100}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-xs text-ink-2">
            {index + 1}/{test.questions.length}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <div key={q.id} className="animate-fade-up">
          <QuestionView question={q} answer={answer} onChange={update} />
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Button
            variant="secondary"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <Icon.ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {isLast ? (
            <Button onClick={() => setConfirmOpen(true)}>
              I&apos;m done <Icon.Check className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => setIndex((i) => Math.min(test.questions.length - 1, i + 1))}>
              Save &amp; Next <Icon.ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Sure you're done?"
        description="You can't come back to this."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Not yet</Button>
            <Button onClick={() => doSubmit(false)}>Yes, submit</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">{answeredCount}/{test.questions.length}</span> answered.
          {answeredCount < test.questions.length && " Blanks stay blank."}
        </p>
      </Modal>
    </div>
  );
}

function RunnerNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Icon.Lock className="h-8 w-8 text-ink-3" />
      <h1 className="mt-3 text-xl font-bold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink-2">{message}</p>
      <Link href="/dashboard" className={buttonClasses({ variant: "secondary", className: "mt-5" })}>
        Back to home
      </Link>
    </div>
  );
}
