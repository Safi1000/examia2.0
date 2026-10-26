/**
 * Example results for the local demo only (npm run dev:demo), so the
 * Starting points page, the comparison and the reports can be checked
 * without real students. Never used on the live site (DEMO is off there).
 */
import { PROFILE } from "@/lib/diagnostic/bank";
import { fresh, payload, screens, questionsFor, type Kind, type ResultPayload, type State, type Track } from "@/lib/diagnostic/logic";

export type DemoRow = ResultPayload & { id: string; savedAt: string };

/** A small repeatable random generator, so the examples never change. */
function rng(seed: number) {
  return () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
}

function make(name: string, tracks: Track[], kind: Kind, skill: number, seed: number, day: string): DemoRow {
  const r = rng(seed);
  const s: State = { ...fresh(kind), name, tracks, step: "done" };
  PROFILE.forEach((p) => (s.profile[p.id] = Math.floor(r() * p.o.length)));
  for (const sc of screens(s)) {
    if (sc.kind !== "mcq") continue;
    const q = questionsFor(s, sc.sec)[sc.i];
    const knows = r() < (q.area === "P" ? skill * 0.4 : skill);
    const c = knows ? q.a : r() < 0.25 ? -1 : (q.a + 1 + Math.floor(r() * (q.o.length - 1))) % q.o.length;
    s.ans[`${sc.sec}:${sc.i}`] = c === -1 ? { c } : { c, s: (["g", "f", "c"] as const)[Math.floor(r() * 3)] };
  }
  for (const t of tracks) s.written[`${t.level}-${t.sub}`] = "Profit is sales minus the cost of the goods and the expenses, so 5,000 - 2,500 - 1,000 - 300 = 1,200 profit.";
  s.startedAt = `${day}T10:05:00.000Z`;
  s.finishedAt = `${day}T10:${String(30 + Math.floor(r() * 25)).padStart(2, "0")}:00.000Z`;
  return { ...payload(s), id: `demo-${seed}`, savedAt: s.finishedAt };
}

export function demoResults(): DemoRow[] {
  return [
    make("Example Student A", [{ sub: "Accounting", level: "as" }, { sub: "Business", level: "as" }], "start", 0.45, 11, "2026-11-02"),
    make("Example Student B", [{ sub: "Economics", level: "igcse" }], "start", 0.8, 23, "2026-11-02"),
    make("Example Student C", [{ sub: "Accounting", level: "as" }, { sub: "Accounting", level: "a2" }, { sub: "Economics", level: "a2" }], "start", 0.55, 37, "2026-11-02"),
    make("Example Student A", [{ sub: "Accounting", level: "as" }, { sub: "Business", level: "as" }], "end", 0.85, 41, "2027-04-20"),
  ];
}
