"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { useToast } from "@/components/toast";
import { Button, Card } from "@/components/ui";
import { useDatabase } from "@/lib/data/store";
import { HABIT, PROFILE_TILES } from "@/lib/diagnostic/roadmap";
import { compare, reportText } from "@/lib/diagnostic/report";
import { deleteResult, linkStudent, loadResults, nameKey, type ResultRow } from "@/lib/diagnostic/results-client";

type Row = ResultRow;
type Group = { key: string; name: string; studentId?: string; start?: Row; end?: Row; all: Row[] };
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const mins = (r: Row) => (r.startedAt && r.finishedAt ? Math.round((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 60000) : null);
const READY_DOT: Record<number, string> = { 3: "bg-success", 2: "bg-warning", 1: "bg-error" };

/**
 * Every Starting Point Check result, one row per student: grouped by the
 * roster student it is linked to, or by full name until it is linked.
 * Open a student's report to add a note and save it as a PDF; expand a row
 * for the teacher notes, each attempt (with delete) and, once they have
 * taken the end of session check, the before and after.
 */
export default function StartingPointsPage() {
  const { toast } = useToast();
  const db = useDatabase();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [track, setTrack] = useState("");

  async function reload() {
    const { rows: list, error } = await loadResults();
    if (error) toast(error, "error");
    setRows(list);
  }
  useEffect(() => {
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
    // Loads once; reload() is called again after a delete or a link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const roster = useMemo(() => [...db.students].sort((a, b) => a.username.localeCompare(b.username)), [db.students]);
  const studentName = (id?: string) => roster.find((s) => s.id === id)?.username;

  const tracks = useMemo(() => [...new Set((rows ?? []).flatMap((r) => r.summary?.tracks.map((t) => t.title) ?? []))].sort(), [rows]);
  const groups = useMemo(() => {
    const by = new Map<string, Group>();
    for (const r of rows ?? []) {
      const sid = r.notes?.studentId;
      const k = sid ? `id:${sid}` : `name:${nameKey(r.name)}`;
      const g = by.get(k) ?? { key: k, name: r.name, studentId: sid, all: [] };
      g.all.push(r);
      // Newest of each kind (rows arrive newest first).
      if (r.kind === "end") g.end ??= r;
      else g.start ??= r;
      by.set(k, g);
    }
    return [...by.values()]
      .filter((g) => !q || nameKey(g.name).includes(nameKey(q)) || nameKey(studentName(g.studentId) ?? "").includes(nameKey(q)))
      .filter((g) => !track || (g.end ?? g.start)?.summary?.tracks.some((t) => t.title === track))
      .sort((a, b) => a.name.localeCompare(b.name));
    // studentName reads roster, which is in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, track, roster]);

  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast("Copied.", "success"));
  const made = groups.filter((g) => (g.end ?? g.start)?.notes?.sentAt).length;

  async function remove(ids: string[], label: string) {
    setConfirm(null);
    const ok = (await Promise.all(ids.map(deleteResult))).every(Boolean);
    toast(ok ? `Deleted ${label}.` : "Couldn't delete. Try again.", ok ? "success" : "error");
    await reload();
  }

  async function link(g: Group, studentId: string) {
    const ok = (await Promise.all(g.all.map((r) => linkStudent(r, studentId || null)))).every(Boolean);
    toast(ok ? (studentId ? `Linked to ${studentName(studentId)}.` : "Unlinked.") : "Couldn't save the link. Try again.", ok ? "success" : "error");
    await reload();
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
      <PageHeader title="Starting points" subtitle="Day one diagnostics, and the end of session check to compare against." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name"
          aria-label="Search by name"
          className="h-10 w-full max-w-xs rounded-full border border-border bg-surface px-4 text-sm text-ink outline-none focus:border-brand"
        />
        {["", ...tracks].map((t) => (
          <button
            key={t || "all"}
            type="button"
            onClick={() => setTrack(t)}
            aria-pressed={track === t}
            className={`h-9 rounded-full px-4 text-sm font-semibold ${track === t ? "bg-brand text-on-brand" : "border border-border text-ink-2 hover:text-ink"}`}
          >
            {t || "Everyone"}
          </button>
        ))}
      </div>
      {rows && rows.length > 0 && (
        <p className="mb-4 text-xs text-ink-3">
          {groups.length} student{groups.length === 1 ? "" : "s"} · reports made for {made} · linked to profiles {groups.filter((g) => g.studentId).length}
        </p>
      )}
      {groups.length > 0 && <ClassOverview results={groups.map((g) => g.start).filter((x): x is Row => !!x)} />}
      {rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : groups.length === 0 ? (
        <Card className="p-6 text-sm text-ink-2">No results yet. They appear here when students finish the check (Settings → Starting Point Check).</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {groups.map((g) => {
              const latest = (g.end ?? g.start)!;
              const isOpen = openKey === g.key;
              const rowsCmp = g.start && g.end ? compare(g.start, g.end) : [];
              const m = mins(latest);
              return (
                <li key={g.key}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                    <button type="button" onClick={() => setOpenKey(isOpen ? null : g.key)} aria-expanded={isOpen} className="min-w-0 flex-1 text-left">
                      <span className="block font-semibold text-ink">
                        {g.name}
                        {g.studentId && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-2">@{studentName(g.studentId) ?? "linked"}</span>}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                        {latest.summary?.tracks.map((t) => (
                          <span key={t.sec} className="inline-flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${READY_DOT[t.ready]}`} aria-hidden />
                            {t.title}: {t.readyLabel}
                          </span>
                        ))}
                      </span>
                      <span className="mt-1 block text-xs text-ink-3">
                        {g.start ? `Day one ${day(g.start.savedAt)}` : "No day one result"}
                        {g.end ? ` · End ${day(g.end.savedAt)}` : ""}
                        {m != null ? ` · took ${m} min` : ""}
                        {latest.notes?.sentAt ? " · report made" : ""}
                      </span>
                    </button>
                    <span className="flex shrink-0 flex-wrap items-center gap-2">
                      <select
                        aria-label={`Link ${g.name} to a student profile`}
                        value={g.studentId ?? ""}
                        onChange={(e) => void link(g, e.target.value)}
                        className="h-9 max-w-[11rem] rounded-full border border-border bg-surface px-3 text-xs text-ink-2"
                      >
                        <option value="">Link to student…</option>
                        {roster.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.username}
                          </option>
                        ))}
                      </select>
                      <Link href={`/starting-point/report?id=${latest.id}`} className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-sm font-semibold text-on-brand hover:opacity-90">
                        Open report
                      </Link>
                    </span>
                  </div>
                  {isOpen && (
                    <div className="space-y-5 border-t border-border bg-surface-2/40 px-5 py-5">
                      <div>
                        <h3 className="mb-2 text-sm font-bold text-ink">Attempts</h3>
                        <ul className="space-y-1.5 text-xs text-ink-2">
                          {g.all.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                              <span>
                                <span className="font-semibold text-ink">{r.kind === "end" ? "End of session" : "Day one"}</span> · {day(r.savedAt)}
                                {mins(r) != null ? ` · ${mins(r)} min` : ""} · as “{r.name}”
                              </span>
                              <span className="flex items-center gap-2">
                                <Link href={`/starting-point/report?id=${r.id}`} className="font-semibold text-brand hover:underline">
                                  Report
                                </Link>
                                {confirm === r.id ? (
                                  <>
                                    <span className="text-error">Delete for good?</span>
                                    <button type="button" className="font-semibold text-error hover:underline" onClick={() => void remove([r.id], "the attempt")}>
                                      Yes, delete
                                    </button>
                                    <button type="button" className="text-ink-3 hover:underline" onClick={() => setConfirm(null)}>
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button type="button" className="text-ink-3 hover:text-error hover:underline" onClick={() => setConfirm(r.id)}>
                                    Delete
                                  </button>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-2 text-right text-xs">
                          {confirm === g.key ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-error">Delete all {g.all.length} of {g.name}’s results for good?</span>
                              <button type="button" className="font-semibold text-error hover:underline" onClick={() => void remove(g.all.map((r) => r.id), `${g.name}’s results`)}>
                                Yes, delete all
                              </button>
                              <button type="button" className="text-ink-3 hover:underline" onClick={() => setConfirm(null)}>
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button type="button" className="text-ink-3 hover:text-error hover:underline" onClick={() => setConfirm(g.key)}>
                              Delete this student’s results
                            </button>
                          )}
                        </div>
                      </div>
                      {rowsCmp.length > 0 && (
                        <div>
                          <h3 className="mb-2 text-sm font-bold text-ink">Day one → end of session</h3>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="text-ink-3">
                                <tr>
                                  <th className="py-1.5 pr-3 font-semibold">Section</th>
                                  <th className="py-1.5 pr-3 font-semibold">Measure</th>
                                  <th className="py-1.5 pr-3 font-semibold">Day one</th>
                                  <th className="py-1.5 font-semibold">End</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border text-ink-2">
                                {rowsCmp.map((c, i) => (
                                  <tr key={i}>
                                    <td className="py-1.5 pr-3">{c.section}</td>
                                    <td className="py-1.5 pr-3">{c.label}</td>
                                    <td className="py-1.5 pr-3">{c.from}</td>
                                    <td className={`py-1.5 font-semibold ${c.move > 0 ? "text-success" : c.move < 0 ? "text-error" : "text-ink"}`}>
                                      {c.to} {c.move > 0 ? "↑" : c.move < 0 ? "↓" : ""}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {[g.start, g.end].filter(Boolean).map((r) => {
                        const text = reportText(r!);
                        return (
                          <div key={r!.id}>
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <h3 className="text-sm font-bold text-ink">Teacher notes: {r!.kind === "end" ? "end of session" : "day one"}</h3>
                              <Button size="sm" variant="ghost" onClick={() => copy(text)}>
                                Copy
                              </Button>
                            </div>
                            <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-4 font-sans text-xs leading-relaxed text-ink-2">{text}</pre>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/**
 * The whole class on day one: readiness per subject and level, the gaps most
 * students share (grouped by section, worth one lesson for everyone), how
 * the class studies, and the habits that come up most.
 */
function ClassOverview({ results }: { results: Row[] }) {
  if (!results.length) return null;
  const n = results.length;

  // Readiness per track.
  const tracks = results.flatMap((r) => r.summary?.tracks ?? []);
  const byTrack = [...new Set(tracks.map((t) => t.title))].sort().map((title) => {
    const ts = tracks.filter((t) => t.title === title);
    return { title, n: ts.length, ready: [3, 2, 1].map((k) => ts.filter((t) => t.ready === k).length) as [number, number, number] };
  });

  // Shared gaps: one count per student per skill, grouped by section.
  const gapCount = new Map<string, { section: string; skill: string; why: Map<string, number>; students: number }>();
  for (const r of results) {
    const sections = [r.summary?.core, ...(r.summary?.tracks ?? [])].filter(Boolean);
    for (const s of sections) {
      const seen = new Set<string>();
      for (const g of s!.gaps) {
        const k = `${s!.title}|${g.skill}`;
        const e = gapCount.get(k) ?? { section: s!.title, skill: g.skill, why: new Map(), students: 0 };
        if (!seen.has(k)) {
          e.students++;
          seen.add(k);
        }
        if (g.why) e.why.set(g.why, (e.why.get(g.why) ?? 0) + 1);
        gapCount.set(k, e);
      }
    }
  }
  const sections = [...new Set([...gapCount.values()].map((g) => g.section))].sort((a, b) => (a === "Core skills" ? -1 : b === "Core skills" ? 1 : a.localeCompare(b)));
  // Out of the students who took that section, not the whole class.
  const takers = (section: string) => (section === "Core skills" ? n : tracks.filter((t) => t.title === section).length);
  const topGaps = sections.map((section) => ({
    section,
    of: takers(section),
    gaps: [...gapCount.values()].filter((g) => g.section === section).sort((a, b) => b.students - a.students).slice(0, 4),
  }));

  // How the class studies: answers to the profile questions.
  const habitsDist = PROFILE_TILES.map((t) => {
    const counts = new Map<string, number>();
    for (const r of results) {
      const v = t.short[r.profile[t.id]?.code ?? ""];
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return { label: t.label, counts: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
  }).filter((d) => d.counts.length);

  // Habits to fix: by short label, with the teacher action.
  const fix = new Map<string, { label: string; teacher: string; n: number }>();
  for (const r of results) for (const l of r.summary?.learner ?? []) {
    const e = fix.get(l.code) ?? { label: HABIT[l.code] ?? l.answer, teacher: l.teacher.split(": ").slice(1).join(": ") || l.teacher, n: 0 };
    e.n++;
    fix.set(l.code, e);
  }
  const topFix = [...fix.values()].sort((a, b) => b.n - a.n).slice(0, 6);

  return (
    <Card className="mb-6 space-y-6 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-ink">Class on day one</h2>
        <span className="text-xs text-ink-3">
          {n} student{n === 1 ? "" : "s"}
        </span>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Ready for lesson one</h3>
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {byTrack.map((t) => (
            <div key={t.title} className="min-w-0 rounded-lg bg-surface-2 px-4 py-3">
              <p className="truncate text-sm font-semibold text-ink">{t.title}</p>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface" aria-hidden>
                <span className="bg-success" style={{ width: `${pct(t.ready[0], t.n)}%` }} />
                <span className="bg-warning" style={{ width: `${pct(t.ready[1], t.n)}%` }} />
                <span className="bg-error" style={{ width: `${pct(t.ready[2], t.n)}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-ink-3">
                {t.ready[0]} ready · {t.ready[1]} with support · {t.ready[2]} groundwork first
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Shared gaps: teach these to the group</h3>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {topGaps.map((s) => (
            <div key={s.section} className="min-w-0">
              <p className="mb-1.5 text-sm font-semibold text-ink">{s.section}</p>
              <ul className="space-y-1.5">
                {s.gaps.map((g) => {
                  const why = [...g.why.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
                  return (
                    <li key={g.skill} className="text-xs leading-snug text-ink-2">
                      <span className="mr-1.5 inline-block min-w-[3.2rem] rounded bg-surface-2 px-1.5 py-0.5 text-center font-semibold text-ink tabular-nums">
                        {g.students}/{s.of}
                      </span>
                      <span className="font-medium text-ink">{g.skill}</span>
                      {why && <span className="block pl-[3.9rem] text-ink-3">{why}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {habitsDist.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">How the class studies</h3>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {habitsDist.map((d) => (
              <div key={d.label} className="min-w-0 rounded-lg bg-surface-2 px-3 py-2.5 text-xs">
                <p className="font-semibold text-ink">{d.label}</p>
                <ul className="mt-1 space-y-0.5 text-ink-2">
                  {d.counts.map(([v, c]) => (
                    <li key={v} className="flex justify-between gap-2">
                      <span className="truncate">{v}</span>
                      <span className="tabular-nums text-ink-3">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {topFix.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Study habits to build</h3>
          <ul className="grid gap-x-6 gap-y-1.5 text-xs text-ink-2 sm:grid-cols-2">
            {topFix.map((h) => (
              <li key={h.label} className="min-w-0">
                <span className="mr-1.5 inline-block min-w-[3.2rem] rounded bg-surface-2 px-1.5 py-0.5 text-center font-semibold text-ink tabular-nums">
                  {h.n}/{n}
                </span>
                <span className="font-medium text-ink">{h.label}</span>
                <span className="block pl-[3.9rem] text-ink-3">{h.teacher}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  );
}
