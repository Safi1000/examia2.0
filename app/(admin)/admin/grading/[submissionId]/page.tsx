"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Annotation, Answer, Question, Submission } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useDatabase, useStore } from "@/lib/data/store";
import { submissionById, studentById, testById, archivedCohortIds, isArchivedSubmission, asSeenBy, inLateWindow } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { AnnotatedImage, AnnotatorModal } from "@/components/Annotator";
import { PageStack } from "@/components/PageStack";
import { MarkSchemePanel } from "@/components/admin/MarkSchemePanel";
import { idsInText, isPastPaper, sourceLabel, withoutSources } from "@/lib/paper-builder";
import { PaperText } from "@/components/PaperText";
import { Card, Button, Badge, Pill, Textarea, EmptyState, Icon } from "@/components/ui";
import { isFullyGraded } from "@/lib/scoring";
import { gradeSubmission } from "@/lib/grading";
import { takenTimeOf } from "@/lib/photo-time";
import { cn } from "@/lib/cn";
import { panel } from "@/components/admin/surface";

export default function GradingPage() {
  const params = useParams();
  const subId = String(params.submissionId);
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const router = useRouter();
  // Auto-marked MCQs are hidden by default so the written and photo answers
  // that actually need a decision are on screen first.
  const [showAuto, setShowAuto] = useState(false);
  // Set by the first Release tap: a fast second tap (or Ctrl+Enter) must not release twice.
  const releasing = useRef<string | null>(null);
  // Each card's comment and pen strokes still in their short pause: saved before a release.
  const flushers = useRef(new Map<string, () => void>());
  const registerFlush = useCallback((key: string, fn: () => void) => {
    flushers.current.set(key, fn);
    return () => {
      flushers.current.delete(key);
    };
  }, []);

  const submission = submissionById(db, subId);
  const test = submission ? testById(db, submission.testId) : null;
  const student = submission ? studentById(db, submission.studentId) : null;
  const here = !!submission;
  // Back to unreleased (a release held because a mark didn't save, or taken
  // back elsewhere): Release and Ctrl+Enter must work again.
  const isOut = submission?.status === "released";
  useEffect(() => {
    if (!isOut) releasing.current = null;
  }, [isOut]);
  // The pen strokes on photo answers are left out of the full load (they are
  // heavy): read here, fresh on every open (another device may have marked
  // this paper), and only once the paper itself has arrived.
  useEffect(() => {
    if (here) void store.loadAnnotations(subId, true);
  }, [store, subId, here]);

  // The next paper's strokes and first page are fetched while this one is
  // marked, so "Release & next" opens it at once.
  const nextId = nextPaper(db, submission);
  const nextPhoto = firstPhoto(db, nextId);
  useEffect(() => {
    if (!nextId) return;
    void store.loadAnnotations(nextId);
    if (nextPhoto) new Image().src = nextPhoto;
  }, [store, nextId, nextPhoto]);

  if (!submission || !test || !student) {
    // Opened from a link while the device's saved copy is on screen: the paper
    // is probably on its way, so say so instead of "no longer exists".
    const loading = store.restored;
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        <PageHeader title={loading ? "Marking" : "Submission not found"} back={{ href: "/admin/submissions", label: "Submissions" }} />
        <EmptyState icon={<Icon.Inbox />} title={loading ? "Getting this paper…" : "This submission no longer exists"} />
      </div>
    );
  }

  const released = submission.status === "released";
  const grade = gradeSubmission(test, submission);
  const total = grade.total;
  const awarded = grade.awarded;
  const fullyGraded = isFullyGraded(test, submission);
  // Writing time ended at start + duration (or when the test closed, if sooner).
  // Photos taken well after that are flagged gently; nothing is blocked.
  const writeEndMs = submission.startedAt
    ? Math.min(new Date(submission.startedAt).getTime() + test.durationMinutes * 60_000, new Date(asSeenBy(db, test, submission.studentId).closesAt).getTime())
    : null;
  const pagePhotos = test.questions
    .filter((q) => q.type === "photo")
    .flatMap((q) => {
      const a = submission.answers.find((x) => x.questionId === q.id);
      const urls = a?.photoUrls ?? (a?.photoDataUrl ? [a.photoDataUrl] : []);
      const qn = test.questions.indexOf(q) + 1;
      return urls.map((u, i) => ({ label: `Q${qn}${urls.length > 1 ? ` p${i + 1}` : ""}`, taken: takenTimeOf(u) }));
    });
  const off = archivedCohortIds(db);
  const waiting = db.submissions.filter((s) => s.status === "submitted" && !isArchivedSubmission(db, s, off)).length;
  // Questions left blank and not yet scored: one tap gives them 0. A multiple
  // choice question with no answer at all (added after hand in, or skipped and
  // never saved) has no automatic mark, so it used to block release for good.
  const blanks = test.questions.filter((q) => {
    const a = submission.answers.find((x) => x.questionId === q.id);
    if (typeof a?.marksAwarded === "number") return false;
    if (q.type === "mcq") return !a || a.selectedIndex == null;
    return !a || (q.type === "text" ? !a.text?.trim() : !(a.photoUrls?.length || a.photoDataUrl));
  });

  const mcqs = test.questions.filter((q) => q.type === "mcq");
  const hideAuto = !showAuto && mcqs.length > 0 && mcqs.length < test.questions.length;
  const mcqAwarded = mcqs.reduce(
    (sum, q) => sum + (submission.answers.find((x) => x.questionId === q.id)?.marksAwarded ?? 0),
    0,
  );
  const mcqTotal = mcqs.reduce((sum, q) => sum + q.marks, 0);
  const name = student.username.charAt(0).toUpperCase() + student.username.slice(1);

  /**
   * A released result changes only after one deliberate step: taking it back.
   * The student then sees nothing until it is released again, with a fresh
   * notice, so a mark never changes under them silently.
   */
  function takeBack(ask = true): boolean {
    if (ask && !window.confirm("This result is already out. Take it back to change it? The student won't see it until you release it again.")) return false;
    store.unreleaseSubmission(subId);
    releasing.current = null;
    toast("Opened for marking again.", "info");
    return true;
  }

  function release(goNext: boolean) {
    if (released || releasing.current === subId) return;
    releasing.current = subId;
    // A comment or pen strokes still in their short pause are saved now; the
    // release itself then waits until every save for this paper has landed.
    flushers.current.forEach((flush) => flush());
    // Refused while the test is still open (the store says why).
    if (!store.releaseSubmission(subId)) {
      releasing.current = null;
      return;
    }
    toast(`${name}'s result released.`, "success");
    if (goNext && nextId) router.push(`/admin/grading/${nextId}`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      {/* Ctrl/Cmd + Enter while marking: release and move to the next one,
          wherever the focus is (it used to need a click inside the page first). */}
      <ReleaseShortcut enabled={fullyGraded && !released} onRelease={() => release(!!nextId)} />
      <PageHeader
        title="Marking"
        subtitle={`${name} · ${test.title}${waiting ? ` · ${waiting} waiting to be marked` : ""}`}
        back={{ href: "/admin/submissions", label: "Submissions" }}
        actions={
          released ? (
            <>
              <Badge tone="success">Released</Badge>
              <Button variant="secondary" onClick={() => takeBack()}>
                <Icon.Refresh className="h-4 w-4" /> Mark again
              </Button>
              {nextId && (
                <Button onClick={() => router.push(`/admin/grading/${nextId}`)}>Next to mark →</Button>
              )}
            </>
          ) : (
            <>
              {nextId && (
                <Link href={`/admin/grading/${nextId}`} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-ink-2 hover:text-ink">
                  Skip to next →
                </Link>
              )}
              <Button variant="secondary" disabled={!fullyGraded} onClick={() => release(!!nextId)}>
                {nextId ? "Release & next" : "Release result"}
                <kbd className="ml-1.5 hidden rounded-[5px] border border-current/30 px-1 font-sans text-xs font-semibold opacity-70 lg:inline">Ctrl ↵</kbd>
              </Button>
            </>
          )
        }
      />

      {/* Running total */}
      <Card ruled className="mb-5 flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
        <div>
          <p className="label-quiet text-ink-3">Running total</p>
          <p className="mt-1 text-title font-semibold tabular-nums tracking-[-0.02em] text-ink">{awarded}<span className="text-base font-normal text-ink-3">/{total}</span></p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-ink">{grade.percent}%</p>
          <p className="text-sm text-ink-3">Grade {grade.letter}</p>
        </div>
        {!fullyGraded && !released && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-tile border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">
            <span>Score every written and photo answer before releasing.</span>
            {blanks.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  for (const q of blanks) store.gradeAnswer(subId, q.id, 0);
                  toast(`Gave 0 to ${blanks.length === 1 ? "1 blank answer" : `${blanks.length} blank answers`}.`, "success");
                }}
                className="h-11 rounded-full border border-warning/40 px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-warning/10"
              >
                0 for {blanks.length === 1 ? "the blank answer" : `the ${blanks.length} blank answers`}
              </button>
            )}
          </div>
        )}
      </Card>

      {mcqs.length > 0 && mcqs.length < test.questions.length && (
        <div className={cn(panel, "mb-3 flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-ink-2")}>
          <span>
            {mcqs.length} multiple choice {mcqs.length === 1 ? "question" : "questions"} marked automatically:{" "}
            <span className="font-semibold tabular-nums text-ink">{mcqAwarded}/{mcqTotal}</span>
          </span>
          <button
            type="button"
            onClick={() => setShowAuto((v) => !v)}
            className="inline-flex min-h-11 items-center font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline"
            aria-expanded={showAuto}
          >
            {showAuto ? "Hide them" : "Show them"}
          </button>
        </div>
      )}

      {pagePhotos.length > 0 && writeEndMs && (
        <PhotoTimeline writeEndMs={writeEndMs} submittedAt={submission.submittedAt ?? null} late={!!submission.late && !inLateWindow(db, submission)} lateWindow={inLateWindow(db, submission)} pages={pagePhotos} />
      )}

      <div className="space-y-3">
        {test.questions.map((q, i) => {
          if (hideAuto && q.type === "mcq") return null;
          const a = submission.answers.find((x) => x.questionId === q.id);
          return (
            <GradeCard
              key={`${subId}-${q.id}`}
              index={i}
              question={q}
              answer={a}
              submissionId={subId}
              writeEndMs={writeEndMs}
              released={released}
              onTakeBack={takeBack}
              registerFlush={registerFlush}
            />
          );
        })}
      </div>

      {/* Always in reach at the bottom (no scrolling back up on the iPad). It
          stays after release, so a quick second tap lands on it and not on a
          mark button that was underneath. */}
      <div data-toast-avoid className="sticky bottom-3 z-30 mt-6 flex items-center justify-between gap-3 rounded-full border border-border-strong bg-surface py-2 pl-5 pr-2 shadow-[var(--shadow-lg)] max-md:bottom-24">
        <span className="text-base font-semibold tabular-nums text-ink">
          {awarded}/{total} <span className="font-normal text-ink-3">· {grade.percent}%{released ? " · Released" : ""}</span>
        </span>
        {released ? (
          nextId ? <Button variant="secondary" onClick={() => router.push(`/admin/grading/${nextId}`)}>Next to mark →</Button> : <span className="min-h-11" />
        ) : (
          <Button data-release disabled={!fullyGraded} onClick={() => release(!!nextId)}>
            {nextId ? "Release & next" : "Release result"}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Where "next" goes. Papers waiting to be marked stand in a fixed order (by
 * hand in time) with this one in its place, and next is the first after it
 * from the same test, then from any other, wrapping round. Before, it was
 * always the oldest other paper, so Skip went A to B and back to A.
 * Archived work (switched-off cohorts) stays out.
 */
function nextPaper(db: Database, current: Submission | null): string | undefined {
  if (!current) return undefined;
  const off = archivedCohortIds(db);
  const order = [...db.submissions.filter((s) => s.status === "submitted" && s.id !== current.id && !isArchivedSubmission(db, s, off)), current].sort(
    (a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? "") || a.id.localeCompare(b.id),
  );
  const at = order.indexOf(current);
  const after = [...order.slice(at + 1), ...order.slice(0, at)];
  return (after.find((s) => s.testId === current.testId) ?? after[0])?.id;
}

/** The first photo page of a paper (to have it ready before it opens). */
function firstPhoto(db: Database, id: string | undefined): string | undefined {
  const sub = id ? db.submissions.find((s) => s.id === id) : undefined;
  const a = sub?.answers.find((x) => x.photoUrls?.length || x.photoDataUrl);
  return a?.photoUrls?.[0] ?? a?.photoDataUrl;
}

function GradeCard({
  index,
  question,
  answer,
  submissionId,
  writeEndMs,
  released,
  onTakeBack,
  registerFlush,
}: {
  index: number;
  question: Question;
  answer?: Answer;
  submissionId: string;
  /** When this student's writing time ended (for photo time checks). */
  writeEndMs: number | null;
  /** The result is out: any change first asks to take it back. */
  released: boolean;
  /** Takes the result back to mark again (asks first unless `ask` is false). True if it did. */
  onTakeBack: (ask?: boolean) => boolean;
  /** Lets Release save this card's comment and strokes first. */
  registerFlush: (key: string, flush: () => void) => () => void;
}) {
  const store = useStore();
  // Saved markings must be here before any can be drawn: a save writes the whole set.
  const strokesReady = store.strokesReady(submissionId);
  const awarded = answer?.marksAwarded;
  const locked = question.type === "mcq";
  const [annotating, setAnnotating] = useState<number | null>(null);
  // A released result opens in the pen view to look at, unless taken back.
  const [lookOnly, setLookOnly] = useState(false);
  const [page, setPage] = useState(0);
  // A quiet line under the marks about the stamps (see onStamps).
  const [stampNote, setStampNote] = useState<{ text: string; use?: number } | null>(null);
  // One debounce per page: a scribble is a single write, and moving to the next
  // page never cancels the previous page's pending save.
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // What is still waiting to be saved, so leaving the page saves it instead of dropping it.
  const pending = useRef(new Map<string, Annotation[]>());
  // Each page's strokes as last handed to the store, to tell what was rubbed
  // out here (so strokes made on another device are kept, and these are not).
  const lastSent = useRef(new Map<string, Annotation[]>());

  const sendShapes = useCallback(
    (url: string, shapes: Annotation[]) => {
      const keep = new Set(shapes.map((s) => s.id));
      const erased = (lastSent.current.get(url) ?? []).filter((s) => !keep.has(s.id)).map((s) => s.id);
      lastSent.current.set(url, shapes);
      store.saveAnnotations(submissionId, question.id, url, shapes, erased);
    },
    [store, submissionId, question.id],
  );
  function saveShapes(url: string, shapes: Annotation[]) {
    clearTimeout(saveTimers.current.get(url));
    pending.current.set(url, shapes);
    saveTimers.current.set(
      url,
      setTimeout(() => {
        pending.current.delete(url);
        sendShapes(url, shapes);
      }, 500),
    );
  }
  /** Saves any strokes still in their short pause, now. */
  const flushShapes = useCallback(() => {
    saveTimers.current.forEach(clearTimeout);
    saveTimers.current.clear();
    pending.current.forEach((shapes, url) => sendShapes(url, shapes));
    pending.current.clear();
  }, [sendShapes]);
  // Release & next, or any other way out: save the last strokes now.
  useEffect(() => () => flushShapes(), [flushShapes]);

  function openPen(i: number) {
    if (!strokesReady) return;
    lastSent.current = new Map(Object.entries(answer?.annotations ?? {}));
    const edit = !released || (window.confirm("This result is already out. Take it back to change the markings? Choose Cancel to just look.") && onTakeBack(false));
    setLookOnly(!edit);
    setAnnotating(i);
  }

  // Feedback is typed into local state and saved after a short pause (or on
  // leaving the box): saving on every keystroke made typing lag.
  const [feedback, setFeedback] = useState(answer?.feedback ?? "");
  const feedbackRef = useRef(feedback);
  // What was last handed to the store (which keeps trying until it lands): a
  // pause, then leaving the box, must not save it twice.
  const savedFeedback = useRef(feedback);
  const fbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushFeedback = useCallback(() => {
    if (fbTimer.current) clearTimeout(fbTimer.current);
    fbTimer.current = null;
    if (feedbackRef.current === savedFeedback.current) return;
    savedFeedback.current = feedbackRef.current;
    // Feedback only: never scores the answer by itself.
    store.gradeAnswer(submissionId, question.id, undefined, feedbackRef.current);
  }, [store, submissionId, question.id]);
  function typeFeedback(v: string) {
    if (released && !onTakeBack()) return;
    setFeedback(v);
    feedbackRef.current = v;
    if (fbTimer.current) clearTimeout(fbTimer.current);
    fbTimer.current = setTimeout(flushFeedback, 700);
  }
  useEffect(() => () => flushFeedback(), [flushFeedback]);
  // A newer saved comment (fresh data after the saved copy, or written on
  // another device) shows in the box, unless something is being typed here.
  const incomingFeedback = answer?.feedback ?? "";
  useEffect(() => {
    if (incomingFeedback === savedFeedback.current || feedbackRef.current !== savedFeedback.current) return;
    savedFeedback.current = incomingFeedback;
    feedbackRef.current = incomingFeedback;
    setFeedback(incomingFeedback);
  }, [incomingFeedback]);
  useEffect(
    () =>
      registerFlush(question.id, () => {
        flushShapes();
        flushFeedback();
      }),
    [registerFlush, question.id, flushShapes, flushFeedback],
  );

  /** `null` empties the box: the question is "not marked yet" again (never a silent 0). */
  function setMarks(v: number | null) {
    if (released && !onTakeBack()) return;
    setStampNote(null);
    // Whole marks: the portal stores whole numbers, so 2.5 looked saved but was not.
    const clamped = v === null ? null : Math.max(0, Math.min(question.marks, Math.round(Number.isFinite(v) ? v : 0)));
    store.gradeAnswer(submissionId, question.id, clamped);
  }

  /**
   * Stamps in the margin fill the score only while it is empty or still the
   * stamps' own total; a score typed by hand is never replaced without a tap.
   * Taking every stamp away empties the score again (never a silent 0).
   */
  function onStamps(sum: number, before: number, stamps: number) {
    const fit = (n: number) => Math.max(0, Math.min(question.marks, Math.round(n)));
    const fromStamps = awarded === undefined || awarded === fit(before);
    if (!stamps) {
      if (fromStamps && awarded !== undefined) store.gradeAnswer(submissionId, question.id, null);
      setStampNote(null);
      return;
    }
    const whole = fit(sum);
    if (!fromStamps) {
      if (whole !== awarded) setStampNote({ text: `Stamps add up to ${sum}.`, use: whole });
      else setStampNote(null);
      return;
    }
    store.gradeAnswer(submissionId, question.id, whole);
    // Said plainly when the score is not exactly the stamps' total.
    setStampNote(
      whole === sum
        ? null
        : sum > question.marks
          ? { text: `Stamps add up to ${sum}, more than the ${question.marks} this question is worth. Saved as ${whole}.` }
          : { text: `Stamps add up to ${sum}. Saved as ${whole}, as marks are whole numbers.` },
    );
  }

  /** Enter in a marks box: on to the next one still empty, then to Release. */
  function onMarkKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const boxes = [...document.querySelectorAll<HTMLInputElement>("input[data-mark-box]")];
    const at = boxes.indexOf(e.currentTarget);
    const next = boxes.slice(at + 1).find((b) => b.value === "") ?? boxes.find((b, i) => i !== at && b.value === "");
    if (next) {
      next.focus();
      next.scrollIntoView({ block: "center" });
      return;
    }
    document.querySelector<HTMLElement>("[data-release]")?.focus();
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-ink-3">Q{index + 1}</span>
          <Badge tone="neutral">{question.type === "mcq" ? "Choice" : question.type === "photo" ? "Photo" : "Written"}</Badge>
          {question.topic.trim() && <Badge tone="neutral">{question.topic}</Badge>}
          <Pill>{question.marks}m</Pill>
          {locked && <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Icon.Lock className="h-3 w-3" /> marked automatically</span>}
        </div>
      </div>
      {isPastPaper(question) ? (
        // Past paper: the wording as students saw it (bold kept), and its source in small text, as on the test page.
        <>
          {withoutSources(question.prompt) && <PaperText text={withoutSources(question.prompt)} className="mt-3 text-pretty text-base font-semibold leading-snug text-ink" />}
          <p className="mt-1 text-sm text-ink-3">{idsInText(question.prompt).map(sourceLabel).join(", ")}</p>
        </>
      ) : (
        <p className="mt-3 text-pretty text-base font-semibold leading-snug text-ink">{question.prompt}</p>
      )}
      {question.attachments && question.attachments.length > 0 && (
        <div className="mt-3">
          <PageStack urls={question.attachments} label="Question paper" />
        </div>
      )}

      {/* A written past paper question: its mark scheme beside the answer. */}
      <div className={cn("mt-3", question.type !== "mcq" && idsInText(question.prompt).length > 0 && "grid grid-cols-1 items-start gap-4 lg:grid-cols-2")}>
      <div className="min-w-0">
        {question.type === "mcq" && (
          <ul className="space-y-1.5">
            {question.options.map((opt, oi) => {
              const chosen = answer?.selectedIndex === oi;
              const correct = question.correctIndex === oi;
              return (
                <li key={oi} className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-field border px-3.5 py-2 text-base",
                  correct ? "border-success/40 bg-success-soft text-success" : chosen ? "border-error/40 bg-error-soft text-error" : "border-border bg-surface text-ink-2",
                )}>
                  {correct ? <Icon.Check className="h-4 w-4 shrink-0" /> : chosen ? <Icon.Close className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0" />}
                  <span>{opt}</span>
                  {chosen && <span className="ml-auto text-xs font-semibold">Student</span>}
                </li>
              );
            })}
          </ul>
        )}
        {question.type === "text" && (
          <div className="whitespace-pre-wrap break-words rounded-tile bg-surface-2 p-4 text-base leading-relaxed text-ink">
            {answer?.text || <span className="italic text-ink-3">No answer given</span>}
          </div>
        )}
        {question.type === "photo" && (() => {
          // photoUrls is the full set; fall back to the legacy single URL.
          const photos = answer?.photoUrls ?? (answer?.photoDataUrl ? [answer.photoDataUrl] : []);
          if (!photos.length) return <p className="text-base italic text-ink-3">No photo submitted</p>;
          // One page at a time in a fixed-height box: a 50-page PDF must not turn
          // the grading screen into a mile of scrolling to reach the marks.
          const shown = Math.min(page, photos.length - 1);
          const url = photos[shown];
          return (
            <div className="space-y-2">
              <div className="max-h-[26rem] overflow-auto rounded-tile border border-hairline bg-surface-2">
                <AnnotatedImage
                  url={url}
                  shapes={answer?.annotations?.[url] ?? []}
                  alt={`Answer to question ${index + 1}, page ${shown + 1}`}
                  onClick={() => openPen(shown)}
                  className="block w-full"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
                <TakenNote url={url} writeEndMs={writeEndMs} />
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={() => setPage(Math.max(0, shown - 1))}
                      disabled={shown === 0}
                      className="h-11 min-w-11 rounded-full border border-border-strong px-3 text-base text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                      aria-label="Previous page"
                    >
                      ‹
                    </button>
                    <span className="tabular-nums">Page {shown + 1} of {photos.length}</span>
                    <button
                      onClick={() => setPage(Math.min(photos.length - 1, shown + 1))}
                      disabled={shown === photos.length - 1}
                      className="h-11 min-w-11 rounded-full border border-border-strong px-3 text-base text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
                      aria-label="Next page"
                    >
                      ›
                    </button>
                  </>
                )}
                <button
                  onClick={() => openPen(shown)}
                  disabled={!strokesReady}
                  className="inline-flex min-h-11 items-center font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline disabled:text-ink-3 disabled:no-underline"
                >
                  {strokesReady ? "Open to annotate" : "Getting your markings…"}
                </button>
              </div>
              {annotating !== null && strokesReady && (
                <AnnotatorModal
                  urls={photos}
                  startAt={annotating}
                  initial={answer?.annotations ?? {}}
                  onChange={saveShapes}
                  // Marks written in the margin add themselves up into the
                  // score while it is empty or theirs; the field below stays editable.
                  onMarksTotal={locked || lookOnly ? undefined : onStamps}
                  readOnly={lookOnly}
                  onClose={() => setAnnotating(null)}
                />
              )}
            </div>
          );
        })()}
      </div>
      {question.type !== "mcq" && idsInText(question.prompt).length > 0 && <MarkSchemePanel prompt={question.prompt} />}
      </div>

      {/* Scoring */}
      <div className="mt-5 border-t border-hairline pt-4">
        {locked ? (
          <p className="text-base text-ink-2">Awarded <span className="font-semibold tabular-nums text-ink">{awarded ?? 0}/{question.marks}</span> automatically.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-ink-2">Marks</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMarks((awarded ?? 0) - 1)}
                  className="h-11 w-11 rounded-full border border-border-strong bg-transparent text-lg font-semibold text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.97]"
                  aria-label="One mark less"
                >
                  −
                </button>
                {/* Plain text that takes digits only: a scroll wheel over a number
                    box could nudge the mark, and an emptied box is "not marked". */}
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  data-mark-box
                  value={awarded ?? ""}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "");
                    setMarks(digits === "" ? null : Number(digits));
                  }}
                  onKeyDown={onMarkKey}
                  aria-label={`Marks out of ${question.marks}`}
                  className="h-11 w-20 rounded-field border border-field bg-surface px-3 text-center text-base font-semibold tabular-nums text-ink transition-colors hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                />
                <button
                  onClick={() => setMarks((awarded ?? 0) + 1)}
                  className="h-11 w-11 rounded-full border border-border-strong bg-transparent text-lg font-semibold text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink active:scale-[0.97]"
                  aria-label="One mark more"
                >
                  +
                </button>
                <span className="text-sm text-ink-3">/ {question.marks}</span>
              </div>
              {/* One-tap marks for the common calls */}
              <div className="flex items-center gap-1.5" role="group" aria-label="Quick marks">
                {Array.from(new Set([0, Math.round(question.marks / 2), question.marks])).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMarks(v)}
                    aria-pressed={awarded === v}
                    className={cn(
                      "h-11 min-w-11 rounded-full border px-3.5 text-sm font-semibold tabular-nums transition-colors duration-150 active:scale-[0.97]",
                      awarded === v
                        ? "border-white/[0.16] bg-white/[0.09] text-ink"
                        : "border-border bg-transparent text-ink-3 hover:border-border-strong hover:text-ink",
                    )}
                  >
                    {v === question.marks ? `Full (${v})` : v === 0 ? "0" : `Half (${v})`}
                  </button>
                ))}
              </div>
            </div>
            {stampNote && (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-ink-3">
                {stampNote.text}
                {stampNote.use !== undefined && (
                  <button
                    type="button"
                    onClick={() => setMarks(stampNote.use!)}
                    className="inline-flex min-h-11 items-center font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline"
                  >
                    Use {stampNote.use}
                  </button>
                )}
              </p>
            )}
            <Textarea
              label="Feedback (optional)"
              value={feedback}
              onChange={(e) => typeFeedback(e.target.value)}
              onBlur={flushFeedback}
              placeholder="A short note for the student…"
              className="min-h-20"
            />
          </div>
        )}
      </div>
    </Card>
  );
}

