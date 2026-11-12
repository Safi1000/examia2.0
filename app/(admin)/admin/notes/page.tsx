"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDatabase, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Input, Select, Modal, EmptyState, Icon, Badge, Spinner, chipClass, filterField, segmentGroup, segmentItem } from "@/components/ui";
import type { Note, NoteAssignment } from "@/types";
import { NoteViewer } from "@/components/NoteViewer";
import { BulkBar, ConfirmBulk, NameList, RowCheck, SelectAll, outcome, plural, type BulkAction } from "@/components/admin/BulkBar";
import { useSelection } from "@/lib/use-selection";
import { uploadNote, notesConfigured } from "@/lib/cloudinary";
import { cn } from "@/lib/cn";
import { DEMO } from "@/lib/demo";
import { setTitleOverride } from "@/hooks/usePageTitle";
import {
  LEVEL_SHORT,
  NOTE_BOOKS,
  chapterTitle,
  isHidden,
  levelOfName,
  matchChapter,
  setHidden,
  slotOf,
  subjectOfName,
  type NoteBook,
} from "@/lib/notes-library";
import { indexExistingNote, pdfPagesText, saveNoteText, searchableNotes } from "@/lib/notes-client";

const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp";
type Db = ReturnType<typeof useDatabase>;
type Store = ReturnType<typeof useStore>;

/** A notes book that exists in the portal: its level is a class, its subject a subject. */
type BookOpt = { key: string; book: NoteBook | null; classId: string | null; subjectId: string | null; label: string };
const EVERYONE: BookOpt = { key: "general", book: null, classId: null, subjectId: null, label: "Everyone (any subject)" };

function useBookOptions(db: Db): BookOpt[] {
  return useMemo(() => {
    const out: BookOpt[] = [];
    for (const book of NOTE_BOOKS) {
      const cls = db.classes.find((c) => levelOfName(c.name) === book.level);
      const subj = db.subjects.find((s) => subjectOfName(s.name) === book.subject);
      if (cls && subj) out.push({ key: book.key, book, classId: cls.id, subjectId: subj.id, label: `${LEVEL_SHORT[book.level]} ${book.subject}` });
    }
    return out;
  }, [db.classes, db.subjects]);
}

/** Batches that take this level and subject (a batch with no list takes everything). */
function cohortsFor(db: Db, opt: BookOpt, picked: string[]) {
  return db.cohorts.filter(
    (c) =>
      picked.includes(c.id) &&
      (!opt.classId || !c.classIds.length || c.classIds.includes(opt.classId)) &&
      (!opt.subjectId || !c.subjectIds.length || c.subjectIds.includes(opt.subjectId)),
  );
}

// Assignments grouped by note, built once per version of the list: every row looks its
// note up here instead of scanning every assignment (slow with a big catalogue).
const byNoteCache = new WeakMap<NoteAssignment[], Map<string, NoteAssignment[]>>();
function assignmentsOf(noteId: string, assignments: NoteAssignment[]): NoteAssignment[] {
  let m = byNoteCache.get(assignments);
  if (!m) {
    m = new Map();
    for (const a of assignments) {
      const list = m.get(a.noteId);
      if (list) list.push(a);
      else m.set(a.noteId, [a]);
    }
    byNoteCache.set(assignments, m);
  }
  return m.get(noteId) ?? [];
}

/** Which books a note goes to, from its assignments. */
function booksOf(note: Note, assignments: NoteAssignment[], opts: BookOpt[]): BookOpt[] {
  const mine = assignmentsOf(note.id, assignments);
  return opts.filter((o) => mine.some((a) => a.subjectId === o.subjectId && (a.classId === o.classId || a.classId === null)));
}

/** File types the portal can show (the same list as the file picker): a folder can hold anything. */
const ACCEPT_RE = new RegExp(`(${ACCEPT.split(",").map((x) => `\\${x}`).join("|")})$`, "i");

/** The chapter a note sits on in a book, if any. */
const slotIn = (book: NoteBook, note: Note) => {
  const m = matchChapter(book, note.title, note.fileName);
  return m ? slotOf(m) : null;
};

