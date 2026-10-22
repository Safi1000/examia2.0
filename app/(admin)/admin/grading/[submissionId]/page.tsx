"use client";

import { useEffect, useRef, useState } from "react";
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
  const released = submission.status === "released";
  const grade = gradeSubmission(test, submission);

  // The oldest other submission still waiting for a mark: where "next" goes.
  // Archived work (switched-off cohorts) stays out of the marking queue.
  const off = archivedCohortIds(db);
  const queue = db.submissions.filter((s) => s.status === "submitted" && !isArchivedSubmission(db, s, off));
  const nextId = queue
    .filter((s) => s.id !== subId)
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""))[0]?.id;
  const waiting = queue.length;

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
              <Button variant="secondary" onClick={() => { store.unreleaseSubmission(subId); toast("Re-opened for grading.", "info"); }}>
                <Icon.Refresh className="h-4 w-4" /> Re-grade
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
          <p className="w-full rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
            Score every written and photo answer before releasing.
          </p>
        )}
      </Card>

      {mcqs.length > 0 && mcqs.length < test.questions.length && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-4 py-3 text-sm text-ink-2">
          <span>
            {mcqs.length} multiple-choice {mcqs.length === 1 ? "question" : "questions"} marked automatically:{" "}
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

      <div className="space-y-3">
        {test.questions.map((q, i) => {
          if (hideAuto && q.type === "mcq") return null;
          const a = submission.answers.find((x) => x.questionId === q.id);
          return <GradeCard key={q.id} index={i} question={q} answer={a} submissionId={subId} />;
        })}
      </div>
    </div>
  );
}

function GradeCard({
  index,
  question,
  answer,
  submissionId,
}: {
  index: number;
  question: Question;
  answer?: Answer;
  submissionId: string;
}) {
  const store = useStore();
  const awarded = answer?.marksAwarded;
  const locked = question.type === "mcq";
  const [annotating, setAnnotating] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  // One debounce per page: a scribble is a single write, and moving to the next
  // page never cancels the previous page's pending save.
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  function saveShapes(url: string, shapes: Annotation[]) {
    clearTimeout(saveTimers.current.get(url));
    saveTimers.current.set(
      url,
      setTimeout(() => store.saveAnnotations(submissionId, question.id, url, shapes), 500),
    );
  }
  useEffect(() => {
    const timers = saveTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  function setMarks(v: number) {
    const clamped = Math.max(0, Math.min(question.marks, v));
    store.gradeAnswer(submissionId, question.id, clamped, answer?.feedback);
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-ink-3">Q{index + 1}</span>
          <Badge tone="neutral" className="uppercase">{question.type}</Badge>
          <Badge tone="brand">{question.topic}</Badge>
          <Pill>{question.marks}m</Pill>
          {locked && <span className="inline-flex items-center gap-1 text-xs text-ink-3"><Icon.Lock className="h-3 w-3" /> auto-graded</span>}
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
              value={answer?.feedback ?? ""}
              onChange={(e) => store.gradeAnswer(submissionId, question.id, awarded, e.target.value)}
              placeholder="A short note for the student…"
              className="min-h-20"
            />
          </div>
        )}
      </div>
    </Card>
  );
}
