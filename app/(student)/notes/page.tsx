"use client";

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAuth } from "@/lib/auth-context";
import { studentById } from "@/lib/data/selectors";
import { EmptyState, Icon, Spinner } from "@/components/ui";
import { useNow } from "@/hooks/useNow";
import { NoteViewer } from "@/components/NoteViewer";
import { cn } from "@/lib/cn";
import { EmptyArt, PageHeader } from "@/components/student/PortalKit";
import { chipClass, segmentGroup, segmentItem } from "@/components/ui/Segmented";
import type { Note, Student } from "@/types";
import { shelvesFor, type Shelf } from "@/lib/note-shelves";
import { DEMO } from "@/lib/demo";
import { LEVEL_SHORT, readPositions, type NotePos } from "@/lib/notes-library";
import { loadPdfJs, pdfPagesText, searchInsideNotes, type NoteHit } from "@/lib/notes-client";

const NEW_MS = 7 * 864e5;
const TAB_KEY = "ht-notes-tab";

/** Suspense wrapper: `useSearchParams` (for `?open=<noteId>`) needs a boundary during prerender. */
export default function StudentNotesPage() {
  return (
    <Suspense fallback={null}>
      <StudentNotes />
    </Suspense>
  );
}

type Opened = {
  id: string;
  title: string;
  page?: number;
  highlight?: string[];
};

