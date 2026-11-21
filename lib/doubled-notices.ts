/**
 * "Tidy doubled notices" (Settings, owner only).
 *
 * Until 21 November 2026, publishing a test could write the same "New test"
 * row twice (two saves finishing together; see student-fixes-2026-11-20.md).
 * New tests are protected by a stable row id; this finds the old copies.
 *
 * A doubled notice is a group of rows with the same type, test, class
 * (cohort), audience, addressee and title. The oldest row (earliest created
 * time, then smallest id) is the one that stays; it may already carry read or
 * cleared marks. Every later row in the group is an extra copy.
 *
 * Only "test_created" is in scope: it is the one type the report proved was
 * doubled this way. Pure: no store, no database.
 */

export const TIDY_TYPES = ["test_created"] as const;

/** Most ids one removal may carry; the screen sends larger lists in parts. */
export const TIDY_MAX = 500;

/** The shape of a live row id. Anything else never reaches the database. */
export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export interface NoticeRow {
  id: string;
  type: string;
  title: string;
  testId: string | null;
  cohortId: string | null;
  studentId: string | null;
  audience: string;
  createdAt: string;
}

export interface DoubledNotice {
  key: string;
  title: string;
  testId: string;
  cohortId: string | null;
  audience: string;
  /** When the copy that stays was written. */
  firstAt: string;
  keepId: string;
  extraIds: string[];
  copies: number;
}

const groupKey = (r: NoticeRow) => JSON.stringify([r.type, r.testId, r.cohortId, r.audience, r.studentId, r.title]);

/** Oldest first: created time, then id (the same order as the database's uuid order). */
function older(a: NoticeRow, b: NoticeRow): number {
  const t = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (t) return t;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every doubled notice, newest first. Rows without a test are never grouped. */
export function findDoubledNotices(rows: NoticeRow[]): DoubledNotice[] {
  const groups = new Map<string, NoticeRow[]>();
  for (const r of rows) {
    if (!(TIDY_TYPES as readonly string[]).includes(r.type) || !r.testId || !r.title) continue;
    const k = groupKey(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const out: DoubledNotice[] = [];
  for (const [key, g] of groups) {
    if (g.length < 2) continue;
    g.sort(older);
    out.push({
      key,
      title: g[0].title,
      testId: g[0].testId!,
      cohortId: g[0].cohortId,
      audience: g[0].audience,
      firstAt: g[0].createdAt,
      keepId: g[0].id,
      extraIds: g.slice(1).map((r) => r.id),
      copies: g.length,
    });
  }
  return out.sort((a, b) => Date.parse(b.firstAt) - Date.parse(a.firstAt));
}

/**
 * Of the ids asked for, the ones that are still an extra copy in these fresh
 * rows. The copy that stays in each group is never returned, so a list read
 * earlier can never remove the last copy of a notice.
 */
export function stillExtra(rows: NoticeRow[], ids: string[]): string[] {
  const found = findDoubledNotices(rows);
  const extra = new Set(found.flatMap((n) => n.extraIds));
  const kept = new Set(found.map((n) => n.keepId));
  return [...new Set(ids)].filter((id) => extra.has(id) && !kept.has(id));
}
