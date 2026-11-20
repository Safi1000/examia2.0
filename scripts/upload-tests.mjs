#!/usr/bin/env node
/**
 * Adds Hamza's topic tests to the portal as DRAFTS (students can't see a draft).
 * Hamza then checks each one in the console and presses Publish there.
 *
 *   node site/scripts/upload-tests.mjs --plan            where each test goes + the latest test names
 *   node site/scripts/upload-tests.mjs --dry             build every test and print it, upload nothing
 *   node site/scripts/upload-tests.mjs [folder ...]      upload (all, or the folders named)
 *   node site/scripts/upload-tests.mjs --check           read-only: is every test ready to open?
 *   add --replace to swap an existing draft, or correct a published test nobody has started
 *
 * Reads tests/_source/upload.json:
 *   { "opensAt": "...+05:00", "closesAt": "...+05:00", "durationMinutes": 40, "uploadMinutes": 5,
 *     "tests": [ { "folder": "...", "level": "A2", "subject": "Accounting", "title": "..." } ] }
 * Each folder has tests/_source/<folder>/question-paper.md and mark-scheme.md, and the
 * printed paper at tests/<folder>/Question paper.pdf.
 * The upload key is the notes key ("hamzateaches-notes-key.txt" in Downloads).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TESTS = resolve(here, "../../tests");
const SRC = join(TESTS, "_source");
const SITE = process.env.NOTES_SITE || "https://www.hamzateaches.com";
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const only = args.filter((a) => !a.startsWith("--"));

function findKey() {
  const spots = [resolve(here, "../../notes-upload-key.txt")];
  const dl = join(homedir(), "Downloads");
  if (existsSync(dl)) {
    spots.push(...readdirSync(dl).filter((f) => /^hamzateaches-notes-key.*\.txt$/.test(f)).map((f) => join(dl, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs));
  }
  for (const p of spots) if (existsSync(p)) { const k = readFileSync(p, "utf8").trim(); if (k.startsWith("htn_")) return k; }
  return null;
}

async function api(key, body) {
  const res = await fetch(`${SITE}/api/tests/import`, { method: "POST", headers: { "Content-Type": "application/json", "x-notes-key": key }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** Markdown to plain text for a question: no bold marks, tables as "a | b" lines. */
function plain(md) {
  return md
    .split("\n")
    .filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l))
    .map((l) => (/^\s*\|/.test(l) ? l.trim().replace(/^\|\s*|\s*\|$/g, "").replace(/\s*\|\s*/g, "  |  ") : l))
    .join("\n")
    .replace(/\*\*/g, "")
    .replace(/(^|\W)\*(\S[^*]*?)\*(?=\W|$)/g, "$1$2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sections(md) {
  const parts = md.split(/^## /m).slice(1).map((p) => ({ head: p.split("\n")[0], body: p.slice(p.indexOf("\n") + 1) }));
  return parts;
}

function build(t) {
  const qp = readFileSync(join(SRC, t.folder, "question-paper.md"), "utf8");
  const ms = readFileSync(join(SRC, t.folder, "mark-scheme.md"), "utf8");
  const header = Number((qp.match(/40 minutes · (\d+) marks/) || [])[1]);
  const secs = sections(qp);
  const secA = secs.find((s) => /^Section A/i.test(s.head));
  const mcqs = [];
  if (secA) {
    const chunks = secA.body.split(/^\*\*(\d+)\.\*\*\s*/m).slice(1);
    for (let i = 0; i < chunks.length; i += 2) {
      const n = Number(chunks[i]);
      const lines = chunks[i + 1].split("\n");
      const first = lines.findIndex((l) => /^- [A-D]\. /.test(l));
      const options = lines.filter((l) => /^- [A-D]\. /.test(l)).map((l) => plain(l.replace(/^- [A-D]\. /, "")));
      mcqs.push({ n, prompt: plain(lines.slice(0, first).join("\n")), options });
    }
    // Keys from the mark scheme's table: | 1 | B | ... (key may be bold)
    const keys = {};
    for (const m of ms.matchAll(/^\|\s*(\d+)\s*\|\s*\**\s*([A-D])\s*\**\s*\|/gm)) if (!(m[1] in keys)) keys[m[1]] = m[2];
    for (const q of mcqs) {
      const k = keys[q.n];
      if (!k) throw new Error(`${t.folder}: no key for MCQ ${q.n}`);
      if (q.options.length !== 4) throw new Error(`${t.folder}: MCQ ${q.n} has ${q.options.length} options`);
      q.correctIndex = "ABCD".indexOf(k);
      q.key = k;
    }
  }
  const sectionAMarks = secA ? Number((secA.head.match(/\((\d+) marks\)/) || [])[1]) : 0;
  if (secA && sectionAMarks !== mcqs.length) throw new Error(`${t.folder}: Section A says ${sectionAMarks} marks but has ${mcqs.length} MCQs`);
  const written = secs.filter((s) => !/^Section A/i.test(s.head));
  const writtenMarks = written.reduce((s, x) => s + [...x.body.matchAll(/\*\*\[(\d+)\]\*\*/g)].reduce((a, m) => a + Number(m[1]), 0), 0);
  if (sectionAMarks + writtenMarks !== header) throw new Error(`${t.folder}: header ${header} but A ${sectionAMarks} + written ${writtenMarks}`);
  const nums = written.flatMap((x) => [...x.body.matchAll(/^\*\*(\d+)\./gm)].map((m) => Number(m[1])));
  const range = nums.length ? (nums.length === 1 ? `Question ${nums[0]}` : nums.length === 2 ? `Questions ${nums[0]} and ${nums[1]}` : `Questions ${Math.min(...nums)} to ${Math.max(...nums)}`) : "the written questions";
  const writtenPrompt = "Submit your handwritten answers to these questions.";
  const topic = (qp.match(/^# [^:]+:\s*(.+)$/m) || [])[1]?.trim() || "General";
  return { header, mcqs, writtenMarks, writtenPrompt, topic, pdf: join(SRC, "_upload", `${t.folder}.pdf`) };
}

async function toStorage(path, cloud, preset) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(path)], { type: "application/pdf" }), "paper.pdf");
  form.append("upload_preset", preset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.secure_url) throw new Error(`file storage refused the paper (${res.status}) ${JSON.stringify(json.error || "")}`);
  const pages = Math.max(1, json.pages ?? 1);
  const urls = Array.from({ length: pages }, (_, i) => json.secure_url.replace("/upload/", `/upload/pg_${i + 1}/`).replace(/\.pdf$/i, ".jpg"));
  for (const u of urls) {
    const r = await fetch(u, { method: "GET" });
    if (!r.ok) throw new Error(`page did not load: ${u} (${r.status})`);
  }
  return urls;
}

