"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Splash } from "@/components/Splash";
import { useParams, useRouter } from "next/navigation";
import type { Answer, Question, Student, Test } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useStore } from "@/lib/data/store";
import { studentById, testForStudent, submissionFor, testsForStudent } from "@/lib/data/selectors";
import { useCountdown } from "@/hooks/useCountdown";
import { useNow } from "@/hooks/useNow";
import { useDraftAutosave, loadDraft, loadServerCopy, clearDraft, sendServerCopy } from "@/hooks/useDraftAutosave";
import { useToast } from "@/components/toast";
import { CountdownTimer } from "@/components/student/CountdownTimer";
import { QuestionView, type AnswerChange } from "@/components/student/QuestionView";
import { useUploadsInProgress } from "@/lib/upload-tracker";
import { Button, Modal, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { formatWhen, formatCountdown, testWindow } from "@/lib/time";
import { useTestSafety } from "@/hooks/useTestSafety";
import { useDocumentTitle } from "@/hooks/usePageTitle";
import { serverNow, syncServerClock, useClockOffset } from "@/lib/server-clock";
import { beginSitting, deviceId, inSitting, isAnswered, joinAnswers, orTimeout, sittingFor, within, type Sitting, type SittingDraft } from "@/lib/sitting";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { cn } from "@/lib/cn";
import Link from "next/link";

const blankAnswer = (q: Question): Answer => ({ questionId: q.id, type: q.type });

/** One answer per question on the paper as it is now, in paper order (by id, never by position). */
function onPaper(questions: Question[], list: Answer[]): Answer[] {
  const byId = new Map(list.map((a) => [a.questionId, a]));
  return questions.map((q) => {
    const mine = byId.get(q.id);
    return mine && mine.type === q.type ? mine : blankAnswer(q);
  });
}

/** The sitting a saved key stands for (see lib/sitting.ts). */
const asSitting = (key: string | null): Sitting => (key ? { key, fromMs: +new Date(key) } : { key: null, fromMs: 0 });

const newPaperId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

/**
 * Resume point for an attempt: a saved draft, or a fresh start. `at` is when
 * it was worked out (server clock), so the runner never reads an older clock
 * than that. `sitting` is the late window or deletion this attempt belongs to
 * (null for the normal sitting), and `edits` when each answer last changed.
 */
type Boot = {
  startedAt: string;
  answers: Answer[] | null;
  edits: Record<string, number>;
  by: Record<string, string>;
  index: number;
  at: number;
  sitting: string | null;
  resetAt: string | null;
  /** The server's copy was read (or there was none to read): saving to it can start. */
  serverOk: boolean;
};

/** Answers carried from an earlier sitting into a fresh one. */
type Carry = { answers: Answer[]; edits: Record<string, number>; by: Record<string, string> };

/** Published and meant for this student: their cohort, level and subject, and not over before they joined. */
function visibleTo(db: Database, test: Test, student: Student | null | undefined) {
  return !!student && testsForStudent(db, student).some((t) => t.id === test.id);
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
  // The server's clock, so a phone set to the wrong time still opens the test on time.
  const offset = useClockOffset();
  const nowMs = useNow() + offset;
  const t = testForStudent(db, id, studentId);
  const student = studentId ? studentById(db, studentId) : null;
  const opensMs = t ? new Date(t.opensAt).getTime() : null;

  useEffect(() => {
    void syncServerClock();
  }, []);

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
    const wait = Math.min(Math.max(0, opensMs - serverNow()) + 50, 3_600_000);
    const timer = setTimeout(() => setWokeAt(serverNow()), wait);
    return () => clearTimeout(timer);
  }, [opensMs, open, wokeAt, offset]);

  // Fresh attempt on an open test: show the "Ready?" screen first, so a stray
  // tap or a notification never starts the clock. `ready` carries the sitting
  // it is for (see lib/sitting.ts).
  const [ready, setReady] = useState<{ sitting: Sitting; resetAt: string | null; carry: Carry | null; copyOk: boolean } | null>(null);
  const gate = !!ready;
  const [beginning, setBeginning] = useState(false);
  // Bumped by "Try again" when the paper didn't load.
  const [attempt, setAttempt] = useState(0);

  // Runs again when the test opens while the page is up: the paper's questions
  // only arrive once it is open, and the start time must be taken then.
  useEffect(() => {
    let active = true;
    // Every request here has a time limit: on a stalled connection the student
    // gets "Couldn't load the paper" and Try again, never an endless spinner.
    const attemptStart = within(store.getTestAttempt(id), 12_000, null);
    void Promise.all([within(store.refreshTest(id), 12_000, undefined), within(syncServerClock(), 6_000, undefined)]).then(async () => {
      if (!active) return;
      const fresh = testForStudent(store.getSnapshot(), id, studentId);
      // Not open yet: nothing to set up. The page shows "Not open yet" and
      // this runs again the moment it opens. Booting now would build the
      // answer sheet from a paper that has no questions yet.
      if (fresh && serverNow() < new Date(fresh.opensAt).getTime()) return;
      const live = !!fresh && serverNow() < new Date(fresh.closesAt).getTime();
      const handedIn = !!(studentId && fresh && submissionFor(store.getSnapshot(), studentId, id));
      // The server's start time wins, so clearing the browser or switching
      // device doesn't reset the clock. Looking it up never starts one.
      // (The start is read even when the paper isn't here yet, so the clock is the server's either way.)
      const [serverStart0, copy] = await Promise.all([attemptStart, fresh && live && !handedIn ? loadServerCopy(id) : null]);
      if (!active) return;
      const resetAt = copy?.resetAt ?? null;
      // A late window Hamza opened, or a paper he deleted, starts a new
      // sitting: a start time or saved copy from before it belongs to the old
      // one, and must never end the new one the moment it opens.
      const sitting = studentId ? sittingFor(store.getSnapshot(), id, studentId, resetAt) : asSitting(null);
      const localRaw = studentId ? loadDraft(studentId, id) : null;
      const local = inSitting(localRaw, sitting) ? localRaw : null;
      const remote = inSitting(copy?.draft, sitting) ? copy.draft : null;
      const serverStart = serverStart0 && +new Date(serverStart0) >= sitting.fromMs ? serverStart0 : null;
      // Not read (the paper wasn't here yet, or the read failed): the server
      // copy is only written if it holds nothing from another device, until
      // it has been read (see useDraftAutosave's serverReady).
      const serverOk = copy ? copy.ok : !!fresh;
      // Copies from before this sitting: the phone died mid-test, they asked
      // me, and I opened a window before this screen could see it.
      const olds = [localRaw, copy?.draft].filter((d): d is NonNullable<typeof d> => !!d && !inSitting(d, sitting));
      const oldJoined = olds.length === 2 ? joinAnswers(olds[0], olds[1], deviceId()) : olds[0] ? { answers: olds[0].answers, edits: olds[0].edits ?? {}, by: olds[0].by ?? {} } : null;
      const oldStart = [serverStart0, ...olds.map((d) => d.startedAt)].filter((x): x is string => !!x).sort((a, b) => +new Date(a) - +new Date(b))[0];
      if (live && !handedIn && !local && !remote && !serverStart) {
        // Still inside their own time when the window opened, and still now:
        // they carry on with their answers and clock, as a screen that was
        // open when the window arrived does. Never after a deleted paper: that
        // re-sit is a genuine re-take and starts blank (the old paper may even
        // have been released with the right answers).
        const fromWindow = !!sitting.key && !(resetAt && +new Date(resetAt) === sitting.fromMs);
        const oldEnd = oldStart && fresh ? +new Date(oldStart) + fresh.durationMinutes * 60_000 : 0;
        if (fromWindow && oldJoined && oldEnd > sitting.fromMs && oldEnd > serverNow()) {
          const newest = [...olds].sort((a, b) => +new Date(b.savedAt) - +new Date(a.savedAt))[0];
          setBoot({ startedAt: oldStart!, ...oldJoined, index: newest?.currentIndex ?? 0, at: serverNow(), sitting: sitting.key, resetAt, serverOk });
          return;
        }
        // Otherwise a fresh clock from Begin, with anything they wrote before
        // carried in after a late window (blank after a deleted paper).
        setReady({ sitting, resetAt, carry: fromWindow && oldJoined && oldJoined.answers.some(isAnswered) ? oldJoined : null, copyOk: serverOk });
        return;
      }
      // Answers from this phone and the server's copy (another device, a
      // phone that died), joined question by question.
      const newer = remote && (!local || +new Date(remote.savedAt) > +new Date(local.savedAt)) ? remote : local;
      const joined = local && remote ? joinAnswers(local, remote, deviceId()) : newer ? { answers: newer.answers, edits: newer.edits ?? {}, by: newer.by ?? {} } : null;
      // One start per sitting: the earliest any device recorded.
      const starts = [local?.startedAt, remote?.startedAt].filter((s): s is string => !!s).sort((a, b) => +new Date(a) - +new Date(b));
      setBoot({
        startedAt: serverStart ?? starts[0] ?? new Date(serverNow()).toISOString(),
        answers: joined?.answers ?? null,
        edits: joined?.edits ?? {},
        by: joined?.by ?? {},
        index: newer?.currentIndex ?? 0,
        at: serverNow(),
        sitting: sitting.key,
        resetAt,
        serverOk,
      });
    });
    return () => {
      active = false;
    };
  }, [id, studentId, store, open, attempt]);

  async function begin() {
    if (!ready) return;
    const { sitting, resetAt, carry, copyOk } = ready;
    setBeginning(true);
    // Weak signal: try a couple more times quietly, so an honest start is
    // recorded on the server and never later looks "late". Other answers
    // (no network problem) are taken straight away, with no waiting. After
    // 12 seconds in all the test starts anyway, on this phone's clock.
    let start: string | null = null;
    const until = Date.now() + 12_000;
    for (let i = 0; i < 3 && Date.now() < until; i++) {
      try {
        start = await orTimeout(store.startTestAttempt(id), Math.max(1_000, until - Date.now()));
        break;
      } catch (e) {
        if (e instanceof Error && e.message === "timeout") break;
        if (i < 2) await new Promise((r) => setTimeout(r, 2500));
      }
    }
    // The first start of an earlier sitting is not this one's.
    if (start && +new Date(start) < sitting.fromMs) start = null;
    // A late window or a deleted paper: the server stamps the fresh start (it
    // keeps no start for a test that has closed for everyone else).
    // It also hands back the answers from the sitting before, if any: only the
    // clock is fresh, nothing they wrote is dropped.
    const begun = !start && sitting.key ? await beginSitting(id, sitting.key) : null;
    if (begun) start = begun.startedAt;
    let carried: Carry | null = carry;
    if (begun?.carried) carried = carried ? joinAnswers(carried, begun.carried, deviceId()) : { answers: begun.carried.answers, edits: begun.carried.edits ?? {}, by: begun.carried.by ?? {} };
    setReady(null);
    setBoot({
      startedAt: start ?? new Date(serverNow()).toISOString(),
      answers: carried?.answers ?? null,
      edits: carried?.edits ?? {},
      by: carried?.by ?? {},
      index: 0,
      at: serverNow(),
      sitting: sitting.key,
      resetAt,
      serverOk: copyOk || !!begun,
    });
  }

  function retryPaper() {
    setBoot(null);
    setReady(null);
    setAttempt((a) => a + 1);
  }

  const visible = !!t && visibleTo(db, t, student);
  // Never mount the runner before the test opens.
  if (t && !open) {
    if (!student || !visible) return <RunnerNotice title="Test unavailable" message="This test isn't open to you. It may have been moved or removed. Check Tests for what's open." />;
    return <RunnerNotice title="Not open yet" message={`It opens ${formatWhen(t.opensAt)}. Come back then, or keep this page open.`} />;
  }
  if (!boot && !gate) {
    return (
      <Splash label="Opening your test…" />
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
      <Splash label="Opening your test…" />
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
    <div className="rise mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <p className="text-sm font-semibold text-ink-2">{test.subject}</p>
      <h1 className="mt-2 text-balance text-title font-bold tracking-[-0.025em] text-ink sm:text-title-lg">{test.title}</h1>

      {/* One surface, three facts split by hairlines. */}
      <dl className="surface mt-8 grid grid-cols-3 divide-x divide-hairline rounded-card">
        {facts.map((f) => (
          <div key={f.k} className="flex flex-col-reverse px-3 py-4 text-center">
            <dt className="label-quiet mt-1.5 text-ink-3">{f.k}</dt>
            <dd className="whitespace-nowrap text-title font-bold tracking-[-0.02em] tabular-nums text-ink">
              {/* The unit sits small beside the number, so "20 min" stays on one line like its neighbours. */}
              {f.v.endsWith(" min") ? <>{f.v.slice(0, -4)}<span className="ml-1 text-base font-semibold text-ink-2">min</span></> : f.v}
            </dd>
          </div>
        ))}
      </dl>

      <ul className="mt-7 space-y-3 text-base text-ink-2">
        <li className="flex gap-3">
          <Icon.Clock className="mt-1 h-4 w-4 shrink-0 text-ink-3" />
          {minutes <= 0 ? (
            <span>This test closes in under a minute, so there isn&apos;t time to start it. If you missed it, message me.</span>
          ) : short ? (
            <span>The test closes at {closes}, so you get <b className="text-ink">{minutes} minutes</b> instead of {test.durationMinutes}.</span>
          ) : (
            <span>The clock starts when you tap Begin, not before.</span>
          )}
        </li>
        <li className="flex gap-3">
          <Icon.Check className="mt-1 h-4 w-4 shrink-0 text-ink-3" />
          <span>Your typed answers and choices are saved as you go. If the internet drops or your phone switches off, open the test again and they come back.</span>
        </li>
        {test.questions.some((q) => q.type === "photo") && (
          <li className="flex gap-3">
            <Icon.Camera className="mt-1 h-4 w-4 shrink-0 text-ink-3" />
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
    </div>
  );
}

/**
 * The phone's Back button mid-test asks first, instead of leaving with the
 * clock running. While `active`, one extra history entry sits on top of the
 * test (it keeps the router's own state); Back takes it off, it is put back
 * at once and `onBack` asks. It is never taken off in code: doing that while
 * the paper is being handed in could race the move to the Done screen.
 */
function useLeaveGuard(active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);
  useEffect(() => {
    if (!active) return;
    const mark = () => window.history.pushState({ ...(window.history.state as object | null), testGuard: true }, "");
    if (!(window.history.state as { testGuard?: boolean } | null)?.testGuard) mark();
    const onPop = () => {
      if ((window.history.state as { testGuard?: boolean } | null)?.testGuard) return;
      mark();
      onBackRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [active]);
}

function TestRunner({ id, boot }: { id: string; boot: Boot }) {
  const router = useRouter();
  const { session } = useAuth();
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  // Never an older reading than the moment this attempt was set up, and on
  // the server's clock (a phone set to the wrong time still counts right).
  const offset = useClockOffset();
  const nowMs = Math.max(useNow() + offset, boot.at);

  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const test = testForStudent(db, id, session?.studentId);
  const visible = test && visibleTo(db, test, student);
  const existing = student && test ? submissionFor(db, student.id, test.id) : null;
  const window = test ? testWindow(test.opensAt, test.closesAt, nowMs) : "closed";

  // Reconcile any saved draft against the CURRENT question set by id, not by
  // array length: if a teacher edited the paper mid-attempt, a draft answer for
  // a removed/retyped question must be dropped rather than silently applied to
  // whatever question now sits at that position.
  const [saved, setAnswers] = useState<Answer[]>(() => boot.answers ?? []);
  // When each answer last changed (server clock), so this device's copy and
  // another device's can be joined question by question.
  const [edits, setEdits] = useState<Record<string, number>>(() => boot.edits);
  // Which device last changed each answer, and the other copy's changes already joined in.
  const [by, setBy] = useState<Record<string, string>>(() => boot.by);
  const seenRef = useRef<Record<string, number>>({});
  // The server's copy couldn't be read when this opened (weak signal): nothing
  // is sent to it until it has been read and joined in, so a blank sheet here
  // never overwrites answers saved there.
  const [serverReady, setServerReady] = useState(boot.serverOk);
  // The sitting this attempt belongs to. A late window opened while this
  // screen is live with time left becomes this attempt's own.
  const [sitting, setSitting] = useState<string | null>(boot.sitting);
  // The same check keeps running while they sit it: the answer sheet is always
  // one answer per question on the paper as it is now, in paper order. A
  // question removed mid-test drops out (handing in an answer to a question
  // that no longer exists fails on the server, every time), and a new one
  // gets a blank instead of breaking the page.
  const questions = test?.questions;
  const answers = useMemo(() => onPaper(questions ?? [], saved), [questions, saved]);
  const [index, setIndex] = useState(boot.index);
  // A new question starts at its top (not halfway down, where the last one
  // was left), and its number stays in view in the question map.
  const mapRef = useRef<HTMLOListElement>(null);
  const firstIndex = useRef(true);
  useEffect(() => {
    mapRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (firstIndex.current) {
      firstIndex.current = false;
      return;
    }
    globalThis.scrollTo({ top: 0 });
  }, [index]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submittedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  // The hand in that failed timed out: it may still arrive, so going back to
  // edit is not offered (the server keeps the first one in).
  const [uncertain, setUncertain] = useState(false);
  // Whether the hand-in that failed was the automatic one at time-up.
  const [lastAuto, setLastAuto] = useState(false);
  // Time ran out and the paper is being handed in: it comes off the screen.
  const [timeUp, setTimeUp] = useState(false);
  // Handed in while photos were still on their way up: say so before Done.
  const [leftBehind, setLeftBehind] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const prevState = useRef<string>("normal");
  const retryRef = useRef<HTMLButtonElement>(null);
  // One id for this paper, the same on every try: a retry after a lost reply
  // gets the paper that already arrived back, never a second one.
  const paperId = useRef<string | null>(null);

  // The latest of these, for hand ins started by a timer.
  const answersRef = useRef(answers);
  const editsRef = useRef(edits);
  const byRef = useRef(by);
  const sittingRef = useRef(sitting);
  useEffect(() => {
    answersRef.current = answers;
    editsRef.current = edits;
    byRef.current = by;
    sittingRef.current = sitting;
  }, [answers, edits, by, sitting]);

  /** This screen's answers joined with another copy of the same sitting. */
  const joinWith = useCallback((list: Answer[], remote: SittingDraft) => {
    const joined = joinAnswers({ answers: list, edits: editsRef.current, by: byRef.current }, remote, deviceId(), seenRef.current);
    return joined;
  }, []);
  /** Remembers the other copy's changes as joined, so they aren't applied twice. */
  const noteJoined = (remote: SittingDraft) => {
    for (const [q, t] of Object.entries(remote.edits ?? {})) seenRef.current[q] = Math.max(seenRef.current[q] ?? 0, t);
  };

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
  const photosBusyRef = useRef(photosBusy);
  useEffect(() => {
    photosBusyRef.current = photosBusy;
  }, [photosBusy]);
  const [finishingAt, setFinishingAt] = useState<number | null>(null);
  // The one-tap "Pens down" moment between writing and uploading.
  const [pensDown, setPensDown] = useState(false);
  const endMs = uploading ? uploadEndMs : writeEndMs;

  // The timer, and the hand-in it does at zero, only run for a real sitting:
  // the test was open while this page was up, or answers saved on this phone
  // are still waiting to go. Opening the link of a test that is over or
  // already handed in (an old notification) must never hand in a blank paper.
  const [wasOpen, setWasOpen] = useState(window === "open");
  if (window === "open" && !wasOpen) setWasOpen(true);
  const armed = !existing && (wasOpen || !!boot.answers);

  // The test, the student and their paper as they are now, for hand ins
  // started by a timer. (The test is a new object on every redraw for a
  // student in a late window, so it can't be a dependency of doSubmit: the
  // retry timer below would restart every second and never fire.)
  const testRef = useRef(test);
  const studentRef = useRef(student);
  const existingRef = useRef(existing);
  useEffect(() => {
    testRef.current = test;
    studentRef.current = student;
    existingRef.current = existing;
  }, [test, student, existing]);
  // A hand in still on its way (one that timed out may arrive later).
  const pendingRef = useRef<Promise<string> | null>(null);

  /** The paper is in: tidy up and go to Done (or the "photos left behind" screen). */
  const finished = useCallback(
    (kept: string, dropped: boolean, sent: Answer[]) => {
      const t = testRef.current;
      const st = studentRef.current;
      if (!t || !st) return;
      submittedRef.current = true;
      setSubmitError(false);
      setSubmitting(true);
      if (kept !== paperId.current) {
        // The server already had a paper (another device, or answers I
        // collected for Hamza): that is the one kept. The answers on this
        // phone go to the server copy so Hamza still has them.
        toast("You'd already handed this in on another device, so that copy is the one I have. If it's missing something, message me.", "info");
        void sendServerCopy({
          testId: t.id,
          studentId: st.id,
          // What was handed in from here, joined with the server's copy.
          answers: sent,
          currentIndex: 0,
          startedAt: boot.startedAt,
          sitting: sittingRef.current,
          edits: editsRef.current,
          by: byRef.current,
        });
      } else {
        clearDraft(st.id, t.id);
      }
      if (dropped) {
        setLeftBehind(true);
        return;
      }
      router.replace(`/test/${t.id}/submitted`);
    },
    [toast, router, boot.startedAt],
  );

  const doSubmit = useCallback(
    async (auto: boolean) => {
      const test = testRef.current;
      const student = studentRef.current;
      if (submittedRef.current || !test || !student || existingRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setSubmitError(false);
      // Photos still uploading now are left behind (time is up, or the
      // student chose to hand in): the student is told before Done.
      const dropped = photosBusyRef.current > 0;
      // Another device may hold answers this one doesn't (typed on a laptop,
      // photographed on a phone): join the server's copy in first, briefly.
      // Not at time up: the time is already gone, and the copy is joined in
      // every minute while they sit it anyway.
      let toSend = answersRef.current;
      if (!auto) {
        const copy = await loadServerCopy(test.id, 5_000);
        if (copy.draft && inSitting(copy.draft, asSitting(sittingRef.current))) {
          toSend = onPaper(test.questions, joinWith(toSend, copy.draft).answers);
        }
      }
      const duration = Math.min(
        test.durationMinutes * 60,
        Math.round((serverNow() - new Date(boot.startedAt).getTime()) / 1000),
      );
      paperId.current ??= newPaperId();
      const send = store.submitTest({
        id: paperId.current,
        testId: test.id,
        studentId: student.id,
        answers: toSend,
        startedAt: boot.startedAt,
        autoSubmitted: auto,
        durationSeconds: duration,
      });
      pendingRef.current = send;
      let kept: string;
      try {
        // A stalled connection ends after 15 seconds with "Not handed in yet"
        // and quiet retries. A retry can never make a second paper or swap in
        // different answers: the server keeps the first one that arrives.
        kept = await orTimeout(send, 15_000);
      } catch (e) {
        const timedOut = e instanceof Error && e.message === "timeout";
        // Timed out, but it may still arrive: if it does, finish then.
        if (timedOut) {
          void send.then(
            (late) => {
              // (A retry already under way gets this same paper back itself.)
              if (!submittedRef.current) finished(late, dropped, toSend);
            },
            () => {
              if (pendingRef.current === send) pendingRef.current = null;
            },
          );
        } else if (pendingRef.current === send) {
          pendingRef.current = null;
        }
        // Not saved (or not known to be): keep the draft and the answers on
        // screen, and let the student try again.
        submittedRef.current = false;
        setSubmitting(false);
        setConfirmOpen(false);
        setSubmitError(true);
        setUncertain(timedOut);
        setLastAuto(auto);
        return;
      }
      finished(kept, dropped, toSend);
    },
    [store, boot.startedAt, joinWith, finished],
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
    // The paper comes off the screen at once: anything typed now would not be sent.
    setTimeUp(true);
    // Photos still uploading: let them land first (up to 75 s, leaving room
    // inside the server's 2-minute grace for the hand in itself and a
    // retry), then hand in with them.
    if (photosBusyRef.current > 0) {
      setFinishingAt(Date.now());
      return;
    }
    void doSubmit(true);
  }, [uploading, uploadEndMs, doSubmit]);

  useEffect(() => {
    if (finishingAt == null) return;
    const wait = photosBusy === 0 ? 0 : Math.max(0, finishingAt + 75_000 - Date.now());
    const t = setTimeout(() => void doSubmit(true), wait);
    return () => clearTimeout(t);
  }, [finishingAt, photosBusy, doSubmit]);

  const { remaining, state } = useCountdown(armed ? endMs : null, onExpire);

  // Hamza opened a late window while this screen is live with time left: the
  // student carries on, and these answers belong to the new window from now on.
  const liveKey = student && test ? sittingFor(db, test.id, student.id, boot.resetAt).key : null;
  if (liveKey && liveKey !== sitting && armed && remaining > 0 && !timeUp) setSitting(liveKey);

  // Awake screen, leave warning, online status.
  const sittingNow = !!test && !!student && !existing && window === "open";
  const { online } = useTestSafety({ active: sittingNow });
  const openLeave = useCallback(() => setLeaveOpen(true), []);
  useLeaveGuard(sittingNow && !timeUp && !submitting, openLeave);
  // Time left in the browser tab, so it shows even on another tab.
  useDocumentTitle(sittingNow && test ? `${formatCountdown(remaining)} · ${test.title}` : null);

  // Back online after a failed hand-in: try again by itself, once per
  // reconnection (never in a loop while the signal is merely weak).
  const wasOnline = useRef(online);
  useEffect(() => {
    const cameBack = online && !wasOnline.current;
    wasOnline.current = online;
    if (cameBack && submitError && !submitting) void doSubmit(lastAuto);
  }, [online, submitError, submitting, doSubmit, lastAuto]);

  // A failed hand in keeps trying quietly while the page is open (5 s, then
  // slower, up to once a minute), and again the moment the page comes back to
  // the front: time up is exactly when students put the phone down.
  const retries = useRef(0);
  useEffect(() => {
    if (!submitError || submitting) return;
    const delay = [5, 10, 20, 30, 60][Math.min(retries.current, 4)] * 1000;
    const again = () => {
      retries.current++;
      void doSubmit(lastAuto);
    };
    const timer = setTimeout(again, delay);
    const onShow = () => {
      if (document.visibilityState === "visible") again();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [submitError, submitting, doSubmit, lastAuto]);

  // The "Not handed in yet" box takes focus, so a screen reader lands on it.
  useEffect(() => {
    if (submitError) retryRef.current?.focus();
  }, [submitError]);
  // Same for "Pens down": its one button takes focus when it appears.
  const pensRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pensDown) pensRef.current?.focus();
  }, [pensDown]);

  useDraftAutosave({
    studentId: student?.id ?? "",
    testId: test?.id ?? "",
    answers,
    currentIndex: index,
    startedAt: boot.startedAt,
    sitting,
    edits,
    by,
    serverReady,
    enabled: !!test && !!student && !existing && window === "open",
  });

  // While they sit it: answers saved from another device of theirs (a phone
  // used for the photos) are joined in every minute and whenever this page
  // comes back to the front, question by question.
  useEffect(() => {
    if (!sittingNow || DEMO) return;
    let live = true;
    const join = async () => {
      // Until the copy has been read once, each read gets longer (slow data
      // when the whole class opens at once).
      const copy = await loadServerCopy(id, serverReady ? 5_000 : 15_000);
      if (!live || !copy.ok) return;
      // Read at last: saving to the server can start (after this join).
      const ready = () => setServerReady(true);
      if (!copy.draft || !inSitting(copy.draft, asSitting(sittingRef.current))) return ready();
      const remote = copy.draft;
      const joined = joinWith(answersRef.current, remote);
      const changed = (a: Answer) => {
        const b = answersRef.current.find((x) => x.questionId === a.questionId);
        return !b || JSON.stringify(b) !== JSON.stringify(a);
      };
      if (joined.answers.some(changed)) {
        setAnswers((prev) => joinWith(prev, remote).answers);
        setEdits((prev) => ({ ...prev, ...joined.edits }));
        setBy((prev) => ({ ...prev, ...joined.by }));
      }
      noteJoined(remote);
      ready();
    };
    // Until the server's copy has been read once, it is tried every 10 seconds.
    const timer = setInterval(() => void join(), serverReady ? 60_000 : 10_000);
    const onShow = () => {
      if (document.visibilityState === "visible") void join();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [sittingNow, id, joinWith, serverReady]);

  // While they sit it: Hamza may give the class more time (or move the close).
  // Just the test's times are read again every minute and when the page comes
  // back to the front; the whole paper only when one of them changed.
  useEffect(() => {
    if (!sittingNow || DEMO) return;
    let live = true;
    const check = async () => {
      const row = await within(
        Promise.resolve(supabase().from("tests").select("duration_minutes, upload_minutes, closes_at, status").eq("id", id).maybeSingle()).then((r) => r.data as Record<string, unknown> | null),
        10_000,
        null,
      );
      const now = store.getSnapshot().tests.find((x) => x.id === id);
      if (!live || !row || !now) return;
      const moved =
        row.duration_minutes !== now.durationMinutes ||
        ((row.upload_minutes as number | null) ?? 0) !== now.uploadMinutes ||
        +new Date(row.closes_at as string) !== +new Date(now.closesAt) ||
        row.status !== now.status;
      if (moved) await within(store.refreshTest(id), 12_000, undefined);
    };
    const timer = setInterval(() => void check(), 60_000);
    const onShow = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShow);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [sittingNow, id, store]);

  // More writing time: say so, once.
  const lastEnd = useRef(writeEndMs);
  useEffect(() => {
    const before = lastEnd.current;
    lastEnd.current = writeEndMs;
    if (before == null || writeEndMs == null || before === writeEndMs || !armed || existing) return;
    const mins = Math.round((writeEndMs - before) / 60_000);
    if (mins >= 1) toast(`I've added ${mins} ${mins === 1 ? "minute" : "minutes"}.`, "success");
    else if (mins <= -1) toast("I've changed the time for this test. The timer shows what's left.", "info");
  }, [writeEndMs, armed, existing, toast]);

  // Final-five and final-minute warnings (announced once each).
  useEffect(() => {
    // Only while they're actually sitting it (not on a "test closed" or "unavailable" screen).
    if (state !== prevState.current && test && visible && armed) {
      if (state === "warning") toast(uploading ? "5 minutes left to upload." : "5 minutes left. Wrap it up.", "info");
      if (state === "critical") toast("Last 60 seconds.", "error");
      prevState.current = state;
    }
  }, [state, toast, uploading, test, visible, armed]);

  // Already submitted, or not open → bounce out.
  useEffect(() => {
    // Just handed in here: doSubmit is already taking them to the Done screen.
    // (A hand in from here that timed out and then arrived goes to Done instead.)
    if (existing && !submittedRef.current && !pendingRef.current) router.replace(existing.status === "released" ? `/results/${id}` : "/dashboard");
  }, [existing, id, router]);

  if (!student || !test || !visible) {
    return <RunnerNotice title="Test unavailable" message="This test isn't open to you. It may have been moved or removed. Check Tests for what's open." />;
  }
  // Handed in, but photos were still on their way up: say so plainly.
  if (leftBehind) {
    const photoQs = test.questions
      .map((qq, i) => ({ n: i + 1, a: answers.find((a) => a.questionId === qq.id), type: qq.type }))
      .filter((x) => x.type === "photo");
    return (
      <RunnerNotice
        icon="warn"
        title="Handed in"
        message="Some photos were still uploading when it went in, so they didn't arrive. Send me those pages on WhatsApp so I can mark them."
        action={
          <>
            {photoQs.length > 0 && (
              <ul className="mt-4 space-y-1 text-sm tabular-nums text-ink-2">
                {photoQs.map((x) => {
                  const pages = x.a?.photoUrls?.length ?? (x.a?.photoDataUrl ? 1 : 0);
                  return (
                    <li key={x.n}>
                      Question {x.n}: {pages === 0 ? "no pages arrived" : `${pages} ${pages === 1 ? "page" : "pages"} arrived`}
                    </li>
                  );
                })}
              </ul>
            )}
            <Button size="lg" className="mt-5 min-w-48" onClick={() => router.replace(`/test/${test.id}/submitted`)}>
              Done
            </Button>
          </>
        }
      />
    );
  }
  // Just handed in here: hold "Handing in…" until the Done screen opens, never
  // a flash of "Already submitted".
  if (existing) {
    return submitting
      ? <RunnerNotice icon="warn" title="Handing in…" message="Keep this page open until you see Done." />
      : <RunnerNotice title="Already handed in" message="You've already handed this one in." />;
  }
  if (window === "future") return <RunnerNotice title="Not open yet" message={`It opens ${formatWhen(test.opensAt)}. Come back then.`} />;
  // Never while photos are still being handed in after time ran out.
  if (window === "closed" && finishingAt == null && photosBusy === 0) {
    // Answers saved on this phone that never reached the server (a hand-in
    // that failed on a weak signal at the deadline, then a refresh): offer to
    // send them, rather than calling it missed.
    // (`wasOpen`: they were sitting it when it closed, and the hand-in at the
    // deadline is about to start, so never flash "Test closed" at them.)
    if (submitting || submitError || boot.answers || wasOpen) {
      return (
        <RunnerNotice
          icon="warn"
          title={submitting ? "Handing in…" : "Not handed in yet"}
          message={
            submitting
              ? "Keep this page open until you see Done."
              : "Your answers are saved on this phone but haven't reached me yet. Hand them in now. I'll also keep trying while this page is open."
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

  // By question, never by position: the paper can change under a sitting.
  function change(question: Question, next: AnswerChange) {
    // Nothing typed after time is up: the paper is already on its way. (A
    // photo finishing its upload still lands: those wait for it.)
    if (timeUp && typeof next !== "function") return;
    setAnswers((prev) => {
      const current = prev.find((a) => a.questionId === question.id && a.type === question.type) ?? blankAnswer(question);
      const value = typeof next === "function" ? next(current) : next;
      return [...prev.filter((a) => a.questionId !== question.id), value];
    });
    setEdits((prev) => ({ ...prev, [question.id]: serverNow() }));
    setBy((prev) => (prev[question.id] === deviceId() ? prev : { ...prev, [question.id]: deviceId() }));
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Focus-mode header with the live countdown */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-paper pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{test.title}</p>
              {/* The test code is Hamza's own reference: students only need the subject. */}
              <p className="truncate text-xs text-ink-3">{test.subject}</p>
            </div>
          </div>
          <CountdownTimer remaining={remaining} state={state} />
        </div>
        {/* Question map: tap any number to jump. Filled = answered, ring = where you are. */}
        <nav aria-label="Questions" className={cn("mx-auto flex max-w-2xl items-center gap-3 px-5 pb-3", uploading && "hidden")}>
          <ol ref={mapRef} className="-m-1 flex flex-1 gap-1.5 overflow-x-auto p-1 [scrollbar-width:none]">
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
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold tabular-nums transition-[background-color,border-color,color] duration-150 ease-[var(--ease-out)]",
                      done ? "border-white/[0.16] bg-white/[0.14] text-ink" : "border-border-strong text-ink-3 hover:text-ink",
                      i === at && "ring-2 ring-ink ring-offset-2 ring-offset-paper",
                    )}
                  >
                    {i + 1}
                  </button>
                </li>
              );
            })}
          </ol>
          <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-2">
            {answeredCount}/{test.questions.length} done
          </span>
        </nav>
        {!online && (
          <p role="status" className="border-t border-warning/30 bg-warning-soft px-5 py-2 text-center text-sm font-semibold text-warning">
            You&apos;re offline. Keep going: your typed answers are saved on this phone. Photos need internet to upload.
          </p>
        )}
      </header>

      {finishingAt != null && photosBusy > 0 && !submitError && (
        <div role="status" className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-paper px-6 text-center">
          <p className="label-quiet text-ink-2">Time&apos;s up</p>
          <h2 className="mt-3 text-balance text-title font-bold tracking-[-0.025em] text-ink">Saving your last photos…</h2>
          <p className="mt-3 max-w-xs text-base text-ink-2">Keep this screen open. Your paper is handed in as soon as they finish.</p>
        </div>
      )}

      {/* Time up: the paper comes off the screen straight away, so nothing is
          typed that would not be sent. */}
      {timeUp && !submitError && !(finishingAt != null && photosBusy > 0) && (
        <div role="status" className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-paper px-6 text-center">
          <p className="label-quiet text-ink-2">Time&apos;s up</p>
          <h2 className="mt-3 text-balance text-title font-bold tracking-[-0.025em] text-ink">Handing in your paper…</h2>
          <p className="mt-3 max-w-xs text-base text-ink-2">Keep this page open until you see Done.</p>
        </div>
      )}

      {pensDown && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="pens-down" className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-paper px-6 text-center">
          <p className="label-quiet text-ink-2">Time&apos;s up</p>
          <h2 id="pens-down" className="mt-3 text-title-lg font-bold tracking-[-0.025em] text-ink">Pens down.</h2>
          <p className="mt-3 max-w-xs text-base text-ink-2">
            You have {uploadMins} {uploadMins === 1 ? "minute" : "minutes"} to photograph and upload your pages.
          </p>
          <Button ref={pensRef} size="lg" className="mt-8 min-w-60" onClick={() => { setPensDown(false); globalThis.scrollTo({ top: 0 }); }}>
            <Icon.Camera className="h-5 w-5" /> Take photos now
          </Button>
        </div>
      )}

      <div className="mx-auto w-full max-w-2xl flex-1 px-5 py-6">
        {uploading ? (
          <div className="animate-fade-up space-y-6">
            <div className="rounded-card border border-warning/35 bg-warning-soft p-5">
              <p className="font-bold text-ink">Writing time is over.</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">
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
                  onChange={(next) => change(qq, next)}
                  paperHidden
                  number={i + 1}
                  total={test.questions.length}
                />
              ) : null,
            )}
          </div>
        ) : (
          q && (
            <div key={q.id} className="animate-fade-up">
              <QuestionView question={q} answer={answer} onChange={(next) => change(q, next)} number={at + 1} total={test.questions.length} />
            </div>
          )
        )}
      </div>

      <footer className="sticky bottom-0 z-30 border-t border-hairline bg-paper pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-5 py-3">
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
              {submitting ? "Handing in…" : photosBusy > 0 ? "Waiting for photos…" : "Yes, hand it in"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">{answeredCount}/{test.questions.length}</span> answered.
          {answeredCount < test.questions.length && " Blanks stay blank."}
        </p>
      </Modal>

      {/* The phone's Back button mid-test: ask, with Stay as the main choice. */}
      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Leave the test?"
        description="The clock keeps running while you're away. Your typed answers stay saved."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => router.push("/dashboard")}>Leave</Button>
            <Button onClick={() => setLeaveOpen(false)}>Stay</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          {formatCountdown(remaining)} left.
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
          className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-paper px-6 text-center"
        >
          <Icon.Warn className="h-6 w-6 text-warning" />
          <h2 id="not-handed-in" className="mt-3 text-balance text-title font-bold tracking-[-0.025em] text-ink">Not handed in yet</h2>
          <p id="not-handed-in-why" className="mt-3 max-w-xs text-base text-ink-2">
            Your answers are still saved on this phone. Check your internet, then tap Try again. I&apos;ll keep trying too.
            Keep this page open until you see Done.
          </p>
          <Button ref={retryRef} size="lg" className="mt-8 min-w-60" loading={submitting} onClick={() => void doSubmit(lastAuto)}>
            Try again
          </Button>
          {/* Once time is up there is nothing to go back to: the timer has
              already fired, so the answers would sit there unsent. And after a
              hand in that timed out it may still arrive, so no going back to
              change answers either. */}
          {!lastAuto && !uncertain && !submitting && remaining > 0 && (
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
      <Glyph className={cn("h-6 w-6", icon === "warn" ? "text-warning" : "text-ink-3")} />
      <h1 className="mt-3 text-xl font-bold text-ink">{title}</h1>
      <p className="mt-2 max-w-xs text-base leading-relaxed text-ink-2">{message}</p>
      {action}
      <Link href="/dashboard" className={buttonClasses({ variant: "secondary", className: "mt-5" })}>
        Back to Home
      </Link>
    </div>
  );
}
