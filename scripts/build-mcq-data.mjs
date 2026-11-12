/**
 * Builds lib/past-paper-mcq.json: for every multiple choice question in
 * lib/past-paper-meta.json, how a student is shown it in a test or homework
 * built "From past papers".
 *
 *   node scripts/build-mcq-data.mjs            writes lib/past-paper-mcq.json
 *   node scripts/build-mcq-data.mjs --report   also prints the old crop check
 *
 * After writing, it runs scripts/check-mcq-keys.mjs (every answer letter
 * against the mark scheme PDFs) and exits with an error if anything is off.
 *
 * Reads the question papers (PDF) in ../past-papers and the page images in
 * ../past-papers-web on this computer. Nothing is uploaded or copied: the
 * output is a small table of numbers and the typed wording.
 *
 * For each question it finds, from the PDF's own text positions:
 * - where the question starts (its printed number) and ends (the line before
 *   the next number), measured again on the page image so a diagram or table
 *   below the last line of text is kept;
 * - whether the printed number can be cut off by starting the picture at the
 *   question's own text (nothing else in that strip), or must be covered;
 * - whether the question can be typed: plain wording, four options A to D,
 *   no diagram, table, graph, superscript, column layout or odd characters.
 *   When in doubt it stays a picture.
 * - whether it must be left out: options not all found on its page, wording
 *   shared with another question ("Questions 12 and 13"), text above it that
 *   belongs to it, or no answer letter.
 *
 * Output (all fractions of the page, 4 decimals):
 *   { v: 2, q: { "<paper>": [ entry | [0, reason], ... ] } }
 *   entry = [page, top, bottom, left, right, form, cover?, stem?, options?]
 *     form 1 = typed (stem and options are given), 2 = picture
 *     cover = [x, y, w, h] of the printed number when it could not be cut off
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { getDocumentProxy } from "unpdf";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(SITE, "..");
const META = JSON.parse(fs.readFileSync(path.join(SITE, "lib/past-paper-meta.json"), "utf8"));
const REPORT = process.argv.includes("--report");

// ---- Files ---------------------------------------------------------------
const pdfs = new Map();
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".pdf")) pdfs.set(e.name.slice(0, -4), p);
  }
})(path.join(ROOT, "past-papers"));

const DARK = 150;
const r4 = (v) => Math.round(v * 10000) / 10000;

/** A page image, from this computer or (read only, kept in memory) from the site's own /papers. */
const ORIGIN = process.env.PAPERS_URL || "http://localhost:3002/papers";
async function pageImage(name, pg) {
  const file = path.join(ROOT, "past-papers-web", name, `${pg}.jpg`);
  let input = fs.existsSync(file) ? file : null;
  if (!input) {
    try {
      const res = await fetch(`${ORIGIN}/img/${name}/${pg}.jpg`);
      if (res.ok && (res.headers.get("content-type") ?? "").startsWith("image/")) input = Buffer.from(await res.arrayBuffer());
    } catch {}
  }
  if (!input) return null;
  const { data, info } = await sharp(input).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}

// ---- Text ----------------------------------------------------------------
async function readPdf(file) {
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!("str" in it)) continue;
      const [a, b, , d, x, y] = it.transform;
      if (Math.abs(b) > 0.01 || a <= 0) continue; // rotated text (side notes) is never question text
      const size = Math.abs(d) || it.height;
      items.push({ s: it.str, x, base: vp.height - y, w: it.width, h: size, font: it.fontName });
    }
    pages.push({ W: vp.width, H: vp.height, items });
  }
  return pages;
}

/** Items grouped into lines by baseline. */
function linesOf(items) {
  const solid = items.filter((i) => i.s.trim() || i.w > 0);
  const sorted = [...solid].sort((a, b) => a.base - b.base || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.base - it.base) <= 2.2) last.items.push(it);
    else lines.push({ base: it.base, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.words = l.items.filter((i) => i.s.trim());
    // A printed number can come in pieces ("1" and "2" in two fonts): join them.
    while (l.words.length > 1 && /^\d+$/.test(l.words[0].s.trim()) && /^\d+$/.test(l.words[1].s.trim()) && l.words[1].x - (l.words[0].x + l.words[0].w) < 1.5 && l.words[0].x < 64) {
      const [x, y] = l.words;
      const joined = { ...x, s: x.s.trim() + y.s.trim(), w: y.x + y.w - x.x };
      l.items = l.items.filter((i) => i !== x && i !== y);
      l.items.unshift(joined);
      l.words = [joined, ...l.words.slice(2)];
    }
    l.x = l.words[0]?.x ?? 0;
    l.top = l.base - Math.max(...l.words.map((w) => w.h), 0) * 0.8;
  }
  return lines.filter((l) => l.words.length);
}

