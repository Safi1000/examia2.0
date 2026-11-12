/**
 * Proves the answer letters behind every past paper multiple choice question
 * the builder can set, against Cambridge's own mark schemes.
 *
 *   node scripts/check-mcq-keys.mjs            prints a summary, exits 1 on any problem
 *   node scripts/check-mcq-keys.mjs --list     also lists every withdrawn or unchecked question
 *
 * Run it before and after any rebuild of lib/past-paper-meta.json or
 * lib/past-paper-mcq.json (scripts/build-mcq-data.mjs).
 *
 * What it checks, reading only files on this computer:
 * 1. Every answer key in lib/past-paper-meta.json (meta.k), letter by letter,
 *    against the "Question | Answer | Marks" table of the paper's mark scheme
 *    PDF in ../past-papers. A question the mark scheme withdraws, discounts or
 *    gives more than one answer for must not carry a single letter in the key.
 * 2. Every question the builder can set (buildPool from lib/paper-builder.ts,
 *    the same function the server uses): its mark scheme exists here, gives
 *    exactly one letter, and that letter is the stored key.
 * 3. The question as saved (questionFromBuilt): the stored correctIndex is
 *    that letter (0 = A ... 3 = D); a picture question's buttons read A, B, C,
 *    D in order; a typed question's four options are the paper's options A to
 *    D, in the paper's order (found again in the question paper's own text).
 * 4. Older saved pictures ("view"): no crop top can be mistaken for another
 *    question's on the same page.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// lib/paper-builder.ts is TypeScript: run again with Node's type stripping.
if (!process.execArgv.includes("--experimental-strip-types") && !process.env.MCQ_CHECK_CHILD) {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, MCQ_CHECK_CHILD: "1" },
  });
  process.exit(r.status ?? 1);
}

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(SITE, "..");
const LIST = process.argv.includes("--list");
const { getDocumentProxy } = await import("unpdf");
const { buildPool, questionFromBuilt, ALL_CODES, mcqUsable } = await import(path.join(SITE, "lib/paper-builder.ts"));

const json = (f) => JSON.parse(fs.readFileSync(path.join(SITE, f), "utf8"));
const META = json("lib/past-paper-meta.json");
const TAGS = json("lib/past-paper-tags.json");
const DATA = json("lib/past-paper-mcq.json");

// --self-test: plant two faults in memory (one wrong key letter, one typed
// question with options B and C swapped) and make sure both are caught.
const SELF_TEST = process.argv.includes("--self-test");
const planted = [];
if (SELF_TEST) {
  const key = Object.keys(META.k).sort().find((k) => DATA.q[k]?.some((e) => e[5] === 1 && e[0] !== 0));
  const i = DATA.q[key].findIndex((e) => e[5] === 1 && e[0] !== 0);
  const o = DATA.q[key][i][8];
  [o[1], o[2]] = [o[2], o[1]];
  planted.push(`${key}#${i + 1}`);
  const j = [...META.k[key]].findIndex((c, x) => x !== i && "ABCD".includes(c));
  META.k[key] = META.k[key].slice(0, j) + "ABCD"[("ABCD".indexOf(META.k[key][j]) + 1) % 4] + META.k[key].slice(j + 1);
  planted.push(`${key} Q${j + 1}`);
}

const pdfs = new Map();
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".pdf")) pdfs.set(e.name.slice(0, -4), p);
  }
})(path.join(ROOT, "past-papers"));

/** Each page's text as lines (items on one baseline, left to right). */
async function pdfLines(file) {
  const pdf = await getDocumentProxy(new Uint8Array(fs.readFileSync(file)));
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    const items = tc.items
      .filter((t) => "str" in t && t.str.trim() && Math.abs(t.transform[1]) < 0.01)
      .map((t) => ({ s: t.str.trim(), x: t.transform[4], y: t.transform[5] }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    for (const it of items) {
      const l = lines[lines.length - 1];
      if (l && Math.abs(l.y - it.y) < 2.5) l.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    }
    for (const l of lines) l.items.sort((a, b) => a.x - b.x);
    pages.push(lines.map((l) => l.items.map((t) => t.s)));
  }
  return pages;
}

/**
 * The mark scheme's answers: question number → one letter, or null with the
 * cell's wording when it is not exactly one letter (withdrawn, discounted,
 * two answers accepted, a note).
 */
async function markScheme(file) {
  const rows = new Map();
  const odd = [];
  for (const lines of await pdfLines(file))
    for (const cells of lines) {
      if (!/^\d{1,2}$/.test(cells[0]) || cells.length < 2) continue;
      // Rows are "n | answer | marks"; a long note can lose its marks cell.
      const n = Number(cells[0]);
      const answer = cells.slice(1, /^\d$/.test(cells[cells.length - 1]) && cells.length > 2 ? -1 : undefined).join(" ");
      if (rows.has(n)) {
        odd.push(`question ${n} appears twice`);
        continue;
      }
      rows.set(n, /^[ABCD]$/.test(answer) ? { letter: answer } : { letter: null, note: answer });
    }
  return { rows, odd };
}

const problems = [];
const problem = (s) => problems.push(s);

// ---- 1. Every key, letter by letter ---------------------------------------
const msByPaper = new Map();
let keyLetters = 0, keyMatched = 0, withdrawn = [];
const noMs = [];
for (const key of Object.keys(META.k).sort()) {
  const [code, sess, pv] = key.split("_");
  const file = pdfs.get(`${code}_${sess}_ms_${pv}`);
  if (!file) {
    noMs.push(key);
    continue;
  }
  const ms = await markScheme(file);
  msByPaper.set(key, ms);
  for (const o of ms.odd) problem(`${key}: mark scheme ${o}`);
  const stored = META.k[key];
  const count = META.q[key]?.length ?? 0;
  if (stored.length !== count) problem(`${key}: key has ${stored.length} letters for ${count} questions`);
  const nums = [...ms.rows.keys()];
  if (nums.length !== stored.length || nums.some((n, i) => n !== i + 1)) problem(`${key}: mark scheme lists questions ${nums[0]} to ${nums[nums.length - 1]} (${nums.length}), key has ${stored.length}`);
  for (let i = 0; i < stored.length; i++) {
    const row = ms.rows.get(i + 1);
    const k = stored[i];
    if (!row) continue;
    if (row.letter) {
      keyLetters++;
      if (k === row.letter) keyMatched++;
      else problem(`${key} Q${i + 1}: stored ${k}, mark scheme ${row.letter}`);
    } else {
      withdrawn.push(`${key} Q${i + 1}: "${row.note}" (stored "${k}")`);
      if ("ABCD".includes(k)) problem(`${key} Q${i + 1}: mark scheme says "${row.note}" but the key holds the letter ${k}`);
    }
  }
}

// ---- 2. and 3. Every question the builder can set -------------------------
const pool = buildPool(META, TAGS, [...ALL_CODES], DATA).filter((q) => q.kind === "mcq");
const qpCache = new Map();
async function qpText(paper, pg) {
  const [code, sess, pv] = paper.split("_");
  const name = `${code}_${sess}_qp_${pv}`;
  if (!qpCache.has(name)) qpCache.set(name, pdfs.has(name) ? await pdfLines(pdfs.get(name)) : null);
  const pages = qpCache.get(name);
  return pages ? pages.slice(pg - 1, pg + 1).flat().map((l) => l.join(" ")).join(" ") : null;
}
const norm = (s) => s.replace(/\*\*/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, "");

let settable = 0, settableOk = 0, typedCount = 0, pictureCount = 0;
for (const q of pool) {
  settable++;
  const id = q.id;
  const ms = msByPaper.get(q.paper);
  const row = ms?.rows.get(q.n);
  if (!ms) { problem(`${id}: settable but its mark scheme is not on this computer`); continue; }
  if (!row?.letter) { problem(`${id}: settable but the mark scheme gives "${row?.note ?? "nothing"}"`); continue; }
  const stored = META.k[q.paper][q.n - 1];
  if (stored !== row.letter) { problem(`${id}: settable with key ${stored}, mark scheme ${row.letter}`); continue; }

  // The question exactly as /api/paper-builder builds it, then as it is saved.
  const e = DATA.q[q.paper]?.[q.n - 1];
  if (!mcqUsable(e)) { problem(`${id}: settable without measured data`); continue; }
  const typed = e[5] === 1 && e[7] && e[8]?.length === 4 ? { stem: e[7], options: e[8] } : undefined;
  const built = { id, kind: "mcq", label: "", topic: "", sub: "", attachments: ["x"], typed, answer: "ABCD".indexOf(stored), marks: 1, minutes: 1 };
  const saved = questionFromBuilt(built);
  const want = "ABCD".indexOf(row.letter);
  if (saved.correctIndex !== want) { problem(`${id}: saved correctIndex ${saved.correctIndex}, mark scheme ${row.letter} (${want})`); continue; }
  if (saved.options.length !== 4) { problem(`${id}: ${saved.options.length} options saved`); continue; }
  if (typed) {
    typedCount++;
    // A typed question whose options are bare letters would be shown as a picture with no picture.
    if (typed.options.every((o) => /^[A-D]$/.test(o.trim()))) { problem(`${id}: typed options are bare letters`); continue; }
    if (saved.attachments.length) { problem(`${id}: typed question also carries a picture`); continue; }
    // Each option follows its own letter in the paper, in order A, B, C, D.
    const text = norm((await qpText(q.paper, e[0])) ?? "");
    if (!text) { problem(`${id}: question paper text not found`); continue; }
    const stemAt = text.indexOf(norm(typed.stem).slice(0, 60));
    if (stemAt < 0) { problem(`${id}: typed stem not found in the paper`); continue; }
    let at = stemAt, ok = true;
    for (let i = 0; i < 4; i++) {
      const hit = text.indexOf("ABCD"[i] + norm(typed.options[i]), at);
      if (hit < 0 || (i === 0 && hit - stemAt > norm(typed.stem).length + 400)) { ok = false; break; }
      at = hit + 1;
    }
    if (!ok) { problem(`${id}: typed options do not follow the letters A to D in the paper`); continue; }
  } else {
    pictureCount++;
    if (saved.options.join("") !== "ABCD") { problem(`${id}: picture buttons read ${saved.options.join("")}`); continue; }
    if (saved.options[saved.correctIndex] !== row.letter) { problem(`${id}: picture answer button ${saved.options[saved.correctIndex]}`); continue; }
  }
  settableOk++;
}

// ---- 4. Older pictures: crop tops are told apart -------------------------
let viewClashes = 0;
for (const [paper, list] of Object.entries(META.q)) {
  const tops = [];
  list.forEach((m, k) => {
    tops.push({ k, pg: m[0], t: m[1] });
    const d = DATA.q[paper]?.[k];
    if (mcqUsable(d)) tops.push({ k, pg: d[0], t: d[1] });
  });
  for (const a of tops)
    for (const b of tops)
      if (a.k < b.k && a.pg === b.pg && Math.abs(a.t - b.t) < 0.0006) {
        viewClashes++;
        problem(`${paper}: questions ${a.k + 1} and ${b.k + 1} share a crop top on page ${a.pg} (an older picture could be read as the wrong one)`);
      }
}

// ---- Report ----------------------------------------------------------------
const papers = Object.keys(META.k).length;
console.log(`Answer keys: ${papers} papers, ${msByPaper.size} with a mark scheme here.`);
console.log(`  ${keyLetters} single letter answers in the mark schemes, ${keyMatched} match the stored key.`);
console.log(`  ${withdrawn.length} withdrawn or not single letter in the mark scheme (never set).`);
if (noMs.length) console.log(`  ${noMs.length} papers without a mark scheme here: ${noMs.join(", ")}`);
console.log(`Settable multiple choice: ${settable} (${typedCount} typed, ${pictureCount} pictures), ${settableOk} proved right end to end.`);
console.log(`Older picture lookups: ${viewClashes} clashes.`);
if (LIST) for (const w of withdrawn) console.log(`  withdrawn: ${w}`);
if (SELF_TEST) {
  const caught = planted.filter((p) => problems.some((x) => x.startsWith(`${p}:`)));
  console.log(`\nSelf test: planted ${planted.join(" and ")}; caught ${caught.length} of ${planted.length}.`);
  process.exit(caught.length === planted.length ? 0 : 1);
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}
console.log("\nAll good.");
