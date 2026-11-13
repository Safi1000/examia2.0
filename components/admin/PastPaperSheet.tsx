"use client";

import { useEffect, useMemo, useState } from "react";
import type { Answer, Question } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useDatabase } from "@/lib/data/store";
import { Button, Modal, Select, Icon, Badge, Pill } from "@/components/ui";
import { QuestionView } from "@/components/student/QuestionView";
import { PageStack } from "@/components/PageStack";
import { cn } from "@/lib/cn";
import { levelOfName, subjectOfName } from "@/lib/notes-library";
import { syllabusProgress } from "@/lib/syllabus-progress";
import { fromLocalInput, toLocalInput } from "@/lib/time";
import { nextClassStart } from "@/lib/timetable";
import {
  covers,
  defaultMix,
  idsInText,
  newSeed,
  paperFamily,
  questionFromBuilt,
  type BuiltQuestion,
  type PaperFamily,
  type TopicChoice,
} from "@/lib/paper-builder";

/**
 * "From past papers": class → subject → topics → mix → when → Build, then a
 * review of every question exactly as the student will see it (typed, or its
 * one picture with A to D), with Swap and Remove. Nothing is saved here; the
 * page that opened it makes the draft test, or fills the homework form, for
 * Hamza to check again before students see it.
 */

export interface PastPaperBuild {
  cohortId: string;
  classId: string | null;
  subjectId: string | null;
  subjectName: string;
  family: PaperFamily;
  questions: BuiltQuestion[];
  /** Names of the topics the questions came from, in syllabus order. */
  topicNames: string[];
  opensAt: string;
  closesAt: string;
}

/** Every past paper question already set for this class, in tests (prompts) or homework (instructions). */
export function classHistoryIds(db: Pick<Database, "tests" | "assignments">, cohortId: string | null, classId: string | null): string[] {
  const same = (c: string | null, cl: string | null) => (!cohortId || !c || c === cohortId) && (!classId || !cl || cl === classId);
  return [
    ...db.tests.filter((t) => same(t.cohortId, t.classId)).flatMap((t) => t.questions.flatMap((q) => idsInText(q.prompt))),
    ...db.assignments.filter((a) => same(a.cohortId, a.classId)).flatMap((a) => idsInText(a.instructions)),
  ];
}

/** Calls /api/paper-builder. */
export async function paperBuilder<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/paper-builder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error("The past papers didn't load. Try again.");
  return (await res.json()) as T;
}

const DAY = 86_400_000;

export function PastPaperSheet({
  open,
  onClose,
  mode,
  defaultCohortId,
  onBuilt,
  defaultClassId,
  defaultSubjectId,
}: {
  open: boolean;
  onClose: () => void;
  mode: "test" | "homework";
  defaultCohortId: string | null;
  onBuilt: (build: PastPaperBuild) => void;
  /** Opened from a class: its level and subject are already chosen. */
  defaultClassId?: string;
  defaultSubjectId?: string;
}) {
  if (!open) return null;
  return <Sheet onClose={onClose} mode={mode} defaultCohortId={defaultCohortId} onBuilt={onBuilt} defaultClassId={defaultClassId} defaultSubjectId={defaultSubjectId} />;
}