/** A line's text, with the PDF's own spaces, single spaced. */
/** Bold words wrapped in ** (the paper's own emphasis: "not", "least"). */
function marked(items, bold) {
  const out = items.map((i) => (bold && i.font === bold && i.s.trim() && !/^[ABCD]$/.test(i.s.trim()) ? { ...i, s: `**${i.s.trim()}**` } : i));
  return out;
}
const tidy = (s) => s.replace(/ {2,}/g, " ").replace(/\*\*(\s*)\*\*/g, "$1").replace(/\*\*([.,;:?!)])/g, "$1**").replace(/\*\*([.,;:?!)])\*\*/g, "$1").trim();

function textOf(items) {
  let out = "";
  let end = null;
  for (const it of items) {
    if (end !== null && it.x - end > 1.2 && !out.endsWith(" ") && !it.s.startsWith(" ")) out += " ";
    out += it.s;
    end = it.x + it.w;
  }
  return out.replace(/\s+/g, " ").trim();
}

const FURNITURE = (l, H) => l.base < H * 0.062 || l.base > H * 0.915 || /UCLES|Turn over|BLANK PAGE|papacambridge/i.test(textOf(l.words));

// ---- One paper -------------------------------------------------------------
async function paper(key) {
  const [code, sess, pv] = key.split("_");
  const name = `${code}_${sess}_qp_${pv}`;
  const file = pdfs.get(name);
  const old = META.q[key];
  const answers = META.k[key] ?? "";
  if (!file) return { out: old.map(() => [0, "no pdf"]), checks: [] };
  const pages = await readPdf(file);
  const plines = pages.map((p) => linesOf(p.items).filter((l) => !FURNITURE(l, p.H)));

  // Printed numbers, in order.
  const anchors = [];
  let from = { pg: 0, i: 0 };
  for (let n = 1; n <= old.length; n++) {
    let hit = null;
    for (let pg = from.pg; pg < pages.length && !hit; pg++) {
      const lines = plines[pg];
      for (let i = pg === from.pg ? from.i : 0; i < lines.length; i++) {
        const w = lines[i].words[0];
        if (w.s.trim() === String(n) && w.x < 64 && lines[i].words.length > 1) {
          hit = { n, pg, i, line: lines[i], num: w };
          from = { pg, i: i + 1 };
          break;
        }
      }
    }
    anchors.push(hit);
  }

  const out = [];
  const checks = [];
  const images = new Map();
  const img = async (pg) => {
    if (!images.has(pg)) images.set(pg, await pageImage(name, pg + 1));
    return images.get(pg);
  };

  /** Option letters of question k: bold single letters at its left edge, or a row of them. */
  const regionOf = (k) => {
    const a = anchors[k];
    const lines = plines[a.pg];
    const next = anchors[k + 1]?.pg === a.pg ? anchors[k + 1] : null;
    const own = lines.slice(a.i, next ? next.i : lines.length);
    const letters = [];
    // A letter on its own: first on its line, or one of a row of letters, with
    // a clear gap before its text ("A, B, C and D" in a sentence is not one).
    const stemX0 = a.line.words[1].x;
    for (const [li, l] of own.entries()) {
      const single = l.words.filter((w) => /^[ABCD]$/.test(w.s.trim()));
      // Options sit at the question's own left edge (a row of them starts there).
      if (!single.length || single[0].x < stemX0 - 3 || single[0].x > stemX0 + 16) continue;
      l.words.forEach((w, wi) => {
        if (!/^[ABCD]$/.test(w.s.trim()) || w.x < a.num.x + a.num.w) return;
        if (wi > (li === 0 ? 1 : 0) && single.length < 2) return;
        const nx = l.words[wi + 1];
        if (nx && nx.x - (w.x + w.w) < 5) return;
        letters.push({ L: w.s.trim(), li, w });
      });
    }
    // Lines after the options that are not option D's own text: wording for the next question.
    let tail = own.length;
    if (letters.length === 4 && letters.map((x) => x.L).join("") === "ABCD") {
      const d = letters[3];
      const dText = own[d.li].words.find((w) => w.x > d.w.x + d.w.w) ?? d.w;
      const row = letters[0].li === d.li;
      const edge = row ? letters[0].w.x + 4 : dText.x - 4;
      for (let li = d.li + 1; li < own.length; li++)
        if (own[li].x < edge && own[li].top > own[d.li].base + 3) {
          tail = li;
          break;
        }
    }
    return { a, lines, next, own: own.slice(0, tail), trailing: own.slice(tail), letters };
  };
  const regions = anchors.map((a, k) => (a ? regionOf(k) : null));

  for (let k = 0; k < old.length; k++) {
    const a = anchors[k];
    const n = k + 1;
    if (!a) {
      out.push([0, "number not found"]);
      checks.push({ id: `${key}#${n}`, ok: null });
      continue;
    }
    const P = pages[a.pg];
    const { lines, next, own, letters } = regions[k];
    const prev = anchors[k - 1];
    const above = lines.slice(prev && prev.pg === a.pg ? prev.i : 0, a.i);
    const bold = a.num.font;
    const seq = letters.map((x) => x.L).join("");
    const allText = own.map((l) => textOf(l.words)).join(" ");
    const hasOptions = seq === "ABCD";
    // Options marked on a diagram ("Is the new equilibrium at point A, B, C or D?").
    const onPicture = !letters.length && /\bA\b.{0,20}\bB\b.{0,20}\bC\b.{0,12}\b(or|and)\s+D\b/.test(allText);

    // The image rows this question uses: down to the next question, or to wording meant for it.
    const im = await img(a.pg);
    if (!im) {
      // Held back papers have no page images: never set.
      out.push([0, "no page image"]);
      checks.push({ id: `${key}#${n}`, ok: null });
      continue;
    }
    const sy = im ? im.H / P.H : 1;
    const sx = im ? im.W / P.W : 1;
    const topPx = Math.max(0, Math.floor((a.line.top - 6) * sy));
    const trailingTop = regions[k].trailing[0]?.top;
    let limitPx = trailingTop !== undefined ? Math.floor((trailingTop - 3) * sy) : next ? Math.floor((next.line.top - 2) * sy) : Math.floor(P.H * 0.915 * sy);
    // Nothing of the question comes after option D's lines (a table row's border at most):
    // the rule that ends a paper, or blank page, stays out.
    if (hasOptions) {
      const d = letters[3];
      const lastOwn = own[own.length - 1];
      limitPx = Math.min(limitPx, Math.floor((Math.max(own[d.li].base, lastOwn.base) + 14) * sy));
    }
    let lastDark = Math.ceil(own[own.length - 1].base * sy + 4);
    let leftDark = im ? im.W : 0;
    let rightDark = 0;
    if (im) {
      for (let y = topPx; y < limitPx; y++) {
        let row = false;
        for (let x = Math.floor(im.W * 0.05); x < Math.floor(im.W * 0.95); x++) {
          if (im.data[y * im.W + x] < DARK) {
            row = true;
            if (x < leftDark && !(y < (a.line.base + 3) * sy && x < (a.num.x + a.num.w + 2) * sx)) leftDark = x;
            if (x > rightDark) rightDark = x;
          }
        }
        if (row) lastDark = Math.max(lastDark, y);
      }
    }
    const t = topPx / (im ? im.H : P.H);
    const b = Math.min(limitPx, lastDark + Math.round(10 * sy)) / (im ? im.H : P.H);

    // Old crop check: starts at this number, ends after its last line, shows no other number.
    const [opg, ot, ob] = old[k];
    const numTop = a.line.top / P.H;
    const contentEnd = lastDark / (im ? im.H : P.H);
    const otherInside = anchors.some((o, j) => o && j !== k && o.pg === a.pg && o.line.top / P.H > ot + 0.004 && o.line.top / P.H < ob - 0.004);
    const prevTail = (above.length ? above[above.length - 1].base / P.H : -1) > ot + 0.004;
    const oldOk = opg === a.pg + 1 && ot <= numTop + 0.004 && ob >= contentEnd - 0.006 && !otherInside && !prevTail;
    checks.push({ id: `${key}#${n}`, ok: oldOk, otherInside, prevTail, clipped: ob < contentEnd - 0.006, wrongPage: opg !== a.pg + 1 });

    // Left out: no key, options not all on this page, wording shared with another question.
    const sharedAbove = prev && prev.pg === a.pg ? (regions[k - 1]?.trailing.length ?? 0) > 0 : above.length > 0;
    const skip = (why) => {
      out.push([0, why]);
      if (process.env.DEBUG && (process.env.DEBUG === `${key}#${n}` || process.env.DEBUG === "all")) console.error(`${key}#${n}`, "LEFT OUT", why);
    };
    if (!"ABCD".includes(answers[k] || "-") || !answers[k]) { skip("no answer letter"); continue; }
    if (!hasOptions && !onPicture) { skip(`options ${seq || "none"} on the page`); continue; }
    if (sharedAbove) { skip("wording above the number"); continue; }
    if (/\bquestions?\s+\d{1,2}\b|previous question|same (information|diagram|table)/i.test(allText)) { skip("shares wording with another question"); continue; }
    if (onPicture && !next && anchors[k + 1] && plines[anchors[k + 1].pg].slice(0, anchors[k + 1].i).length) { skip("runs onto the next page"); continue; }

    // Cut the printed number off, or cover it.
    const stemX = a.line.words[1].x;
    const cutX = (stemX - 5) * sx;
    const canCut = im ? leftDark >= cutX + 2 : false;
    const l = canCut ? cutX / (im ? im.W : P.W) : 0.075;
    const rr = Math.min(0.96, Math.max(0.925, (rightDark + 12) / (im ? im.W : P.W)));
    const cover = canCut
      ? null
      : [r4((a.num.x - 3) / P.W), r4((a.line.top - 3) / P.H), r4((a.num.w + 6) / P.W), r4((a.line.base - a.line.top + 6) / P.H)];

    // Typed: strict.
    const typed = onPicture ? { ok: false, why: "options on the diagram" } : typedForm(a, own, letters, bold, im, P, sx, sy, topPx, Math.min(limitPx, lastDark + 2));
    const entry = [a.pg + 1, r4(t), r4(b), r4(l), r4(rr), typed.ok ? 1 : 2, cover];
    if (typed.ok) entry.push(typed.stem, typed.options);
    out.push(entry);
    typedWhy.set(`${key}#${n}`, typed.why ?? "typed");
    if (process.env.DEBUG && (process.env.DEBUG === `${key}#${n}` || process.env.DEBUG === "all")) console.error(`${key}#${n}`, JSON.stringify(entry), typed.why ?? "");
  }
  return { out, checks };
}

