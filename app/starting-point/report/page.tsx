"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Brand";
import { BANK } from "@/lib/diagnostic/bank";
import { RATING_LABEL, type SectionSummary } from "@/lib/diagnostic/logic";
import { compare } from "@/lib/diagnostic/report";
import { loadResults, nameKey, saveNotes, type ResultRow } from "@/lib/diagnostic/results-client";
import { GRADE, emptyNotes, meaning, route, strengths, type ReportItem, type ReportNotes, type RouteStep } from "@/lib/diagnostic/student-report";

/**
 * A student's Starting Point Report, for Hamza to finish and send: three A4
 * sheets (cover and map, the route, written feedback and the rest to go
 * over). Hamza adds a note and written feedback on screen, then Save as PDF.
 * Opened from Admin → Starting points; only the teacher can load it.
 */
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
/** Fewer extra questions when there are more written answers, to stay on three pages. */
const restLimit = (tracks: number, comments: number, compared: boolean) => Math.max(2, 8 - 2 * (tracks - 1) - comments - (compared ? 4 : 0));

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

  if (!rows) return <Frame>{null}</Frame>;
  const r = rows.find((x) => x.id === id);
  if (!r || !r.summary) {
    return (
      <Frame>
        <p className="rp-missing">{error || "This report could not be found. Open it again from Admin → Starting points."}</p>
      </Frame>
    );
  }
  const sum = r.summary;
  const end = r.kind === "end";
  const before = end ? rows.find((x) => x.kind === "start" && nameKey(x.name) === nameKey(r.name)) : undefined;
  // Overall results, plus only the areas that moved, so it stays on the page.
  const changes = before ? compare(before, r).filter((c) => c.section !== "How they learn" && c.label !== "Certain but wrong" && (c.label === "Overall" || c.move !== 0)).slice(0, 10) : [];
  const { steps, rest } = route(r);
  const REST_LIMIT = restLimit(sum.tracks.length, Object.values(notes.written).filter((w) => w.comment?.trim()).length, changes.length > 0);
  const good = strengths(r);
  const first = r.name.trim().split(/\s+/)[0] || "there";

  async function save(next = notes) {
    setSaved("saving");
    setSaved((await saveNotes(r!.id, next)) ? "saved" : "failed");
  }
  const setW = (sec: string, patch: Partial<ReportNotes["written"][string]>) => {
    setNotes({ ...notes, written: { ...notes.written, [sec]: { ...notes.written[sec], ...patch } } });
    setSaved("idle");
  };

  return (
    <Frame
      bar={
        <>
          <Link href="/admin/starting-points" className="rp-back">
            ← Starting points
          </Link>
          <span className="rp-status">{saved === "saving" ? "Saving…" : saved === "saved" ? "Notes saved" : saved === "failed" ? "Couldn't save. Try again." : "Add your note and feedback, then save as PDF."}</span>
          <button onClick={() => void save()} className="rp-btn rp-btn-out">
            Save notes
          </button>
          <button
            onClick={async () => {
              await save({ ...notes, sentAt: notes.sentAt ?? new Date().toISOString() });
              window.print();
            }}
            className="rp-btn rp-btn-gold"
          >
            Save as PDF
          </button>
        </>
      }
    >
      {/* Sheet 1: cover, map, where you are */}
      <Sheet compact={sum.tracks.length >= 3}>
        <div className="rp-cover">
          <div className="rp-cover-top">
            <Logo className="h-14" />
            <span className="rp-cover-date">{day(r.finishedAt ?? r.savedAt)}</span>
          </div>
          <p className="rp-eyebrow rp-eyebrow-gold">{end ? "End of session report" : "Starting Point Report"}</p>
          <h1 className="rp-name">{r.name || "Student"}</h1>
          <p className="rp-cover-sub">{sum.tracks.map((t) => t.title).join("  ·  ")}</p>
        </div>

        <p className="rp-lede">
          {first}, this is {end ? "where you finished the session, and what to keep working on before the exam." : "your starting point, and the route I want you to take from here."} Follow it step by step and tick each box as you go.
        </p>

        <Map steps={steps} />

        <h2 className="rp-h2">{end ? "Where you are now" : "Where you are starting"}</h2>
        <div className="rp-grid">
          {sum.tracks.map((s) => {
            const t = r.tracks.find((x) => `${x.level}-${x.sub}` === s.sec)!;
            return <Standing key={s.sec} sum={s} line={meaning(s, t)} />;
          })}
          <Standing sum={sum.core} line="The numbers and reading every subject is built on." wide={sum.tracks.length % 2 === 1} />
        </div>

        {good.length > 0 && (
          <p className="rp-good">
            <span className="rp-good-label">Already strong</span>
            {good.slice(0, 5).join(" · ")}
          </p>
        )}

        <div className={`rp-note ${notes.note.trim() ? "" : "rp-print-hide"}`}>
          <p className="rp-eyebrow">A note from me</p>
          <Editable value={notes.note} placeholder="Your personal note to the student: what stood out, and what you will work on together. Written as you." rows={3} maxLength={450} onChange={(v) => (setNotes({ ...notes, note: v }), setSaved("idle"))} />
          <p className="rp-sign">Hamza</p>
        </div>
      </Sheet>

      {/* Sheet 2: the route */}
      <Sheet>
        <SheetHead kicker="Your route" title={end ? "What to work on next" : "How to start"} />
        {steps.map((s) => (
          <StepBlock key={s.key} s={s} />
        ))}
      </Sheet>

      {/* Sheet 3: written answers, then and now, the rest to go over */}
      <Sheet last>
        <SheetHead kicker="Your answers" title="Written answers and the rest to go over" />

        {changes.length > 0 && (
          <section className="rp-section">
            <h3 className="rp-h3">Then and now</h3>
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Area</th>
                  <th>Day one</th>
                  <th>Now</th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c, i) => (
                  <tr key={i}>
                    <td>{c.section}</td>
                    <td>{c.label}</td>
                    <td className="rp-muted">{c.from}</td>
                    <td className={c.move > 0 ? "rp-up" : c.move < 0 ? "rp-down" : ""}>
                      {c.to} {c.move > 0 ? "↑" : c.move < 0 ? "↓" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}


        <section className="rp-section">
          <h3 className="rp-h3">Your written answers</h3>
          <div className="rp-written">
            {sum.tracks.map((s) => {
              const t = r.tracks.find((x) => `${x.level}-${x.sub}` === s.sec)!;
              const w = notes.written[s.sec] ?? {};
              const text = (r.written[s.sec] ?? "").trim();
              return (
                <div key={s.sec} className="rp-card rp-avoid">
                  <div className="rp-card-head">
                    <span className="rp-eyebrow">{s.title}</span>
                    {w.grade && <span className={`rp-grade rp-grade-${w.grade}`}>{GRADE[w.grade]}</span>}
                  </div>
                  <p className="rp-q">{BANK[t.level][t.sub].w}</p>
                  <p className="rp-answer">{text ? (text.length > 320 ? `${text.slice(0, 320)}…` : text) : "No answer written."}</p>
                  <div className="rp-screen-only rp-guide">
                    <b>Mark guide: </b>
                    {BANK[t.level][t.sub].ms}
                  </div>
                  <div className="rp-screen-only rp-chips">
                    {(Object.keys(GRADE) as Array<keyof typeof GRADE>).map((g) => (
                      <button key={g} onClick={() => setW(s.sec, { grade: w.grade === g ? undefined : g })} aria-pressed={w.grade === g} className={`rp-chip ${w.grade === g ? "rp-chip-on" : ""}`}>
                        {GRADE[g]}
                      </button>
                    ))}
                  </div>
                  <Editable value={w.comment ?? ""} placeholder="Your feedback on this answer (optional)" rows={2} small onChange={(v) => setW(s.sec, { comment: v })} />
                </div>
              );
            })}
          </div>
        </section>

        {rest.length > 0 && (
          <section className="rp-section">
            <h3 className="rp-h3">Also go over</h3>
            <p className="rp-small">The other questions you missed. Read the answer, then explain it out loud.</p>
            <ol className="rp-rest">
              {rest.slice(0, REST_LIMIT).map((x, i) => (
                <li key={i} className="rp-avoid">
                  <p className="rp-rest-q">{x.q.q}</p>
                  <p className="rp-rest-a">
                    <b>{x.q.o[x.q.a]}.</b> {x.explain}
                  </p>
                </li>
              ))}
            </ol>
            {rest.length > REST_LIMIT && <p className="rp-small">Plus {rest.length - REST_LIMIT} more. I go through these with you in class.</p>}
          </section>
        )}

        <footer className="rp-foot">
          <span>Hamza Teaches · Accounting, Business and Economics</span>
          <span>hamzateaches.com</span>
        </footer>
      </Sheet>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */

function Frame({ children, bar }: { children: ReactNode; bar?: ReactNode }) {
  return (
    <div className="rp">
      {bar && <div className="rp-bar">{bar}</div>}
      <div className="rp-sheets">{children}</div>
      <style>{CSS}</style>
    </div>
  );
}

function Sheet({ children, last, compact }: { children: ReactNode; last?: boolean; compact?: boolean }) {
  return <section className={`rp-sheet ${last ? "rp-sheet-last" : ""} ${compact ? "rp-compact" : ""}`}>{children}</section>;
}

function SheetHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <header className="rp-sheet-head">
      <span className="rp-mini-logo">
        <Logo className="h-6" />
      </span>
      <div>
        <p className="rp-eyebrow">{kicker}</p>
        <h2 className="rp-h1">{title}</h2>
      </div>
    </header>
  );
}

/** The route at a glance: four stops joined by a path. */
function Map({ steps }: { steps: RouteStep[] }) {
  return (
    <ol className="rp-map" aria-label="Your route">
      {steps.map((s, i) => (
        <li key={s.key} className="rp-stop">
          <span className={`rp-pin ${i === 0 ? "rp-pin-x" : s.key === "check" ? "rp-pin-flag" : ""}`}>{i === 0 ? "✕" : s.key === "check" ? "★" : i + 1}</span>
          <span className="rp-stop-label">{s.label}</span>
          <span className="rp-stop-title">{s.title}</span>
        </li>
      ))}
    </ol>
  );
}

function Pips({ r }: { r: 1 | 2 | 3 | null }) {
  return (
    <span className="rp-pips">
      {r ? RATING_LABEL[r] : ""}
      <span className="rp-pip-row">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`rp-pip ${r && n <= r ? "rp-pip-on" : ""}`} />
        ))}
      </span>
    </span>
  );
}

