import meta from "@/lib/past-paper-meta.json";
import tags from "@/lib/past-paper-tags.json";
import { SYLLABI } from "@/lib/syllabus";
import {
  ALL_CODES,
  buildPool,
  covers,
  cropUrl,
  parseId,
  pickQuestions,
  sourceLabel,
  swapFor,
  type BuiltQuestion,
  type MetaLike,
  type PoolItem,
  type TagsLike,
  type TopicChoice,
} from "@/lib/paper-builder";

/**
 * The teacher console's "From past papers" (see lib/paper-builder.ts).
 *
 *   POST { action: "topics", syllabus, codes, asOnly }          → { topics }
 *   POST { action: "build", syllabus, codes, subs, mcq, written, exclude, seed } → { questions }
 *   POST { action: "swap", syllabus, codes, id, exclude, seed }  → { question }
 *   POST { action: "ms", id }                                    → { name, start, pages, ratios }
 *
 * Reads only the past paper data this site already publishes on its public
 * past paper pages (page images, answer letters, mark schemes), so it needs no
 * sign in and saves nothing. Keeps the large data files on the server.
 */
export const runtime = "nodejs";

const M = meta as unknown as MetaLike;
const T = tags as unknown as TagsLike;
const HELD = new Set(M.x ?? []);

const pools = new Map<string, PoolItem[]>();
function poolFor(codes: string[]) {
  const key = codes.join(",");
  let p = pools.get(key);
  if (!p) pools.set(key, (p = buildPool(M, T, codes)));
  return p;
}

// ---- Marks for written questions, read from the paper's own text ----------

type PageText = Array<[string, string]>;
let TEXT: Record<string, PageText> | null = null;
async function paperText(): Promise<Record<string, PageText>> {
  if (!TEXT) TEXT = (await import("@/lib/past-paper-text.json")).default as unknown as Record<string, PageText>;
  return TEXT;
}

const marksCache = new Map<string, Map<number, number | null>>();
/**
 * Each written question's marks, only where the paper's text makes it
 * certain: a single "[Total: n]" on its pages, or (when every page is its
 * own) its "[n]" marks added up, and then only if the whole paper adds up to
 * the total printed on the front. Anything else stays null for Hamza to type.
 */
async function writtenMarks(paperKey: string): Promise<Map<number, number | null>> {
  const hit = marksCache.get(paperKey);
  if (hit) return hit;
  const qs = M.w[paperKey] ?? [];
  const [code, sess, pv] = paperKey.split("_");
  const pages = (await paperText())[`${code}_${sess}_qp_${pv}`] ?? [];
  const text = (n: number) => pages.find((p) => String(p[0]) === String(n))?.[1] ?? "";
  const owners = new Map<number, Set<number>>();
  for (const [n, segs] of qs) for (const [pg] of segs) owners.set(pg, (owners.get(pg) ?? new Set()).add(n));
  const read = qs.map(([n, segs]) => {
    const pg = [...new Set(segs.map((s) => s[0]))];
    const all = pg.map(text).join(" ");
    const totals = [...all.matchAll(/\[\s*Total\s*:\s*(\d{1,3})\s*\]/gi)];
    const own = pg.every((p) => owners.get(p)?.size === 1) && pg.every((p) => text(p));
    const sum = [...all.matchAll(/\[(\d{1,2})\]/g)].reduce((a, x) => a + Number(x[1]), 0);
    return { n, total: totals.length === 1 ? Number(totals[0][1]) : null, sum: own && sum > 0 ? sum : null };
  });
  const paperTotal = M.p[paperKey]?.[2] ?? null;
  const allKnown = read.every((r) => (r.total ?? r.sum) !== null);
  const adds = allKnown && read.reduce((a, r) => a + (r.total ?? r.sum ?? 0), 0) === paperTotal;
  const out = new Map(read.map((r) => [r.n, adds ? (r.total ?? r.sum) : r.total]));
  marksCache.set(paperKey, out);
  return out;
}

// ---- Building one question ------------------------------------------------

function subName(syllabus: string, num: string): string {
  const syl = SYLLABI.find((s) => s.code === syllabus);
  for (const t of syl?.topics ?? []) for (const s of t.subs) if (s.num === num) return s.name;
  return `Topic ${num}`;
}

const page = (name: string, n: number) => `/papers/img/${name}/${n}.jpg`;

