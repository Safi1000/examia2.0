/**
 * Starting Point Check: saved progress and the rating rule (kept exactly as
 * designed). For each area: 80%+ correct with no correct answer marked
 * Guessed = Ready (3); 50%+ = Needs a boost (2); below = Build up first (1).
 * Preview: 2+ correct and not guessed = already knows some.
 */
import { AREA, BANK, type Area, type LevelKey, type SubjectKey } from "@/lib/diagnostic/bank";

export type Step = "welcome" | "about" | "question" | "between" | "done";
export type Sure = "g" | "f" | "c";
export interface Answer {
  /** Chosen option, or -1 for "I don't know". */
  c: number | null;
  s?: Sure | null;
}
export interface About {
  name?: string;
  phone?: string;
  parent?: string;
  school?: string;
  board?: string | null;
  last?: string;
  target?: string | null;
  worry?: string;
  study: string[];
  before?: string;
}
export interface State {
  step: Step;
  about: About;
  level: LevelKey | null;
  subjects: SubjectKey[];
  /** Subject index and question index (10 = the written question). */
  si: number;
  qi: number;
  ans: Record<string, Answer>;
  written: Partial<Record<SubjectKey, string>>;
  finishedAt: string | null;
}

export const STORE_KEY = "bp-diagnostic-v1";
export const QUESTIONS_PER_SUBJECT = 11;
export const fresh = (): State => ({ step: "welcome", about: { study: [] }, level: null, subjects: [], si: 0, qi: 0, ans: {}, written: {}, finishedAt: null });

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

type Mark = { ok: boolean; s?: Sure | null; skill: string };
function rate(list: Mark[]): 1 | 2 | 3 | null {
  if (!list.length) return null;
  const right = list.filter((x) => x.ok).length;
  const guessed = list.filter((x) => x.ok && x.s === "g").length;
  const pct = right / list.length;
  return pct >= 0.8 && !guessed ? 3 : pct >= 0.5 ? 2 : 1;
}
export const RATING_LABEL: Record<1 | 2 | 3, string> = { 3: "Ready", 2: "Needs a boost", 1: "Build up first" };

export interface SubjectSummary {
  sub: SubjectKey;
  areas: Array<{ name: string; r: 1 | 2 | 3 | null }>;
  prev: boolean;
}

export function results(s: State): SubjectSummary[] {
  if (!s.level) return [];
  return s.subjects.map((sub) => {
    const set = BANK[s.level!][sub];
    const by: Partial<Record<Area, Mark[]>> = {};
    set.q.forEach((row, i) => {
      const a = s.ans[`${sub}:${i}`] ?? { c: null };
      (by[row[4]] ??= []).push({ ok: a.c === row[2], s: a.s, skill: row[3] });
    });
    const areas = (Object.keys(by) as Area[])
      .filter((x): x is Exclude<Area, "P"> => x !== "P")
      .map((x) => ({ name: AREA[x], r: rate(by[x]!) }));
    const prev = (by.P ?? []).filter((x) => x.ok && x.s !== "g").length >= 2;
    return { sub, areas, prev };
  });
}

/** What gets sent when a student finishes (see submitResult). */
export function payload(s: State) {
  return { about: s.about, level: s.level, subjects: s.subjects, answers: s.ans, written: s.written, summary: results(s), finishedAt: s.finishedAt };
}
export type ResultPayload = ReturnType<typeof payload>;
