import meta from "@/lib/past-paper-meta.json";
import tags from "@/lib/past-paper-tags.json";
import mcqData from "@/lib/past-paper-mcq.json";
import { SYLLABI } from "@/lib/syllabus";
import {
  ALL_CODES,
  buildPool,
  covers,
  cropUrl,
  isPaperImage,
  mcqUsable,
  parseCrop,
  parseId,
  pickQuestions,
  sourceLabel,
  swapFor,
  type BuiltQuestion,
  type McqDataLike,
  type MetaLike,
  type PoolItem,
  type TagsLike,
  type TopicChoice,
} from "@/lib/paper-builder";

/**
 * The teacher console's "From past papers" (see lib/paper-builder.ts).
 *
 *   POST { action: "topics", syllabus, codes, asOnly }          → { topics }
 *   POST { action: "build", syllabus, codes, subs, mcq, written, exclude, seen, seed } → { questions }
 *   POST { action: "swap", syllabus, codes, id, exclude, seen, seed }  → { question }
 *   POST { action: "ms", id }                                    → { name, start, end, pages, ratios }
 *   POST { action: "view", urls }                                → { urls, ids }
 *
 * "view" brings pictures saved before the crops were measured again up to
 * date (the same question, its printed number covered; an insert's cover page,
 * which names the paper, dropped), and says which question each one shows.
 *
 * Reads only the past paper data this site already publishes on its public
 * past paper pages (page images, answer letters, mark schemes), so it needs no
 * sign in and saves nothing. Keeps the large data files on the server.
 */
export const runtime = "nodejs";

const M = meta as unknown as MetaLike;
const T = tags as unknown as TagsLike;
const D = mcqData as unknown as McqDataLike;
const HELD = new Set(M.x ?? []);

/**
 * Built pools, a few at a time. This route needs no sign in, so the list of
 * codes is put in one order with repeats removed (the pool is the same either
 * way) and the oldest pool is dropped past the cap: sending the same codes
 * shuffled or repeated can no longer fill the server's memory.
 */
