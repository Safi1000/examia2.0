/**
 * Starting Point Check: the order of screens, saved progress, and scoring.
 *
 * Rating rule (kept as designed). For each area: 80%+ correct with no
 * correct answer marked Guessed = Ready (3); 50%+ = Needs a boost (2);
 * below = Build up first (1). Preview: 2+ correct and not guessed =
 * already knows some.
 *
 * On top of the rating, every answer also tells us:
 *  - calibration: "Certain" but wrong (a firm misconception, the most
 *    important thing to fix) and right but "Guessed" (shaky knowledge);
 *  - the misconception behind each wrong option (`why` in the bank);
 *  - how the student learns (Part 1), turned into tips by TIPS.
 */
import { AREA, BANK, CORE, PROFILE, TIPS, type Area, type LevelKey, type Mcq, type SubjectKey } from "@/lib/diagnostic/bank";

export type Step = "welcome" | "about" | "test" | "done";
export type Sure = "g" | "f" | "c";
export interface Answer {
  /** Chosen option, or -1 for "I don't know". */
  c: number | null;
  s?: Sure | null;
}
/** A section of the test: Part 1, Part 2, or one subject. */
export type Section = "profile" | "core" | SubjectKey;
export type Screen =
  | { kind: "intro"; sec: Section }
  | { kind: "profile"; i: number }
  | { kind: "mcq"; sec: "core" | SubjectKey; i: number }
  | { kind: "written"; sec: SubjectKey };

export interface State {
  step: Step;
  name: string;
  level: LevelKey | null;
  subjects: SubjectKey[];
  /** Position in screens(). */
  pos: number;
  /** Part 1 answers: question id → option index. */
  profile: Record<string, number>;
  /** Part 2 and 3 answers, keyed "core:3" or "Accounting:3". */
  ans: Record<string, Answer>;
  written: Partial<Record<SubjectKey, string>>;
  startedAt: string | null;
  finishedAt: string | null;
}

export const STORE_KEY = "bp-diagnostic-v2";
export const fresh = (): State => ({ step: "welcome", name: "", level: null, subjects: [], pos: 0, profile: {}, ans: {}, written: {}, startedAt: null, finishedAt: null });

export function load(): State | null {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return v ? (JSON.parse(v) as State) : null;
  } catch {
    return null;
  }
}
export function save(s: State) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {}
}

export const PART_TITLE: Record<"profile" | "core", string> = { profile: "How you learn", core: "Core skills" };

/** Every screen of the test, in order. */
export function screens(level: LevelKey, subjects: SubjectKey[]): Screen[] {
  const out: Screen[] = [{ kind: "intro", sec: "profile" }];
  PROFILE.forEach((_, i) => out.push({ kind: "profile", i }));
  out.push({ kind: "intro", sec: "core" });
  CORE[level].forEach((_, i) => out.push({ kind: "mcq", sec: "core", i }));
  for (const sub of subjects) {
    out.push({ kind: "intro", sec: sub });
    BANK[level][sub].q.forEach((_, i) => out.push({ kind: "mcq", sec: sub, i }));
    out.push({ kind: "written", sec: sub });
  }
  return out;
}

export const sectionOf = (sc: Screen): Section => (sc.kind === "profile" ? "profile" : sc.sec);
export const mcqFor = (level: LevelKey, sec: "core" | SubjectKey, i: number): Mcq => (sec === "core" ? CORE[level][i] : BANK[level][sec].q[i]);

/** Rough minutes, so the student knows what they are starting. */
export function minutes(level: LevelKey | null, subjects: SubjectKey[]): number {
  if (!level || !subjects.length) return 0;
  const perSubject = level === "a2" ? 13 : 11;
  return 3 + 6 + perSubject * subjects.length;
}

type Mark = { ok: boolean; s?: Sure | null };
function rate(list: Mark[]): 1 | 2 | 3 | null {
  if (!list.length) return null;
  const right = list.filter((x) => x.ok).length;
  const guessed = list.filter((x) => x.ok && x.s === "g").length;
  const pct = right / list.length;
  return pct >= 0.8 && !guessed ? 3 : pct >= 0.5 ? 2 : 1;
}
export const RATING_LABEL: Record<1 | 2 | 3, string> = { 3: "Ready", 2: "Needs a boost", 1: "Build up first" };

