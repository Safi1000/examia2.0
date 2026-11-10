"use client";

import { useEffect, useRef, useState } from "react";
import type { Assignment } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useStore } from "@/lib/data/store";
import { assignmentsForStudent } from "@/lib/data/selectors";
import { uploadAsImages } from "@/lib/cloudinary";
import { useToast } from "@/components/toast";
import { PageStack } from "@/components/PageStack";
import { Card, Button, Badge, EmptyState, Icon } from "@/components/ui";
import { formatTimestamp, formatWhen } from "@/lib/time";
import { cn } from "@/lib/cn";
import { useNow } from "@/hooks/useNow";
import { FocusOnThis } from "@/components/student/FocusOnThis";
import { EmptyArt, PageHeader } from "@/components/student/PortalKit";

/**
 * Weekly assignments. Work is handed in as photos or a PDF and answered with
 * written feedback — assignments are never marked.
 */
export default function StudentAssignmentsPage() {
  const db = useDatabase();
  const { session } = useAuth();
  const studentId = session?.studentId ?? null;

  // RLS already limits what this client can see to the student's own cohort,
  // class and subject, so nothing further needs filtering here.
  // Upcoming first (soonest at the top), then past work, newest first.
  const nowMs = useNow();
  const due = (a: { dueAt: string }) => +new Date(a.dueAt);
  const handedIn = (a: Assignment) => db.assignmentSubmissions.some((s) => s.assignmentId === a.id && s.studentId === studentId);
  const me = studentId ? db.students.find((s) => s.id === studentId) : undefined;
  const mine = me ? assignmentsForStudent(db, me) : db.assignments;
  const past = mine.filter((a) => due(a) < nowMs).sort((a, b) => due(b) - due(a));
  const assignments = [
    ...mine.filter((a) => due(a) >= nowMs).sort((a, b) => due(a) - due(b)),
    ...past.filter((a) => !handedIn(a)),
  ];
  // Handed in and past the deadline: folded away, so the list stays short
  // as the weeks go by (and their worksheets don't load until opened).
  const done = past.filter(handedIn);
  const [doneOpen, setDoneOpen] = useState(() => {
    try {
      return done.some((a) => window.location.hash === `#a-${a.id}`);
    } catch {
      return false;
    }
  });

  // Home's "Hand in" lands on that assignment (/assignments#a-<id>).
  useEffect(() => {
    const el = window.location.hash.startsWith("#a-") ? document.getElementById(window.location.hash.slice(1)) : null;
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
  }, []);

  if (!studentId) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-8">
      <PageHeader title="Homework">Hand in your work as photos or a PDF.</PageHeader>

      {assignments.length === 0 && done.length === 0 ? (
        <EmptyState
          icon={<Icon.Doc />}
          art={<EmptyArt name="empty-all-caught-up" />}
          title="No homework right now"
          message="When I set homework, it appears here with its due date."
        />
      ) : assignments.length === 0 ? (
        <div className="surface flex items-center gap-4 rounded-xl px-5 py-4 sm:px-6">
          <p className="text-base font-semibold text-ink">All handed in. Nothing to do right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((a) => (
            <AssignmentCard key={a.id} assignment={a} studentId={studentId} lead={a.id === assignments.find((x) => !handedIn(x))?.id} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <details open={doneOpen} onToggle={(e) => setDoneOpen(e.currentTarget.open)} className="group">
          <summary className="surface surface-link flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 text-[15px] font-semibold text-ink sm:px-6 [&::-webkit-details-marker]:hidden">
            <span>
              Done <span className="font-normal text-ink-3 tabular-nums">· {done.length}</span>
            </span>
            <Icon.ChevronRight className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-90" />
          </summary>
          {doneOpen && (
            <div className="mt-4 space-y-4">
              {done.map((a) => (
                <AssignmentCard key={a.id} assignment={a} studentId={studentId} />
              ))}
            </div>
          )}
        </details>
      )}
      </div>
    </div>
  );
}

function AssignmentCard({ assignment, studentId, lead }: { assignment: Assignment; studentId: string; lead?: boolean }) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  // The next upload replaces the work instead of adding to it (one wrong photo).
  const replacing = useRef(false);

  const mine = db.assignmentSubmissions.find(
    (s) => s.assignmentId === assignment.id && s.studentId === studentId,
  );
  const overdue = +new Date(assignment.dueAt) < useNow();
  const subjectName = assignment.subjectId ? db.subjects.find((x) => x.id === assignment.subjectId)?.name : undefined;

  async function removePage(i: number) {
    if (!mine) return;
    const before = mine.fileUrls;
    try {
      await store.submitAssignment(assignment.id, studentId, before.filter((_, idx) => idx !== i));
      toast(`Page ${i + 1} removed.`, "default", {
        label: "Undo",
        onClick: () => void store.submitAssignment(assignment.id, studentId, before).catch(() => {}),
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't remove it. Try again.", "error");
    }
  }

  async function addFiles(files: File[], replace = false) {
    const accepted = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!accepted.length) {
      toast("Images or PDFs only, please.", "error");
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const parts = accepted.map(() => 0);
      // Two at a time: ten photos at once on phone data often stalled and failed together.
      const results: PromiseSettledResult<string[]>[] = new Array(accepted.length);
      let next = 0;
      const worker = async () => {
        while (next < accepted.length) {
          const i = next++;
          results[i] = await uploadAsImages(accepted[i], (p) => {
            parts[i] = p;
            setProgress(parts.reduce((a, b) => a + b, 0) / parts.length);
          }).then(
            (value) => ({ status: "fulfilled" as const, value }),
            (reason: unknown) => ({ status: "rejected" as const, reason }),
          );
        }
      };
      await Promise.all([worker(), worker()]);
      const pages = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      const failed = results.length - results.filter((r) => r.status === "fulfilled").length;
      if (!pages.length) throw new Error("Nothing uploaded. Check your internet and try again.");
      if (failed) toast(failed === 1 ? "1 file didn't upload. Add it again." : `${failed} files didn't upload. Add them again.`, "error");
      await store.submitAssignment(assignment.id, studentId, [...(replace ? [] : (mine?.fileUrls ?? [])), ...pages]);
      toast(replace ? "Replaced." : "Handed in.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed. Try again.", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card id={`a-${assignment.id}`} className="scroll-mt-24 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium text-ink-3">{subjectName ?? "Homework"}</p>
        {mine ? (
          <Badge tone="success">{+new Date(mine.submittedAt) > +new Date(assignment.dueAt) ? "Handed in late" : "Handed in"}</Badge>
        ) : (
          overdue && <Badge tone="warning">Overdue</Badge>
        )}
      </div>
      <h2 className="mt-1.5 text-xl font-bold leading-snug tracking-[-0.015em] text-ink">{assignment.title}</h2>
      <p className={cn("mt-1 text-sm tabular-nums", overdue && !mine ? "font-semibold text-warning" : "text-ink-2")}>Due {formatWhen(assignment.dueAt)}</p>
      {assignment.instructions && <p className="mt-3 max-w-[65ch] whitespace-pre-wrap text-base leading-relaxed text-ink-2">{assignment.instructions}</p>}

      {assignment.attachments.length > 0 && (
        <div className="mt-4">
          <PageStack urls={assignment.attachments} label="Worksheet" />
        </div>
      )}

      {mine && mine.fileUrls.length > 0 && (
        <div className="mt-5 border-t border-hairline pt-4">
          <p className="mb-2 text-xs font-semibold text-ink-3 tabular-nums">
            Your work · {mine.fileUrls.length} {mine.fileUrls.length === 1 ? "page" : "pages"} · handed in {formatTimestamp(mine.submittedAt)}
          </p>
          <PageStack urls={mine.fileUrls} label="Your work" />
          {/* Wrong photo? Take it out (or swap the only one), until Hamza has replied. */}
          {!mine.feedback && mine.fileUrls.length === 1 && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => {
                replacing.current = true;
                fileRef.current?.click();
              }}
              className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-full border border-border-strong px-3 text-xs font-semibold text-ink-2 transition-colors hover:border-brand hover:text-ink disabled:opacity-40"
            >
              <Icon.Refresh className="h-3.5 w-3.5" /> Replace this photo
            </button>
          )}
          {!mine.feedback && mine.fileUrls.length > 1 && (
            <ul className="mt-2 flex flex-wrap gap-2" aria-label="Remove a page">
              {mine.fileUrls.map((url, i) => (
                <li key={url}>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => void removePage(i)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border border-border-strong px-3 text-xs font-semibold text-ink-2 transition-colors hover:border-error hover:text-error disabled:opacity-40"
                  >
                    <Icon.Close className="h-3.5 w-3.5" /> Remove page {i + 1}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mine?.feedback && (
        <div className="mt-4 rounded-lg border border-hairline bg-surface-2/70 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="label-quiet text-ink-3">From Hamza</p>
          <p className="mt-1.5 whitespace-pre-wrap text-base leading-relaxed text-ink">{mine.feedback}</p>
        </div>
      )}

      <div className="mt-5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => {
            const replace = replacing.current;
            replacing.current = false;
            void addFiles(Array.from(e.target.files ?? []), replace);
          }}
          aria-label="Upload your work"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={mine || !lead ? "secondary" : "primary"}
            loading={uploading}
            onClick={() => {
              replacing.current = false;
              fileRef.current?.click();
            }}
          >
            <Icon.Camera className="h-4 w-4" /> {mine ? "Add more pages" : overdue ? "Hand in late" : "Hand in work"}
          </Button>
          {!mine && <FocusOnThis kind="homework" title={assignment.title} subject={subjectName} />}
        </div>
        {uploading && (
          <div className="mt-2.5 flex items-center gap-2.5" role="status">
            <span className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span className="block h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </span>
            <span className="text-xs font-semibold text-ink-2">{progress >= 0.99 ? "Almost done…" : `Uploading ${Math.round(progress * 100)}%`}</span>
          </div>
        )}
        {mine?.feedback && <p className="mt-1.5 text-xs text-ink-3">I&apos;ve already replied. If you add pages, message me so I see them.</p>}
        {overdue && !mine && <p className="mt-1.5 text-xs text-ink-3">The deadline has passed, but you can still hand it in.</p>}
        {!mine && !uploading && <p className="mt-1.5 text-xs text-ink-3">Take a clear photo of each page, or pick a PDF. You can add more pages after.</p>}
      </div>
    </Card>
  );
}
