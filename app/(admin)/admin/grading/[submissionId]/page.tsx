"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { Annotation, Answer, Question } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { submissionById, studentById, testById, archivedCohortIds, isArchivedSubmission } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { AnnotatedImage, AnnotatorModal } from "@/components/Annotator";
import { PageStack } from "@/components/PageStack";
import { Card, Button, Badge, Pill, Textarea, EmptyState, Icon } from "@/components/ui";
import { awardedMarks, isFullyGraded, totalMarks } from "@/lib/scoring";
import { gradeSubmission } from "@/lib/grading";
import { takenTimeOf } from "@/lib/photo-time";
import { cn } from "@/lib/cn";

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

  const submission = submissionById(db, subId);
  const test = submission ? testById(db, submission.testId) : null;
  const student = submission ? studentById(db, submission.studentId) : null;

  if (!submission || !test || !student) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        <PageHeader title="Submission not found" back={{ href: "/admin/submissions", label: "Submissions" }} />
        <EmptyState icon={<Icon.Inbox />} title="This submission no longer exists" />
      </div>
    );
  }

  const total = totalMarks(test);
  const awarded = awardedMarks(submission);
  const fullyGraded = isFullyGraded(test, submission);
  // Writing time ended at start + duration (or when the test closed, if sooner).
  // Photos taken well after that are flagged gently; nothing is blocked.
  const writeEndMs = submission.startedAt
    ? Math.min(new Date(submission.startedAt).getTime() + test.durationMinutes * 60_000, new Date(test.closesAt).getTime())
    : null;
  const pagePhotos = test.questions
    .filter((q) => q.type === "photo")
    .flatMap((q) => {
      const a = submission.answers.find((x) => x.questionId === q.id);
      const urls = a?.photoUrls ?? (a?.photoDataUrl ? [a.photoDataUrl] : []);
      const qn = test.questions.indexOf(q) + 1;
      return urls.map((u, i) => ({ label: `Q${qn}${urls.length > 1 ? ` p${i + 1}` : ""}`, taken: takenTimeOf(u) }));
    });
  const released = submission.status === "released";
  const grade = gradeSubmission(test, submission);

  // Where "next" goes: the oldest paper still waiting from this same test,
  // then from any other. Archived work (switched-off cohorts) stays out.
  const off = archivedCohortIds(db);
  const queue = db.submissions.filter((s) => s.status === "submitted" && !isArchivedSubmission(db, s, off));
  const others = queue.filter((s) => s.id !== subId).sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  const nextId = (others.find((s) => s.testId === submission.testId) ?? others[0])?.id;
  const waiting = queue.length;
  // Written / photo questions left blank and not yet scored: one tap gives them 0.
  const blanks = test.questions.filter((q) => {
    if (q.type === "mcq") return false;
    const a = submission.answers.find((x) => x.questionId === q.id);
    if (typeof a?.marksAwarded === "number") return false;
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

  function release(goNext: boolean) {
    store.releaseSubmission(subId);
    toast(`${name}'s result released.`, "success");
    if (goNext && nextId) router.push(`/admin/grading/${nextId}`);
  }

  return (
    <div
      className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8"
      // Ctrl/Cmd + Enter while marking: release and move to the next one.
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && fullyGraded && !released) {
          e.preventDefault();
          release(!!nextId);
        }
      }}
    >
      <PageHeader
        title="Grading"
        subtitle={`${name} · ${test.title}${waiting ? ` · ${waiting} waiting to be marked` : ""}`}
        back={{ href: "/admin/submissions", label: "Submissions" }}
        actions={
          released ? (
            <>
              <Badge tone="success">Released</Badge>
              <Button variant="secondary" onClick={() => { if (!window.confirm("Take this result back to mark again? The student won't see it until you release it again.")) return; store.unreleaseSubmission(subId); toast("Opened for marking again.", "info"); }}>
                <Icon.Refresh className="h-4 w-4" /> Mark again
              </Button>
              {nextId && (
                <Button onClick={() => router.push(`/admin/grading/${nextId}`)}>Next to mark →</Button>
              )}
            </>
          ) : (
            <>
              {nextId && (
                <Link href={`/admin/grading/${nextId}`} className="text-sm font-semibold text-ink-2 hover:text-ink">
                  Skip to next →
                </Link>
              )}
              <Button disabled={!fullyGraded} onClick={() => release(!!nextId)}>
                {nextId ? "Release & next" : "Release result"}
                <kbd className="ml-1.5 hidden rounded border border-current/30 px-1 text-[10px] font-semibold opacity-70 lg:inline">Ctrl ↵</kbd>
              </Button>
            </>
          )
        }
      />

      {/* Running total */}
      <Card ruled className="mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Running total</p>
          <p className="font-mono text-2xl font-bold text-ink">{awarded}<span className="text-base text-ink-3">/{total}</span></p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-semibold text-ink">{grade.percent}%</p>
          <p className="text-sm text-ink-2">Grade {grade.letter}</p>
        </div>
        {!fullyGraded && !released && (
          <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
            <span>Score every written and photo answer before releasing.</span>
            {blanks.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  for (const q of blanks) store.gradeAnswer(subId, q.id, 0);
                  toast(`Gave 0 to ${blanks.length === 1 ? "1 blank answer" : `${blanks.length} blank answers`}.`, "success");
                }}
                className="h-9 rounded-full border border-warning/40 px-3 text-xs font-semibold text-ink hover:bg-warning/10"
              >
                0 for {blanks.length === 1 ? "the blank answer" : `the ${blanks.length} blank answers`}
              </button>
            )}
          </div>
        )}
      </Card>

      {mcqs.length > 0 && mcqs.length < test.questions.length && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-4 py-3 text-sm text-ink-2">
          <span>
            {mcqs.length} multiple choice {mcqs.length === 1 ? "question" : "questions"} marked automatically:{" "}
            <span className="font-mono font-semibold text-ink">{mcqAwarded}/{mcqTotal}</span>
          </span>
          <button
            type="button"
            onClick={() => setShowAuto((v) => !v)}
            className="font-semibold text-brand hover:underline"
            aria-expanded={showAuto}
          >
            {showAuto ? "Hide them" : "Show them"}
          </button>
        </div>
      )}

      {pagePhotos.length > 0 && writeEndMs && (
        <PhotoTimeline writeEndMs={writeEndMs} submittedAt={submission.submittedAt ?? null} late={!!submission.late} pages={pagePhotos} />
      )}

      <div className="space-y-3">
        {test.questions.map((q, i) => {
          if (hideAuto && q.type === "mcq") return null;
          const a = submission.answers.find((x) => x.questionId === q.id);
          return <GradeCard key={`${subId}-${q.id}`} index={i} question={q} answer={a} submissionId={subId} writeEndMs={writeEndMs} />;
        })}
      </div>

      {/* Always in reach at the bottom (no scrolling back up on the iPad). */}
      {!released && (
        <div className="sticky bottom-3 z-20 mt-6 flex items-center justify-between gap-3 rounded-full border border-border bg-surface/95 py-2 pl-5 pr-2 shadow-[var(--shadow-lg)]">
          <span className="font-mono text-sm font-semibold text-ink">
            {awarded}/{total} <span className="font-sans font-normal text-ink-3">· {grade.percent}%</span>
          </span>
          <Button disabled={!fullyGraded} onClick={() => release(!!nextId)}>
            {nextId ? "Release & next" : "Release result"}
          </Button>
        </div>
      )}
    </div>
  );
}

