#!/usr/bin/env node
/**
 * Files finished notes on the portal, on the right chapter.
 *
 *   node scripts/upload-notes.mjs                 show the plan (changes nothing)
 *   node scripts/upload-notes.mjs --publish       upload everything new in the plan
 *   node scripts/upload-notes.mjs --publish --replace "A2/Economics/Efficiency.pdf"
 *                                                 also replace the note already on that chapter
 *   add file or folder names after the flags to limit it to those
 *
 * Notes are read from "../notes/output/<level>/<subject>/<title>.pdf". The
 * level and subject come from the folders, the chapter from the file's name.
 * The upload key is the file Settings saves ("Notes from Claude"); it is read
 * here and never printed. What was sent is remembered in
 * "../notes/output/.uploaded.json", so nothing goes up twice. The words inside
 * a new note become searchable the next time Notes is opened in the console.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = process.env.NOTES_SITE || "https://www.hamzateaches.com";
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "../../notes/output");
const STATE = join(ROOT, ".uploaded.json");
// A note whose name doesn't say its chapter: { "A2/Economics/Efficiency.pdf": "7.3" }
const CHAPTERS = join(ROOT, ".chapters.json");
const LEVELS = ["IGCSE and O Level", "AS", "A2"];
const SUBJECTS = ["Accounting", "Business", "Economics"];

const args = process.argv.slice(2);
const publish = args.includes("--publish");
const replace = args.includes("--replace");
const only = args.filter((a) => !a.startsWith("--"));

function findKey() {
  const spots = [resolve(here, "../../notes-upload-key.txt")];
  const dl = join(homedir(), "Downloads");
  if (existsSync(dl)) {
    // The newest copy wins ("hamzateaches-notes-key (1).txt" after a second download).
    const found = readdirSync(dl)
      .filter((f) => /^hamzateaches-notes-key.*\.txt$/.test(f))
      .map((f) => join(dl, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    spots.push(...found);
  }
  for (const p of spots) {
    if (!existsSync(p)) continue;
    const k = readFileSync(p, "utf8").trim();
    if (/^htn_[0-9a-f]{64}$/.test(k)) return k;
  }
  return null;
}

function listPdfs() {
  const out = [];
  let pinned = {};
  try {
    pinned = JSON.parse(readFileSync(CHAPTERS, "utf8"));
  } catch {}
  for (const level of LEVELS)
    for (const subject of SUBJECTS) {
      const dir = join(ROOT, level, subject);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).sort()) {
        if (!/\.pdf$/i.test(f) || f.startsWith(".")) continue;
        const path = join(dir, f);
        const rel = relative(ROOT, path);
        if (only.length && !only.some((o) => rel.includes(o))) continue;
        out.push({ path, rel, level, subject, fileName: f, title: typeof pinned[rel] === "string" ? `${pinned[rel]}.` : f.replace(/\.pdf$/i, "") });
      }
    }
  return out;
}

const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const readState = () => {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
};

async function api(key, body) {
  const res = await fetch(`${SITE}/api/notes/import`, { method: "POST", headers: { "Content-Type": "application/json", "x-notes-key": key }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function toStorage(path, fileName, cloud, preset) {
  const form = new FormData();
  form.append("file", new Blob([readFileSync(path)], { type: "application/pdf" }), fileName);
  form.append("upload_preset", preset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/raw/upload`, { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.secure_url) throw new Error(`file storage refused it (${res.status})`);
  return json.secure_url;
}

const key = findKey();
if (!key) {
  console.log("NO KEY. In the console: Settings, Notes from Claude, Make upload key. Then run this again.");
  process.exit(2);
}
const files = listPdfs();
if (!files.length) {
  console.log("No PDFs found in notes/output.");
  process.exit(0);
}
const state = readState();
const plan = await api(key, { action: "plan", items: files.map(({ level, subject, title, fileName }) => ({ level, subject, title, fileName })) });
if (!plan.ok) {
  console.log(`The portal said no (${plan.status}): ${plan.data.error ?? "unknown"}`);
  process.exit(1);
}

const rows = files.map((f, i) => {
  const p = plan.data.items[i] ?? {};
  const hash = sha(f.path);
  const sent = state[f.rel];
  let status;
  if (p.error) status = `PROBLEM: ${p.error}`;
  else if (!p.batches?.length) status = "PROBLEM: no current batch takes this level and subject";
  else if (sent?.sha === hash) status = "already uploaded";
  else if (sent) status = "CHANGED since upload (needs --replace)";
  else if (p.there?.length) status = `on portal already: "${p.there[0].title}" (needs --replace to swap)`;
  else status = "NEW";
  return { ...f, hash, p, status };
});

for (const r of rows) {
  console.log(`\n${r.rel}`);
  console.log(`  title:   ${r.p.title ?? r.title}`);
  console.log(`  goes to: ${r.level} ${r.subject}, ${r.p.chapter ? (r.p.chapter.unit ? `whole unit ${r.p.chapter.num}` : `chapter ${r.p.chapter.num}`) : "More notes (no chapter matched)"}`);
  console.log(`  batches: ${(r.p.batches ?? []).join(", ") || "none"}`);
  console.log(`  status:  ${r.status}`);
}

const todo = rows.filter((r) => r.status === "NEW" || (replace && only.length && (r.status.startsWith("CHANGED") || r.status.startsWith("on portal already"))));
console.log(`\n${todo.length} to upload, ${rows.length - todo.length} left alone.`);
if (!publish) {
  console.log("Plan only. Nothing was changed.");
  process.exit(0);
}
if (replace && !only.length) {
  console.log("--replace needs the file names it applies to. Nothing was changed.");
  process.exit(1);
}

let ok = 0;
for (const r of todo) {
  try {
    const fileUrl = await toStorage(r.path, r.fileName, plan.data.cloud, plan.data.preset);
    const res = await api(key, { action: "publish", level: r.level, subject: r.subject, title: r.title, fileName: r.fileName, fileUrl, replace: replace && r.status !== "NEW" });
    if (!res.ok) throw new Error(res.data.error ?? `status ${res.status}`);
    state[r.rel] = { noteId: res.data.noteId, sha: r.hash, at: new Date().toISOString(), title: res.data.title };
    writeFileSync(STATE, JSON.stringify(state, null, 2));
    ok++;
    console.log(`UPLOADED ${r.rel} -> "${res.data.title}"${res.data.hidden ? `, ${res.data.hidden} older note hidden` : ""}`);
  } catch (e) {
    console.log(`FAILED ${r.rel}: ${e.message}`);
  }
}
console.log(`\n${ok} of ${todo.length} uploaded.`);
process.exit(ok === todo.length ? 0 : 1);
