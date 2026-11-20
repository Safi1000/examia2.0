"use client";

import { useEffect, useRef, useState } from "react";
import type { Assignment } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { useDatabase, useStore } from "@/lib/data/store";
import { assignmentsForStudent } from "@/lib/data/selectors";
import { uploadAsImages } from "@/lib/cloudinary";
import { useToast } from "@/components/toast";
import { PageStack } from "@/components/PageStack";
import { PastPaperHomework } from "@/components/student/PastPaperHomework";
import { SOURCES_PREFIX, withoutSourcesLine } from "@/lib/paper-builder";
import { Card, Button, Badge, EmptyState, Icon } from "@/components/ui";
import { formatTimestamp, formatWhen } from "@/lib/time";
import { cn } from "@/lib/cn";
import { useNow } from "@/hooks/useNow";
import { FocusOnThis } from "@/components/student/FocusOnThis";
import { EmptyArt, PageHeader } from "@/components/student/PortalKit";

// Replies the student has seen, kept on this phone: assignment id -> the reply's time.
const seenKey = (studentId: string) => `examia.replySeen.${studentId}`;
function readSeen(studentId: string | null): Record<string, string> {
  if (!studentId || typeof window === "undefined") return {};
  try {
    return (JSON.parse(window.localStorage.getItem(seenKey(studentId)) ?? "{}") as Record<string, string>) ?? {};
  } catch {
    return {};
  }
}
function markSeen(studentId: string, assignmentId: string, at: string) {
  try {
    const all = readSeen(studentId);
    all[assignmentId] = at;
    window.localStorage.setItem(seenKey(studentId), JSON.stringify(all));
  } catch {
    /* private mode: the marker just shows again next time */
  }
}
/** Replies older than this aren't called new (so the first visit after this change isn't full of them). */
const NEW_REPLY_MS = 14 * 86_400_000;

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
  // A reply from me the student hasn't seen yet (read on this phone).
  const seen = readSeen(studentId);
  const unread = (a: Assignment) => {
    const sub = db.assignmentSubmissions.find((s) => s.assignmentId === a.id && s.studentId === studentId);
    if (!sub?.feedback?.trim() || !sub.feedbackAt || nowMs - +new Date(sub.feedbackAt) > NEW_REPLY_MS) return false;
    return !seen[a.id] || +new Date(seen[a.id]) < +new Date(sub.feedbackAt);
  };
  // Homework with a new reply stays in the main list for this visit, even
  // once it is read, so it doesn't jump into Done while they read it.
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const newlyUnread = past.filter((a) => handedIn(a) && !pinned.has(a.id) && unread(a));
  if (newlyUnread.length) setPinned(new Set([...pinned, ...newlyUnread.map((a) => a.id)]));
  const assignmentsShown = [...assignments, ...past.filter((a) => handedIn(a) && pinned.has(a.id))];
  // Handed in and past the deadline: folded away, so the list stays short
  // as the weeks go by (and their worksheets don't load until opened).
  const done = past.filter((a) => handedIn(a) && !pinned.has(a.id));
  const [doneOpen, setDoneOpen] = useState(() => {
    try {
      return done.some((a) => window.location.hash === `#a-${a.id}`);
    } catch {
      return false;
    }
  });

  // Home's "Hand in" and my reply's notification land on that assignment
  // (/assignments#a-<id>), opening Done first if it is in there.
  const landed = useRef(false);
  const doneIds = done.map((a) => a.id).join(",");
  useEffect(() => {
    if (landed.current || !window.location.hash.startsWith("#a-")) return;
    const id = window.location.hash.slice(3);
    if (!doneOpen && doneIds.split(",").includes(id)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDoneOpen(true);
      return;
    }
    const el = document.getElementById(`a-${id}`);
    if (!el) return;
    landed.current = true;
    requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
  }, [doneOpen, doneIds]);

  if (!studentId) return null;

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-10">
      <PageHeader title="Homework">Hand in your work as photos or a PDF.</PageHeader>

      {assignmentsShown.length === 0 && done.length === 0 ? (
        <EmptyState
          icon={<Icon.Doc />}
          art={<EmptyArt name="empty-all-caught-up" />}
          title="No homework right now"
          message="When I set homework, it appears here with its due date."
        />
      ) : assignmentsShown.length === 0 ? (
        <div className="surface flex items-center gap-4 rounded-card p-5 sm:p-6">
          <p className="text-base font-semibold text-ink">All handed in. Nothing to do right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assignmentsShown.map((a) => (
            <AssignmentCard key={a.id} assignment={a} studentId={studentId} lead={a.id === assignments.find((x) => !handedIn(x))?.id} newReply={unread(a)} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <details open={doneOpen} onToggle={(e) => setDoneOpen(e.currentTarget.open)} className="group">
          <summary className="surface surface-link flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-5 text-base font-semibold text-ink sm:px-6 [&::-webkit-details-marker]:hidden">
            <span>
              Done <span className="font-normal text-ink-3 tabular-nums">· {done.length}</span>
            </span>
            <Icon.ChevronRight className="h-5 w-5 text-ink-3 transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-90" />
          </summary>
          {doneOpen && (
            <div className="mt-3 space-y-3">
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

function AssignmentCard({ assignment, studentId, lead, newReply }: { assignment: Assignment; studentId: string; lead?: boolean; newReply?: boolean }) {
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
  const fromPapers = (assignment.instructions ?? "").split("\n").some((l) => l.startsWith(SOURCES_PREFIX));
  const instructions = withoutSourcesLine(assignment.instructions ?? "");
  const subjectName = assignment.subjectId ? db.subjects.find((x) => x.id === assignment.subjectId)?.name : undefined;

  // One removal at a time: a quick double tap must never take out two pages.
  const [removing, setRemoving] = useState(false);
  async function removePage(e: React.MouseEvent<HTMLButtonElement>) {
    const url = e.currentTarget.dataset.url;
    if (!mine || !url || removing) return;
    const before = mine.fileUrls;
    const i = before.indexOf(url);
    if (i < 0) return;
    setRemoving(true);
    try {
      await store.submitAssignment(assignment.id, studentId, before.filter((u) => u !== url));
      toast(`Page ${i + 1} removed.`, "default", {
        label: "Undo",
        onClick: () =>
          void store
            .submitAssignment(assignment.id, studentId, before)
            .catch(() => toast("Couldn't put that page back. Check your internet, then add it again.", "error")),
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't remove it. Try again.", "error");
    } finally {
      setRemoving(false);
    }
  }

  // A new reply counts as read once most of it has been on screen.
  const replyRef = useRef<HTMLDivElement>(null);
  const feedbackAt = mine?.feedbackAt;
  useEffect(() => {
    const el = replyRef.current;
    if (!newReply || !el || !feedbackAt || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        markSeen(studentId, assignment.id, feedbackAt);
        io.disconnect();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [newReply, feedbackAt, studentId, assignment.id]);

  // Pages that uploaded but didn't save (the hand-in itself failed).
  const [unsaved, setUnsaved] = useState<string[] | null>(null);
  async function saveAgain() {
    if (!unsaved) return;
    setUploading(true);
    try {
      await store.submitAssignment(assignment.id, studentId, unsaved);
      setUnsaved(null);
      toast("Handed in.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Not handed in. Check your internet and try again.", "error");
    } finally {
      setUploading(false);
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
    // The full page list once the photos are up, kept if saving it fails, so a
    // weak signal at that last step never means uploading everything again.
    let list: string[] | null = null;
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
      list = [...(replace ? [] : (mine?.fileUrls ?? [])), ...pages];
      await store.submitAssignment(assignment.id, studentId, list);
      setUnsaved(null);
      toast(replace ? "Replaced." : "Handed in.", "success");
    } catch (err) {
      if (list) setUnsaved(list);
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
        {newReply ? (
          <Badge tone="success">New reply</Badge>
        ) : mine ? (
          <Badge tone={+new Date(mine.submittedAt) > +new Date(assignment.dueAt) ? "neutral" : "success"}>{+new Date(mine.submittedAt) > +new Date(assignment.dueAt) ? "Handed in late" : "Handed in"}</Badge>
        ) : (
          overdue && <Badge tone="warning">Overdue</Badge>
        )}
      </div>
      <h2 className="mt-1.5 text-base font-semibold leading-snug text-ink">{assignment.title}</h2>
      <p className={cn("mt-1 text-sm tabular-nums", overdue && !mine ? "font-semibold text-warning" : "text-ink-2")}>Due {formatWhen(assignment.dueAt)}</p>
      {/* Past paper homework: the line naming the papers is for Hamza only. */}
      {instructions && <p className="mt-3 max-w-[65ch] whitespace-pre-wrap text-base leading-relaxed text-ink-2">{instructions}</p>}

      {assignment.attachments.length > 0 && (
        <div className="mt-4">
          {fromPapers ? <PastPaperHomework urls={assignment.attachments} /> : <PageStack urls={assignment.attachments} label="Worksheet" />}
        </div>
      )}

      {mine && mine.fileUrls.length > 0 && (
        <div className="mt-5 border-t border-hairline pt-4">
          <p className="mb-2 text-sm tabular-nums text-ink-3">
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
              className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-full border border-border-strong px-4 text-sm font-semibold text-ink-2 transition-colors duration-150 hover:border-ink-3 hover:text-ink disabled:opacity-40"
            >
              <Icon.Refresh className="h-4 w-4" /> Replace this photo
            </button>
          )}
          {!mine.feedback && mine.fileUrls.length > 1 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Remove a page">
              {mine.fileUrls.map((url, i) => (
                <li key={url}>
                  <button
                    type="button"
                    disabled={uploading || removing}
                    data-url={url}
                    onClick={(e) => void removePage(e)}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border-strong px-4 text-sm font-semibold text-ink-2 transition-colors duration-150 hover:border-error hover:text-error disabled:opacity-40"
                  >
                    <Icon.Close className="h-4 w-4" /> Remove page {i + 1}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {mine?.feedback && (
        <div ref={replyRef} className="mt-4 rounded-tile bg-surface-2 p-4">
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
          {!mine && <FocusOnThis kind="homework" title={assignment.title} subject={subjectName} id={assignment.id} />}
        </div>
        {uploading && (
          <div className="mt-2.5 flex items-center gap-2.5" role="status">
            <span className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <span className="block h-full rounded-full bg-ink-2 transition-[width] duration-200" style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </span>
            <span className="text-sm font-semibold tabular-nums text-ink-2">{progress >= 0.99 ? "Almost done…" : `Uploading ${Math.round(progress * 100)}%`}</span>
          </div>
        )}
        {unsaved && !uploading && (
          <div role="alert" className="mt-3 rounded-tile border border-warning/35 bg-warning-soft p-4">
            <p className="text-sm text-ink">Your photos uploaded, but the hand-in didn&apos;t reach me. Check your internet, then tap Try again.</p>
            <Button variant="secondary" className="mt-3" onClick={() => void saveAgain()}>
              <Icon.Refresh className="h-4 w-4" /> Try again
            </Button>
          </div>
        )}
        {mine?.feedback && <p className="mt-2 text-sm text-ink-3">I&apos;ve already replied. If you add pages, message me so I see them.</p>}
        {overdue && !mine && <p className="mt-2 text-sm text-ink-3">The deadline has passed, but you can still hand it in.</p>}
        {!mine && !uploading && <p className="mt-2 text-sm text-ink-3">Take a clear photo of each page, or pick a PDF. You can add more pages after.</p>}
      </div>
    </Card>
  );
}
