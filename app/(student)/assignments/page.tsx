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
  const assignments = [...db.assignments].sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt));

  if (!studentId) return null;

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold text-ink">Assignments</h1>
      <p className="mt-0.5 text-sm text-ink-2">Hand in your work as photos or a PDF.</p>

      {assignments.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Icon.Doc />} title="Nothing set right now" message="New assignments will appear here." />
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {assignments.map((a) => (
            <AssignmentCard key={a.id} assignment={a} studentId={studentId} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({ assignment, studentId }: { assignment: Assignment; studentId: string }) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const mine = db.assignmentSubmissions.find(
    (s) => s.assignmentId === assignment.id && s.studentId === studentId,
  );
  const overdue = +new Date(assignment.dueAt) < useNow();

  async function addFiles(files: File[]) {
    const accepted = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!accepted.length) {
      toast("Images or PDFs only, please.", "error");
      return;
    }
    setUploading(true);
    try {
      const pages = (await Promise.all(accepted.map((f) => uploadAsImages(f)))).flat();
      store.submitAssignment(assignment.id, studentId, [...(mine?.fileUrls ?? []), ...pages]);
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
        {overdue && !mine && <p className="mt-1.5 text-xs text-ink-3">The deadline has passed — hand in as soon as you can.</p>}
      </div>
    </Card>
  );
}
