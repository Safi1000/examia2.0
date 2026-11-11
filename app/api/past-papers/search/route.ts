import type { NextRequest } from "next/server";
import pageText from "@/lib/past-paper-text.json";
import questionText from "@/lib/past-paper-qtext.json";
import { PAST_PAPER_SYLLABI, cieCode, fileName, paperHref, paperTitle, papersFor, sessionLabel } from "@/lib/past-papers";

/**
 * Search inside the papers.
 *   ?q=elasticity            → pages of question papers that mention it (with a snippet)
 *   ?q=elasticity&code=2281  → only that syllabus
 *   ?q=elasticity&code=2281&type=q → ids of multiple choice questions that mention it (for topic practice)
 * Text was read from the PDFs; some older papers lost their spaces, so matching ignores spaces and punctuation.
 */
export const runtime = "nodejs";

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type Hit = { u: string; c: string; l: string; p: number; s: string; n: number; y: number };
type Entry = { name: string; code: string; y: number; href: string; c: string; l: string; p: number; text: string; flat: string };

const CODES = new Set(PAST_PAPER_SYLLABI.map((s) => s.code));

/**
 * Recent answers, kept in memory. Every new query scans every page, so a
 * class typing the same few topics (or a script hammering one URL past the
 * CDN) is answered from here instead. Small and capped, oldest out first.
 */
const recent = new Map<string, unknown>();
function remember(key: string, value: unknown) {
  if (recent.size >= 300) recent.delete(recent.keys().next().value as string);
  recent.set(key, value);
  return value;
}

let index: Entry[] | null = null;
function build() {
  if (index) return index;
  const byName = new Map<string, { href: string; c: string; l: string; code: string; y: number }>();
  for (const s of PAST_PAPER_SYLLABI)
    for (const p of papersFor(s.code))
      byName.set(fileName(p.code, p.session, "qp", p.pv), { href: paperHref(s.slug, p), c: cieCode(p), l: `${s.short} · ${sessionLabel(p.session)} · ${paperTitle(p)}`, code: s.code, y: p.session.y });
  index = [];
  for (const [name, pages] of Object.entries(pageText as unknown as Record<string, Array<[string, string]>>)) {
    const m = byName.get(name);
    if (!m) continue;
    for (const [p, text] of pages) index.push({ name, code: m.code, y: m.y, href: m.href, c: m.c, l: m.l, p: Number(p), text, flat: squash(text) });
  }
  return index;
}

function snippet(text: string, q: string): string {
  const letters = q.toLowerCase().replace(/[^a-z0-9]/g, "").split("");
  const re = new RegExp(letters.map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^a-z0-9]*"), "i");
  const m = re.exec(text);
  if (!m) return "";
  const start = Math.max(0, m.index - 70);
  // Text that lost its spaces makes an unreadable snippet: show the page number only.
  const around = text.slice(start, start + 200);
  if ((around.match(/ /g)?.length ?? 0) < around.length / 14) return "";
  const end = Math.min(text.length, m.index + m[0].length + 90);
  return `${start > 0 ? "…" : ""}${text.slice(start, m.index)}⟦${m[0]}⟧${text.slice(m.index + m[0].length, end)}${end < text.length ? "…" : ""}`;
}

export function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  // No code means every syllabus; a code we don't have answers "nothing found" straight away, without a scan.
  const rawCode = req.nextUrl.searchParams.get("code");
  const code = rawCode && CODES.has(rawCode) ? rawCode : null;
  const type = req.nextUrl.searchParams.get("type") === "q" ? "q" : null;
  const flatQ = squash(q);
  const headers = { "Cache-Control": "public, s-maxage=86400, max-age=600" };
  if (flatQ.length < 3 || (rawCode && !code)) return Response.json(type ? { q, ids: [] } : { q, hits: [], total: 0, papers: 0 }, { headers });
  const memo = `${type ?? "p"}|${code ?? ""}|${q.toLowerCase().trim()}`;
  const known = recent.get(memo);
  if (known) return Response.json(known, { headers });

  if (type === "q") {
    const ids = Object.entries(questionText as unknown as Record<string, string>)
      .filter(([id, t]) => (!code || id.startsWith(`${code}_`)) && t.includes(flatQ))
      .map(([id]) => id);
    return Response.json(remember(memo, { q, ids }), { headers });
  }

  const hits: Array<Hit & { e: Entry }> = [];
  for (const e of build()) {
    if (code && e.code !== code) continue;
    let n = 0;
    let at = e.flat.indexOf(flatQ);
    while (at !== -1 && n < 50) {
      n++;
      at = e.flat.indexOf(flatQ, at + flatQ.length);
    }
    if (n) hits.push({ u: `${e.href}?page=${e.p}`, c: e.c, l: e.l, p: e.p, s: "", n, y: e.y, e });
  }
  hits.sort((a, b) => b.y - a.y || b.n - a.n);
  // Snippets only for the hits that are sent, straight from their own page (no second scan).
  const top: Hit[] = hits.slice(0, 60).map(({ e, ...h }) => ({ ...h, s: snippet(e.text, q) }));
  return Response.json(remember(memo, { q, total: hits.length, papers: new Set(hits.map((h) => h.c)).size, hits: top }), { headers });
}
