/**
 * Hamza's Starting Point Report, as plain text, built from a finished
 * result: readiness, ratings, firm misconceptions, shaky knowledge, how the
 * student learns, and a suggested first four weeks. Also the start vs end
 * comparison used on the admin page.
 */
import { RATING_LABEL, type ResultPayload, type SectionSummary } from "@/lib/diagnostic/logic";

const line = (sum: SectionSummary) => sum.areas.map((a) => `${a.name}: ${a.r ? RATING_LABEL[a.r] : "n/a"}`).join(". ");

export function reportText(p: ResultPayload): string {
  const r = p.summary;
  if (!r) return "";
  const all = [r.core, ...r.tracks];
  const out: string[] = [];
  out.push(`${p.kind === "end" ? "END OF SESSION REPORT" : "STARTING POINT REPORT"}: ${p.name || "Unnamed"} (${r.tracks.map((t) => t.title).join("; ")})`);
  if (p.startedAt && p.finishedAt) {
    const mins = Math.round((Date.parse(p.finishedAt) - Date.parse(p.startedAt)) / 60000);
    out.push(`Time taken: about ${mins} minute${mins === 1 ? "" : "s"}.`);
  }

  out.push("", "READINESS");
  for (const sum of r.tracks) out.push(`• ${sum.title}: ${sum.readyLabel}.`);

  out.push("", "RATINGS");
  for (const sum of all) {
    const c = sum.cal;
    out.push(`${sum.title}: ${line(sum)}. ${c.right}/${c.total} right; ${c.certainWrong} certain but wrong; ${c.guessedRight} right by guessing; ${c.idk} "I don't know".`);
    if (sum.sec !== "core") out.push(`  Preview: ${sum.prev ? "already knows some, give stretch work" : "new, teach from scratch"}.`);
  }

  const firm = all.flatMap((x) => x.gaps.filter((g) => g.sure === "c").map((g) => ({ ...g, title: x.title })));
  out.push("", "FIX FIRST (wrong while certain: firm misconceptions)");
  out.push(...(firm.length ? firm.map((g) => `• ${g.title}, ${g.skill}${g.why ? `: ${g.why}` : ""}`) : ["• None."]));

  const other = all.flatMap((x) => x.gaps.filter((g) => g.sure !== "c").map((g) => ({ ...g, title: x.title })));
  out.push("", "OTHER GAPS");
  out.push(...(other.length ? other.map((g) => `• ${g.title}, ${g.skill}${g.idk ? " (didn't know)" : g.why ? `: ${g.why}` : ""}${g.sure === "g" ? " (guessed)" : ""}`) : ["• None."]));

  out.push("", "HOW THEY LEARN");
  for (const v of Object.values(p.profile)) out.push(`• ${v.question} ${v.answer}`);
  if (r.learner.length) {
    out.push("", "WHAT TO DO ABOUT IT");
    out.push(...r.learner.map((n) => `• ${n.teacher}`));
  }

  // A first four weeks: core first if weak, then the weakest areas per track.
  out.push("", p.kind === "end" ? "WHAT TO WORK ON NEXT" : "SUGGESTED FIRST FOUR WEEKS");
  const weakCore = r.core.areas.filter((a) => a.r === 1).map((a) => a.name.toLowerCase());
  const plan: string[] = [];
  if (weakCore.length) plan.push(`Short daily ${weakCore.join(" and ")} practice alongside lessons (10 minutes).`);
  if (firm.length) plan.push("Week 1: correct the firm misconceptions above; they will not fix themselves.");
  for (const sum of r.tracks) {
    const low = sum.areas.filter((a) => a.r === 1).map((a) => a.name.toLowerCase());
    plan.push(low.length ? `${sum.title}: rebuild ${low.join(" and ")} before new content.` : `${sum.title}: start as planned${sum.prev ? ", with stretch work" : ""}.`);
  }
  const top = r.learner[0];
  if (top) plan.push(`Study habit to set from week 1: ${top.teacher}`);
  out.push(...plan.map((x) => `• ${x}`));

  out.push("", "WRITTEN ANSWERS (mark these)");
  for (const t of r.tracks) out.push(`${t.title}: ${(p.written[t.sec] ?? "").trim() || "(left blank)"}`);
  return out.join("\n");
}

export interface CompareRow {
  section: string;
  label: string;
  from: string;
  to: string;
  /** 1 better, 0 same, -1 worse. */
  move: -1 | 0 | 1;
}

/** Day one against the end of the session, area by area. */
export function compare(start: ResultPayload, end: ResultPayload): CompareRow[] {
  const a = start.summary;
  const b = end.summary;
  if (!a || !b) return [];
  const rows: CompareRow[] = [];
  const pairs: Array<[SectionSummary, SectionSummary]> = [[a.core, b.core]];
  for (const t of a.tracks) {
    const u = b.tracks.find((x) => x.sec === t.sec);
    if (u) pairs.push([t, u]);
  }
  const mv = (x: number, y: number) => (y > x ? 1 : y < x ? -1 : 0) as -1 | 0 | 1;
  for (const [x, y] of pairs) {
    rows.push({ section: x.title, label: "Overall", from: x.readyLabel, to: y.readyLabel, move: mv(x.ready, y.ready) });
    for (const ar of x.areas) {
      const br = y.areas.find((z) => z.area === ar.area);
      if (!br || !ar.r || !br.r) continue;
      rows.push({ section: x.title, label: ar.name, from: RATING_LABEL[ar.r], to: RATING_LABEL[br.r], move: mv(ar.r, br.r) });
    }
    rows.push({ section: x.title, label: "Certain but wrong", from: String(x.cal.certainWrong), to: String(y.cal.certainWrong), move: mv(y.cal.certainWrong, x.cal.certainWrong) });
  }
  // Habits that changed.
  for (const [id, v] of Object.entries(start.profile)) {
    const w = end.profile[id];
    if (w && w.code !== v.code) rows.push({ section: "How they learn", label: v.question, from: v.answer, to: w.answer, move: 0 });
  }
  return rows;
}
