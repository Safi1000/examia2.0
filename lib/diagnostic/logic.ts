/**
 * Starting Point Check: the order of screens, saved progress, and scoring.
 *
 * A student picks a level for each subject ("tracks"): O Level/IGCSE, AS,
 * A2, or AS and A2 together. Core skills are asked once, at the highest
 * level picked. Each track gets its own subject section.
 *
 * Rating rule (kept as designed). For each area: 80%+ correct with no
 * correct answer marked Guessed = Ready (3); 50%+ = Needs a boost (2);
 * below = Build up first (1). Preview: 2+ correct and not guessed =
 * already knows some.
 *
 * Every answer also tells us:
 *  - calibration: "Certain" but wrong (a firm misconception, the most
 *    important thing to fix) and right but "Guessed" (shaky knowledge);
 *  - the misconception behind each wrong option (`why` in the bank);
 *  - readiness: can the student follow lesson one (O Level, AS), or how
 *    much of AS they hold (A2);
 *  - how the student learns (Part 1), turned into tips by TIPS.
 *
 * `kind` is "start" (day one) or "end" (the same check at the end of the
 * session), so Hamza can compare the two.
 */
import { AREA, BANK, CORE, PROFILE, TIPS, type Area, type LevelKey, type Mcq, type SubjectKey } from "@/lib/diagnostic/bank";

export type Step = "welcome" | "about" | "test" | "done";
export type Sure = "g" | "f" | "c";
export type Kind = "start" | "end";
export interface Answer {
  /** Chosen option, or -1 for "I don't know". */
  c: number | null;
  s?: Sure | null;
}
export interface Track {
  sub: SubjectKey;
  level: LevelKey;
}
/** "as-Accounting": one subject at one level. */
export const trackId = (t: Track) => `${t.level}-${t.sub}`;
export const LEVEL_ORDER: LevelKey[] = ["igcse", "as", "a2"];

/** A section of the test: Part 1, Part 2, or one track. */
export type Section = "profile" | "core" | string;
export type Screen =
  | { kind: "intro"; sec: Section }
  | { kind: "profile"; i: number }
  | { kind: "mcq"; sec: "core" | string; i: number }
  | { kind: "written"; sec: string };

export interface State {
  step: Step;
  kind: Kind;
  name: string;
  tracks: Track[];
  /** Position in screens(). */
  pos: number;
  /** Part 1 answers: question id → option index. */
  profile: Record<string, number>;
  /** Part 2 and 3 answers, keyed "core:3" or "as-Accounting:3". */
  ans: Record<string, Answer>;
  /** Written answers by track id. */
  written: Record<string, string>;
  startedAt: string | null;
  finishedAt: string | null;
}

export const STORE_KEY = "bp-diagnostic-v3";
export const fresh = (kind: Kind = "start"): State => ({ step: "welcome", kind, name: "", tracks: [], pos: 0, profile: {}, ans: {}, written: {}, startedAt: null, finishedAt: null });

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

/** Subjects in the usual order, AS before A2 within a subject. */
export const sortTracks = (ts: Track[]) =>
  [...ts].sort((a, b) => ["Accounting", "Business", "Economics"].indexOf(a.sub) - ["Accounting", "Business", "Economics"].indexOf(b.sub) || LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));

/** Core skills are asked once, at the highest level the student picked. */
export const coreLevel = (ts: Track[]): LevelKey | null => (ts.length ? LEVEL_ORDER[Math.max(...ts.map((t) => LEVEL_ORDER.indexOf(t.level)))] : null);

export const trackOf = (s: State, id: string) => s.tracks.find((t) => trackId(t) === id);

/** Every screen of the test, in order. */
export function screens(s: State): Screen[] {
  const core = coreLevel(s.tracks);
  if (!core) return [];
  const out: Screen[] = [{ kind: "intro", sec: "profile" }];
  PROFILE.forEach((_, i) => out.push({ kind: "profile", i }));
  out.push({ kind: "intro", sec: "core" });
  CORE[core].forEach((_, i) => out.push({ kind: "mcq", sec: "core", i }));
  for (const t of s.tracks) {
    const id = trackId(t);
    out.push({ kind: "intro", sec: id });
    BANK[t.level][t.sub].q.forEach((_, i) => out.push({ kind: "mcq", sec: id, i }));
    out.push({ kind: "written", sec: id });
  }
  return out;
}