function GradeCard({
  index,
  question,
  answer,
  submissionId,
  writeEndMs,
}: {
  index: number;
  question: Question;
  answer?: Answer;
  submissionId: string;
  /** When this student's writing time ended (for photo time checks). */
  writeEndMs: number | null;
}) {
  const store = useStore();
  const awarded = answer?.marksAwarded;
  const locked = question.type === "mcq";
  const [annotating, setAnnotating] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  // One debounce per page: a scribble is a single write, and moving to the next
  // page never cancels the previous page's pending save.
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // What is still waiting to be saved, so leaving the page saves it instead of dropping it.
  const pending = useRef(new Map<string, Annotation[]>());

  function saveShapes(url: string, shapes: Annotation[]) {
    clearTimeout(saveTimers.current.get(url));
    pending.current.set(url, shapes);
    saveTimers.current.set(
      url,
      setTimeout(() => {
        pending.current.delete(url);
        store.saveAnnotations(submissionId, question.id, url, shapes);
      }, 500),
    );
  }
  useEffect(() => {
    const timers = saveTimers.current;
    const waiting = pending.current;
    return () => {
      timers.forEach(clearTimeout);
      // Release & next, or any other way out: save the last strokes now.
      waiting.forEach((shapes, url) => store.saveAnnotations(submissionId, question.id, url, shapes));
      waiting.clear();
    };
  }, [store, submissionId, question.id]);

  // Feedback is typed into local state and saved after a short pause (or on
  // leaving the box): saving on every keystroke made typing lag.
  const [feedback, setFeedback] = useState(answer?.feedback ?? "");
  const feedbackRef = useRef(feedback);
  // What was last saved: a pause, then leaving the box, must not save it twice.
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
    setFeedback(v);
    feedbackRef.current = v;
    if (fbTimer.current) clearTimeout(fbTimer.current);
    fbTimer.current = setTimeout(flushFeedback, 700);
  }
  useEffect(() => () => flushFeedback(), [flushFeedback]);

  function setMarks(v: number) {
    const clamped = Math.max(0, Math.min(question.marks, v));
    store.gradeAnswer(submissionId, question.id, clamped);
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink-3">Q{index + 1}</span>
          <Badge tone="neutral" className="uppercase">{question.type}</Badge>
          <Badge tone="brand">{question.topic}</Badge>
          <Pill>{question.marks}m</Pill>
          {locked && <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Icon.Lock className="h-3 w-3" /> marked automatically</span>}
        </div>
      </div>
      <p className="mt-2 font-semibold text-ink">{question.prompt}</p>
      {question.attachments && question.attachments.length > 0 && (
        <div className="mt-3">
          <PageStack urls={question.attachments} label="Question paper" />
        </div>
      )}

      <div className="mt-3">
        {question.type === "mcq" && (
          <ul className="space-y-1.5">
            {question.options.map((opt, oi) => {
              const chosen = answer?.selectedIndex === oi;
              const correct = question.correctIndex === oi;
              return (
                <li key={oi} className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
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
          <div className="rounded-md border border-border bg-surface-2/60 p-3 text-sm text-ink">
            {answer?.text || <span className="italic text-ink-3">No answer given</span>}
          </div>
        )}
        {question.type === "photo" && (() => {
          // photoUrls is the full set; fall back to the legacy single URL.
          const photos = answer?.photoUrls ?? (answer?.photoDataUrl ? [answer.photoDataUrl] : []);
          if (!photos.length) return <p className="text-sm italic text-ink-3">No photo submitted</p>;
          // One page at a time in a fixed-height box: a 50-page PDF must not turn
          // the grading screen into a mile of scrolling to reach the marks.
          const shown = Math.min(page, photos.length - 1);
          const url = photos[shown];
          return (
            <div className="space-y-2">
              <div className="max-h-[26rem] overflow-auto rounded-md border border-border bg-surface-2">
                <AnnotatedImage
                  url={url}
                  shapes={answer?.annotations?.[url] ?? []}
                  alt={`Answer to question ${index + 1}, page ${shown + 1}`}
                  onClick={() => setAnnotating(shown)}
                  className="block w-full"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                <TakenNote url={url} writeEndMs={writeEndMs} />
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={() => setPage(Math.max(0, shown - 1))}
                      disabled={shown === 0}
                      className="h-8 rounded-md border border-border-strong px-2.5 text-ink-2 disabled:opacity-40"
                      aria-label="Previous page"
                    >
                      ‹
                    </button>
                    <span className="tabular">Page {shown + 1} of {photos.length}</span>
                    <button
                      onClick={() => setPage(Math.min(photos.length - 1, shown + 1))}
                      disabled={shown === photos.length - 1}
                      className="h-8 rounded-md border border-border-strong px-2.5 text-ink-2 disabled:opacity-40"
                      aria-label="Next page"
                    >
                      ›
                    </button>
                  </>
                )}
                <button onClick={() => setAnnotating(shown)} className="font-semibold text-brand hover:underline">
                  Open to annotate
                </button>
              </div>
              {annotating !== null && (
                <AnnotatorModal
                  urls={photos}
                  startAt={annotating}
                  initial={answer?.annotations ?? {}}
                  onChange={saveShapes}
                  // Marks written in the margin add themselves up into the
                  // score; the field below stays editable.
                  onMarksTotal={locked ? undefined : setMarks}
                  onClose={() => setAnnotating(null)}
                />
              )}
            </div>
          );
        })()}
      </div>

      {/* Scoring */}
      <div className="mt-4 border-t border-border pt-3">
        {locked ? (
          <p className="text-sm text-ink-2">Awarded <span className="font-mono font-semibold text-ink">{awarded ?? 0}/{question.marks}</span> automatically.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-ink-2">Marks</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMarks((awarded ?? 0) - 1)}
                  className="h-10 w-10 rounded-md border border-border-strong bg-surface text-lg font-semibold text-ink-2 hover:bg-surface-2"
                  aria-label="One mark less"
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  max={question.marks}
                  value={awarded ?? ""}
                  onChange={(e) => setMarks(e.target.value === "" ? 0 : Number(e.target.value))}
                  placeholder="0"
                  aria-label={`Marks out of ${question.marks}`}
                  className="h-10 w-20 rounded-md border border-border-strong bg-surface px-3 text-center font-mono text-base font-semibold text-ink"
                />
                <button
                  onClick={() => setMarks((awarded ?? 0) + 1)}
                  className="h-10 w-10 rounded-md border border-border-strong bg-surface text-lg font-semibold text-ink-2 hover:bg-surface-2"
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
                      "h-10 min-w-10 rounded-md border px-3 text-sm font-semibold",
                      awarded === v
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    {v === question.marks ? `Full (${v})` : v === 0 ? "0" : `Half (${v})`}
                  </button>
                ))}
              </div>
            </div>
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
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });

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
  pages,
}: {
  writeEndMs: number;
  submittedAt: string | null;
  late: boolean;
  pages: Array<{ label: string; taken: Date | null }>;
}) {
  const flagged = pages.filter((p) => p.taken && p.taken.getTime() > writeEndMs + GRACE_MS).length;
  return (
    <Card className="mb-5 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-3">Photo timeline</p>
        {flagged > 0 ? (
          <p className="text-xs font-semibold text-warning">
            {flagged} page{flagged === 1 ? "" : "s"} photographed more than 2 min after time was up
          </p>
        ) : pages.some((p) => p.taken) ? (
          <p className="text-xs text-ink-3">Photos taken on time</p>
        ) : (
          <p className="text-xs text-ink-3">Photo times not available for these pages</p>
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
            {late ? " · late" : ""}
          </li>
        )}
      </ol>
    </Card>
  );
}
