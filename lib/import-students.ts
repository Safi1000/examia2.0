/**
 * Turns spreadsheet rows into students ready to add: finds the columns,
 * matches each level and subject to the portal's own, fixes phone numbers
 * and makes a username for anyone without one. Nothing is saved here.
 */
import type { ClassItem, Student, SubjectItem } from "@/types";
import { isValidPhone, normalizePhone } from "@/lib/phone";
import type { Rows } from "@/lib/sheet";

export type Field = "name" | "username" | "phone" | "parent" | "level" | "subjects";
export type Columns = Record<Field, number> & { subjectCols: Array<{ col: number; subjectId: string }> };

export interface PlannedRow {
  /** Row number in the sheet (1 = first row), for "row 7" messages. */
  line: number;
  username: string;
  phone?: string;
  parent?: string;
  classIds: string[];
  subjectIds: string[];
  /** Already in the portal: their level and subjects are updated instead. */
  existing?: Student;
  /** Why this row can't be added as it is. */
  problem?: string;
  /** Worth a look, but fine to add. */
  note?: string;
}

const low = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which level a word belongs to: O Level / IGCSE, AS, or A2. */
function levelGroup(text: string): "o" | "as" | "a2" | "a" | null {
  const t = ` ${low(text)} `;
  if (/ a2 | a 2 | a2 level | year 2 | 13 /.test(t)) return "a2";
  if (/ as | a1 | as level | year 1 | 12 /.test(t)) return "as";
  if (/ o | o level| olevel| o levels| igcse | gcse | 9 | 10 | 11 /.test(t)) return "o";
  if (/ a level| a levels| alevel/.test(t)) return "a";
  return null;
}

export function matchLevels(value: string, classes: ClassItem[]): { ids: string[]; problem?: string } {
  const parts = value.split(/[,/&+]| and /i).map((p) => p.trim()).filter(Boolean);
  const ids: string[] = [];
  for (const p of parts) {
    const exact = classes.find((c) => low(c.name) === low(p));
    if (exact) {
      ids.push(exact.id);
      continue;
    }
    const g = levelGroup(p);
    const same = classes.filter((c) => g && levelGroup(c.name) === g);
    if (g === "a") {
      // "A Level" alone could be AS or A2.
      const both = classes.filter((c) => ["as", "a2"].includes(levelGroup(c.name) ?? ""));
      if (both.length > 1) return { ids, problem: `"${p}": say AS or A2` };
      if (both[0]) ids.push(both[0].id);
      continue;
    }
    if (same.length === 1) ids.push(same[0].id);
    else return { ids, problem: `Level "${p}" not recognised` };
  }
  return { ids: [...new Set(ids)] };
}

const SUBJECT_WORDS: Array<[RegExp, RegExp]> = [
  [/^(acc|accts?|accounts?|accounting|accountancy|poa|principles of accounts?)$/, /account/],
  [/^(bus|bst|bs|business|business studies)$/, /business/],
  [/^(eco|econ|econs|economics)$/, /econ/],
];

export function matchSubject(word: string, subjects: SubjectItem[]): string | undefined {
  const w = low(word);
  if (!w) return undefined;
  const exact = subjects.find((s) => low(s.name) === w);
  if (exact) return exact.id;
  for (const [said, name] of SUBJECT_WORDS) if (said.test(w)) return subjects.find((s) => name.test(low(s.name)))?.id;
  return w.length >= 3 ? subjects.find((s) => low(s.name).startsWith(w))?.id : undefined;
}

export function matchSubjects(value: string, subjects: SubjectItem[]): { ids: string[]; problem?: string } {
  const ids: string[] = [];
  for (const p of value.split(/[,/&+;]| and /i).map((x) => x.trim()).filter(Boolean)) {
    const id = matchSubject(p, subjects);
    if (!id) return { ids, problem: `Subject "${p}" not recognised` };
    ids.push(id);
  }
  return { ids: [...new Set(ids)] };
}

/** Finds the header row (in the first five) and which column holds what. */
export function detectColumns(rows: Rows, subjects: SubjectItem[]): { header: number; cols: Columns } {
  const empty = (): Columns => ({ name: -1, username: -1, phone: -1, parent: -1, level: -1, subjects: -1, subjectCols: [] });
  let best = { header: -1, cols: empty(), score: 0 };
  for (let h = 0; h < Math.min(5, rows.length); h++) {
    const cols = empty();
    let score = 0;
    rows[h].forEach((cell, i) => {
      const t = low(cell);
      if (!t) return;
      const take = (f: Field) => {
        if (cols[f] === -1) {
          cols[f] = i;
          score++;
        }
      };
      if (/parent|father|mother|guardian|family/.test(t)) take("parent");
      else if (/user ?name|login/.test(t)) take("username");
      else if (/subject/.test(t)) take("subjects");
      else if (/level|class|grade|year|batch|session/.test(t)) take("level");
      else if (/phone|mobile|whats ?app|contact|number|cell/.test(t)) take("phone");
      else if (/name|student/.test(t)) take("name");
      else {
        const sid = matchSubject(t, subjects);
        if (sid) {
          cols.subjectCols.push({ col: i, subjectId: sid });
          score++;
        }
      }
    });
    if (score > best.score) best = { header: h, cols, score };
  }
  if (best.header === -1) {
    // No headings: guess name, then numbers, in order.
    const cols = empty();
    cols.name = 0;
    cols.phone = rows[0]?.length > 1 ? 1 : -1;
    cols.parent = rows[0]?.length > 2 ? 2 : -1;
    return { header: -1, cols };
  }
  return { header: best.header, cols: best.cols };
}