const MAX_POOLS = 24;
const pools = new Map<string, PoolItem[]>();
function poolFor(codes: string[]) {
  const key = codes.join(",");
  let p = pools.get(key);
  if (!p) {
    if (pools.size >= MAX_POOLS) pools.delete(pools.keys().next().value!);
    pools.set(key, (p = buildPool(M, T, codes, D)));
  }
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
/** Written pages and insert pages: the page between its header and footer, side margins trimmed. */
const PAGE_BOX = { t: 0.06, b: 0.93, l: 0.075, r: 0.925 };
/** Insert pages worth showing: never the cover (it names the paper) or a blank page. */
const insertPages = (insert: string) => D.i[insert] ?? Array.from({ length: M.n[insert] ?? 0 }, (_, i) => i + 1).slice(1);

function mcqPicture(paper: string, n: number): { url: string; typed?: BuiltQuestion["typed"] } | null {
  const e = D.q[paper]?.[n - 1];
  if (!mcqUsable(e)) return null;
  const [code, sess, pv] = paper.split("_");
  const name = `${code}_${sess}_qp_${pv}`;
  const [pg, t, b, l, r, form, cover, stem, options] = e;
  const ratio = M.q[paper]?.[n - 1]?.[3] ?? 1.414;
  const url = cropUrl(page(name, pg), { t, b, l, r, ratio, cover });
  return form === 1 && stem && options?.length === 4 ? { url, typed: { stem, options } } : { url };
}

/**
 * A page that carries nothing of the question: "BLANK PAGE" and the copyright
 * notice at the back of a paper (the last question's pages used to run onto them).
 */
async function fillerPage(name: string, pg: number): Promise<boolean> {
  const text = (await paperText())[name]?.find((p) => String(p[0]) === String(pg))?.[1];
  if (text === undefined) return false;
  const rest = text
    .replace(/(Permission to reproduce items|where third.party owned material)[\s\S]*$/i, "")
    .replace(/BLANK\s*PAGE/gi, "")
    .replace(/^\s*\d{1,2}\s*/, "")
    .trim();
  return rest.length < 20;
}

function writtenPages(paper: string, n: number, skip?: Set<number>): string[] {
  const [code, sess, pv] = paper.split("_");
  const name = `${code}_${sess}_qp_${pv}`;
  const segs = (M.w[paper]?.find(([x]) => x === n)?.[1] ?? []).filter(([pg], i) => i === 0 || !skip?.has(pg));
  const ratios = M.r?.[name];
  const cover = D.w[`${paper}#${n}`] ?? null;
  return segs.map(([pg, t, b], i) =>
    cropUrl(page(name, pg), { t: Math.max(t, PAGE_BOX.t), b: Math.min(b, PAGE_BOX.b), l: PAGE_BOX.l, r: PAGE_BOX.r, ratio: ratios?.[pg - 1] ?? 1.414, cover: i === 0 ? cover : null }),
  );
}

function insertUrls(insert: string): string[] {
  if (HELD.has(insert) || !M.n[insert]) return [];
  const ratios = M.r?.[insert];
  return insertPages(insert).map((p) => cropUrl(page(insert, p), { ...PAGE_BOX, ratio: ratios?.[p - 1] ?? 1.414 }));
}

async function built(q: PoolItem, syllabus: string, subs: string[], seen: Set<string>): Promise<BuiltQuestion> {
  const name = `${q.code}_${q.s}${String(q.y).slice(2)}_qp_${q.pv}`;
  const [, minutes, marks] = M.p[q.paper] ?? [null, null, null];
  const perMark = minutes && marks ? minutes / marks : null;
  const sub = q.subs.find((s) => subs.some((c) => covers(c, s))) ?? q.subs[0];
  const base = { id: q.id, kind: q.kind, label: sourceLabel(q.id), sub, topic: subName(syllabus, sub), ...(seen.has(q.id) ? { seen: true } : {}) };
  if (q.kind === "mcq") {
    const pic = mcqPicture(q.paper, q.n)!;
    return { ...base, attachments: [pic.url], ...(pic.typed ? { typed: pic.typed } : {}), answer: "ABCD".indexOf(M.k[q.paper][q.n - 1]), marks: 1, minutes: perMark ?? 1.5 };
  }
  // Case studies and data: the insert's pages come with the question.
  const segs = M.w[q.paper]?.find(([x]) => x === q.n)?.[1] ?? [];
  const skip = new Set<number>();
  for (const [pg] of segs.slice(1)) if (await fillerPage(name, pg)) skip.add(pg);
  const attachments = [...writtenPages(q.paper, q.n, skip), ...insertUrls(name.replace("_qp_", "_in_"))];
  const qMarks = (await writtenMarks(q.paper)).get(q.n) ?? null;
  const count = M.w[q.paper].length || 1;
  const mins = perMark && qMarks ? perMark * qMarks : minutes ? minutes / count : 15;
  return { ...base, attachments, marks: qMarks, minutes: mins };
}

/**
 * A saved picture link, brought up to date: [new link or null to drop it,
 * the question it shows]. Unknown links come back as they were.
 */
function viewOf(url: string): [string | null, string | null] {
  if (!isPaperImage(url)) return [url, null];
  const m = /^\/papers\/img\/(\d{4})_([msw]\d{2})_(qp|in)_(\d{2})\/(\d{1,3})\.jpg/.exec(url);
  if (!m) return [url, null];
  const [, code, sess, kind, pv] = m;
  const pg = Number(m[5]);
  const paper = `${code}_${sess}_${pv}`;
  const crop = parseCrop(url);
  if (kind === "in") {
    const name = `${code}_${sess}_in_${pv}`;
    if (!insertPages(name).includes(pg)) return [null, null];
    if (crop && !crop.legacy) return [url, null];
    return [cropUrl(page(name, pg), { ...PAGE_BOX, ratio: M.r?.[name]?.[pg - 1] ?? 1.414 }), null];
  }
  // A multiple choice question on that page whose crop starts where this one does.
  const qs = M.q[paper];
  if (qs && crop) {
    const i = qs.findIndex((e, k) => e[0] === pg && (Math.abs(e[1] - crop.t) < 0.0006 || (mcqUsable(D.q[paper]?.[k]) && Math.abs((D.q[paper][k] as number[])[1] - crop.t) < 0.0006)));
    if (i >= 0) {
      const id = `${paper}#${i + 1}`;
      if (!crop.legacy) return [url, id];
      // Left out by the measuring: keep the old picture rather than none.
      return [mcqPicture(paper, i + 1)?.url ?? url, id];
    }
  }
  // A written question's page.
  const w = M.w[paper]?.find(([, segs]) => segs.some(([p]) => p === pg));
  if (w) {
    const id = `${paper}#${w[0]}`;
    if (crop && !crop.legacy) return [url, id];
    const pages = writtenPages(paper, w[0]);
    const at = w[1].findIndex(([p]) => p === pg);
    return [pages[at] ?? url, id];
  }
  return [url, null];
}

// ---- Request checks -------------------------------------------------------

const ID = /^\d{4}_[msw]\d{2}_\d{2}#\d{1,3}$/;
const SUB = /^\d{1,2}(\.\d{1,2}){0,2}$/;
const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ID.test(x)).slice(0, 2000) : []);
const count = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b.action !== "string") return Response.json({ error: "bad request" }, { status: 400 });

  if (b.action === "view") {
    const urls = Array.isArray(b.urls) ? b.urls.filter((u): u is string => typeof u === "string" && u.length < 300).slice(0, 300) : [];
    const out = urls.map(viewOf);
    return Response.json({ urls: out.map((x) => x[0]), ids: out.map((x) => x[1]) });
  }

  if (b.action === "ms") {
    const id = typeof b.id === "string" && ID.test(b.id) ? b.id : "";
    const p = parseId(id);
    if (!p) return Response.json({ error: "bad request" }, { status: 400 });
    const name = `${p.code}_${p.sess}_ms_${p.pv}`;
    const start = M.m[id];
    const pages = HELD.has(name) ? 0 : (M.n[name] ?? 0);
    if (!start || !pages) return Response.json({ ms: null });
    // Where its answers end: the page the next question's answers start on (they may share it), else the last page.
    const later = Object.entries(M.m)
      .filter(([k, v]) => k.startsWith(`${p.paper}#`) && Number(k.slice(k.indexOf("#") + 1)) > p.n && v >= start)
      .map(([, v]) => v);
    const end = Math.min(pages, later.length ? Math.min(...later) : pages);
    return Response.json({ ms: { name, start: Math.min(start, pages), end: Math.max(Math.min(start, pages), end), pages, ratios: M.r?.[name] ?? null } });
  }

  const codes = Array.isArray(b.codes) ? [...new Set(b.codes.slice(0, 100).filter((c): c is string => typeof c === "string" && ALL_CODES.has(c)))].sort() : [];
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
    const seen = new Set(ids(b.seen));
    const picked = pickQuestions(pool, { subs, mcq: count(b.mcq, 40), written: count(b.written, 10), exclude: ids(b.exclude), seen, seed });
    return Response.json({ questions: await Promise.all(picked.map((q) => built(q, syllabus, subs, seen))) });
  }

  if (b.action === "swap") {
    const id = typeof b.id === "string" && ID.test(b.id) ? b.id : "";
    const seen = new Set(ids(b.seen));
    const next = id ? swapFor(pool, id, ids(b.exclude), seed, seen) : null;
    return Response.json({ question: next ? await built(next, syllabus, next.subs, seen) : null });
  }

  return Response.json({ error: "bad request" }, { status: 400 });
}
