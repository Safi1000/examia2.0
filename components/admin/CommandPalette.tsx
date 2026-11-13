"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDatabase } from "@/lib/data/store";
import { displayName, isTestAccount } from "@/lib/display-name";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Search and quick actions for the teacher console: a small widget in the top
 * bar, opened by a tap or by Cmd/Ctrl + K. One box finds a page, a student or
 * a test, and the things done most often are one key away. Arrow keys move,
 * Enter opens, Escape closes.
 */
type Row = { key: string; group: "Do" | "Go to" | "Students" | "Tests"; label: string; hint?: string; href: string; words: string };

const ACTIONS: Array<Omit<Row, "key" | "group" | "words">> = [
  { label: "Set homework from past papers", href: "/admin/assignments?set=papers" },
  { label: "Mark attendance", href: "/admin/attendance" },
  { label: "Start marking", href: "/admin/submissions" },
  { label: "Add or import students", href: "/admin/roster" },
  { label: "Post an announcement", href: "/admin/announcements" },
  { label: "Open the whiteboard", href: "/admin/whiteboard" },
];

const PAGES: Array<[string, string]> = [
  ["Today", "/admin/today"],
  ["Classes", "/admin/classes"],
  ["Recordings", "/admin/recordings"],
  ["Whiteboard", "/admin/whiteboard"],
  ["Tests", "/admin/tests"],
  ["Submissions", "/admin/submissions"],
  ["Homework", "/admin/assignments"],
  ["Notes", "/admin/notes"],
  ["Roster", "/admin/roster"],
  ["Attendance", "/admin/attendance"],
  ["Announcements", "/admin/announcements"],
  ["Question bank", "/admin/bank"],
  ["Activity", "/admin/activity"],
  ["Analytics", "/admin/analytics"],
  ["Cohorts", "/admin/cohorts"],
  ["Export", "/admin/export"],
  ["Settings", "/admin/settings"],
];

export function CommandPalette() {
  const db = useDatabase();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const opener = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const show = () => {
    setQuery("");
    setAt(0);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    opener.current?.focus();
  };

  // Cmd/Ctrl + K from anywhere in the console.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setAt(0);
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const all = useMemo<Row[]>(() => {
    const off = new Set(db.cohorts.filter((c) => !c.active).map((c) => c.id));
    return [
      ...ACTIONS.map((a) => ({ ...a, key: `do:${a.href}`, group: "Do" as const, words: a.label.toLowerCase() })),
      ...PAGES.map(([label, href]) => ({ key: `go:${href}`, group: "Go to" as const, label, href, words: label.toLowerCase() })),
      ...db.students
        .filter((s) => !off.has(s.cohortId) && !isTestAccount(s))
        .map((s) => ({ key: `s:${s.id}`, group: "Students" as const, label: displayName(s.username), hint: s.username, href: `/admin/roster/${s.id}`, words: `${displayName(s.username)} ${s.username}`.toLowerCase() })),
      ...db.tests
        .filter((t) => !t.cohortId || !off.has(t.cohortId))
        .map((t) => ({ key: `t:${t.id}`, group: "Tests" as const, label: t.title, hint: t.subject, href: `/admin/tests/${t.id}`, words: `${t.title} ${t.subject}`.toLowerCase() })),
    ];
  }, [db.students, db.tests, db.cohorts]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Nothing typed: the quick actions and the pages. Typing searches everything, every word must match.
    if (!q) return all.filter((r) => r.group === "Do" || r.group === "Go to");
    const parts = q.split(/\s+/);
    return all.filter((r) => parts.every((p) => r.words.includes(p))).slice(0, 30);
  }, [all, query]);
  const cur = Math.min(at, Math.max(0, rows.length - 1));

  const go = (r: Row | undefined) => {
    if (!r) return;
    setOpen(false);
    router.push(r.href);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return close();
    if (e.key === "Enter") return go(rows[cur]);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = rows.length ? (cur + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length : 0;
    setAt(next);
    list.current?.querySelector(`[data-i="${next}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const onPick = (e: React.MouseEvent<HTMLButtonElement>) => go(rows[Number(e.currentTarget.dataset.i)]);
  const onHover = (e: React.MouseEvent<HTMLButtonElement>) => setAt(Number(e.currentTarget.dataset.i));

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        aria-label="Search and quick actions"
        className="flex h-10 items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] pl-3 pr-2 text-sm text-ink-3 transition-colors hover:border-white/[0.14] hover:text-ink-2 max-md:h-11 max-md:w-11 max-md:justify-center max-md:p-0"
      >
        <Icon.Search className="h-4 w-4" />
        <span className="max-md:hidden">Search</span>
        <kbd className="ml-3 rounded-md border border-white/[0.1] px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink-3 max-md:hidden">⌘K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12dvh]" role="dialog" aria-modal="true" aria-label="Search and quick actions">
          <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={close} aria-hidden />
          <div className="relative flex max-h-[70dvh] w-full max-w-xl animate-scale-in flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-surface/[0.93] shadow-[var(--shadow-lg)] backdrop-blur-2xl">
            <div className="flex items-center gap-3 border-b border-white/[0.08] px-4">
              <Icon.Search className="h-[18px] w-[18px] shrink-0 text-ink-3" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setAt(0);
                }}
                onKeyDown={onKeyDown}
                placeholder="Find a student, a test or a page"
                aria-label="Search"
                className="h-14 w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
              />
              <kbd className="rounded-md border border-white/[0.1] px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink-3">Esc</kbd>
            </div>
            <ul ref={list} className="flex-1 overflow-y-auto overscroll-contain p-2">
              {rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">Nothing matches that.</li>}
              {rows.map((r, i) => (
                <li key={r.key}>
                  {(i === 0 || rows[i - 1].group !== r.group) && <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.16em] text-ink-3 first:pt-1">{r.group}</p>}
                  <button
                    type="button"
                    data-i={i}
                    onClick={onPick}
                    onMouseMove={onHover}
                    className={cn("flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] px-3 text-left text-sm font-semibold transition-colors", i === cur ? "bg-white/[0.08] text-ink" : "text-ink-2")}
                  >
                    <span className="truncate">{r.label}</span>
                    {r.hint ? <span className="shrink-0 truncate text-xs font-normal text-ink-3">{r.hint}</span> : i === cur && <Icon.ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
