/**
 * Lays every note a student can read onto their notes books (one per level
 * and subject). Pure: used by the student Notes page, Groundwork's syllabus
 * progress and the parents' monthly report, so all three agree.
 */
import type { Database } from "@/lib/data/seed";
import type { Note, NoteAssignment, Student } from "@/types";
import { subjectsAtLevel, takesLevelSubject } from "@/lib/levels";
import { LEVEL_SHORT, bookFor, isHidden, levelOfName, matchChapter, slotOf, subjectOfName, type NoteBook } from "@/lib/notes-library";

/** One tab: a notes book (a level and subject), or a plain group ("For everyone"). */
export type Shelf = {
  key: string;
  label: string;
  book: NoteBook | null;
  /** chapter number (or "U2" for a whole unit) -> notes on it, newest first */
  byChapter: Map<string, Note[]>;
  /** notes that aren't a chapter (handouts, older notes), newest first */
  more: Note[];
};

type Db = Pick<Database, "classes" | "subjects" | "notes" | "noteAssignments">;

export function shelvesFor(db: Db, student: Student): Shelf[] {
  const levels = student.classIds
    .map((id) => ({
      id,
      level: levelOfName(db.classes.find((c) => c.id === id)?.name),
    }))
    .filter((x) => x.level);
  const shelves = new Map<string, Shelf>();
  const shelf = (key: string, label: string, book: NoteBook | null) => {
    let s = shelves.get(key);
    if (!s) shelves.set(key, (s = { key, label, book, byChapter: new Map(), more: [] }));
    return s;
  };
  const subjName = (id: string) => db.subjects.find((s) => s.id === id)?.name ?? "Other";

  // Every book the student takes is on the shelf, even before any chapter is out.
  for (const { id, level } of levels) {
    for (const sid of subjectsAtLevel(student, id)) {
      const b = bookFor(level, subjectOfName(subjName(sid)));
      if (b) shelf(b.key, levels.length > 1 ? `${LEVEL_SHORT[b.level]} ${b.subject}` : b.subject, b);
    }
  }

  const mine = db.noteAssignments.filter((na: NoteAssignment) => na.cohortId === student.cohortId && takesLevelSubject(student, na.classId ?? null, na.subjectId ?? null));
  for (const n of db.notes) {
    if (isHidden(n.fileType)) continue;
    const as = mine.filter((a) => a.noteId === n.id);
    const placed = new Set<string>();
    for (const a of as) {
      if (!a.subjectId) {
        const s = shelf("general", "For everyone", null);
        if (!placed.has(s.key)) s.more.push(n);
        placed.add(s.key);
        continue;
      }
      const subject = subjectOfName(subjName(a.subjectId));
      const lvls = a.classId ? [levelOfName(db.classes.find((c) => c.id === a.classId)?.name)] : levels.map((l) => l.level);
      let landed = false;
      for (const lv of lvls) {
        const b = bookFor(lv ?? null, subject);
        if (!b || !shelves.has(b.key)) continue;
        const s = shelves.get(b.key)!;
        if (placed.has(s.key)) {
          landed = true;
          continue;
        }
        const ch = matchChapter(b, n.title, n.fileName);
        // A note given to every level lands only on the level whose book has its chapter.
        if (!ch && !a.classId && lvls.length > 1) continue;
        if (ch) s.byChapter.set(slotOf(ch), [...(s.byChapter.get(slotOf(ch)) ?? []), n]);
        else s.more.push(n);
        placed.add(s.key);
        landed = true;
      }
      if (!landed) {
        // A subject without a notes book (or a level we can't tell): a plain list.
        const fallback = [...shelves.values()].find((s) => s.book?.subject === subject) ?? shelf(`s:${a.subjectId}`, subjName(a.subjectId), null);
        if (!placed.has(fallback.key)) fallback.more.push(n);
        placed.add(fallback.key);
      }
    }
  }
  const newest = (a: Note, b: Note) => b.createdAt.localeCompare(a.createdAt);
  for (const s of shelves.values()) {
    s.more.sort(newest);
    for (const list of s.byChapter.values()) list.sort(newest);
  }
  const order = (s: Shelf) => (s.key === "general" ? 3 : s.book ? ["IGCSE and O Level", "AS", "A2"].indexOf(s.book.level) * 0.1 : 2);
  return [...shelves.values()].filter((s) => s.book || s.more.length).sort((a, b) => order(a) - order(b) || a.label.localeCompare(b.label));
}
