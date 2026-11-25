/**
 * Builds lib/past-paper-dups.json: which multiple choice questions are the
 * same question printed in more than one paper (Cambridge reuses questions
 * across variants and series, and 0452 / 7707 share papers).
 *
 *   node scripts/build-practice-dups.mjs            writes lib/past-paper-dups.json
 *   node scripts/build-practice-dups.mjs --report   also prints sample groups
 *
 * For every question crop in lib/past-paper-meta.json it reads the printed
 * words inside the crop from the question paper PDF in ../past-papers, drops
 * the question number and the A to D labels, and sorts the words (so a
 * repeat with its options shuffled still matches). Questions with fewer than
 * 10 words (mostly a diagram) are never grouped, to avoid false matches.
 *
 * Output: { v: 1, d: { "<question id>": "<group id>" } }, only for questions
 * that have at least one twin. The group id is the first id of the group.
 * The phone app uses it so one practice set never shows the same question twice.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { getDocumentProxy } from "unpdf";

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(SITE, "..");
const META = JSON.parse(fs.readFileSync(path.join(SITE, "lib/past-paper-meta.json"), "utf8"));
const REPORT = process.argv.includes("--report");
const MIN_WORDS = 10;

const pdfs = new Map();
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".pdf")) pdfs.set(e.name.slice(0, -4), p);
  }
})(path.join(ROOT, "past-papers"));

async function readPdf(file) {
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = [];
    for (const it of tc.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      const [a, b, , , x, y] = it.transform;
      if (Math.abs(b) > 0.01 || a <= 0) continue; // rotated side notes
      items.push({ s: it.str, x, y: (vp.height - y) / vp.height });
    }
    pages.push(items);
  }
  return pages;
}

/** Sorted bag of words for one crop, or null when too few words to trust. */
function wordsIn(items, top, bottom) {
  const inside = items.filter((it) => it.y > top && it.y <= bottom + 0.004);
  const text = inside
    .map((it) => it.s)
    .join(" ")
    .toLowerCase()
    .replace(/papacambridge|ucles|turn over|\[turn over/g, " ");
  const words = text.split(/[^a-z0-9$%.]+/).filter((w) => w && !/^[abcd]$/.test(w) && !/^\d{1,2}$/.test(w));
  if (words.length < MIN_WORDS) return null;
  words.sort();
  return words.join(" ");
}

const byFp = new Map();
let read = 0;
let skipped = 0;
let missing = 0;
for (const key of Object.keys(META.q)) {
  const [code, sess, pv] = key.split("_");
  const file = pdfs.get(`${code}_${sess}_qp_${pv}`);
  if (!file) {
    missing++;
    continue;
  }
  const pages = await readPdf(file);
  META.q[key].forEach(([page, top, bottom], i) => {
    const items = pages[page - 1];
    const w = items ? wordsIn(items, top, bottom) : null;
    if (!w) {
      skipped++;
      return;
    }
    read++;
    const fp = crypto.createHash("sha1").update(w).digest("hex").slice(0, 16);
    const id = `${key}#${i + 1}`;
    const list = byFp.get(fp);
    if (list) list.push({ id, w });
    else byFp.set(fp, [{ id, w }]);
  });
}

const d = {};
let groups = 0;
let twins = 0;
const samples = [];
for (const list of byFp.values()) {
  if (list.length < 2) continue;
  groups++;
  const ids = list.map((x) => x.id).sort();
  for (const id of ids) d[id] = ids[0];
  twins += ids.length;
  if (samples.length < 12) samples.push({ ids, words: list[0].w.slice(0, 140) });
}

const sorted = Object.fromEntries(Object.keys(d).sort().map((k) => [k, d[k]]));
fs.writeFileSync(path.join(SITE, "lib/past-paper-dups.json"), JSON.stringify({ v: 1, d: sorted }) + "\n");
console.log(`papers missing a PDF: ${missing}; questions read: ${read}; too few words: ${skipped}`);
console.log(`groups of repeats: ${groups}; questions in them: ${twins}`);
if (REPORT) for (const s of samples) console.log(s.ids.join("  "), "\n   ", s.words);
