"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Answer, Test } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useStore } from "@/lib/data/store";
import { studentById, testById, submissionFor } from "@/lib/data/selectors";
import { useCountdown } from "@/hooks/useCountdown";
import { useNow } from "@/hooks/useNow";
import { useDraftAutosave, loadDraft, clearDraft } from "@/hooks/useDraftAutosave";
import { useToast } from "@/components/toast";
import { CountdownTimer } from "@/components/student/CountdownTimer";
import { QuestionView } from "@/components/student/QuestionView";
import { useUploadsInProgress } from "@/lib/upload-tracker";
import { Button, Modal, Pill, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { formatWhen, formatCountdown, testWindow } from "@/lib/time";
import { useTestSafety } from "@/hooks/useTestSafety";
import { useDocumentTitle } from "@/hooks/usePageTitle";
import { cn } from "@/lib/cn";
import Link from "next/link";

function isAnswered(a: Answer): boolean {
  if (a.type === "mcq") return typeof a.selectedIndex === "number";
  if (a.type === "text") return (a.text ?? "").trim().length > 0;
  return !!a.photoDataUrl;
}

/**
 * Resume point for an attempt: a saved draft, or a fresh start. `at` is when
 * it was worked out, so the runner never reads an older clock than that.
 */
type Boot = { startedAt: string; answers: Answer[] | null; index: number; at: number };

/** Published, and for this student's cohort (or everyone). */
function visibleTo(test: Test, cohortId: string | undefined) {
  return test.status !== "draft" && (test.cohortId === null || test.cohortId === cohortId);
}

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

  const db = useDatabase();
  const nowMs = useNow();
  const t = testById(db, id);
  const student = studentId ? studentById(db, studentId) : null;
  const opensMs = t ? new Date(t.opensAt).getTime() : null;

  // The shared clock only ticks every 30 s. A student waiting for the test to
  // open shouldn't sit on "Not open yet" for up to half a minute, so wake up
  // right on the opening time.
  const [wokeAt, setWokeAt] = useState(0);
  const clock = Math.max(nowMs, wokeAt);
  // Once past the opening time this stays true, so closing doesn't re-boot.
  const open = opensMs != null && clock >= opensMs;
  useEffect(() => {
    if (opensMs == null || open) return;
    // Long waits are checked again every hour (timers can't run for weeks).
    const wait = Math.min(Math.max(0, opensMs - Date.now()) + 50, 3_600_000);
    const timer = setTimeout(() => setWokeAt(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [opensMs, open, wokeAt]);

  // Fresh attempt on an open test: show the "Ready?" screen first, so a stray
  // tap or a notification never starts the clock.
  const [gate, setGate] = useState(false);
  const [beginning, setBeginning] = useState(false);
  // Bumped by "Try again" when the paper didn't load.
  const [attempt, setAttempt] = useState(0);

  // Runs again when the test opens while the page is up: the paper's questions
  // only arrive once it is open, and the start time must be taken then.
  useEffect(() => {
    let active = true;
    void store.refreshTest(id).finally(async () => {
      if (!active) return;
      const fresh = testById(store.getSnapshot(), id);
      // Not open yet: nothing to set up. The page shows "Not open yet" and
      // this runs again the moment it opens. Booting now would build the
      // answer sheet from a paper that has no questions yet.
      if (fresh && Date.now() < new Date(fresh.opensAt).getTime()) return;
      const d = studentId ? loadDraft(studentId, id) : null;
      const live = !!fresh && Date.now() < new Date(fresh.closesAt).getTime();
      const handedIn = !!(studentId && fresh && submissionFor(store.getSnapshot(), studentId, id));
      // The server's start time wins, so clearing the browser or switching
      // device doesn't reset the clock. Looking it up never starts one.
      const serverStart = fresh ? await store.getTestAttempt(id) : null;
      if (!active) return;
      if (live && !handedIn && !d && !serverStart) {
        setGate(true);
        return;
      }
      setBoot({
        startedAt: serverStart ?? d?.startedAt ?? new Date().toISOString(),
        answers: d?.answers ?? null,
        index: d?.currentIndex ?? 0,
        at: Date.now(),
      });
    });
    return () => { active = false; };
  }, [id, studentId, store, open, attempt]);

  async function begin() {
    setBeginning(true);
    // Weak signal: try a couple more times quietly, so an honest start is
    // recorded on the server and never later looks "late". Other answers
    // (no network problem) are taken straight away, with no waiting.
    let serverStart: string | null = null;
    for (let i = 0; i < 3; i++) {
      try {
        serverStart = await store.startTestAttempt(id);
        break;
      } catch {
        if (i < 2) await new Promise((r) => setTimeout(r, 2500));
      }
    }
    setGate(false);
    setBoot({ startedAt: serverStart ?? new Date().toISOString(), answers: null, index: 0, at: Date.now() });
  }

  function retryPaper() {
    setBoot(null);
    setGate(false);
    setAttempt((a) => a + 1);
  }

  const visible = !!t && visibleTo(t, student?.cohortId);
  // Never mount the runner before the test opens.
  if (t && !open) {
    if (!student || !visible) return <RunnerNotice title="Test unavailable" message="This test isn't open to you. It may have been moved or removed. Check Tests for what's open." />;
    return <RunnerNotice title="Not open yet" message={`It opens ${formatWhen(t.opensAt)}. Come back then, or keep this page open.`} />;
  }
  if (!boot && !gate) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-3">Loading test…</div>
    );
  }

  // The paper is needed (to sit it, or to hand in answers saved on this phone)
  // but its questions didn't arrive, usually a weak signal right at opening
  // time. Never start the clock or build an empty answer sheet from it.
  const handedIn = !!(student && t && submissionFor(db, student.id, t.id));
  const closed = !!t && clock >= new Date(t.closesAt).getTime();
  if (t && visible && !handedIn && t.questions.length === 0 && (!closed || !!boot?.answers)) {
    return (
      <RunnerNotice
        icon="warn"
        title="Couldn't load the paper."
        message={gate && !boot ? "Check your internet, then try again. Your time hasn't started." : "Check your internet, then try again."}
        action={
          <Button size="lg" className="mt-5 min-w-48" onClick={retryPaper}>
            <Icon.Refresh className="h-4 w-4" /> Try again
          </Button>
        }
      />
    );
  }

  if (gate && !boot && t) return <ReadyScreen test={t} nowMs={clock} busy={beginning} onBegin={() => void begin()} />;
  if (!boot) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-3">Loading test…</div>
    );
  }
  return <TestRunner key={boot.startedAt} id={id} boot={boot} />;
}