/** Every place a note can sit in a book: whole units and chapters. */
function SlotSelect({ book, value, onChange, label }: { book: NoteBook; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-10 text-sm">
      <option value="">Not a chapter (shows under More notes)</option>
      {book.units.map((u) => (
        <optgroup key={u.num} label={`Unit ${u.num}: ${u.name}`}>
          <option value={`U${u.num}`}>The whole of Unit {u.num}</option>
          {u.chapters.map(([n, name]) => (
            <option key={n} value={n}>
              {n} {name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

/** The title a note gets on a book's slot. */
function slotTitle(book: NoteBook, slot: string): string | null {
  if (!slot) return null;
  if (slot.startsWith("U")) return book.units.find((u) => `U${u.num}` === slot)?.name ?? null;
  const ch = book.units.flatMap((u) => u.chapters).find(([n]) => n === slot);
  return ch ? chapterTitle(ch[0], ch[1]) : null;
}

function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={chipClass(on)}
    >
      {on && <Icon.Check className="h-3.5 w-3.5 text-ink-2" />}
      {children}
    </button>
  );
}

/** Classes to send a note to: one line per level, subjects beside it. */
function BookPicker({ opts, picked, onToggle, disabled }: { opts: BookOpt[]; picked: string[]; onToggle: (key: string) => void; disabled?: boolean }) {
  const levels = [...new Set(opts.filter((o) => o.book).map((o) => o.book!.level))];
  const rest = opts.filter((o) => !o.book);
  return (
    <div className="space-y-2">
      {levels.map((lv) => (
        <div key={lv} className="flex flex-wrap items-center gap-1.5">
          <span className="w-full text-xs text-ink-3 sm:w-28 sm:shrink-0">{LEVEL_SHORT[lv]}</span>
          {opts
            .filter((o) => o.book?.level === lv)
            .map((o) => (
              <Chip key={o.key} on={picked.includes(o.key)} onClick={() => onToggle(o.key)} disabled={disabled}>
                <span className="sr-only">{LEVEL_SHORT[lv]} </span>
                {o.book!.subject}
              </Chip>
            ))}
        </div>
      ))}
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {rest.map((o) => (
            <Chip key={o.key} on={picked.includes(o.key)} onClick={() => onToggle(o.key)} disabled={disabled}>
              {o.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/* ======================================================================== */

export default function NotesPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const opts = useBookOptions(db);

  // A note opened in its own tab arrives as /admin/notes?note=<id> and opens straight away.
  const [viewing, setViewing] = useState<{ id: string; title: string } | null>(() => {
    const id = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("note");
    return id ? { id, title: "" } : null;
  });
  const viewingTitle = viewing ? viewing.title || db.notes.find((n) => n.id === viewing.id)?.title || "Note" : "";
  // The tab is named after the note, so several open notes are easy to tell apart.
  useEffect(() => {
    if (!viewingTitle) return;
    setTitleOverride(`${viewingTitle} · Notes`);
    return () => setTitleOverride(null);
  }, [viewingTitle]);
  const closeViewer = () => setViewing(null);
  const [view, setView] = useState<"chapters" | "all">("chapters");
  const [bookKey, setBookKey] = useState<string>("");
  const [query, setQuery] = useState("");
  const [upload, setUpload] = useState<{ book?: string; slot?: string } | null>(null);
  // The dialogs keep only the note's id and read the note fresh, so a rename (here or in
  // another tab) shows straight away, and a note deleted meanwhile closes its dialog.
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const assigning = assigningId ? (db.notes.find((n) => n.id === assigningId) ?? null) : null;
  const deleting = deletingId ? (db.notes.find((n) => n.id === deletingId) ?? null) : null;

  // Which PDFs can be searched inside. Checked once, then kept up to date here.
  const [searchable, setSearchable] = useState<Set<string> | null>(null);
  const [indexing, setIndexing] = useState<{ done: number; total: number; failed: number } | null>(null);
  const pdfIds = useMemo(() => db.notes.filter((n) => n.fileType.includes("pdf")).map((n) => n.id), [db.notes]);
  const checked = useRef(false);
  useEffect(() => {
    if (DEMO || checked.current || !pdfIds.length) return;
    checked.current = true;
    searchableNotes(pdfIds)
      .then(setSearchable)
      .catch(() => setSearchable(null));
  }, [pdfIds]);
  const unsearchable = searchable ? pdfIds.filter((id) => !searchable.has(id)) : [];

  async function makeSearchable() {
    const todo = unsearchable;
    setIndexing({ done: 0, total: todo.length, failed: 0 });
    let failed = 0;
    for (let i = 0; i < todo.length; i++) {
      try {
        await indexExistingNote(todo[i]);
        setSearchable((s) => new Set([...(s ?? []), todo[i]]));
      } catch {
        failed++;
      }
      setIndexing({ done: i + 1, total: todo.length, failed });
    }
    toast(failed ? `${todo.length - failed} done. ${failed} couldn't be read; try again later.` : "All notes can be searched now.", failed ? "error" : "success");
    setIndexing(null);
  }

  const activeBook = opts.find((o) => o.key === bookKey) ?? opts[0];
  const hiddenCount = db.notes.filter((n) => isHidden(n.fileType)).length;
  // A note no batch has been given isn't showing to anyone, hidden or not.
  const unsharedCount = db.notes.filter((n) => !isHidden(n.fileType) && !assignmentsOf(n.id, db.noteAssignments).length).length;
  const showingCount = db.notes.length - hiddenCount - unsharedCount;
  const q = query.trim().toLowerCase();

  async function setNoteHidden(n: Note, hidden: boolean) {
    try {
      await store.updateNote(n.id, { fileType: setHidden(n.fileType, hidden) });
      toast(hidden ? "Hidden from students. It's still here if you need it back." : "Showing to students again.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save that.", "error");
    }
  }

  const actions = (n: Note) => (
    <NoteActions
      note={n}
      searchable={searchable ? (n.fileType.includes("pdf") ? searchable.has(n.id) : null) : null}
      onRead={() => setViewing({ id: n.id, title: n.title })}
      onAssign={() => setAssigningId(n.id)}
      onHide={(h) => void setNoteHidden(n, h)}
      onDelete={() => setDeletingId(n.id)}
    />
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <PageHeader
        title="Notes"
        subtitle={`${showingCount} showing to students${unsharedCount ? ` · ${unsharedCount} not given to a batch yet` : ""}${hiddenCount ? ` · ${hiddenCount} hidden` : ""}`}
        actions={
          <Button onClick={() => setUpload({})}>
            <Icon.Plus className="h-4 w-4" /> Upload notes
          </Button>
        }
      />

      {unsearchable.length > 0 && (
        <Card className="mb-5 flex flex-wrap items-center gap-3 p-4">
          <Icon.Search className="h-5 w-5 shrink-0 text-brand" />
          <p className="min-w-0 flex-1 text-sm text-ink-2">
            {indexing
              ? `Reading note ${Math.min(indexing.done + 1, indexing.total)} of ${indexing.total}… keep this page open.`
              : `${unsearchable.length} older PDF${unsearchable.length === 1 ? " isn't" : "s aren't"} searchable yet. Students can't find words inside ${unsearchable.length === 1 ? "it" : "them"}.`}
          </p>
          <Button size="sm" onClick={() => void makeSearchable()} loading={!!indexing} disabled={!!indexing}>
            Make them searchable
          </Button>
        </Card>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="View" className={segmentGroup}>
          {(["chapters", "all"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={segmentItem(view === v)}
            >
              {v === "chapters" ? "By chapter" : "All notes"}
            </button>
          ))}
        </div>
        <label className="relative min-w-0 basis-full sm:max-w-xs sm:flex-1 sm:basis-auto">
          <Icon.Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a note by name"
            aria-label="Find a note by name"
            className={cn(filterField, "w-full pl-9")}
          />
        </label>
      </div>

      {db.notes.length === 0 && !opts.length ? (
        <EmptyState
          icon={<Icon.Doc />}
          title="No notes yet"
          message="Upload PDFs, Word files, slides or images, and choose which classes get them."
          action={<Button onClick={() => setUpload({})}>Upload notes</Button>}
        />
      ) : view === "chapters" && !q && activeBook?.book ? (
        <>
          <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:-mx-8 sm:px-8 [&::-webkit-scrollbar]:hidden">
            {opts.map((o) => (
              <Chip key={o.key} on={o.key === activeBook.key} onClick={() => setBookKey(o.key)}>
                {o.label}
              </Chip>
            ))}
          </div>
          <BookView db={db} opt={activeBook} actions={actions} onUpload={(slot) => setUpload({ book: activeBook.key, slot })} />
        </>
      ) : (
        <AllNotes db={db} store={store} opts={opts} q={q} actions={actions} />
      )}

      {upload && <UploadModal db={db} store={store} opts={opts} preset={upload} onClose={() => setUpload(null)} onIndexed={(id) => setSearchable((s) => (s ? new Set([...s, id]) : s))} />}
      {assigning && <AssignModal key={assigning.id} db={db} store={store} opts={opts} note={assigning} onClose={() => setAssigningId(null)} />}

      <Modal
        open={!!deleting}
        onClose={() => setDeletingId(null)}
        title="Delete note?"
        description={deleting ? `"${deleting.title}" will be removed for all students.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            {deleting && !isHidden(deleting.fileType) && (
              <Button
                variant="secondary"
                onClick={() => {
                  void setNoteHidden(deleting, true);
                  setDeletingId(null);
                }}
              >
                Hide instead
              </Button>
            )}
            <Button
              variant="danger"
              onClick={() => {
                if (!deleting) return;
                const id = deleting.id;
                // A ticked note that is deleted drops out of the selection by itself.
                store.deleteNote(id);
                setDeletingId(null);
                toast("Note deleted.", "success");
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">This can&apos;t be undone. To keep it but stop students seeing it, hide it instead.</p>
      </Modal>
      {viewing && <NoteViewer noteId={viewing.id} title={viewingTitle} onClose={closeViewer} />}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function NoteActions({
  note,
  searchable,
  onRead,
  onAssign,
  onHide,
  onDelete,
}: {
  note: Note;
  searchable: boolean | null;
  onRead: () => void;
  onAssign: () => void;
  onHide: (hidden: boolean) => void;
  onDelete: () => void;
}) {
  const hidden = isHidden(note.fileType);
  const btn = "inline-flex h-9 items-center rounded-full px-3 text-[13px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink max-md:h-11 max-md:px-2.5";
  return (
    <div className="flex flex-wrap items-center gap-1">
      {hidden && <Badge tone="warning">Hidden</Badge>}
      {searchable === false && <span className="px-1 text-xs text-ink-3">Not searchable</span>}
      {/* A real link: a click reads it here; Cmd, Ctrl or Shift-click, a middle click, or the
          right-click menu opens it in its own tab, so several notes can be open side by side. */}
      <a
        href={`/admin/notes?note=${encodeURIComponent(note.id)}`}
        className={btn}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
          e.preventDefault();
          onRead();
        }}
      >
        Read
      </a>
      <a
        href={`/admin/notes?note=${encodeURIComponent(note.id)}`}
        target="_blank"
        rel="noopener"
        title="Open in a new tab"
        aria-label={`Open ${note.title} in a new tab`}
        // A new tab means little on a phone; leaving it out keeps the row on one line.
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink max-md:hidden"
      >
        <Icon.NewTab className="h-4 w-4" />
      </a>
      <button type="button" className={btn} onClick={onAssign}>
        Who gets it
      </button>
      <button type="button" className={btn} onClick={() => onHide(!hidden)}>
        {hidden ? "Show" : "Hide"}
      </button>
      <button type="button" onClick={onDelete} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 transition-colors max-md:h-11 max-md:w-11 hover:bg-error-soft hover:text-error" aria-label={`Delete ${note.title}`}>
        <Icon.Trash className="h-4 w-4" />
      </button>
    </div>
  );
}

/** One book, unit by unit: what's uploaded on each chapter and what's still to come. */
function BookView({ db, opt, actions, onUpload }: { db: Db; opt: BookOpt; actions: (n: Note) => React.ReactNode; onUpload: (slot: string) => void }) {
  const book = opt.book!;
  const bySlot = new Map<string, Note[]>();
  const more: Note[] = [];
  for (const n of db.notes) {
    if (!booksOf(n, db.noteAssignments, [opt]).length) continue;
    const s = slotIn(book, n);
    if (s) bySlot.set(s, [...(bySlot.get(s) ?? []), n]);
    else more.push(n);
  }
  const all = book.units.flatMap((u) => u.chapters.map(([c]) => ({ u: u.num, c })));
  const done = all.filter(({ u, c }) => bySlot.has(c) || bySlot.has(`U${u}`)).length;

  const row = (n: Note, label: string, sub?: string) => (
    <div key={n.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3", isHidden(n.fileType) && "opacity-60")}>
      <span className="w-10 shrink-0 text-[13px] font-semibold tabular-nums text-brand">{label}</span>
      <span className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-0">
        <span className="block text-[15px] font-semibold text-ink">{n.title}</span>
        <span className="block text-xs text-ink-3">
          {sub ? `${sub} · ` : ""}
          {n.fileName} · {new Date(n.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
        </span>
      </span>
      <span className="ml-[3.25rem] sm:ml-0">{actions(n)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">
            {done} of {all.length}
          </span>{" "}
          chapters uploaded for {opt.label}
        </p>
      </div>
      {book.units.map((u) => {
        const unitNotes = bySlot.get(`U${u.num}`) ?? [];
        return (
          <Card key={u.num} className="overflow-hidden p-0">
            <div className="border-b border-border px-4 py-3">
              <span className="block text-[13px] text-ink-3">Unit {u.num}</span>
              <span className="block text-[17px] font-semibold leading-snug text-ink">{u.name}</span>
            </div>
            <div className="divide-y divide-border">
              {unitNotes.map((n) => row(n, "Unit", "The whole unit"))}
              {u.chapters.map(([c, name]) => {
                const list = bySlot.get(c);
                if (list) return list.map((n) => row(n, c));
                return (
                  // The whole row uploads to this chapter: one tap, no small button to aim for.
                  <button
                    key={c}
                    type="button"
                    onClick={() => onUpload(c)}
                    aria-label={`Upload ${c} ${name}`}
                    className="group flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 active:bg-surface-2"
                  >
                    <span className="w-10 shrink-0 text-[13px] tabular-nums text-ink-3">{c}</span>
                    <span className="min-w-0 flex-1 text-[15px] text-ink-3">
                      {name}
                      {unitNotes.length ? " · in the unit notes" : ""}
                    </span>
                    <Icon.Plus className="h-4 w-4 shrink-0 text-ink-3 group-hover:text-brand" />
                  </button>
                );
              })}
            </div>
          </Card>
        );
      })}
      {more.length > 0 && (
        <Card className="overflow-hidden p-0">
          <p className="border-b border-border px-4 py-3 font-semibold text-ink">More notes (not on a chapter)</p>
          <div className="divide-y divide-border">{more.map((n) => row(n, ""))}</div>
        </Card>
      )}
    </div>
  );
}

function AllNotes({
  db,
  store,
  opts,
  q,
  actions,
}: {
  db: Db;
  store: Store;
  opts: BookOpt[];
  q: string;
  actions: (n: Note) => React.ReactNode;
}) {
  const { toast } = useToast();
  const [bulkCohort, setBulkCohort] = useState("");
  const [bulkClass, setBulkClass] = useState("");
  const [bulkSubject, setBulkSubject] = useState("");
  const [ask, setAsk] = useState<null | "assign" | "unshare" | "hide" | "show" | "delete">(null);
  const list = useMemo(() => db.notes.filter((n) => !q || n.title.toLowerCase().includes(q) || n.fileName.toLowerCase().includes(q)), [db.notes, q]);
  // Ticked notes: only ever ones the search shows (and that still exist).
  const ids = useMemo(() => list.map((n) => n.id), [list]);
  const sel = useSelection(ids);
  const chosen = list.filter((n) => sel.isSelected(n.id));
  const names = chosen.map((n) => n.title);
  const shown = chosen.filter((n) => !isHidden(n.fileType));
  const hidden = chosen.filter((n) => isHidden(n.fileType));
  // Batches the ticked notes are shared with, for "Take away from a batch".
  const sharedWith = db.cohorts.filter((c) => chosen.some((n) => assignmentsOf(n.id, db.noteAssignments).some((a) => a.cohortId === c.id)));

  async function runAssign() {
    if (!bulkCohort) return;
    let ok = 0;
    let already = 0;
    const problems: { name: string; why: string }[] = [];
    for (const n of chosen) {
      const has = assignmentsOf(n.id, db.noteAssignments).some((a) => a.cohortId === bulkCohort && a.classId === (bulkClass || null) && a.subjectId === (bulkSubject || null));
      if (has) {
        already++;
        continue;
      }
      try {
        await store.addNoteAssignment(n.id, bulkCohort, bulkClass || null, bulkSubject || null);
        ok++;
      } catch {
        problems.push({ name: n.title, why: "the save failed, try again" });
      }
    }
    setAsk(null);
    sel.clear();
    toast(`${outcome(ok, "shared", problems, "note")}${already ? ` ${plural(already, "was", "were")} already shared with that group.` : ""}`, problems.length ? (ok ? "info" : "error") : "success");
  }

  function runUnshare() {
    if (!bulkCohort) return;
    const gone = chosen.flatMap((n) => assignmentsOf(n.id, db.noteAssignments).filter((a) => a.cohortId === bulkCohort));
    gone.forEach((a) => store.deleteNoteAssignment(a.id));
    const notes = new Set(gone.map((a) => a.noteId)).size;
    setAsk(null);
    sel.clear();
    setBulkCohort("");
    toast(`${plural(notes, "note")} taken away from ${db.cohorts.find((c) => c.id === bulkCohort)?.name ?? "that batch"}.`, "success", gone.length ? {
      label: "Undo",
      onClick: () => {
        void Promise.allSettled(gone.map((a) => store.addNoteAssignment(a.noteId, a.cohortId, a.classId, a.subjectId))).then((r) => {
          const failed = r.filter((x) => x.status === "rejected").length;
          toast(failed ? `${failed} couldn't be shared again. Use Who gets it on those notes.` : "Shared again.", failed ? "error" : "success");
        });
      },
    } : undefined);
  }

  async function runHide(hide: boolean) {
    const list = hide ? shown : hidden;
    const results = await Promise.allSettled(list.map((n) => store.updateNote(n.id, { fileType: setHidden(n.fileType, hide) })));
    const done = list.filter((_, i) => results[i].status === "fulfilled");
    const problems = list.filter((_, i) => results[i].status === "rejected").map((n) => ({ name: n.title, why: "the save failed, try again" }));
    setAsk(null);
    sel.clear();
    toast(outcome(done.length, hide ? "hidden from students" : "showing to students again", problems, "note"), problems.length ? (done.length ? "info" : "error") : "success", done.length ? {
      label: "Undo",
      onClick: () => {
        void Promise.allSettled(done.map((n) => store.updateNote(n.id, { fileType: n.fileType }))).then(() => toast("Put back.", "success"));
      },
    } : undefined);
  }

  function runDelete() {
    const n = chosen.length;
    chosen.forEach((x) => store.deleteNote(x.id));
    setAsk(null);
    sel.clear();
    toast(`${plural(n, "note")} deleted.`, "success");
  }

  const bulkActions: BulkAction[] = [
    { id: "assign", label: "Who gets them", primary: true, run: () => setAsk("assign") },
    ...(shown.length ? [{ id: "hide", label: "Hide from students", run: () => setAsk("hide") }] : []),
    ...(hidden.length ? [{ id: "show", label: "Show to students", run: () => setAsk("show") }] : []),
    ...(sharedWith.length ? [{ id: "unshare", label: "Take away from a batch", run: () => setAsk("unshare") }] : []),
    { id: "delete", label: "Delete", danger: true, run: () => setAsk("delete") },
  ];

  return (
    <>
      <ConfirmBulk
        open={ask === "assign"}
        onClose={() => setAsk(null)}
        title={`Share ${plural(chosen.length, "note")}`}
        description="Students in that batch (and class and subject, if you pick them) see these notes and get a notice."
        confirmLabel="Share"
        disabled={!bulkCohort}
        onConfirm={runAssign}
      >
        <Select label="Batch" value={bulkCohort} onChange={(e) => setBulkCohort(e.target.value)}>
          <option value="">Choose…</option>
          {db.cohorts.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select label="Class" value={bulkClass} onChange={(e) => setBulkClass(e.target.value)}>
            <option value="">All classes</option>
            {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Subject" value={bulkSubject} onChange={(e) => setBulkSubject(e.target.value)}>
            <option value="">All subjects</option>
            {db.subjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        </div>
        <NameList names={names} />
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "unshare"}
        onClose={() => setAsk(null)}
        title={`Take ${plural(chosen.length, "note")} away from a batch`}
        description="Students in that batch stop seeing them. The notes stay here, and other batches keep them."
        confirmLabel="Take away"
        disabled={!bulkCohort}
        onConfirm={runUnshare}
      >
        <Select label="Batch" value={bulkCohort} onChange={(e) => setBulkCohort(e.target.value)}>
          <option value="">Choose…</option>
          {sharedWith.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <NameList names={names} />
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "hide"}
        onClose={() => setAsk(null)}
        title={`Hide ${plural(shown.length, "note")} from students?`}
        description="They stay here and keep who gets them, so showing them again puts everything back."
        confirmLabel="Hide"
        onConfirm={() => runHide(true)}
      >
        <NameList names={shown.map((n) => n.title)} />
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "show"}
        onClose={() => setAsk(null)}
        title={`Show ${plural(hidden.length, "note")} to students again?`}
        description="Students they are shared with can open them again."
        confirmLabel="Show"
        onConfirm={() => runHide(false)}
      >
        <NameList names={hidden.map((n) => n.title)} />
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "delete"}
        onClose={() => setAsk(null)}
        title={`Delete ${plural(chosen.length, "note")}?`}
        description="They are removed for all students. This cannot be undone. To keep them but stop students seeing them, use Hide instead."
        confirmLabel={`Delete ${plural(chosen.length, "note")}`}
        danger
        onConfirm={runDelete}
      >
        <NameList names={names} />
      </ConfirmBulk>

      {list.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-3">{q ? "No note has that name." : "No notes yet."}</p>
      ) : (
        <div role="group" aria-label="Notes" onKeyDown={sel.listKeyDown}>
        <SelectAll sel={sel} noun="note" className="px-4" />
        <div className="space-y-2.5">
          {list.map((n) => {
            const books = booksOf(n, db.noteAssignments, opts);
            const assigned = assignmentsOf(n.id, db.noteAssignments).length > 0;
            return (
              <Card key={n.id} className={cn("p-4", isHidden(n.fileType) && "opacity-70")}>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="pt-1.5">
                    <RowCheck id={n.id} checked={sel.isSelected(n.id)} onToggle={sel.toggle} label={`Select ${n.title}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink">{n.title}</p>
                    <p className="text-xs text-ink-3">
                      {n.fileName} · {new Date(n.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {!assigned && (
                        <Badge tone="warning">
                          <Icon.Warn className="h-3.5 w-3.5" /> No student can see it yet
                        </Badge>
                      )}
                      {books.map((b) => (
                        <span key={b.key} className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2">
                          {b.label}
                        </span>
                      ))}
                      {assigned && !books.length && <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-ink-2">Shared with a batch</span>}
                    </div>
                  </div>
                  {actions(n)}
                </div>
              </Card>
            );
          })}
        </div>
        </div>
      )}
      <BulkBar count={sel.count} onClear={sel.clear} actions={bulkActions} />
    </>
  );
}

/* ------------------------------------------------------------------------ */

type Row = {
  key: string;
  file: File;
  /** books this file goes to */
  books: string[];
  /** book key -> slot ("2.6", "U2", or "" for not a chapter) */
  slots: Record<string, string>;
  /** title when it isn't a chapter */
  title: string;
  /** older notes on the same chapter to hide when this one is published */
  hideOld: string[];
  status: "ready" | "uploading" | "saving" | "done" | "failed";
  progress: number;
  error?: string;
  /** published, but its words couldn't be saved for search */
  unsearchable?: boolean;
  /** showing the class picker for this one file */
  editing?: boolean;
};

const cleanName = (name: string) =>
  name
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .trim();

function UploadModal({
  db,
  store,
  opts,
  preset,
  onClose,
  onIndexed,
}: {
  db: Db;
  store: Store;
  opts: BookOpt[];
  preset: { book?: string; slot?: string };
  onClose: () => void;
  onIndexed: (id: string) => void;
}) {
  const { toast } = useToast();
  const allOpts = useMemo(() => [...opts, EVERYONE], [opts]);
  const [defaults, setDefaults] = useState<string[]>(preset.book ? [preset.book] : []);
  const activeCohorts = db.cohorts.filter((c) => c.active);
  const [cohorts, setCohorts] = useState<string[]>(activeCohorts.map((c) => c.id));
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const finished = rows.length > 0 && rows.every((r) => r.status === "done");
  // The rows as they are now: a file waiting its turn is read fresh when its turn comes,
  // so one removed or changed after Publish was pressed is skipped or sent as changed.
  const rowsRef = useRef(rows);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);
  // What already went through for each file, so a retry after a failure doesn't upload
  // the file again or make a second copy of a note that was already created.
  const sent = useRef(new Map<string, { file?: { url: string; fileType: string; fileName: string }; notes: Map<string, string>; links: Set<string>; indexed: Set<string> }>());

  // Leaving the page mid-upload would cut it off: the browser asks first.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  /** Escape, a tap outside or the close button: ask before dropping files not yet published. */
  function requestClose() {
    if (busy) return;
    const left = rows.filter((r) => r.status === "ready" || r.status === "failed").length;
    if (left && !window.confirm(`Close without publishing? ${left === 1 ? "The file you added isn't" : `The ${left} files you added aren't`} uploaded yet.`)) return;
    onClose();
  }

  const optOf = (k: string) => allOpts.find((o) => o.key === k);

  /** Visible notes already on this book's slot (to offer hiding the old one). */
  const olderOn = (bookKey: string, slot: string) => {
    const o = optOf(bookKey);
    if (!o?.book || !slot) return [];
    return db.notes.filter((n) => !isHidden(n.fileType) && booksOf(n, db.noteAssignments, [o]).length && slotIn(o.book!, n) === slot);
  };

  function addFiles(list: FileList | File[]) {
    const usable = [...list].filter((f) => f.size > 0 && !f.name.startsWith("."));
    // A dropped or chosen folder can hold anything: keep the kinds of file students can open.
    const files = usable.filter((f) => ACCEPT_RE.test(f.name));
    const skipped = usable.length - files.length;
    setError(skipped ? `${skipped} file${skipped === 1 ? " was" : "s were"} left out. Notes can be PDF, Word, PowerPoint, Excel or an image.` : null);
    if (!files.length) return;
    setRows((prev) => {
      const next = [...prev];
      for (const file of files) {
        const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        if (next.some((r) => r.file.name === file.name && r.file.size === file.size)) continue;
        // A folder like "AS/Accounting/…" says which book it's for.
        const parts = path.split("/").slice(0, -1);
        const lvl = parts.map(levelOfName).find(Boolean) ?? null;
        const sub = parts.map(subjectOfName).find(Boolean) ?? null;
        const fromPath = opts.find((o) => o.book && o.book.level === lvl && o.book.subject === sub);
        const books = fromPath ? [fromPath.key] : defaults.length ? [...defaults] : [];
        const slots: Record<string, string> = {};
        for (const k of books) {
          const b = optOf(k)?.book;
          if (!b) continue;
          if (preset.slot && k === preset.book && files.length === 1) slots[k] = preset.slot;
          else {
            const m = matchChapter(b, cleanName(file.name), file.name);
            slots[k] = m ? slotOf(m) : "";
          }
        }
        next.push({ key: `${file.name}:${file.size}:${Math.random()}`, file, books, slots, title: cleanName(file.name), hideOld: [], status: "ready", progress: 0 });
      }
      return next;
    });
  }

  const patch = (key: string, p: Partial<Row> | ((r: Row) => Partial<Row>)) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...(typeof p === "function" ? p(r) : p) } : r)));

  function toggleBook(r: Row, k: string) {
    const books = toggle(r.books, k);
    const slots = { ...r.slots };
    const b = optOf(k)?.book;
    if (books.includes(k) && b && slots[k] === undefined) {
      const m = matchChapter(b, cleanName(r.file.name), r.file.name);
      slots[k] = m ? slotOf(m) : "";
    }
    patch(r.key, { books, slots });
  }

  /** Apply the "for" choice to every file still waiting. */
  function applyDefaults(next: string[]) {
    setDefaults(next);
    setRows((rs) =>
      rs.map((r) => {
        if (r.status !== "ready") return r;
        const slots: Record<string, string> = {};
        for (const k of next) {
          const b = optOf(k)?.book;
          if (!b) continue;
          const m = matchChapter(b, cleanName(r.file.name), r.file.name);
          slots[k] = r.slots[k] ?? (m ? slotOf(m) : "");
        }
        return { ...r, books: next, slots };
      }),
    );
  }

  /** Groups of books that share one title: one note each. */
  function plan(r: Row) {
    const groups = new Map<string, BookOpt[]>();
    for (const k of r.books) {
      const o = optOf(k);
      if (!o) continue;
      const t = (o.book && slotTitle(o.book, r.slots[k] ?? "")) || r.title.trim() || cleanName(r.file.name);
      groups.set(t, [...(groups.get(t) ?? []), o]);
    }
    return groups;
  }

  async function publish() {
    setError(null);
    const todo = rows.filter((r) => r.status === "ready" || r.status === "failed");
    if (!todo.length) return;
    for (const r of todo) {
      if (!r.books.length) return setError(`Choose who gets "${r.file.name}".`);
      for (const k of r.books) {
        const o = optOf(k)!;
        if (!cohortsFor(db, o, cohorts).length) return setError(`None of the batches you picked take ${o.label}. Tick a batch that does.`);
      }
    }
    if (!DEMO && !notesConfigured()) return setError("Note uploads aren't set up yet. Ask your developer to check the file storage settings.");
    setBusy(true);
    let ok = 0;
    // Two at a time: quick, and kind to a home connection.
    const queue = [...todo];
    const worker = async () => {
      for (let r = queue.shift(); r; r = queue.shift()) {
        // Its turn now: take the row as it is, not as it was when Publish was pressed.
        const row = rowsRef.current.find((x) => x.key === r.key);
        if (!row || (row.status !== "ready" && row.status !== "failed")) continue;
        if (!row.books.length) {
          patch(row.key, { status: "failed", error: "Choose who gets it" });
          continue;
        }
        patch(row.key, { status: "uploading", progress: 0, error: undefined });
        let done = sent.current.get(row.key);
        if (!done) {
          done = { notes: new Map(), links: new Set(), indexed: new Set() };
          sent.current.set(row.key, done);
        }
        try {
          const isPdf = row.file.type.includes("pdf") || /\.pdf$/i.test(row.file.name);
          // Read the words while the file uploads.
          const words = isPdf ? pdfPagesText(row.file).catch(() => null) : Promise.resolve(null);
          // A retry reuses the copy already uploaded.
          done.file ??= await uploadNote(row.file, (f) => patch(row.key, { progress: f }));
          const { url, fileType, fileName } = done.file;
          patch(row.key, { status: "saving", progress: 1 });
          const pages = await words;
          let unsearchable = isPdf && !pages;
          for (const [title, books] of plan(row)) {
            // Made on an earlier try: use that note rather than making a second one.
            let noteId = done.notes.get(title);
            if (!noteId) {
              noteId = await store.addNote(title, url, fileType || (isPdf ? "application/pdf" : "application/octet-stream"), fileName);
              done.notes.set(title, noteId);
            }
            for (const o of books) {
              for (const c of cohortsFor(db, o, cohorts)) {
                const link = `${noteId}|${c.id}|${o.classId}|${o.subjectId}`;
                if (done.links.has(link)) continue;
                await store.addNoteAssignment(noteId, c.id, o.classId, o.subjectId);
                done.links.add(link);
              }
            }
            if (pages && !done.indexed.has(noteId)) {
              try {
                await saveNoteText(noteId, pages);
                done.indexed.add(noteId);
                onIndexed(noteId);
              } catch {
                unsearchable = true;
              }
            }
          }
          for (const id of row.hideOld) {
            const old = db.notes.find((n) => n.id === id);
            if (old) await store.updateNote(id, { fileType: setHidden(old.fileType, true) }).catch(() => {});
          }
          patch(row.key, { status: "done", unsearchable });
          ok++;
        } catch (e) {
          patch(row.key, { status: "failed", error: e instanceof Error ? e.message : "Didn't upload." });
        }
      }
    };
    await Promise.all([worker(), worker()]);
    setBusy(false);
    if (ok) toast(`${ok} note${ok === 1 ? "" : "s"} published.`, "success");
  }

  const waiting = rows.filter((r) => r.status === "ready" || r.status === "failed").length;

  return (
    <Modal
      open
      onClose={requestClose}
      title="Upload notes"
      size="lg"
      footer={
        finished ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void publish()} disabled={busy || !waiting} loading={busy}>
              {busy ? "Publishing…" : `Publish ${waiting || ""} note${waiting === 1 ? "" : "s"}`}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-6">
        <section>
          <p className="mb-2 text-sm font-semibold text-ink">1. Who are these for?</p>
          <p className="mb-2.5 text-xs text-ink-3">Tick every class that should get them. Files in a folder like &ldquo;AS / Accounting&rdquo; are picked up on their own.</p>
          <BookPicker opts={allOpts} picked={defaults} onToggle={(k) => applyDefaults(toggle(defaults, k))} disabled={busy} />
          {activeCohorts.length > 1 && (
            <>
              <p className="mb-2 mt-4 text-xs font-semibold text-ink-2">Batches</p>
              <div className="flex flex-wrap gap-2">
                {activeCohorts.map((c) => (
                  <Chip key={c.id} on={cohorts.includes(c.id)} onClick={() => setCohorts(toggle(cohorts, c.id))} disabled={busy}>
                    {c.name}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-ink-3">Only batches that take that class and subject get the note.</p>
            </>
          )}
        </section>

        <section>
          <p className="mb-2 text-sm font-semibold text-ink">2. Add the files</p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cn("rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors", drag ? "border-brand bg-brand-soft" : "border-border")}
          >
            <p className="text-sm text-ink-2">Drop PDFs here, as many as you like</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
                Choose files
              </Button>
              <Button size="sm" variant="secondary" onClick={() => folderRef.current?.click()} disabled={busy}>
                Choose a folder
              </Button>
            </div>
            <p className="mt-2 text-xs text-ink-3">PDF works best (students can search inside it). Word, PowerPoint, Excel and images work too.</p>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && (addFiles(e.target.files), (e.target.value = ""))} />
            <input
              ref={folderRef}
              type="file"
              multiple
              className="hidden"
              {...({ webkitdirectory: "" } as Record<string, string>)}
              onChange={(e) => e.target.files && (addFiles(e.target.files), (e.target.value = ""))}
            />
          </div>
        </section>

        {rows.length > 0 && (
          <section>
            <p className="mb-2 text-sm font-semibold text-ink">3. Check each one</p>
            <ul className="space-y-3">
              {rows.map((r) => {
                const locked = r.status !== "ready" && r.status !== "failed";
                const titles = [...plan(r).keys()];
                const anyChapter = r.books.some((k) => r.slots[k]);
                return (
                  <li key={r.key} className="rounded-2xl border border-border bg-surface p-3.5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-ink-3">{r.file.name}</p>
                        <p className="mt-0.5 text-[15px] font-semibold text-ink">{titles.length ? titles.join("  ·  ") : r.title}</p>
                      </div>
                      <RowStatus r={r} onRemove={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} />
                    </div>
                    {!locked && (
                      <div className="mt-3 space-y-2.5">
                        {r.editing || !r.books.length ? (
                          <BookPicker opts={allOpts} picked={r.books} onToggle={(k) => toggleBook(r, k)} />
                        ) : (
                          <p className="text-[13px] text-ink-3">
                            For {r.books.map((k) => optOf(k)?.label).filter(Boolean).join(", ")}
                            {" · "}
                            <button type="button" onClick={() => patch(r.key, { editing: true })} className="font-semibold text-brand hover:underline">
                              Change
                            </button>
                          </p>
                        )}
                        {r.books.map((k) => {
                          const o = optOf(k);
                          if (!o?.book) return null;
                          const older = olderOn(k, r.slots[k] ?? "");
                          return (
                            <div key={k} className="space-y-1.5">
                              <p className="text-xs font-semibold text-ink-2">{o.label}: where does it go?</p>
                              <SlotSelect book={o.book} value={r.slots[k] ?? ""} onChange={(v) => patch(r.key, (x) => ({ slots: { ...x.slots, [k]: v } }))} label={`${o.label} chapter`} />
                              {older.map((n) => (
                                <label key={n.id} className="flex items-center gap-2 text-xs text-ink-2">
                                  <input
                                    type="checkbox"
                                    checked={r.hideOld.includes(n.id)}
                                    onChange={() => patch(r.key, (x) => ({ hideOld: toggle(x.hideOld, n.id) }))}
                                    className="h-4 w-4 accent-[var(--color-brand)]"
                                  />
                                  Hide the older note &ldquo;{n.title}&rdquo; from students
                                </label>
                              ))}
                            </div>
                          );
                        })}
                        {(!anyChapter || r.books.some((k) => !r.slots[k])) && (
                          <Input label="Title (when it isn't a chapter)" value={r.title} onChange={(e) => patch(r.key, { title: e.target.value })} />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {error && <p className="rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error">{error}</p>}
      </div>
    </Modal>
  );
}

function RowStatus({ r, onRemove }: { r: Row; onRemove: () => void }) {
  if (r.status === "ready")
    return (
      <button type="button" onClick={onRemove} aria-label={`Remove ${r.file.name}`} className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink">
        <Icon.Close className="h-4 w-4" />
      </button>
    );
  if (r.status === "uploading")
    return (
      <span className="flex w-24 shrink-0 flex-col items-end gap-1 pt-1">
        <span className="text-xs tabular-nums text-ink-3">{Math.round(r.progress * 100)}%</span>
        <span className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
          <span className="block h-full bg-brand transition-[width]" style={{ width: `${r.progress * 100}%` }} />
        </span>
      </span>
    );
  if (r.status === "saving")
    return (
      <span className="flex shrink-0 items-center gap-1.5 pt-1 text-xs text-ink-3">
        <Spinner size={12} /> Saving
      </span>
    );
  if (r.status === "done")
    return (
      <span className="shrink-0 pt-1 text-right text-xs font-semibold text-success">
        Published
        {r.unsearchable && <span className="block font-normal text-ink-3">Not searchable yet</span>}
      </span>
    );
  return <span className="max-w-40 shrink-0 pt-1 text-right text-xs font-semibold text-error">{r.error ?? "Didn't upload"}. Press Publish to retry.</span>;
}

/* ------------------------------------------------------------------------ */

/** Who gets one note: tick classes and batches; current links can be removed. Also where it sits. */
function AssignModal({ db, store, opts, note, onClose }: { db: Db; store: Store; opts: BookOpt[]; note: Note; onClose: () => void }) {
  const { toast } = useToast();
  const allOpts = [...opts, EVERYONE];
  const activeCohorts = db.cohorts.filter((c) => c.active);
  const current = assignmentsOf(note.id, db.noteAssignments);
  const [books, setBooks] = useState<string[]>([]);
  const [cohorts, setCohorts] = useState<string[]>(activeCohorts.map((c) => c.id));
  const [busy, setBusy] = useState(false);
  const onBooks = booksOf(note, db.noteAssignments, opts);
  const firstBook = onBooks[0]?.book ?? null;
  const [slot, setSlot] = useState(() => (firstBook ? (slotIn(firstBook, note) ?? "") : ""));
  const [title, setTitle] = useState(note.title);
  const [renaming, setRenaming] = useState(false);

  const label = (a: NoteAssignment) =>
    [db.cohorts.find((c) => c.id === a.cohortId)?.name, a.classId ? db.classes.find((c) => c.id === a.classId)?.name : "all classes", a.subjectId ? db.subjects.find((s) => s.id === a.subjectId)?.name : "all subjects"]
      .filter(Boolean)
      .join(" · ");

  async function add() {
    setBusy(true);
    let n = 0;
    try {
      for (const k of books) {
        const o = allOpts.find((x) => x.key === k)!;
        for (const c of cohortsFor(db, o, cohorts)) {
          if (current.some((a) => a.cohortId === c.id && a.classId === o.classId && a.subjectId === o.subjectId)) continue;
          await store.addNoteAssignment(note.id, c.id, o.classId, o.subjectId);
          n++;
        }
      }
      toast(n ? `Now going to ${n} more group${n === 1 ? "" : "s"}.` : "It already goes to all of those.", "success");
      setBooks([]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't assign it.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function rename() {
    const next = (firstBook && slotTitle(firstBook, slot)) || title.trim();
    if (!next || next === note.title || renaming) return;
    setRenaming(true);
    try {
      await store.updateNote(note.id, { title: next });
      setTitle(next);
      toast("Saved.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save that.", "error");
    } finally {
      setRenaming(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={note.title} size="md" footer={<Button onClick={onClose}>Done</Button>}>
      <div className="space-y-6">
        <section>
          <p className="mb-2 text-sm font-semibold text-ink">Goes to now</p>
          {current.length === 0 ? (
            <p className="text-sm text-ink-3">Nobody yet. Students can&apos;t see it.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {current.map((a) => (
                <span key={a.id} className="flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pl-3 text-xs text-ink-2">
                  {label(a)}
                  <button
                    type="button"
                    onClick={() => window.confirm(`Stop showing this note to ${label(a)}?`) && store.deleteNoteAssignment(a.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-ink-3 hover:text-error"
                    aria-label={`Stop showing to ${label(a)}`}
                  >
                    <Icon.Close className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        <section>
          <p className="mb-2 text-sm font-semibold text-ink">Also give it to</p>
          <BookPicker opts={allOpts} picked={books} onToggle={(k) => setBooks(toggle(books, k))} />
          {activeCohorts.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {activeCohorts.map((c) => (
                <Chip key={c.id} on={cohorts.includes(c.id)} onClick={() => setCohorts(toggle(cohorts, c.id))}>
                  {c.name}
                </Chip>
              ))}
            </div>
          )}
          <Button className="mt-3" size="sm" onClick={() => void add()} disabled={!books.length || !cohorts.length || busy} loading={busy}>
            Give it to them
          </Button>
        </section>

        <section>
          <p className="mb-2 text-sm font-semibold text-ink">Where it sits{firstBook ? ` in ${LEVEL_SHORT[firstBook.level]} ${firstBook.subject}` : ""}</p>
          {firstBook ? (
            <SlotSelect book={firstBook} value={slot} onChange={setSlot} label="Chapter" />
          ) : null}
          {(!firstBook || !slot) && <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />}
          <Button className="mt-3" size="sm" variant="secondary" loading={renaming} onClick={() => void rename()}>
            Save
          </Button>
        </section>
      </div>
    </Modal>
  );
}
