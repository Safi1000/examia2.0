"use client";

import { useRef, useState } from "react";
import type { Assignment } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useStore } from "@/lib/data/store";
import { uploadAsImages } from "@/lib/cloudinary";
import { useToast } from "@/components/toast";
import { PageStack } from "@/components/PageStack";
import { Card, Button, Badge, EmptyState, Icon } from "@/components/ui";
import { formatTimestamp } from "@/lib/time";
import { useNow } from "@/hooks/useNow";

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
  const assignments = [
    ...db.assignments.filter((a) => due(a) >= nowMs).sort((a, b) => due(a) - due(b)),
    ...db.assignments.filter((a) => due(a) < nowMs).sort((a, b) => due(b) - due(a)),
  ];

  if (!studentId) return null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 font-display text-2xl font-bold text-ink">Assignments</h1>
      <p className="mb-6 text-sm text-ink-3">Hand in your work as photos or a PDF.</p>

      {assignments.length === 0 ? (
        <EmptyState icon={<Icon.Doc />} title="Nothing set right now" message="New assignments will appear here." />
      ) : (
        <div className="space-y-4">
          {assignments.map((a) => (
            <AssignmentCard key={a.id} assignment={a} studentId={studentId} />
          ))}
        </div>
      )}
    </main>
  );
}

function AssignmentCard({ assignment, studentId }: { assignment: Assignment; studentId: string }) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const mine = db.assignmentSubmissions.find(
    (s) => s.assignmentId === assignment.id && s.studentId === studentId,
  );
  const overdue = +new Date(assignment.dueAt) < useNow();

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

  async function addFiles(files: File[]) {
    const accepted = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!accepted.length) {
      toast("Images or PDFs only, please.", "error");
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const parts = accepted.map(() => 0);
      const results = await Promise.allSettled(
        accepted.map((f, i) =>
          uploadAsImages(f, (p) => {
            parts[i] = p;
            setProgress(parts.reduce((a, b) => a + b, 0) / parts.length);
          }),
        ),
      );
      const pages = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      const failed = results.length - results.filter((r) => r.status === "fulfilled").length;
      if (!pages.length) throw new Error("Nothing uploaded. Check your internet and try again.");
      if (failed) toast(failed === 1 ? "1 file didn't upload. Add it again." : `${failed} files didn't upload. Add them again.`, "error");
      await store.submitAssignment(assignment.id, studentId, [...(mine?.fileUrls ?? []), ...pages]);
      toast("Handed in.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed. Try again.", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        {mine ? <Badge tone="success">Handed in</Badge> : <Badge tone={overdue ? "warning" : "neutral"}>{overdue ? "Overdue" : "To do"}</Badge>}
        <span className="text-sm text-ink-2">Due {formatTimestamp(assignment.dueAt)}</span>
      </div>
      <h2 className="mt-1.5 text-lg font-bold text-ink">{assignment.title}</h2>
      {assignment.instructions && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{assignment.instructions}</p>}

      {assignment.attachments.length > 0 && (
        <div className="mt-3">
          <PageStack urls={assignment.attachments} label="Worksheet" />
        </div>
      )}

      {mine && mine.fileUrls.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Your work</p>
          <PageStack urls={mine.fileUrls} label="Your work" />
          {/* Wrong photo? Take it out, until Hamza has replied. */}
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
        <div className="mt-3 rounded-md border border-info/30 bg-info-soft/60 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-info">Teacher feedback</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{mine.feedback}</p>
        </div>
      )}

      <div className="mt-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
          aria-label="Upload your work"
        />
        <Button variant={mine ? "secondary" : "primary"} loading={uploading} onClick={() => fileRef.current?.click()}>
          <Icon.Camera className="h-4 w-4" /> {mine ? "Add more pages" : "Hand in work"}
        </Button>
        {uploading && (
          <div className="mt-2.5 flex items-center gap-2.5" role="status">
            <span className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span className="block h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </span>
            <span className="text-xs font-semibold text-ink-2">{progress >= 0.99 ? "Almost done…" : `Uploading ${Math.round(progress * 100)}%`}</span>
          </div>
        )}
        {overdue && !mine && <p className="mt-1.5 text-xs text-ink-3">The deadline has passed — hand in as soon as you can.</p>}
      </div>
    </Card>
  );
}