/**
 * Shown once, before a fresh attempt: what the test is, how long they really
 * have, and that the clock only starts on Begin.
 */
function ReadyScreen({ test, nowMs, busy, onBegin }: { test: Test; nowMs: number; busy: boolean; onBegin: () => void }) {
  const minsToClose = Math.max(0, Math.floor((new Date(test.closesAt).getTime() - nowMs) / 60_000));
  const minutes = Math.min(test.durationMinutes, minsToClose);
  const short = minsToClose < test.durationMinutes;
  const marks = test.questions.reduce((n, q) => n + q.marks, 0);
  const closes = formatWhen(test.closesAt);
  const facts = [
    { k: "Time", v: `${minutes} min` },
    { k: "Questions", v: String(test.questions.length) },
    { k: "Marks", v: String(marks) },
  ];
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand">{test.subject}</p>
      <h1 className="mt-2 text-[1.9rem] font-extrabold leading-tight tracking-tight text-ink">{test.title}</h1>

      <dl className="mt-7 grid grid-cols-3 gap-3">
        {facts.map((f) => (
          <div key={f.k} className="rounded-xl border border-border bg-surface px-3 py-3 text-center">
            <dd className="text-xl font-extrabold tabular-nums text-ink">{f.v}</dd>
            <dt className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">{f.k}</dt>
          </div>
        ))}
      </dl>

      <ul className="mt-6 space-y-2.5 text-[15px] text-ink-2">
        <li className="flex gap-2.5">
          <Icon.Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          {short ? (
            <span>The test closes at {closes}, so you get <b className="text-ink">{minutes} minutes</b> instead of {test.durationMinutes}.</span>
          ) : (
            <span>The clock starts when you tap Begin, not before.</span>
          )}
        </li>
        <li className="flex gap-2.5">
          <Icon.Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span>Your typed answers and choices are kept on this phone as you go, even if the internet drops.</span>
        </li>
        {test.questions.some((q) => q.type === "photo") && (
          <li className="flex gap-2.5">
            <Icon.Camera className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>Some answers are photos of your working. Keep paper, a pen and your camera ready. Photos need internet to upload.</span>
          </li>
        )}
      </ul>

      <Button size="lg" fullWidth loading={busy} disabled={minutes <= 0} onClick={onBegin} className="mt-8">
        Begin test
      </Button>
      <Link href="/dashboard" className="mt-4 flex min-h-11 items-center justify-center text-sm font-semibold text-ink-3 hover:text-ink">
        Not now, back to Home
      </Link>
    </main>
  );
}

