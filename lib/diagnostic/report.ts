/**
 * Hamza's Starting Point Report, as plain text, built from a finished
 * result. It is the draft Hamza reads before writing to the student:
 * ratings, firm misconceptions, shaky knowledge, how the student learns,
 * and a suggested first four weeks.
 */
import { LEVELS } from "@/lib/diagnostic/bank";
import { RATING_LABEL, type ResultPayload, type SectionSummary } from "@/lib/diagnostic/logic";

const line = (sum: SectionSummary) =>
  sum.areas.map((a) => `${a.name}: ${a.r ? RATING_LABEL[a.r] : "n/a"}`).join(". ");

export function reportText(p: ResultPayload): string {
  const r = p.summary;
  if (!r || !p.level) return "";
  const all = [r.core, ...r.subjects];
  const out: string[] = [];
  out.push(`STARTING POINT REPORT: ${p.name || "Unnamed"} (${LEVELS[p.level]}: ${p.subjects.join(", ")})`);
  if (p.startedAt && p.finishedAt) {
    const mins = Math.round((Date.parse(p.finishedAt) - Date.parse(p.startedAt)) / 60000);
    out.push(`Time taken: about ${mins} minute${mins === 1 ? "" : "s"}.`);
  }

  out.push("", "RATINGS");
  for (const sum of all) {
    const name = sum.sec === "core" ? "Core skills" : sum.sec;
    const c = sum.cal;
    out.push(`${name}: ${line(sum)}. ${c.right}/${c.total} right; ${c.certainWrong} certain but wrong; ${c.guessedRight} right by guessing; ${c.idk} "I don't know".`);
    if (sum.sec !== "core") out.push(`  Preview: ${sum.prev ? "already knows some, give stretch work" : "new, teach from scratch"}.`);
  }

  const firm = all.flatMap((x) => x.gaps.filter((g) => g.sure === "c"));
  out.push("", "FIX FIRST (wrong while certain: firm misconceptions)");
  out.push(...(firm.length ? firm.map((g) => `- ${g.sec === "core" ? "Core" : g.sec}, ${g.skill}${g.why ? `: ${g.why}` : ""}`) : ["- None."]));

  const other = all.flatMap((x) => x.gaps.filter((g) => g.sure !== "c"));
  out.push("", "OTHER GAPS");
  out.push(...(other.length ? other.map((g) => `- ${g.sec === "core" ? "Core" : g.sec}, ${g.skill}${g.idk ? " (didn't know)" : g.why ? `: ${g.why}` : ""}${g.sure === "g" ? " (guessed)" : ""}`) : ["- None."]));

  out.push("", "HOW THEY LEARN");
  for (const [, v] of Object.entries(p.profile)) out.push(`- ${v.question} ${v.answer}`);
  if (r.learner.length) {
    out.push("", "WHAT TO DO ABOUT IT");
    out.push(...r.learner.map((n) => `- ${n.teacher}`));
  }

  // A first four weeks: core first if weak, then the weakest subject areas.
  out.push("", "SUGGESTED FIRST FOUR WEEKS");
  const weakCore = r.core.areas.filter((a) => a.r === 1).map((a) => a.name.toLowerCase());
  const plan: string[] = [];
  if (weakCore.length) plan.push(`Short daily ${weakCore.join(" and ")} practice alongside lessons (10 minutes).`);
  if (firm.length) plan.push(`Week 1: correct the firm misconceptions above; they will not fix themselves.`);
  for (const sum of r.subjects) {
    const low = sum.areas.filter((a) => a.r === 1).map((a) => a.name.toLowerCase());
    plan.push(low.length ? `${sum.sec}: rebuild ${low.join(" and ")} before new content.` : `${sum.sec}: start the course as planned${sum.prev ? ", with stretch work" : ""}.`);
  }
  const top = r.learner[0];
  if (top) plan.push(`Study habit to set from week 1: ${top.teacher}`);
  out.push(...plan.map((x) => `- ${x}`));

  out.push("", "WRITTEN ANSWERS (mark these)");
  for (const sub of p.subjects) out.push(`${sub}: ${(p.written[sub] ?? "").trim() || "(left blank)"}`);
  return out.join("\n");
}
