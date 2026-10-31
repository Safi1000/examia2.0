"use client";

import { useMemo, useRef, useState } from "react";
import { useDatabase, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { waDigits } from "@/lib/phone";
import { welcomeMessage } from "@/lib/welcome-message";
import { parseDelimited, readSheetFile, type Rows } from "@/lib/sheet";
import { detectColumns, planRows, type Columns, type Field } from "@/lib/import-students";
import { Button, Modal, Select, Label } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * Term start: bring a whole spreadsheet of students in at once. Upload Excel
 * or CSV (or paste rows from Google Sheets). Each row's level and subjects
 * are matched to the portal's own, numbers are tidied, usernames made, and
 * the list is shown to check before anything is created. Students already in
 * the portal get their level and subjects updated instead. Then each welcome
 * message is one tap to WhatsApp. Passwords live on screen only until this
 * closes (never saved anywhere readable).
 */
type Made = { username: string; password: string; phone?: string; parent?: string; sent?: boolean };

const FIELDS: Array<[Field, string]> = [
  ["name", "Name"],
  ["username", "Username"],
  ["phone", "Student WhatsApp"],
  ["parent", "Parent WhatsApp"],
  ["level", "Level"],
  ["subjects", "Subjects"],
];

function newPassword() {
  const words = ["maple", "river", "amber", "delta", "lunar", "cedar", "north", "ochre"];
  return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(100 + Math.random() * 900)}`;
}

export function ImportStudents({ open, onClose, defaultCohort }: { open: boolean; onClose: () => void; defaultCohort: string }) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Rows | null>(null);
  const [fileName, setFileName] = useState("");
  const [paste, setPaste] = useState("");
  const [header, setHeader] = useState(-1);
  const [cols, setCols] = useState<Columns | null>(null);
  const [cohortId, setCohortId] = useState(defaultCohort);
  const [defClasses, setDefClasses] = useState<string[]>([]);
  const [defSubjects, setDefSubjects] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(true);
  const [busy, setBusy] = useState<{ done: number; of: number } | null>(null);
  const [made, setMade] = useState<Made[]>([]);
  // A password per sheet row, made once when the sheet is read, so the preview shows the real login.
  const [passwords, setPasswords] = useState<string[]>([]);
  // Which row's WhatsApp message is shown in the preview.
  const [peek, setPeek] = useState<number | null>(null);

  const cohort = db.cohorts.find((c) => c.id === cohortId);
  // The cohort's own levels and subjects, or every one when it has none linked.
  const levels = cohort?.classIds.length ? db.classes.filter((c) => cohort.classIds.includes(c.id)) : db.classes;
  const subjects = cohort?.subjectIds.length ? db.subjects.filter((s) => cohort.subjectIds.includes(s.id)) : db.subjects;

  const load = (r: Rows, name: string) => {
    if (!r.length) return toast("That sheet looks empty.", "error");
    const d = detectColumns(r, db.subjects);
    setRows(r);
    setFileName(name);
    setHeader(d.header);
    setCols(d.cols);
    setPasswords(r.map(() => newPassword()));
    setPeek(null);
  };
  async function pickFile(f: File | undefined) {
    if (!f) return;
    try {
      load(await readSheetFile(f), f.name);
    } catch (e) {
      toast(e instanceof Error ? e.message : "That file couldn't be read.", "error");
    }
  }

  const plan = useMemo(
    () =>
      rows && cols
        ? planRows(rows, header, cols, { classes: levels, subjects, students: db.students, defaultClassIds: defClasses, defaultSubjectIds: defSubjects })
        : [],
    [rows, cols, header, levels, subjects, db.students, defClasses, defSubjects],
  );
  const fresh = plan.filter((p) => !p.problem && !p.existing);
  const updates = plan.filter((p) => !p.problem && p.existing && updateExisting);
  const changed = (p: (typeof plan)[number]) =>
    !!p.existing && (p.existing.classIds.join() !== p.classIds.join() || p.existing.subjectIds.join() !== p.subjectIds.join());
  const realUpdates = updates.filter(changed);
  const shown = fresh.find((p) => p.line === peek) ?? fresh[0];
  const problems = plan.filter((p) => p.problem);
  const needLevel = !!cols && cols.level === -1;
  const needSubjects = !!cols && cols.subjects === -1 && !cols.subjectCols.length;

  const name = (ids: string[], list: Array<{ id: string; name: string }>) => ids.map((id) => list.find((x) => x.id === id)?.name ?? "?").join(", ");
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function importAll() {
    if (!cohortId) return toast("Choose the cohort they join.", "error");
    const todo = fresh.length + realUpdates.length;
    if (!todo) return;
    setBusy({ done: 0, of: todo });
    const ok: Made[] = [];
    const failed: number[] = [];
    let done = 0;
    // One at a time: each account is a separate sign-in to create.
    for (const p of fresh) {
      const password = passwords[p.line - 1] ?? newPassword();
      try {
        await store.addStudent({ username: p.username, phone: p.phone, whatsapp: p.parent, cohortId, tempPassword: password, classIds: p.classIds, subjectIds: p.subjectIds });
        ok.push({ username: p.username, password, phone: p.phone, parent: p.parent });
      } catch {
        failed.push(p.line);
      }
      setBusy({ done: ++done, of: todo });
    }
    let updated = 0;
    for (const p of realUpdates) {
      // Only their level and subjects change, so no sign-in details are touched.
      store.setStudentClasses(p.existing!.id, p.classIds);
      store.setStudentSubjects(p.existing!.id, p.subjectIds);
      updated++;
      setBusy({ done: ++done, of: todo });
    }
    setBusy(null);
    setMade(ok);
    if (failed.length) toast(`Rows ${failed.join(", ")} couldn't be saved. Try them again.`, "error");
    toast([ok.length && `${ok.length} added`, updated && `${updated} updated`].filter(Boolean).join(", ") + ".", "success");
    if (!ok.length) close(true);
  }

  function close(force = false) {
    if (!force && made.some((m) => !m.sent) && !window.confirm("Some login messages haven't been sent. Passwords aren't kept after this closes (you can use Reset password later). Close anyway?")) return;
    setMade([]);
    setRows(null);
    setPaste("");
    onClose();
  }

  const wa = (to: string, m: Made) => `https://wa.me/${waDigits(to)}?text=${encodeURIComponent(welcomeMessage({ username: m.username, password: m.password }))}`;
  const markSent = (u: string) => setMade((list) => list.map((m) => (m.username === u ? { ...m, sent: true } : m)));
  const chip = (on: boolean) =>
    cn("rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors", on ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-2 hover:border-border-strong hover:text-ink");
  const headings = rows ? (header >= 0 ? rows[header] : rows[0].map((_, i) => `Column ${i + 1}`)) : [];
  const todo = fresh.length + realUpdates.length;

  return (
    <Modal
      open={open}
      onClose={() => close()}
      size="lg"
      title={made.length ? "Send their logins" : rows ? "Check before importing" : "Import students"}
      description={
        made.length
          ? "One tap each opens WhatsApp with their welcome message typed in."
          : rows
            ? `${fileName}: ${plan.length} student${plan.length === 1 ? "" : "s"} found.`
            : "Upload your Excel or Google Sheet. One student per row, with their level and subjects."
      }
      footer={
        made.length ? (
          <Button onClick={() => close()}>Done</Button>
        ) : rows ? (
          <>
            <Button variant="secondary" onClick={() => setRows(null)} disabled={!!busy}>Back</Button>
            <Button onClick={() => void importAll()} loading={!!busy} disabled={!todo || !!busy}>
              {busy
                ? `Saving ${Math.min(busy.done + 1, busy.of)} of ${busy.of}…`
                : todo
                  ? [fresh.length && `Add ${fresh.length}`, realUpdates.length && `update ${realUpdates.length}`].filter(Boolean).join(", ").replace(/^u/, "U")
                  : "Nothing to import"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => close()}>Cancel</Button>
            <Button onClick={() => load(parseDelimited(paste), "Pasted rows")} disabled={!paste.trim()}>Check pasted rows</Button>
          </>
        )
      }
    >
      {made.length ? (
        <ul className="divide-y divide-border">
          {made.map((m) => (
            <li key={m.username} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="min-w-0">
                <span className="block font-mono text-sm font-semibold text-ink">{m.username} · {m.password}</span>
                {m.sent && <span className="text-xs text-success">Sent</span>}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {m.parent && (
                  <a href={wa(m.parent, m)} target="_blank" rel="noreferrer" onClick={() => markSent(m.username)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    Parent
                  </a>
                )}
                {m.phone && (
                  <a href={wa(m.phone, m)} target="_blank" rel="noreferrer" onClick={() => markSent(m.username)} className={buttonClasses({ size: "sm" })}>
                    Student
                  </a>
                )}
                {!m.phone && !m.parent && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard?.writeText(welcomeMessage({ username: m.username, password: m.password })).then(() => toast("Message copied.", "success"));
                      markSent(m.username);
                    }}
                  >
                    Copy message
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : !rows ? (
        <div className="space-y-4">
          <div>
            <Label>Cohort they join</Label>
            <Select value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
              <option value="">Choose…</option>
              {db.cohorts.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pickFile(e.dataTransfer.files[0]);
            }}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border-strong px-4 py-8 text-center transition-colors hover:border-brand hover:bg-brand-soft"
          >
            <span className="text-base font-semibold text-ink">Choose a spreadsheet</span>
            <span className="text-sm text-ink-3">Excel (.xlsx) or CSV. From Google Sheets: File, Download, .xlsx</span>
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0] ?? undefined)} />
          <div>
            <Label htmlFor="import-paste">Or paste rows</Label>
            <textarea
              id="import-paste"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={5}
              placeholder={"Name\tWhatsApp\tParent\tLevel\tSubjects\nAli Khan\t03001234567\t03331234567\tAS\tAccounting, Economics"}
              className="w-full rounded-lg border border-border-strong bg-surface p-3 font-mono text-sm leading-relaxed text-ink"
            />
            <p className="mt-1 text-xs text-ink-3">
              Columns I look for: name (or username), student WhatsApp, parent WhatsApp, level (O Level, AS, A2) and subjects. Subjects can be one column (&quot;Accounting, Business&quot;) or a column per subject with a tick.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* What each column was read as; change any that's wrong. */}
          <details className="rounded-lg border border-border px-3 py-2" open={!cols || cols.name + cols.username === -2}>
            <summary className="cursor-pointer text-sm font-semibold text-ink">Columns</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {FIELDS.map(([f, label]) => (
                <div key={f}>
                  <Label>{label}</Label>
                  <Select value={cols?.[f] ?? -1} onChange={(e) => cols && setCols({ ...cols, [f]: Number(e.target.value) })}>
                    <option value={-1}>Not in the sheet</option>
                    {headings.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            {!!cols?.subjectCols.length && <p className="mt-2 text-xs text-ink-3">Ticked subject columns: {cols.subjectCols.map((s) => `${headings[s.col]} (${name([s.subjectId], db.subjects)})`).join(", ")}</p>}
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={header >= 0} onChange={(e) => setHeader(e.target.checked ? 0 : -1)} />
              First row is headings
            </label>
          </details>

          {(needLevel || needSubjects) && (
            <div className="space-y-3 rounded-lg border border-border px-3 py-3">
              <p className="text-sm text-ink-2">The sheet has no {needLevel && needSubjects ? "level or subjects" : needLevel ? "level" : "subjects"} column. Pick what applies to everyone here:</p>
              {needLevel && (
                <div className="flex flex-wrap gap-2">
                  {levels.map((c) => (
                    <button key={c.id} type="button" className={chip(defClasses.includes(c.id))} onClick={() => toggle(defClasses, setDefClasses, c.id)}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              {needSubjects && (
                <div className="flex flex-wrap gap-2">
                  {subjects.map((s) => (
                    <button key={s.id} type="button" className={chip(defSubjects.includes(s.id))} onClick={() => toggle(defSubjects, setDefSubjects, s.id)}>
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-success-soft px-3 py-1 font-semibold text-success">{fresh.length} new</span>
            {plan.some((p) => p.existing) && (
              <span className="rounded-full bg-surface-2 px-3 py-1 font-semibold text-ink-2">{plan.filter((p) => p.existing && !p.problem).length} already in the portal</span>
            )}
            {!!problems.length && <span className="rounded-full bg-warning-soft px-3 py-1 font-semibold text-warning">{problems.length} to fix</span>}
          </div>
          {plan.some((p) => p.existing && !p.problem) && (
            <label className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              Update the level and subjects of students already in the portal ({realUpdates.length || "no"} change{realUpdates.length === 1 ? "" : "s"})
            </label>
          )}

          <div className="max-h-[46dvh] overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-2 text-xs uppercase tracking-wide text-ink-3">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Login</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2">Subjects</th>
                  <th className="px-3 py-2">Numbers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {plan.map((p) => (
                  <tr
                    key={p.line}
                    onClick={() => !p.problem && !p.existing && setPeek(p.line)}
                    className={cn(p.problem && "bg-warning-soft/50", !p.problem && !p.existing && "cursor-pointer hover:bg-surface-2", shown?.line === p.line && "bg-brand-soft")}
                  >
                    <td className="px-3 py-2 text-ink-3">{p.line}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono font-semibold text-ink">{p.username || "(none)"}</span>
                      {!p.problem && !p.existing && <span className="block font-mono text-xs text-ink-2">Password: {passwords[p.line - 1]}</span>}
                      {p.problem && <span className="block text-xs font-semibold text-warning">{p.problem}. Skipped.</span>}
                      {!p.problem && p.existing && <span className="block text-xs text-ink-3">{changed(p) ? "Already here, keeps their login. Level or subjects change" : "Already here, nothing changes"}</span>}
                      {!p.problem && p.note && <span className="block text-xs text-ink-3">{p.note}</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{name(p.classIds, db.classes) || "?"}</td>
                    <td className="px-3 py-2 text-ink-2">{name(p.subjectIds, db.subjects) || "?"}</td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-3">
                      {p.phone ?? ""}
                      {p.parent && <span className="block">{p.parent} (parent)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown && (
            <div className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">What {shown.username} gets on WhatsApp</p>
                <p className="text-xs text-ink-3">Tap another row to see theirs</p>
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {shown.phone || shown.parent
                  ? `Goes to ${[shown.phone && `the student (${shown.phone})`, shown.parent && `the parent (${shown.parent})`].filter(Boolean).join(" and ")}. `
                  : "No number in the sheet, so you copy it and send it yourself. "}
                Nothing is sent on its own: after importing, one tap each opens WhatsApp with this typed in, and you press send.
              </p>
              <div className="mt-3 rounded-xl bg-[#0b141a] p-3">
                <p className="ml-auto max-w-[34rem] whitespace-pre-wrap rounded-lg rounded-tr-none bg-[#005c4b] px-3 py-2 text-[13px] leading-relaxed text-[#e9edef]">
                  {/* *bold* the way WhatsApp shows it */}
                  {welcomeMessage({ username: shown.username, password: passwords[shown.line - 1] ?? "" })
                    .split(/(\*[^*\n]+\*)/)
                    .map((part, i) => (part.startsWith("*") && part.endsWith("*") ? <strong key={i}>{part.slice(1, -1)}</strong> : part))}
                </p>
              </div>
            </div>
          )}
          {!!problems.length && <p className="text-xs text-ink-3">Fix those rows in your sheet and import it again: students already added are recognised, not added twice.</p>}
        </div>
      )}
    </Modal>
  );
}
