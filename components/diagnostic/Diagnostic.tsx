"use client";

import { useEffect, useState } from "react";
import s from "@/components/diagnostic/diagnostic.module.css";
import { BANK, LEVELS, SUBJECTS, type LevelKey, type SubjectKey } from "@/lib/diagnostic/bank";
import { QUESTIONS_PER_SUBJECT, RATING_LABEL, fresh, load, payload, results, save, type About, type State, type Step, type Sure } from "@/lib/diagnostic/logic";
import { submitResult } from "@/lib/diagnostic/submit";

/**
 * The Blueprint Starting Point Check. Every screen, rule and word is as
 * designed in the original; questions live in lib/diagnostic/bank.ts.
 * Progress is kept on the device, so a dropped connection resumes;
 * #reset on the address clears it.
 */
export function Diagnostic({ open }: { open: boolean }) {
  const [S, setS] = useState<State | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      let st = load() ?? fresh();
      if (window.location.hash === "#reset" || (st.step === "question" && !st.level)) {
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
  const setAbout = (patch: Partial<About>) => set({ ...S, about: { ...S.about, ...patch } });
  const started = Object.keys(S.ans).length > 0 || S.step !== "welcome";

  // Closed between sessions: only someone already part-way through can carry on.
  if (!open && !started) {
    return (
      <div className={s.root}>
        <Header S={S} />
        <main className={s.main}>
          <div className={s.screen}>
            <h1 className={s.big}>This check is closed right now.</h1>
            <p className={s.lead}>It opens during your first class with Hamza. Use the same link again then.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={s.root}>
      <Header S={S} />
      <main className={s.main} aria-live="polite">
        <div className={s.screen} key={`${S.step}-${S.si}-${S.qi}`}>
          {S.step === "about" ? (
            <AboutScreen S={S} setAbout={setAbout} set={set} go={go} />
          ) : S.step === "question" ? (
            <Question S={S} set={set} go={go} />
          ) : S.step === "between" ? (
            <Between S={S} go={go} />
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

function Header({ S }: { S: State }) {
  const inTest = S.step === "question" || S.step === "between";
  return (
    <header className={s.header}>
      <div className={s.bar}>
        <div className={s.mark} aria-hidden="true" />
        <div className={s.brand}>The Blueprint</div>
        <div className={s.where}>{inTest && S.level ? LEVELS[S.level] : S.step === "done" ? "Complete" : "Starting Point Check"}</div>
      </div>
      {inTest && (
        <div className={s.ruler}>
          {S.subjects.map((sub, i) => (
            <div key={sub} className={`${s.seg} ${i === S.si ? s.segOn : ""}`}>
              <span>{sub}</span>
              <div className={s.ticks}>
                {Array.from({ length: QUESTIONS_PER_SUBJECT }, (_, k) => {
                  const done = i < S.si || (i === S.si && k < S.qi) || (S.step === "between" && i === S.si);
                  const now = !done && i === S.si && k === S.qi && S.step === "question";
                  return <div key={k} className={`${s.tick} ${done ? s.tickDone : now ? s.tickNow : ""}`} />;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}

type Go = (step: Step, patch?: Partial<State>) => void;
type SetS = (next: State, top?: boolean) => void;

function Welcome({ S, go }: { S: State; go: Go }) {
  const resume = !!(S.level && S.subjects.length && S.step === "welcome" && Object.keys(S.ans).length);
  return (
    <div>
      <h1 className={s.hero}>Let’s find your starting point.</h1>
      <p className={s.lead}>A short check so your classes start exactly where you are. It takes about 10 minutes for each subject.</p>
      <ul className={s.notes}>
        <li>
          <b>This is not a test for marks.</b>
          <span>Nobody passes or fails. It only shows what to focus on first.</span>
        </li>
        <li>
          <b>Closed book.</b>
          <span>No Google, no AI, no help. A guess from you is more useful than a right answer from someone else.</span>
        </li>
        <li>
          <b>The last three questions are a preview.</b>
          <span>You may not have learnt them yet. Guess freely, or choose “I don’t know”.</span>
        </li>
      </ul>
      <div className={s.actions}>
        <button className={s.btn} onClick={() => go(resume ? "question" : "about")}>
          {resume ? "Continue where you left off" : "Start"}
        </button>
        {resume && (
          <button className={s.link} onClick={() => go("about", { ...fresh() })}>
            Start again
          </button>
        )}
      </div>
    </div>
  );
}

function Chips({ options, isOn, onPick }: { options: string[]; isOn: (o: string) => boolean; onPick: (o: string) => void }) {
  return (
    <div className={s.chips} role="group">
      {options.map((o) => (
        <button key={o} type="button" className={s.chip} aria-pressed={isOn(o)} onClick={() => onPick(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}

function AboutScreen({ S, setAbout, set, go }: { S: State; setAbout: (p: Partial<About>) => void; set: SetS; go: Go }) {
  const [err, setErr] = useState("");
  const a = S.about;
  const txt = (name: keyof About, label: string, type: "text" | "tel" | "area", hint?: string) => (
    <div className={s.field}>
      <label htmlFor={`f-${name}`}>
        {label}
        {hint && <small> {hint}</small>}
      </label>
      {type === "area" ? (
        <textarea id={`f-${name}`} className={s.input} value={(a[name] as string) ?? ""} onChange={(e) => setAbout({ [name]: e.target.value })} />
      ) : (
        <input id={`f-${name}`} className={s.input} type={type} value={(a[name] as string) ?? ""} autoComplete="off" onChange={(e) => setAbout({ [name]: e.target.value })} />
      )}
    </div>
  );
  const single = (name: "board" | "target") => (o: string) => setAbout({ [name]: a[name] === o ? null : o });

  function start() {
    const miss: string[] = [];
    if (!(a.name ?? "").trim()) miss.push("your name");
    if (!(a.phone ?? "").trim()) miss.push("your WhatsApp number");
    if (!S.level) miss.push("your level");
    if (!S.subjects.length) miss.push("at least one subject");
    if (miss.length) return setErr(`Add ${miss.join(", ")} to continue.`);
    go("question", { si: 0, qi: 0 });
  }

  return (
    <div>
      <h1 className={s.big}>About you</h1>
      <p className={s.lead}>Two minutes. This helps Hamza plan your classes and send your report.</p>
      <div className={s.group}>
        {txt("name", "Full name", "text")}
        {txt("phone", "Your WhatsApp number", "tel")}
        {txt("parent", "Parent’s WhatsApp number", "tel", "Your report goes here too")}
        {txt("school", "School or academy", "text")}
        <div className={s.field}>
          <span className={s.lab}>Exam board</span>
          <Chips options={["Cambridge", "Pearson Edexcel", "Not sure"]} isOn={(o) => a.board === o} onPick={single("board")} />
        </div>
        {txt("last", "Your last result in these subjects", "text", "Grade or percentage, or “not taken yet”")}
        <div className={s.field}>
          <span className={s.lab}>Target grade</span>
          <Chips options={["A*", "A", "B", "C", "Not sure yet"]} isOn={(o) => a.target === o} onPick={single("target")} />
        </div>
        {txt("worry", "Which topics worry you the most?", "area")}
        <div className={s.field}>
          <span className={s.lab}>
            How do you usually study? <small>Choose any</small>
          </span>
          <Chips
            options={["Notes", "Past papers", "Videos", "No fixed routine"]}
            isOn={(o) => a.study.includes(o)}
            onPick={(o) => setAbout({ study: a.study.includes(o) ? a.study.filter((x) => x !== o) : [...a.study, o] })}
          />
        </div>
        {txt("before", "One thing a teacher did before that did not work for you", "area", "Optional")}
      </div>
      <div className={s.group}>
        <h2>Your level</h2>
        <div className={s.field}>
          <Chips options={Object.keys(LEVELS).map((k) => LEVELS[k as LevelKey])} isOn={(o) => !!S.level && LEVELS[S.level] === o} onPick={(o) => set({ ...S, level: (Object.keys(LEVELS) as LevelKey[]).find((k) => LEVELS[k] === o)! })} />
        </div>
      </div>
      <div className={s.group}>
        <h2>Your subjects with Hamza</h2>
        <div className={s.field}>
          <Chips
            options={SUBJECTS}
            isOn={(o) => S.subjects.includes(o as SubjectKey)}
            onPick={(o) => {
              const sub = o as SubjectKey;
              set({ ...S, subjects: S.subjects.includes(sub) ? S.subjects.filter((x) => x !== sub) : SUBJECTS.filter((x) => x === sub || S.subjects.includes(x)) });
            }}
          />
        </div>
      </div>
      <p className={s.err} role="alert">
        {err}
      </p>
      <div className={s.actions}>
        <button className={s.btn} onClick={start}>
          Start the questions
        </button>
      </div>
    </div>
  );
}

function Question({ S, set, go }: { S: State; set: SetS; go: Go }) {
  const sub = S.subjects[S.si];
  const bank = BANK[S.level!][sub];
  const key = `${sub}:${S.qi}`;
  const last = S.si === S.subjects.length - 1;

  const back =
    S.si || S.qi ? (
      <button
        className={`${s.btn} ${s.ghost}`}
        onClick={() => (S.qi > 0 ? go("question", { qi: S.qi - 1 }) : S.si > 0 ? go("question", { si: S.si - 1, qi: 10 }) : undefined)}
      >
        Back
      </button>
    ) : null;

  async function next() {
    if (S.qi < 10) return go("question", { qi: S.qi + 1 });
    if (!last) return go("between");
    const finished: State = { ...S, finishedAt: new Date().toISOString() };
    void submitResult(payload(finished));
    set({ ...finished, step: "done" }, true);
  }

  if (S.qi === 10) {
    return (
      <div>
        <div className={s.qmeta}>{sub}: written answer</div>
        <h2 className={s.qtitle}>{bank.w}</h2>
        <div className={s.field}>
          <label htmlFor="w">Your answer</label>
          <textarea id="w" className={s.input} style={{ minHeight: 180 }} value={S.written[sub] ?? ""} onChange={(e) => set({ ...S, written: { ...S.written, [sub]: e.target.value } })} />
        </div>
        <div className={s.actions}>
          <button className={s.btn} onClick={() => void next()}>
            {!last ? `Finish ${sub}` : "Finish the check"}
          </button>
          <button
            className={`${s.btn} ${s.ghost}`}
            onClick={() => go("question", { qi: S.qi - 1 })}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const [q, opts, , , area] = bank.q[S.qi];
  const a = S.ans[key] ?? { c: null };
  const ready = a.c === -1 || (a.c != null && !!a.s);
  const pick = (c: number) => set({ ...S, ans: { ...S.ans, [key]: c === -1 ? { c: -1 } : { c, s: a.c === c ? a.s : null } } });
  const sure = (v: Sure) => set({ ...S, ans: { ...S.ans, [key]: { ...a, s: v } } });

  return (
    <div>
      <div className={s.qmeta}>
        {sub}: question {S.qi + 1} of 11
      </div>
      {area === "P" && <span className={s.preview}>Preview question. Guess freely.</span>}
      <h2 className={s.qtitle}>{q}</h2>
      <div className={s.opts} role="group" aria-label="Answers">
        {opts.map((o, i) => (
          <button key={i} className={s.opt} aria-pressed={a.c === i} onClick={() => pick(i)}>
            <span className={s.k}>{"ABCD"[i]}</span>
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
          <div className={s.seg3} role="group">
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
      <div className={s.actions}>
        <button className={s.btn} disabled={!ready} onClick={() => void next()}>
          Next question
        </button>
        {back}
      </div>
    </div>
  );
}

function Between({ S, go }: { S: State; go: Go }) {
  const done = S.subjects[S.si];
  const next = S.subjects[S.si + 1];
  return (
    <div>
      <h1 className={s.big}>{done} is done.</h1>
      <p className={s.lead}>Take a breath. Next up is {next}, another 11 questions.</p>
      <div className={s.actions}>
        <button className={s.btn} onClick={() => go("question", { si: S.si + 1, qi: 0 })}>
          Start {next}
        </button>
      </div>
    </div>
  );
}

function Done({ S }: { S: State }) {
  const nm = (S.about.name ?? "").trim().split(/\s+/)[0];
  return (
    <div>
      <h1 className={s.big}>All done{nm ? `, ${nm}` : ""}.</h1>
      <p className={s.lead}>Here is a first look at where you are starting from.</p>
      {results(S).map((r) => (
        <div key={r.sub} className={s.subj}>
          <h3>{r.sub}</h3>
          {r.areas.map((ar) => (
            <div key={ar.name} className={s.row}>
              <span className={s.name}>{ar.name}</span>
              <span className={s.rating}>
                {ar.r ? RATING_LABEL[ar.r] : ""}
                <span className={s.dots} aria-hidden="true">
                  {[1, 2, 3].map((n) => (
                    <span key={n} className={`${s.dot} ${ar.r && n <= ar.r ? s.dotF : ""}`} />
                  ))}
                </span>
              </span>
            </div>
          ))}
          <p className={s.small}>
            {r.prev ? "You already know some of what comes next. We will give you stretch work." : "The preview topics are new to you, which is completely fine. We will build them from the start."}
          </p>
        </div>
      ))}
      <div className={s.callout}>
        Hamza will mark your written answers and send your full <b>Starting Point Report</b> and four-week plan on WhatsApp within 24 hours.
      </div>
    </div>
  );
}