const cfg = JSON.parse(readFileSync(join(SRC, "upload.json"), "utf8"));
const todo = cfg.tests.filter((t) => !only.length || only.includes(t.folder));
const built = todo.map((t) => ({ t, b: build(t) }));

if (flag("--dry")) {
  for (const { t, b } of built) {
    console.log(`\n=== ${t.title}  [${t.level} ${t.subject}]  ${b.header} marks`);
    for (const q of b.mcqs) console.log(`  MCQ ${q.n} (key ${q.key}): ${q.prompt.slice(0, 90).replace(/\n/g, " / ")}`);
    console.log(`  Written: ${b.writtenMarks} marks, PDF ${existsSync(b.pdf) ? "found" : "MISSING"}`);
    console.log(`  Prompt: ${b.writtenPrompt}`);
  }
  console.log(`\nOpens ${cfg.opensAt}, closes ${cfg.closesAt}, ${cfg.durationMinutes} min + ${cfg.uploadMinutes} min upload. Nothing uploaded.`);
  process.exit(0);
}

const key = findKey();
if (!key) {
  console.log("NO KEY. In the console: Settings, Notes from Claude, Make upload key. Then run this again.");
  process.exit(1);
}

if (flag("--check")) {
  // Read-only: is each test ready to open? (published, times, class and subject, keys, marks, pages load)
  const pk = (iso) => new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Karachi", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
  const res = await api(key, { action: "check", titles: todo.map((t) => t.title) });
  if (!res.ok) { console.log(`Check failed (${res.status}): ${JSON.stringify(res.data)}`); process.exit(1); }
  for (const m of res.data.missing) console.log(`\n✗ ${m}: NOT IN THE PORTAL`);
  let allOk = res.data.missing.length === 0;
  for (const t of res.data.tests) {
    const want = todo.find((x) => x.title === t.title);
    const problems = [];
    if (t.status === "draft") problems.push("still a DRAFT (students can't see it until you press Publish)");
    if (t.status === "closed") problems.push("status is CLOSED");
    const opens = Date.parse(t.opensAt), closes = Date.parse(t.closesAt);
    if (closes - opens < (t.durationMinutes + t.uploadMinutes) * 60000) problems.push("the window is shorter than writing + upload time");
    if (closes < Date.now()) problems.push("the closing time has already passed");
    if (want && cfg.opensAt && Date.parse(cfg.opensAt) !== opens) problems.push(`opens ${pk(t.opensAt)}, planned ${pk(cfg.opensAt)}`);
    if (want && cfg.closesAt && Date.parse(cfg.closesAt) !== closes) problems.push(`closes ${pk(t.closesAt)}, planned ${pk(cfg.closesAt)}`);
    if (!t.className || !t.subjectName) problems.push("no class or no subject set (it would go to every student)");
    const mcqs = t.questions.filter((q) => q.type === "mcq");
    mcqs.forEach((q, i) => {
      if (q.key === null || q.key === undefined) problems.push(`MCQ ${i + 1} has NO answer key`);
      if (q.options < 2) problems.push(`MCQ ${i + 1} has ${q.options} options`);
    });
    for (const [i, q] of t.questions.entries()) if (!(q.marks >= 1)) problems.push(`question ${i + 1} has ${q.marks} marks`);
    const photo = t.questions.filter((q) => q.type === "photo");
    if (!photo.length) problems.push("no photo-answer question for the written part");
    for (const q of photo) {
      if (!q.pages.length) problems.push("the written part has no paper pages");
      for (const u of q.pages) { const r = await fetch(u); if (!r.ok) problems.push(`a paper page does not load (${r.status})`); }
    }
    const total = t.questions.reduce((s, q) => s + q.marks, 0);
    if (total % 5 !== 0) problems.push(`total is ${total}, not a round number`);
    if (problems.length) allOk = false;
    console.log(`\n${problems.length ? "✗" : "✓"} ${t.title}  [${t.status}, ${t.testCode}]  ${t.className} / ${t.subjectName}`);
    console.log(`  ${pk(t.opensAt)} to ${pk(t.closesAt)} · ${t.durationMinutes} min + ${t.uploadMinutes} min upload · ${mcqs.length} MCQs (keys ${mcqs.filter((q) => q.key !== null && q.key !== undefined).length}/${mcqs.length}) · written ${photo.reduce((s, q) => s + q.marks, 0)} marks on ${photo.reduce((s, q) => s + q.pages.length, 0)} page(s) · total ${total} · ${t.submissions} started`);
    for (const q of photo) console.log(`  Written prompt: "${q.prompt}"`);
    for (const p of problems) console.log(`  ! ${p}`);
  }
  console.log(allOk ? "\nAll ready." : "\nFix the ! lines above.");
  process.exit(0);
}

