"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import type { Answer, Question } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { studentById, testById, submissionFor, submissionsForStudent } from "@/lib/data/selectors";
import { Card, Badge, Pill, Icon, EmptyState } from "@/components/ui";
import { AnnotatedImage } from "@/components/Annotator";
import { PageStack } from "@/components/PageStack";
import { PaperText } from "@/components/PaperText";
import { isPastPaper, withoutSources } from "@/lib/paper-builder";
import { buttonClasses } from "@/components/ui/Button";
import { gradeSubmission } from "@/lib/grading";
import { formatDuration, formatTimestamp } from "@/lib/time";
import { cn } from "@/lib/cn";
import { StudyCoach } from "@/components/student/StudyCoach";
import { ShareMoment } from "@/components/student/ShareMoment";
import { sameSubject, shownPercent } from "@/lib/performance";
import { displayName } from "@/lib/display-name";
import { worldScene } from "@/lib/groundwork";
import type { Database } from "@/lib/data/seed";
import { PortalArt } from "@/components/student/PortalArt";
import { GradeMedallion, MilestoneBadge, SectionTitle } from "@/components/student/PortalKit";

export default function ResultsPage() {
  const params = useParams();
  const id = String(params.id);
  const { session, profile } = useAuth();
  const db = useDatabase();

  const student = session?.studentId ? studentById(db, session.studentId) : null;
  const test = testById(db, id);
  const submission = student && test ? submissionFor(db, student.id, test.id) : null;

  if (!student || !test) {
    return <PendingShell title="Result unavailable" message="I can't find this test on your account." />;
  }
  if (!submission || submission.status !== "released") {
    return (
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <BackLink />
        {submission ? (
          <EmptyState
            className="mt-4"
            icon={<Icon.Clock />}
            title="Results pending"
            message={`${submission.submittedAt ? `Handed in ${formatTimestamp(submission.submittedAt)}. ` : ""}I haven't released this result yet. It shows up here as soon as it's ready.`}
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

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise">
      <BackLink />

      <Card className="relative isolate mt-4 overflow-hidden p-5 sm:p-7">
        {/* A personal best or a top grade gets the celebration picture behind the score. */}
        {(best || grade.letter === "A*" || grade.letter === "A") && (
          <>
            {/* A quiet strip of the picture across the top right, fading into the card. */}
            <PortalArt
              group="scenes"
              name="celebrate-top-result"
              eager
              className="pointer-events-none absolute inset-y-0 right-0 -z-20 w-[70%] [mask-image:linear-gradient(90deg,transparent_0%,#000_60%)] sm:w-[78%]"
              imgClassName="object-cover object-right opacity-30 sm:opacity-60"
            />
            <span aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(34,37,40,0.35)_0%,rgba(34,37,40,0.75)_45%,var(--color-surface)_78%)]" />
          </>
        )}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink-2">{test.subject}</span>
          <Pill>{test.testCode}</Pill>
        </div>
        <h1 className="mt-4 text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em] text-ink sm:text-[2rem]">{test.title}</h1>

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[3.25rem] font-extrabold leading-none tracking-[-0.035em] tabular-nums text-ink">
              {grade.awarded}
              <span className="text-2xl font-bold tracking-[-0.02em] text-ink-3">/{grade.total}</span>
            </p>
            <p className="mt-2 text-[15px] text-ink-2 tabular-nums">{shownPercent(grade.percent)}% overall</p>
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
                kicker: `${test.subject} · ${test.testCode}`,
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
                    className="inline-flex min-h-11 items-center rounded-full border border-hairline bg-surface-2/70 px-3.5 text-sm font-semibold tabular-nums text-ink-2 transition hover:border-hairline-strong hover:text-ink"
                  >
                    Q{x.n} <span className="ml-1.5 text-warning">−{x.lost}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 border-t border-hairline pt-4 text-sm text-ink-2 tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <Icon.Check className="h-4 w-4 text-ink-3" />
            Submitted {submission.submittedAt ? formatTimestamp(submission.submittedAt) : "not yet"}
          </span>
          {/* Unknown on older papers: say nothing rather than "0s". */}
          {!!submission.durationSeconds && submission.durationSeconds > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Icon.Clock className="h-4 w-4 text-ink-3" />
              {formatDuration(submission.durationSeconds)}
            </span>
          )}
        </div>
      </Card>

      <div className="mt-5">
        <StudyCoach db={db} student={student} test={test} submission={submission} />
      </div>

      <section className="mt-10">
        <SectionTitle count={test.questions.length}>Question breakdown</SectionTitle>
        <div className="space-y-3">
          {test.questions.map((q, i) => {
            const a = submission.answers.find((x) => x.questionId === q.id);
            return <BreakdownCard key={q.id} index={i} question={q} answer={a} />;
          })}
        </div>
      </section>
      </div>
    </div>
  );
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
  const [big, setBig] = useState<string | null>(null);
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
                    "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-base",
                    correct
                      ? "border-success/35 bg-success-soft text-success"
                      : chosen && pickedWrong
                        ? "border-error/35 bg-error-soft text-error"
                        : chosen
                          ? "border-border-strong bg-surface-2/70 text-ink"
                          : "border-hairline bg-surface-2/40 text-ink-2",
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
                  {chosen && <span className="ml-auto shrink-0 text-xs font-semibold">Your pick</span>}
                  {correct && !chosen && (
                    <span className="ml-auto shrink-0 text-xs font-semibold">Correct answer</span>
                  )}
                </li>
              );
            })}
          </ul>
          {picked < 0 && <p className="mt-2 text-sm italic text-ink-3">(no answer picked)</p>}
          </>
          );
        })()}

        {question.type === "text" && (
          <div className="whitespace-pre-wrap rounded-lg border border-hairline bg-surface-2/50 p-4 text-base leading-relaxed text-ink">
            {answer?.text ? answer.text : <span className="italic text-ink-3">(blank)</span>}
          </div>
        )}

        {question.type === "photo" && (() => {
          const photos = answer?.photoUrls ?? (answer?.photoDataUrl ? [answer.photoDataUrl] : []);
          if (!photos.length) return <p className="text-sm italic text-ink-3">(no photo)</p>;
          return (
            <div className="space-y-2">
              {photos.map((url, i) => (
                // Tap a marked page to see it full width (Hamza's marks are readable on a phone).
                <button key={url} type="button" onClick={() => setBig(big === url ? null : url)} className="block w-full" aria-label={big === url ? "Make smaller" : "Make bigger"}>
                  <AnnotatedImage
                    url={url}
                    shapes={answer?.annotations?.[url] ?? []}
                    alt={`Your answer to question ${index + 1}, image ${i + 1}`}
                    className={cn("mx-auto block rounded-md border border-border bg-surface-2", big === url ? "w-full" : "max-h-64 w-auto max-w-full")}
                  />
                </button>
              ))}
              <p className="text-center text-xs text-ink-3">Tap a page to make it bigger.</p>
            </div>
          );
        })()}
      </div>

      {answer?.feedback && (
        <div className="mt-4 rounded-lg border border-hairline bg-surface-2/70 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="label-quiet text-ink-3">From Hamza</p>
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
    return { line: `+${rise}% on your last test`, big: `+${rise}%`, sub: `on my last ${test.subject} test` };
  }
  return null;
}

function BackLink() {
  return (
    <Link href="/tests" className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-sm font-semibold text-ink-2 hover:text-ink">
      <Icon.ArrowLeft className="h-4 w-4" /> Tests
    </Link>
  );
}

function PendingShell({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-extrabold tracking-[-0.025em] text-ink">{title}</h1>
      <p className="mt-2 text-base text-ink-2">{message}</p>
      <Link href="/dashboard" className={buttonClasses({ variant: "secondary", className: "mt-5" })}>
        Back to home
      </Link>
    </div>
  );
}
