"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAuth } from "@/lib/auth-context";
import { studentById } from "@/lib/data/selectors";
import { EmptyState, Icon } from "@/components/ui";
import { useNow } from "@/hooks/useNow";
import { NoteViewer } from "@/components/NoteViewer";
import { cn } from "@/lib/cn";
import type { Note } from "@/types";

/** Short file type for the little tile, and its tint. */
function fileKind(type: string): { label: string; tint: string } {
  if (type.includes("pdf")) return { label: "PDF", tint: "#e0705f" };
  if (type.startsWith("image/")) return { label: "IMG", tint: "#7fc19c" };
  if (type.includes("presentation") || type.includes("powerpoint")) return { label: "PPT", tint: "#e59a4c" };
  if (type.includes("sheet") || type.includes("excel")) return { label: "XLS", tint: "#5fb27f" };
  if (type.includes("word") || type.includes("document")) return { label: "DOC", tint: "#6f9fe0" };
  return { label: "FILE", tint: "#9aa1a8" };
}

const NEW_MS = 4 * 864e5;
const PREVIEW = 4; // notes per subject on the All tab before "See all"

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

  const nowMs = useNow();
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
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
  // can access. We still filter locally to know each note's subject.
  const accessibleAssignments = db.noteAssignments.filter((na) => {
    if (na.cohortId !== student.cohortId) return false;
    if (na.classId && !student.classIds.includes(na.classId)) return false;
    if (na.subjectId && !student.subjectIds.includes(na.subjectId)) return false;
    return true;
  });
  const shown = viewing ?? (linked ? { id: linked.id, title: linked.title } : null);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <NotesList
        notes={db.notes}
        assignments={accessibleAssignments}
        subjects={db.subjects}
        classes={db.classes}
        mySubjects={student.subjectIds}
        myLevels={student.classIds}
        nowMs={nowMs}
        tab={tab}
        setTab={setTab}
        query={query}
        setQuery={setQuery}
        onOpen={onOpen}
      />
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

type Group = { key: string; name: string; color: string; notes: Note[] };

/**
 * The list itself: a tab per subject (only when there is more than one),
 * newest first, and on "All" a short run of each subject with "See all".
 * Search appears once there are enough notes to need it.
 */
