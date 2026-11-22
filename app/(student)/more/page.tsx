"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { studentById } from "@/lib/data/selectors";
import { displayName } from "@/lib/display-name";
import { waTextLink } from "@/lib/landing";
import { NavIcon } from "@/components/nav/NavIcons";
import { Button, Icon } from "@/components/ui";
import { PageHeader } from "@/components/student/PortalKit";

/**
 * More (phones, Nov 2026, to match the phone app's More tab): a short
 * directory with a "Find anything" search that knows the simple words a
 * student would type ("marks" finds Progress, "pdf" finds Past papers,
 * "timer" finds Focus). Reference: mobile-1.2 src/lib/more-directory.ts.
 */

type IconC = (p: { active?: boolean; className?: string }) => React.ReactNode;

type DirRow = {
  id: string;
  title: string;
  detail: string;
  words: string[];
  href?: string;
  external?: boolean;
  Icon: IconC;
  /** Only listed when a search finds it (pages already in the bar). */
  searchOnly?: boolean;
};

function ChatIcon({ className }: { active?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z" />
    </svg>
  );
}

const ROWS: DirRow[] = [
  { id: "papers", title: "Past papers", detail: "Every paper with answers", href: "/past-papers", Icon: NavIcon.Tasks, words: ["paper", "pdf", "past", "pastpaper", "pp", "question paper", "ms", "cambridge", "written"] },
  { id: "practice", title: "Practice", detail: "Past paper questions by topic", href: "/past-papers/topics", Icon: NavIcon.Today, words: ["mcq", "questions", "quiz", "revise", "drill", "topical", "topic", "mistakes"] },
  { id: "progress", title: "Progress", detail: "Marks, grades and attendance", href: "/progress", Icon: NavIcon.Progress, words: ["marks", "mark", "grade", "grades", "report", "score", "scores", "result", "results", "how am i doing", "attendance", "medal", "medals", "badge"] },
  { id: "classes", title: "Classes timetable", detail: "Your classes and recordings", href: "/classes", Icon: NavIcon.Classes, words: ["class", "timetable", "live", "meet", "zoom", "lesson", "lessons", "recording", "recordings", "schedule", "join"] },
  { id: "notifications", title: "Notifications", detail: "New tests, notes and results", href: "/notifications", Icon: NavIcon.Megaphone, words: ["bell", "alerts", "alert", "inbox", "updates", "notice", "notices", "announcement", "news"] },
  { id: "settings", title: "Settings", detail: "Account, avatar and reminders", href: "/settings", Icon: NavIcon.Settings, words: ["setting", "account", "password", "avatar", "picture", "photo", "face", "dp", "profile", "reminders", "target", "targets", "privacy"] },
  { id: "help", title: "Help and contact", detail: "Message Hamza on WhatsApp", external: true, Icon: ChatIcon, words: ["help", "contact", "whatsapp", "message", "support", "problem", "call", "hamza"] },
  // The pages in the bar: shown only while searching, so "homework" or "timer" still finds its place.
  { id: "home", title: "Home", detail: "Your next step", href: "/dashboard", Icon: NavIcon.Home, words: ["start", "today", "main"], searchOnly: true },
  { id: "study", title: "Study", detail: "Your tests and homework", href: "/study", Icon: NavIcon.Tests, words: ["test", "tests", "quiz", "exam", "homework", "assignment", "assignments", "task", "due", "late", "submit", "hw"], searchOnly: true },
  { id: "tests", title: "All tests", detail: "Every test, open and past", href: "/tests", Icon: NavIcon.Tests, words: ["test", "tests", "exam", "quiz"], searchOnly: true },
  { id: "homework", title: "All homework", detail: "Every piece of homework", href: "/assignments", Icon: NavIcon.Assignments, words: ["homework", "assignment", "assignments", "hw", "submit", "hand in"], searchOnly: true },
  { id: "focus", title: "Focus", detail: "The gold timer in the middle of the bar", href: "/groundwork", Icon: NavIcon.Groundwork, words: ["timer", "pomodoro", "study time", "clock", "concentrate", "stopwatch", "block"], searchOnly: true },
  { id: "notes", title: "Notes", detail: "Notes from every class", href: "/notes", Icon: NavIcon.Notes, words: ["note", "notes", "reading", "chapter", "chapters", "slides", "handout"], searchOnly: true },
  { id: "plan", title: "My plan", detail: "What each week is for, up to your exams", href: "/plan", Icon: NavIcon.Plan, words: ["plan", "week", "revision", "exam date", "countdown"], searchOnly: true },
];

