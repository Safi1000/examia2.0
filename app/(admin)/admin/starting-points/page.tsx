"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { useToast } from "@/components/toast";
import { Button, Card } from "@/components/ui";
import { compare, reportText } from "@/lib/diagnostic/report";
import { loadResults, nameKey, type ResultRow } from "@/lib/diagnostic/results-client";

type Row = ResultRow;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const mins = (r: Row) => (r.startedAt && r.finishedAt ? Math.round((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 60000) : null);
const READY_DOT: Record<number, string> = { 3: "bg-success", 2: "bg-warning", 1: "bg-danger" };

/**
 * Every Starting Point Check result, one row per student (matched by full
 * name). Open a student's report to add your note and save it as a PDF;
 * expand a row for the teacher notes and, once they have taken the end of
 * session check, the before and after.
 */
export default function StartingPointsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [track, setTrack] = useState("");

  useEffect(() => {
    const t = setTimeout(async () => {
      const { rows: list, error } = await loadResults();
      if (error) toast(error, "error");
      setRows(list);
    }, 0);
    return () => clearTimeout(t);
  }, [toast]);

  const tracks = useMemo(() => [...new Set((rows ?? []).flatMap((r) => r.summary?.tracks.map((t) => t.title) ?? []))].sort(), [rows]);
  const students = useMemo(() => {
    const by = new Map<string, { name: string; start?: Row; end?: Row; all: Row[] }>();
    for (const r of rows ?? []) {
      const k = nameKey(r.name);
      const s = by.get(k) ?? { name: r.name, all: [] };
      s.all.push(r);
      // Newest of each kind (rows arrive newest first).
      if (r.kind === "end") s.end ??= r;
      else s.start ??= r;
      by.set(k, s);
    }
    return [...by.entries()]
      .filter(([k]) => !q || k.includes(nameKey(q)))
      .filter(([, s]) => !track || (s.end ?? s.start)?.summary?.tracks.some((t) => t.title === track))
      .sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [rows, q, track]);

  const copy = (text: string) => void navigator.clipboard?.writeText(text).then(() => toast("Copied.", "success"));
  const made = students.filter(([, s]) => (s.end ?? s.start)?.notes?.sentAt).length;

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
          {students.length} student{students.length === 1 ? "" : "s"} · reports made for {made}
        </p>
      )}
      {students.length > 1 && <ClassOverview results={students.map(([, s]) => s.start).filter((x): x is Row => !!x)} />}
      {rows === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : students.length === 0 ? (
        <Card className="p-6 text-sm text-ink-2">No results yet. They appear here when students finish the check (Settings → Starting Point Check).</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {students.map(([k, s]) => {
              const latest = (s.end ?? s.start)!;
              const isOpen = openKey === k;
              const rowsCmp = s.start && s.end ? compare(s.start, s.end) : [];
              const m = mins(latest);
              return (
                <li key={k}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                    <button type="button" onClick={() => setOpenKey(isOpen ? null : k)} aria-expanded={isOpen} className="min-w-0 flex-1 text-left">
                      <span className="block font-semibold text-ink">{s.name}</span>
                      <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
                        {latest.summary?.tracks.map((t) => (
                          <span key={t.sec} className="inline-flex items-center gap-1.5">
                            <span className={`h-2 w-2 rounded-full ${READY_DOT[t.ready]}`} aria-hidden />
                            {t.title}: {t.readyLabel}
                          </span>
                        ))}
                      </span>
                      <span className="mt-1 block text-xs text-ink-3">
                        {s.start ? `Day one ${day(s.start.savedAt)}` : "No day one result"}
                        {s.end ? ` · End ${day(s.end.savedAt)}` : ""}
                        {m != null ? ` · took ${m} min` : ""}
                        {latest.notes?.sentAt ? " · report made" : ""}
                      </span>
                    </button>
                    <span className="flex shrink-0 gap-2">
                      <Link href={`/starting-point/report?id=${latest.id}`} className="inline-flex h-9 items-center rounded-full bg-brand px-4 text-sm font-semibold text-on-brand hover:opacity-90">
                        Open report
                      </Link>
                    </span>
                  </div>
                  {isOpen && (
                    <div className="space-y-5 border-t border-border bg-surface-2/40 px-5 py-5">
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
                                {rowsCmp.map((r, i) => (
                                  <tr key={i}>
                                    <td className="py-1.5 pr-3">{r.section}</td>
                                    <td className="py-1.5 pr-3">{r.label}</td>
                                    <td className="py-1.5 pr-3">{r.from}</td>
                                    <td className={`py-1.5 font-semibold ${r.move > 0 ? "text-success" : r.move < 0 ? "text-danger" : "text-ink"}`}>
                                      {r.to} {r.move > 0 ? "↑" : r.move < 0 ? "↓" : ""}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {[s.start, s.end].filter(Boolean).map((r) => {
                        const text = reportText(r!);
                        return (
                          <div key={r!.id}>
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <h3 className="text-sm font-bold text-ink">Teacher notes: {r!.kind === "end" ? "end of session" : "day one"}</h3>
                              <span className="flex gap-2">
                                <Link href={`/starting-point/report?id=${r!.id}`} className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs font-semibold text-ink-2 hover:text-ink">
                                  Student report
                                </Link>
                                <Button size="sm" variant="ghost" onClick={() => copy(text)}>
                                  Copy
                                </Button>
                              </span>
                            </div>
                            <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-4 font-sans text-xs leading-relaxed text-ink-2">{text}</pre>
                          </div>
                        );
                      })}
                      {s.all.length > (s.start ? 1 : 0) + (s.end ? 1 : 0) && <p className="text-xs text-ink-3">Older attempts are kept; the newest of each is shown.</p>}
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

function ClassOverview({ results }: { results: Row[] }) {
  if (!results.length) return null;
  const tally = <T,>(list: T[], key: (x: T) => string) => {
    const m = new Map<string, number>();
    for (const x of list) m.set(key(x), (m.get(key(x)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const tracks = results.flatMap((r) => r.summary?.tracks ?? []);
  const byTrack = [...new Set(tracks.map((t) => t.title))].map((title) => {
    const ts = tracks.filter((t) => t.title === title);
    return { title, n: ts.length, ready: [3, 2, 1].map((k) => ts.filter((t) => t.ready === k).length) };
  });
  // One count per student per mix-up, so a student who repeats it counts once.
  const gaps = results.flatMap((r) => {
    const all = [r.summary?.core, ...(r.summary?.tracks ?? [])].filter(Boolean);
    return [...new Set(all.flatMap((s) => s!.gaps.filter((g) => !g.idk).map((g) => `${s!.title} · ${g.skill}${g.why ? `: ${g.why}` : ""}`)))];
  });
  const habits = results.flatMap((r) => (r.summary?.learner ?? []).map((n) => n.teacher));
  return (
    <Card className="mb-6 space-y-5 p-5">
      <h2 className="text-sm font-bold text-ink">Class on day one ({results.length} students)</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {byTrack.map((t) => (
          <div key={t.title} className="rounded-lg bg-surface-2 px-4 py-3 text-xs text-ink-2">
            <span className="block text-sm font-semibold text-ink">{t.title}</span>
            Ready {t.ready[0]} · With support {t.ready[1]} · Groundwork first {t.ready[2]}
          </div>
        ))}
      </div>
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Most common mix ups</h3>
        <ul className="space-y-1 text-xs text-ink-2">
          {tally(gaps, (g) => g)
            .slice(0, 8)
            .map(([g, n]) => (
              <li key={g}>
                <span className="font-semibold text-ink">{n}</span> {g}
              </li>
            ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-3">Most common study habits to fix</h3>
        <ul className="space-y-1 text-xs text-ink-2">
          {tally(habits, (h) => h)
            .slice(0, 6)
            .map(([h, n]) => (
              <li key={h}>
                <span className="font-semibold text-ink">{n}</span> {h}
              </li>
            ))}
        </ul>
      </div>
    </Card>
  );
}
