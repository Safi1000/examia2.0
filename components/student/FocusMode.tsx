"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { STUDY_NAME, MIN_COUNTED, currentStats, recordFocusOn } from "@/lib/focus";
import { QUOTES, type Quote } from "@/lib/groundwork";
import { pickQuote } from "@/lib/groundwork-quotes";
import { clearRunning, loadRunning, minutesToAdd, ownRunning, saveRunning } from "@/components/student/focus-session";
import { useBackToClose } from "@/components/student/useBackToClose";
import { AWAY_GRACE_MS, awayFor, awayLabel, creditedAway, hideTip, setFocusRoomOpen, tipHidden } from "@/components/student/focus-away";
import { cn } from "@/lib/cn";
import { buttonClasses } from "@/components/ui/Button";
import { displayName } from "@/lib/display-name";
import { worldScene, reviewDone, topicKey } from "@/lib/groundwork";
import { worldFor, type WorldPhase } from "@/lib/groundwork-worlds";
import { pkDate, addDays } from "@/lib/timetable";
import { setStudying } from "@/components/student/StudyRoom";
import { SOUNDS, backgroundTicker, chime, clearLockScreen, pauseSound, playSound, restChime, showOnLockScreen, stopSound, wakeChime, type Sound } from "@/lib/focus-sound";
import { clock, useFloatTimer } from "@/components/student/FloatTimer";
import { GroundworkWorld } from "@/components/student/GroundworkWorld";
import { Receipt, ShareReceipt, receiptId, type ReceiptData } from "@/components/student/StudyReceipt";
import { setTitleOverride } from "@/hooks/usePageTitle";
import { trackFocusItem, type FocusItem } from "@/lib/activity-tracker";

/**
 * The focus room: the student's 3D world, full screen, building as they
 * focus, with one big timer on top. The world follows this timer exactly
 * (see worldPhase and worldProgress below).
 *
 * The moment a block starts, everything but the clock, the line of quote and
 * the world fades away; one tap brings back a few quiet word buttons (Pause,
 * End), which hide again a few seconds later. The line changes every few
 * minutes (lib/groundwork-quotes.ts, the same rule as the phone app). The timer can
 * float over other apps (picture-in-picture), sits on the lock screen while a
 * sound plays, keeps the screen awake, and ends with a study receipt.
 * Loaded only when opened, so the rest of the portal doesn't carry it.
 */
/** The last subject choice, for study that is none of their subjects. */
const OTHER_CHOICE = "Something else";

export interface Mission {
  subject: string;
  topic: string;
  noteHref?: string;
  /** Suggested length in minutes. */
  minutes?: number;
  /** "Test prep", "Review 2 of 4"... shown above the topic. */
  tag?: string;
  /**
   * A test or homework this block is for ("Focus on this" on a To do row).
   * The summary names it, and the review check is skipped (it isn't a topic).
   */
  item?: { kind: "test" | "homework"; title: string; href?: string; /** The assignment or test id: its minutes are counted against it. */ id?: string };
}

type Phase = "setup" | "focus" | "rest" | "done";
type Block = { kind: "focus" | "rest"; min: number };

/** While a block runs, the controls hide by themselves this long after the last touch. */
const AUTO_HIDE_MS = 4000;

const restFor = (focus: number) => Math.max(3, Math.min(15, Math.round(focus / 5)));

declare global {
  interface Window {
    /**
     * Only inside the phone app's Groundwork screen (its web view adds it, mobile-1.2 site-webview.tsx):
     * true asks the app's tab bar to step aside, false brings it back. Returns true when the app follows it.
     */
    __htDock?: (hidden: boolean) => boolean;
  }
}

/** Ask the phone app (if any) to hide or show its tab bar. On the normal website it does nothing and returns false. */
function appDock(hidden: boolean): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.__htDock?.(hidden) === true;
  } catch {
    return false;
  }
}