/** Lower case, accents and punctuation gone, spaces squeezed. */
function normal(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const split = (s: string) => normal(s).split(" ").filter(Boolean);

/**
 * How well a row answers what was typed (0: not at all). Every typed word has
 * to start a word the row is known by ("mar" finds "marks"); plurals are
 * forgiven. A word in the name counts most, then the row's other words, then its line.
 */
function score(row: DirRow, query: string): number {
  const tokens = split(query);
  if (!tokens.length) return row.searchOnly ? 0 : 1;
  const title = split(row.title);
  const words = row.words.flatMap(split);
  const detail = split(row.detail);
  let total = 0;
  for (const t of tokens) {
    const stem = t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t;
    const exact = (w: string) => w === t || w === stem || (w.endsWith("s") && w.slice(0, -1) === stem);
    const starts = (w: string) => w.startsWith(t) || (stem !== t && w.startsWith(stem));
    let best = 0;
    if (title.some(exact) || words.some(exact)) best = 6;
    else if (title.some(starts)) best = 5;
    else if (words.some(starts)) best = 3;
    else if (detail.some(starts)) best = 1;
    if (!best) return 0;
    total += best;
  }
  return total;
}

const rowClass =
  "row-link flex min-h-[60px] w-full items-center gap-4 px-5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:px-6";

export default function MorePage() {
  const { session, logout } = useAuth();
  const router = useRouter();
  const db = useDatabase();
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState(false);
  const student = session?.studentId ? studentById(db, session.studentId) : null;

  const rows = useMemo(() => {
    const scored = ROWS.map((r, i) => ({ r, i, s: score(r, query) })).filter((x) => x.s > 0);
    scored.sort((a, b) => b.s - a.s || a.i - b.i);
    return scored.map((x) => x.r);
  }, [query]);

  if (!student) return null;
  const name = displayName(student.username);
  const searching = normal(query).length > 0;
  const signOut = () => {
    logout();
    router.replace("/login");
  };

  return (
    <div className="mx-auto max-w-3xl px-5 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-6">
        <PageHeader title="More">Everything else in your portal.</PageHeader>

        <div role="search" className="relative">
          <label htmlFor="more-search" className="sr-only">
            Find anything
          </label>
          <Icon.Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
          <input
            id="more-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find anything"
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 w-full rounded-full border border-hairline bg-surface pl-12 pr-4 text-base text-ink placeholder:text-ink-3 outline-none transition-colors focus-visible:border-hairline-strong focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>

        {rows.length > 0 ? (
          <ul className="surface divide-y divide-hairline overflow-hidden rounded-card" aria-label={searching ? "Search results" : "Pages"}>
            {rows.map((r) => {
              const body = (
                <>
                  <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-white/[0.05] text-ink-2">
                    <r.Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-ink">{r.title}</span>
                    <span className="block truncate text-sm text-ink-3">{r.detail}</span>
                  </span>
                  <Icon.ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
                </>
              );
              return (
                <li key={r.id}>
                  {r.external ? (
                    <a href={waTextLink(`Hi Hamza, it's ${name}. `)} target="_blank" rel="noopener noreferrer" className={rowClass}>
                      {body}
                      <span className="sr-only"> (opens WhatsApp)</span>
                    </a>
                  ) : (
                    <Link href={r.href!} className={rowClass}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="surface rounded-card p-5 text-base text-ink-2" role="status">
            Nothing matches &ldquo;{query.trim()}&rdquo;. Try a simpler word, like marks, paper or homework.
          </p>
        )}

        {!searching && (
          <div className="surface overflow-hidden rounded-card">
            {confirming ? (
              <div className="px-5 py-4 sm:px-6" role="group" aria-label="Sign out of the portal?">
                <p className="text-base font-semibold text-ink">Sign out of the portal?</p>
                <p className="mt-0.5 text-sm text-ink-3">You will need your password to sign back in.</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" size="sm" onClick={signOut} className="flex-1">
                    Sign out
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} className="flex-1" autoFocus>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className={rowClass}>
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-white/[0.05] text-ink-2">
                  <NavIcon.Logout className="h-5 w-5" />
                </span>
                <span className="flex-1 text-base font-semibold text-ink">Sign out</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