function Sheet({
  onClose,
  mode,
  defaultCohortId,
  onBuilt,
  defaultClassId,
  defaultSubjectId,
}: {
  onClose: () => void;
  mode: "test" | "homework";
  defaultCohortId: string | null;
  onBuilt: (build: PastPaperBuild) => void;
  defaultClassId?: string;
  defaultSubjectId?: string;
}) {
  const db = useDatabase();
  const cohorts = db.cohorts.filter((c) => c.active);
  const [cohortId, setCohortId] = useState(() => (cohorts.some((c) => c.id === defaultCohortId) ? defaultCohortId! : (cohorts[0]?.id ?? "")));
  const cohort = db.cohorts.find((c) => c.id === cohortId);

  // Classes and subjects the cohort offers (all of them when it doesn't say), that have past papers.
  const classes = useMemo(() => {
    const list = cohort?.classIds.length ? db.classes.filter((c) => cohort.classIds.includes(c.id)) : db.classes;
    return list.filter((c) => levelOfName(c.name));
  }, [db.classes, cohort]);
  const subjects = useMemo(() => {
    const list = cohort?.subjectIds.length ? db.subjects.filter((s) => cohort.subjectIds.includes(s.id)) : db.subjects;
    return list.filter((s) => subjectOfName(s.name));
  }, [db.subjects, cohort]);

  const [classId, setClassId] = useState(defaultClassId ?? "");
  const [subjectId, setSubjectId] = useState(defaultSubjectId ?? "");
  const cls = classes.find((c) => c.id === classId) ?? (classes.length === 1 ? classes[0] : undefined);
  const subj = subjects.find((s) => s.id === subjectId) ?? (subjects.length === 1 ? subjects[0] : undefined);
  const level = levelOfName(cls?.name);
  const subjectKind = subjectOfName(subj?.name);
  const family = level && subjectKind ? paperFamily(level, subjectKind) : null;
  const familyKey = family ? `${family.syllabus}|${family.codes.join(",")}|${family.asOnly}` : "";

  // Chapters the class has covered: notes released to its students.
  const covered = useMemo(() => {
    if (!cls || !subj || !level) return [] as string[];
    const students = db.students.filter((s) => s.cohortId === cohortId && s.classIds.includes(cls.id) && s.subjectIds.includes(subj.id));
    const nums = new Set<string>();
    for (const st of students)
      for (const b of syllabusProgress(db, st))
        if (b.subject === subjectKind && (b.level === level || (b.level === "AS" && level === "A2")))
          for (const c of b.chapters) if (c.out) nums.add(c.num);
    return [...nums];
  }, [db, cohortId, cls, subj, level, subjectKind]);

  const [topics, setTopics] = useState<TopicChoice[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [mix, setMix] = useState<{ mcq: number; written: number } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!family) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTopics(null);
    setLoadError("");
    paperBuilder<{ topics: TopicChoice[] }>({ action: "topics", syllabus: family.syllabus, codes: family.codes, asOnly: family.asOnly })
      .then(({ topics }) => {
        if (!live) return;
        setTopics(topics);
        const has = topics.flatMap((t) => t.subs).filter((s) => s.mcq + s.written > 0);
        setPicked(new Set(has.filter((s) => covered.some((c) => covers(c, s.num))).map((s) => s.num)));
        setMix(defaultMix(mode, has.some((s) => s.mcq > 0)));
      })
      .catch((e: unknown) => live && setLoadError(e instanceof Error ? e.message : "The past papers didn't load."));
    return () => {
      live = false;
    };
    // familyKey stands for `family`; covered is read again for each class.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyKey, mode, cohortId, cls?.id, subj?.id, retry]);

  const subs = topics?.flatMap((t) => t.subs) ?? [];
  const usable = subs.filter((s) => s.mcq + s.written > 0);
  const coveredSubs = usable.filter((s) => covered.some((c) => covers(c, s.num)));
  const avail = usable.filter((s) => picked.has(s.num)).reduce((a, s) => ({ mcq: a.mcq + s.mcq, written: a.written + s.written }), { mcq: 0, written: 0 });
  const hasMcq = usable.some((s) => s.mcq > 0);

  const [opens, setOpens] = useState(() => toLocalInput(new Date().toISOString()));
  // Due at the end of a day (11:59 pm Pakistan time, whatever the device's own
  // zone), not at whatever minute the sheet was opened.
  const [closesTyped, setCloses] = useState("");
  const [openedAt] = useState(() => Date.now());
  // Homework is due when that class next meets (three days out when the timetable has no next one);
  // a test closes in two days. A date Hamza picks himself always wins.
  const closes = useMemo(() => {
    if (closesTyped) return closesTyped;
    const next = mode === "homework" && cls && subj ? nextClassStart(db, cls.id, subj.id, openedAt + DAY / 2) : null;
    if (next) return toLocalInput(new Date(next).toISOString());
    return `${toLocalInput(new Date(openedAt + (mode === "test" ? 2 : 3) * DAY).toISOString()).slice(0, 10)}T23:59`;
  }, [closesTyped, mode, cls, subj, db, openedAt]);

  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const total = (mix?.mcq ?? 0) + (mix?.written ?? 0);
  const ready = !!family && !!cohortId && picked.size > 0 && total > 0 && !!closes && (mode === "homework" || !!opens);

  async function build() {
    if (!family || !mix || !cls || !subj) return;
    if (mode === "test" && fromLocalInput(closes) <= fromLocalInput(opens)) return setError("The closing time must be after the opening time.");
    setBuilding(true);
    setError("");
    try {
      const { questions } = await paperBuilder<{ questions: BuiltQuestion[] }>({
        action: "build",
        syllabus: family.syllabus,
        codes: family.codes,
        subs: [...picked],
        mcq: hasMcq ? mix.mcq : 0,
        written: mix.written,
        // Questions this class has had before come last, only when nothing new is left.
        seen: classHistoryIds(db, cohortId, cls.id),
        seed: newSeed(),
      });
      if (!questions.length) {
        setError("No questions on these topics yet. Add a topic.");
        return;
      }
      setReview(questions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setBuilding(false);
    }
  }

  // ---- Review: every question as the student will see it ------------------
  const [review, setReview] = useState<BuiltQuestion[] | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  async function swap(q: BuiltQuestion) {
    if (!family || !review || !cls) return;
    setSwapping(q.id);
    setError("");
    try {
      const { question } = await paperBuilder<{ question: BuiltQuestion | null }>({
        action: "swap",
        syllabus: family.syllabus,
        codes: family.codes,
        id: q.id,
        exclude: review.map((x) => x.id),
        seen: classHistoryIds(db, cohortId, cls.id),
        seed: newSeed(),
      });
      if (!question) setError("There's no other question on that topic. Remove it, or keep it.");
      else setReview(review.map((x) => (x.id === q.id ? { ...question, topic: q.topic, sub: q.sub } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
    } finally {
      setSwapping(null);
    }
  }

  function finish() {
    if (!family || !cls || !subj || !review?.length) return;
    setFinishing(true);
    const order = subs.map((s) => s.num);
    const names = [...new Set(review.map((q) => q.sub))].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((n) => subs.find((s) => s.num === n)?.name ?? n);
    onBuilt({
      cohortId,
      classId: cls.id,
      subjectId: subj.id,
      subjectName: subj.name,
      family,
      questions: review,
      topicNames: names,
      opensAt: fromLocalInput(opens),
      closesAt: fromLocalInput(closes),
    });
  }

  if (review)
    return (
      <Modal
        open
        onClose={() => !finishing && onClose()}
        size="lg"
        title="Check the questions"
        description={
          mode === "test"
            ? "Exactly what students will see. Swap or remove any, then make the draft."
            : "Exactly what students will see on the homework. Swap or remove any, then attach them."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setReview(null)} disabled={finishing}>Back</Button>
            <Button onClick={finish} disabled={!review.length || swapping !== null} loading={finishing}>
              {mode === "test" ? `Make draft test (${review.length})` : `Attach ${review.length} to homework`}
            </Button>
          </>
        }
      >
        <div className="space-y-4 pb-1">
          {review.length === 0 && <p className="text-sm text-ink-3">Every question was removed. Go back and build again.</p>}
          <ol className="space-y-4">
            {review.map((q, i) => (
              <ReviewItem
                key={q.id}
                q={q}
                index={i}
                mode={mode}
                swapping={swapping === q.id}
                busy={swapping !== null}
                onSwap={() => void swap(q)}
                onRemove={() => setReview(review.filter((x) => x.id !== q.id))}
              />
            ))}
          </ol>
          {error && <p role="alert" className="text-sm text-error">{error}</p>}
        </div>
      </Modal>
    );

  const short = mix && topics ? (hasMcq && mix.mcq > avail.mcq) || mix.written > avail.written : false;

  return (
    <Modal
      open
      // While the draft is being built, closing would still make it a moment later.
      onClose={() => !building && onClose()}
      size="lg"
      title="From past papers"
      description={mode === "test" ? "Real Cambridge questions, built into a draft test you check before publishing." : "Real Cambridge questions, attached to a homework you check before posting."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={building}>Cancel</Button>
          <Button onClick={() => void build()} disabled={!ready} loading={building}>Build and check</Button>
        </>
      }
    >
      <div className="space-y-7 pb-1">
        {/* 1. Class */}
        <section aria-labelledby="pp-class" className="space-y-3">
          <h3 id="pp-class" className="label-quiet text-ink-3">Class</h3>
          {cohorts.length > 1 && (
            <Select label="Cohort" value={cohortId} onChange={(e) => { setCohortId(e.target.value); setClassId(""); setSubjectId(""); }}>
              {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          )}
          <Chips label="Level" options={classes.map((c) => ({ value: c.id, label: c.name }))} value={cls?.id ?? ""} onChange={setClassId} empty="No IGCSE, O Level or A Level class yet. Add one under Classes." />
          <Chips label="Subject" options={subjects.map((s) => ({ value: s.id, label: s.name }))} value={subj?.id ?? ""} onChange={setSubjectId} empty="No Accounting, Business or Economics subject yet." />
        </section>

        {/* 2. Topics */}
        {family && (
          <section aria-labelledby="pp-topics" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 id="pp-topics" className="label-quiet text-ink-3">Topics</h3>
              {topics && (
                <div className="flex items-center gap-1 text-sm">
                  {coveredSubs.length > 0 && <TextButton onClick={() => setPicked(new Set(coveredSubs.map((s) => s.num)))}>Covered so far</TextButton>}
                  <TextButton onClick={() => setPicked(new Set(usable.map((s) => s.num)))}>All</TextButton>
                  <TextButton onClick={() => setPicked(new Set())}>None</TextButton>
                </div>
              )}
            </div>
            {loadError ? (
              <p className="flex flex-wrap items-center gap-x-2 text-sm text-error">
                {loadError}
                <TextButton onClick={() => setRetry((n) => n + 1)}>Try again</TextButton>
              </p>
            ) : !topics ? (
              <div className="space-y-2" aria-busy="true" aria-label="Loading topics">
                {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
              </div>
            ) : (
              <>
                <p className="text-sm text-ink-3">
                  {coveredSubs.length
                    ? `${coveredSubs.length} ${coveredSubs.length === 1 ? "topic is" : "topics are"} ticked: the chapters this class has notes for.`
                    : "No notes are out for this class yet, so nothing is ticked. Pick the topics to test."}
                </p>
                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {topics.map((t) => {
                    const own = t.subs.filter((s) => s.mcq + s.written > 0);
                    if (!own.length) return null;
                    const on = own.filter((s) => picked.has(s.num)).length;
                    const expanded = openTopic === t.num;
                    const setAll = (v: boolean) => setPicked((p) => { const n = new Set(p); for (const s of own) if (v) n.add(s.num); else n.delete(s.num); return n; });
                    return (
                      <li key={t.num}>
                        <div className="flex min-h-12 items-center gap-1 pr-1">
                          <Tick checked={on === own.length} mixed={on > 0 && on < own.length} onChange={setAll} label={`${t.num} ${t.name}`} />
                          <button
                            type="button"
                            onClick={() => setOpenTopic(expanded ? null : t.num)}
                            aria-expanded={expanded}
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-2 text-left hover:bg-white/[0.03]"
                          >
                            <span className="min-w-0 flex-1 truncate text-[15px] text-ink"><span className="tabular-nums text-ink-3">{t.num}</span>&nbsp; {t.name}</span>
                            <span className="shrink-0 text-xs tabular-nums text-ink-3">{on} of {own.length}</span>
                            <Icon.ChevronRight className={cn("h-4 w-4 shrink-0 text-ink-3 transition-transform duration-200", expanded && "rotate-90")} />
                          </button>
                        </div>
                        {expanded && (
                          <ul className="border-t border-border bg-paper/40 py-1">
                            {own.map((s) => (
                              <li key={s.num} className="flex min-h-11 items-center pl-6 pr-3">
                                <Tick
                                  checked={picked.has(s.num)}
                                  onChange={(v) => setPicked((p) => { const n = new Set(p); if (v) n.add(s.num); else n.delete(s.num); return n; })}
                                  label={`${s.num} ${s.name}`}
                                  text={<><span className="tabular-nums text-ink-3">{s.num}</span>&nbsp; {s.name}</>}
                                />
                                <span className="ml-auto shrink-0 pl-3 text-xs tabular-nums text-ink-3">
                                  {[s.mcq ? `${s.mcq} MCQ` : "", s.written ? `${s.written} written` : ""].filter(Boolean).join(" · ")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        )}

        {/* 3. Mix */}
        {family && topics && mix && (
          <section aria-labelledby="pp-mix" className="space-y-3">
            <h3 id="pp-mix" className="label-quiet text-ink-3">Questions</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {hasMcq && <Stepper label="Multiple choice" hint={mode === "test" ? "Marked automatically" : "Students write the letter"} value={mix.mcq} max={30} onChange={(v) => setMix({ ...mix, mcq: v })} />}
              <Stepper label="Written" hint={mode === "test" ? "Photo answers you mark, with the mark scheme beside them" : "Whole questions from Paper 2"} value={mix.written} max={6} onChange={(v) => setMix({ ...mix, written: v })} />
            </div>
            {!hasMcq && <p className="text-sm text-ink-3">This subject has no multiple choice paper, so it&apos;s written questions only.</p>}
            {short && picked.size > 0 && (
              <p className="text-sm text-ink-3">
                Only {hasMcq ? `${avail.mcq} multiple choice and ` : ""}{avail.written} written on these topics. Fewer will be used.
              </p>
            )}
          </section>
        )}

        {/* 4. When */}
        {family && topics && (
          <section aria-labelledby="pp-when" className="space-y-3">
            <h3 id="pp-when" className="label-quiet text-ink-3">When</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {mode === "test" && <DateField id="pp-opens" label="Opens" value={opens} onChange={setOpens} />}
              <DateField id="pp-closes" label={mode === "test" ? "Closes" : "Due"} value={closes} onChange={setCloses} />
            </div>
          </section>
        )}

        {error && <p role="alert" className="text-sm text-error">{error}</p>}
      </div>
    </Modal>
  );
}

function Chips({ label, options, value, onChange, empty }: { label: string; options: Array<{ value: string; label: string }>; value: string; onChange: (v: string) => void; empty: string }) {
  if (!options.length) return <p className="text-sm text-ink-3">{empty}</p>;
  return (
    <div>
    <p className="mb-1.5 text-sm font-semibold text-ink-2">{label}</p>
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 rounded-full border px-4 text-[15px] font-semibold transition-colors duration-150",
              on ? "border-ink/40 bg-white/[0.09] text-ink" : "border-border-strong text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
    </div>
  );
}

/** A quiet tick box: off-white when on, so the gold stays on the one action. */
function Tick({ checked, mixed, onChange, label, text }: { checked: boolean; mixed?: boolean; onChange: (v: boolean) => void; label: string; text?: React.ReactNode }) {
  return (
    <label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 pl-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(mixed ? true : e.target.checked)} aria-label={text ? undefined : label} className="peer sr-only" />
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
          checked || mixed ? "border-ink/80 bg-ink text-paper" : "border-border-strong bg-surface",
        )}
      >
        {checked ? (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ) : mixed ? (
          <span className="h-0.5 w-2.5 rounded bg-current" />
        ) : null}
      </span>
      {text && <span className="min-w-0 text-[15px] text-ink">{text}</span>}
    </label>
  );
}

function TextButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 rounded-full px-3 font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
      {children}
    </button>
  );
}

function Stepper({ label, hint, value, max, onChange }: { label: string; hint: string; value: number; max: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.max(0, Math.min(max, v)));
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-ink">{label}</p>
        <p className="text-xs text-ink-3">{hint}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => set(value - 1)} disabled={value <= 0} aria-label={`One less ${label.toLowerCase()}`} className="h-11 w-11 rounded-full text-lg font-semibold text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-35">−</button>
        <span className="w-7 text-center text-lg font-semibold tabular-nums text-ink" aria-live="polite">{value}</span>
        <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label={`One more ${label.toLowerCase()}`} className="h-11 w-11 rounded-full text-lg font-semibold text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-35">+</button>
      </div>
    </div>
  );
}

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-2">{label}</label>
      <input id={id} type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-md border border-border-strong bg-surface px-3 tabular-nums text-ink" />
    </div>
  );
}

/** One question in the review: as the student will see it, with what Hamza needs to know. */
function ReviewItem({
  q,
  index,
  mode,
  swapping,
  busy,
  onSwap,
  onRemove,
}: {
  q: BuiltQuestion;
  index: number;
  mode: "test" | "homework";
  swapping: boolean;
  busy: boolean;
  onSwap: () => void;
  onRemove: () => void;
}) {
  const question = useMemo(() => ({ ...questionFromBuilt(q), id: `review-${q.id}`, order: index }) as Question, [q, index]);
  const form = q.kind === "written" ? "Written, photo answer" : mode === "homework" || !q.typed ? "Picture with A to D" : "Typed";
  return (
    <li className="rounded-lg border border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold tabular-nums text-ink">Question {index + 1}</span>
        <Badge tone="neutral">{form}</Badge>
        {q.seen && <Badge tone="warning">Set for this class before</Badge>}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={onSwap}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            aria-label={`Swap question ${index + 1} for another on the same topic`}
          >
            <Icon.Refresh className={cn("h-4 w-4", swapping && "animate-spin motion-reduce:animate-none")} /> {swapping ? "Swapping…" : "Swap"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-ink-2 transition-colors hover:bg-error-soft hover:text-error disabled:opacity-50"
            aria-label={`Remove question ${index + 1}`}
          >
            <Icon.Trash className="h-4 w-4" /> Remove
          </button>
        </span>
      </div>
      {/* Where it came from: for Hamza only. */}
      <p className="mt-1 text-xs text-ink-3">{q.label}{q.kind === "written" && q.marks === null ? " · marks to type in the draft" : ""}</p>
      <div className="mt-3 rounded-lg border border-hairline bg-paper/40 p-3 sm:p-4">
        {mode === "test" ? (
          <PastPaperPreview question={question} />
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{q.topic}</Badge>
              {q.marks !== null && <Pill>{q.marks} {q.marks === 1 ? "mark" : "marks"}</Pill>}
            </div>
            <PageStack urls={q.attachments} label={`Question ${index + 1}`} />
          </>
        )}
      </div>
    </li>
  );
}

/**
 * A past paper test question as the student sees it (Hamza can try the
 * choices). Written questions show their pages only: the photo upload box
 * stays on the student's side.
 */
export function PastPaperPreview({ question }: { question: Question }) {
  const [answer, setAnswer] = useState<Answer>({ questionId: question.id, type: question.type });
  if (question.type !== "mcq")
    return (
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {question.topic.trim() && <Badge tone="neutral">{question.topic}</Badge>}
          <Pill>{question.marks > 0 ? `${question.marks} ${question.marks === 1 ? "mark" : "marks"}` : "Marks to type"}</Pill>
          <span className="text-xs uppercase tracking-wide text-ink-3">Photo answer</span>
        </div>
        {question.attachments?.length ? <PageStack urls={question.attachments} label="The question" /> : null}
      </div>
    );
  return <QuestionView question={question} answer={answer} onChange={(next) => setAnswer((cur) => (typeof next === "function" ? next(cur) : next))} />;
}
