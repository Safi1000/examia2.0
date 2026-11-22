"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import type { Answer, Question, Student, Submission, Test } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useStore } from "@/lib/data/store";
import { studentById, testById, submissionFor, submissionsForStudent } from "@/lib/data/selectors";
import { Card, Badge, Icon, EmptyState } from "@/components/ui";
import { AnnotatedImage } from "@/components/Annotator";
import { PageStack, PageViewerModal } from "@/components/PageStack";
import { PaperText } from "@/components/PaperText";
import { isPastPaper, withoutSources } from "@/lib/paper-builder";
import { buttonClasses } from "@/components/ui/Button";
import { gradeSubmission } from "@/lib/grading";
import { formatDuration, formatTimestamp } from "@/lib/time";
import { cn } from "@/lib/cn";
import { StudyCoach, coachSteps, nextOpenTest } from "@/components/student/StudyCoach";
import { topicNotesFinder } from "@/components/student/topic-notes";
import { studentSubjects } from "@/components/student/Welcome";
import type { Mission } from "@/components/student/FocusMode";
import { ShareMoment } from "@/components/student/ShareMoment";
import { sameSubject, shownPercent } from "@/lib/performance";
import { displayName } from "@/lib/display-name";
import { worldScene } from "@/lib/groundwork";
import type { Database } from "@/lib/data/seed";
import { FinishMoment, GradeMedallion, MilestoneBadge, SectionTitle, type FinishAction } from "@/components/student/PortalKit";

// The same practice block Progress opens from "Practise", loaded only when asked for.
const FocusMode = dynamic(() => import("@/components/student/FocusMode"), { ssr: false });