/** A Pakistan number written 0300…, 92300… or +92 300… becomes +923001234567. */
export function fixPhone(raw: string): string | undefined {
  if (!raw.trim()) return undefined;
  let p = normalizePhone(raw);
  if (/^0[3]\d{9}$/.test(p)) p = `+92${p.slice(1)}`;
  else if (/^92\d{10}$/.test(p)) p = `+${p}`;
  else if (/^00\d+$/.test(p)) p = `+${p.slice(2)}`;
  else if (/^3\d{9}$/.test(p)) p = `+92${p}`;
  return p;
}

export const usernameFrom = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ._-]/g, "")
    .trim()
    .replace(/\s+/g, ".")
    .slice(0, 30);

/** Joining words in names ("Fatima tul Zahra"), never used on their own. */
const LINKS = new Set(["tul", "ul", "us", "un", "bin", "binte", "bint", "e", "al", "ud", "ur"]);

/**
 * A short username from a full name, easy to type at sign in: first and
 * last name ("Syed Muhammad Abbas Kazmi" → syed.kazmi). Two words or fewer
 * stay as they are.
 */
export function usernameFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2) return usernameFrom(name);
  const real = words.filter((w) => !LINKS.has(w.toLowerCase()));
  return usernameFrom(`${real[0] ?? words[0]} ${real[real.length - 1] ?? words[words.length - 1]}`);
}

const YES = (v: string) => !!v.trim() && !/^(no|n|0|false|-|x no|none|nil)$/i.test(v.trim());

export function planRows(
  rows: Rows,
  header: number,
  cols: Columns,
  ctx: {
    classes: ClassItem[];
    subjects: SubjectItem[];
    students: Student[];
    defaultClassIds: string[];
    defaultSubjectIds: string[];
    /** Usernames typed in on the check screen, by sheet row. */
    renamed?: Record<number, string>;
  },
): PlannedRow[] {
  const taken = new Set(ctx.students.map((s) => s.username.toLowerCase()));
  const seen = new Set<string>();
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const out: PlannedRow[] = [];
  rows.forEach((r, idx) => {
    if (idx <= header) return;
    const line = idx + 1;
    const phone = fixPhone(cell(r, cols.phone));
    const parent = fixPhone(cell(r, cols.parent));
    const typed = ctx.renamed?.[line];
    const given = typed !== undefined ? usernameFrom(typed) : cell(r, cols.username) ? usernameFrom(cell(r, cols.username)) : usernameFromName(cell(r, cols.name));
    if (!given && !phone) return; // a blank or notes row
    const row: PlannedRow = { line, username: given, phone, parent, classIds: [], subjectIds: [] };

    // Level and subjects: from the sheet, else the defaults picked on screen.
    const lv = cell(r, cols.level);
    if (lv) {
      const m = matchLevels(lv, ctx.classes);
      row.classIds = m.ids;
      if (m.problem) row.problem = m.problem;
    } else row.classIds = ctx.defaultClassIds;
    const sv = cell(r, cols.subjects);
    if (sv) {
      const m = matchSubjects(sv, ctx.subjects);
      row.subjectIds = m.ids;
      if (m.problem) row.problem ??= m.problem;
    }
    for (const sc of cols.subjectCols) if (YES(cell(r, sc.col))) row.subjectIds.push(sc.subjectId);
    if (!sv && !cols.subjectCols.length) row.subjectIds = ctx.defaultSubjectIds;
    row.subjectIds = [...new Set(row.subjectIds)];

    // Same person already in the portal (same student number, or same username and no clash). A parent number is never used: siblings share one.
    const same =
      (phone && ctx.students.find((s) => s.phone === phone)) ||
      ctx.students.find((s) => s.username.toLowerCase() === given && (!phone || !s.phone || s.phone === phone));
    if (same) {
      row.existing = same;
      row.username = same.username;
    } else {
      if (!given) row.problem ??= "No name";
      else {
        let u = given.length < 3 ? `${given}.student`.slice(0, 30) : given;
        if (taken.has(u) || seen.has(u)) {
          let n = 2;
          while (taken.has(`${u.slice(0, 28)}${n}`) || seen.has(`${u.slice(0, 28)}${n}`)) n++;
          row.note = `${u} is taken, so ${u.slice(0, 28)}${n}`;
          u = `${u.slice(0, 28)}${n}`;
        }
        row.username = u;
        seen.add(u);
      }
    }
    if (!row.problem && phone && !isValidPhone(phone)) row.problem = "Student number needs the country code (+971…)";
    if (!row.problem && parent && !isValidPhone(parent)) row.problem = "Parent number needs the country code (+971…)";
    if (!row.problem && ctx.classes.length && !row.classIds.length) row.problem = "No level";
    if (!row.problem && ctx.subjects.length && !row.subjectIds.length) row.problem = "No subjects";
    out.push(row);
  });
  return out;
}
