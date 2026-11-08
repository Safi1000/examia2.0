/**
 * How far through the syllabus each class is, measured by the notes Hamza
 * releases: notes go up chapter by chapter in teaching order, so a chapter
 * with a note out is a chapter the class has covered. Nothing to tick by hand.
 *
 * Each chapter also points at its topical past paper questions (the public
 * /past-papers/<syllabus>/topics/<topic> pages). Question counts come from a
 * small index (/api/topical-index) so the portal never loads the full
 * question data.
 *
 * Pure: no network, no saving.
 */
import type { Database } from "@/lib/data/seed";
import type { Student } from "@/types";
import type { NoteBook } from "@/lib/notes-library";
import { shelvesFor } from "@/lib/note-shelves";

export interface ChapterProgress {
  num: string;
  name: string;
  unit: string;
  /** A note for it (or for its whole unit) is out. */
  out: boolean;
  /** When its note went up (the earliest one). */
  outAt?: string;
  noteId?: string;
}

export interface BookProgress {
  key: string;
  label: string;
  subject: string;
  level: NoteBook["level"];
  total: number;
  covered: number;
  chapters: ChapterProgress[];
  /** The newest chapter out. */
  latest: ChapterProgress | null;
  /** Past paper syllabus whose topical questions match this book. */
  paperCode: string;
}

/** Topical questions by syllabus code, then subtopic number: [page slug, multiple choice, written]. */
export type TopicalIndex = Record<string, { slug: string; topics: Record<string, [string, number, number]> }>;

/** The past paper syllabus a book's chapters are numbered against (IGCSE first: students sit both). */
export function paperCodeFor(book: Pick<NoteBook, "level" | "subject">): string {
  if (book.level === "IGCSE and O Level") return { Accounting: "0452", Economics: "0455", Business: "0450" }[book.subject];
  return { Accounting: "9706", Economics: "9708", Business: "9609" }[book.subject];
}

/** Every book this student takes, with what is covered so far. `untilMs` counts only notes out by then (for reports). */
export function syllabusProgress(db: Pick<Database, "classes" | "subjects" | "notes" | "noteAssignments">, student: Student, untilMs = Infinity): BookProgress[] {
  return shelvesFor(db, student)
    .filter((s) => s.book)
    .map((s) => {
      const book = s.book!;
      const firstOut = (slot: string) => {
        const notes = (s.byChapter.get(slot) ?? []).filter((n) => Date.parse(n.createdAt) <= untilMs);
        const first = notes.reduce<(typeof notes)[number] | null>((a, n) => (!a || n.createdAt < a.createdAt ? n : a), null);
        return first;
      };
      const chapters: ChapterProgress[] = book.units.flatMap((u) => {
        const whole = firstOut(`U${u.num}`);
        return u.chapters.map(([num, name]) => {
          const own = firstOut(num);
          const n = own && whole ? (own.createdAt < whole.createdAt ? own : whole) : (own ?? whole);
          return { num, name, unit: u.name, out: !!n, outAt: n?.createdAt, noteId: n?.id };
        });
      });
      const out = chapters.filter((c) => c.out);
      const latest = out.reduce<ChapterProgress | null>((a, c) => (!a || (c.outAt ?? "") > (a.outAt ?? "") ? c : a), null);
      return { key: s.key, label: s.label, subject: book.subject, level: book.level, total: chapters.length, covered: out.length, chapters, latest, paperCode: paperCodeFor(book) };
    });
}

/** The topical page and question count for a chapter: an exact topic number, else the topic it sits inside ("1.4.2" is in "1.4"). */
export function topicalFor(index: TopicalIndex | null, code: string, chapterNum: string): { href: string; count: number } | null {
  const syl = index?.[code];
  if (!syl) return null;
  let key = syl.topics[chapterNum] ? chapterNum : null;
  if (!key) {
    const parts = chapterNum.split(".");
    while (parts.length > 1 && !key) {
      parts.pop();
      if (syl.topics[parts.join(".")]) key = parts.join(".");
    }
  }
  if (!key) return null;
  const [slug, mcq, written] = syl.topics[key];
  const count = mcq + written;
  return count ? { href: `/past-papers/${syl.slug}/topics/${slug}`, count } : null;
}

/**
 * Past paper practice for today, automatically: the newest chapter out (when
 * it went up in the last 10 days), and one older covered chapter, a different
 * one each day, so earlier topics keep coming back.
 */
export function practiceToday(books: BookProgress[], index: TopicalIndex | null, nowMs: number) {
  const out: Array<{ key: string; subject: string; chapter: ChapterProgress; href: string; count: number; fresh: boolean }> = [];
  const day = Math.floor(nowMs / 864e5);
  for (const b of books) {
    const latest = b.latest;
    if (latest && nowMs - Date.parse(latest.outAt ?? "") < 10 * 864e5) {
      const t = topicalFor(index, b.paperCode, latest.num);
      if (t) out.push({ key: `pp-${b.key}-${latest.num}`, subject: b.subject, chapter: latest, ...t, fresh: true });
    }
    const older = b.chapters.filter((c) => c.out && c !== latest && topicalFor(index, b.paperCode, c.num));
    if (older.length) {
      const c = older[day % older.length];
      out.push({ key: `pp-${b.key}-${c.num}`, subject: b.subject, chapter: c, ...topicalFor(index, b.paperCode, c.num)!, fresh: false });
    }
  }
  // Fresh chapters first, then one revisit; at most three a day.
  return out.sort((a, b) => Number(b.fresh) - Number(a.fresh)).slice(0, 3);
}