async function built(q: PoolItem, syllabus: string, subs: string[]): Promise<BuiltQuestion> {
  const name = `${q.code}_${q.s}${String(q.y).slice(2)}_qp_${q.pv}`;
  const [, minutes, marks] = M.p[q.paper] ?? [null, null, null];
  const perMark = minutes && marks ? minutes / marks : null;
  const sub = q.subs.find((s) => subs.some((c) => covers(c, s))) ?? q.subs[0];
  const base = { id: q.id, kind: q.kind, label: sourceLabel(q.id), sub, topic: subName(syllabus, sub) };
  if (q.kind === "mcq") {
    const [pg, t, b, r] = M.q[q.paper][q.n - 1];
    return { ...base, attachments: [cropUrl(page(name, pg), t, b, r ?? 1.414)], answer: "ABCD".indexOf(M.k[q.paper][q.n - 1]), marks: 1, minutes: perMark ?? 1.5 };
  }
  const segs = M.w[q.paper].find(([n]) => n === q.n)?.[1] ?? [];
  const ratios = M.r?.[name];
  const attachments = segs.map(([pg, t, b]) => cropUrl(page(name, pg), t, b, ratios?.[pg - 1] ?? 1.414));
  // Case studies and data: the insert's pages come with the question.
  const insert = name.replace("_qp_", "_in_");
  for (let i = 1; i <= (HELD.has(insert) ? 0 : (M.n[insert] ?? 0)); i++) attachments.push(page(insert, i));
  const qMarks = (await writtenMarks(q.paper)).get(q.n) ?? null;
  const count = M.w[q.paper].length || 1;
  const mins = perMark && qMarks ? perMark * qMarks : minutes ? minutes / count : 15;
  return { ...base, attachments, marks: qMarks, minutes: mins };
}

// ---- Request checks -------------------------------------------------------

const ID = /^\d{4}_[msw]\d{2}_\d{2}#\d{1,3}$/;
const SUB = /^\d{1,2}(\.\d{1,2}){0,2}$/;
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ID.test(x)).slice(0, 2000) : []);
const count = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.action !== "string") return Response.json({ error: "bad request" }, { status: 400 });

  if (b.action === "ms") {
    const id = typeof b.id === "string" && ID.test(b.id) ? b.id : "";
    const p = parseId(id);
    if (!p) return Response.json({ error: "bad request" }, { status: 400 });
    const name = `${p.code}_${p.sess}_ms_${p.pv}`;
    const start = M.m[id];
    const pages = HELD.has(name) ? 0 : (M.n[name] ?? 0);
    if (!start || !pages) return Response.json({ ms: null });
    return Response.json({ ms: { name, start: Math.min(start, pages), pages, ratios: M.r?.[name] ?? null } });
  }

  const codes = Array.isArray(b.codes) ? b.codes.filter((c): c is string => typeof c === "string" && ALL_CODES.has(c)) : [];
  const syllabus = typeof b.syllabus === "string" && SYLLABI.some((s) => s.code === b.syllabus) ? b.syllabus : "";
  if (!codes.length || !syllabus) return Response.json({ error: "bad request" }, { status: 400 });
  const pool = poolFor(codes);
  const seed = count(b.seed, 2 ** 31) || 1;

  if (b.action === "topics") {
    const syl = SYLLABI.find((s) => s.code === syllabus)!;
    const topics: TopicChoice[] = syl.topics
      .filter((t) => !(b.asOnly === true && /\(A Level\)/.test(t.name)))
      .map((t) => ({
        num: t.num,
        name: t.name.replace(/\s*\((AS|A) Level\)$/, ""),
        subs: t.subs.map((s) => {
          const on = pool.filter((q) => q.subs.includes(s.num));
          return { num: s.num, name: s.name, mcq: on.filter((q) => q.kind === "mcq").length, written: on.filter((q) => q.kind === "written").length };
        }),
      }));
    return Response.json({ topics });
  }

  if (b.action === "build") {
    const subs = Array.isArray(b.subs) ? b.subs.filter((s): s is string => typeof s === "string" && SUB.test(s)).slice(0, 200) : [];
    const picked = pickQuestions(pool, { subs, mcq: count(b.mcq, 40), written: count(b.written, 10), exclude: ids(b.exclude), seed });
    return Response.json({ questions: await Promise.all(picked.map((q) => built(q, syllabus, subs))) });
  }

  if (b.action === "swap") {
    const id = typeof b.id === "string" && ID.test(b.id) ? b.id : "";
    const next = id ? swapFor(pool, id, ids(b.exclude), seed) : null;
    return Response.json({ question: next ? await built(next, syllabus, next.subs) : null });
  }

  return Response.json({ error: "bad request" }, { status: 400 });
}
