"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAuth } from "@/lib/auth-context";
import { studentById } from "@/lib/data/selectors";
import { EmptyState, Icon } from "@/components/ui";
import { NoteViewer } from "@/components/NoteViewer";
import { cn } from "@/lib/cn";

function fileIcon(type: string) {
  if (type.startsWith("image/")) return "🖼️";
  if (type.includes("pdf")) return "📄";
  if (type.includes("word") || type.includes("document")) return "📝";
  if (type.includes("sheet") || type.includes("excel")) return "📊";
  if (type.includes("presentation") || type.includes("powerpoint")) return "📑";
  return "📎";
}

function fileLabel(type: string) {
  if (type.startsWith("image/")) return "Image";
  if (type.includes("pdf")) return "PDF";
  if (type.includes("word") || type.includes("document")) return "Word";
  if (type.includes("sheet") || type.includes("excel")) return "Excel";
  if (type.includes("presentation") || type.includes("powerpoint")) return "PowerPoint";
  return "File";
}

function scopeLabel(
  cohortName: string | undefined,
  className: string | undefined,
  subjectName: string | undefined,
): string {
  const parts = [cohortName, className, subjectName].filter(Boolean);
  return parts.join(" › ");
}

/** Suspense wrapper: `useSearchParams` (for `?open=<noteId>`) needs a boundary during prerender. */
export default function StudentNotesPage() {
  return (
    <Suspense fallback={null}>
      <StudentNotes />
    </Suspense>
  );
}

function StudentNotes() {
  const db = useDatabase();
  const store = useStore();
  const { session } = useAuth();

  // Hooks must run before any early return — guard inside instead.
  const studentId = session?.studentId;
  const username = (studentId ? studentById(db, studentId)?.username : null) ?? "A student";

  // A note becomes visible to a student the moment it is ASSIGNED, which can
  // happen while they are sitting on this page. Without this they would not see
  // it until the tab lost and regained focus (DataSync) or was reloaded.
  useEffect(() => store.subscribeToNotes(), [store]);

  const visitLogged = useRef(false);
  const [viewing, setViewing] = useState<{ id: string; title: string } | null>(null);
  // `?open=<noteId>` (from "Read: …" and "Open the notes for it") opens that
  // note in the reader straight away. Once closed, it stays closed.
  const openId = useSearchParams().get("open");
  const [closedLinked, setClosedLinked] = useState<string | null>(null);
  // RLS already limits db.notes to what this student can open.
  const linked = openId && openId !== closedLinked ? db.notes.find((n) => n.id === openId) : undefined;

  // Opening a note from a link is still opening it, same as tapping Read.
  const linkedLogged = useRef<string | null>(null);
  useEffect(() => {
    if (!linked || !studentId || linkedLogged.current === linked.id) return;
    linkedLogged.current = linked.id;
    store.logActivity({
      type: "notes_downloaded",
      title: `${username} opened "${linked.fileName}"`,
      studentId,
      noteId: linked.id,
      link: "/admin/notes",
    });
  }, [linked, studentId, username, store]);

  useEffect(() => {
    if (visitLogged.current || !studentId) return;
    visitLogged.current = true;
    store.logActivity({
      type: "notes_accessed",
      title: `${username} opened Notes`,
      studentId,
      link: "/admin/notes",
    });
  }, [studentId, username, store]);

  if (!studentId) return null;
  const student = studentById(db, studentId);
  if (!student) return null;

  // Notes are read inside the portal — there is no download, so the record is
  // of the note being opened.
  function onOpen(noteId: string, title: string, fileName: string) {
    store.logActivity({
      type: "notes_downloaded",
      title: `${username} opened "${fileName}"`,
      studentId,
      noteId,
      link: "/admin/notes",
    });
    setViewing({ id: noteId, title });
  }

  // The store already applies RLS so db.notes only contains notes this student
  // can access. We still filter locally to build per-note scope labels.
  const accessibleAssignments = db.noteAssignments.filter((na) => {
    if (na.cohortId !== student.cohortId) return false;
    if (na.classId && !student.classIds.includes(na.classId)) return false;
    if (na.subjectId && !student.subjectIds.includes(na.subjectId)) return false;
    return true;
  });

  const accessibleNoteIds = new Set(accessibleAssignments.map((a) => a.noteId));
  const notes = db.notes.filter((n) => accessibleNoteIds.has(n.id));
  const shown = viewing ?? (linked ? { id: linked.id, title: linked.title } : null);

  // Group notes by subject, then "General" for cohort-only
  const bySubject = new Map<string, typeof notes>();
  for (const note of notes) {
    const assignment = accessibleAssignments.find((a) => a.noteId === note.id);
    const subjectName = assignment?.subjectId
      ? db.subjects.find((s) => s.id === assignment.subjectId)?.name ?? "Other"
      : assignment?.classId
      ? db.classes.find((c) => c.id === assignment.classId)?.name ?? "Other"
      : "General";
    if (!bySubject.has(subjectName)) bySubject.set(subjectName, []);
    bySubject.get(subjectName)!.push(note);
  }

  const groups = Array.from(bySubject.entries()).sort(([a], [b]) => {
    if (a === "General") return 1;
    if (b === "General") return -1;
    return a.localeCompare(b);
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 font-display text-2xl font-bold text-ink">Notes</h1>
      <p className="mb-6 text-sm text-ink-3">Class notes and handouts from Hamza.</p>

      {notes.length === 0 ? (
        <EmptyState
          icon={<Icon.Doc />}
          title="No notes yet"
          message="No notes shared with you yet. They'll show up here after class."
        />
      ) : (
        <div className="space-y-8">
          {groups.map(([groupName, groupNotes]) => (
            <section key={groupName}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">{groupName}</h2>
              <div className="space-y-2">
                {groupNotes.map((note) => {
                  const assignment = accessibleAssignments.find((a) => a.noteId === note.id);
                  const cohortName = db.cohorts.find((c) => c.id === assignment?.cohortId)?.name;
                  const className = assignment?.classId ? db.classes.find((c) => c.id === assignment.classId)?.name : undefined;
                  const subjectName = assignment?.subjectId ? db.subjects.find((s) => s.id === assignment.subjectId)?.name : undefined;
                  const scope = scopeLabel(cohortName, className, subjectName);

                  return (
                    <div
                      key={note.id}
                      className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="text-2xl leading-none" aria-hidden>{fileIcon(note.fileType)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink">{note.title}</p>
                          <p className="flex items-center gap-1.5 text-xs text-ink-3">
                            <span className={cn(
                              "rounded px-1.5 py-0.5 font-medium",
                              "border border-border bg-surface-2",
                            )}>
                              {fileLabel(note.fileType)}
                            </span>
                            <span className="shrink-0">{new Date(note.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                            {scope && <span className="truncate">{scope}</span>}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => onOpen(note.id, note.title, note.fileName)}
                        className={cn(
                          "flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold",
                          "bg-brand-soft text-brand hover:opacity-80 transition-opacity",
                        )}
                        aria-label={`Read ${note.title}`}
                      >
                        <Icon.Doc className="h-4 w-4" />
                        <span>Read</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
      {shown && (
        <NoteViewer
          noteId={shown.id}
          title={shown.title}
          onClose={() => {
            setViewing(null);
            setClosedLinked(openId);
          }}
        />
      )}
    </main>
  );
}