const GRACE_MS = 2 * 60_000;
// Pakistan time, like every other time in the portal (not the device's own zone).
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit", hour12: true });

/** Ctrl or Cmd + Enter anywhere on the page releases the result. */
function ReleaseShortcut({ enabled, onRelease }: { enabled: boolean; onRelease: () => void }) {
  const fire = useEffectEvent((e: KeyboardEvent) => {
    if (!enabled || !(e.metaKey || e.ctrlKey) || e.key !== "Enter" || e.repeat) return;
    e.preventDefault();
    onRelease();
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => fire(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

/** "Taken 4:46 pm" under a page, with a gentle flag if it was well after time. */
function TakenNote({ url, writeEndMs }: { url: string; writeEndMs: number | null }) {
  const taken = takenTimeOf(url);
  if (!taken) return <span className="text-ink-3">Photo time unknown</span>;
  const after = writeEndMs ? Math.round((taken.getTime() - writeEndMs) / 60_000) : null;
  const flag = writeEndMs != null && taken.getTime() > writeEndMs + GRACE_MS;
  return (
    <span className={flag ? "font-semibold text-warning" : "text-ink-3"}>
      Taken {clock(taken.getTime())}
      {flag && after != null ? ` · ${after} min after time was up` : ""}
    </span>
  );
}

/** Writing end, each page's photo time, and hand-in time, on one line. */
function PhotoTimeline({
  writeEndMs,
  submittedAt,
  late,
  lateWindow = false,
  pages,
}: {
  writeEndMs: number;
  submittedAt: string | null;
  late: boolean;
  /** Sat in a late window Hamza opened for them. */
  lateWindow?: boolean;
  pages: Array<{ label: string; taken: Date | null }>;
}) {
  const flagged = pages.filter((p) => p.taken && p.taken.getTime() > writeEndMs + GRACE_MS).length;
  return (
    <Card className="mb-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="label-quiet text-ink-3">Photo timeline</p>
        {flagged > 0 ? (
          <p className="text-sm font-semibold text-warning">
            {flagged} page{flagged === 1 ? "" : "s"} photographed more than 2 min after time was up
          </p>
        ) : pages.some((p) => p.taken) ? (
          <p className="text-sm text-ink-3">Photos taken on time</p>
        ) : (
          <p className="text-sm text-ink-3">Photo times not available for these pages</p>
        )}
      </div>
      <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <li className="rounded-full bg-surface-2 px-2.5 py-1 font-semibold text-ink">Time up {clock(writeEndMs)}</li>
        {pages.map((p, i) => {
          const flag = p.taken && p.taken.getTime() > writeEndMs + GRACE_MS;
          return (
            <li
              key={i}
              className={
                flag
                  ? "rounded-full border border-warning/40 bg-warning-soft px-2.5 py-1 font-semibold text-warning"
                  : "rounded-full border border-border px-2.5 py-1 text-ink-2"
              }
            >
              {p.label} {p.taken ? clock(p.taken.getTime()) : "· time unknown"}
            </li>
          );
        })}
        {submittedAt && (
          <li className={late ? "rounded-full bg-warning-soft px-2.5 py-1 font-semibold text-warning" : "rounded-full bg-surface-2 px-2.5 py-1 font-semibold text-ink"}>
            Handed in {clock(new Date(submittedAt).getTime())}
            {late ? " · late" : lateWindow ? " · in the late window you opened" : ""}
          </li>
        )}
      </ol>
    </Card>
  );
}
