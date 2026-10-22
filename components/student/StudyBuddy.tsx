"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Student } from "@/types";
import type { Database } from "@/lib/data/seed";
import { useAuth } from "@/lib/auth-context";
import { FOCUS_MODES, MIN_COUNTED, currentStats, quoteFor, recordFocus, type FocusMode } from "@/lib/focus";
import { studentSubjects } from "@/components/student/Welcome";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Home card: this week's study time against the student's goal, the streak,
 * and a button into focus mode (a full-screen study timer).
 */
export function StudyBuddy({ db, student, nowMs }: { db: Database; student: Student; nowMs: number }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const stats = currentStats(profile.focus, nowMs);
  const goalMin = (profile.weeklyGoal ?? 5) * 60;
  const pct = Math.min(1, stats.weekMinutes / goalMin);
  const r = 22;
  const c = 2 * Math.PI * r;

  return (
    <>
      <section className="animate-fade-up flex items-center gap-4 rounded-lg border border-border bg-surface p-5">
        <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden className="shrink-0 -rotate-90">
          <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth="6" />
          {pct > 0 && <circle cx="28" cy="28" r={r} fill="none" stroke="var(--color-brand)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />}
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-3">Study timer</p>
          <p className="mt-1 text-sm text-ink-2">
            <span className="font-semibold text-ink">{fmt(stats.weekMinutes)}</span> of {profile.weeklyGoal ?? 5} h this week
            {stats.streak > 1 && <span className="text-brand"> · {stats.streak}-day streak</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand transition hover:brightness-110 active:scale-[0.98]"
        >
          Focus <Icon.ChevronRight className="h-4 w-4" />
        </button>
      </section>
      {/* On <body>, so no animated parent can clip the full-screen timer. */}
      {open && createPortal(<FocusMode subjects={studentSubjects(db, student)} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

const fmt = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ""}`.trim());

type Phase = "setup" | "focus" | "rest" | "done";

/** Full-screen timer: pick a subject and length, then nothing else on screen. */
function FocusMode({ subjects, onClose }: { subjects: string[]; onClose: () => void }) {
  const { profile, updateProfile } = useAuth();
  const [subject, setSubject] = useState(subjects[0] ?? "Study");
  const [mode, setMode] = useState<FocusMode>(FOCUS_MODES[0]);
  const [phase, setPhase] = useState<Phase>("setup");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState<Sound>("off");
  const [quote] = useState(() => quoteFor(Math.floor(Date.now() / 60_000)));
  const startedAt = useRef<number | null>(null);
  const logged = useRef(0);

  const left = pausedLeft ?? (endsAt ? Math.max(0, endsAt - now) : 0);
  const total = (phase === "rest" ? mode.rest : mode.focus) * 60_000;

  // Tick, keep the screen awake while timing, and stop sound on the way out.
  useEffect(() => {
    if (phase !== "focus" && phase !== "rest") return;
    const t = setInterval(() => setNow(Date.now()), 250);
    let lock: { release: () => Promise<void> } | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      clearInterval(t);
      void lock?.release().catch(() => {});
    };
  }, [phase]);
  useEffect(() => {
    if (phase === "focus" && sound !== "off") return startSound(sound);
  }, [phase, sound]);

  /** Count the minutes actually focused (once per session). */
  const logFocus = (minutes: number) => {
    const m = Math.floor(minutes) - logged.current;
    if (m <= 0 || logged.current + m < MIN_COUNTED) return;
    logged.current += m;
    updateProfile({ focus: recordFocus(profile.focus, m, subject, Date.now()) });
  };

  // Phase end: focus → chime, log, rest; rest → done.
  useEffect(() => {
    if (pausedLeft != null || !endsAt || now < endsAt) return;
    const t = setTimeout(() => {
      chime();
      if (phase === "focus") {
        logFocus(mode.focus);
        setPhase("rest");
        setEndsAt(Date.now() + mode.rest * 60_000);
      } else if (phase === "rest") {
        setPhase("done");
        setEndsAt(null);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, endsAt, pausedLeft, phase]);

  const start = () => {
    logged.current = 0;
    startedAt.current = Date.now();
    setPhase("focus");
    setPausedLeft(null);
    setEndsAt(Date.now() + mode.focus * 60_000);
    setNow(Date.now());
  };
  const close = () => {
    if (phase === "focus" && startedAt.current) logFocus((mode.focus * 60_000 - left) / 60_000);
    onClose();
  };
  const togglePause = () => {
    if (pausedLeft != null) {
      setEndsAt(Date.now() + pausedLeft);
      setPausedLeft(null);
    } else setPausedLeft(left);
  };

  const mm = String(Math.floor(left / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");
  const R = 120;
  const C = 2 * Math.PI * R;
  const done = phase === "focus" || phase === "rest" ? 1 - left / total : 0;
  const chip = (on: boolean) =>
    cn("h-11 rounded-full border px-4 text-sm font-semibold transition-colors", on ? "border-brand bg-brand text-on-brand" : "border-border-strong text-ink-2 hover:text-ink");

  return (
    <div role="dialog" aria-modal="true" aria-label="Focus mode" className="fixed inset-0 z-[70] overflow-y-auto bg-[#141618]">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center px-6 py-8 text-center">
        <div className="flex w-full items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-brand">Focus mode</p>
          <button type="button" onClick={close} className="h-10 px-2 text-sm font-semibold text-ink-3 hover:text-ink">
            {phase === "setup" || phase === "done" ? "Close" : "End session"}
          </button>
        </div>

        {phase === "setup" ? (
          <div className="mt-10 w-full space-y-7 text-left">
            <h2 className="text-center text-[1.8rem] font-extrabold tracking-tight text-ink">What are you studying?</h2>
            <div className="flex flex-wrap justify-center gap-2">
              {[...subjects, "Something else"].map((s) => (
                <button key={s} type="button" aria-pressed={subject === s} onClick={() => setSubject(s)} className={chip(subject === s)}>
                  {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {FOCUS_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={mode.id === m.id}
                  onClick={() => setMode(m)}
                  className={cn("rounded-2xl border p-3 text-center transition-colors", mode.id === m.id ? "border-brand bg-brand/10" : "border-border-strong hover:border-ink-3")}
                >
                  <span className="block text-xl font-extrabold text-ink">{m.focus}</span>
                  <span className="block text-xs text-ink-3">min · {m.label}</span>
                </button>
              ))}
            </div>
            <SoundPicker sound={sound} setSound={setSound} />
            <button type="button" onClick={start} className="h-14 w-full rounded-full bg-brand text-base font-semibold text-on-brand transition hover:brightness-110">
              Start {mode.focus} minutes
            </button>
          </div>
        ) : phase === "done" ? (
          <div className="mt-24 space-y-5">
            <p className="text-5xl">✓</p>
            <h2 className="text-[1.8rem] font-extrabold tracking-tight text-ink">Session done.</h2>
            <p className="text-ink-2">{mode.focus} minutes of {subject} added to your week.</p>
            <div className="flex justify-center gap-2">
              <button type="button" onClick={start} className="h-12 rounded-full bg-brand px-6 text-sm font-semibold text-on-brand">
                Another one
              </button>
              <button type="button" onClick={onClose} className="h-12 rounded-full border border-border-strong px-6 text-sm font-semibold text-ink">
                I&apos;m done
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-10 text-sm font-semibold text-ink-2">{phase === "rest" ? "Break. Stand up, drink water." : subject}</p>
            <div className="relative mt-6">
              <svg width="272" height="272" viewBox="0 0 272 272" className="-rotate-90" aria-hidden>
                <circle cx="136" cy="136" r={R} fill="none" stroke="#22262B" strokeWidth="10" />
                <circle
                  cx="136"
                  cy="136"
                  r={R}
                  fill="none"
                  stroke={phase === "rest" ? "#7FD1A6" : "var(--color-brand)"}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${C * done} ${C}`}
                  style={{ transition: "stroke-dasharray 0.25s linear" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-6xl font-extrabold tabular-nums tracking-tight text-ink" aria-live="off">
                  {mm}:{ss}
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.25em] text-ink-3">{pausedLeft != null ? "Paused" : phase === "rest" ? "Break" : "Focus"}</p>
              </div>
            </div>
            <div className="mt-8 flex gap-2">
              <button type="button" onClick={togglePause} className="h-12 rounded-full border border-border-strong px-6 text-sm font-semibold text-ink">
                {pausedLeft != null ? "Resume" : "Pause"}
              </button>
              {phase === "rest" && (
                <button type="button" onClick={start} className="h-12 rounded-full bg-brand px-6 text-sm font-semibold text-on-brand">
                  Skip break
                </button>
              )}
            </div>
            {phase === "focus" && <SoundPicker sound={sound} setSound={setSound} compact />}
          </>
        )}

        <figure className="mt-auto pt-12 text-ink-3">
          <blockquote className="font-hand text-xl leading-snug text-ink-2">“{quote.text}”</blockquote>
          {quote.by && <figcaption className="mt-1.5 text-xs">{quote.by}</figcaption>}
        </figure>
      </div>
    </div>
  );
}

// ---- Background sound, made in the browser (no files, nothing to licence) ----

type Sound = "off" | "rain" | "brown";

function SoundPicker({ sound, setSound, compact }: { sound: Sound; setSound: (s: Sound) => void; compact?: boolean }) {
  const opts: Array<{ id: Sound; label: string }> = [
    { id: "off", label: "Silence" },
    { id: "rain", label: "Rain" },
    { id: "brown", label: "Deep hum" },
  ];
  return (
    <div className={cn("flex justify-center gap-1.5", compact && "mt-6")} role="radiogroup" aria-label="Background sound">
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={sound === o.id}
          onClick={() => setSound(o.id)}
          className={cn("h-10 rounded-full px-4 text-xs font-semibold transition-colors", sound === o.id ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Starts a looping noise; returns a stop function. */
function startSound(kind: Exclude<Sound, "off">): () => void {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return () => {};
  const ctx = new Ctx();
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    // Brown noise: a slow random walk (a soft, deep hum); rain: brighter noise.
    last = kind === "brown" ? (last + 0.02 * white) / 1.02 : white;
    d[i] = kind === "brown" ? last * 3.5 : white;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = kind === "rain" ? 1400 : 500;
  const gain = ctx.createGain();
  gain.gain.value = kind === "rain" ? 0.08 : 0.25;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
  return () => {
    try {
      src.stop();
    } catch {}
    void ctx.close();
  };
}

/** A soft two-note chime at the end of a session or break. */
function chime() {
  try {
    navigator.vibrate?.([120, 80, 120]);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 1);
    });
    setTimeout(() => void ctx.close(), 1800);
  } catch {}
}