function Standing({ sum, line, wide }: { sum: SectionSummary; line: string; wide?: boolean }) {
  return (
    <div className={`rp-card rp-avoid ${wide ? "rp-wide" : ""}`}>
      <p className="rp-card-title">{sum.title}</p>
      {sum.sec !== "core" && <p className="rp-verdict">{sum.readyLabel}</p>}
      <p className="rp-line">{line}</p>
      <div className="rp-areas">
        {sum.areas.map((a) => (
          <div key={a.area} className="rp-area">
            <span>{a.name}</span>
            <Pips r={a.r} />
          </div>
        ))}
      </div>
    </div>
  );
}

function StepBlock({ s }: { s: RouteStep }) {
  return (
    <section className={`rp-step rp-step-${s.key}`}>
      <div className="rp-step-rail">
        <span className={`rp-pin ${s.key === "start" ? "rp-pin-x" : s.key === "check" ? "rp-pin-flag" : ""}`}>{s.key === "start" ? "✕" : s.key === "check" ? "★" : s.label.slice(-1)}</span>
      </div>
      <div className="rp-step-body">
        <p className="rp-eyebrow">{s.label}</p>
        <h3 className="rp-h3">{s.title}</h3>
        <p className="rp-step-intro">{s.intro}</p>
        {s.clues && (
          <ol className="rp-clues">
            {s.clues.map((x, i) => (
              <Clue key={i} x={x} />
            ))}
          </ol>
        )}
        {s.ticks && s.ticks.length > 0 && (
          <ul className="rp-ticks">
            {s.ticks.map((t, i) => (
              <li key={i}>
                <span className="rp-box" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Clue({ x }: { x: ReportItem }) {
  const theirs = x.a.c == null ? "No answer" : x.a.c === -1 ? "I don’t know" : x.q.o[x.a.c];
  return (
    <li className="rp-clue rp-avoid">
      <span className="rp-box" aria-hidden />
      <div>
        {x.q.context && <p className="rp-ctx">{x.q.context}</p>}
        <p className="rp-q">{x.q.q}</p>
        <p className="rp-clue-meta">
          You said: {theirs} <span className="rp-dot">·</span> Answer: <b>{x.q.o[x.q.a]}</b>
        </p>
        {x.explain && <p className="rp-clue-why">{x.explain}</p>}
      </div>
    </li>
  );
}

/** A text box on screen; plain text on paper. */
function Editable({ value, onChange, placeholder, rows, small, maxLength = 600 }: { value: string; onChange: (v: string) => void; placeholder: string; rows: number; small?: boolean; maxLength?: number }) {
  return (
    <>
      <textarea value={value} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} className={`rp-input rp-screen-only ${small ? "rp-input-small" : ""}`} />
      {value.trim() ? <p className={`rp-print-only rp-written-text ${small ? "rp-small" : ""}`}>{value}</p> : null}
    </>
  );
}

const CSS = `
/* Paper report: white A4 sheets in Hamza Teaches charcoal and gold. */
.rp {
  --ink: #16191c; --body: #353b41; --muted: #6b7279; --line: #e6e8ea; --paper: #ffffff; --desk: #e9ebed;
  --dark: #1b1e21; --gold: #fbc159; --gold-ink: #8a5a0c; --gold-tint: #fdf5e4; --up: #1f7a5c; --down: #b3412e;
  --sans: var(--font-inter-tight), ui-sans-serif, system-ui, sans-serif; --hand: var(--font-caveat), cursive;
  background: var(--desk); color: var(--body); font-family: var(--sans); min-height: 100dvh;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.rp * { box-sizing: border-box; border-color: var(--line); }
.rp h1, .rp h2, .rp h3 { color: var(--ink); font-family: var(--sans); margin: 0; text-wrap: balance; }
.rp p { margin: 0; }
.rp-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: rgba(255,255,255,.96); border-bottom: 1px solid var(--line); backdrop-filter: blur(8px); }
.rp-back { font-size: 14px; font-weight: 500; color: var(--muted); text-decoration: none; }
.rp-back:hover { color: var(--ink); }
.rp-status { margin-left: auto; font-size: 13px; color: var(--muted); }
.rp-btn { height: 40px; padding: 0 18px; border-radius: 999px; font: 600 14px var(--sans); cursor: pointer; }
.rp .rp-btn-out { background: #fff; border: 1px solid #c9cdd1; color: var(--ink); }
.rp-btn-gold { background: var(--gold); border: 0; color: var(--dark); }
.rp-btn:focus-visible, .rp-chip:focus-visible, .rp-input:focus-visible { outline: 2px solid var(--gold-ink); outline-offset: 2px; }
.rp-missing { padding: 80px 20px; text-align: center; font-size: 15px; color: var(--muted); }

.rp-sheets { display: grid; justify-content: center; gap: 24px; padding: 28px 16px 64px; }
.rp-sheet { width: 210mm; min-height: 297mm; background: var(--paper); padding: 16mm 16mm 14mm; box-shadow: 0 2px 24px rgba(0,0,0,.08); position: relative; display: flex; flex-direction: column; }
@media screen and (max-width: 860px) { .rp-sheet { width: 100%; min-height: 0; padding: 20px; } .rp-cover { margin: -20px -20px 0 !important; padding: 20px !important; } }

/* Cover */
.rp-cover { margin: -16mm -16mm 0; padding: 12mm 16mm 11mm; background-color: var(--dark); color: #fff;
  background-image: linear-gradient(rgba(251,193,89,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(251,193,89,.07) 1px, transparent 1px); background-size: 9mm 9mm; }
.rp-cover-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 7mm; }
.rp-cover-date { font-size: 12px; color: #b0b6bb; }
.rp .rp-name { color: #fff; font-size: 40px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.02; margin-top: 3mm; }
.rp-cover-sub { margin-top: 3mm; font-size: 14px; color: #d6d9dc; }
.rp-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; color: var(--gold-ink); }
.rp-eyebrow-gold { color: var(--gold); }
.rp-lede { margin-top: 8mm; font-size: 15px; line-height: 1.55; color: var(--body); max-width: 150mm; }

/* Map */
.rp-map { list-style: none; margin: 7mm 0 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); position: relative; }
.rp .rp-map::before { content: ""; position: absolute; left: 12.5%; right: 12.5%; top: 15px; border-top: 2px dashed var(--gold); }
.rp-stop { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px; padding: 0 4px; }
.rp .rp-pin { width: 32px; height: 32px; border-radius: 50%; background: #fff; border: 2px solid var(--gold); color: var(--ink); display: grid; place-items: center; font-size: 13px; font-weight: 800; position: relative; z-index: 1; flex: none; }
.rp .rp-pin-x { background: var(--dark); border-color: var(--dark); color: var(--gold); font-size: 14px; }
.rp .rp-pin-flag { background: var(--gold); color: var(--dark); }
.rp-stop-label { margin-top: 4px; font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: var(--gold-ink); }
.rp-stop-title { font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.25; }

/* Where you are */
.rp .rp-h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; margin-top: 1.5mm; }
.rp .rp-h2 { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; margin: 9mm 0 4mm; }
.rp .rp-h3 { font-size: 16px; font-weight: 800; letter-spacing: -0.015em; }
.rp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
.rp-wide { grid-column: 1 / -1; }
/* Three or more subjects: tighter first page so it stays on one sheet. */
.rp-compact .rp-cover { padding-top: 8mm; padding-bottom: 7mm; }
.rp-compact .rp-cover-top { margin-bottom: 4mm; }
.rp .rp-compact .rp-name { font-size: 34px; }
.rp-compact .rp-pin { width: 28px; height: 28px; }
.rp .rp-compact .rp-map::before { top: 13px; }
.rp-compact .rp-line { display: none; }
.rp-compact .rp-good { margin-top: 3mm; }
.rp-compact .rp-lede { margin-top: 6mm; }
.rp-compact .rp-map { margin-top: 5mm; }
.rp .rp-compact .rp-h2 { margin: 6mm 0 3mm; }
.rp .rp-compact .rp-card { padding: 3mm; }
.rp-compact .rp-grid { gap: 3mm; }
.rp-compact .rp-areas { margin-top: 2mm; gap: 1mm; }
.rp-compact .rp-note { padding-top: 5mm; }
@media screen and (max-width: 640px) { .rp-grid { grid-template-columns: 1fr; } .rp-map { grid-template-columns: repeat(2, 1fr); row-gap: 14px; } .rp .rp-map::before { display: none; } }
.rp .rp-card { border: 1px solid var(--line); border-radius: 10px; padding: 4mm; background: #fff; }
.rp-card-title { font-size: 14.5px; font-weight: 800; color: var(--ink); }
.rp-verdict { margin-top: 1.5mm; display: inline-block; font-size: 11.5px; font-weight: 700; color: var(--gold-ink); background: var(--gold-tint); padding: 2px 8px; border-radius: 999px; }
.rp-line { margin-top: 2mm; font-size: 12.5px; line-height: 1.45; color: var(--body); }
.rp-areas { margin-top: 3mm; display: grid; gap: 1.5mm; }
.rp-area { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12.5px; color: var(--ink); }
.rp-pips { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--muted); white-space: nowrap; }
.rp-pip-row { display: inline-flex; gap: 2px; }
.rp-pip { width: 14px; height: 5px; border-radius: 3px; background: var(--line); }
.rp-pip-on { background: var(--gold); }
.rp-good { margin-top: 5mm; font-size: 12.5px; line-height: 1.5; color: var(--body); }
.rp-good-label { font-weight: 700; color: var(--ink); margin-right: 8px; }
.rp-note { margin-top: auto; padding-top: 7mm; }
.rp-note .rp-eyebrow { margin-bottom: 2mm; }
.rp-sign { margin-top: 1mm; font-family: var(--hand); font-size: 26px; color: var(--gold-ink); line-height: 1; }

/* Route */
.rp .rp-sheet-head { display: flex; align-items: flex-end; justify-content: space-between; flex-direction: row-reverse; gap: 12px; padding-bottom: 4mm; border-bottom: 2px solid var(--gold); margin-bottom: 5mm; }
.rp-mini-logo { background: var(--dark); border-radius: 8px; padding: 6px 10px; display: inline-flex; }
.rp-step { display: grid; grid-template-columns: 34px 1fr; gap: 12px; position: relative; padding-bottom: 4.5mm; }
.rp-step-rail { position: relative; display: flex; justify-content: center; }
.rp .rp-step:not(.rp-step-check) .rp-step-rail::after { content: ""; position: absolute; top: 34px; bottom: -4.5mm; left: 50%; border-left: 2px dashed var(--gold); }
.rp-step-intro { margin-top: 1mm; font-size: 13px; line-height: 1.5; color: var(--body); }
.rp-clues { list-style: none; margin: 2.5mm 0 0; padding: 0; display: grid; gap: 2mm; }
.rp .rp-clue { display: grid; grid-template-columns: 16px 1fr; gap: 10px; border: 1px solid var(--line); border-radius: 10px; padding: 2.4mm 3.2mm; }
.rp-ctx { font-size: 11.5px; font-style: italic; color: var(--muted); margin-bottom: 1mm; line-height: 1.45; }
.rp-q { font-size: 13px; font-weight: 600; color: var(--ink); line-height: 1.4; }
.rp-clue-meta { margin-top: 1mm; font-size: 12px; color: var(--muted); }
.rp-clue-meta b { color: var(--ink); }
.rp-dot { margin: 0 4px; }
.rp-clue-why { margin-top: .8mm; font-size: 11.8px; line-height: 1.45; color: var(--body); }
.rp-ticks { list-style: none; margin: 2.5mm 0 0; padding: 0; display: grid; gap: 1.6mm; }
.rp-ticks li { display: grid; grid-template-columns: 16px 1fr; gap: 10px; font-size: 13px; line-height: 1.45; color: var(--ink); }
.rp .rp-box { width: 14px; height: 14px; border: 1.5px solid var(--ink); border-radius: 3px; margin-top: 2px; }
.rp-step-check .rp-step-body { background: var(--gold-tint); border-radius: 10px; padding: 3.5mm 4mm; }

/* Sheet 3 */
.rp-section { margin-bottom: 6mm; }
.rp-section .rp-h3 { margin-bottom: 3mm; }
.rp-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.rp-table th { text-align: left; font-weight: 700; color: var(--muted); padding: 1.5mm 2mm 1.5mm 0; border-bottom: 1px solid var(--line); }
.rp-table td { padding: 1.5mm 2mm 1.5mm 0; border-bottom: 1px solid var(--line); color: var(--ink); }
.rp .rp-muted { color: var(--muted); }
.rp .rp-up { color: var(--up); font-weight: 700; }
.rp .rp-down { color: var(--down); font-weight: 700; }
.rp-written { display: grid; gap: 3mm; }
.rp-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 1.5mm; }
.rp-grade { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
.rp-grade-strong { background: #e3f3ec; color: var(--up); }
.rp-grade-partly { background: var(--gold-tint); color: var(--gold-ink); }
.rp-grade-needs { background: #f8e6e2; color: var(--down); }
.rp .rp-answer { margin-top: 2mm; font-size: 12.5px; line-height: 1.5; color: var(--body); white-space: pre-wrap; border-left: 2px solid var(--line); padding-left: 3mm; }
.rp-guide { margin-top: 2mm; font-size: 12px; line-height: 1.5; color: #5b4a1f; background: var(--gold-tint); border-radius: 8px; padding: 2mm 3mm; }
.rp-chips { margin-top: 2mm; display: flex; flex-wrap: wrap; gap: 6px; }
.rp .rp-chip { height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid #c9cdd1; background: #fff; font: 500 12.5px var(--sans); color: var(--muted); cursor: pointer; }
.rp .rp-chip-on { background: var(--dark); border-color: var(--dark); color: #fff; }
.rp .rp-input { width: 100%; margin-top: 2mm; resize: vertical; border: 1px dashed #c9cdd1; border-radius: 8px; background: #fafbfb; padding: 8px 10px; font: 400 13.5px/1.5 var(--sans); color: var(--ink); }
.rp .rp-input:focus { border-color: var(--gold-ink); outline: none; }
.rp-input-small { font-size: 12.5px; }
.rp-written-text { margin-top: 2mm; font-size: 13px; line-height: 1.55; color: var(--ink); white-space: pre-wrap; }
.rp-small { font-size: 12px; line-height: 1.5; color: var(--muted); }
.rp-rest { margin: 3mm 0 2mm; padding-left: 5mm; display: grid; gap: 2.5mm; }
.rp-rest li::marker { color: var(--gold-ink); font-weight: 700; font-size: 12px; }
.rp-rest-q { font-size: 12.5px; font-weight: 600; color: var(--ink); line-height: 1.4; }
.rp-rest-a { margin-top: .5mm; font-size: 12px; line-height: 1.5; color: var(--body); }
.rp-rest-a b { color: var(--ink); }
.rp .rp-foot { margin-top: auto; padding-top: 4mm; border-top: 1px solid var(--line); display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }

.rp-print-only { display: none; }
@page { size: A4; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  .rp { background: #fff; }
  .rp-bar, .rp-screen-only, .rp-print-hide { display: none !important; }
  .rp-print-only { display: block; }
  .rp-sheets { display: block; padding: 0; }
  .rp-sheet { width: 210mm; min-height: 297mm; box-shadow: none; break-after: page; }
  .rp-sheet-last { break-after: auto; }
  .rp-avoid { break-inside: avoid; }
}
`;