function NotesList({
  notes,
  assignments,
  subjects,
  classes,
  mySubjects,
  myLevels,
  nowMs,
  tab,
  setTab,
  query,
  setQuery,
  onOpen,
}: {
  notes: Note[];
  assignments: Array<{ noteId: string; classId: string | null; subjectId: string | null }>;
  subjects: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; name: string }>;
  mySubjects: string[];
  myLevels: string[];
  nowMs: number;
  tab: string;
  setTab: (t: string) => void;
  query: string;
  setQuery: (q: string) => void;
  onOpen: (id: string, title: string, fileName: string) => void;
}) {
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    const add = (key: string, name: string, color: string, n: Note) => {
      const g = map.get(key) ?? { key, name, color, notes: [] };
      if (!g.notes.includes(n)) g.notes.push(n);
      map.set(key, g);
    };
    for (const n of notes) {
      const mine = assignments.filter((a) => a.noteId === n.id);
      if (!mine.length) continue;
      for (const a of mine) {
        if (a.subjectId) {
          const i = subjects.findIndex((s) => s.id === a.subjectId);
          add(a.subjectId, subjects[i]?.name ?? "Other", `var(--color-cohort-${(Math.max(0, i) % 12) + 1})`, n);
        } else add("general", "For everyone", "var(--color-ink-3)", n);
      }
    }
    for (const g of map.values()) g.notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // Their own subjects in their order, then anything else, then "For everyone".
    const rank = (g: Group) => (g.key === "general" ? 1e6 : mySubjects.includes(g.key) ? mySubjects.indexOf(g.key) : 1e3);
    return [...map.values()].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [notes, assignments, subjects, mySubjects]);

  const total = new Set(groups.flatMap((g) => g.notes.map((n) => n.id))).size;
  const active = groups.find((g) => g.key === tab) ? tab : "all";
  const q = query.trim().toLowerCase();
  const match = (n: Note) => !q || n.title.toLowerCase().includes(q) || n.fileName.toLowerCase().includes(q);
  // Their level, only worth showing when they're in more than one (AS and A2).
  const levelOf = (n: Note) => {
    if (myLevels.length < 2) return undefined;
    const c = assignments.find((a) => a.noteId === n.id && a.classId)?.classId;
    return c ? classes.find((x) => x.id === c)?.name : undefined;
  };

  if (!total) {
    return (
      <>
        <Header total={0} />
        <EmptyState icon={<Icon.Doc />} title="No notes yet" message="Notes from class show up here, by subject." />
      </>
    );
  }

  const visible = active === "all" ? groups : groups.filter((g) => g.key === active);
  const searching = !!q;

  return (
    <>
      <Header total={total} />
      {groups.length > 1 && (
        <div role="tablist" aria-label="Subjects" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ key: "all", name: "All", color: "", count: total }, ...groups.map((g) => ({ key: g.key, name: g.name, color: g.color, count: g.notes.length }))].map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={active === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors",
                active === t.key ? "border-brand bg-brand-soft text-ink" : "border-border text-ink-2 hover:border-border-strong hover:text-ink",
              )}
            >
              {t.color && <span className="h-2 w-2 rounded-full" style={{ background: t.color }} aria-hidden />}
              {t.name}
              <span className="text-xs font-medium text-ink-3">{t.count}</span>
            </button>
          ))}
        </div>
      )}
      {total >= 8 && (
        <label className="relative mb-5 block">
          <Icon.Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
            className="h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
          />
        </label>
      )}

      <div className="space-y-7">
        {visible.map((g) => {
          const list = g.notes.filter(match);
          if (!list.length) return null;
          const cut = active === "all" && !searching && list.length > PREVIEW;
          return (
            <section key={g.key} aria-labelledby={`notes-${g.key}`}>
              {(active === "all" || groups.length === 1) && (
                <div className="mb-2.5 flex items-baseline justify-between gap-3">
                  <h2 id={`notes-${g.key}`} className="flex items-center gap-2 text-base font-semibold text-ink">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: g.color }} aria-hidden />
                    {g.name}
                  </h2>
                  {cut && (
                    <button type="button" onClick={() => setTab(g.key)} className="text-sm font-semibold text-brand hover:underline">
                      See all {list.length}
                    </button>
                  )}
                </div>
              )}
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {(cut ? list.slice(0, PREVIEW) : list).map((n) => {
                  const k = fileKind(n.fileType);
                  const fresh = nowMs - new Date(n.createdAt).getTime() < NEW_MS;
                  const level = levelOf(n);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => onOpen(n.id, n.title, n.fileName)}
                        className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                        aria-label={`Read ${n.title}`}
                      >
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[10px] font-bold tracking-wider"
                          style={{ background: `color-mix(in srgb, ${k.tint} 16%, transparent)`, color: k.tint }}
                          aria-hidden
                        >
                          {k.label}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink">{n.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                            <span>{new Date(n.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                            {level && <span>· {level}</span>}
                            {fresh && <span className="rounded-full bg-brand-soft px-2 py-px font-semibold text-brand">New</span>}
                          </span>
                        </span>
                        <Icon.ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {searching && !visible.some((g) => g.notes.some(match)) && <p className="py-8 text-center text-sm text-ink-3">No notes match &ldquo;{query.trim()}&rdquo;.</p>}
      </div>
    </>
  );
}

function Header({ total }: { total: number }) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-2xl font-bold text-ink">Notes</h1>
      <p className="mt-1 text-sm text-ink-3">{total ? `${total} from class, newest first. Tap one to read it.` : "Class notes and handouts from me."}</p>
    </div>
  );
}
