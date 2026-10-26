"use client";

import { useEffect, useState } from "react";
import s from "@/components/diagnostic/diagnostic.module.css";
import { BANK, CORE, LEVELS, PROFILE, SUBJECTS, type LevelKey, type SubjectKey } from "@/lib/diagnostic/bank";
import {
  PART_TITLE,
  RATING_LABEL,
  fresh,
  load,
  mcqFor,
  minutes,
  payload,
  results,
  save,
  screens,
  sectionOf,
  type Screen,
  type Section,
  type SectionSummary,
  type State,
  type Step,
  type Sure,
} from "@/lib/diagnostic/logic";
import { submitResult } from "@/lib/diagnostic/submit";

/**
 * The Blueprint Starting Point Check, in three parts: how you learn, core
 * skills, then each subject. Questions live in lib/diagnostic/bank.ts.
 * Progress is kept on the device, so a dropped connection resumes;
 * #reset on the address clears it.
 */
export function Diagnostic({ open }: { open: boolean }) {
  const [S, setS] = useState<State | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      let st = load() ?? fresh();
      if (window.location.hash === "#reset" || (st.step === "test" && !st.level)) {
        st = fresh();
        save(st);
        history.replaceState(null, "", window.location.pathname);
      }
      setS(st);
    }, 0);
    // #reset typed onto the address while the page is already open.
    const onHash = () => {
      if (window.location.hash !== "#reset") return;
      const st = fresh();
      save(st);
      history.replaceState(null, "", window.location.pathname);
      setS(st);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => {
      clearTimeout(id);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  if (!S) return <div className={s.root} />;

  const set = (next: State, top = false) => {
    save(next);
    setS(next);
    if (top) window.scrollTo(0, 0);
  };
  const go = (step: Step, patch: Partial<State> = {}) => set({ ...S, ...patch, step }, true);
  const started = S.step !== "welcome" || !!S.startedAt;
  const list = S.level ? screens(S.level, S.subjects) : [];
  const screen = S.step === "test" ? list[S.pos] : undefined;

  // Closed between sessions: only someone already part-way through can carry on.
  if (!open && !started) {
    return (
      <div className={s.root}>
        <Header S={S} list={list} />
        <main className={s.main}>
          <div className={s.screen}>
            <p className={s.eyebrow}>Starting Point Check</p>
            <h1 className={s.big}>This check is closed right now.</h1>
            <p className={s.lead}>It opens during your first class with Hamza. Use the same link again then.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={s.root}>
      <Header S={S} list={list} />
      <main className={s.main} aria-live="polite">
        <div className={s.screen} key={`${S.step}-${S.pos}`}>
          {S.step === "about" ? (
            <AboutScreen S={S} set={set} go={go} />
          ) : S.step === "test" && screen ? (
            <TestScreen S={S} list={list} screen={screen} set={set} go={go} />
          ) : S.step === "done" ? (
            <Done S={S} />
          ) : (
            <Welcome S={S} go={go} />
          )}
        </div>
      </main>
    </div>
  );
}

// Short labels so five bars fit on a phone.
const SEC_LABEL = (sec: Section) => (sec === "profile" ? "You" : sec === "core" ? "Core" : sec === "Accounting" ? "Accounts" : sec);

function Header({ S, list }: { S: State; list: Screen[] }) {
  const inTest = S.step === "test" && list.length > 0;
  const cur = inTest ? sectionOf(list[S.pos]) : null;
  // One bar per section, filled by how far through it the student is.
  const secs: Section[] = ["profile", "core", ...S.subjects];
  return (
    <header className={s.header}>
      <div className={s.bar}>
        <div className={s.mark} aria-hidden="true" />
        <div className={s.brand}>The Blueprint</div>
        <div className={s.where}>
          {inTest && cur ? (cur === "profile" || cur === "core" ? PART_TITLE[cur] : cur) : S.step === "done" ? "Complete" : "Starting Point Check"}
        </div>
      </div>
      {inTest && (
        <div className={s.ruler} aria-hidden="true">
          {secs.map((sec) => {
            const idx = list.map((x, i) => [x, i] as const).filter(([x]) => sectionOf(x) === sec && x.kind !== "intro");
            const done = idx.filter(([, i]) => i < S.pos).length;
            const pct = idx.length ? Math.round((done / idx.length) * 100) : 0;
            return (
              <div key={sec} className={`${s.seg} ${sec === cur ? s.segOn : ""}`}>
                <span>{SEC_LABEL(sec)}</span>
                <div className={s.track}>
                  <div className={s.fill} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </header>
  );
}

type Go = (step: Step, patch?: Partial<State>) => void;
type SetS = (next: State, top?: boolean) => void;

function Welcome({ S, go }: { S: State; go: Go }) {
  const resume = !!S.startedAt && S.step === "welcome";
  const per = S.level === "a2" ? 13 : 11;
  return (
    <div>
      <p className={s.eyebrow}>Starting Point Check</p>
      <h1 className={s.hero}>Let’s find your starting point.</h1>
      <p className={s.lead}>Before we teach you anything, we want to know how you learn, what you already know, and where the gaps are. Answer honestly and your classes start exactly where you are.</p>
      <ol className={s.parts}>
        <li>
          <span className={s.num}>1</span>
          <div>
            <b>How you learn</b>
            <span>How you study, revise and handle exams. About 3 minutes.</span>
          </div>
        </li>
        <li>
          <span className={s.num}>2</span>
          <div>
            <b>Core skills</b>
            <span>The numbers and reading every subject is built on. About 6 minutes.</span>
          </div>
        </li>
        <li>
          <span className={s.num}>3</span>
          <div>
            <b>Your subjects</b>
            <span>What you can already reason through, plus a short preview. About {per} minutes each.</span>
          </div>
        </li>
      </ol>
      <ul className={s.notes}>
        <li>
          <b>Not a test for marks.</b>
          <span>Nobody passes or fails. It only shows us what to teach first.</span>
        </li>
        <li>
          <b>Closed book.</b>
          <span>No Google, no AI, no help. A calculator, pen and paper are fine. Your own guess tells us more than someone else’s right answer.</span>
        </li>
        <li>
          <b>“I don’t know” is a good answer.</b>
          <span>It is more useful to us than a wild guess.</span>
        </li>
      </ul>
      <div className={s.actions}>
        <button className={s.btn} onClick={() => go(resume ? "test" : "about")}>
          {resume ? "Continue where you left off" : "Start"}
        </button>
        {resume && (
          <button className={s.link} onClick={() => go("about", fresh())}>
            Start again
          </button>
        )}
      </div>
    </div>
  );
}

function AboutScreen({ S, set, go }: { S: State; set: SetS; go: Go }) {
  const [err, setErr] = useState("");
  const [level0] = useState(S.level);
  const mins = minutes(S.level, S.subjects);

  function start() {
    const miss: string[] = [];
    if (!S.name.trim()) miss.push("your full name");
    if (!S.level) miss.push("your level");
    if (!S.subjects.length) miss.push("at least one subject");
    if (miss.length) return setErr(`Add ${miss.join(", ")} to continue.`);
    // A different level means different questions: earlier answers no longer apply.
    const reset = level0 && level0 !== S.level ? { ans: {}, written: {} } : {};
    go("test", { pos: 0, startedAt: S.startedAt ?? new Date().toISOString(), ...reset });
  }

  return (
    <div>
      <p className={s.eyebrow}>Before we begin</p>
      <h1 className={s.big}>First, the basics.</h1>
      <div className={s.field}>
        <label htmlFor="f-name">Full name</label>
        <input id="f-name" className={s.input} type="text" value={S.name} autoComplete="name" onChange={(e) => set({ ...S, name: e.target.value })} />
      </div>
      <div className={s.field}>
        <span className={s.lab}>Your level</span>
        <div className={s.cards} role="group" aria-label="Your level">
          {(Object.keys(LEVELS) as LevelKey[]).map((k) => (
            <button key={k} type="button" className={s.card} aria-pressed={S.level === k} onClick={() => set({ ...S, level: k })}>
              <b>{LEVELS[k]}</b>
              <small>{k === "igcse" ? "Starting from scratch" : k === "as" ? "First year of A Level" : "Second year, after AS"}</small>
            </button>
          ))}
        </div>
      </div>
      <div className={s.field}>
        <span className={s.lab}>
          Your subjects with Hamza <small>Choose any</small>
        </span>
        <div className={s.cards} role="group" aria-label="Your subjects">
          {SUBJECTS.map((sub) => (
            <button
              key={sub}
              type="button"
              className={s.card}
              aria-pressed={S.subjects.includes(sub)}
              onClick={() => set({ ...S, subjects: S.subjects.includes(sub) ? S.subjects.filter((x) => x !== sub) : SUBJECTS.filter((x) => x === sub || S.subjects.includes(x)) })}
            >
              <b>{sub}</b>
              <span className={s.tickbox} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      {mins > 0 && (
        <p className={s.time}>
          About <b>{mins} minutes</b> in all. Your answers save on this device as you go, so you can stop and come back.
        </p>
      )}
      <p className={s.err} role="alert">
        {err}
      </p>
      <div className={s.actions}>
        <button className={s.btn} onClick={start}>
          Begin
        </button>
        <button className={`${s.btn} ${s.ghost}`} onClick={() => go("welcome")}>
          Back
        </button>
      </div>
    </div>
  );
}

function TestScreen({ S, list, screen, set, go }: { S: State; list: Screen[]; screen: Screen; set: SetS; go: Go }) {
  const at = (pos: number) => go(pos < 0 ? "about" : "test", { pos: Math.max(0, pos) });
  const back = (
    <button className={`${s.btn} ${s.ghost}`} onClick={() => at(S.pos - 1)}>
      Back
    </button>
  );

  function next() {
    if (S.pos < list.length - 1) return at(S.pos + 1);
    const finished: State = { ...S, finishedAt: new Date().toISOString() };
    void submitResult(payload(finished));
    set({ ...finished, step: "done" }, true);
  }

  if (screen.kind === "intro") return <Intro S={S} sec={screen.sec} onStart={next} back={back} />;
  if (screen.kind === "profile") return <ProfileQuestion S={S} i={screen.i} set={set} next={next} back={back} />;
  if (screen.kind === "written") return <Written S={S} sub={screen.sec} last={S.pos === list.length - 1} set={set} next={next} back={back} />;
  return <Mcq S={S} sec={screen.sec} i={screen.i} set={set} next={next} back={back} />;
}

function Intro({ S, sec, onStart, back }: { S: State; sec: Section; onStart: () => void; back: React.ReactNode }) {
  const level = S.level!;
  if (sec === "profile") {
    return (
      <div>
        <p className={s.eyebrow}>Part 1 of 3</p>
        <h1 className={s.big}>How you learn.</h1>
        <p className={s.lead}>{PROFILE.length} quick questions about how you study. There are no right answers. Pick what you actually do, not what you think you should do.</p>
        <p className={s.time}>About 3 minutes.</p>
        <div className={s.actions}>
          <button className={s.btn} onClick={onStart}>
            Begin Part 1
          </button>
          {back}
        </div>
      </div>
    );
  }
  if (sec === "core") {
    return (
      <div>
        <p className={s.eyebrow}>Part 2 of 3</p>
        <h1 className={s.big}>Core skills.</h1>
        <p className={s.lead}>Numbers and reading: the skills Accounting, Business and Economics are all built on. After each answer, tell us how sure you are. “Guessed” is an honest and useful answer.</p>
        <p className={s.time}>{CORE[level].length} questions, about 6 minutes. A calculator is fine.</p>
        <div className={s.actions}>
          <button className={s.btn} onClick={onStart}>
            Begin Part 2
          </button>
          {back}
        </div>
      </div>
    );
  }
  const n = BANK[level][sec].q.length;
  const k = S.subjects.indexOf(sec);
  return (
    <div>
      <p className={s.eyebrow}>Part 3 of 3{S.subjects.length > 1 ? `, subject ${k + 1} of ${S.subjects.length}` : ""}</p>
      <h1 className={s.big}>{sec}.</h1>
      <p className={s.lead}>
        {level === "a2"
          ? `These questions check the AS ${sec} that A2 builds on. The last two are a preview of A2 topics: guess freely, or choose “I don’t know”.`
          : `No ${sec} experience needed. These questions test the everyday thinking ${sec} builds on. The last three are a preview of what you will learn first: guess freely, or choose “I don’t know”.`}
      </p>
      <p className={s.time}>
        {n} questions and one short written answer, about {level === "a2" ? 13 : 11} minutes.
      </p>
      <div className={s.actions}>
        <button className={s.btn} onClick={onStart}>
          Begin {sec}
        </button>
        {back}
      </div>
    </div>
  );
}

function ProfileQuestion({ S, i, set, next, back }: { S: State; i: number; set: SetS; next: () => void; back: React.ReactNode }) {
  const p = PROFILE[i];
  const chosen = S.profile[p.id];
  function pick(k: number) {
    const picked = { ...S, profile: { ...S.profile, [p.id]: k } };
    set(picked);
    // A short pause so the choice is seen, then on to the next question.
    setTimeout(() => {
      const nextPos = picked.pos + 1;
      set({ ...picked, pos: nextPos }, true);
    }, 220);
  }
  return (
    <div>
      <p className={s.qmeta}>
        How you learn <span className={s.count}>{i + 1} of {PROFILE.length}</span>
      </p>
      <h2 className={s.qtitle}>{p.q}</h2>
      <div className={s.opts} role="group" aria-label="Answers">
        {p.o.map((o, k) => (
          <button key={k} className={s.opt} aria-pressed={chosen === k} onClick={() => pick(k)}>
            <span className={s.radio} aria-hidden="true" />
            <span>{o.t}</span>
          </button>
        ))}
      </div>
      <div className={s.actions}>
        {chosen != null && (
          <button className={s.btn} onClick={next}>
            Next
          </button>
        )}
        {back}
      </div>
    </div>
  );
}

function Mcq({ S, sec, i, set, next, back }: { S: State; sec: "core" | SubjectKey; i: number; set: SetS; next: () => void; back: React.ReactNode }) {
  const q = mcqFor(S.level!, sec, i);
  const total = sec === "core" ? CORE[S.level!].length : BANK[S.level!][sec].q.length;
  const key = `${sec}:${i}`;
  const a = S.ans[key] ?? { c: null };
  const ready = a.c === -1 || (a.c != null && !!a.s);
  const pick = (c: number) => set({ ...S, ans: { ...S.ans, [key]: c === -1 ? { c: -1 } : { c, s: a.c === c ? a.s : null } } });
  const sure = (v: Sure) => set({ ...S, ans: { ...S.ans, [key]: { ...a, s: v } } });

  return (
    <div>
      <p className={s.qmeta}>
        {sec === "core" ? "Core skills" : sec}{" "}
        <span className={s.count}>
          {i + 1} of {total}
        </span>
      </p>
      {q.area === "P" && <span className={s.preview}>Preview question. Guess freely.</span>}
      {q.context && <div className={s.context}>{q.context}</div>}
      <h2 className={s.qtitle}>{q.q}</h2>
      <div className={s.opts} role="group" aria-label="Answers">
        {q.o.map((o, k) => (
          <button key={k} className={s.opt} aria-pressed={a.c === k} onClick={() => pick(k)}>
            <span className={s.k}>{"ABCD"[k]}</span>
            <span>{o}</span>
          </button>
        ))}
        <button className={`${s.opt} ${s.idk}`} aria-pressed={a.c === -1} onClick={() => pick(-1)}>
          <span className={s.k}>?</span>
          <span>I don’t know</span>
        </button>
      </div>
      {a.c != null && a.c !== -1 && (
        <div className={s.sure}>
          <span className={s.lab}>How sure are you?</span>
          <div className={s.seg3} role="group" aria-label="How sure are you?">
            {(
              [
                ["g", "Guessed"],
                ["f", "Fairly sure"],
                ["c", "Certain"],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={a.s === v} onClick={() => sure(v)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={`${s.actions} ${s.dock}`}>
        <button className={s.btn} disabled={!ready} onClick={next}>
          Next
        </button>
        {back}
      </div>
    </div>
  );
}

function Written({ S, sub, last, set, next, back }: { S: State; sub: SubjectKey; last: boolean; set: SetS; next: () => void; back: React.ReactNode }) {
  return (
    <div>
      <p className={s.qmeta}>
        {sub} <span className={s.count}>Written answer</span>
      </p>
      <h2 className={s.qtitle}>{BANK[S.level!][sub].w}</h2>
      <p className={s.hint}>Write it the way you would in an exam. A few lines is enough. Hamza marks this one personally.</p>
      <div className={s.field}>
        <label htmlFor="w">Your answer</label>
        <textarea id="w" className={s.input} style={{ minHeight: 190 }} value={S.written[sub] ?? ""} onChange={(e) => set({ ...S, written: { ...S.written, [sub]: e.target.value } })} />
      </div>
      <div className={s.actions}>
        <button className={s.btn} onClick={next}>
          {last ? "Finish the check" : `Finish ${sub}`}
        </button>
        {back}
      </div>
    </div>
  );
}

function Rating({ r }: { r: 1 | 2 | 3 | null }) {
  return (
    <span className={s.rating}>
      {r ? RATING_LABEL[r] : ""}
      <span className={s.meter} aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={`${s.pip} ${r && n <= r ? s.pipOn : ""}`} />
        ))}
      </span>
    </span>
  );
}

function Block({ sum, title, note }: { sum: SectionSummary; title: string; note?: string }) {
  return (
    <section className={s.subj}>
      <h3>{title}</h3>
      {sum.areas.map((ar) => (
        <div key={ar.area} className={s.row}>
          <span className={s.name}>{ar.name}</span>
          <Rating r={ar.r} />
        </div>
      ))}
      {note && <p className={s.small}>{note}</p>}
    </section>
  );
}

function Done({ S }: { S: State }) {
  const nm = S.name.trim().split(/\s+/)[0];
  const r = results(S);
  if (!r) return null;
  const tips = r.learner.slice(0, 3);
  const firm = [r.core, ...r.subjects].reduce((n, x) => n + x.cal.certainWrong, 0);
  return (
    <div>
      <p className={s.eyebrow}>Complete</p>
      <h1 className={s.big}>All done{nm ? `, ${nm}` : ""}.</h1>
      <p className={s.lead}>Here is a first look at where you are starting from. Every rating here is a starting point, not a verdict.</p>

      <Block sum={r.core} title="Core skills" />
      {r.subjects.map((sum) => (
        <Block
          key={sum.sec}
          sum={sum}
          title={sum.sec}
          note={sum.prev ? "You already know some of what comes next. We will give you stretch work." : "The preview topics are new to you, which is completely fine. We will build them from the start."}
        />
      ))}

      {firm > 0 && (
        <p className={s.firm}>
          You were certain about {firm === 1 ? "one answer" : `${firm} answers`} that {firm === 1 ? "was" : "were"} not right. That is normal, and it is the first thing we will fix: a confident mix-up is the hardest kind to spot on your own.
        </p>
      )}

      {tips.length > 0 && (
        <section className={s.tips}>
          <h3>How you learn: {tips.length === 1 ? "one thing" : `${tips.length === 2 ? "two" : "three"} things`} to try</h3>
          <ol>
            {tips.map((t) => (
              <li key={t.id}>{t.student}</li>
            ))}
          </ol>
        </section>
      )}

      <div className={s.callout}>
        Hamza will mark your written answers and send your full <b>Starting Point Report</b> and four-week plan on WhatsApp within 24 hours.
      </div>
    </div>
  );
}