const typedWhy = new Map();
const ALLOWED = /^[A-Za-z0-9 .,;:'"()$%£€¥&/?!+\-–—‘’“”=<>…\[\]]+$/;
const LOOKS = /diagram|graph|figure|chart|\btable\b|shaded|\baxis\b|\baxes\b|extract|(shown|given|listed|information|data|details|figures) (below|above)/i;

function typedForm(a, own, letters, bold, im, P, sx, sy, y0, y1) {
  const no = (why) => ({ ok: false, why });
  // Anything drawn that is not text (lines, boxes, pictures) means a picture.
  if (!im) return no("no image");
  const mask = new Uint8Array(im.W * im.H);
  for (const l of own)
    for (const w of l.items) {
      if (!w.s.trim()) continue;
      const x0 = Math.max(0, Math.floor((w.x - 1.5) * sx));
      const x1 = Math.min(im.W, Math.ceil((w.x + w.w + 1.5) * sx));
      const t0 = Math.max(0, Math.floor((w.base - w.h * 1.0 - 1.5) * sy));
      const t1 = Math.min(im.H, Math.ceil((w.base + w.h * 0.3 + 1.5) * sy));
      for (let y = t0; y < t1; y++) mask.fill(1, y * im.W + x0, y * im.W + x1);
    }
  let stray = 0;
  for (let y = y0; y < y1; y++)
    for (let x = Math.floor(im.W * 0.05); x < Math.floor(im.W * 0.95); x++)
      if (im.data[y * im.W + x] < DARK && !mask[y * im.W + x]) stray++;
  if (stray > 25) return no(`drawing (${stray})`);

  // Sizes: superscripts, subscripts or mixed sizes mean a picture.
  const sizes = own.flatMap((l) => l.words.map((w) => w.h)).sort((x, y) => x - y);
  const body = sizes[Math.floor(sizes.length / 2)];
  if (own.some((l) => l.words.some((w) => w.h < body * 0.85 || w.h > body * 1.2))) return no("mixed sizes");
  if (own.some((l) => l.words.some((w) => Math.abs(w.base - l.base) > 1.2))) return no("raised text");

  const aLine = letters[0].li;
  const stemLines = own.slice(0, aLine).map((l, i) => (i === 0 ? { ...l, words: l.words.slice(1), items: l.items.filter((w) => w !== a.num), x: l.words[1].x } : l));
  if (!stemLines.length) return no("no stem");
  const stemX = stemLines[0].words[0].x;
  // Columns inside a line (a table without rules) mean a picture.
  const gappy = (words) => words.some((w, i) => i > 0 && w.x - (words[i - 1].x + words[i - 1].w) > 12);
  if (stemLines.some((l) => gappy(l.words))) return no("columns in the stem");
  // Indented lines are kept as their own lines (lists); anything left of the stem is odd.
  if (stemLines.some((l) => l.x < stemX - 2)) return no("stem layout");
  // Blank space between stem lines starts a new paragraph.
  const stem = [];
  let lastBase = null;
  for (const l of stemLines) {
    const s = tidy(textOf(marked(l.items.filter((w) => w !== a.num), bold)));
    const indented = l.x > stemX + 4;
    const gapBefore = lastBase !== null && l.base - lastBase > body * 1.6;
    if (!stem.length || gapBefore || indented || stem[stem.length - 1].indented) stem.push({ s, indented });
    else stem[stem.length - 1].s += ` ${s}`;
    lastBase = l.base;
  }
  const stemText = stem.map((p) => p.s.replace(/\s+/g, " ").trim()).join("\n");

  // Options.
  const options = [];
  for (let i = 0; i < 4; i++) {
    const L = letters[i];
    const nextL = letters[i + 1];
    const sameLine = nextL && nextL.li === L.li;
    let words;
    if (sameLine) words = own[L.li].items.filter((w) => w.x > L.w.x + L.w.w - 0.5 && w.x < nextL.w.x - 0.5);
    else {
      words = own[L.li].items.filter((w) => w.x > L.w.x + L.w.w - 0.5);
      const stop = nextL ? nextL.li : own.length;
      for (let li = L.li + 1; li < stop; li++) {
        const ln = own[li];
        if (ln.x <= L.w.x + 2) break; // back at the margin: not this option's text
        words = words.concat([{ s: " ", x: 0, w: 0.01 }], ln.items);
      }
    }
    const real = words.filter((w) => w.s.trim());
    if (!real.length) return no("empty option");
    if (gappy(real)) return no("columns in an option");
    options.push(tidy(textOf(marked(words.filter((w) => w.w > 0 || w.s.trim()), bold))));
  }
  // Lines after option D that are not its own text.
  const dLi = letters[3].li;
  const dTextX = own[dLi].items.find((w) => w.x > letters[3].w.x + letters[3].w.w - 0.5)?.x ?? 0;
  if (own.slice(dLi + 1).some((l) => l.x < dTextX - 4)) return no("text after the options");
  const all = [stemText, ...options].map((s) => s.replace(/\*\*/g, ""));
  if ([stemText, ...options].some((s) => (s.match(/\*\*/g) ?? []).length % 2)) return no("emphasis");
  if (all.some((s) => !ALLOWED.test(s.replace(/\n/g, " ")))) return no("characters");
  if (all.some((s) => s.split(/\s+/).some((w) => w.length > 24))) return no("joined words");
  if (LOOKS.test(all[0])) return no("refers to a picture");
  if (all[0].length < 12 || !/[?:.]$/.test(all[0])) return no("stem ending");
  if (options.some((o) => o.length > 220)) return no("long option");
  return { ok: true, stem: stemText, options };
}

// ---- All papers -----------------------------------------------------------
const result = { v: 2, q: {} };
const allChecks = [];
const keys = Object.keys(META.q).sort();
const only = process.argv.find((x) => x.startsWith("--only="))?.slice(7).split(",");
for (const key of keys) {
  if (only && !only.includes(key)) continue;
  const { out, checks } = await paper(key);
  result.q[key] = out;
  allChecks.push(...checks);
}

// ---- Written questions: the printed number to cover; insert pages to show ---
result.w = {};
result.i = {};
const writtenKeys = Object.keys(META.w ?? {}).sort();
let wCovered = 0, wMissing = 0;
for (const key of only ? [] : writtenKeys) {
  const [code, sess, pv] = key.split("_");
  const name = `${code}_${sess}_qp_${pv}`;
  const file = pdfs.get(name);
  if (!file) continue;
  const pages = await readPdf(file);
  for (const [n, segs] of META.w[key]) {
    const pg = segs[0]?.[0];
    const P = pages[pg - 1];
    if (!P) continue;
    const line = linesOf(P.items).find((l) => l.words[0].s.trim() === String(n) && l.words[0].x < 64 && l.words.length > 1);
    if (!line) { wMissing++; continue; }
    const w = line.words[0];
    result.w[`${key}#${n}`] = [r4((w.x - 3) / P.W), r4((line.top - 3) / P.H), r4((w.w + 6) / P.W), r4((line.base - line.top + 6) / P.H)];
    wCovered++;
  }
  const ins = `${code}_${sess}_in_${pv}`;
  if (pdfs.has(ins) && META.n[ins]) {
    const ip = await readPdf(pdfs.get(ins));
    const show = [];
    ip.forEach((P, i) => {
      const text = linesOf(P.items).map((l) => textOf(l.words)).join(" ");
      const body = linesOf(P.items).filter((l) => !FURNITURE(l, P.H)).map((l) => textOf(l.words)).join(" ");
      // The cover (page 1) names the paper. Newer inserts print "0450/21/INSERT" on every page, so only page 1 counts.
      if (i === 0 && /\bINSERT\b/.test(text) && text.includes(code)) return;
      if (!body.trim() || /^\s*BLANK PAGE\s*$/i.test(body)) return;
      if (/Permission to reproduce|copyright acknowledgements/i.test(body) && body.length < 1200 && i === ip.length - 1) return;
      show.push(i + 1);
    });
    result.i[ins] = show;
  }
}
console.error(JSON.stringify({ writtenNumbersCovered: wCovered, writtenNumbersNotFound: wMissing, inserts: Object.keys(result.i).length }));

let typed = 0, pics = 0, excl = 0;
const reasons = {};
for (const list of Object.values(result.q))
  for (const e of list) {
    if (e[0] === 0) { excl++; reasons[e[1]] = (reasons[e[1]] ?? 0) + 1; }
    else if (e[5] === 1) typed++;
    else pics++;
  }
const whys = {};
for (const w of typedWhy.values()) whys[w.replace(/\s*\(\d+\)/, "")] = (whys[w.replace(/\s*\(\d+\)/, "")] ?? 0) + 1;
console.error(JSON.stringify({ questions: typed + pics + excl, typed, pictures: pics, excluded: excl, reasons, pictureReasons: whys }, null, 1));
if (REPORT) {
  const known = allChecks.filter((c) => c.ok !== null);
  const bad = known.filter((c) => !c.ok);
  console.error(JSON.stringify({ oldChecked: known.length, oldGood: known.length - bad.length, otherNumberInside: bad.filter((c) => c.otherInside).length, previousTail: bad.filter((c) => c.prevTail).length, clipped: bad.filter((c) => c.clipped).length, wrongPage: bad.filter((c) => c.wrongPage).length, sampleBad: bad.slice(0, 15).map((c) => c.id) }, null, 1));
}
if (!only) {
  fs.writeFileSync(path.join(SITE, "lib/past-paper-mcq.json"), JSON.stringify(result));
  // Prove the answer letters again against the mark schemes (see that script).
  const { spawnSync } = await import("node:child_process");
  const check = spawnSync(process.execPath, [path.join(SITE, "scripts/check-mcq-keys.mjs")], { stdio: "inherit" });
  if (check.status !== 0) {
    console.error("Answer key check failed: fix the problems above before using this data.");
    process.exit(1);
  }
}
