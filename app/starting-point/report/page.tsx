"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Brand";
import { BANK } from "@/lib/diagnostic/bank";
import { RATING_LABEL, type SectionSummary } from "@/lib/diagnostic/logic";
import { compare } from "@/lib/diagnostic/report";
import { loadResults, nameKey, saveNotes, type ResultRow } from "@/lib/diagnostic/results-client";
import { GRADE, emptyNotes, firstWeeks, meaning, missed, shaky, type ReportItem, type ReportNotes } from "@/lib/diagnostic/student-report";

/**
 * A student's Starting Point Report, for Hamza to finish and send: add a
 * note and feedback on the written answers, then Save as PDF (A4). Opened
 * from Admin → Starting points. Only the teacher can load it.
 */
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function StartingPointReport() {
  const [rows, setRows] = useState<ResultRow[] | null>(null);
  const [error, setError] = useState("");
  const [id, setId] = useState("");
  const [notes, setNotes] = useState<ReportNotes>(emptyNotes());
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  useEffect(() => {
    const t = setTimeout(async () => {
      const want = new URLSearchParams(window.location.search).get("id") ?? "";
      setId(want);
      const { rows: list, error: e } = await loadResults();
      setRows(list);
      setError(e ?? "");
      const r = list.find((x) => x.id === want);
      if (r?.notes) setNotes({ ...emptyNotes(), ...r.notes });
    }, 0);
    return () => clearTimeout(t);
  }, []);

  if (!rows) return <Shell>{null}</Shell>;
  const r = rows.find((x) => x.id === id);
  if (!r || !r.summary) {
    return (
      <Shell>
        <p className="py-20 text-center text-[15px] text-[#5b6168]">{error || "This report could not be found. Open it again from Admin → Starting points."}</p>
      </Shell>
    );
  }
  const sum = r.summary;
  const end = r.kind === "end";
  const before = end ? rows.find((x) => x.kind === "start" && nameKey(x.name) === nameKey(r.name)) : undefined;
  const changes = before ? compare(before, r).filter((c) => c.section !== "How they learn" && c.label !== "Certain but wrong") : [];

  async function save(next = notes) {
    setSaved("saving");
    setSaved((await saveNotes(r!.id, next)) ? "saved" : "failed");
  }
  const setW = (sec: string, patch: Partial<ReportNotes["written"][string]>) => {
    const next = { ...notes, written: { ...notes.written, [sec]: { ...notes.written[sec], ...patch } } };
    setNotes(next);
    setSaved("idle");
  };

  return (
    <Shell
      bar={
        <>
          <Link href="/admin/starting-points" className="text-[14px] font-medium text-[#5b6168] hover:text-[#1b1e21]">
            ← Starting points
          </Link>
          <span className="ml-auto text-[13px] text-[#5b6168]">{saved === "saving" ? "Saving…" : saved === "saved" ? "Notes saved" : saved === "failed" ? "Couldn't save. Try again." : ""}</span>
          <button onClick={() => void save()} className="rp-out h-10 rounded-full border px-4 text-[14px] font-semibold text-[#1b1e21] hover:border-[#1b1e21]">
            Save notes
          </button>
          <button
            onClick={async () => {
              await save({ ...notes, sentAt: notes.sentAt ?? new Date().toISOString() });
              window.print();
            }}
            className="h-10 rounded-full bg-[#FBC159] px-5 text-[14px] font-semibold text-[#1b1e21] hover:bg-[#ffd07a]"
          >
            Save as PDF
          </button>
        </>
      }
    >
      {/* Cover */}
      <header className="flex items-start justify-between gap-6 rp-gold border-b-2 pb-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8a5a0c]">{end ? "End of session report" : "Starting Point Report"}</p>
          <h1 className="mt-2 text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em] text-[#1b1e21]">{r.name || "Student"}</h1>
          <p className="mt-2 text-[14px] text-[#5b6168]">
            {sum.tracks.map((t) => t.title).join(" · ")} · {day(r.finishedAt ?? r.savedAt)}
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-[#1b1e21] px-4 py-3">
          <Logo className="h-9" />
        </div>
      </header>

      {/* Where you are */}
      <Block title={end ? "Where you are now" : "Where you are starting"}>
        <div className="grid gap-3">
          {sum.tracks.map((s) => {
            const t = r.tracks.find((x) => `${x.level}-${x.sub}` === s.sec)!;
            return <ResultRowCard key={s.sec} sum={s} line={meaning(s, t)} />;
          })}
          <ResultRowCard sum={sum.core} line="The numbers and reading every subject is built on." />
        </div>
      </Block>

      {changes.length > 0 && (
        <Block title="Then and now">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[#5b6168]">
              <tr>
                <th className="py-1.5 pr-3 font-semibold">Subject</th>
                <th className="py-1.5 pr-3 font-semibold">Area</th>
                <th className="py-1.5 pr-3 font-semibold">Day one</th>
                <th className="py-1.5 font-semibold">Now</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c, i) => (
                <tr key={i} className="border-t border-[#eceef0]">
                  <td className="py-1.5 pr-3">{c.section}</td>
                  <td className="py-1.5 pr-3">{c.label}</td>
                  <td className="py-1.5 pr-3 text-[#5b6168]">{c.from}</td>
                  <td className={`py-1.5 font-semibold ${c.move > 0 ? "text-[#1f7a5c]" : c.move < 0 ? "text-[#b3412e]" : "text-[#1b1e21]"}`}>
                    {c.to} {c.move > 0 ? "↑" : c.move < 0 ? "↓" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      )}

      {/* Hamza's note */}
      <Block title="A note from Hamza" hideOnPaper={!notes.note.trim()}>
        <Editable value={notes.note} placeholder="Write a personal note to the student: what stood out, what you will work on together." onChange={(v) => (setNotes({ ...notes, note: v }), setSaved("idle"))} rows={4} />
      </Block>

      {/* Written answers */}
      <Block title="Your written answers">
        <div className="grid gap-4">
          {sum.tracks.map((s) => {
            const w = notes.written[s.sec] ?? {};
            const text = (r.written[s.sec] ?? "").trim();
            return (
              <div key={s.sec} className="break-inside-avoid rounded-xl border border-[#e3e5e7] p-4">
                <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8a5a0c]">{s.title}</p>
                <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[#1b1e21]">{text || "No answer written."}</p>
                <p className="mt-2 rounded-lg bg-[#fdf6e6] px-3 py-2 text-[12.5px] leading-relaxed text-[#5b4a1f] print:hidden">
                  <span className="font-semibold">Mark guide: </span>
                  {(() => {
                    const t = r.tracks.find((x) => `${x.level}-${x.sub}` === s.sec);
                    return t ? BANK[t.level][t.sub].ms : "";
                  })()}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                  {(Object.keys(GRADE) as Array<keyof typeof GRADE>).map((g) => (
                    <button
                      key={g}
                      onClick={() => setW(s.sec, { grade: w.grade === g ? undefined : g })}
                      aria-pressed={w.grade === g}
                      className={`h-8 rounded-full border px-3 text-[13px] font-medium ${w.grade === g ? "rp-on bg-[#1b1e21] text-white" : "rp-out text-[#5b6168]"}`}
                    >
                      {GRADE[g]}
                    </button>
                  ))}
                </div>
                {w.grade && <p className="mt-3 hidden text-[13px] font-semibold text-[#1b1e21] print:block">{GRADE[w.grade]}</p>}
                <div className="mt-2">
                  <Editable value={w.comment ?? ""} placeholder="Feedback on this answer (optional)" onChange={(v) => setW(s.sec, { comment: v })} rows={2} small />
                </div>
              </div>
            );
          })}
        </div>
      </Block>

      {/* Questions to go over */}
      <Block title="Go over these first">
        <p className="-mt-2 mb-4 text-[14px] text-[#5b6168]">For each one, read the answer, then explain it out loud in your own words without looking.</p>
        {[sum.core, ...sum.tracks].map((s) => {
          const list = missed(r, s.sec);
          const lucky = shaky(r, s.sec);
          if (!list.length && !lucky.length) return null;
          return (
            <div key={s.sec} className="mb-6">
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#8a5a0c]">{s.title}</p>
              <ol className="grid gap-2">
                {list.map((x, i) => (
                  <Item key={i} x={x} />
                ))}
                {lucky.map((x, i) => (
                  <Item key={`g${i}`} x={x} note="You guessed this one correctly. Check you know why." />
                ))}
              </ol>
            </div>
          );
        })}
      </Block>

      {/* Habits */}
      {sum.learner.length > 0 && (
        <Block title="How you learn: three things to try">
          <ol className="grid gap-2.5">
            {sum.learner.slice(0, 3).map((t, i) => (
              <li key={t.id} className="flex gap-3 text-[14px] leading-relaxed">
                <Num n={i + 1} />
                <span>{t.student}</span>
              </li>
            ))}
          </ol>
        </Block>
      )}

      {/* Plan */}
      <Block title={end ? "What to work on next" : "Your first four weeks"}>
        <ol className="grid gap-2.5">
          {firstWeeks(r).map((t, i) => (
            <li key={i} className="flex gap-3 text-[14px] leading-relaxed">
              <Num n={i + 1} />
              <span>{t}</span>
            </li>
          ))}
        </ol>
      </Block>

      <footer className="mt-10 flex items-center justify-between border-t border-[#e3e5e7] pt-4 text-[12px] text-[#5b6168]">
        <span>Hamza Teaches · Accounting, Business and Economics</span>
        <span>hamzateaches.com</span>
      </footer>
    </Shell>
  );
}

function Shell({ children, bar }: { children: ReactNode; bar?: ReactNode }) {
  return (
    <div className="rp min-h-dvh bg-[#eef0f2] text-[#1b1e21] print:bg-white" style={{ fontFamily: "var(--font-inter-tight), ui-sans-serif, system-ui, sans-serif" }}>
      {bar && <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#e3e5e7] bg-white/95 px-5 py-3 backdrop-blur print:hidden">{bar}</div>}
      <main className="mx-auto my-8 max-w-[210mm] bg-white px-[14mm] py-[14mm] shadow-[0_2px_24px_rgba(0,0,0,0.08)] print:my-0 print:max-w-none print:p-0 print:shadow-none">{children}</main>
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print { html, body { background: #fff !important; } }
        /* The public site pins heading colours and every border colour
           (globals.css); this paper page needs its own. */
        .rp h1, .rp h2, .rp h3 { color: #1b1e21; font-family: var(--font-inter-tight), ui-sans-serif, system-ui, sans-serif; }
        .rp * { border-color: #e3e5e7; }
        .rp .rp-gold { border-color: #FBC159; }
        .rp .rp-out { border-color: #c9cdd1; }
        .rp .rp-on { border-color: #1b1e21; }
        .rp textarea:focus { border-color: #8a5a0c; }
      `}</style>
    </div>
  );
}

function Block({ title, children, hideOnPaper }: { title: string; children: ReactNode; hideOnPaper?: boolean }) {
  return (
    <section className={`mt-8 break-inside-avoid-page ${hideOnPaper ? "print:hidden" : ""}`}>
      <h2 className="mb-4 text-[19px] font-bold tracking-[-0.02em] text-[#1b1e21]">{title}</h2>
      {children}
    </section>
  );
}

function Num({ n }: { n: number }) {
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FBC159] text-[12px] font-bold text-[#1b1e21]">{n}</span>;
}

function Pips({ r }: { r: 1 | 2 | 3 | null }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap text-[12.5px] text-[#5b6168]">
      {r ? RATING_LABEL[r] : ""}
      <span className="flex gap-0.5">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1.5 w-4 rounded-full ${r && n <= r ? "bg-[#FBC159]" : "bg-[#e3e5e7]"}`} />
        ))}
      </span>
    </span>
  );
}

function ResultRowCard({ sum, line }: { sum: SectionSummary; line: string }) {
  return (
    <div className="break-inside-avoid rounded-xl border border-[#e3e5e7] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[16px] font-bold text-[#1b1e21]">{sum.title}</p>
        {sum.sec !== "core" && <p className="text-[13px] font-semibold text-[#8a5a0c]">{sum.readyLabel}</p>}
      </div>
      <p className="mt-1 text-[13.5px] leading-relaxed text-[#5b6168]">{line}</p>
      <div className="mt-3 grid gap-1.5">
        {sum.areas.map((a) => (
          <div key={a.area} className="flex items-center justify-between gap-3 text-[13.5px]">
            <span>{a.name}</span>
            <Pips r={a.r} />
          </div>
        ))}
      </div>
      {sum.sec !== "core" && (
        <p className="mt-3 text-[12.5px] text-[#5b6168]">{sum.prev ? "Already knows some of what comes next: stretch work ahead." : "What comes next is new, which is expected. We build it from the start."}</p>
      )}
    </div>
  );
}

function Item({ x, note }: { x: ReportItem; note?: string }) {
  const theirs = x.a.c == null ? "No answer" : x.a.c === -1 ? "I don’t know" : x.q.o[x.a.c];
  return (
    <li className="break-inside-avoid rounded-xl border border-[#e3e5e7] p-3.5">
      {x.q.context && <p className="mb-1.5 text-[12.5px] italic leading-relaxed text-[#5b6168]">{x.q.context}</p>}
      <p className="text-[14px] font-semibold leading-snug">{x.q.q}</p>
      <p className="mt-1.5 text-[13px] text-[#5b6168]">
        {note ? note : <>You chose: {theirs}. </>}
        {!note && (
          <>
            Answer: <span className="font-semibold text-[#1b1e21]">{x.q.o[x.q.a]}</span>
          </>
        )}
      </p>
      {x.explain && <p className="mt-1 text-[13px] leading-relaxed text-[#1b1e21]">{x.explain}</p>}
    </li>
  );
}

/** A text box on screen; plain text on paper. */
function Editable({ value, onChange, placeholder, rows, small }: { value: string; onChange: (v: string) => void; placeholder: string; rows: number; small?: boolean }) {
  return (
    <>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className={`w-full resize-y rp-out rounded-lg border border-dashed bg-[#fafbfb] px-3 py-2 leading-relaxed outline-none focus:border-[#8a5a0c] print:hidden ${small ? "text-[13px]" : "text-[14px]"}`}
      />
      {value.trim() ? (
        <p className={`hidden whitespace-pre-wrap leading-relaxed print:block ${small ? "text-[13px]" : "text-[14px]"}`}>{value}</p>
      ) : null}
    </>
  );
}