const LENGTHS = [15, 25, 45, 60] as const;
const LENGTH_KEY = "gw_focus_min";
function lastLength(): number | undefined {
  try {
    const v = Number(localStorage.getItem(LENGTH_KEY));
    return v >= 5 && v <= 120 ? v : undefined;
  } catch {
    return undefined;
  }
}

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
  // Callers pass a username or a name: either way the receipt and the study room get a first name ("amelia.k2" → "Amelia").
  const firstName = me ? displayName(me.name).split(" ")[0] || me.name : "Me";
  const [openedAt] = useState(() => Date.now());
  const world = worldFor(profile.world);
  // The share image uses the world's still.
  const scene = worldScene(world.id);
  const today = pkDate(openedAt);
  const [subject, setSubject] = useState(mission?.subject ?? subjects[0] ?? "Study");
  /** The homework or test this room's blocks are on: every counted minute is also counted against it. */
  const [focusItem] = useState<FocusItem | undefined>(() => (mission?.item?.id ? { kind: mission.item.kind, id: mission.item.id } : undefined));
  // The subject it opened with is always in the list (a test in a subject they don't take, or no subjects yet).
  const [subjectChoices] = useState(() => [...new Set([...subjects, subject, OTHER_CHOICE])]);
  const [focusMin, setFocusMinRaw] = useState(() => Math.max(5, Math.min(120, mission?.minutes ?? lastLength() ?? 25)));
  // The length a student picks is remembered on this device for next time.
  const setFocusMin = (next: number | ((m: number) => number)) =>
    setFocusMinRaw((m) => {
      const v = typeof next === "function" ? next(m) : next;
      try {
        localStorage.setItem(LENGTH_KEY, String(v));
      } catch {}
      return v;
    });
  const restMin = restFor(focusMin);
  const [intention] = useState(() => mission?.topic ?? (profile.today?.date === today && !profile.today.done ? profile.today.text : ""));
  const [phase, setPhase] = useState<Phase>("setup");
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState<Sound>("off");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [pauses, setPauses] = useState(0);
  const [finished, setFinished] = useState<boolean | null>(null);
  const [checked, setChecked] = useState<null | "got" | "shaky">(null);
  const [fs, setFs] = useState(false);
  /** This block's seed for its lines of quote (which middle lines, see lib/groundwork-quotes.ts). */
  const [seed, setSeed] = useState(0);
  /** The setup fading out for a moment as the first block starts. */
  const [leaving, setLeaving] = useState(false);
  /** While a block runs: the controls are up (a tap brought them back). */
  const [peek, setPeek] = useState(false);
  /** Keyboard focus is inside the controls: they stay up. */
  const [within, setWithin] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sessionAt, setSessionAt] = useState<number | null>(null);
  /** How far the last focus block got (1 = finished): what the world shows on the receipt. */
  const [builtFrac, setBuiltFrac] = useState(0);
  /** Back after more than the grace away: the "builder waited" sheet (away time, and what was left when they went). */
  const [away, setAway] = useState<{ ms: number; left: number } | null>(null);
  const [tip, setTip] = useState(() => !tipHidden());
  const startedAt = useRef<number | null>(null);
  const logged = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  const resumeBtn = useRef<HTMLButtonElement>(null);
  /** What had focus when the room opened (Start focus, a Focus on this button): it gets focus back on close. */
  const [opener] = useState(() => (typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null));
  /** When they left Groundwork during a running focus block, and what was left of it then. */
  const leftAt = useRef<{ at: number; left: number } | null>(null);
  /** The same, for drawing (the clock, lock screen, title and float hold still once they are away past the grace). */
  const [gone, setGone] = useState<{ at: number; left: number } | null>(null);
  const markGone = (v: { at: number; left: number } | null) => {
    leftAt.current = v;
    setGone(v);
  };
  /** The timer is floating over another app on purpose: leaving doesn't make the builder wait. */
  const floating = useRef(false);

  const running = phase === "focus" || phase === "rest";
  // Away past the grace: the builder waits, so everything shows the time left when they went.
  const waiting = phase === "focus" && pausedLeft == null && gone != null && now - gone.at > AWAY_GRACE_MS;
  const held = pausedLeft != null || waiting;
  const left = pausedLeft ?? (waiting && gone ? gone.left : endsAt ? Math.max(0, endsAt - now) : 0);
  const total = (phase === "rest" ? restMin : focusMin) * 60_000;
  const focusedMin = blocks.filter((b) => b.kind === "focus").reduce((a, b) => a + b.min, 0);

  // The latest state, for handlers that run outside render.
  const live = useRef({ phase, subject, planned: focusMin, endsAt, pausedLeft, sound });
  useEffect(() => {
    live.current = { phase, subject, planned: focusMin, endsAt, pausedLeft, sound };
  });

  /** Time left in the block at `at`. Once they have been away past the grace, the builder stopped when they left. */
  const remainingAt = (at: number) => {
    const l = live.current;
    if (l.pausedLeft != null) return l.pausedLeft;
    const gone = leftAt.current;
    if (l.phase === "focus" && gone && awayFor(gone.at, at)) return gone.left;
    return l.endsAt ? Math.max(0, l.endsAt - at) : 0;
  };

  /** Focused time in the current block, in ms. */
  const doneMs = (at: number) => {
    const l = live.current;
    if (l.phase !== "focus" || startedAt.current == null) return 0;
    return Math.max(0, l.planned * 60_000 - remainingAt(at));
  };

  /** How much of the current focus block is done, 0 to 1. */
  const blockFrac = () => Math.min(1, doneMs(Date.now()) / (live.current.planned * 60_000));

  /** Keep the running block on the phone (instant, works while the page is closing). */
  const persist = () => {
    if (live.current.phase !== "focus" || startedAt.current == null) return;
    const at = Date.now();
    // Away: save only the time before they left (and when), so a tab closed while away never counts it.
    const awayAt = leftAt.current?.at;
    saveRunning({ subject: live.current.subject, planned: live.current.planned, startedAt: startedAt.current, doneMs: doneMs(awayAt != null ? Math.min(at, awayAt) : at), savedAt: at, logged: logged.current, awayAt, item: focusItem });
  };

  /** Count the minutes actually focused (each minute once). Returns the block's counted minutes. */
  const logFocus = (minutes: number, subj: string) => {
    const m = minutesToAdd(minutes * 60_000, logged.current);
    if (m) {
      logged.current += m;
      // One moment for the copy on screen and the saved copy (which is written later, or much later when offline),
      // so both put the minutes on the same day.
      const at = Date.now();
      // On the day the block started: a late block that runs past midnight stays on yesterday, so it never breaks that day's streak.
      const began = startedAt.current ?? at;
      // "Something else" is filed under Other in the week's subjects.
      updateProfile((latest) => ({ focus: recordFocusOn(latest.focus, m, subj === OTHER_CHOICE ? "Other" : subj, began, at) }));
      trackFocusItem(focusItem, m, at);
    }
    return logged.current;
  };

  /** The block is ending early (End, Back, leaving the page): count it now. */
  const flush = () => {
    let counted = 0;
    // Nothing of this room's to count: a block stored by an earlier visit (cut off, not yet added) stays stored.
    if (startedAt.current == null) {
      markGone(null);
      return counted;
    }
    if (live.current.phase === "focus") counted = logFocus(doneMs(Date.now()) / 60_000, live.current.subject);
    startedAt.current = null;
    markGone(null);
    clearRunning();
    return counted;
  };

  // ---- The clock: a worker tick, so it (and the float) keep going in the background.
  // Time always comes from the device clock; the tick only says "look again". On screen it looks
  // four times a second and redraws when the second shown changes, so the count never sticks on a
  // second or skips one (a tick that lands late, on a busy phone, used to do that).
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const t = Date.now();
      const end = live.current.endsAt;
      setNow((prev) => (end && Math.ceil((end - t) / 1000) === Math.ceil((end - prev) / 1000) ? prev : t));
    };
    let stop = () => {};
    const start = () => {
      stop();
      stop = backgroundTicker(tick, document.visibilityState === "hidden" ? 1000 : 250);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      document.removeEventListener("visibilitychange", start);
      stop();
    };
  }, [running]);

  // Keep the screen awake while timing.
  useEffect(() => {
    if (!running) return;
    let lock: { release: () => Promise<void> } | null = null;
    let over = false;
    const ask = () =>
      (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
        ?.request("screen")
        .then((l) => {
          // Granted after the timer stopped (it takes a moment): let it go, or the screen would stay on.
          if (over) return void l.release().catch(() => {});
          void lock?.release().catch(() => {});
          lock = l;
        })
        .catch(() => {});
    void ask();
    const back = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void ask();
      }
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      over = true;
      document.removeEventListener("visibilitychange", back);
      void lock?.release().catch(() => {});
    };
  }, [running]);

  // Save the block on the phone each minute, on every pause or resume, and when they leave or come back
  // (back within the grace: the saved copy drops the "left at", or a tab closed then would lose that time).
  const minuteMark = Math.floor((total - left) / 60_000);
  useEffect(() => {
    persist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, minuteMark, pausedLeft, endsAt, gone]);

  // ---- Stay to build. Leaving during a focus block notes when they went. Back
  // within the grace: nothing happens. Back later: the builder stopped when they
  // left, and a sheet asks whether that time was study on paper.
  useEffect(() => {
    const onVis = () => {
      const l = live.current;
      const at = Date.now();
      if (document.visibilityState === "hidden") {
        if (l.phase === "focus" && l.pausedLeft == null && l.endsAt && !floating.current) markGone({ at, left: Math.max(0, l.endsAt - at) });
        return;
      }
      const gone = leftAt.current;
      if (!gone) return;
      const ms = awayFor(gone.at, at);
      if (!ms || l.phase !== "focus" || l.pausedLeft != null) {
        markGone(null);
        return;
      }
      // Kept until they choose, so the block can't finish on its own in the meantime.
      setPausedLeft(gone.left);
      setAway({ ms, left: gone.left });
      pauseSound();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const onHide = () => persist();
    const onVis = () => document.visibilityState === "hidden" && persist();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opening: focus moves into the room, the phone's top bar goes dark. Closing from outside: count what was done.
  useEffect(() => {
    panel.current?.focus();
    setFocusRoomOpen(true);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prevTheme = meta?.content;
    if (meta) meta.content = "#0b0d0f";
    return () => {
      flush();
      setFocusRoomOpen(false);
      ownRunning(false);
      stopSound();
      restChime();
      clearLockScreen();
      setStudying(null);
      if (meta && prevTheme) meta.content = prevTheme;
      setTitleOverride(null);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      if (opener && opener !== document.body && opener.isConnected) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Block end: focus → chime, count, break; break → the receipt.
  useEffect(() => {
    if (pausedLeft != null || !endsAt || now < endsAt) return;
    // Away past the grace: the block waits for them to come back and choose.
    const gone = leftAt.current;
    if (phase === "focus" && gone && awayFor(gone.at, Date.now())) return;
    const t = setTimeout(() => {
      chime();
      if (phase === "focus") {
        setBuiltFrac(1);
        const counted = logFocus(focusMin, subject);
        setBlocks((b) => [...b, { kind: "focus", min: counted }]);
        startedAt.current = null;
        clearRunning();
        pauseSound();
        setPhase("rest");
        setEndsAt(Date.now() + restMin * 60_000);
      } else if (phase === "rest") {
        setBlocks((b) => [...b, { kind: "rest", min: restMin }]);
        setPhase("done");
        setEndsAt(null);
        setStudying(null);
        stopSound();
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, endsAt, pausedLeft, phase]);

  const startBlock = () => {
    wakeChime();
    // Everything but the clock, the line and the world fades away as it starts.
    setPeek(false);
    if (live.current.phase === "setup") {
      setLeaving(true);
      setTimeout(() => setLeaving(false), 460);
    }
    // A block from an earlier visit that was cut off: count it before this one takes its place.
    const old = loadRunning();
    const at = Date.now();
    if (old && old.startedAt !== startedAt.current) {
      const m = minutesToAdd(old.doneMs, old.logged);
      // On the day it was studied, as the next-visit recovery does (focus-session).
      const when = Math.min(at, old.awayAt ?? old.savedAt ?? at);
      if (m > 0) {
        updateProfile((latest) => ({ focus: recordFocusOn(latest.focus, m, old.subject, when, at) }));
        trackFocusItem(old.item, m, when);
      }
    }
    setSessionAt((v) => v ?? at);
    setSeed(at % 1_000_000_007);
    logged.current = 0;
    startedAt.current = at;
    markGone(null);
    setAway(null);
    ownRunning(true);
    saveRunning({ subject, planned: focusMin, startedAt: at, doneMs: 0, savedAt: at, logged: 0, item: focusItem });
    setPhase("focus");
    setPausedLeft(null);
    setEndsAt(at + focusMin * 60_000);
    setNow(at);
    if (sound !== "off") playSound(sound);
    if (me) setStudying({ ...me, name: firstName, subject, since: at });
  };

  /** End now. With enough counted, show the receipt; otherwise close. Returns true if the room stays open. */
  const end = (): boolean => {
    const ph = live.current.phase;
    if (ph === "focus") {
      setBuiltFrac(blockFrac());
      const counted = flush();
      if (counted > 0) setBlocks((b) => [...b, { kind: "focus", min: counted }]);
      const all = focusedMin + counted;
      // Over (the receipt, or closed): the sound is let go, so the phone stops showing a paused player.
      stopSound();
      setStudying(null);
      if (all >= MIN_COUNTED) {
        setPhase("done");
        setEndsAt(null);
        setPausedLeft(null);
        return true;
      }
      close();
      return false;
    }
    if (ph === "rest") {
      const restDone = Math.round((total - left) / 60_000);
      if (restDone > 0) setBlocks((b) => [...b, { kind: "rest", min: restDone }]);
      setPhase("done");
      setEndsAt(null);
      setPausedLeft(null);
      setStudying(null);
      stopSound();
      return true;
    }
    close();
    return false;
  };
  const close = () => {
    flush();
    stopSound();
    setStudying(null);
    onClose();
  };
  // The phone's Back button: a running block ends to its receipt; otherwise the room closes.
  useBackToClose(() => {
    if (live.current.phase === "focus" || live.current.phase === "rest") return end();
    close();
  });

  const pause = useCallback(() => {
    const l = live.current;
    if (l.pausedLeft != null || !l.endsAt) return;
    setPausedLeft(remainingAt(Date.now()));
    setPauses((n) => n + 1);
    pauseSound();
  }, []);
  const resume = useCallback(() => {
    const l = live.current;
    if (l.pausedLeft == null) return;
    markGone(null);
    setAway(null);
    const at = Date.now();
    setEndsAt(at + l.pausedLeft);
    setPausedLeft(null);
    setNow(at);
    if (l.phase === "focus" && l.sound !== "off") playSound(l.sound);
  }, []);
  const togglePause = () => (pausedLeft != null ? resume() : pause());

  // ---- Back after the builder waited: Resume (away time not counted), or count it as study on paper.
  const sheet = phase === "focus" && pausedLeft != null ? away : null;
  const sheetOn = !!sheet;
  useEffect(() => {
    if (sheetOn) resumeBtn.current?.focus();
  }, [sheetOn]);
  const backAndResume = () => {
    setPauses((n) => n + 1);
    resume();
  };
  const backFromPaper = () => {
    if (!away) return;
    markGone(null);
    setAway(null);
    const at = Date.now();
    // Counted up to what was left; if that is all of it, the block finishes now.
    const rest = away.left - creditedAway(away.ms, away.left);
    setEndsAt(at + rest);
    setPausedLeft(null);
    setNow(at);
    if (rest > 0 && sound !== "off") playSound(sound);
  };
  const skipBreak = () => {
    const restDone = Math.round((total - left) / 60_000);
    if (restDone > 0) setBlocks((b) => [...b, { kind: "rest", min: restDone }]);
    startBlock();
  };
  const pickSound = (s: Sound) => {
    setSound(s);
    if (phase === "focus" && pausedLeft == null) playSound(s);
    else if (s === "off") stopSound();
  };

  // ---- Floating timer (picture-in-picture).
  const view = { leftMs: left, totalMs: total, phase: phase === "rest" ? ("rest" as const) : ("focus" as const), paused: held, subject, intention: intention.trim() || undefined };
  const onFloat = (on: boolean) => {
    floating.current = on;
    const l = live.current;
    if (l.phase !== "focus" || l.pausedLeft != null || !l.endsAt) return;
    const at = Date.now();
    if (on) {
      // Floated as they left (desktop Chrome can float it by itself on a tab switch): they never went away.
      if (leftAt.current && !awayFor(leftAt.current.at, at)) markGone(null);
    } else if (document.visibilityState === "hidden" && !leftAt.current) {
      // The float was closed while they are somewhere else: from now on it is the same as leaving.
      markGone({ at, left: Math.max(0, l.endsAt - at) });
    }
  };
  const float = useFloatTimer(view, { pause, resume }, running, onFloat);
  useEffect(() => {
    floating.current = float.active;
  });

  // ---- Lock screen and the tab title, once a minute and on every change.
  const minsLeft = Math.ceil(left / 60_000);
  useEffect(() => {
    // Not timing (the receipt): nothing of the session stays on the lock screen.
    if (!running) return clearLockScreen();
    showOnLockScreen(
      { title: held ? "Paused" : phase === "rest" ? `Break · ${minsLeft} min left` : `${minsLeft} min left`, subject, totalMs: total, leftMs: left, paused: held },
      // Stop on the lock screen only pauses: one touch in the notification shade never ends the whole session.
      { play: resume, pause, stop: pause },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, minsLeft, held, phase, subject]);
  useEffect(() => {
    if (!running) return setTitleOverride(null);
    setTitleOverride(`${clock(left)} · ${held ? "Paused" : phase === "rest" ? "Break" : subject}`);
  }, [running, left, phase, subject, held]);

  // ---- While a block runs only the clock, the line and the world show. One tap brings the controls back;
  // they hide again AUTO_HIDE_MS after the last touch, and a tap on empty space hides them at once.
  // Paused, the away sheet, or keyboard focus inside them: they stay. Hidden, they are only faded:
  // Tab still reaches them (and brings them back) and screen readers still find them.
  const immersive = running && pausedLeft == null;
  const shown = !immersive || peek || within;
  useEffect(() => {
    if (!immersive) return;
    const clear = () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = null;
    };
    const poke = () => {
      setPeek(true);
      clear();
      hideTimer.current = setTimeout(() => {
        hideTimer.current = null;
        setPeek(false);
      }, AUTO_HIDE_MS);
    };
    const el = panel.current;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      // A control: it stays up for a while after this touch.
      if (t?.closest("button, a, select, input, [role=alertdialog]")) return poke();
      // Empty space: shows them, or hides them at once if they are up.
      if (hideTimer.current) {
        clear();
        setPeek(false);
      } else poke();
    };
    const onMove = (e: PointerEvent) => e.pointerType === "mouse" && poke();
    const onKey = () => poke();
    el?.addEventListener("pointerdown", onDown);
    el?.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      clear();
      el?.removeEventListener("pointerdown", onDown);
      el?.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [immersive]);
  // Back from a pause (or the away sheet): the controls stay up for a moment, then go.
  const wasHeld = useRef(false);
  useEffect(() => {
    if (wasHeld.current && immersive) {
      setPeek(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        hideTimer.current = null;
        setPeek(false);
      }, AUTO_HIDE_MS);
    }
    wasHeld.current = running && !immersive;
  }, [immersive, running]);
  // In the phone app the tab bar goes and comes back with the controls: hidden only while a block runs
  // with its controls hidden (never paused, on the away sheet, or after the end). data-dock-hidden is set
  // only when the app took the message, so an older app (no __htDock) keeps the room clear of its bar.
  const dockDown = !shown && !held;
  const dockWant = useRef(dockDown);
  useEffect(() => {
    dockWant.current = dockDown;
    const ok = appDock(dockDown);
    panel.current?.toggleAttribute("data-dock-hidden", dockDown && ok);
  }, [dockDown]);
  useEffect(() => {
    const showDock = () => {
      appDock(false);
      panel.current?.removeAttribute("data-dock-hidden");
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") return showDock();
      // Back in front with the controls still hidden: ask again (the app shows its bar in the background).
      if (dockWant.current) panel.current?.toggleAttribute("data-dock-hidden", appDock(true));
    };
    window.addEventListener("pagehide", showDock);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pagehide", showDock);
      document.removeEventListener("visibilitychange", onVis);
      // Closing the room: the bar always comes back.
      appDock(false);
    };
  }, []);
  // Keyboard focus inside the controls (Tab, not a tap) keeps them up.
  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    let keyboard = false;
    const onKey = () => (keyboard = true);
    const onPointer = () => (keyboard = false);
    const check = () => {
      const at = document.activeElement;
      setWithin(keyboard && !!at && el.contains(at) && !!at.closest("[data-gw-controls]"));
    };
    const later = () => {
      clearTimeout(t);
      t = setTimeout(check, 0);
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    el.addEventListener("focusin", check);
    el.addEventListener("focusout", later);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
      el.removeEventListener("focusin", check);
      el.removeEventListener("focusout", later);
    };
  }, []);

  // ---- Full screen where the browser allows it (desktop, Android).
  const fsOk = typeof document !== "undefined" && !!document.fullscreenEnabled;
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void panel.current?.requestFullscreen?.().catch(() => {});
  };

  // ---- Keyboard: Space pauses, F full screen, P floats, Escape closes (like Back: a running block ends to its receipt).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        // The "builder waited" sheet needs an answer.
        if (sheet) return;
        e.preventDefault();
        if (running) void end();
        else close();
        return;
      }
      // Typing or choosing (the subject picker): the keys belong to that field.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " " && running && !sheet) {
        e.preventDefault();
        if (phase === "rest") skipBreak();
        else togglePause();
      } else if ((e.key === "f" || e.key === "F") && fsOk) toggleFs();
      else if ((e.key === "p" || e.key === "P") && running && float.kind) void float.open();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---- Focus stays in the room (it covers the page): Tab wraps around inside it.
  useEffect(() => {
    const onTab = (e: KeyboardEvent) => {
      const el = panel.current;
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select, input, textarea, [tabindex]:not([tabindex="-1"])')).filter(
        (x) => x.tabIndex >= 0 && x.getClientRects().length > 0,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      // A dialog opened on top of the room (the receipt image) keeps the keyboard while it is open.
      if (at instanceof Element && !el.contains(at) && at.closest('[role="dialog"][aria-modal="true"]')) return;
      const inside = at instanceof Node && el.contains(at);
      if (!inside || (e.shiftKey && (at === first || at === el)) || (!e.shiftKey && at === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onTab, true);
    return () => document.removeEventListener("keydown", onTab, true);
  }, []);

  // ---- The receipt.
  const stats = currentStats(profile.focus, now);
  const receipt: ReceiptData | null =
    phase === "done" && sessionAt
      ? {
          id: receiptId(sessionAt),
          name: firstName,
          // The receipt and its share card say "Study", never "Something else".
          subject: subject === OTHER_CHOICE ? "Study" : subject,
          intention: intention.trim() || undefined,
          intentionDone: finished,
          startedAt: sessionAt,
          endedAt: now,
          blocks: blocks.filter((b) => b.min > 0),
          focusedMin,
          pauses,
          todayMin: stats.days?.[pkDate(now)] ?? focusedMin,
          weekMin: stats.weekMinutes,
          streak: stats.streak,
        }
      : null;

  // ---- The world follows the timer. Progress is the exact fraction of the
  // current focus block done (it moves every tick of the clock above).
  // Before a block: idle. Focusing: building (paused while paused). The break
  // after a finished block: done. The receipt: done if the last block was
  // finished, otherwise held where it stopped.
  const worldPhase: WorldPhase =
    phase === "setup" ? "idle" : phase === "focus" ? (pausedLeft != null ? "paused" : "building") : phase === "rest" ? "done" : builtFrac >= 1 ? "done" : "paused";
  const worldProgress = phase === "setup" ? 0 : phase === "focus" ? Math.min(1, Math.max(0, 1 - left / total)) : phase === "rest" ? 1 : builtFrac;
  const hide = !shown;
  // Out in 450ms; back in 300ms with a small rise. Reduced motion: a plain short fade (the room's style below).
  const fade = cn(
    "gw-fade transition-[opacity,transform] ease-[cubic-bezier(0.16,1,0.3,1)]",
    hide ? "pointer-events-none translate-y-[7px] opacity-0 duration-[450ms]" : "translate-y-0 opacity-100 duration-300",
  );
  // The line of quote: it changes every few minutes through a focus block; the closing line through the break.
  const line = phase === "rest" ? QUOTES[QUOTES.length - 1] : pickQuote(QUOTES, focusMin, Math.max(0, total - left), seed);
  // What this block is for, shown with the controls.
  const forLabel = phase === "rest" ? "Break" : [subject, intention.trim()].filter(Boolean).join(" · ");
  // The running controls: plain words, no fill, no border, a 44px touch area.
  const quietBtn =
    "flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 text-[15px] font-medium text-white/75 [text-shadow:0_1px_12px_rgba(0,0,0,.45)] transition-colors duration-150 hover:text-white active:opacity-50";
  const plainIcon = "flex h-11 w-11 items-center justify-center rounded-full text-white/75 [filter:drop-shadow(0_1px_8px_rgba(0,0,0,.45))] transition-colors duration-150 hover:text-white";
  // A solid dark tint, no blur: a blur over a moving 3D world is redone on every frame, and that
  // alone made the room stutter on laptops without a separate graphics card.
  const glass = "bg-paper/70 border border-hairline-strong";

  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={STUDY_NAME}
      className={cn("focus-dark fixed inset-0 z-[70] overflow-hidden bg-[#0b0d0f] text-white outline-none", hide && "cursor-none")}
    >
      {/* Their world, building as they focus. While timing, only the top (clock) and bottom (buttons) are shaded so the build shows; around the setup and the receipt it is dimmed so the text reads. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <GroundworkWorld world={world.id} progress={worldProgress} phase={worldPhase} className="absolute inset-0 overflow-hidden" />
        <div
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: running ? 1 : 0, background: "linear-gradient(180deg,rgba(8,10,12,.6),rgba(8,10,12,.12) 34%,rgba(8,10,12,0) 50%,rgba(8,10,12,0) 72%,rgba(8,10,12,.6))" }}
        />
        <div
          className="absolute inset-0 transition-opacity duration-1000"
          style={{ opacity: running ? 0 : 1, background: "linear-gradient(180deg,rgba(8,10,12,.62),rgba(8,10,12,.45) 45%,rgba(8,10,12,.75))" }}
        />
      </div>

      <div
        className={cn(
          "room-body relative mx-auto flex h-full w-full max-w-5xl flex-col px-5 sm:px-8",
          "pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]",
          (phase === "setup" || phase === "done") && "overflow-y-auto overscroll-contain",
        )}
      >
        {/* Top bar. While a block runs it is part of the controls: what the block is for, and (where the browser can) float and full screen. */}
        <div className={cn("flex h-14 shrink-0 items-center justify-between gap-3", running && fade)} data-gw-controls={running ? "" : undefined}>
          <p className={cn("min-w-0 truncate", running ? "text-sm text-white/65 [text-shadow:0_1px_10px_rgba(0,0,0,.5)]" : "label-quiet text-white/70")}>
            {running ? forLabel : STUDY_NAME}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {running && float.kind && (
              <button type="button" onClick={() => void (float.active ? float.close() : float.open())} className={plainIcon} aria-label={float.active ? "Stop floating the timer" : "Float the timer over other apps"} title="Float (P)">
                <Glyph.Float />
              </button>
            )}
            {/* Full screen: with the controls while a block runs; in the setup only on laptops (a phone has no use for it there). */}
            {fsOk && (
              <button type="button" onClick={toggleFs} className={cn(plainIcon, !running && "hidden md:flex")} aria-label={fs ? "Exit full screen" : "Full screen"} title="Full screen (F)">
                {fs ? <Glyph.Shrink /> : <Glyph.Expand />}
              </button>
            )}
            {/* The setup (and the receipt) closes with one quiet word, as do Escape and the phone's Back. The world is chosen on the start screen. */}
            {!running && (
              <button type="button" onClick={close} className={cn(quietBtn, "-mr-3")}>
                {phase === "setup" ? "Cancel" : "Close"}
              </button>
            )}
          </div>
        </div>

        {(phase === "setup" || leaving) && (
          <div
            className={cn(
              "flex flex-1 flex-col items-center justify-center pb-8 text-center",
              phase !== "setup" && "gw-leave pointer-events-none absolute inset-x-5 bottom-0 top-[calc(3.5rem+max(0.75rem,env(safe-area-inset-top)))] sm:inset-x-8",
            )}
            inert={phase !== "setup"}
            aria-hidden={phase !== "setup" || undefined}
          >
            {mission && (
              <p className="mb-8 max-w-xs truncate text-sm text-white/60">
                {mission.tag ? `${mission.tag} · ` : ""}
                {mission.topic}
              </p>
            )}
            <label className="relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-base font-medium text-white/80 transition-colors duration-150 hover:text-white">
              {subject}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
              <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" className="absolute inset-0 cursor-pointer text-base opacity-0">
                {subjectChoices.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            {/* The same big quiet numbers as the start clock and the countdown; the four lengths below set it. */}
            <p className="room-count mt-2 font-semibold leading-none tabular-nums tracking-[-0.045em] text-white [text-shadow:0_2px_30px_rgba(0,0,0,.3)]">{clock(focusMin * 60_000)}</p>
            <p className="mt-2 text-[13px] text-white/60">then a {restMin} minute break</p>
            <div role="radiogroup" aria-label="Length" className="mt-7 flex items-center gap-1.5">
              {LENGTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={focusMin === m}
                  onClick={() => setFocusMin(m)}
                  className={cn(
                    "min-h-11 min-w-14 rounded-full px-3 text-sm font-semibold tabular-nums transition-colors duration-150 active:scale-[0.98]",
                    focusMin === m ? "bg-white/[0.16] text-white" : "text-white/55 hover:text-white/80",
                  )}
                >
                  {m} min
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Sound" className="mt-3 flex flex-wrap items-center justify-center gap-1">
              {SOUNDS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={sound === x.id}
                  onClick={() => setSound(x.id)}
                  className={cn("min-h-11 rounded-full px-3 text-sm transition-colors duration-150", sound === x.id ? "bg-white/[0.16] font-semibold text-white" : "text-white/55 hover:text-white/80")}
                >
                  {x.id === "off" ? "Silence" : x.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={startBlock} className={buttonClasses({ size: "lg", className: "mt-9 w-full max-w-xs" })}>
              Start
            </button>
            {mission?.noteHref && (
              <Link href={mission.noteHref} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-white/70 transition-colors duration-150 hover:text-white">
                Open the notes first
              </Link>
            )}
            {tip && (
              <p className="mt-4 flex max-w-xs items-center gap-1 text-left text-xs leading-snug text-white/60">
                <span>Tip: turn on Do Not Disturb or a Focus mode before you start.</span>
                <button
                  type="button"
                  onClick={() => {
                    hideTip();
                    setTip(false);
                  }}
                  aria-label="Dismiss tip"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:text-white"
                >
                  <Glyph.X />
                </button>
              </p>
            )}
          </div>
        )}

        {running && (
          <div className="gw-in flex flex-1 flex-col items-center">
            {/* The clock, now the countdown: the same big quiet numbers as the start screen. */}
            <div className="mt-[clamp(0rem,6dvh,3.5rem)] flex flex-col items-center text-center">
              <p
                role="timer"
                aria-live="off"
                aria-label={`${clock(left)} ${phase === "rest" ? "of the break" : `left of ${focusMin} minutes`}${pausedLeft != null ? ", paused" : ""}`}
                className={cn(
                  "room-count font-semibold leading-none tabular-nums tracking-[-0.045em] text-white [text-shadow:0_2px_30px_rgba(0,0,0,.3)] transition-opacity duration-300",
                  held && "opacity-60",
                )}
              >
                {clock(left)}
              </p>
              {/* A few quiet words under it: always for a pause or the break; otherwise only with the controls. */}
              <p
                aria-hidden
                className={cn(
                  "mt-2 min-h-5 text-[13px] text-white/60 [text-shadow:0_1px_10px_rgba(0,0,0,.5)]",
                  phase === "focus" && pausedLeft == null && fade,
                )}
              >
                {pausedLeft != null ? "Paused" : phase === "rest" ? "Break. Stand up, drink some water" : `left of ${focusMin} minutes`}
              </p>
            </div>

            {/* The line of quote, low and quiet. A new line cross fades in every few minutes. */}
            <div className="mt-auto w-full max-w-md px-2 pb-3 pt-6">
              <QuoteLine line={line} />
            </div>
          </div>
        )}

        {sheet && (
          <div className="room-foot shrink-0">
            <div role="alertdialog" aria-labelledby="gw-away-title" className={cn("away-in mx-auto w-full max-w-sm rounded-card p-5 text-center", glass)}>
              <p id="gw-away-title" className="text-base font-medium leading-snug text-white [text-wrap:balance]">
                You were away {awayLabel(sheet.ms)}. Your world waited for you.
              </p>
              <button
                ref={resumeBtn}
                type="button"
                onClick={backAndResume}
                className={buttonClasses({ size: "lg", fullWidth: true, className: "mt-4" })}
              >
                Resume
              </button>
              <button
                type="button"
                onClick={backFromPaper}
                className={buttonClasses({ variant: "secondary", size: "lg", fullWidth: true, className: "mt-2" })}
              >
                I was studying on paper
              </button>
            </div>
          </div>
        )}

        {running && !sheet && (
          <div className={cn("room-foot shrink-0", fade)} data-gw-controls="">
            <div className="flex items-center justify-center gap-6 sm:gap-10">
              <button type="button" onClick={phase === "rest" ? skipBreak : togglePause} className={quietBtn} aria-label={phase === "rest" ? "Skip the break" : undefined}>
                {phase === "rest" ? "Skip break" : pausedLeft != null ? "Resume" : "Pause"}
              </button>
              {phase === "focus" && sound !== "off" && (
                <button type="button" onClick={() => pickSound("off")} className={quietBtn} aria-label={`Sound: ${SOUNDS.find((x) => x.id === sound)?.label}. Turn it off`}>
                  Sound off
                </button>
              )}
              <button type="button" onClick={() => void end()} className={quietBtn} aria-label="End session">
                End
              </button>
            </div>
          </div>
        )}

        {phase === "done" && receipt && (
          <div className="flex flex-1 flex-col items-center gap-6 py-6">
            <div className="text-center">
              <h2 className="text-title font-semibold tracking-[-0.025em]">Nicely done.</h2>
              <p className="mt-2 text-base text-white/75">
                {mission?.item
                  ? `${receipt.focusedMin} ${receipt.focusedMin === 1 ? "minute" : "minutes"} on ${mission.item.title}. Added to your week.`
                  : `${receipt.focusedMin} ${receipt.focusedMin === 1 ? "minute" : "minutes"} of ${subject === OTHER_CHOICE ? "study" : subject} added to your week.`}
              </p>
              {mission?.item?.href && (
                <Link href={mission.item.href} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-white/70 underline-offset-4 hover:text-white hover:underline">
                  {mission.item.kind === "test" ? "Go to the test" : "Go to the homework"}
                </Link>
              )}
            </div>

            {receipt.intention && finished == null && (
              <div className={cn("w-full max-w-[340px] rounded-card p-5 text-center", glass)}>
                <p className="text-base text-white/85">Did you finish it?</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setFinished(true)} className={buttonClasses({ variant: "secondary" })}>
                    Yes
                  </button>
                  <button type="button" onClick={() => setFinished(false)} className={buttonClasses({ variant: "secondary" })}>
                    Not yet
                  </button>
                </div>
              </div>
            )}

            {mission && !mission.item && subject === mission.subject && (
              <div className={cn("w-full max-w-[340px] rounded-card p-5 text-center", glass)}>
                <p className="text-base text-white/85">How did {mission.topic} go?</p>
                {checked ? (
                  <p className="mt-2 text-base text-white/75">{checked === "got" ? "Good. It comes back in a few days so it sticks." : "No problem. It's back on your plan tomorrow."}</p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setChecked("got");
                        const key = topicKey(mission.subject, mission.topic);
                        updateProfile((latest) => ({ reviews: reviewDone(latest.reviews, key, Date.now()) }));
                      }}
                      className={buttonClasses({ variant: "secondary" })}
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
                      className={buttonClasses({ variant: "secondary" })}
                    >
                      Still shaky
                    </button>
                  </div>
                )}
              </div>
            )}

            <Receipt r={receipt} />

            <div className="flex w-full max-w-[340px] flex-col gap-2 pb-4">
              <button type="button" onClick={startBlock} className={buttonClasses({ size: "lg" })}>
                Another {focusMin} minutes
              </button>
              <div className="grid grid-cols-2 gap-2">
                <ShareReceipt r={receipt} scene={scene} />
                <button type="button" onClick={close} className={buttonClasses({ variant: "secondary", size: "lg" })}>
                  Finish
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {float.portal}

      <style>{`
        .room-count { font-size: clamp(5rem, min(23vw, 15dvh), 11rem); }
        .room-foot { padding-bottom: .5rem; }
        /* In the phone app its floating tab bar (112px above the safe area) lies over the bottom of the web view: keep everything clear of it.
           While the app has hidden the bar (data-dock-hidden), Pause, End and the quote settle into its space, at the bar's own pace (out 450ms, back 300ms). */
        @media (max-width: 767px) {
          html[data-app] .room-body { padding-bottom: calc(112px + env(safe-area-inset-bottom)); transition: padding-bottom 300ms cubic-bezier(0.16,1,0.3,1); }
          html[data-app] [data-dock-hidden] .room-body { padding-bottom: max(1rem, env(safe-area-inset-bottom)); transition-duration: 450ms; }
        }
        @keyframes gw-in { from { opacity: 0; } }
        @keyframes gw-out { to { opacity: 0; } }
        .gw-in { animation: gw-in .45s ease-out both; }
        .gw-leave { animation: gw-out .45s cubic-bezier(0.16,1,0.3,1) both; }
        .gw-line-in { animation: gw-in .6s ease-out both; }
        .gw-line-out { animation: gw-out .6s ease-out both; }
        /* Reduced motion: no rise, just a plain short fade (the site's global rule would make it instant). */
        @media (prefers-reduced-motion: reduce) {
          .gw-fade { transform: none !important; transition: opacity 160ms linear !important; }
          .gw-in, .gw-leave, .gw-line-in, .gw-line-out { animation-duration: 160ms !important; }
          html[data-app] .room-body { transition: padding-bottom 160ms linear !important; }
        }
        .no-scrollbar { scrollbar-width: none; } .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes away-in { from { opacity: 0; transform: translateY(8px); } }
        @media (prefers-reduced-motion: no-preference) { .away-in { animation: away-in .4s ease-out both; } }
      `}</style>
    </div>
  );
}

const S = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const Glyph = {
  X: () => (
    <svg {...S}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  Pause: () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  ),
  Play: () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  ),
  Float: () => (
    <svg {...S}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <rect x="12" y="11" width="7" height="6" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  Expand: () => (
    <svg {...S}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  ),
  Shrink: () => (
    <svg {...S}>
      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
    </svg>
  ),
  Sound: ({ off }: { off?: boolean }) => (
    <svg {...S}>
      <path d="M4 10v4h3l5 4V6L7 10H4Z" />
      {off ? <path d="m16 10 4 4m0-4-4 4" /> : <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />}
    </svg>
  ),
};

/**
 * The line of quote while a block runs: a new line cross fades in over the
 * old one (600ms). Only the newest is read out by a screen reader, and only
 * when it changes: politely, so it never interrupts.
 */
function QuoteLine({ line }: { line: Quote | undefined }) {
  const [lines, setLines] = useState(() => (line ? [{ key: 0, line }] : []));
  const [current, setCurrent] = useState(line);
  if (line !== current) {
    setCurrent(line);
    if (line) setLines((ls) => [...ls.slice(-1), { key: (ls.at(-1)?.key ?? 0) + 1, line }]);
  }
  useEffect(() => {
    if (lines.length < 2) return;
    const t = setTimeout(() => setLines((ls) => ls.slice(-1)), 650);
    return () => clearTimeout(t);
  }, [lines]);
  return (
    <div className="grid text-center" aria-live="polite">
      {lines.map((l, i) => {
        const old = i < lines.length - 1;
        return (
          <figure
            key={l.key}
            aria-hidden={old || undefined}
            className={cn("col-start-1 row-start-1 self-end [text-shadow:0_1px_12px_rgba(0,0,0,.6)]", lines.length > 1 && (old ? "gw-line-out" : "gw-line-in"))}
          >
            <blockquote className="text-[15px] leading-snug text-white/85 [text-wrap:balance]">{l.line.by ? `“${l.line.text}”` : l.line.text}</blockquote>
            {l.line.by && <figcaption className="mt-1 text-xs text-white/50">{l.line.by}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}