export const sectionOf = (sc: Screen): Section => (sc.kind === "profile" ? "profile" : sc.sec);
export function questionsFor(s: State, sec: "core" | string): Mcq[] {
  if (sec === "core") return CORE[coreLevel(s.tracks)!];
  const t = trackOf(s, sec)!;
  return BANK[t.level][t.sub].q;
}

/** Rough minutes for a track, so the student knows what they are starting. */
export const trackMinutes = (t: Track) => Math.round(BANK[t.level][t.sub].q.length * 0.8 + 3);
export function minutes(tracks: Track[]): number {
  if (!tracks.length) return 0;
  return 3 + 6 + tracks.reduce((n, t) => n + trackMinutes(t), 0);
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

/**
 * Readiness from the non-preview questions: a right answer counts 1, a
 * right guess counts half. 75%+ = 3, 50%+ = 2, below = 1.
 */
export const READINESS: Record<"lesson" | "as", Record<1 | 2 | 3, string>> = {
  lesson: { 3: "Ready for lesson one", 2: "Ready, with support in the first weeks", 1: "Needs groundwork before lesson one" },
  as: { 3: "AS foundations are strong", 2: "AS foundations are partly there", 1: "AS foundations need rebuilding" },
};

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
  sec: string;
  skill: string;
  /** What the wrong answer usually means, if known. */
  why?: string;
  sure?: Sure | null;
  idk?: boolean;
}
export interface SectionSummary {
  /** "core" or a track id. */
  sec: string;
  title: string;
  areas: Array<{ area: Exclude<Area, "P">; name: string; r: 1 | 2 | 3 | null }>;
  /** Readiness 1 to 3, and what it means. */
  ready: 1 | 2 | 3;
  readyLabel: string;
  /** Only for tracks: knows some of the preview already. */
  prev: boolean;
  cal: Calibration;
  gaps: Gap[];
}

export const LEVEL_SHORT: Record<LevelKey, string> = { igcse: "O Level / IGCSE", as: "AS", a2: "A2" };
export const trackTitle = (t: Track) => `${t.sub}, ${LEVEL_SHORT[t.level]}`;

function summarise(s: State, sec: string): SectionSummary {
  const list = questionsFor(s, sec);
  const t = sec === "core" ? null : trackOf(s, sec)!;
  const by: Partial<Record<Area, Mark[]>> = {};
  const cal: Calibration = { certainWrong: 0, guessedRight: 0, idk: 0, right: 0, total: 0 };
  const gaps: Gap[] = [];
  let points = 0;
  list.forEach((q, i) => {
    const a = s.ans[`${sec}:${i}`] ?? { c: null };
    const ok = a.c === q.a;
    (by[q.area] ??= []).push({ ok, s: a.s });
    if (q.area === "P") return; // the preview is not a gap: it has not been taught yet
    cal.total++;
    if (ok) {
      cal.right++;
      points += a.s === "g" ? 0.5 : 1;
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
  const share = cal.total ? points / cal.total : 0;
  const ready = (share >= 0.75 ? 3 : share >= 0.5 ? 2 : 1) as 1 | 2 | 3;
  const readyLabel = sec === "core" ? RATING_LABEL[ready] : READINESS[t!.level === "a2" ? "as" : "lesson"][ready];
  // Firm misconceptions first: they are the hardest to shift.
  gaps.sort((x, y) => Number(y.sure === "c") - Number(x.sure === "c"));
  return { sec, title: t ? trackTitle(t) : "Core skills", areas, ready, readyLabel, prev, cal, gaps };
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
  if (!coreLevel(s.tracks)) return null;
  return {
    core: summarise(s, "core"),
    tracks: s.tracks.map((t) => summarise(s, trackId(t))),
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
    kind: s.kind,
    name: s.name.trim(),
    tracks: s.tracks,
    coreLevel: coreLevel(s.tracks),
    profile,
    answers: s.ans,
    written: s.written,
    summary: results(s),
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
  };
}
export type ResultPayload = ReturnType<typeof payload>;