function StudentNotes() {
  const db = useDatabase();
  const store = useStore();
  const { session } = useAuth();
  const studentId = session?.studentId;
  const username = (studentId ? studentById(db, studentId)?.username : null) ?? "A student";

  // A note becomes visible the moment it is assigned, even while they sit here.
  useEffect(() => store.subscribeToNotes(), [store]);
  // Warm up the PDF reader while they look around, so the first note opens faster.
  useEffect(() => {
    const id = window.setTimeout(() => void loadPdfJs().catch(() => {}), 1200);
    return () => window.clearTimeout(id);
  }, []);

  const visitLogged = useRef(false);
  const [viewing, setViewing] = useState<Opened | null>(null);
  // `?open=<noteId>&page=<n>` opens that note straight away. Once closed, it stays closed.
  const params = useSearchParams();
  const openId = params.get("open");
  const openPage = Number(params.get("page")) || undefined;
  // `?shelf=<book key>` opens on that subject (from "Read the notes" links on results, Plan and Progress).
  const shelfParam = params.get("shelf") ?? undefined;
  const [closedLinked, setClosedLinked] = useState<string | null>(null);
  const linked = openId && openId !== closedLinked ? db.notes.find((n) => n.id === openId) : undefined;
  const [positions, setPositions] = useState<Record<string, NotePos>>({});
  // Re-read after any note closes (also one opened by a link), so the rows show the new page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositions(readPositions());
  }, [viewing, closedLinked]);

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

  function open(o: Opened) {
    const n = db.notes.find((x) => x.id === o.id);
    store.logActivity({
      type: "notes_downloaded",
      title: `${username} opened "${n?.fileName ?? o.title}"`,
      studentId,
      noteId: o.id,
      link: "/admin/notes",
    });
    // A row that says "Page 14 of 30" opens at page 14. A finished note starts again at page 1.
    const pos = o.page === undefined ? readPositions()[o.id] : undefined;
    setViewing(pos && pos.page > 1 && pos.page < pos.pages ? { ...o, page: pos.page } : o);
  }

  const shown = viewing ?? (linked ? { id: linked.id, title: linked.title, page: openPage } : null);

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
      <Library db={db} student={student} positions={positions} onOpen={open} want={shelfParam} />
      {shown && (
        <NoteViewer
          key={`${shown.id}:${shown.page ?? ""}:${shown.highlight?.join(" ") ?? ""}`}
          noteId={shown.id}
          title={shown.title}
          page={shown.page}
          highlight={shown.highlight}
          onClose={() => {
            setViewing(null);
            setClosedLinked(openId);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

type Db = ReturnType<typeof useDatabase>;
type Placed = { note: Note; chapter: { num: string; name: string } | null };
/** Lay every note this student can read onto their books. */
function useShelves(db: Db, student: Student): Shelf[] {
  return useMemo(() => shelvesFor(db, student), [db, student]);
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function Library({ db, student, positions, onOpen, want }: { db: Db; student: Student; positions: Record<string, NotePos>; onOpen: (o: Opened) => void; want?: string }) {
  const shelves = useShelves(db, student);
  const nowMs = useNow();
  const [tab, setTab] = useState<string>("");
  // A tab they tap wins over the linked one; the linked one wins over the remembered one.
  const [picked, setPicked] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTab(localStorage.getItem(TAB_KEY) ?? "");
    } catch {}
  }, []);
  const pick = (k: string) => {
    setPicked(k);
    setTab(k);
    try {
      localStorage.setItem(TAB_KEY, k);
    } catch {}
  };

  const readable = useMemo(() => {
    const m = new Map<string, Placed & { shelf: Shelf }>();
    for (const s of shelves) {
      for (const [slot, list] of s.byChapter) {
        const unit = slot.startsWith("U") ? s.book?.units.find((u) => `U${u.num}` === slot) : undefined;
        const chapter = unit
          ? { num: `Unit ${unit.num}`, name: unit.name }
          : {
              num: slot,
              name: s.book?.units.flatMap((u) => u.chapters).find(([n]) => n === slot)?.[1] ?? "",
            };
        for (const n of list) if (!m.has(n.id)) m.set(n.id, { note: n, chapter, shelf: s });
      }
      for (const n of s.more) if (!m.has(n.id)) m.set(n.id, { note: n, chapter: null, shelf: s });
    }
    return m;
  }, [shelves]);

  // "For everyone" notes sit under every subject instead of taking a tab of their own.
  const general = shelves.find((s) => s.key === "general");
  const books = shelves.filter((s) => s.key !== "general");
  const active = books.find((s) => s.key === (picked ?? (want && books.some((b) => b.key === want) ? want : tab))) ?? books[0] ?? general!;
  const ready = readable.size;

  // The note they were last reading, if it's still theirs.
  const resume = Object.entries(positions)
    .filter(([id, p]) => readable.has(id) && p.page > 1 && p.page < p.pages && nowMs - p.at < 45 * 864e5)
    .sort((a, b) => b[1].at - a[1].at)[0];

  if (!shelves.length) {
    return (
      <>
        <Header ready={0} />
        <EmptyState icon={<Icon.Doc />} art={<EmptyArt name="empty-no-notes-yet" />} title="No notes yet" message="Your chapters show up here, in the order I teach them." />
      </>
    );
  }

  return (
    <div className="rise">
      <Header ready={ready} />
      <SearchBox value={query} onChange={setQuery} />
      {query.trim().length >= 2 ? (
        <SearchResults q={query.trim()} readable={readable} onOpen={onOpen} nowMs={nowMs} />
      ) : (
        <>
          {resume &&
            (() => {
              const r = readable.get(resume[0])!;
              const p = resume[1];
              return (
                <button
                  type="button"
                  onClick={() => onOpen({ id: r.note.id, title: r.note.title, page: p.page })}
                  className="surface surface-link mb-10 flex w-full items-center gap-4 rounded-card p-5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-6"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-3">Continue reading</span>
                    <span className="mt-1 block truncate text-base font-semibold text-ink">{r.chapter ? r.chapter.name : r.note.title}</span>
                    <span className="mt-2 flex items-center gap-3">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-ink-2"
                          style={{
                            width: `${Math.round((p.page / p.pages) * 100)}%`,
                          }}
                        />
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-ink-3">
                        Page {p.page} of {p.pages}
                      </span>
                    </span>
                  </span>
                  <Icon.ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
                </button>
              );
            })()}

          {books.length > 1 &&
            (books.length <= 3 ? (
              // Two or three subjects: one segmented control, like iOS.
              <div role="tablist" aria-label="Subjects" className={cn(segmentGroup, "mb-8 w-full")}>
                {books.map((s) => (
                  <button
                    key={s.key}
                    role="tab"
                    aria-selected={active.key === s.key}
                    onClick={() => pick(s.key)}
                    className={cn(segmentItem(active.key === s.key), "min-w-0 flex-1 basis-0")}
                  >
                    <span className="min-w-0 truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div role="tablist" aria-label="Subjects" className="-mx-5 mb-8 flex gap-2 overflow-x-auto px-5 pb-1 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {books.map((s) => (
                  <button
                    key={s.key}
                    role="tab"
                    aria-selected={active.key === s.key}
                    onClick={() => pick(s.key)}
                    className={chipClass(active.key === s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ))}

          <ShelfView shelf={active} positions={positions} nowMs={nowMs} onOpen={onOpen} />
          {general && general !== active && general.more.length > 0 && (
            <div className="mt-10">
              <ShelfView shelf={{ ...general, label: "For everyone" }} positions={positions} nowMs={nowMs} onOpen={onOpen} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Header({ ready }: { ready: number }) {
  return (
    <div className="mb-6">
      <PageHeader title="Notes">{ready ? "Every chapter, in the order I teach it." : "Your chapters, in the order I teach them."}</PageHeader>
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div role="search" className="relative mb-6">
      <Icon.Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
      <label htmlFor="notes-q" className="sr-only">
        Search your notes
      </label>
      <input
        id="notes-q"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search inside your notes"
        autoComplete="off"
        enterKeyHint="search"
        className="h-12 w-full rounded-full border border-field bg-surface pl-12 pr-11 text-base text-ink placeholder:text-ink-3 transition-colors duration-150 hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-3 hover:text-ink"
        >
          <Icon.Close className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function ShelfView({ shelf, positions, nowMs, onOpen }: { shelf: Shelf; positions: Record<string, NotePos>; nowMs: number; onOpen: (o: Opened) => void }) {
  const book = shelf.book;
  const total = book ? book.units.reduce((n, u) => n + u.chapters.length, 0) : 0;
  // A chapter is ready when it has its own note, or its whole unit is in one note.
  const covered = (u: { num: string }, c: string) => shelf.byChapter.has(c) || shelf.byChapter.has(`U${u.num}`);
  const out = book ? book.units.reduce((n, u) => n + u.chapters.filter(([c]) => covered(u, c)).length, 0) : 0;
  // Units with nothing out yet start folded, so the page stays short.
  const [openUnits, setOpenUnits] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-4">
      {book && (
        <div className="flex items-center justify-between gap-3 pb-1">
          <h2 className="min-w-0 truncate text-xl font-bold leading-tight tracking-[-0.015em] text-ink">
            {LEVEL_SHORT[book.level]} {book.subject}
          </h2>
          <span className="shrink-0 text-sm tabular-nums text-ink-3">
            {out} of {total} ready
          </span>
        </div>
      )}

      {book?.units.map((u) => {
        const unitNotes = shelf.byChapter.get(`U${u.num}`) ?? [];
        const ready = u.chapters.filter(([c]) => covered(u, c)).length;
        const has = ready > 0;
        const isOpen = openUnits[u.num] ?? has;
        return (
          <section key={u.num} aria-labelledby={`u-${shelf.key}-${u.num}`} className="surface overflow-hidden rounded-card">
            <h3 id={`u-${shelf.key}-${u.num}`}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenUnits((m) => ({ ...m, [u.num]: !isOpen }))}
                className="row-link flex min-h-16 w-full items-center gap-3 px-5 py-4 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink-3">
                    Unit {u.num} · {!has ? "Coming soon" : ready === u.chapters.length ? "All ready" : `${ready} of ${u.chapters.length} ready`}
                  </span>
                  <span className={cn("mt-0.5 block text-lg font-semibold leading-snug", has ? "text-ink" : "text-ink-2")}>{u.name}</span>
                </span>
                <Icon.ChevronRight className={cn("h-5 w-5 shrink-0 text-ink-3 transition-transform duration-200 ease-[var(--ease-out)]", isOpen && "rotate-90")} />
              </button>
            </h3>
            {isOpen && (
              <ul className="ml-5 divide-y divide-hairline border-t border-hairline">
                {unitNotes.map((n) => (
                  <li key={n.id}>
                    <NoteRow
                      inset
                      num="All"
                      title={`The whole unit: ${u.name}`}
                      note={n}
                      pos={positions[n.id]}
                      fresh={nowMs - new Date(n.createdAt).getTime() < NEW_MS}
                      onOpen={() => onOpen({ id: n.id, title: n.title })}
                    />
                  </li>
                ))}
                {u.chapters.map(([num, name]) => {
                  const notes = shelf.byChapter.get(num);
                  if (!notes && unitNotes.length)
                    return (
                      <li key={num}>
                        <button
                          type="button"
                          onClick={() =>
                            onOpen({
                              id: unitNotes[0].id,
                              title: unitNotes[0].title,
                            })
                          }
                          className="row-link -ml-5 flex min-h-12 w-[calc(100%+1.25rem)] items-center gap-3 py-2.5 pl-5 pr-5 text-left focus-visible:bg-surface-2 focus-visible:outline-none"
                        >
                          <span className="w-10 shrink-0 text-sm tabular-nums text-ink-3">{num}</span>
                          <span className="min-w-0 flex-1 text-base leading-snug text-ink-2">{name}</span>
                          <span className="shrink-0 text-sm text-ink-3">In unit notes</span>
                        </button>
                      </li>
                    );
                  if (!notes)
                    return (
                      <li key={num} className="flex min-h-12 items-center gap-3 py-2.5 pr-5 text-ink-3">
                        <span className="w-10 shrink-0 text-sm tabular-nums opacity-70">{num}</span>
                        <span className="min-w-0 flex-1 text-base leading-snug opacity-70">{name}</span>
                        <span className="shrink-0 text-sm">Soon</span>
                      </li>
                    );
                  return notes.map((n, k) => (
                    <li key={n.id}>
                      <NoteRow
                        inset
                        num={k === 0 ? num : ""}
                        title={k === 0 ? name : n.title}
                        note={n}
                        pos={positions[n.id]}
                        fresh={nowMs - new Date(n.createdAt).getTime() < NEW_MS}
                        onOpen={() => onOpen({ id: n.id, title: n.title })}
                      />
                    </li>
                  ));
                })}
              </ul>
            )}
          </section>
        );
      })}

      {shelf.more.length > 0 && (
        <section aria-labelledby={`more-${shelf.key}`}>
          <h3 id={`more-${shelf.key}`} className="mb-2 text-sm font-semibold text-ink-3">
            {book ? "More notes" : shelf.label}
          </h3>
          <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
            {shelf.more.map((n) => (
              <li key={n.id}>
                <NoteRow
                  num=""
                  title={n.title}
                  note={n}
                  pos={positions[n.id]}
                  fresh={nowMs - new Date(n.createdAt).getTime() < NEW_MS}
                  onOpen={() => onOpen({ id: n.id, title: n.title })}
                  showDate
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function kind(type: string) {
  if (type.includes("pdf")) return null;
  if (type.startsWith("image/")) return "Image";
  if (type.includes("presentation") || type.includes("powerpoint")) return "Slides";
  if (type.includes("sheet") || type.includes("excel")) return "Spreadsheet";
  if (type.includes("word") || type.includes("document")) return "Word";
  return "File";
}

function NoteRow({
  num,
  title,
  note,
  pos,
  fresh,
  onOpen,
  showDate,
  inset,
}: {
  num: string;
  title: string;
  note: Note;
  pos?: NotePos;
  fresh: boolean;
  onOpen: () => void;
  showDate?: boolean;
  /** Inside a unit's list, which is already indented. */
  inset?: boolean;
}) {
  const k = kind(note.fileType);
  const done = pos && pos.page >= pos.pages;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Read ${title}`}
      className={cn(
        "row-link flex min-h-14 w-full items-center gap-3 py-3 pr-5 text-left focus-visible:bg-surface-2 focus-visible:outline-none",
        inset ? "" : "pl-5",
      )}
    >
      {num !== "" || !showDate ? <span className="w-10 shrink-0 text-sm font-semibold tabular-nums text-ink-3">{num}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-base font-semibold leading-snug text-ink">{title}</span>
        {(showDate || fresh || k || pos) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-3">
            {showDate && <span>{fmtDate(note.createdAt)}</span>}
            {k && <span>{k}</span>}
            {pos && !done && (
              <span>
                Page {pos.page} of {pos.pages}
              </span>
            )}
            {done && (
              <span className="inline-flex items-center gap-1 text-success">
                <Icon.Check className="h-4 w-4" /> Read
              </span>
            )}
            {fresh && <span className="rounded-full bg-surface-2 px-2 py-px text-xs font-semibold text-ink">New</span>}
          </span>
        )}
      </span>
      <Icon.ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
    </button>
  );
}

/* ------------------------------------------------------------------------ */

/** Bold the searched words inside a snippet. */
function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-[3px] bg-brand-soft px-0.5 font-semibold text-ink">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

type Readable = Map<string, Placed & { shelf: Shelf }>;

function SearchResults({ q, readable, onOpen, nowMs }: { q: string; readable: Readable; onOpen: (o: Opened) => void; nowMs: number }) {
  const terms = useMemo(
    () =>
      [
        ...new Set(
          q
            .toLowerCase()
            .split(/[^a-z0-9']+/)
            .filter((w) => w.length >= 2),
        ),
      ].slice(0, 6),
    [q],
  );
  const [state, setState] = useState<{
    q: string;
    hits: NoteHit[];
    more: boolean;
    error?: string;
  } | null>(null);

  // Chapter names and titles: instant, on this phone.
  const titleHits = [...readable.values()].filter(({ note, chapter }) => {
    const hay = `${chapter ? `${chapter.num} ${chapter.name}` : ""} ${note.title}`.toLowerCase();
    return terms.length > 0 && terms.every((t) => hay.includes(t));
  });

  // Inside the notes: asked of the server a moment after they stop typing.
  useEffect(() => {
    if (!terms.length) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(() => {
      void (DEMO ? demoSearch(q, terms, [...readable.keys()]) : searchInsideNotes(q, ctrl.signal))
        .then((r) =>
          setState({
            q,
            ...r,
            hits: r.hits.filter((h) => readable.has(h.noteId)),
          }),
        )
        .catch((e) => {
          if (!ctrl.signal.aborted)
            setState({
              q,
              hits: [],
              more: false,
              // Our own messages read well; a dropped connection's raw "Failed to fetch" does not.
              error: e instanceof Error && !(e instanceof TypeError) ? e.message : "Search didn't work. Check your internet and try again.",
            });
        });
    }, 350);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q, terms, readable]);

  const loading = !state || state.q !== q;
  const groups = new Map<string, NoteHit[]>();
  if (!loading) for (const h of state.hits) groups.set(h.noteId, [...(groups.get(h.noteId) ?? []), h]);
  const name = (id: string) => {
    const r = readable.get(id);
    return r?.chapter ? `${r.chapter.num} ${r.chapter.name}` : (r?.note.title ?? "Note");
  };

  return (
    <div className="space-y-7" aria-live="polite">
      {titleHits.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold leading-tight tracking-[-0.015em] text-ink">Chapters</h2>
          <ul className="surface divide-y divide-hairline overflow-hidden rounded-card">
            {titleHits.slice(0, 8).map(({ note, chapter, shelf }) => (
              <li key={note.id}>
                <NoteRow
                  num={chapter?.num ?? ""}
                  title={chapter ? chapter.name : note.title}
                  note={note}
                  fresh={nowMs - new Date(note.createdAt).getTime() < NEW_MS}
                  onOpen={() => onOpen({ id: note.id, title: note.title })}
                />
                <span className="sr-only">{shelf.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xl font-bold leading-tight tracking-[-0.015em] text-ink">Inside your notes</h2>
        {loading ? (
          <p className="flex items-center gap-2 py-4 text-base text-ink-2">
            <Spinner size={16} /> Searching every page…
          </p>
        ) : state.error ? (
          <p className="py-4 text-base text-ink-2">{state.error}</p>
        ) : groups.size === 0 ? (
          <p className="py-4 text-base text-ink-2">Nothing inside your notes says &ldquo;{q}&rdquo;. Try a shorter word, like the key term on its own.</p>
        ) : (
          <ul className="space-y-3">
            {[...groups].map(([id, hits]) => (
              <li key={id} className="surface overflow-hidden rounded-card">
                <p className="border-b border-hairline px-5 py-3.5 text-base font-semibold leading-snug text-ink">
                  {name(id)}
                  <span className="ml-2 text-sm font-medium text-ink-3">{readable.get(id)?.shelf.label}</span>
                </p>
                <ul className="divide-y divide-hairline">
                  {hits.map((h) => (
                    <li key={h.page}>
                      <button
                        type="button"
                        onClick={() =>
                          onOpen({
                            id,
                            title: readable.get(id)?.note.title ?? "Note",
                            page: h.page,
                            highlight: terms,
                          })
                        }
                        className="row-link flex w-full gap-3 px-5 py-3.5 text-left focus-visible:bg-surface-2 focus-visible:outline-none"
                      >
                        <span className="w-16 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-ink-3">Page {h.page}</span>
                        <span className="min-w-0 flex-1 text-base leading-relaxed text-ink-2">
                          <Marked text={h.snippet} terms={terms} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
        {!loading && state.more && <p className="mt-3 text-sm text-ink-3">Showing the best matches. Add another word to narrow it down.</p>}
      </section>
    </div>
  );
}

/** Preview only: search the sample PDF as if it were the first note. */
let demoPages: Promise<string[]> | null = null;
async function demoSearch(q: string, terms: string[], ids: string[]): Promise<{ hits: NoteHit[]; more: boolean }> {
  demoPages ??= pdfPagesText("/demo/note.pdf").catch(() => []);
  const pages = await demoPages;
  const hits: NoteHit[] = [];
  pages.forEach((p, i) => {
    const flat = p.replace(/\s+/g, " ");
    const low = flat.toLowerCase();
    if (!terms.every((t) => low.includes(t))) return;
    const at = low.indexOf(terms[0]);
    hits.push({
      noteId: ids[0],
      page: i + 1,
      snippet: `…${flat.slice(Math.max(0, at - 70), at + 130)}…`,
    });
  });
  return { hits: hits.slice(0, 4), more: false };
}
