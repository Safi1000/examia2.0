/**
 * Places notes on the chapters of the notes books (lib/notes-catalog.ts).
 *
 * No database change is needed: a note's level and subject come from who it
 * is assigned to, and its chapter from its title ("2.6 Price elasticity of
 * demand (PED)") or, failing that, its name. Hiding an old note from students
 * is a small marker on its file type, so nothing about it is lost.
 */
import { NOTE_BOOKS, type NoteBook, type NoteLevel, type NoteSubject } from "@/lib/notes-catalog";

export { NOTE_BOOKS };
export type { NoteBook, NoteLevel, NoteSubject };

/** "A-Levels (A2)" -> "A2", "IGCSE/O-Levels" -> "IGCSE and O Level". */
export function levelOfName(name: string | undefined | null): NoteLevel | null {
  if (!name) return null;
  if (/\bA2\b/i.test(name)) return "A2";
  if (/\bAS\b/.test(name) || /\bAS[ -]?level/i.test(name)) return "AS";
  if (/igcse|o[ -]?level/i.test(name)) return "IGCSE and O Level";
  return null;
}

/** "Business Studies" -> "Business". */
export function subjectOfName(name: string | undefined | null): NoteSubject | null {
  if (!name) return null;
  if (/account/i.test(name)) return "Accounting";
  if (/business/i.test(name)) return "Business";
  if (/econom/i.test(name)) return "Economics";
  return null;
}

export const bookFor = (level: NoteLevel | null, subject: NoteSubject | null): NoteBook | null =>
  (level && subject && NOTE_BOOKS.find((b) => b.level === level && b.subject === subject)) || null;

export const LEVEL_SHORT: Record<NoteLevel, string> = { "IGCSE and O Level": "IGCSE / O Level", AS: "AS", A2: "A2" };

const STOP = new Set(["the", "a", "an", "and", "of", "in", "to", "for", "notes", "note", "chapter", "pdf", "final", "v2", "new"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w));
const norm = (s: string) => words(s).join(" ");

/** A leading chapter number: "2.6 Price elasticity" -> "2.6". */
export function numberOf(title: string): string | null {
  const m = title.trim().match(/^(\d{1,2}(?:\.\d{1,2}){1,2})(?=[\s.:)-])/);
  return m ? m[1] : null;
}

/** A chapter, or (unit: true) a whole unit in one note; `num` is then the unit's number. */
export type ChapterRef = { book: NoteBook; num: string; name: string; unit?: boolean };

/** The key a note is filed under on its book: "2.6", or "U2" for a whole-unit note. */
export const slotOf = (r: Pick<ChapterRef, "num" | "unit">) => (r.unit ? `U${r.num}` : r.num);

/**
 * Which chapter of this book a note is. Its number wins; then its name, exact,
 * then close (most words shared). Returns null for handouts that aren't a
 * chapter (they show under "More notes").
 */
export function matchChapter(book: NoteBook, title: string, fileName = ""): ChapterRef | null {
  // Every list of notes asks this for every note on each change, so answers are kept.
  let memo = matchMemo.get(book);
  if (!memo) matchMemo.set(book, (memo = new Map()));
  const key = `${title}\u0000${fileName}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  if (memo.size > 2000) memo.clear();
  const found = findChapter(book, title, fileName);
  memo.set(key, found);
  return found;
}
const matchMemo = new WeakMap<NoteBook, Map<string, ChapterRef | null>>();

function findChapter(book: NoteBook, title: string, fileName: string): ChapterRef | null {
  const all = book.units.flatMap((u) => u.chapters);
  const ref = (ch: [string, string]): ChapterRef => ({ book, num: ch[0], name: ch[1] });
  const strip = (t: string) => t.replace(/^\s*\d{1,2}(?:\.\d{1,2}){1,2}[\s.:)-]*/, "");
  // 1. A whole unit's exact name, then a chapter's (the same name can have a different number in another book).
  for (const t of [title, fileName]) {
    const plain = t ? norm(strip(t).replace(/^unit\s+\d+\s*/i, "")) : "";
    const unit = plain && book.units.find((u) => norm(u.name) === plain);
    if (unit) return { book, num: unit.num, name: unit.name, unit: true };
    const exact = plain && all.find(([, n]) => norm(n) === plain);
    if (exact) return ref(exact);
  }
  // 2. Its number, when the rest of the title doesn't point somewhere else.
  const num = numberOf(title) ?? numberOf(fileName);
  const byNum = num ? all.find(([n]) => n === num) : undefined;
  if (byNum) {
    const rest = words(strip(numberOf(title) ? title : fileName));
    const want = new Set(words(byNum[1]));
    const shared = rest.filter((w) => want.has(w)).length;
    if (!rest.length || (shared / rest.length >= 0.5 && (shared >= 2 || shared / want.size >= 0.3))) return ref(byNum);
  }
  // 3. Close: most of the chapter's words appear in the title (and vice versa).
  const have = new Set(words(`${strip(title)} ${strip(fileName)}`));
  let best: { score: number; ch: [string, string] } | null = null;
  for (const ch of all) {
    const want = words(ch[1]).filter((w) => !/^\d+$/.test(w));
    if (!want.length) continue;
    const shared = want.filter((w) => have.has(w)).length;
    const score = shared / Math.max(want.length, have.size);
    if (shared >= Math.min(2, want.length) && score >= 0.6 && (!best || score > best.score)) best = { score, ch };
  }
  return best ? ref(best.ch) : null;
}

/** "2.6 Price elasticity of demand (PED)" */
export const chapterTitle = (num: string, name: string) => `${num} ${name}`;

/** Old notes Hamza has hidden from students (kept in admin, can come back). */
export const isHidden = (fileType: string) => /;\s*ht-hidden\b/i.test(fileType);
export const setHidden = (fileType: string, hidden: boolean) => {
  const base = fileType.replace(/;\s*ht-hidden\b/gi, "").trim();
  return hidden ? `${base}; ht-hidden` : base;
};

/** Where a student last was in each note: page number, for "Continue reading". */
const POS_KEY = "ht-note-pos";
export type NotePos = { page: number; pages: number; at: number };
export function readPositions(): Record<string, NotePos> {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
export function savePosition(noteId: string, page: number, pages: number) {
  try {
    const all = readPositions();
    all[noteId] = { page, pages, at: Date.now() };
    // Keep the 60 most recent.
    const keep = Object.entries(all)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 60);
    localStorage.setItem(POS_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch {}
}
