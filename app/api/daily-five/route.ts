import { PAST_PAPER_SYLLABI } from "@/lib/past-papers";
import { topicalFor, type TopicalQuestion } from "@/lib/topical";

/**
 * The portal's Daily 5: five real past paper multiple choice questions from
 * the chapters a student's class has covered, a fresh set each day.
 *
 *   /api/daily-five?s=0452:1.1,1.2.1|0455:2.1&d=20401
 *
 * `s` is each past paper syllabus with the chapter numbers covered so far
 * (from the notes Hamza has released), `d` the day number, which seeds the
 * pick so the set stays the same all day and changes tomorrow. Same data as
 * the public topical pages: the page images and answer letters already on
 * the site, nothing new and nothing about the student.
 */
const CODES = new Set(PAST_PAPER_SYLLABI.map((s) => s.code));
const COUNT = 5;

export interface DailyQuestion {
  id: string;
  /** "0452/12/F/M/24" */
  c: string;
  n: number;
  segs: TopicalQuestion["segs"];
  a: string;
  /** The subtopic's name, shown as a small label. */
  topic: string;
}

/** A small seeded random number generator, so a day always gets the same set. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

const hash = (str: string) => [...str].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7);

/** A chapter covers a subtopic when one number sits inside the other ("1.2.1" and "1.2"). */
const covers = (chapter: string, sub: string) => chapter === sub || chapter.startsWith(`${sub}.`) || sub.startsWith(`${chapter}.`);

export function GET(req: Request) {
  const url = new URL(req.url);
  const day = Number(url.searchParams.get("d"));
  const raw = (url.searchParams.get("s") ?? "").slice(0, 2000);
  if (!Number.isInteger(day) || day < 0) return Response.json({ questions: [] }, { status: 400 });

  // Each syllabus's own pool of questions from covered chapters.
  const found: Array<{ code: string; pool: DailyQuestion[] }> = [];
  for (const part of raw.split("|").slice(0, 6)) {
    const [code, list = ""] = part.split(":");
    if (!CODES.has(code)) continue;
    const chapters = list.split(",").filter((c) => /^\d+(\.\d+)*$/.test(c)).slice(0, 200);
    if (!chapters.length) continue;
    const seen = new Set<string>();
    const pool: DailyQuestion[] = [];
    for (const e of topicalFor(code)) {
      if (!chapters.some((c) => covers(c, e.sub.num))) continue;
      for (const q of e.questions) {
        if (q.kind !== "mcq" || !q.a || seen.has(q.id)) continue;
        seen.add(q.id);
        pool.push({ id: q.id, c: q.c, n: q.n, segs: q.segs, a: q.a, topic: e.sub.name });
      }
    }
    if (pool.length) found.push({ code, pool });
  }

  // Walk through one shuffle a few questions a day, instead of a fresh
  // shuffle every day: with a small pool, independent shuffles kept bringing
  // back yesterday's questions. A new shuffle starts once a pool is used up.
  const perDay = Math.ceil(COUNT / Math.max(1, found.length));
  const pools: Array<Array<DailyQuestion>> = found.map(({ code, pool }) => {
    const start = day * perDay;
    const cycle = Math.floor(start / pool.length);
    const rand = rng(cycle * 9973 + hash(code));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const at = start % pool.length;
    return [...pool.slice(at), ...pool.slice(0, at)];
  });

  // Take turns between subjects so a student with two gets a mix.
  const questions: DailyQuestion[] = [];
  for (let round = 0; questions.length < COUNT && pools.some((p) => p.length > round); round++)
    for (const p of pools) if (p[round] && questions.length < COUNT) questions.push(p[round]);

  return Response.json(
    { questions },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
  );
}
