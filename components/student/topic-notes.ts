/**
 * "Read the notes" for a topic: finds the note a student can open for a topic
 * name, using the same shelves as the Notes page (lib/note-shelves) and the
 * same chapter matching as the upload screen (matchChapter). When no note
 * matches, it points at that subject's tab on the Notes page; when the subject
 * has no notes at all, it returns null so nothing is shown.
 */
import type { Database } from "@/lib/data/seed";
import type { Note, Student } from "@/types";
import { shelvesFor } from "@/lib/note-shelves";
import { matchChapter, slotOf, subjectOfName } from "@/lib/notes-library";
import { sameSubject } from "@/lib/performance";

export type TopicNotes = { href: string; label: string; exact: boolean };

type Db = Pick<Database, "classes" | "subjects" | "notes" | "noteAssignments">;

/** Build once per data change, then call for each topic. */
export function topicNotesFinder(db: Db, student: Student) {
  const shelves = shelvesFor(db, student);
  const general = shelves.find((s) => s.key === "general");
  return (subject: string, topic: string): TopicNotes | null => {
    const subj = subjectOfName(subject);
    const mine = shelves.filter((s) => s.key !== "general" && (subj ? s.book?.subject === subj : sameSubject(s.label, subject)));
    if (!mine.length) return null;
    const name = topic.trim();
    let note: Note | undefined;
    if (name && name.toLowerCase() !== "general") {
      for (const s of mine) {
        if (!s.book) continue;
        const ch = matchChapter(s.book, name);
        if (!ch) continue;
        // A chapter can also be covered by a note on its whole unit.
        const unit = ch.unit ? undefined : s.book.units.find((u) => u.chapters.some(([n]) => n === ch.num));
        note = s.byChapter.get(slotOf(ch))?.[0] ?? (unit ? s.byChapter.get(`U${unit.num}`)?.[0] : undefined);
        if (note) break;
      }
      if (!note) {
        const want = name.toLowerCase();
        const all = [...mine.flatMap((s) => [...s.byChapter.values()].flat().concat(s.more)), ...(general?.more ?? [])];
        note = all.find((n) => n.title.toLowerCase().includes(want));
      }
    }
    if (note) return { href: `/notes?open=${note.id}`, label: "Read the notes", exact: true };
    // The subject's own name from the data, so it reads the same as everywhere else.
    const own = db.subjects.find((s) => sameSubject(s.name, subject))?.name ?? subject;
    return { href: `/notes?shelf=${encodeURIComponent(mine[0].key)}`, label: `${own} notes`, exact: false };
  };
}
