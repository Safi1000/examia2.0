"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { FOCUS_MODES, STUDY_NAME, quoteFor, recordFocus, type FocusMode as Mode } from "@/lib/focus";
import { clearRunning, loadRunning, minutesToAdd, ownRunning, saveRunning } from "@/components/student/focus-session";
import { useBackToClose } from "@/components/student/useBackToClose";
import { cn } from "@/lib/cn";
import { sceneFor, reviewDone, topicKey } from "@/lib/groundwork";
import { currentStats } from "@/lib/focus";
import { pkDate, addDays } from "@/lib/timetable";
import { StudyRoomStrip, setStudying } from "@/components/student/StudyRoom";

/**
 * The full-screen study timer. Loaded only when a student opens it, so Home
 * and the rest of the portal don't carry its weight (sounds are made in the
 * browser: no audio files to download).
 */
export interface Mission {
  subject: string;
  topic: string;
  noteHref?: string;
  /** Suggested length in minutes (picks the closest session length). */
  minutes?: number;
  /** "Test prep", "Review 2 of 4"... shown above the topic. */
  tag?: string;
}

type Phase = "setup" | "focus" | "rest" | "done";

/** Full-screen timer: pick a subject and length, then nothing else on screen. */
export default function FocusMode({
  subjects,
  mission,
  onClose,
  me,
}: {
  subjects: string[];
  mission?: Mission | null;
  onClose: () => void;
  /** Shown in the live study room while the timer runs. */
  me?: { id: string; name: string; avatar?: string };
}) {
  const { updateProfile, profile } = useAuth();
  const [openedAt] = useState(() => Date.now());
  const scene = sceneFor(profile.scene, openedAt);
  const [subject, setSubject] = useState(mission?.subject ?? subjects[0] ?? "Study");
  const [mode, setMode] = useState<Mode>(
    () => (mission?.minutes ? [...FOCUS_MODES].sort((a, b) => Math.abs(a.focus - mission.minutes!) - Math.abs(b.focus - mission.minutes!))[0] : FOCUS_MODES[0]),
  );
  const [checked, setChecked] = useState<null | "got" | "shaky">(null);
  const [sessionMin, setSessionMin] = useState(0);
  const [phase, setPhase] = useState<Phase>("setup");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState<Sound>("off");
  const [quote] = useState(() => quoteFor(Math.floor(Date.now() / 60_000)));
  const startedAt = useRef<number | null>(null);
  const logged = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  // One audio context for the whole visit, made inside a tap: iPhone keeps
  // sound silent unless it was started (or woken) by the student's own tap.
  const audio = useRef<AudioContext | null>(null);

  const left = pausedLeft ?? (endsAt ? Math.max(0, endsAt - now) : 0);
  const total = (phase === "rest" ? mode.rest : mode.focus) * 60_000;
  const focusedMin = phase === "focus" ? Math.floor((total - left) / 60_000) : 0;

  // The latest session state, for the page-hide and close handlers (which run
  // outside render and would otherwise see an old copy).
  const live = useRef({ phase, subject, planned: mode.focus as number, endsAt, pausedLeft });
  useEffect(() => {
    live.current = { phase, subject, planned: mode.focus, endsAt, pausedLeft };
  });

  /** Focused time in the current stretch, in ms. */
  const doneMs = (at: number) => {
    const l = live.current;
    if (l.phase !== "focus" || startedAt.current == null) return 0;
    const remaining = l.pausedLeft ?? (l.endsAt ? Math.max(0, l.endsAt - at) : 0);
    return Math.max(0, l.planned * 60_000 - remaining);
  };

  /** Keep the running session on the phone (instant, works while the page is closing). */
  const persist = () => {
    if (live.current.phase !== "focus" || startedAt.current == null) return;
    const at = Date.now();
    saveRunning({ subject: live.current.subject, planned: live.current.planned, startedAt: startedAt.current, doneMs: doneMs(at), savedAt: at, logged: logged.current });
  };

  /** Count the minutes actually focused (each minute once). */
  const logFocus = (minutes: number, subj: string) => {
    const m = minutesToAdd(minutes * 60_000, logged.current);
    if (!m) return;
    logged.current += m;
    updateProfile((latest) => ({ focus: recordFocus(latest.focus, m, subj, Date.now()) }));
  };

  /** The session is ending here (End session, Back, leaving the page in the app): add its minutes now. */
  const flush = () => {
    if (live.current.phase === "focus" && startedAt.current != null) logFocus(doneMs(Date.now()) / 60_000, live.current.subject);
    startedAt.current = null;
    clearRunning();
  };

  /** Create or wake the audio. Only ever called from a tap. */
  const wakeAudio = () => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!audio.current || audio.current.state === "closed") audio.current = new Ctx();
      if (audio.current.state !== "running") void audio.current.resume().catch(() => {});
    } catch {}
  };

  // Tick, keep the screen awake while timing, and stop sound on the way out.
  useEffect(() => {
    if (phase !== "focus" && phase !== "rest") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    let lock: { release: () => Promise<void> } | null = null;
    const ask = () =>
      (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
        ?.request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    void ask();
    // The phone drops the lock when they switch away; ask again on return.
    const back = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void ask();
      }
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", back);
      void lock?.release().catch(() => {});
    };
  }, [phase]);
  useEffect(() => {
    // Sound stops while paused, and starts again on Resume.
    if (phase === "focus" && sound !== "off" && pausedLeft == null && audio.current) return startSound(audio.current, sound);
  }, [phase, sound, pausedLeft]);

  // Save the session on the phone each minute and on every pause or resume.
  useEffect(() => {
    persist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, focusedMin, pausedLeft, endsAt]);

  // Leaving the page (app switched away, tab closed, Android Back past the
  // portal): write the latest minutes to the phone. The next visit adds them
  // if this session never comes back.
  useEffect(() => {
    const onHide = () => persist();
    const onVis = () => {
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closed from outside (a link, the page changing): count what was done.
  // Also moves focus into the timer as it opens.
  useEffect(() => {
    panel.current?.focus();
    const ctx = audio;
    return () => {
      flush();
      ownRunning(false);
      void ctx.current?.close().catch(() => {});
      ctx.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase end: focus → chime, log, rest; rest → done.
  useEffect(() => {
    if (pausedLeft != null || !endsAt || now < endsAt) return;
    const t = setTimeout(() => {
      chime(audio.current);
      if (phase === "focus") {
        setSessionMin((m) => m + mode.focus);
        logFocus(mode.focus, subject);
        startedAt.current = null;
        clearRunning();
        setPhase("rest");
        setEndsAt(Date.now() + mode.rest * 60_000);
      } else if (phase === "rest") {
        setPhase("done");
        setEndsAt(null);
        setStudying(null);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, endsAt, pausedLeft, phase]);

  const start = () => {
    wakeAudio();
    // A session from an earlier visit that was cut off: add its minutes
    // before this one takes its place on the phone.
    const old = loadRunning();
    if (old && old.startedAt !== startedAt.current) {
      const m = minutesToAdd(old.doneMs, old.logged);
      if (m > 0) updateProfile((latest) => ({ focus: recordFocus(latest.focus, m, old.subject, Date.now()) }));
    }
    const at = Date.now();
    logged.current = 0;
    startedAt.current = at;
    ownRunning(true);
    saveRunning({ subject, planned: mode.focus, startedAt: at, doneMs: 0, savedAt: at, logged: 0 });
    setPhase("focus");
    setPausedLeft(null);
    setEndsAt(at + mode.focus * 60_000);
    setNow(at);
    if (me) setStudying({ ...me, name: me.name.split(" ")[0], subject, since: at });
  };
  const close = () => {
    flush();
    setStudying(null);
    onClose();
  };
  // Leaving the room however the timer closes (route change, unmount).
  useEffect(() => () => setStudying(null), []);
  // The phone's Back button ends the session here, like End session.
  useBackToClose(close);
  const togglePause = () => {
    if (pausedLeft != null) {
      wakeAudio();
      setEndsAt(Date.now() + pausedLeft);
      setPausedLeft(null);
    } else setPausedLeft(left);
  };
  const pickSound = (s: Sound) => {
    if (s !== "off") wakeAudio();
    setSound(s);
  };

  const mm = String(Math.floor(left / 60_000)).padStart(2, "0");
  const ss = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");
  const R = 120;
  const C = 2 * Math.PI * R;
  const done = phase === "focus" || phase === "rest" ? 1 - left / total : 0;
  const chip = (on: boolean) =>
    cn("h-11 rounded-full border px-4 text-sm font-semibold transition-colors", on ? "border-brand bg-brand text-on-brand" : "border-border-strong text-ink-2 hover:text-ink");

  return (
    <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={STUDY_NAME} className="focus-dark fixed inset-0 z-[70] overflow-y-auto bg-[#101214] outline-none">
      {/* Their Groundwork scene, dimmed, so the timer feels like their own quiet room. */}
      <div className="pointer-events-none fixed inset-0" aria-hidden style={{ background: scene.sky }}>
        {scene.photo && (
          <picture>
            <source media="(min-width: 768px)" srcSet={`/wallpapers/${scene.photo}.jpg`} />
            <img src={`/wallpapers/${scene.photo}-m.jpg`} alt="" className="h-full w-full object-cover" decoding="async" />
          </picture>
        )}
        <div className={cn("absolute inset-0 transition-colors duration-1000", phase === "focus" ? "bg-[#0b0d0f]/80" : "bg-[#0b0d0f]/65")} />
      </div>
      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col items-center px-6 py-8 text-center">
        <div className="flex w-full items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand">{STUDY_NAME}</p>
          <button type="button" onClick={close} className="h-10 px-2 text-sm font-semibold text-ink-3 hover:text-ink">
            {phase === "setup" || phase === "done" ? "Close" : "End session"}
          </button>
        </div>

        {phase === "setup" ? (
          <div className="mt-10 w-full space-y-7 text-left">
            {mission ? (
              <div className="rounded-2xl border border-brand/30 bg-brand/[0.08] p-4 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand">{mission.tag ?? "Today's mission"}</p>
                <p className="mt-1.5 text-xl font-extrabold text-ink">{mission.topic}</p>
                <p className="text-sm text-ink-2">{mission.subject}</p>
                {mission.noteHref && (
                  <Link href={mission.noteHref} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline">
                    Open the notes for it
                  </Link>
                )}
              </div>
            ) : (
              <h2 className="text-center text-[1.8rem] font-extrabold tracking-tight text-ink">What are you studying?</h2>
            )}
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
            <SoundPicker sound={sound} setSound={pickSound} />
            <button type="button" onClick={start} className="h-14 w-full rounded-full bg-brand text-base font-semibold text-on-brand transition hover:brightness-110 active:scale-[0.98]">
              Start {mode.focus} minutes
            </button>
          </div>
        ) : phase === "done" ? (
          <div className="mt-16 w-full space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand/15 text-4xl text-brand ring-1 ring-brand/30 animate-[scale-in_300ms_ease-out]">✓</div>
            <div>
              <h2 className="text-[1.8rem] font-extrabold tracking-tight text-ink">Session done.</h2>
              <p className="mt-1 text-ink-2">
                {sessionMin || mode.focus} minutes of {subject} added to your week.
              </p>
            </div>
            {(() => {
              const st = currentStats(profile.focus, now);
              const goal = (profile.weeklyGoal ?? 5) * 60;
              const pct = Math.min(100, Math.round((st.weekMinutes / goal) * 100));
              return (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-left backdrop-blur-md">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-semibold text-ink">This week</span>
                    <span className="tabular-nums text-ink-2">
                      {Math.round((st.weekMinutes / 60) * 10) / 10} of {profile.weeklyGoal ?? 5} h
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-ink-3">{pct >= 100 ? "Weekly goal hit. That's how grades move." : `${100 - pct}% to your weekly goal.`}{st.streak > 1 ? ` ${st.streak} days in a row.` : ""}</p>
                </div>
              );
            })()}
            {mission && subject === mission.subject && (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-md">
                <p className="text-sm font-semibold text-ink">How did {mission.topic} go?</p>
                {checked ? (
                  <p className="mt-2 text-sm text-ink-2">
                    {checked === "got" ? "Nice. It comes back in a few days so it sticks." : "No problem. It's back on your plan tomorrow."}
                  </p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setChecked("got");
                        const key = topicKey(mission.subject, mission.topic);
                        updateProfile((latest) => ({ reviews: reviewDone(latest.reviews, key, Date.now()) }));
                      }}
                      className="h-12 rounded-full bg-brand text-sm font-semibold text-on-brand active:scale-[0.98]"
                    >
                      Got it
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setChecked("shaky");
                        const key = topicKey(mission.subject, mission.topic);
                        const tomorrow = addDays(pkDate(Date.now()), 1);
                        updateProfile((latest) => ({ reviews: { ...latest.reviews, [key]: { step: latest.reviews?.[key]?.step ?? 0, due: tomorrow } } }));
                      }}
                      className="h-12 rounded-full border border-border-strong text-sm font-semibold text-ink active:scale-[0.98]"
                    >
                      Still shaky
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-center gap-2">
              <button type="button" onClick={start} className="h-12 rounded-full bg-brand px-6 text-sm font-semibold text-on-brand">
                Another one
              </button>
              <button type="button" onClick={close} className="h-12 rounded-full border border-border-strong px-6 text-sm font-semibold text-ink">
                I&apos;m done
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-10 text-sm font-semibold text-ink-2">{phase === "rest" ? "Break. Stand up, drink water." : mission && subject === mission.subject ? `${subject} · ${mission.topic}` : subject}</p>
            <div className="relative mt-6">
              <svg width="272" height="272" viewBox="0 0 272 272" className="-rotate-90" aria-hidden>
                <circle cx="136" cy="136" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
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
                <p className="text-[4.25rem] font-extralight tabular-nums tracking-[-0.04em] text-ink" aria-live="off">
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
            {phase === "focus" && <SoundPicker sound={sound} setSound={pickSound} compact />}
            {me && <StudyRoomStrip meId={me.id} tone="dark" className="mt-8 w-full justify-center text-left" />}
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

type Sound = "off" | "rain" | "waves" | "brown";

function SoundPicker({ sound, setSound, compact }: { sound: Sound; setSound: (s: Sound) => void; compact?: boolean }) {
  const opts: Array<{ id: Sound; label: string }> = [
    { id: "off", label: "Silence" },
    { id: "rain", label: "Rain" },
    { id: "waves", label: "Waves" },
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

/** Starts a looping noise on the shared audio context; returns a stop function. */
function startSound(ctx: AudioContext, kind: Exclude<Sound, "off">): () => void {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    // Brown noise: a slow random walk (a soft, deep hum); rain: brighter noise.
    last = kind === "rain" ? white : (last + 0.02 * white) / 1.02;
    d[i] = kind === "rain" ? white : last * 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = kind === "rain" ? 1400 : kind === "waves" ? 700 : 500;
  const gain = ctx.createGain();
  gain.gain.value = kind === "rain" ? 0.08 : kind === "waves" ? 0.1 : 0.25;
  src.connect(filter).connect(gain).connect(ctx.destination);
  // Waves: the volume swells and falls slowly, like the sea.
  let lfo: OscillatorNode | null = null;
  if (kind === "waves") {
    lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 0.09;
    depth.gain.value = 0.08;
    lfo.connect(depth).connect(gain.gain);
    lfo.start();
  }
  src.start();
  // The context stays open for the chime and the next sound; only this one stops.
  return () => {
    try {
      src.stop();
      lfo?.stop();
    } catch {}
    gain.disconnect();
  };
}

/** A soft two-note chime at the end of a session or break, on the context made by the Start tap. */
function chime(ctx: AudioContext | null) {
  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {}
  if (!ctx || ctx.state === "closed") return;
  try {
    if (ctx.state !== "running") void ctx.resume().catch(() => {});
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
  } catch {}
}