function TestRunner({ id, boot }: { id: string; boot: Boot }) {
  const router = useRouter();
  const { session } = useAuth();
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  // Never an older reading than the moment this attempt was set up.
  const nowMs = Math.max(useNow(), boot.at);

  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const test = testById(db, id);
  const visible = test && visibleTo(test, student?.cohortId);
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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // Whether the hand-in that failed was the automatic one at time-up.
  const [lastAuto, setLastAuto] = useState(false);
  const prevState = useRef<string>("normal");
  const retryRef = useRef<HTMLButtonElement>(null);

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

  // Two deadlines: the writing time, then an optional upload window after it.
  // The paper comes off the screen at `writeEndMs` and only the upload box is
  // left until `uploadEndMs`, when the attempt submits itself.
  const writeEndMs = useMemo(() => {
    if (!test) return null;
    const byDuration = new Date(boot.startedAt).getTime() + test.durationMinutes * 60_000;
    const byClose = new Date(test.closesAt).getTime();
    return Math.min(byDuration, byClose);
  }, [test, boot.startedAt]);

  // Photo answers are the only thing there is to upload, so the window is
  // pointless on a paper without one.
  const hasPhotoQuestion = !!test?.questions.some((q) => q.type === "photo");
  const uploadEndMs = useMemo(() => {
    if (!test || writeEndMs == null) return null;
    if (!test.uploadMinutes || !hasPhotoQuestion) return null;
    const end = Math.min(writeEndMs + test.uploadMinutes * 60_000, new Date(test.closesAt).getTime());
    return end > writeEndMs ? end : null;
  }, [test, writeEndMs, hasPhotoQuestion]);

  const [uploading, setUploading] = useState(false);
  // Answer photos still on their way up, and when time ran out while they were.
  const photosBusy = useUploadsInProgress();
  const [finishingAt, setFinishingAt] = useState<number | null>(null);
  // The one-tap "Pens down" moment between writing and uploading.
  const [pensDown, setPensDown] = useState(false);
  const endMs = uploading ? uploadEndMs : writeEndMs;

  const doSubmit = useCallback(
    async (auto: boolean) => {
      if (submittedRef.current || !test || !student) return;
      submittedRef.current = true;
      setSubmitting(true);
      setSubmitError(false);
      const duration = Math.min(
        test.durationMinutes * 60,
        Math.round((Date.now() - new Date(boot.startedAt).getTime()) / 1000),
      );
      try {
        await store.submitTest({
          testId: test.id,
          studentId: student.id,
          answers,
          startedAt: boot.startedAt,
          autoSubmitted: auto,
          durationSeconds: duration,
        });
      } catch {
        // Not saved: keep the draft and the answers on screen, and let the
        // student try again.
        submittedRef.current = false;
        setSubmitting(false);
        setConfirmOpen(false);
        setSubmitError(true);
        setLastAuto(auto);
        return;
      }
      clearDraft(student.id, test.id);
      router.replace(`/test/${test.id}/submitted`);
    },
    [test, student, answers, store, router, boot.startedAt],
  );

  // Writing time up: slide into the upload window if there is one, otherwise
  // hand the paper in.
  const onExpire = useCallback(() => {
    if (!uploading && uploadEndMs != null) {
      setUploading(true);
      setPensDown(true);
      try {
        navigator.vibrate?.(200);
      } catch {}
      return;
    }
    // Photos still uploading: let them land first (up to 60 s, well inside
    // the server's 2-minute grace), then hand in with them.
    if (photosBusy > 0) {
      setFinishingAt(Date.now());
      return;
    }
    void doSubmit(true);
  }, [uploading, uploadEndMs, doSubmit, photosBusy]);

  useEffect(() => {
    if (finishingAt == null) return;
    const wait = photosBusy === 0 ? 0 : Math.max(0, finishingAt + 60_000 - Date.now());
    const t = setTimeout(() => void doSubmit(true), wait);
    return () => clearTimeout(t);
  }, [finishingAt, photosBusy, doSubmit]);

  const { remaining, state } = useCountdown(endMs, onExpire);

  // Awake screen, leave warning, online status.
  const sitting = !!test && !!student && !existing && window === "open";
  const { online } = useTestSafety({ active: sitting });
  // Time left in the browser tab, so it shows even on another tab.
  useDocumentTitle(sitting && test ? `${formatCountdown(remaining)} · ${test.title}` : null);

  // Back online after a failed hand-in: try again by itself, once per
  // reconnection (never in a loop while the signal is merely weak).
  const wasOnline = useRef(online);
  useEffect(() => {
    const cameBack = online && !wasOnline.current;
    wasOnline.current = online;
    if (cameBack && submitError && !submitting) void doSubmit(lastAuto);
  }, [online, submitError, submitting, doSubmit, lastAuto]);

  // The "Not handed in yet" box takes focus, so a screen reader lands on it.
  useEffect(() => {
    if (submitError) retryRef.current?.focus();
  }, [submitError]);

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
      if (state === "warning") toast(uploading ? "5 minutes left to upload." : "5 minutes left. Wrap it up.", "info");
      if (state === "critical") toast("Last 60 seconds.", "error");
      prevState.current = state;
    }
  }, [state, toast, uploading]);

  // Already submitted, or not open → bounce out.
  useEffect(() => {
    // Just handed in here: doSubmit is already taking them to the Done screen.
    if (existing && !submittedRef.current) router.replace(existing.status === "released" ? `/results/${id}` : "/dashboard");
  }, [existing, id, router]);

  if (!student || !test || !visible) {
    return <RunnerNotice title="Test unavailable" message="This test isn't open to you. It may have been moved or removed. Check Tests for what's open." />;
  }
  if (existing) return <RunnerNotice title="Already submitted" message="You've already done this one." />;
  if (window === "future") return <RunnerNotice title="Not open yet" message={`It opens ${formatWhen(test.opensAt)}. Come back then.`} />;
  // Never while photos are still being handed in after time ran out.
  if (window === "closed" && finishingAt == null && photosBusy === 0) {
    // Answers saved on this phone that never reached the server (a hand-in
    // that failed on a weak signal at the deadline, then a refresh): offer to
    // send them, rather than calling it missed.
    if (submitting || submitError || boot.answers) {
      return (
        <RunnerNotice
          icon="warn"
          title={submitting ? "Handing in…" : "Not handed in yet"}
          message={
            submitting
              ? "Keep this page open until you see Done."
              : "Your answers are saved on this phone but haven't reached Hamza. Hand them in now."
          }
          action={
            <>
              <Button size="lg" className="mt-5 min-w-48" loading={submitting} onClick={() => void doSubmit(lastAuto)}>
                Hand in now <Icon.Check className="h-4 w-4" />
              </Button>
              {submitError && !submitting && (
                <p role="alert" className="mt-3 max-w-xs text-sm text-error">
                  That didn&apos;t go through. Check your internet, then try again.
                </p>
              )}
            </>
          }
        />
      );
    }
    return <RunnerNotice title="Test closed" message="This one has closed. If something went wrong, message me." />;
  }

  // A saved place past the end (a question was removed mid-attempt) lands on the last one.
  const at = Math.min(index, test.questions.length - 1);
  const q = test.questions[at];
  const answer = answers[at];
  const answeredCount = answers.filter(isAnswered).length;
  const isLast = at === test.questions.length - 1;
  const uploadMins = Math.max(1, Math.ceil(((uploadEndMs ?? nowMs) - nowMs) / 60_000));

  function update(next: Answer) {
    setAnswers((prev) => prev.map((a, i) => (i === at ? next : a)));
  }

  function updateAt(at: number, next: Answer) {
    setAnswers((prev) => prev.map((a, i) => (i === at ? next : a)));
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Focus-mode header with the live countdown */}
      <header className="sticky top-0 z-30 border-b border-border bg-paper/[0.97]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{test.title}</p>
              <Pill>{test.testCode}</Pill>
            </div>
          </div>
          <CountdownTimer remaining={remaining} state={state} />
        </div>
        {/* Question map: tap any number to jump. Gold = answered, ring = where you are. */}
        <nav aria-label="Questions" className={cn("mx-auto flex max-w-2xl items-center gap-3 px-4 pb-3", uploading && "hidden")}>
          <ol className="flex flex-1 gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {test.questions.map((qq, i) => {
              const done = answers[i] ? isAnswered(answers[i]) : false;
              return (
                <li key={qq.id}>
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Question ${i + 1}${done ? ", answered" : ""}`}
                    aria-current={i === at ? "step" : undefined}
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums transition-all",
                      done ? "bg-brand text-on-brand" : "border border-border-strong text-ink-3 hover:text-ink",
                      i === at && "ring-2 ring-brand ring-offset-2 ring-offset-paper",
                    )}
                  >
                    {i + 1}
                  </button>
                </li>
              );
            })}
          </ol>
          <span className="shrink-0 text-xs font-semibold text-ink-2">
            {answeredCount}/{test.questions.length} done
          </span>
        </nav>
        {!online && (
          <p role="status" className="border-t border-warning/30 bg-warning-soft px-4 py-2 text-center text-xs font-semibold text-warning">
            You&apos;re offline. Keep going: your answers are saved on this device.
          </p>
        )}
      </header>

      {finishingAt != null && photosBusy > 0 && (
        <div role="status" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper/95 px-6 text-center backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand">Time&apos;s up</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-ink">Saving your last photos…</h2>
          <p className="mt-3 max-w-xs text-[15px] text-ink-2">Keep this screen open. Your paper is handed in as soon as they finish.</p>
        </div>
      )}

      {pensDown && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="pens-down" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper/95 px-6 text-center backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-brand">Time&apos;s up</p>
          <h2 id="pens-down" className="mt-3 text-4xl font-extrabold tracking-tight text-ink">Pens down.</h2>
          <p className="mt-3 max-w-xs text-[15px] text-ink-2">
            You have {uploadMins} {uploadMins === 1 ? "minute" : "minutes"} to photograph and upload your pages.
          </p>
          <Button size="lg" className="mt-8 min-w-60" onClick={() => { setPensDown(false); globalThis.scrollTo({ top: 0 }); }}>
            <Icon.Camera className="h-5 w-5" /> Take photos now
          </Button>
        </div>
      )}

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        {uploading ? (
          <div className="animate-fade-up space-y-6">
            <div className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3">
              <p className="font-bold text-ink">Writing time is over.</p>
              <p className="mt-0.5 text-sm text-ink-2">
                Photograph your pages now and upload them before this timer runs out. Whatever is
                uploaded by then is what gets marked.
              </p>
            </div>
            {test.questions.map((qq, i) =>
              qq.type === "photo" ? (
                <QuestionView
                  key={qq.id}
                  question={qq}
                  answer={answers[i]}
                  onChange={(next) => updateAt(i, next)}
                  paperHidden
                />
              ) : null,
            )}
          </div>
        ) : (
          q && (
            <div key={q.id} className="animate-fade-up">
              <QuestionView question={q} answer={answer} onChange={update} />
            </div>
          )
        )}
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-paper/[0.97]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          {uploading ? (
            <Button className="w-full" disabled={photosBusy > 0} onClick={() => setConfirmOpen(true)}>
              {photosBusy > 0 ? "Waiting for your photos…" : <>Hand in <Icon.Check className="h-4 w-4" /></>}
            </Button>
          ) : (
          <>
          <Button
            variant="secondary"
            disabled={at <= 0}
            onClick={() => setIndex(Math.max(0, at - 1))}
          >
            <Icon.ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {isLast ? (
            <Button disabled={photosBusy > 0} onClick={() => setConfirmOpen(true)}>
              {photosBusy > 0 ? "Uploading…" : <>I&apos;m done <Icon.Check className="h-4 w-4" /></>}
            </Button>
          ) : (
            <Button onClick={() => setIndex(Math.min(test.questions.length - 1, at + 1))}>
              Next <Icon.ChevronRight className="h-4 w-4" />
            </Button>
          )}
          </>
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
            {/* Never hand in while a photo is still on its way up. */}
            <Button onClick={() => doSubmit(false)} disabled={submitting || photosBusy > 0}>
              {submitting ? "Submitting…" : photosBusy > 0 ? "Waiting for photos…" : "Yes, submit"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">{answeredCount}/{test.questions.length}</span> answered.
          {answeredCount < test.questions.length && " Blanks stay blank."}
        </p>
      </Modal>

      {/* A hand-in that didn't reach the server. Not a dismissable dialog: a
          stray tap outside it must never leave the answers unsent. Only a
          hand-in the student chose (not the one at time-up) can go back. */}
      {submitError && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="not-handed-in"
          aria-describedby="not-handed-in-why"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper/95 px-6 text-center backdrop-blur"
        >
          <Icon.Warn className="h-8 w-8 text-warning" />
          <h2 id="not-handed-in" className="mt-3 text-3xl font-extrabold tracking-tight text-ink">Not handed in yet</h2>
          <p id="not-handed-in-why" className="mt-3 max-w-xs text-[15px] text-ink-2">
            Your answers are still saved on this phone. Check your internet, then tap Try again. Keep this page open
            until you see Done.
          </p>
          <Button ref={retryRef} size="lg" className="mt-8 min-w-60" loading={submitting} onClick={() => void doSubmit(lastAuto)}>
            Try again
          </Button>
          {!lastAuto && !submitting && (
            <button
              type="button"
              onClick={() => setSubmitError(false)}
              className="mt-3 min-h-11 px-4 text-sm font-semibold text-ink-3 hover:text-ink"
            >
              Back to my answers
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RunnerNotice({
  title,
  message,
  icon = "lock",
  action,
}: {
  title: string;
  message: string;
  icon?: "lock" | "warn";
  action?: React.ReactNode;
}) {
  const Glyph = icon === "warn" ? Icon.Warn : Icon.Lock;
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <Glyph className={cn("h-8 w-8", icon === "warn" ? "text-warning" : "text-ink-3")} />
      <h1 className="mt-3 text-xl font-bold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink-2">{message}</p>
      {action}
      <Link href="/dashboard" className={buttonClasses({ variant: "secondary", className: "mt-5" })}>
        Back to Home
      </Link>
    </div>
  );
}
