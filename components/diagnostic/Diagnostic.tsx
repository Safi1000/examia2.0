"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/Brand";
import { Backdrop } from "@/components/landing/Backdrop";
import { Footer } from "@/components/landing/Footer";
import { BANK, CORE, PROFILE, SUBJECTS, type LevelKey, type SubjectKey } from "@/lib/diagnostic/bank";
import {
  LEVEL_SHORT,
  coreLevel,
  fresh,
  load,
  minutes,
  payload,
  questionsFor,
  results,
  save,
  screens,
  sectionOf,
  sortTracks,
  trackId,
  trackOf,
  trackTitle,
  type Kind,
  type Screen,
  type Section,
  type State,
  type Step,
  type Sure,
} from "@/lib/diagnostic/logic";
import { submitResult } from "@/lib/diagnostic/submit";

/**
 * The Starting Point Check, in the site's own look: how you learn, core
 * skills, then each subject at each level. Questions live in
 * lib/diagnostic/bank.ts. Progress is kept on the device, so a dropped
 * connection resumes; #reset on the address clears it.
 */
type Saved = State & { saved?: boolean };

const ring = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const btn = `inline-flex min-h-12 items-center justify-center rounded-full bg-gold px-7 text-[16px] font-semibold text-[#1b1e21] transition-[background-color,transform,opacity] hover:bg-[#ffd07a] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35 ${ring}`;
const ghost = `inline-flex min-h-12 items-center justify-center rounded-full border border-hairline-strong px-6 text-[16px] font-medium text-body transition-colors dg-hgold hover:text-foreground ${ring}`;
const card = "rounded-[20px] border border-hairline bg-card";

