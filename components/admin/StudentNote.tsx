"use client";

import { useId, useState } from "react";
import { NOTE_MAX, saveTeacherNote, useTeacherNotes } from "@/lib/teacher-notes";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { panelTitle } from "@/components/admin/surface";

export const NOTE_LABEL = "Private note (only you see this)";

const savedAt = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" });

/**
 * The small note editor: a box, Save and Cancel. `onDone` runs after a save
 * or a cancel (Today closes the editor then). The draft starts from the saved note.
 */
export function NoteEditor({ studentId, onDone, autoFocus }: { studentId: string; onDone?: (saved: boolean) => void; autoFocus?: boolean }) {
  const { notes } = useTeacherNotes();
  const saved = notes[studentId]?.text ?? "";
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const id = useId();
  const changed = draft.trim() !== saved;

  async function save() {
    if (busy || !changed) return;
    setBusy(true);
    setError(null);
    const r = await saveTeacherNote(studentId, draft);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDraft(draft.trim());
    setJustSaved(true);
    onDone?.(true);
  }

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {NOTE_LABEL}
      </label>
      <textarea
        id={id}
        value={draft}
        maxLength={NOTE_MAX}
        rows={3}
        autoFocus={autoFocus}
        placeholder="Anything to remember about this student"
        onChange={(e) => {
          setDraft(e.target.value);
          setJustSaved(false);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
          if (e.key === "Escape" && onDone) onDone(false);
        }}
        className="w-full resize-y rounded-md border border-border-strong bg-surface px-3.5 py-2.5 text-base leading-relaxed text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" loading={busy} disabled={!changed || busy} onClick={() => void save()}>
          Save
        </Button>
        {onDone && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDone(false)}>
            Cancel
          </Button>
        )}
        <span className={cn("text-xs tabular-nums", error ? "font-semibold text-error" : "text-ink-3")} role="status" aria-live="polite">
          {error ?? (justSaved && !changed ? "Saved" : `${draft.length}/${NOTE_MAX}`)}
        </span>
      </div>
    </div>
  );
}

/** The roster page's card: the note on show, with Edit (or Add) opening the editor in place. */
export function StudentNoteCard({ studentId }: { studentId: string }) {
  const { notes, loaded, error } = useTeacherNotes();
  const note = notes[studentId];
  const [editing, setEditing] = useState(false);
  return (
    <Card className="mt-4 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={panelTitle}>{NOTE_LABEL}</h2>
        {note && !editing && <span className="text-xs tabular-nums text-ink-3">Saved {savedAt(note.updatedAt)}</span>}
      </div>
      {editing ? (
        <div className="mt-3">
          <NoteEditor studentId={studentId} onDone={() => setEditing(false)} autoFocus />
        </div>
      ) : !loaded ? (
        <p className="mt-2 text-sm text-ink-3">Loading…</p>
      ) : (
        <>
          {error && <p className="mt-2 text-sm text-error">Couldn&apos;t load your notes. Reload the page to try again.</p>}
          {note ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-2">{note.text}</p>
          ) : (
            !error && <p className="mt-2 text-sm text-ink-3">No note yet.</p>
          )}
          {!error && (
            <Button size="sm" variant="ghost" className="-ml-3 mt-2" onClick={() => setEditing(true)}>
              {note ? "Edit note" : "Add a note"}
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
