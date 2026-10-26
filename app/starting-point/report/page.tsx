"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Brand";
import { SUBJECTS } from "@/lib/diagnostic/bank";
import { LEVEL_SHORT } from "@/lib/diagnostic/logic";
import { ROADMAP } from "@/lib/diagnostic/roadmap";
import { loadResults, saveNotes, type ResultRow } from "@/lib/diagnostic/results-client";
import { emptyNotes, habits, startPoints, type ReportNotes } from "@/lib/diagnostic/student-report";

/**
 * A student's Starting Point Report: one A4 page. The top half is the
 * roadmap (each course in the order Hamza teaches it, from the syllabus);
 * the bottom half is what to have clear before lesson one and a four week
 * commitment the student signs. Hamza can add a short note, then Save as
 * PDF. Opened from Admin → Starting points; only the teacher can load it.
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
  const points = startPoints(r);
  const habitRows = habits(r);
  // One road per subject: AS and A2 taken together run as one continuous road.
  const roads: Road[] = SUBJECTS.flatMap((sub) => {
    const ts = r.tracks.filter((t) => t.sub === sub);
    if (!ts.length) return [];
    const both = ts.length > 1;
    const stops = ts.flatMap((t) => ROADMAP[t.level][t.sub].map((name, i) => ({ name, n: i + 1, a2: both && t.level === "a2", tag: both && i === 0 ? LEVEL_SHORT[t.level] : "" })));
    const chips = ts.map((t) => {
      const s = sum.tracks.find((x) => x.sec === `${t.level}-${t.sub}`)!;
      return { label: both ? `${LEVEL_SHORT[t.level]}: ${s.readyLabel}` : s.readyLabel, ready: s.ready };
    });
    const title = both ? `${sub}, AS and A2` : sum.tracks.find((x) => x.sec === `${ts[0].level}-${sub}`)!.title;
    return [{ key: sub, title, chips, stops }];
  });

  async function save(next = notes) {
    setSaved("saving");
    setSaved((await saveNotes(r!.id, next)) ? "saved" : "failed");
  }

  return (
    <Frame
      bar={
        <>
          <Link href="/admin/starting-points" className="rp-back">
            ← Starting points
          </Link>
          <span className="rp-status">{saved === "saving" ? "Saving…" : saved === "saved" ? "Saved" : saved === "failed" ? "Couldn't save. Try again." : ""}</span>
          <button onClick={() => void save()} className="rp-btn rp-btn-out">
            Save note
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
      <section className={`rp-sheet rp-n${Math.min(roads.length, 4)} ${roads.some((x) => x.stops.length > 12) ? "rp-long" : ""}`}>
        <header className="rp-head">
          <Logo className="h-12" />
          <div className="rp-head-text">
            <p className="rp-kicker">{end ? "End of session report" : "Starting Point Report"}</p>
            <h1 className="rp-name">{r.name || "Student"}</h1>
            <p className="rp-date">{day(r.finishedAt ?? r.savedAt)}</p>
          </div>
        </header>

        <section className="rp-block rp-roadmap">
          <h2 className="rp-label">Your roadmap</h2>
          <div className="rp-roads">
            {roads.map((road) => (
              <div key={road.key} className="rp-road">
                <div className="rp-road-head">
                  <p className="rp-road-title">{road.title}</p>
                  {road.chips.map((c) => (
                    <p key={c.label} className={`rp-chip rp-chip-${c.ready}`}>
                      {c.label}
                    </p>
                  ))}
                </div>
                {roads.length === 1 ? <Snake road={road} end={end} /> : <Path road={road} end={end} />}
              </div>
            ))}
          </div>
        </section>

        <div className="rp-split">
          <section className="rp-block">
            <h2 className="rp-label">{end ? "Keep sharp before the exam" : "Before our first lesson"}</h2>
            <ul className="rp-ticks">
              {(points.length ? points : [{ skill: "Read the first topic in your notes", where: "Every subject" }]).map((x, i) => (
                <li key={i}>
                  <span className="rp-box" aria-hidden />
                  <span>
                    <b>{x.skill}</b>
                    <em>{x.where}</em>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rp-block">
            <h2 className="rp-label">My four week commitment</h2>
            <table className="rp-tracker">
              <thead>
                <tr>
                  <th />
                  {[1, 2, 3, 4].map((w) => (
                    <th key={w}>Week {w}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {habitRows.map((h) => (
                  <tr key={h}>
                    <td>{h}</td>
                    {[1, 2, 3, 4].map((w) => (
                      <td key={w}>
                        <span className="rp-box" aria-hidden />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="rp-pledge">
              I will study <span className="rp-fill" /> hours a week outside class.
            </p>
            <p className="rp-pledge">
              Signed <span className="rp-fill rp-fill-wide" />
            </p>
          </section>
        </div>

        <section className={`rp-note ${notes.note.trim() ? "" : "rp-print-hide"}`}>
          <textarea
            className="rp-input rp-screen-only"
            value={notes.note}
            maxLength={220}
            rows={2}
            placeholder="Optional: one or two lines from you to this student."
            onChange={(e) => (setNotes({ ...notes, note: e.target.value }), setSaved("idle"))}
          />
          {notes.note.trim() && <p className="rp-note-text rp-print-only">{notes.note}</p>}
          <p className="rp-sign">Hamza</p>
        </section>

        <footer className="rp-foot">
          <span>Hamza Teaches</span>
          <span>hamzateaches.com</span>
        </footer>
      </section>
    </Frame>
  );
}

type Stop = { name: string; n: number; a2: boolean; tag: string };
type Road = { key: string; title: string; chips: Array<{ label: string; ready: 1 | 2 | 3 }>; stops: Stop[] };

function StopItem({ stop, up }: { stop: Stop; up: boolean }) {
  return (
    <li className={`rp-stop ${up ? "rp-up" : "rp-down"}`}>
      <span className="rp-stop-text">
        {stop.tag && <b className="rp-tag">{stop.tag}</b>}
        {stop.name}
      </span>
      <span className={`rp-dot ${stop.a2 ? "rp-dot-a2" : ""}`}>{stop.n}</span>
    </li>
  );
}

function Ends({ which, end, up }: { which: "start" | "finish"; end: boolean; up: boolean }) {
  return (
    <li className={`rp-stop ${up ? "rp-up" : "rp-down"}`}>
      <span className="rp-stop-text">{which === "start" ? (end ? "Day one" : "Today") : "Exam"}</span>
      <span className={`rp-dot ${which === "start" ? "rp-dot-x" : "rp-dot-flag"}`}>{which === "start" ? "✕" : "★"}</span>
    </li>
  );
}

/** One straight road: today, every topic in order, the exam. */
function Path({ road, end }: { road: Road; end: boolean }) {
  return (
    <ol className="rp-path" style={{ gridTemplateColumns: `repeat(${road.stops.length + 2}, 1fr)` }}>
      <Ends which="start" end={end} up />
      {road.stops.map((stop, i) => (
        <StopItem key={`${stop.name}-${i}`} stop={stop} up={i % 2 === 1} />
      ))}
      <Ends which="finish" end={end} up={road.stops.length % 2 === 1} />
    </ol>
  );
}