export function Diagnostic({ open, kind }: { open: boolean; kind: Kind }) {
  const [S, setS] = useState<Saved | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      let st: Saved = load() ?? fresh(kind);
      // A finished day one check is replaced when the end of session check opens.
      const stale = st.step === "done" && st.kind !== kind;
      if (window.location.hash === "#reset" || stale || (st.step === "test" && !st.tracks.length)) {
        st = fresh(kind);
        save(st);
        history.replaceState(null, "", window.location.pathname);
      }
      setS(st);
    }, 0);
    // #reset typed onto the address while the page is already open.
    const onHash = () => {
      if (window.location.hash !== "#reset") return;
      const st = fresh(kind);
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
  }, [kind]);

  const set = (next: Saved, top = false) => {
    save(next);
    setS(next);
    if (top) window.scrollTo(0, 0);
  };

  if (!S) return <Frame />;

  const go = (step: Step, patch: Partial<Saved> = {}) => set({ ...S, ...patch, step }, true);
  const started = S.step !== "welcome" || !!S.startedAt;
  const list = screens(S);
  const screen = S.step === "test" ? list[S.pos] : undefined;

  // Closed between sessions: only someone already partway through can carry on.
  if (!open && !started) {
    return (
      <Frame>
        <Eyebrow>Starting Point Check</Eyebrow>
        <h1 className="mt-4 text-[40px] leading-[1.04] text-foreground md:text-[52px]">Closed for now.</h1>
        <p className="mt-5 max-w-[34em] text-[17px] leading-relaxed text-muted-foreground">{kind === "end" ? "It opens in our last class of the session. Use the same link again then." : "It opens during our first class. Use the same link again then."}</p>
      </Frame>
    );
  }

  return (
    <Frame label={screen ? sectionName(S, sectionOf(screen)) : S.step === "done" ? "Complete" : undefined} footer={S.step !== "test"}>
      <div key={`${S.step}-${S.pos}`} className="dg-in">
        {S.step === "about" ? (
          <About S={S} set={set} go={go} />
        ) : S.step === "test" && screen ? (
          <>
            <Progress S={S} list={list} />
            <TestScreen S={S} list={list} screen={screen} set={set} go={go} />
          </>
        ) : S.step === "done" ? (
          <Done S={S} set={set} />
        ) : (
          <Welcome S={S} go={go} />
        )}
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------------------ */
/* Frame: the site's glass header, backdrop and footer                  */
/* ------------------------------------------------------------------ */
function Frame({ children, label, footer = true }: { children?: ReactNode; label?: string; footer?: boolean }) {
  return (
    <div className="landing relative isolate min-h-dvh">
      <div className="print:hidden">
        <Backdrop />
      </div>
      <header className="print:hidden sticky top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="glass-bar mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 rounded-full pl-5 pr-5 sm:h-[72px] sm:pl-7 sm:pr-7">
          <Link href="/" className={`flex shrink-0 items-center rounded-lg ${ring}`} aria-label="Hamza Teaches home">
            <Logo className="h-10 sm:h-12" />
          </Link>
          <span className="min-w-0 truncate text-[14px] font-medium text-muted-foreground">{label ?? "Starting Point Check"}</span>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-2xl px-5 pb-28 pt-10 md:pt-16" aria-live="polite">
        {children}
      </main>
      {footer && (
        <div className="print:hidden">
          <Footer />
        </div>
      )}
      <style>{`
        .dg-in { animation: dg-in .6s cubic-bezier(.16,1,.3,1) both; }
        @keyframes dg-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .dg-in { animation: none; } }
        /* Public pages pin every border to one colour (globals.css), above
           Tailwind's border classes; these gold edges need to beat that. */
        .landing .dg-bgold { border-color: #fbc159; }
        .landing .dg-bgoldsoft { border-color: rgba(251,193,89,.3); }
        .landing .dg-blgold { border-left-color: #fbc159; }
        .landing .dg-hgold:hover { border-color: rgba(251,193,89,.3); }
        .landing .dg-fgold:focus { border-color: #fbc159; }
        /* Save as PDF: dark ink on white paper. */
        @media print {
          .landing { background: #fff !important; }
          .landing * { color: #1b1e21 !important; background: transparent !important; border-color: #d9d9d9 !important; box-shadow: none !important; }
          .landing .text-gold { color: #8a5a0c !important; }
          .landing main { padding-top: 0 !important; }
          .dg-in { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">{children}</p>;
}

/** Thin line icons, one per subject. */
function SubjectIcon({ sub, className = "h-6 w-6" }: { sub: SubjectKey; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      {sub === "Accounting" ? (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2.5" {...p} />
          <path d="M12 3v18M7.5 8h2M7.5 12h2M14.5 8h2M14.5 12h2M7.5 16h9" {...p} />
        </>
      ) : sub === "Business" ? (
        <>
          <rect x="3" y="7" width="18" height="13" rx="2.5" {...p} />
          <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18M11 12.5v2h2v-2" {...p} />
        </>
      ) : (
        <>
          <path d="M4 20h16" {...p} />
          <path d="M4 16l5-5 4 3 7-8" {...p} />
          <path d="M15 6h5v5" {...p} />
        </>
      )}
    </svg>
  );
}

function sectionName(S: State, sec: Section) {
  if (sec === "profile") return "How you learn";
  if (sec === "core") return "Core skills";
  const t = trackOf(S, sec);
  return t ? trackTitle(t) : "";
}

/* ------------------------------------------------------------------ */
/* Welcome and the form                                                 */
/* ------------------------------------------------------------------ */
type Go = (step: Step, patch?: Partial<Saved>) => void;
type SetS = (next: Saved, top?: boolean) => void;

function Welcome({ S, go }: { S: State; go: Go }) {
  const resume = !!S.startedAt && S.step === "welcome";
  const end = S.kind === "end";
  return (
    <div>
      <Eyebrow>{end ? "End of session check" : "Starting Point Check"}</Eyebrow>
      <h1 className="mt-4 text-[42px] leading-[1.02] text-foreground md:text-[60px]">{end ? "See how far you’ve come." : "Let’s find your starting point."}</h1>
      <p className="mt-6 max-w-[34em] text-[18px] leading-relaxed text-muted-foreground">
        {end
          ? "The same check you took on day one. Answer the way you would today, and I will compare the two."
          : "Before I teach you anything, I want to know how you learn, what you already know, and where the gaps are. Answer honestly and your classes start exactly where you are."}
      </p>

      <ol className={`mt-10 ${card} divide-y divide-hairline`}>
        {[
          ["How you learn", "How you study, revise and handle exams.", "12 questions"],
          ["Core skills", "The numbers and reading every subject is built on.", "8 or 9 questions"],
          ["Your subjects", "Whether you can follow lesson one, plus a short preview.", "9 to 12 questions each, plus one written answer"],
        ].map(([t, d, m], i) => (
          <li key={t} className="flex items-start gap-4 px-5 py-5 sm:px-6">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border dg-bgoldsoft text-[14px] font-semibold text-gold">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold text-foreground">{t}</span>
              <span className="mt-0.5 block text-[15px] leading-snug text-muted-foreground">{d}</span>
              <span className="mt-1.5 block text-[13px] text-faint">{m}</span>
            </span>
          </li>
        ))}
      </ol>

      <ul className="mt-10 grid gap-5">
        {[
          ["Not a test for marks.", "Nobody passes or fails. It only shows what to teach first."],
          ["Closed book.", "No Google, no AI, no help. A calculator, pen and paper are fine. Your own guess tells me more than someone else’s right answer."],
          ["“I don’t know” is a good answer.", "It tells me more than a wild guess."],
        ].map(([b, d]) => (
          <li key={b} className="border-l-2 dg-bgoldsoft pl-4">
            <span className="block text-[16px] font-semibold text-foreground">{b}</span>
            <span className="block text-[15px] leading-relaxed text-muted-foreground">{d}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <button className={btn} onClick={() => go(resume ? "test" : "about")}>
          {resume ? "Continue where you left off" : "Start"}
        </button>
        {resume && (
          <button className={`text-[15px] text-muted-foreground underline underline-offset-4 hover:text-foreground ${ring}`} onClick={() => go("about", fresh(S.kind))}>
            Start again
          </button>
        )}
      </div>
    </div>
  );
}

function About({ S, set, go }: { S: State; set: SetS; go: Go }) {
  const [err, setErr] = useState("");
  const [before] = useState(() => S.tracks.map(trackId).join());
  const mins = minutes(S.tracks);
  const has = (sub: SubjectKey, l: LevelKey) => S.tracks.some((t) => t.sub === sub && t.level === l);

  function toggle(sub: SubjectKey, l: LevelKey) {
    let ts = S.tracks.filter((t) => !(t.sub === sub && t.level === l));
    if (!has(sub, l)) {
      // O Level/IGCSE and A Level don't mix in one subject; AS and A2 can.
      ts = ts.filter((t) => t.sub !== sub || (l !== "igcse" && t.level !== "igcse"));
      ts.push({ sub, level: l });
    }
    set({ ...S, tracks: sortTracks(ts) });
  }

  function start() {
    const miss: string[] = [];
    if (!S.name.trim()) miss.push("your full name");
    if (!S.tracks.length) miss.push("at least one subject and level");
    if (miss.length) return setErr(`Add ${miss.join(" and ")} to continue.`);
    // Different subjects or levels mean different questions: start the sections again.
    const changed = before && before !== S.tracks.map(trackId).join();
    go("test", { pos: changed ? 0 : S.pos, startedAt: S.startedAt ?? new Date().toISOString(), ...(changed ? { ans: {}, written: {} } : {}) });
  }

  return (
    <div>
      <Eyebrow>Before you begin</Eyebrow>
      <h1 className="mt-4 text-[38px] leading-[1.04] text-foreground md:text-[48px]">First, the basics.</h1>

      <div className="mt-10">
        <label htmlFor="f-name" className="block text-[15px] font-semibold text-foreground">
          Full name
        </label>
        <input
          id="f-name"
          type="text"
          autoComplete="name"
          value={S.name}
          onChange={(e) => set({ ...S, name: e.target.value })}
          className="mt-2 h-14 w-full rounded-[16px] border border-hairline-strong bg-card px-4 text-[17px] text-foreground outline-none transition-colors placeholder:text-faint dg-fgold"
        />
      </div>

      <div className="mt-10">
        <p className="text-[15px] font-semibold text-foreground">Your subjects and levels</p>
        <p className="mt-1 text-[14px] text-faint">Pick a level for each subject you take with me. Taking AS and A2 together? Pick both.</p>
        <ul className={`mt-4 ${card} divide-y divide-hairline`}>
          {SUBJECTS.map((sub) => {
            const on = S.tracks.some((t) => t.sub === sub);
            return (
              <li key={sub} className="px-5 py-4 sm:px-6">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-[12px] ${on ? "bg-gold-tint text-gold" : "bg-white/5 text-muted-foreground"}`}>
                    <SubjectIcon sub={sub} className="h-5 w-5" />
                  </span>
                  <span className="text-[17px] font-semibold text-foreground">{sub}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`${sub} level`}>
                  {(["igcse", "as", "a2"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={has(sub, l)}
                      onClick={() => toggle(sub, l)}
                      className={`min-h-11 rounded-full border px-4 text-[15px] font-medium transition-colors ${ring} ${
                        has(sub, l) ? "dg-bgold bg-gold-tint text-foreground" : "border-hairline-strong text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {LEVEL_SHORT[l]}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {mins > 0 && (
        <p className="mt-6 text-[15px] text-muted-foreground">
          There is no time limit, so take your time. Your answers save on this device as you go.
        </p>
      )}
      <p className="mt-4 min-h-5 text-[14px] text-error-x" role="alert">
        {err}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button className={btn} onClick={start}>
          Begin
        </button>
        <button className={ghost} onClick={() => go("welcome")}>
          Back
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The test                                                              */
/* ------------------------------------------------------------------ */
function Progress({ S, list }: { S: State; list: Screen[] }) {
  const secs: Section[] = ["profile", "core", ...S.tracks.map(trackId)];
  const cur = sectionOf(list[S.pos]);
  return (
    <div className="mb-10 flex gap-1.5" aria-hidden>
      {secs.map((sec) => {
        const idx = list.map((x, i) => [x, i] as const).filter(([x]) => sectionOf(x) === sec && x.kind !== "intro");
        const done = idx.filter(([, i]) => i < S.pos).length;
        const pct = idx.length ? (done / idx.length) * 100 : 0;
        return (
          <div key={sec} className={`h-1 flex-1 overflow-hidden rounded-full ${sec === cur ? "bg-white/20" : "bg-white/10"}`}>
            <div className="h-full rounded-full bg-gold transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function TestScreen({ S, list, screen, set, go }: { S: Saved; list: Screen[]; screen: Screen; set: SetS; go: Go }) {
  const at = (pos: number) => go(pos < 0 ? "about" : "test", { pos: Math.max(0, pos) });
  const back = (
    <button className={ghost} onClick={() => at(S.pos - 1)}>
      Back
    </button>
  );
  function next() {
    if (S.pos < list.length - 1) return at(S.pos + 1);
    set({ ...S, finishedAt: new Date().toISOString(), step: "done", saved: false }, true);
  }
  if (screen.kind === "intro") return <Intro S={S} sec={screen.sec} onStart={next} back={back} />;
  if (screen.kind === "profile") return <ProfileQuestion S={S} i={screen.i} set={set} next={next} back={back} />;
  if (screen.kind === "written") return <Written S={S} sec={screen.sec} last={S.pos === list.length - 1} set={set} next={next} back={back} />;
  return <Mcq S={S} sec={screen.sec} i={screen.i} set={set} next={next} back={back} />;
}

function Actions({ children, dock }: { children: ReactNode; dock?: boolean }) {
  return (
    <div
      className={`mt-10 flex flex-wrap items-center gap-3 ${
        dock ? "max-sm:sticky max-sm:bottom-0 max-sm:-mx-5 max-sm:mt-8 max-sm:flex-nowrap max-sm:bg-gradient-to-t max-sm:from-band-a max-sm:from-70% max-sm:to-transparent max-sm:px-5 max-sm:pb-[max(16px,env(safe-area-inset-bottom))] max-sm:pt-6 max-sm:[&>*:first-child]:flex-1" : ""
      }`}
    >
      {children}
    </div>
  );
}

function Intro({ S, sec, onStart, back }: { S: State; sec: Section; onStart: () => void; back: ReactNode }) {
  let eyebrow = "";
  let title = "";
  let body = "";
  let meta = "";
  let icon: ReactNode = null;
  if (sec === "profile") {
    eyebrow = "Part 1 of 3";
    title = "How you learn.";
    body = `${PROFILE.length} quick questions about how you study. There are no right answers. Pick what you actually do, not what you think you should do.`;
    meta = "No time limit.";
  } else if (sec === "core") {
    eyebrow = "Part 2 of 3";
    title = "Core skills.";
    body = "Numbers and reading: the skills Accounting, Business and Economics are all built on. After each answer, tell me how sure you are.";
    meta = `${CORE[coreLevel(S.tracks)!].length} questions. A calculator is fine.`;
  } else {
    const t = trackOf(S, sec)!;
    const k = S.tracks.findIndex((x) => trackId(x) === sec);
    const n = questionsFor(S, sec).length;
    eyebrow = `Part 3 of 3${S.tracks.length > 1 ? `, subject ${k + 1} of ${S.tracks.length}` : ""}`;
    title = `${t.sub}, ${LEVEL_SHORT[t.level]}.`;
    body =
      t.level === "a2"
        ? `These questions check the AS ${t.sub} that A2 builds on. The last two are a preview of A2 topics: guess freely, or choose “I don’t know”.`
        : t.level === "as"
          ? `No A Level ${t.sub} needed yet. These questions check whether you can follow lesson one, using everyday thinking. The last three preview what you will learn first: guess freely, or choose “I don’t know”.`
          : `No ${t.sub} experience needed. These questions check whether you can follow lesson one, using everyday thinking. The last three preview what you will learn first: guess freely, or choose “I don’t know”.`;
    meta = `${n} questions and one short written answer.`;
    icon = (
      <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-[16px] bg-gold-tint text-gold">
        <SubjectIcon sub={t.sub} className="h-7 w-7" />
      </span>
    );
  }
  return (
    <div>
      {icon}
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-4 text-[38px] leading-[1.04] text-foreground md:text-[52px]">{title}</h1>
      <p className="mt-5 max-w-[34em] text-[18px] leading-relaxed text-muted-foreground">{body}</p>
      <p className="mt-5 text-[15px] text-faint">{meta}</p>
      <Actions>
        <button className={btn} onClick={onStart}>
          Begin
        </button>
        {back}
      </Actions>
    </div>
  );
}

function QHead({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <Eyebrow>{left}</Eyebrow>
      <span className="shrink-0 text-[14px] tabular-nums text-faint">{right}</span>
    </div>
  );
}

const optCls = (on: boolean) =>
  `flex w-full items-center gap-4 rounded-[16px] border px-4 py-4 text-left text-[17px] leading-snug transition-colors ${ring} ${
    on ? "dg-bgold bg-gold-tint text-foreground" : "border-hairline bg-card text-body hover:border-hairline-strong"
  }`;

function ProfileQuestion({ S, i, set, next, back }: { S: Saved; i: number; set: SetS; next: () => void; back: ReactNode }) {
  const p = PROFILE[i];
  const chosen = S.profile[p.id];
  function pick(k: number) {
    const picked = { ...S, profile: { ...S.profile, [p.id]: k } };
    set(picked);
    // A short pause so the choice is seen, then on to the next question.
    setTimeout(() => set({ ...picked, pos: picked.pos + 1 }, true), 240);
  }
  return (
    <div>
      <QHead left="How you learn" right={`${i + 1} of ${PROFILE.length}`} />
      <h2 className="mt-4 text-[26px] font-bold leading-[1.2] tracking-tight text-foreground md:text-[30px]">{p.q}</h2>
      <div className="mt-8 grid gap-2.5" role="group" aria-label="Answers">
        {p.o.map((o, k) => (
          <button key={k} className={optCls(chosen === k)} aria-pressed={chosen === k} onClick={() => pick(k)}>
            <span className={`relative h-5 w-5 shrink-0 rounded-full border ${chosen === k ? "dg-bgold" : "border-hairline-strong"}`}>
              {chosen === k && <span className="absolute inset-[4px] rounded-full bg-gold" />}
            </span>
            <span>{o.t}</span>
          </button>
        ))}
      </div>
      <Actions>
        {chosen != null && (
          <button className={btn} onClick={next}>
            Next
          </button>
        )}
        {back}
      </Actions>
    </div>
  );
}

function Mcq({ S, sec, i, set, next, back }: { S: Saved; sec: string; i: number; set: SetS; next: () => void; back: ReactNode }) {
  const list = questionsFor(S, sec);
  const q = list[i];
  const key = `${sec}:${i}`;
  const a = S.ans[key] ?? { c: null };
  const ready = a.c === -1 || (a.c != null && !!a.s);
  const pick = (c: number) => set({ ...S, ans: { ...S.ans, [key]: c === -1 ? { c: -1 } : { c, s: a.c === c ? a.s : null } } });
  const sure = (v: Sure) => set({ ...S, ans: { ...S.ans, [key]: { ...a, s: v } } });

  return (
    <div>
      <QHead left={sectionName(S, sec)} right={`${i + 1} of ${list.length}`} />
      {q.area === "P" && <span className="mt-4 inline-block rounded-full bg-gold-tint px-3 py-1 text-[13px] font-medium text-gold">Preview question. Guess freely.</span>}
      {q.context && <div className={`mt-5 ${card} border-l-2 dg-blgold px-5 py-4 text-[16px] leading-relaxed text-body`}>{q.context}</div>}
      <h2 className="mt-5 text-[24px] font-bold leading-[1.22] tracking-tight text-foreground md:text-[28px]">{q.q}</h2>
      <div className="mt-7 grid gap-2.5" role="group" aria-label="Answers">
        {q.o.map((o, k) => (
          <button key={k} className={optCls(a.c === k)} aria-pressed={a.c === k} onClick={() => pick(k)}>
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold ${
                a.c === k ? "bg-gold text-[#1b1e21]" : "border border-hairline-strong text-faint"
              }`}
            >
              {"ABCD"[k]}
            </span>
            <span>{o}</span>
          </button>
        ))}
        <button
          className={`flex w-full items-center gap-4 rounded-[16px] border border-dashed px-4 py-4 text-left text-[17px] transition-colors ${ring} ${
            a.c === -1 ? "dg-bgold bg-gold-tint text-foreground" : "border-hairline-strong text-muted-foreground hover:text-foreground"
          }`}
          aria-pressed={a.c === -1}
          onClick={() => pick(-1)}
        >
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-semibold ${a.c === -1 ? "bg-gold text-[#1b1e21]" : "border border-hairline-strong text-faint"}`}>?</span>
          <span>I don’t know</span>
        </button>
      </div>
      {a.c != null && a.c !== -1 && (
        <div className="mt-8">
          <p className="text-[15px] font-semibold text-foreground">How sure are you?</p>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-white/[0.06] p-1" role="group" aria-label="How sure are you?">
            {(
              [
                ["g", "Guessed"],
                ["f", "Fairly sure"],
                ["c", "Certain"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                aria-pressed={a.s === v}
                onClick={() => sure(v)}
                className={`min-h-11 rounded-full text-[15px] font-medium transition-colors ${ring} ${a.s === v ? "bg-gold text-[#1b1e21]" : "text-muted-foreground hover:text-foreground"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      <Actions dock>
        <button className={btn} disabled={!ready} onClick={next}>
          Next
        </button>
        {back}
      </Actions>
    </div>
  );
}

function Written({ S, sec, last, set, next, back }: { S: Saved; sec: string; last: boolean; set: SetS; next: () => void; back: ReactNode }) {
  const t = trackOf(S, sec)!;
  const prompt = BANK[t.level][t.sub].w;
  return (
    <div>
      <QHead left={trackTitle(t)} right="Written answer" />
      <h2 className="mt-4 text-[24px] font-bold leading-[1.22] tracking-tight text-foreground md:text-[28px]">{prompt}</h2>
      <p className="mt-4 text-[15px] leading-relaxed text-faint">Write it the way you would in an exam. A few lines is enough. I mark this one myself.</p>
      <label htmlFor="w" className="mt-8 block text-[15px] font-semibold text-foreground">
        Your answer
      </label>
      <textarea
        id="w"
        value={S.written[sec] ?? ""}
        onChange={(e) => set({ ...S, written: { ...S.written, [sec]: e.target.value } })}
        placeholder="Write what you think. A rough answer is better than a blank one."
        className="mt-2 min-h-[200px] w-full resize-y rounded-[16px] border border-hairline-strong bg-card px-4 py-3.5 text-[17px] leading-relaxed text-foreground outline-none transition-colors dg-fgold"
      />
      <Actions>
        <button className={btn} onClick={next}>
          {last ? "Finish the check" : "Next"}
        </button>
        {back}
      </Actions>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Results                                                               */
/* ------------------------------------------------------------------ */
function Done({ S, set }: { S: Saved; set: SetS }) {
  const nm = S.name.trim().split(/\s+/)[0];
  const r = results(S);
  const [status, setStatus] = useState<"saving" | "saved" | "failed">(S.saved ? "saved" : "saving");
  const sent = useRef(false);

  async function send() {
    setStatus("saving");
    const ok = await submitResult(payload(S));
    setStatus(ok ? "saved" : "failed");
    if (ok) set({ ...S, saved: true });
  }
  useEffect(() => {
    if (S.saved) return;
    const id = setTimeout(() => {
      if (sent.current) return;
      sent.current = true;
      void send();
    }, 0);
    return () => clearTimeout(id);
    // Sends once when the results first show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!r) return null;
  const end = S.kind === "end";
  return (
    <div>
      <Eyebrow>{end ? "End of session check" : "Submitted"}</Eyebrow>
      <h1 className="mt-4 text-[42px] leading-[1.02] text-foreground md:text-[56px]">All done{nm ? `, ${nm}` : ""}.</h1>
      <p className="mt-5 max-w-[34em] text-[18px] leading-relaxed text-muted-foreground">
        Thank you for answering honestly. Here is a first look. I will go through every answer and send you your full report.
      </p>

      <ul className={`mt-10 ${card} divide-y divide-hairline`}>
        {r.tracks.map((sum) => {
          const t = trackOf(S, sum.sec)!;
          return (
            <li key={sum.sec} className="flex items-center gap-4 px-5 py-4 sm:px-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-gold-tint text-gold">
                <SubjectIcon sub={t.sub} className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[17px] font-semibold text-foreground">{sum.title}</span>
                <span className="block text-[15px] text-muted-foreground">{sum.readyLabel}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 rounded-[20px] border border-hairline bg-band-c px-6 py-6">
        <p className="text-[17px] leading-relaxed text-body">
          {end ? (
            <>
              I will put this next to your day one results and send you your <span className="font-semibold text-gold">before and after</span>.
            </>
          ) : (
            <>
              Your full <span className="font-semibold text-gold">Starting Point Report</span>, with exactly where to start, comes from me.
            </>
          )}
        </p>
        <p className="mt-4 text-[14px] text-faint" role="status">
          {status === "saving" ? "Sending your answers…" : status === "saved" ? "Sent. You can close this page." : "Your answers didn’t send. Check your connection."}
        </p>
        {status === "failed" && (
          <button className={`${btn} mt-4`} onClick={() => void send()}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

