/**
 * The student's Starting Point Report: what each result means, the
 * questions to go over (with answers and explanations), and a first four
 * weeks, all in the student's language. Hamza adds a note and feedback on
 * the written answers, then saves it as a PDF to send.
 * Never says how the check scores answers (no "certain but wrong" talk).
 */
import { BANK, CORE, PROFILE, type Mcq } from "@/lib/diagnostic/bank";
import { EXPLAIN } from "@/lib/diagnostic/explain";
import { RATING_LABEL, type Answer, type ResultPayload, type SectionSummary, type Track } from "@/lib/diagnostic/logic";

export const MEANING: Record<"lesson" | "as", Record<1 | 2 | 3, string>> = {
  lesson: {
    3: "You can follow lesson one as it is.",
    2: "You will follow lesson one. A few basics need work in the first weeks.",
    1: "Some basics that lesson one relies on need building first. The questions below are where to start.",
  },
  as: {
    3: "You hold the AS content that A2 builds on.",
    2: "Most of AS is there. A few topics need revisiting before they come up in A2.",
    1: "Several AS topics need rebuilding before A2 content will make sense. We will do this together.",
  },
};

export const meaning = (sum: SectionSummary, t?: Track) => (t ? MEANING[t.level === "a2" ? "as" : "lesson"][sum.ready] : RATING_LABEL[sum.ready]);

export interface ReportItem {
  sec: string;
  q: Mcq;
  a: Answer;
  /** Wrong while "Certain": shown first, without saying why. */
  firm: boolean;
  explain?: string;
}

function questions(p: ResultPayload, sec: string): Mcq[] {
  if (sec === "core") return CORE[p.coreLevel!];
  const t = p.tracks.find((x) => `${x.level}-${x.sub}` === sec)!;
  return BANK[t.level][t.sub].q;
}

/** Missed main questions per section (not previews), firmest mix-ups first. */
export function missed(p: ResultPayload, sec: string): ReportItem[] {
  return questions(p, sec)
    .map((q, i) => {
      const a = p.answers[`${sec}:${i}`] ?? { c: null };
      return { sec, q, a, firm: a.c !== q.a && a.c != null && a.c !== -1 && a.s === "c", explain: EXPLAIN[q.q] };
    })
    .filter((x) => x.q.area !== "P" && x.a.c !== x.q.a)
    .sort((x, y) => Number(y.firm) - Number(x.firm));
}

/** Questions answered right on a lucky guess: worth a second look too. */
export function shaky(p: ResultPayload, sec: string): ReportItem[] {
  return questions(p, sec)
    .map((q, i) => ({ sec, q, a: p.answers[`${sec}:${i}`] ?? { c: null }, firm: false, explain: EXPLAIN[q.q] }))
    .filter((x) => x.q.area !== "P" && x.a.c === x.q.a && x.a.s === "g");
}

/** A first four weeks, in the student's words. */
export function firstWeeks(p: ResultPayload): string[] {
  const r = p.summary;
  if (!r) return [];
  const out: string[] = [];
  const weakCore = r.core.areas.filter((a) => a.r === 1).map((a) => (a.area === "N" ? "calculations (percentages, ratios, changes)" : "reading questions carefully and picking out evidence"));
  for (const sum of r.tracks) {
    const t = p.tracks.find((x) => `${x.level}-${x.sub}` === sum.sec)!;
    const where = t.level === "a2" ? "the AS topics in your list" : "the questions in your list";
    if (sum.ready === 1) out.push(`${sum.title}: before your next lesson, go through ${where} and explain each answer out loud in your own words.`);
    else if (sum.ready === 2) out.push(`${sum.title}: in the first two weeks, go back over ${where} alongside your lessons.`);
    else out.push(`${sum.title}: you are ready. Keep up with every lesson and ask for the stretch questions.`);
  }
  if (weakCore.length) out.push(`Every day: 10 minutes of ${weakCore.join(" and ")}. Small and daily works better than long and rare.`);
  const habit = r.learner[0];
  if (habit) out.push(`Study habit for these four weeks: ${habit.student}`);
  if (p.kind !== "end") out.push("End of week four: Hamza checks in with you on how it is going.");
  return out;
}

export const learnerAnswers = (p: ResultPayload) => PROFILE.filter((q) => p.profile[q.id]).map((q) => ({ q: q.q, a: p.profile[q.id].answer }));

/** Hamza's additions, saved per result. */
export interface ReportNotes {
  note: string;
  /** Feedback on the written answer, by track id. */
  written: Record<string, { grade?: "strong" | "partly" | "needs"; comment?: string }>;
  sentAt?: string;
}
export const emptyNotes = (): ReportNotes => ({ note: "", written: {} });
export const GRADE: Record<"strong" | "partly" | "needs", string> = { strong: "Strong answer", partly: "Partly there", needs: "Needs work" };