export interface Calibration {
  /** Wrong while "Certain": a firm misconception. */
  certainWrong: number;
  /** Right while "Guessed": shaky knowledge. */
  guessedRight: number;
  idk: number;
  right: number;
  total: number;
}
export interface Gap {
  sec: "core" | SubjectKey;
  skill: string;
  /** What the wrong answer usually means, if known. */
  why?: string;
  sure?: Sure | null;
  idk?: boolean;
}
export interface SectionSummary {
  sec: "core" | SubjectKey;
  areas: Array<{ area: Exclude<Area, "P">; name: string; r: 1 | 2 | 3 | null }>;
  /** Only for subjects: knows some of the preview already. */
  prev: boolean;
  cal: Calibration;
  gaps: Gap[];
}

function summarise(level: LevelKey, sec: "core" | SubjectKey, s: State): SectionSummary {
  const list = sec === "core" ? CORE[level] : BANK[level][sec].q;
  const by: Partial<Record<Area, Mark[]>> = {};
  const cal: Calibration = { certainWrong: 0, guessedRight: 0, idk: 0, right: 0, total: 0 };
  const gaps: Gap[] = [];
  list.forEach((q, i) => {
    const a = s.ans[`${sec}:${i}`] ?? { c: null };
    const ok = a.c === q.a;
    (by[q.area] ??= []).push({ ok, s: a.s });
    if (q.area === "P") return; // the preview is not a gap: it has not been taught yet
    cal.total++;
    if (ok) {
      cal.right++;
      if (a.s === "g") cal.guessedRight++;
    } else if (a.c === -1 || a.c == null) {
      cal.idk++;
      gaps.push({ sec, skill: q.skill, idk: true });
    } else {
      if (a.s === "c") cal.certainWrong++;
      gaps.push({ sec, skill: q.skill, why: q.why?.[a.c], sure: a.s });
    }
  });
  const areas = (["N", "L", "B", "R"] as const).filter((x) => by[x]?.length).map((x) => ({ area: x, name: AREA[x], r: rate(by[x]!) }));
  const prev = (by.P ?? []).filter((x) => x.ok && x.s !== "g").length >= 2;
  // Firm misconceptions first: they are the hardest to shift.
  gaps.sort((x, y) => Number(y.sure === "c") - Number(x.sure === "c"));
  return { sec, areas, prev, cal, gaps };
}

export interface LearnerNote {
  id: string;
  answer: string;
  code: string;
  rank: number;
  student: string;
  teacher: string;
}

/** Part 1 answers that need action, most important first. */
export function learnerNotes(s: State): LearnerNote[] {
  const out: LearnerNote[] = [];
  for (const p of PROFILE) {
    const i = s.profile[p.id];
    if (i == null) continue;
    const o = p.o[i];
    const tip = TIPS[o.code];
    if (tip) out.push({ id: p.id, answer: o.t, code: o.code, ...tip });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

export function results(s: State) {
  if (!s.level) return null;
  return {
    core: summarise(s.level, "core", s),
    subjects: s.subjects.map((sub) => summarise(s.level!, sub, s)),
    learner: learnerNotes(s),
  };
}
export type Results = NonNullable<ReturnType<typeof results>>;

/** What gets sent when a student finishes (see submitResult). */
export function payload(s: State) {
  const profile = Object.fromEntries(
    PROFILE.filter((p) => s.profile[p.id] != null).map((p) => {
      const o = p.o[s.profile[p.id]];
      return [p.id, { question: p.q, answer: o.t, code: o.code }];
    }),
  );
  return {
    name: s.name,
    level: s.level,
    subjects: s.subjects,
    profile,
    answers: s.ans,
    written: s.written,
    summary: results(s),
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
  };
}
export type ResultPayload = ReturnType<typeof payload>;
