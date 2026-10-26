"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Brand";
import { SUBJECTS } from "@/lib/diagnostic/bank";
import { LEVEL_SHORT, RATING_LABEL, type SectionSummary } from "@/lib/diagnostic/logic";
import { PROFILE_TILES, ROADMAP } from "@/lib/diagnostic/roadmap";
import { loadResults, saveNotes, type ResultRow } from "@/lib/diagnostic/results-client";
import { emptyNotes, habits, startPoints, type ReportNotes } from "@/lib/diagnostic/student-report";

/**
 * A student's Starting Point Report: one A4 page on gunmetal. Top: what the
 * student told me about how they study, and the weeks to the exam. Middle:
 * the roadmap (each course in the order Hamza teaches it, from the syllabus)
 * with where they stand in each. Bottom: what to have clear before lesson
 * one and a four week commitment they sign. Hamza can add a short note,
 * then Save as PDF. Opened from Admin → Starting points; teacher only.
 */
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
/** The May/June 2027 series; the countdown is to the start of May. */
const EXAM_MONTH = Date.UTC(2027, 4, 1);

type Stop = { name: string; n: number; a2: boolean; tag: string };
type Road = { key: string; title: string; parts: Array<{ label: string; sum: SectionSummary }>; stops: Stop[] };

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
  const date = r.finishedAt ?? r.savedAt;
  const weeks = Math.max(0, Math.round((EXAM_MONTH - Date.parse(date)) / (7 * 86400000)));
  const points = startPoints(r);
  const habitRows = habits(r);
  const tiles = PROFILE_TILES.map((t) => ({ label: t.label, value: t.short[r.profile[t.id]?.code ?? ""] })).filter((t) => t.value);

  // One road per subject: AS and A2 taken together run as one continuous road.
  const roads: Road[] = SUBJECTS.flatMap((sub) => {
    const ts = r.tracks.filter((t) => t.sub === sub);
    if (!ts.length) return [];
    const both = ts.length > 1;
    const stops = ts.flatMap((t) => ROADMAP[t.level][t.sub].map((name, i) => ({ name, n: i + 1, a2: both && t.level === "a2", tag: both && i === 0 ? LEVEL_SHORT[t.level] : "" })));
    const parts = ts.map((t) => ({ label: LEVEL_SHORT[t.level], sum: sum.tracks.find((x) => x.sec === `${t.level}-${t.sub}`)! }));
    return [{ key: sub, title: both ? `${sub}, AS and A2` : parts[0].sum.title, parts, stops }];
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
          <div>
            <Logo className="h-11" />
            <p className="rp-kicker">{end ? "End of session report" : "Starting Point Report"}</p>
            <h1 className="rp-name">{r.name || "Student"}</h1>
            <p className="rp-date">{day(date)}</p>
          </div>
          {!end && weeks > 0 && (
            <div className="rp-count">
              <span className="rp-count-n">{weeks}</span>
              <span className="rp-count-l">weeks to the May/June 2027 exams</span>
            </div>
          )}
        </header>

        <div className="rp-tiles">
          {tiles.map((t) => (
            <div key={t.label} className="rp-tile">
              <span className="rp-tile-l">{t.label}</span>
              <span className="rp-tile-v">{t.value}</span>
            </div>
          ))}
          <div className="rp-tile">
            <span className="rp-tile-l">Core skills</span>
            <span className="rp-tile-v">{RATING_LABEL[sum.core.ready]}</span>
          </div>
        </div>

        <section className="rp-block rp-roadmap">
          <h2 className="rp-label">Your roadmap</h2>
          <div className="rp-roads">
            {roads.map((road) => (
              <div key={road.key} className="rp-road">
                <div className="rp-road-head">
                  <p className="rp-road-title">{road.title}</p>
                  <div className="rp-parts">
                    {road.parts.map((p) => (
                      <div key={p.label} className="rp-part">
                        {road.parts.length > 1 && <span className="rp-part-l">{p.label}</span>}
                        <span className={`rp-chip rp-chip-${p.sum.ready}`}>{p.sum.readyLabel}</span>
                        {p.sum.areas.map((a) => (
                          <span key={a.area} className="rp-meter" title={a.r ? RATING_LABEL[a.r] : ""}>
                            {a.name === "Applying ideas" ? "Applying" : a.name}
                            <Pips r={a.r} />
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
                {roads.length === 1 ? <Snake road={road} end={end} /> : <Path road={road} end={end} />}
              </div>
            ))}
          </div>
        </section>

        <div className="rp-split">
          <section>
            <h2 className="rp-label">{end ? "Keep sharp before the exam" : "Before our first lesson"}</h2>
            <ul className="rp-ticks">
              {(points.length ? points : [{ skill: "Read the first topic in your notes", where: "Every subject", idea: "" }]).map((x, i) => (
                <li key={i}>
                  <span className="rp-box" aria-hidden />
                  <span>
                    <b>{x.skill}</b>
                    <em>{x.where}</em>
                    {x.idea && <i>{x.idea}</i>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="rp-label">My four week commitment</h2>
            <table className="rp-tracker">
              <thead>
                <tr>
                  <th />
                  {[1, 2, 3, 4].map((w) => (
                    <th key={w}>W{w}</th>
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
          <span>Hamza Teaches · Accounting, Business and Economics</span>
          <span>hamzateaches.com</span>
        </footer>
      </section>
    </Frame>
  );
}

function Pips({ r }: { r: 1 | 2 | 3 | null }) {
  return (
    <span className="rp-pips" aria-hidden>
      {[1, 2, 3].map((n) => (
        <span key={n} className={`rp-pip ${r && n <= r ? "rp-pip-on" : ""}`} />
      ))}
    </span>
  );
}

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
  const style = { gridTemplateColumns: `repeat(${cols}, 1fr)`, ["--cols" as string]: cols };
  return (
    <div className="rp-snake">
      <ol className="rp-path" style={style}>
        <Ends which="start" end={end} up />
        {road.stops.slice(0, half).map((stop, i) => (
          <StopItem key={`${stop.name}-${i}`} stop={stop} up />
        ))}
      </ol>
      <span className="rp-bend" aria-hidden />
      <ol className="rp-path rp-path-back" style={style}>
        {road.stops.slice(half).map((stop, i) => (
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
/* One A4 page on gunmetal, with gold. */
.rp {
  --gun: #2a3439; --gun-2: #323e44; --gun-3: #3a474e; --line: rgba(255,255,255,.12);
  --ink: #f4f1ec; --body: #d7dde0; --muted: #a9b6bc; --faint: #8b9aa1;
  --gold: #fbc159; --gold-soft: rgba(251,193,89,.14); --ok: #7fd1b0; --warn: #fbc159; --low: #f0a08f;
  --sans: var(--font-inter-tight), ui-sans-serif, system-ui, sans-serif; --hand: var(--font-caveat), cursive;
  background: #e9ebed; color: var(--body); font-family: var(--sans); min-height: 100dvh;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.rp * { box-sizing: border-box; border-color: var(--line); }
.rp h1, .rp h2 { color: var(--ink); font-family: var(--sans); margin: 0; }
.rp p { margin: 0; }
.rp-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px; padding: 12px 20px; background: #fff; border-bottom: 1px solid #e3e5e7; }
.rp-back { font-size: 14px; font-weight: 500; color: #5b6168; text-decoration: none; }
.rp-status { margin-left: auto; font-size: 13px; color: #5b6168; }
.rp-btn { height: 40px; padding: 0 18px; border-radius: 999px; font: 600 14px var(--sans); cursor: pointer; }
.rp .rp-btn-out { background: #fff; border: 1px solid #c9cdd1; color: #16191c; }
.rp-btn-gold { background: var(--gold); border: 0; color: #1b1e21; }
.rp-btn:focus-visible, .rp-input:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.rp-missing { padding: 80px 20px; text-align: center; font-size: 15px; color: #5b6168; }
.rp-desk { display: grid; justify-content: center; padding: 28px 16px 64px; }

.rp-sheet { width: 210mm; height: 297mm; overflow: hidden; padding: 12mm 13mm 9mm; display: flex; flex-direction: column; box-shadow: 0 2px 24px rgba(0,0,0,.18);
  background-color: var(--gun);
  background-image: linear-gradient(rgba(251,193,89,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(251,193,89,.045) 1px, transparent 1px);
  background-size: 7mm 7mm; }
.rp-sheet > * { flex-shrink: 0; }
@media screen and (max-width: 860px) { .rp-sheet { width: 100%; height: auto; padding: 16px; } }

/* Header */
.rp-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding-bottom: 5mm; border-bottom: 1px solid var(--line); }
.rp-kicker { margin-top: 5mm; font-size: 9.5px; font-weight: 800; letter-spacing: .24em; text-transform: uppercase; color: var(--gold); }
.rp .rp-name { color: var(--ink); font-size: 32px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.02; margin-top: 1.5mm; }
.rp-date { margin-top: 1.5mm; font-size: 11px; color: var(--muted); }
.rp-count { text-align: right; display: grid; justify-items: end; }
.rp-count-n { font-size: 46px; font-weight: 800; letter-spacing: -0.04em; line-height: .9; color: var(--gold); font-variant-numeric: tabular-nums; }
.rp-count-l { margin-top: 1.5mm; font-size: 10px; color: var(--muted); max-width: 34mm; line-height: 1.3; }

/* Tiles: the student's own answers */
.rp-tiles { margin-top: 5mm; display: grid; grid-template-columns: repeat(5, 1fr); gap: 2.5mm; }
.rp-tile { background: rgba(255,255,255,.05); border: 1px solid var(--line); border-radius: 8px; padding: 2.4mm 3mm; display: grid; gap: .8mm; }
.rp-tile-l { font-size: 8.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); }
.rp-tile-v { font-size: 11.5px; font-weight: 700; color: var(--ink); line-height: 1.25; }

.rp-block { margin-top: 6mm; }
.rp .rp-label { font-size: 9.5px; font-weight: 800; letter-spacing: .24em; text-transform: uppercase; color: var(--gold); margin-bottom: 3mm; }

/* Roadmap */
.rp-sheet { --lab: 13mm; --dot: 10mm; --fs: 11px; --gap: 6mm; }
.rp-n1 { --lab: 12mm; --dot: 10.5mm; --fs: 11.5px; }
.rp-n2 { --lab: 11.5mm; --dot: 8.5mm; --fs: 10px; --gap: 5mm; }
.rp-n3 { --lab: 9mm; --dot: 7mm; --fs: 9px; --gap: 3.5mm; }
.rp-n4 { --lab: 7.5mm; --dot: 6mm; --fs: 8.4px; --gap: 2.5mm; }
.rp-long { --fs: 8.2px; --dot: 6mm; --lab: 10mm; }
.rp-long.rp-n3 { --lab: 9mm; }
/* AS and A2 together: badges only, one line, so three long roads still fit. */
.rp-long .rp-meter { display: none; }
.rp-long .rp-parts { flex-wrap: nowrap; gap: 3mm; }
.rp-long .rp-road { gap: 1.2mm; }
.rp-n3 .rp-ticks i { -webkit-line-clamp: 1; }
.rp-n3 .rp-ticks { gap: 2mm; }
.rp-roadmap { flex: 1 0 auto; display: flex; flex-direction: column; }
.rp-roadmap .rp-roads { flex: 1; display: grid; gap: var(--gap); align-content: space-evenly; }
.rp-road { display: grid; gap: 2mm; }
.rp-road-head { display: flex; align-items: center; justify-content: space-between; gap: 3mm; flex-wrap: wrap; }
.rp-road-title { font-size: 14px; font-weight: 800; color: var(--ink); line-height: 1.2; }
.rp-parts { display: flex; flex-wrap: wrap; gap: 1.5mm 5mm; justify-content: flex-end; }
.rp-part { display: flex; align-items: center; gap: 2.5mm; flex-wrap: wrap; }
.rp-part-l { font-size: 9px; font-weight: 800; letter-spacing: .12em; color: var(--gold); }
.rp-chip { font-size: 9.5px; font-weight: 700; line-height: 1.3; padding: 2px 7px; border-radius: 5px; }
.rp-chip-3 { background: rgba(127,209,176,.16); color: var(--ok); }
.rp-chip-2 { background: var(--gold-soft); color: var(--warn); }
.rp-chip-1 { background: rgba(240,160,143,.16); color: var(--low); }
.rp-meter { display: inline-flex; align-items: center; gap: 1.2mm; font-size: 9px; color: var(--muted); }
.rp-pips { display: inline-flex; gap: .6mm; }
.rp-pip { width: 2.6mm; height: 1.2mm; border-radius: 1mm; background: rgba(255,255,255,.16); }
.rp-pip-on { background: var(--gold); }
.rp-path { list-style: none; margin: 0; padding: 0; display: grid; position: relative; }
.rp .rp-path::before { content: ""; position: absolute; left: 4%; right: 4%; top: 50%; border-top: 2px dashed rgba(251,193,89,.7); }
.rp-stop { position: relative; display: grid; grid-template-rows: var(--lab) var(--dot) var(--lab); justify-items: center; }
/* Labels alternate above and below the line, so each may use two stops' width. */
.rp-stop-text { font-size: var(--fs); line-height: 1.18; text-align: center; color: var(--body); width: 190%; justify-self: center; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.rp-up .rp-stop-text { grid-row: 1; align-self: end; padding-bottom: 1mm; }
.rp-down .rp-stop-text { grid-row: 3; align-self: start; padding-top: 1mm; }
.rp .rp-dot { grid-row: 2; align-self: center; z-index: 1; width: var(--dot); height: var(--dot); border-radius: 50%; background: var(--gun); border: 1.6px solid var(--gold); display: grid; place-items: center; font-size: calc(var(--fs) + 1px); font-weight: 800; color: var(--ink); }
.rp .rp-dot-a2 { background: var(--gun-3); }
.rp .rp-dot-x { background: var(--ink); border-color: var(--ink); color: var(--gun); }
.rp .rp-dot-flag { background: var(--gold); border-color: var(--gold); color: var(--gun); }
.rp-tag { display: block; margin-bottom: .3mm; font-size: 8px; font-weight: 800; letter-spacing: .12em; color: var(--gold); }
.rp-snake { position: relative; display: grid; gap: 5mm; padding-right: 7mm; }
.rp-path-back { direction: rtl; }
.rp-path-back .rp-stop { direction: ltr; }
.rp .rp-snake .rp-path::before { left: calc(50% / var(--cols)); right: 0; }
.rp .rp-bend { position: absolute; right: 0; width: 14mm; top: calc(var(--lab) + var(--dot) / 2); bottom: calc(var(--lab) + var(--dot) / 2); border: 2px dashed rgba(251,193,89,.7); border-left: 0; border-radius: 0 12mm 12mm 0; }

/* Bottom half */
.rp-split { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-top: 5mm; padding-top: 5mm; border-top: 1px solid var(--line); }
.rp-ticks { list-style: none; margin: 0; padding: 0; display: grid; gap: 2.6mm; }
.rp-ticks li { display: grid; grid-template-columns: 5mm 1fr; gap: 2.5mm; align-items: start; }
.rp-ticks b { display: block; font-size: 12px; color: var(--ink); line-height: 1.25; }
.rp-ticks em { display: block; font-style: normal; font-size: 9.5px; color: var(--faint); margin-top: .3mm; }
.rp-ticks i { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-style: normal; font-size: 10px; line-height: 1.4; color: var(--body); margin-top: .8mm; }
.rp .rp-box { display: inline-block; width: 3.8mm; height: 3.8mm; border: 1.3px solid var(--gold); border-radius: 1mm; margin-top: .4mm; }
.rp-tracker { width: 100%; border-collapse: collapse; }
.rp-tracker th { font-size: 8.5px; font-weight: 800; letter-spacing: .1em; color: var(--faint); text-align: center; padding: 0 0 1.8mm; }
.rp-tracker td { padding: 2.5mm 0; border-top: 1px solid var(--line); text-align: center; vertical-align: middle; }
.rp-tracker td:first-child { text-align: left; font-size: 11px; color: var(--ink); font-weight: 600; line-height: 1.3; padding-right: 3mm; width: 60%; }
.rp-pledge { margin-top: 3.5mm; font-size: 11.5px; color: var(--ink); display: flex; align-items: flex-end; gap: 2mm; }
.rp .rp-fill { display: inline-block; width: 13mm; border-bottom: 1.2px solid var(--gold); height: 4mm; }
.rp .rp-fill-wide { width: 50mm; }

/* Note and footer */
.rp-note { margin-top: auto; padding-top: 5mm; }
.rp .rp-input { width: 100%; resize: vertical; border: 1px dashed rgba(255,255,255,.3); border-radius: 8px; background: rgba(255,255,255,.05); padding: 8px 10px; font: 400 13px/1.5 var(--sans); color: var(--ink); }
.rp .rp-input::placeholder { color: var(--faint); }
.rp-note-text { font-size: 12.5px; line-height: 1.5; color: var(--ink); }
.rp-sign { margin-top: .5mm; font-family: var(--hand); font-size: 24px; color: var(--gold); line-height: 1; }
.rp .rp-foot { margin-top: 4mm; padding-top: 3mm; border-top: 1px solid var(--line); display: flex; justify-content: space-between; font-size: 9.5px; color: var(--faint); }

.rp-print-only { display: none; }
@page { size: A4; margin: 0; }
@media print {
  html, body { background: var(--gun, #2a3439) !important; }
  .rp { background: #2a3439; }
  .rp-bar, .rp-screen-only, .rp-print-hide { display: none !important; }
  .rp-print-only { display: block; }
  .rp-desk { display: block; padding: 0; }
  .rp-sheet { box-shadow: none; }
}
`;