export default function ResultsPage() {
  const params = useParams();
  const id = String(params.id);
  const { session, profile } = useAuth();
  const db = useDatabase();

  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const test = testById(db, id);
  const submission = student && test ? submissionFor(db, student.id, test.id) : null;
  // My markings on photo answers come separately (they are heavy).
  const store = useStore();
  // The practice block, open after "Practise <topic>".
  const [practise, setPractise] = useState<Mission | null>(null);
  const subId = submission?.status === "released" ? submission.id : null;
  useEffect(() => {
    if (subId) void store.loadAnnotations(subId);
  }, [store, subId]);

  if (!student || !test) {
    return <PendingShell title="Result unavailable" message="I can't find this test on your account." />;
  }
  if (!submission || submission.status !== "released") {
    return (
      <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
        <BackLink />
        {submission ? (
          <EmptyState
            className="mt-4"
            icon={<Icon.Clock />}
            title="I'm still marking this"
            message={`${submission.submittedAt ? `Handed in ${formatTimestamp(submission.submittedAt)}. ` : ""}It shows here as soon as I release it.`}
          />
        ) : (
          // Never handed in (or not sat yet): there is no result to wait for.
          <EmptyState
            className="mt-4"
            icon={<Icon.Clock />}
            title="No result for this test"
            message="You haven't handed this test in, so there's nothing to mark. Check Tests for what's open."
          />
        )}
      </div>
    );
  }

  const grade = gradeSubmission(test, submission);
  // Questions that lost marks, in paper order, so a phone can jump straight to them.
  // An answer still waiting for my marking hasn't lost anything yet.
  const lost = test.questions
    .map((q, i) => {
      const a = submission.answers.find((x) => x.questionId === q.id);
      return { n: i + 1, lost: awaitingMarks(a) ? 0 : q.marks - (a?.marksAwarded ?? 0) };
    })
    .filter((x) => x.lost > 0);
  const waiting = test.questions.filter((q) => awaitingMarks(submission.answers.find((x) => x.questionId === q.id))).length;
  const best = personalBest(db, student.id, test, submission, grade.percent);
  const finish = finishFor(db, student, test, submission, grade, waiting, setPractise);

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise">
      <BackLink />

      {/* No picture behind the score: a top grade shows in the drawn medallion (A* in gold), a personal best in its line. */}
      <Card className="mt-4 p-5 sm:p-6">
        {/* The test code is Hamza's own reference: students only need the subject. */}
        <p className="min-w-0 text-sm font-semibold text-ink-2">{test.subject}</p>
        <h1 className="mt-2 text-balance text-title font-bold tracking-[-0.025em] text-ink">{test.title}</h1>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[3.25rem] font-extrabold leading-none tracking-[-0.035em] tabular-nums text-ink">
              {grade.awarded}
              <span className="text-title font-bold tracking-[-0.02em] text-ink-3">/{grade.total}</span>
            </p>
            <p className="mt-2 text-base text-ink-2 tabular-nums">{shownPercent(grade.percent)}% on this test</p>
            {waiting > 0 && (
              <p className="mt-1 text-sm text-ink-3">
                {waiting === 1 ? "1 answer is" : `${waiting} answers are`} still waiting for my marking.
              </p>
            )}
            {best && (
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-brand">
                <MilestoneBadge name="personal-best" size={28} />
                {best.line}
              </p>
            )}
          </div>
          <GradeMedallion grade={grade.letter} size={96} />
        </div>

        {best && (
          <div className="mt-4">
            <ShareMoment
              label="Share this"
              moment={{
                kicker: test.subject,
                big: best.big,
                sub: best.sub,
                name: displayName(student.username).split(" ")[0],
                scene: worldScene(profile.world),
              }}
            />
          </div>
        )}

        {lost.length > 0 && (
          <nav aria-label="Where marks went" className="mt-6 border-t border-hairline pt-5">
            <p className="label-quiet text-ink-3">Where marks went</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {lost.map((x) => (
                <li key={x.n}>
                  <a
                    href={`#q-${x.n}`}
                    aria-label={`Question ${x.n}, ${x.lost} ${x.lost === 1 ? "mark" : "marks"} lost`}
                    className="inline-flex min-h-11 items-center rounded-full border border-border px-3.5 text-sm font-semibold tabular-nums text-ink-2 transition-colors duration-150 ease-[var(--ease-out)] hover:border-border-strong hover:text-ink"
                  >
                    Q{x.n} <span className="ml-1.5 text-warning">−{x.lost}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 border-t border-hairline pt-4 text-sm text-ink-2 tabular-nums">
          {/* No time on record (an older paper): say nothing rather than "Handed in not yet" on a marked paper. */}
          {submission.submittedAt && (
            <span className="inline-flex items-center gap-1.5">
              <Icon.Check className="h-4 w-4 text-ink-3" />
              Handed in {formatTimestamp(submission.submittedAt)}
            </span>
          )}
          {/* Unknown on older papers: say nothing rather than "0s". */}
          {!!submission.durationSeconds && submission.durationSeconds > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Icon.Clock className="h-4 w-4 text-ink-3" />
              Time taken {formatDuration(submission.durationSeconds)}
            </span>
          )}
        </div>
      </Card>

      <div className="mt-4">
        <StudyCoach db={db} student={student} test={test} submission={submission} />
      </div>

      {/* The ending: one gold next step, one quiet way down to the questions. */}
      <FinishMoment
        className="mt-10"
        title={finish.title}
        line={finish.line}
        primary={finish.primary}
        secondary={{ label: "See every question", href: "#breakdown" }}
      />

      <section id="breakdown" className="mt-12 scroll-mt-24">
        <SectionTitle count={test.questions.length}>Question breakdown</SectionTitle>
        <div className="space-y-3">
          {test.questions.map((q, i) => {
            const a = submission.answers.find((x) => x.questionId === q.id);
            return <BreakdownCard key={q.id} index={i} question={q} answer={a} />;
          })}
        </div>
      </section>
      </div>
      {practise &&
        createPortal(<FocusMode subjects={studentSubjects(db, student)} mission={practise} onClose={() => setPractise(null)} />, document.body)}
    </div>
  );
}

/**
 * The words and the one gold step under a result. In this order: practise the
 * topic that lost the most marks (the coach's first), else the next open test,
 * else back to Study. Kind and honest on a low score; a celebration only for a
 * good one. Every number is from this paper.
 */
function finishFor(
  db: Database,
  student: Student,
  test: Test,
  submission: Submission,
  grade: { awarded: number; total: number; letter: string },
  waiting: number,
  onPractise: (m: Mission) => void,
): { title: string; line?: string; primary: FinishAction } {
  // "General" is the coach's name for questions with no topic: nothing to name a practice after.
  const topic = coachSteps(db, student, test, submission).find((s) => s.name !== "General");
  const next = topic ? null : nextOpenTest(db, student, test.id);
  const full = waiting === 0 && grade.total > 0 && grade.awarded >= grade.total;
  const good = grade.letter === "A*" || grade.letter === "A";
  const fair = grade.letter === "B" || grade.letter === "C";

  const title = full ? "Full marks." : good ? "Brilliant work." : fair ? "Good work." : "This one was hard.";
  // Lost marks are only named once every answer is marked, so a number is never a guess.
  const lostLine = topic && waiting === 0 ? `${topic.lost} of ${topic.out} marks on ${topic.name}` : null;
  let line: string | undefined;
  if (!full && !good && !fair) {
    // A low score: honest about it, kind, and never the end of the story.
    line = lostLine
      ? `Most marks went on ${topic!.name}: ${topic!.lost} of ${topic!.out}. That is the one to practise first.`
      : "Look through each question below to see where the marks went.";
  } else if (full) {
    line = "Every mark on this paper.";
  } else if (lostLine) {
    line = `You lost ${lostLine}. Practise it now while it is fresh.`;
  }
  if (waiting > 0) line = "Some answers are still waiting for my marking. Your score may still go up.";

  let primary: FinishAction;
  if (topic) {
    const notes = topicNotesFinder(db, student)(topic.subject, topic.name);
    primary = {
      label: `Practise ${topic.name}`,
      onClick: () => onPractise({ subject: topic.subject, topic: topic.name, noteHref: notes?.exact ? notes.href : undefined }),
    };
  } else if (next) {
    primary = { label: `Next: ${next.title}`, href: `/test/${next.id}` };
  } else {
    primary = { label: "Back to Study", href: "/study" };
  }
  return { title, line, primary };
}

/** Something was handed in for it, but I haven't put a mark on it yet. */
function awaitingMarks(a: Answer | undefined): boolean {
  if (!a || a.marksAwarded !== undefined) return false;
  if (a.type === "mcq") return typeof a.selectedIndex === "number";
  if (a.type === "text") return !!a.text?.trim();
  return !!(a.photoUrls?.length || a.photoDataUrl);
}

function BreakdownCard({ index, question, answer }: { index: number; question: Question; answer?: Answer }) {
  const awarded = answer?.marksAwarded ?? 0;
  const pending = awaitingMarks(answer);
  const full = awarded >= question.marks;
  const zero = awarded === 0;
  // The page opened full screen, if any.
  const [viewing, setViewing] = useState<number | null>(null);
  const pastPaper = isPastPaper(question);
  const prompt = pastPaper ? withoutSources(question.prompt) : question.prompt;
  // Typed past paper options carry their letter, as the student saw them.
  const lettered = pastPaper && question.type === "mcq" && !question.options.every((o) => /^[A-D]$/.test(o.trim()));

  return (
    <Card id={`q-${index + 1}`} className="scroll-mt-24 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink-3 tabular-nums">Q{index + 1}</span>
          {question.topic?.trim() && <Badge tone="neutral">{question.topic}</Badge>}
        </div>
        {pending ? (
          <Badge tone="neutral" className="tabular-nums">
            Not marked yet · {question.marks} {question.marks === 1 ? "mark" : "marks"}
          </Badge>
        ) : (
          <Badge tone={full ? "success" : zero ? "error" : "warning"} className="tabular-nums">
            {awarded}/{question.marks} marks
          </Badge>
        )}
      </div>
      {/* A past paper question never shows where it came from (the student sees this test's own numbering). */}
      {pastPaper ? (
        prompt && <PaperText text={prompt} className="mt-3 text-base font-semibold leading-relaxed text-ink" />
      ) : (
        <p className="mt-3 whitespace-pre-wrap text-base font-semibold leading-relaxed text-ink">{prompt}</p>
      )}
      {question.attachments && question.attachments.length > 0 && (
        <div className="mt-3">
          <PageStack urls={question.attachments} label={pastPaper ? "The question" : "Question paper"} />
        </div>
      )}

      <div className="mt-4">
        {question.type === "mcq" && (() => {
          // The question's own key is withheld from the student client; the
          // answer row carries it once the result is released, so a wrong pick
          // can still be shown next to the right one.
          const key = question.correctIndex >= 0 ? question.correctIndex : answer?.correctIndex ?? -1;
          const picked = typeof answer?.selectedIndex === "number" ? answer.selectedIndex : -1;
          // No key on this phone: the marks still say whether the pick was right.
          const pickedRight = picked >= 0 && question.marks > 0 && (answer?.marksAwarded ?? 0) >= question.marks;
          const correctIndex = key >= 0 ? key : pickedRight ? picked : -1;
          // Only call a pick wrong when that is actually known.
          const pickedWrong = picked >= 0 && picked !== correctIndex && (key >= 0 || answer?.marksAwarded === 0);
          return (
          <>
          <ul className="space-y-1.5">
            {question.options.map((opt, oi) => {
              const chosen = answer?.selectedIndex === oi;
              const correct = correctIndex === oi;
              return (
                <li
                  key={oi}
                  className={cn(
                    "flex items-center gap-3 rounded-field border px-4 py-3 text-base leading-snug",
                    correct
                      ? "border-success/35 bg-success-soft text-success"
                      : chosen && pickedWrong
                        ? "border-error/35 bg-error-soft text-error"
                        : chosen
                          ? "border-border-strong bg-surface-2 text-ink"
                          : "border-transparent bg-surface-2 text-ink-2",
                  )}
                >
                  {correct ? (
                    <Icon.Check className="h-4 w-4 shrink-0" />
                  ) : chosen && pickedWrong ? (
                    <Icon.Close className="h-4 w-4 shrink-0" />
                  ) : (
                    <span className="h-4 w-4 shrink-0" />
                  )}
                  {lettered ? (
                    <span className="flex min-w-0 items-start gap-2.5">
                      <span className="w-4 shrink-0 font-bold">{"ABCD"[oi]}</span>
                      <PaperText text={opt} className="min-w-0" />
                    </span>
                  ) : (
                    <span className="whitespace-pre-wrap">{opt}</span>
                  )}
                  {chosen && <span className="ml-auto shrink-0 text-sm font-semibold">Your pick</span>}
                  {correct && !chosen && (
                    <span className="ml-auto shrink-0 text-sm font-semibold">Correct answer</span>
                  )}
                </li>
              );
            })}
          </ul>
          {picked < 0 && <p className="mt-2 text-sm text-ink-3">You did not answer this.</p>}
          </>
          );
        })()}

        {question.type === "text" && (
          <div className="whitespace-pre-wrap rounded-tile bg-surface-2 p-4 text-base leading-relaxed text-ink">
            {answer?.text ? answer.text : <span className="text-ink-3">You did not answer this.</span>}
          </div>
        )}

        {question.type === "photo" && (() => {
          const photos = answer?.photoUrls ?? (answer?.photoDataUrl ? [answer.photoDataUrl] : []);
          if (!photos.length) return <p className="text-sm text-ink-3">You did not answer this.</p>;
          const shapesOf = (url: string) => answer?.annotations?.[url] ?? [];
          return (
            <div className="space-y-2">
              {photos.map((url, i) => {
                // A page with my marks keeps its own shape at the card's
                // width (capping its height squashed it and moved the marks
                // off the lines they belong to). An unmarked one stays small.
                const marked = shapesOf(url).length > 0;
                return (
                  <button key={url} type="button" onClick={() => setViewing(i)} className="block w-full" aria-label={`Open page ${i + 1} full screen`}>
                    <AnnotatedImage
                      url={url}
                      shapes={shapesOf(url)}
                      alt={`Your answer to question ${index + 1}, image ${i + 1}`}
                      className={cn("block rounded-tile border border-hairline bg-surface-2", marked ? "h-auto" : "mx-auto max-h-64 w-auto max-w-full")}
                    />
                  </button>
                );
              })}
              <p className="text-center text-sm text-ink-3">Tap a page to open it full screen.</p>
              {viewing != null && (
                <PageViewerModal
                  urls={photos}
                  startAt={Math.min(viewing, photos.length - 1)}
                  label={`Your answer to question ${index + 1}`}
                  onClose={() => setViewing(null)}
                  wide
                  renderPage={(url, i) => (
                    <AnnotatedImage
                      url={url}
                      shapes={shapesOf(url)}
                      alt={`Your answer to question ${index + 1}, page ${i + 1}`}
                      className="block h-auto w-full"
                    />
                  )}
                />
              )}
            </div>
          );
        })()}
      </div>

      {answer?.feedback && (
        <div className="mt-4 rounded-tile bg-surface-2 p-4">
          <p className="label-quiet text-ink-3">My feedback</p>
          <p className="mt-1.5 whitespace-pre-wrap text-base leading-relaxed text-ink">{answer.feedback}</p>
        </div>
      )}
    </Card>
  );
}

/**
 * A personal best, or a rise on the last test, measured only against this
 * student's own earlier released results in the same subject. Never other
 * students. Nothing shows on a first result or when the score went down.
 */
function personalBest(db: Database, studentId: string, test: { id: string; subject: string }, submission: { submittedAt?: string; startedAt: string }, percent: number) {
  const when = (s: { submittedAt?: string; startedAt: string }) => +new Date(s.submittedAt ?? s.startedAt);
  const now = when(submission);
  const earlier = submissionsForStudent(db, studentId)
    .filter((s) => s.status === "released" && s.testId !== test.id && when(s) < now)
    .map((s) => ({ s, t: testById(db, s.testId) }))
    .filter((x): x is { s: typeof x.s; t: NonNullable<typeof x.t> } => !!x.t && sameSubject(x.t.subject, test.subject))
    .map((x) => ({ at: when(x.s), pct: shownPercent(gradeSubmission(x.t, x.s).percent) }))
    .sort((a, b) => b.at - a.at);
  if (!earlier.length) return null;
  const mine = shownPercent(percent);
  if (mine > Math.max(...earlier.map((e) => e.pct))) {
    return { line: `Personal best in ${test.subject}`, big: "Personal best", sub: `${mine}% in ${test.subject}` };
  }
  const rise = mine - earlier[0].pct;
  if (rise >= 1) {
    return { line: `+${rise} ${rise === 1 ? "point" : "points"} on your last test`, big: `+${rise}%`, sub: `on my last ${test.subject} test` };
  }
  return null;
}

/**
 * Back to Study on laptops in the browser. Phones get the layout's own back
 * row, and inside the phone app its own back is the one way back.
 */
function BackLink() {
  return (
    <div className="web-only hidden md:block">
      <Link href="/study" className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-ink-2 hover:text-ink">
        <Icon.ArrowLeft className="h-4 w-4" /> Study
      </Link>
    </div>
  );
}

function PendingShell({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-md px-5 py-20 text-center">
      <h1 className="text-balance text-title font-bold tracking-[-0.025em] text-ink">{title}</h1>
      <p className="mt-2 text-base text-ink-2">{message}</p>
      <Link href="/dashboard" className={buttonClasses({ variant: "secondary", className: "mt-5" })}>
        Back to Home
      </Link>
    </div>
  );
}