const plan = await api(key, { action: "plan", items: todo.map((t) => ({ level: t.level, subject: t.subject })) });
if (!plan.ok) {
  console.log(`Plan failed (${plan.status}): ${JSON.stringify(plan.data)}`);
  process.exit(1);
}
if (flag("--plan")) {
  console.log("Where each test goes:");
  plan.data.items.forEach((it, i) => console.log(`  ${todo[i].title}: class ${JSON.stringify(it.classes?.map((c) => c.name))}, subject ${JSON.stringify(it.subjects?.map((s) => s.name))}${it.error ? " ERROR " + it.error : ""}`));
  console.log("\nLatest tests in the portal:");
  for (const r of plan.data.recent) console.log(`  [${r.status}] ${r.title}  (${r.subject}, ${r.test_code})`);
  process.exit(0);
}

for (const { t, b } of built) {
  if (!existsSync(b.pdf)) { console.log(`SKIP ${t.title}: no written-section PDF (run render.mjs)`); continue; }
  try {
    const pages = await toStorage(b.pdf, plan.data.cloud, plan.data.preset);
    const questions = [
      ...b.mcqs.map((q) => ({ type: "mcq", prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, marks: 1, topic: b.topic })),
      { type: "photo", prompt: b.writtenPrompt, marks: b.writtenMarks, topic: b.topic, attachments: pages },
    ];
    const res = await api(key, {
      action: "create", level: t.level, subject: t.subject, title: t.title,
      durationMinutes: cfg.durationMinutes, uploadMinutes: cfg.uploadMinutes, opensAt: cfg.opensAt, closesAt: cfg.closesAt,
      questions, replace: flag("--replace"),
    });
    if (!res.ok) console.log(`FAILED ${t.title} (${res.status}): ${JSON.stringify(res.data)}`);
    else console.log(`${res.data.updated ? "UPDATED (" + res.data.status + ")" : "DRAFT"} ${t.title}: ${res.data.class} / ${res.data.subject}, ${res.data.questions} questions, ${res.data.total} marks, ${pages.length} pages, code ${res.data.testCode}`);
  } catch (e) {
    console.log(`FAILED ${t.title}: ${e.message}`);
  }
}
