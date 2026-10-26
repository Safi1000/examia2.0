/**
 * The student's Starting Point Report: what each result means, the
 * questions to go over (with answers and explanations), and a first four
 * weeks, all in the student's language. Hamza adds a note and feedback on
 * the written answers, then saves it as a PDF to send.
 * Never says how the check scores answers (no "certain but wrong" talk).
 */
import { BANK, CORE, PROFILE, type Mcq } from "@/lib/diagnostic/bank";
import { EXPLAIN } from "@/lib/diagnostic/explain";
import { DEFAULT_HABITS, HABIT } from "@/lib/diagnostic/roadmap";
import { RATING_LABEL, type Answer, type ResultPayload, type SectionSummary, type Track } from "@/lib/diagnostic/logic";

export const MEANING: Record<"lesson" | "as", Record<1 | 2 | 3, string>> = {
  lesson: {
    3: "You can follow lesson one as it stands.",
    2: "You will follow lesson one. Revise the topics on your route during the first two weeks.",
    1: "Lesson one relies on a few basics you do not have yet. Start with Step 1 before our first lesson.",
  },
  as: {
    3: "Your AS knowledge is solid enough to start A2.",
    2: "Most of your AS is there. Revisit the topics on your route before they come up in A2.",
    1: "Several AS topics need rebuilding first. I go through them with you in the first weeks.",
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

/** One stop on the student's route: a step with things to tick off. */
export interface RouteStep {
  key: "start" | "next" | "habit" | "check";
  label: string;
  title: string;
  intro: string;
  /** Questions to understand (Step 1). */
  clues?: ReportItem[];
  /** Plain tick boxes. */
  ticks?: string[];
}

const ready = (p: ResultPayload) => p.summary!;

/**
 * The route, built from the answers: Step 1 is the handful of questions
 * that matter most before lesson one (firm mix ups in the weakest areas
 * first), Step 2 the rest of the gaps by subject, Step 3 the study habit,
 * then the week four checkpoint.
 */
export function route(p: ResultPayload): { steps: RouteStep[]; rest: ReportItem[] } {
  const r = ready(p);
  const end = p.kind === "end";
  // Where Step 1 draws from: weak core first, then subjects from weakest up.
  const sources = [
    ...(r.core.ready === 1 ? [r.core] : []),
    ...[...r.tracks].sort((x, y) => x.ready - y.ready).filter((t) => t.ready < 3),
  ];
  const pools = sources.map((s) => missed(p, s.sec));
  const first: ReportItem[] = [];
  // Take turns across the weak areas so each gets its most important question.
  for (let round = 0; first.length < 4 && pools.some((x) => x.length > round); round++) {
    for (const pool of pools) if (pool[round] && first.length < 4) first.push(pool[round]);
  }
  const inFirst = new Set(first.map((x) => x.q.q));
  const all = [r.core, ...r.tracks].flatMap((s) => missed(p, s.sec));
  const rest = all.filter((x) => !inFirst.has(x.q.q));

  const steps: RouteStep[] = [];
  steps.push(
    first.length
      ? {
          key: "start",
          label: "Step 1",
          title: "Start here",
          intro: end ? "These are the questions to settle first." : "Before our first lesson, make sure you can explain each of these without looking.",
          clues: first,
        }
      : {
          key: "start",
          label: "Step 1",
          title: "Start here",
          intro: "There is nothing you need to fix before lesson one. Read ahead on the first topic in each subject.",
          ticks: r.tracks.map((t) => `${t.title}: read the first topic in your notes before lesson one`),
        },
  );

  const next: string[] = [];
  for (const t of r.tracks) {
    const skills = [...new Set([...missed(p, t.sec), ...shaky(p, t.sec)].filter((x) => !inFirst.has(x.q.q)).map((x) => x.q.skill.toLowerCase()))];
    if (skills.length) next.push(`${t.title}: ${skills.slice(0, 5).join(", ")}`);
  }
  const weakCore = r.core.areas.filter((a) => a.r && a.r < 3);
  if (weakCore.some((a) => a.area === "N")) next.push("Ten minutes a day on calculations: percentages, ratios and changes");
  if (weakCore.some((a) => a.area === "L")) next.push("Read every case or passage question twice, underlining what it asks");
  steps.push({
    key: "next",
    label: "Step 2",
    title: end ? "Next" : "The next two weeks",
    intro: next.length ? "Revise these alongside your lessons. Tick each one when you can do it without notes." : "Keep up with every lesson. Ask me for the stretch questions.",
    ticks: next,
  });

  const habits = r.learner.slice(0, 2).map((n) => n.student);
  steps.push({
    key: "habit",
    label: "Step 3",
    title: "Your study habit",
    intro: "From what you told me about how you study. Do these every week.",
    ticks: habits.length ? habits : ["Keep doing what you do now: your answers showed good study habits."],
  });

  steps.push({
    key: "check",
    label: "Checkpoint",
    title: end ? "Before the exam" : "End of week four",
    intro: end ? "Use your past papers to keep these areas sharp until the exam." : "Bring your ticks to class. I check your route with you and set the next one.",
  });
  return { steps, rest };
}

/** What the student already does well: areas rated Ready. */
export function strengths(p: ResultPayload): string[] {
  const r = ready(p);
  return [r.core, ...r.tracks].flatMap((s) => s.areas.filter((a) => a.r === 3).map((a) => `${s.title}: ${a.name.toLowerCase()}`));
}

export const learnerAnswers = (p: ResultPayload) => PROFILE.filter((q) => p.profile[q.id]).map((q) => ({ q: q.q, a: p.profile[q.id].answer }));

/** Hamza's additions, saved per result. */
export interface ReportNotes {
  note: string;
  /** Feedback on the written answer, by track id. */
  written: Record<string, { grade?: "strong" | "partly" | "needs"; comment?: string }>;
  sentAt?: string;
  /** The roster student this result belongs to, once linked. */
  studentId?: string;
}
export const emptyNotes = (): ReportNotes => ({ note: "", written: {} });
export const GRADE: Record<"strong" | "partly" | "needs", string> = { strong: "Strong answer", partly: "Partly there", needs: "Needs work" };

/** Up to four things to have clear before lesson one: the Step 1 questions, as skills. */
export function startPoints(p: ResultPayload): Array<{ skill: string; where: string; idea: string }> {
  const clues = route(p).steps[0].clues ?? [];
  const r = p.summary!;
  const title = (sec: string) => (sec === "core" ? "Core skills" : (r.tracks.find((t) => t.sec === sec)?.title ?? ""));
  // The key idea: the first sentence of the question's explanation.
  const idea = (x: ReportItem) => (x.explain ?? "").split(/(?<=\.)\s/)[0];
  return clues.map((x) => ({ skill: x.q.skill, where: title(x.sec), idea: idea(x) }));
}

/** Three habits for the tracker: the student's own weak spots first, then defaults. */
export function habits(p: ResultPayload): string[] {
  const own = (p.summary?.learner ?? []).map((n) => HABIT[n.code]).filter(Boolean);
  return [...new Set([...own, ...DEFAULT_HABITS])].slice(0, 3);
}