/** One subject only: the road winds across two rows to fill the space. */
function Snake({ road, end }: { road: Road; end: boolean }) {
  const half = Math.ceil(road.stops.length / 2);
  const cols = half + 1;
  const top = road.stops.slice(0, half);
  const bottom = road.stops.slice(half);
  return (
    <div className="rp-snake">
      <ol className="rp-path" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, ["--cols" as string]: cols }}>
        <Ends which="start" end={end} up />
        {top.map((stop, i) => (
          <StopItem key={`${stop.name}-${i}`} stop={stop} up />
        ))}
      </ol>
      <span className="rp-bend" aria-hidden />
      <ol className="rp-path rp-path-back" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, ["--cols" as string]: cols }}>
        {bottom.map((stop, i) => (
          <StopItem key={`${stop.name}-${i}`} stop={stop} up={false} />
        ))}
        <Ends which="finish" end={end} up={false} />
      </ol>
    </div>
  );
}

function Frame({ children, bar }: { children: ReactNode; bar?: ReactNode }) {
  return (
    <div className="rp">
      {bar && <div className="rp-bar">{bar}</div>}
      <div className="rp-desk">{children}</div>
      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
/* One A4 page in Hamza Teaches charcoal and gold. */
.rp {
  --ink: #16191c; --body: #3a4046; --muted: #6b7279; --line: #e4e6e8; --desk: #e9ebed;
  --dark: #1b1e21; --gold: #fbc159; --gold-ink: #8a5a0c; --gold-tint: #fdf5e4;
  --sans: var(--font-inter-tight), ui-sans-serif, system-ui, sans-serif; --hand: var(--font-caveat), cursive;
  background: var(--desk); color: var(--body); font-family: var(--sans); min-height: 100dvh;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.rp * { box-sizing: border-box; border-color: var(--line); }
.rp h1, .rp h2 { color: var(--ink); font-family: var(--sans); margin: 0; }
.rp p { margin: 0; }
.rp-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: rgba(255,255,255,.96); border-bottom: 1px solid var(--line); }
.rp-back { font-size: 14px; font-weight: 500; color: var(--muted); text-decoration: none; }
.rp-status { margin-left: auto; font-size: 13px; color: var(--muted); }
.rp-btn { height: 40px; padding: 0 18px; border-radius: 999px; font: 600 14px var(--sans); cursor: pointer; }
.rp .rp-btn-out { background: #fff; border: 1px solid #c9cdd1; color: var(--ink); }
.rp-btn-gold { background: var(--gold); border: 0; color: var(--dark); }
.rp-btn:focus-visible, .rp-input:focus-visible { outline: 2px solid var(--gold-ink); outline-offset: 2px; }
.rp-missing { padding: 80px 20px; text-align: center; font-size: 15px; color: var(--muted); }
.rp-desk { display: grid; justify-content: center; padding: 28px 16px 64px; }

.rp-sheet { width: 210mm; height: 297mm; overflow: hidden; background: #fff; padding: 0 14mm 10mm; box-shadow: 0 2px 24px rgba(0,0,0,.08); display: flex; flex-direction: column; }
@media screen and (max-width: 860px) { .rp-sheet { width: 100%; height: auto; padding: 0 16px 16px; } .rp-head { margin: 0 -16px !important; padding: 18px 16px !important; } }

/* Header */
.rp-head { margin: 0 -14mm; padding: 9mm 14mm 8mm; background-color: var(--dark); display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
  background-image: linear-gradient(rgba(251,193,89,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(251,193,89,.07) 1px, transparent 1px); background-size: 8mm 8mm; }
.rp-head-text { text-align: right; }
.rp-kicker { font-size: 10px; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: var(--gold); }
.rp .rp-name { color: #fff; font-size: 30px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.05; margin-top: 2mm; }
.rp-date { margin-top: 1.5mm; font-size: 11.5px; color: #b0b6bb; }

.rp-block { margin-top: 7mm; }
.rp .rp-label { font-size: 10.5px; font-weight: 800; letter-spacing: .2em; text-transform: uppercase; color: var(--gold-ink); margin-bottom: 4mm; }

/* Roadmap: the top half of the page. Row size shrinks as subjects are added. */
.rp-sheet { --lab: 15mm; --dot: 10mm; --fs: 11px; --gap: 7mm; }
.rp-n2 { --lab: 12.5mm; --dot: 9mm; --fs: 10.2px; --gap: 6mm; }
.rp-n3 { --lab: 9.5mm; --dot: 7mm; --fs: 9px; --gap: 4.5mm; }
.rp-n4 { --lab: 7.5mm; --dot: 6mm; --fs: 8.4px; --gap: 3mm; }
/* One subject: a two row road that bends back on itself. */
.rp-n1 { --lab: 13mm; --dot: 11mm; --fs: 12px; }
.rp-snake { position: relative; display: grid; gap: 6mm; padding-right: 7mm; }
.rp-path-back { direction: rtl; }
.rp-path-back .rp-stop { direction: ltr; }
.rp .rp-snake .rp-path::before { left: calc(50% / var(--cols)); right: 0; }
.rp .rp-bend { position: absolute; right: 0; width: 14mm; top: calc(var(--lab) + var(--dot) / 2); bottom: calc(var(--lab) + var(--dot) / 2); border: 2px dashed var(--gold); border-left: 0; border-radius: 0 12mm 12mm 0; }
/* AS and A2 on one road: many stops, so smaller labels and dots. */
.rp-long { --fs: 8.2px; --dot: 6mm; --lab: 10.5mm; }
.rp-long.rp-n3 { --lab: 9.5mm; }
.rp .rp-dot-a2 { background: var(--gold-tint); }
.rp-tag { display: block; margin-bottom: .3mm; font-size: 8px; font-weight: 800; letter-spacing: .12em; color: var(--gold-ink); }
.rp-sheet > * { flex-shrink: 0; }
.rp-roadmap { min-height: 128mm; display: flex; flex-direction: column; }
.rp-roadmap .rp-roads { flex: 1; align-content: space-evenly; }
.rp-roads { display: grid; gap: var(--gap); }
.rp-road { display: grid; gap: 2.5mm; }
.rp-road-head { display: flex; align-items: center; gap: 3mm; flex-wrap: wrap; }
.rp-road-title { font-size: 14px; font-weight: 800; color: var(--ink); line-height: 1.2; }
.rp-chip { display: inline-block; font-size: 9.5px; font-weight: 700; line-height: 1.3; padding: 2px 7px; border-radius: 6px; }
.rp-chip-3 { background: #e5f3ec; color: #1f6b52; }
.rp-chip-2 { background: var(--gold-tint); color: var(--gold-ink); }
.rp-chip-1 { background: #f6e7e3; color: #9a3a29; }
.rp-path { list-style: none; margin: 0; padding: 0; display: grid; position: relative; }
.rp .rp-path::before { content: ""; position: absolute; left: 4%; right: 4%; top: 50%; border-top: 2px dashed var(--gold); }
.rp-stop { position: relative; display: grid; grid-template-rows: var(--lab) var(--dot) var(--lab); justify-items: center; }
/* Labels alternate above and below the line, so each may use two stops' width. */
.rp-stop-text { font-size: var(--fs); line-height: 1.18; text-align: center; color: var(--body); width: 190%; justify-self: center; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.rp-up .rp-stop-text { grid-row: 1; align-self: end; padding-bottom: 1mm; }
.rp-down .rp-stop-text { grid-row: 3; align-self: start; padding-top: 1mm; }
.rp .rp-dot { grid-row: 2; align-self: center; z-index: 1; width: var(--dot); height: var(--dot); border-radius: 50%; background: #fff; border: 1.6px solid var(--gold); display: grid; place-items: center; font-size: calc(var(--fs) + 1px); font-weight: 800; color: var(--ink); }
.rp .rp-dot-x { background: var(--dark); border-color: var(--dark); color: var(--gold); }
.rp .rp-dot-flag { background: var(--gold); border-color: var(--gold); color: var(--dark); }

/* Bottom half */
.rp-split { display: grid; grid-template-columns: 1fr 1.25fr; gap: 9mm; margin-top: 4mm; padding-top: 2mm; border-top: 1px solid var(--line); }
.rp-ticks { list-style: none; margin: 0; padding: 0; display: grid; gap: 3mm; }
.rp-ticks li { display: grid; grid-template-columns: 5mm 1fr; gap: 3mm; align-items: start; }
.rp-ticks b { display: block; font-size: 12.5px; color: var(--ink); line-height: 1.3; }
.rp-ticks em { display: block; font-style: normal; font-size: 10.5px; color: var(--muted); margin-top: .5mm; }
.rp .rp-box { display: inline-block; width: 4mm; height: 4mm; border: 1.4px solid var(--ink); border-radius: 1mm; margin-top: .4mm; }
.rp-tracker { width: 100%; border-collapse: collapse; font-size: 11px; }
.rp-tracker th { font-size: 9.5px; font-weight: 700; color: var(--muted); text-align: center; padding: 0 0 2mm; }
.rp-tracker td { padding: 2.8mm 0; border-top: 1px solid var(--line); text-align: center; vertical-align: middle; }
.rp-tracker td:first-child { text-align: left; color: var(--ink); font-weight: 600; line-height: 1.3; padding-right: 3mm; width: 52%; }
.rp-pledge { margin-top: 4mm; font-size: 12px; color: var(--ink); display: flex; align-items: flex-end; gap: 2mm; }
.rp .rp-fill { display: inline-block; width: 14mm; border-bottom: 1.2px solid var(--ink); height: 4mm; }
.rp .rp-fill-wide { width: 50mm; }

/* Note and footer */
.rp-note { margin-top: auto; padding-top: 6mm; }
.rp .rp-input { width: 100%; resize: vertical; border: 1px dashed #c9cdd1; border-radius: 8px; background: #fafbfb; padding: 8px 10px; font: 400 13px/1.5 var(--sans); color: var(--ink); }
.rp-note-text { font-size: 13px; line-height: 1.5; color: var(--ink); }
.rp-sign { margin-top: 1mm; font-family: var(--hand); font-size: 24px; color: var(--gold-ink); line-height: 1; }
.rp .rp-foot { margin-top: 5mm; padding-top: 3mm; border-top: 1px solid var(--line); display: flex; justify-content: space-between; font-size: 10px; color: var(--muted); }

.rp-print-only { display: none; }
@page { size: A4; margin: 0; }
@media print {
  html, body { background: #fff !important; }
  .rp { background: #fff; }
  .rp-bar, .rp-screen-only, .rp-print-hide { display: none !important; }
  .rp-print-only { display: block; }
  .rp-desk { display: block; padding: 0; }
  .rp-sheet { box-shadow: none; }
}
`;
