"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { STUDY_NAME, MIN_COUNTED, currentStats, recordFocusOn } from "@/lib/focus";
import { QUOTES, type Quote } from "@/lib/groundwork";
import { pickQuote } from "@/lib/groundwork-quotes";
import { clearRunning, loadRunning, minutesToAdd, ownRunning, saveRunning } from "@/components/student/focus-session";
import { useBackToClose } from "@/components/student/useBackToClose";
import { AWAY_GRACE_MS, awayFor, awayLabel, creditedAway, setFocusRoomOpen } from "@/components/student/focus-away";
import { cn } from "@/lib/cn";
import { buttonClasses } from "@/components/ui/Button";
import { displayName } from "@/lib/display-name";
import { worldScene, reviewDone, topicKey, weekDays, weekStreak, DEFAULT_DAYS_TARGET } from "@/lib/groundwork";
import { SURPRISE, isSurprise, nextSurprise, useSurpriseWorld } from "@/lib/groundwork-surprise";
import { ShuffleGlyph } from "@/components/student/WorldPicker";
import { WORLDS, type WorldId } from "@/lib/groundwork-worlds";
import { worldFor, type BuilderBeat, type BuilderMood, type WorldPhase } from "@/lib/groundwork-worlds";
import { pkDate, addDays } from "@/lib/timetable";
import { setStudying } from "@/components/student/StudyRoom";
import { SOUNDS, backgroundTicker, chime, clearLockScreen, pauseSound, playSound, restChime, showOnLockScreen, stopSound, wakeChime, type Sound } from "@/lib/focus-sound";
import { clock, useFloatTimer } from "@/components/student/FloatTimer";
import { GroundworkWorld, builderCrossNow, type BuilderMoodState } from "@/components/student/GroundworkWorld";
import { Receipt, ShareReceipt, receiptId, type ReceiptData } from "@/components/student/StudyReceipt";
import { setTitleOverride } from "@/hooks/usePageTitle";
import { trackFocusItem, type FocusItem } from "@/lib/activity-tracker";

/**
 * The focus room: the student's 3D world, full screen, building as they
 * focus, with one big timer on top. The world follows this timer exactly
 * (see worldPhase and worldProgress below).
 *
 * The moment a block starts, everything but the clock, the line of quote and
 * the world fades away, and in the same motion the clock rises a little and
 * the line drops into the freed space; one tap brings back a few quiet word
 * buttons (Pause, End), with the reverse motion, and they hide again a few
 * seconds later. The line changes every few
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

/** A break taken from the finish card: a plain countdown, never counted as focus. */
const BREAK_MIN = 5;
/** The set up's length: a big number with minus 5 and plus 5. */
const MIN_LEN = 5;
const MAX_LEN = 180;
const LEN_STEP = 5;
const clampLen = (m: number) => Math.max(MIN_LEN, Math.min(MAX_LEN, Math.round(m)));
/** One step from `m`, landing on a whole 5 (23 goes up to 25, down to 20). */
const stepLen = (m: number, dir: 1 | -1) => clampLen(dir > 0 ? Math.floor(m / LEN_STEP) * LEN_STEP + LEN_STEP : Math.ceil(m / LEN_STEP) * LEN_STEP - LEN_STEP);
/** The start glide: the set up's number becomes the running clock. */
const GLIDE_MS = 700;
const GLIDE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** The world re-renders only when what it shows changes (once a second while building), never for the room's other state. */
const World = memo(GroundworkWorld);

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

const LENGTH_KEY = "gw_focus_min";
function lastLength(): number | undefined {
  try {
    const v = Number(localStorage.getItem(LENGTH_KEY));
    return v >= MIN_LEN && v <= MAX_LEN ? Math.round(v) : undefined;
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
  // Surprise me (the default until they pick a world): the start screen's random world, a new one each block.
  const surprise = isSurprise(profile.world);
  const surpriseId = useSurpriseWorld();
  const world = worldFor(surprise ? surpriseId : profile.world);
  // The share image uses the world's still.
  const scene = worldScene(world.id);
  const today = pkDate(openedAt);
  const [subject, setSubject] = useState(mission?.subject ?? subjects[0] ?? "Study");
  /** The homework or test this room's blocks are on: every counted minute is also counted against it. */
  const [focusItem] = useState<FocusItem | undefined>(() => (mission?.item?.id ? { kind: mission.item.kind, id: mission.item.id } : undefined));
  // The subject it opened with is always in the list (a test in a subject they don't take, or no subjects yet).
  const [subjectChoices] = useState(() => [...new Set([...subjects, subject, OTHER_CHOICE])]);
  const [focusMin, setFocusMinRaw] = useState(() => clampLen(mission?.minutes ?? lastLength() ?? 25));
  // The length a student picks is remembered on this device for next time.
  const setFocusMin = (next: number | ((m: number) => number)) =>
    setFocusMinRaw((m) => {
      const v = typeof next === "function" ? next(m) : next;
      try {
        localStorage.setItem(LENGTH_KEY, String(v));
      } catch {}
      return v;
    });
  const restMin = BREAK_MIN;
  /** The length picked on the set up (or the last block started): what "Start another block" after a break runs. */
  const [chosenMin, setChosenMin] = useState(focusMin);
  /** The done card follows a break (it offers another block) rather than a focus block. */
  const [afterBreak, setAfterBreak] = useState(false);
  /** How the running view came in: the set up's number gliding into the clock, or a plain fade. */
  const [entry, setEntry] = useState<"glide" | "fade">("fade");
  const setupNum = useRef<HTMLSpanElement>(null);
  const setupBox = useRef<HTMLDivElement>(null);
  const runClock = useRef<HTMLParagraphElement>(null);
  const glideFrom = useRef<DOMRect | null>(null);
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
  /** Just after Start: a mouse that is still settling doesn't bring the controls back. */
  const calmUntil = useRef(0);
  const [sessionAt, setSessionAt] = useState<number | null>(null);
  /** How far the last focus block got (1 = finished): what the world shows on the receipt. */
  const [builtFrac, setBuiltFrac] = useState(0);
  /** Back after more than the grace away: the "builder waited" sheet (away time, and what was left when they went). */
  const [away, setAway] = useState<{ ms: number; left: number } | null>(null);
  /** The small sheet behind the set up's one quiet line: subject, sound and world. */
  const [sheetOpen, setSheetOpen] = useState(false);
  /** The finish screen's receipt, behind a small "See receipt" link. */
  const [showReceipt, setShowReceipt] = useState(false);
  /** End was pressed after more than a minute of focus: one quiet confirm. */
  /** The minutes focused when End was pressed (null: no confirm showing). */
  const [confirming, setConfirming] = useState<number | null>(null);
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
  /**
   * The builder gets cross the moment they leave a running focus block, and stays cross until they are back and
   * choose (within the grace: a short nod and back to work). Drawn only: no timing, saving or counting depends on it.
   */
  const [builder, setBuilder] = useState<BuilderMoodState>({ mood: "calm", seq: 0 });
  const cross = useRef(false);
  const setBuilderMood = (mood: BuilderMood, beat?: BuilderBeat) => {
    if (cross.current === (mood === "cross")) return;
    cross.current = mood === "cross";
    setBuilder((b) => ({ mood, beat, seq: b.seq + 1 }));
  };

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

  // ---- The builder's mood. Leaving: the earliest signal wins (on a phone, the window losing focus as the app
  // switcher opens; then the page hiding; then the page going away), and he is drawn cross at once, in the event
  // itself, before the phone freezes or snapshots the page. The phone app can also say so directly through
  // window.__htBuilder("cross" | "calm"). Never on the setup, in a break, while paused with Pause, or when floating.
  const builderLeaving = () => {
    const l = live.current;
    if (cross.current || l.phase !== "focus" || l.pausedLeft != null || !l.endsAt || floating.current) return;
    builderCrossNow();
    setBuilderMood("cross");
  };
  // Back without the page ever hiding (the app switcher closed again): a nod. After a hide, onVis above decides.
  const builderBack = () => {
    if (!cross.current || document.visibilityState === "hidden" || leftAt.current) return;
    setBuilderMood("calm", "nod");
  };

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

  // ---- The clock. Time always comes from the device clock (endsAt minus now); a tick only says "look again",
  // and it redraws only when the second shown changes, so the count never sticks on a second or skips one.
  // On screen each tick is timed to land just after the next second boundary of the countdown (no drift, no
  // double ticks). In the background a worker tick (ordinary timers are slowed there) keeps the float going.
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
      if (document.visibilityState === "hidden") {
        stop = backgroundTicker(tick, 1000);
        return;
      }
      let timer = 0;
      const next = () => {
        tick();
        const end = live.current.endsAt;
        const toEdge = end ? (((end - Date.now()) % 1000) + 1000) % 1000 : 1000;
        timer = window.setTimeout(next, Math.max(16, toEdge + 4));
      };
      next();
      stop = () => clearTimeout(timer);
    };
    start();
    document.addEventListener("visibilitychange", start);
    return () => {
      document.removeEventListener("visibilitychange", start);
      stop();
    };
  }, [running, endsAt]);

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
        builderLeaving();
        if (l.phase === "focus" && l.pausedLeft == null && l.endsAt && !floating.current) markGone({ at, left: Math.max(0, l.endsAt - at) });
        return;
      }
      const gone = leftAt.current;
      if (!gone) return builderBack();
      const ms = awayFor(gone.at, at);
      if (!ms || l.phase !== "focus" || l.pausedLeft != null) {
        markGone(null);
        // Back within the grace: "there you are", and back to work (a pause made while away: just calm).
        setBuilderMood("calm", l.phase === "focus" && l.pausedLeft == null ? "nod" : undefined);
        return;
      }
      // Past the grace the builder stays cross behind the sheet until they choose.
      // Kept until they choose, so the block can't finish on its own in the meantime.
      setPausedLeft(gone.left);
      setAway({ ms, left: gone.left });
      pauseSound();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- The builder's mood (see builderLeaving above).
  useEffect(() => {
    // A laptop's window losing focus is not leaving (notes in another window): only a touch screen counts it.
    const touch = matchMedia("(pointer: coarse)").matches;
    const onBlur = () => touch && builderLeaving();
    const w = window as Window & { __htBuilder?: (mood: BuilderMood) => void };
    const hook = (mood: BuilderMood) => (mood === "cross" ? builderLeaving() : mood === "calm" ? builderBack() : undefined);
    w.__htBuilder = hook;
    window.addEventListener("blur", onBlur);
    window.addEventListener("pagehide", builderLeaving);
    window.addEventListener("focus", builderBack);
    return () => {
      if (w.__htBuilder === hook) delete w.__htBuilder;
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pagehide", builderLeaving);
      window.removeEventListener("focus", builderBack);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The block ended (or a break began) while he was cross: back to calm, no beat.
  useEffect(() => {
    if (phase !== "focus") setBuilderMood("calm");
  }, [phase]);

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
        // The finish moment: the world shows the finished build, the builder gives a small nod, and the
        // finish card (minutes today, streak, Done, 5 more minutes, a break) settles in.
        setBuiltFrac(1);
        const counted = logFocus(focusMin, subject);
        setBlocks((b) => [...b, { kind: "focus", min: counted }]);
        startedAt.current = null;
        clearRunning();
        stopSound();
        setStudying(null);
        setAfterBreak(false);
        setPhase("done");
        setEndsAt(null);
        setPausedLeft(null);
        cross.current = false;
        setBuilder((b) => ({ mood: "calm", beat: "nod", seq: b.seq + 1 }));
      } else if (phase === "rest") {
        setBlocks((b) => [...b, { kind: "rest", min: restMin }]);
        setAfterBreak(true);
        setPhase("done");
        setEndsAt(null);
        setStudying(null);
        stopSound();
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, endsAt, pausedLeft, phase]);

  /** Start a focus block: the set up's length, or `len` (5 more minutes, another block after a break). */
  const startBlock = (len?: number) => {
    const min = len ?? focusMin;
    if (len != null) setFocusMinRaw(len);
    else setChosenMin(min);
    setAfterBreak(false);
    wakeChime();
    // Everything but the clock, the line and the world goes at once, in the same motion as the setup leaving.
    setPeek(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    calmUntil.current = Date.now() + 1200;
    if (live.current.phase === "setup") {
      // One motion: the number glides and scales into the running clock while the rest fades and sinks
      // (see the layout effect below). Reduced motion: a plain short cross fade.
      const glide = !reducedMotion() && !!setupNum.current;
      glideFrom.current = glide ? setupNum.current!.getBoundingClientRect() : null;
      setEntry(glide ? "glide" : "fade");
      setLeaving(true);
      setTimeout(() => setLeaving(false), glide ? GLIDE_MS + 20 : 220);
    } else setEntry("fade");
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
    // Surprise me: every block after the first in this room gets a new world (the first keeps the start screen's).
    if (surprise && sessionAt != null) nextSurprise(world.id);
    setConfirming(null);
    setSessionAt((v) => v ?? at);
    setSeed(at % 1_000_000_007);
    logged.current = 0;
    startedAt.current = at;
    markGone(null);
    setAway(null);
    ownRunning(true);
    saveRunning({ subject, planned: min, startedAt: at, doneMs: 0, savedAt: at, logged: 0, item: focusItem });
    setPhase("focus");
    setPausedLeft(null);
    setEndsAt(at + min * 60_000);
    setNow(at);
    if (sound !== "off") playSound(sound);
    if (me) setStudying({ ...me, name: firstName, subject, since: at });
  };

  // ---- The start glide, before paint: the set up (now laid over the room, fading and sinking) is first put back
  // exactly where it was, then its number travels and scales to the running clock while the clock travels from
  // the number to its place, cross fading on the way. Rects are read once here, never during the motion;
  // only transform and opacity animate.
  useLayoutEffect(() => {
    const from = glideFrom.current;
    const box = setupBox.current;
    const num = setupNum.current;
    const to = runClock.current;
    if (!leaving || entry !== "glide" || !from || !box || !num || !to) return;
    glideFrom.current = null;
    const now1 = num.getBoundingClientRect();
    // The set up's own shift (it left the flow), undone so nothing jumps.
    const sx = from.left - now1.left;
    const sy = from.top - now1.top;
    box.style.transform = `translate(${sx}px, ${sy}px)`;
    const r = to.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    const rx = r.left + r.width / 2;
    const ry = r.top + r.height / 2;
    const k = r.height / Math.max(1, from.height);
    // "25" lands on the "25" of "25:00" (tabular digits, so its share of the width is close to its share of the
    // characters); a length of an hour or more ("1:30:00") meets the clock's middle instead.
    const text = to.textContent ?? "";
    const parts = text.split(":");
    const ax = parts.length === 2 ? r.left + (r.width * (parts[0].length / text.length)) / 2 : rx;
    const d = ax - rx;
    // Travel on the glide's ease; the cross fade on its own, slower, linear clock so it reads as one number
    // turning into the other rather than a swap.
    const travel = { duration: GLIDE_MS, easing: GLIDE_EASE };
    const anims = [
      num.animate([{ transform: "none" }, { transform: `translate(${ax - fx}px, ${ry - fy}px) scale(${k})` }], { ...travel, fill: "forwards" }),
      num.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: "linear", fill: "forwards" }),
      to.animate([{ transform: `translate(${fx - rx - d / k}px, ${fy - ry}px) scale(${1 / k})` }, { transform: "none" }], travel),
      to.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, delay: 60, easing: "linear", fill: "backwards" }),
    ];
    return () => anims.forEach((x) => x.cancel());
  }, [leaving, entry]);

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
      setAfterBreak(true);
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
    setBuilderMood("calm", "nod");
    resume();
  };
  const backFromPaper = () => {
    if (!away) return;
    setBuilderMood("calm", "sheepish");
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
    startBlock(chosenMin);
  };
  /** "Take a 5 minute break" on the finish card: a plain countdown, not counted as focus; it ends on a card that offers another block. */
  const takeBreak = () => {
    const at = Date.now();
    setPeek(false);
    calmUntil.current = at + 1200;
    setEntry("fade");
    setAfterBreak(false);
    setPhase("rest");
    setPausedLeft(null);
    setEndsAt(at + BREAK_MIN * 60_000);
    setNow(at);
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
  const shown = !immersive || peek || within || confirming != null;
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
    // A tap on empty space counts only as a whole touch (down and up) that began inside the running room,
    // after it was shown and settled: the finger that pressed Start (its lift, the click a phone makes after
    // it, or a quick second tap of the same press) never reads as "show the controls".
    const shownAt = performance.now() + 600;
    let press: { id: number; x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      // A control: it stays up for a while after this touch.
      if (t?.closest("button, a, select, input, [role=alertdialog]")) return poke();
      press = e.timeStamp >= shownAt ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    };
    const onUp = (e: PointerEvent) => {
      const p = press;
      press = null;
      if (!p || p.id !== e.pointerId || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 12) return;
      // Empty space: shows them, or hides them at once if they are up.
      if (hideTimer.current) {
        clear();
        setPeek(false);
      } else poke();
    };
    const onCancel = () => (press = null);
    const onMove = (e: PointerEvent) => e.pointerType === "mouse" && Date.now() > calmUntil.current && poke();
    const onKey = () => poke();
    el?.addEventListener("pointerdown", onDown);
    el?.addEventListener("pointerup", onUp);
    el?.addEventListener("pointercancel", onCancel);
    el?.addEventListener("pointermove", onMove);
    window.addEventListener("keydown", onKey);
    return () => {
      clear();
      el?.removeEventListener("pointerdown", onDown);
      el?.removeEventListener("pointerup", onUp);
      el?.removeEventListener("pointercancel", onCancel);
      el?.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [immersive]);
  // Back from a pause (or the away sheet): the controls stay up for a moment, then go.
  // Up in the same render as the resume, so the room never flashes clean (and the app's bar never twitches) in between.
  const heldNow = running && !immersive;
  const [heldBefore, setHeldBefore] = useState(heldNow);
  if (heldBefore !== heldNow) {
    setHeldBefore(heldNow);
    if (heldBefore && immersive) setPeek(true);
  }
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
  // Before paint, so the bar, the controls, the clock and the line all start moving in the same frame.
  const dockDown = !shown && !held;
  const dockWant = useRef(dockDown);
  useLayoutEffect(() => {
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
        // The set up's small sheet, or the End confirm: Escape closes just that.
        if (sheetOpen) return setSheetOpen(false);
        if (confirming != null) return setConfirming(null);
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
  // The clean state is one attribute on the room (data-clean): the controls fade, the clock rises and the line
  // drops in one motion, both ways, with the phone app's bar (the room's style below). Reduced motion: a plain short fade.
  const fade = "gw-fade";
  // The line of quote: it changes every few minutes through a focus block; the closing line through the break.
  const line = phase === "rest" ? QUOTES[QUOTES.length - 1] : pickQuote(QUOTES, focusMin, Math.max(0, total - left), seed);
  // The quote shows for 8 seconds when a block starts or the line changes, then fades (it comes back with the controls).
  const lineKey = `${seed}|${phase}|${line?.text ?? ""}`;
  const [quoteKey, setQuoteKey] = useState(lineKey);
  const [quoteOn, setQuoteOn] = useState(true);
  if (quoteKey !== lineKey) {
    setQuoteKey(lineKey);
    setQuoteOn(true);
  }
  useEffect(() => {
    if (!quoteOn) return;
    const t = setTimeout(() => setQuoteOn(false), 8000);
    return () => clearTimeout(t);
  }, [quoteOn, quoteKey]);
  const corner = "w-glass w-press flex h-11 w-11 items-center justify-center rounded-full";
  const quietLink = "w-soft w-link inline-flex min-h-11 items-center rounded-full px-2 font-medium";
  const pillBase = "w-glass w-press inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full font-semibold";
  const pill = cn(pillBase, "px-5 text-[15px]");
  const gold = buttonClasses({ size: "lg", className: "min-h-12 rounded-full" });
  const soundLabel = sound === "off" ? "Silence" : (SOUNDS.find((x) => x.id === sound)?.label ?? "Silence");

  // End: after more than a minute of focus, one quiet confirm first (like the Clock app's Cancel, but kinder).
  const askEnd = () => {
    const ms = live.current.phase === "focus" ? doneMs(Date.now()) : 0;
    if (ms > 60_000) setConfirming(Math.floor(ms / 60_000));
    else void end();
  };
  const doneNowMin = confirming ?? 0;

  // The goal nearest to done, from numbers the page already has: the weekly hours goal (if they set one),
  // else this week's study days against their days target. Never a goal that isn't there.
  const goal = (() => {
    const st = currentStats(profile.focus, now);
    const hours = Number(profile.weeklyGoal) > 0 ? Number(profile.weeklyGoal) : 0;
    if (hours) {
      const want = hours * 60;
      const got = st.weekMinutes;
      if (got >= want) return { frac: 1, label: "Weekly goal reached", near: false };
      return { frac: got / want, label: `${fmtMin(want - got)} to your weekly goal`, near: got / want >= 0.6 };
    }
    const target = profile.daysTarget ?? DEFAULT_DAYS_TARGET;
    const wk = weekStreak(profile.focus, target, now);
    if (wk.hit) return { frac: 1, label: `${target} of ${target} study days. Week done`, near: false };
    const more = target - wk.thisWeek;
    return { frac: wk.thisWeek / target, label: `${more} more study ${more === 1 ? "day" : "days"} to your week`, near: wk.thisWeek > 0 && more <= 2 };
  })();

  // The world's colours (lib/groundwork-worlds/list.ts): set on the room, they cross fade when the world changes.
  const pal = world.palette;
  const vars = { "--w-ink": pal.ink, "--w-light": pal.light, "--w-shade": pal.shade, "--w-shade-low": pal.shadeLow, "--w-glow": pal.glow } as React.CSSProperties;

  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={STUDY_NAME}
      data-clean={running && hide ? "" : undefined}
      style={vars}
      className={cn("focus-dark fixed inset-0 z-[70] overflow-hidden outline-none", hide && "cursor-none")}
    >
      {/* Their world, building as they focus. The shade is the scene's own dark, gentle, and strongest only behind text:
          while timing just at the top (clock) and foot (quote, controls); around the set up and the finish a little more,
          most behind the middle. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <World world={world.id} progress={worldProgress} phase={worldPhase} builder={builder} className="absolute inset-0 overflow-hidden" />
        <div className="w-scrim-run absolute inset-0 transition-opacity duration-700 ease-out" style={{ opacity: running ? 1 : 0 }} />
        <div className="w-scrim-still absolute inset-0 transition-opacity duration-700 ease-out" style={{ opacity: running ? 0 : 1 }} />
      </div>

      <div
        className={cn(
          "room-body relative mx-auto flex h-full w-full max-w-5xl flex-col px-5 sm:px-8",
          "pt-[max(0.75rem,env(safe-area-inset-top))]",
          (phase === "setup" || phase === "done") && "overflow-y-auto overscroll-contain",
        )}
      >
        {/* Top bar: two small glass corner icons at most. Set up: close (left) and the subject, sound and world sheet
            (right). While a block runs: float and full screen, only while the controls are shown. */}
        <div className={cn("flex h-14 shrink-0 items-center justify-between gap-3", running && fade)} data-gw-controls={running ? "" : undefined}>
          {phase === "setup" ? (
            <button type="button" onClick={close} className={corner} aria-label="Close">
              <Glyph.X />
            </button>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 items-center gap-2">
            {phase === "setup" && (
              <button type="button" onClick={() => setSheetOpen(true)} className={corner} aria-haspopup="dialog" aria-expanded={sheetOpen} aria-label={`Subject, sound and scene: ${subject === OTHER_CHOICE ? "Study" : subject}, ${soundLabel}`}>
                <Glyph.Sliders />
              </button>
            )}
            {running && float.kind && (
              <button type="button" onClick={() => void (float.active ? float.close() : float.open())} className={corner} aria-label={float.active ? "Stop floating the timer" : "Float the timer over other apps"} title="Float (P)">
                <Glyph.Float />
              </button>
            )}
            {running && fsOk && (
              <button type="button" onClick={toggleFs} className={corner} aria-label={fs ? "Exit full screen" : "Full screen"} title="Full screen (F)">
                {fs ? <Glyph.Shrink /> : <Glyph.Expand />}
              </button>
            )}
          </div>
        </div>

        {(phase === "setup" || leaving) && (
          <div
            ref={setupBox}
            className={cn(
              "flex flex-1 flex-col items-center text-center",
              phase !== "setup" && "pointer-events-none absolute inset-x-5 top-[calc(3.5rem+max(0.75rem,env(safe-area-inset-top)))] bottom-[var(--room-pb)] sm:inset-x-8",
              phase !== "setup" && (entry === "glide" ? "gw-leave-glide" : "gw-leave"),
            )}
            inert={phase !== "setup"}
            aria-hidden={phase !== "setup" || undefined}
          >
            {/* How long: high in the sky of every scene, clear of the builder. Hold minus or plus to run; tap the number to type. */}
            <div className="mt-[clamp(0.5rem,7dvh,4rem)]">
              <LengthPicker value={focusMin} onChange={setFocusMin} numRef={setupNum} />
            </div>
            {/* Start: alone, low, near the thumb. */}
            <button type="button" onClick={() => startBlock()} className={cn(gold, "gw-sink mb-4 mt-auto w-full max-w-[300px]")}>
              Start
            </button>
          </div>
        )}

        {running && (
          <div className={cn("flex flex-1 flex-col items-center", entry === "fade" && "gw-in")}>
            {/* The clock and its hairline: all there is at rest. */}
            <div className="gw-rise mt-[clamp(0rem,6dvh,3.5rem)] flex flex-col items-center text-center">
              <p
                ref={runClock}
                role="timer"
                aria-live="off"
                aria-label={`${clock(left)} ${phase === "rest" ? "of the break" : `left of ${focusMin} minutes`}${pausedLeft != null ? ", paused" : ""}`}
                className={cn("w-ink room-count font-semibold leading-none tabular-nums tracking-[-0.045em] transition-opacity duration-300", held && "opacity-60")}
              >
                {clock(left)}
              </p>
              <SegmentDots totalMs={total} doneMs={Math.max(0, total - left)} held={held} className={cn("mt-5", entry === "glide" && "gw-in-late")} />
              {/* Words only for a state that isn't obvious: paused, or the break. */}
              <p aria-hidden className="w-soft mt-3 min-h-5 text-[13px]">
                {pausedLeft != null ? "Paused" : phase === "rest" ? "Break" : ""}
              </p>
            </div>

            {/* The line of quote, small and quiet: it shows for a few seconds when it changes (and with the controls), then fades,
                so at rest only the clock and the hairline remain. */}
            <div className="gw-drop mt-auto w-full max-w-sm px-4 pb-3 pt-6">
              <div className={cn("transition-opacity duration-700 ease-out", entry === "glide" && "gw-in-late")} style={{ opacity: quoteOn || shown ? 1 : 0 }}>
                <QuoteLine line={line} />
              </div>
            </div>
          </div>
        )}

        {sheet && (
          <div className="room-foot shrink-0">
            <div role="alertdialog" aria-labelledby="gw-away-title" className="w-card away-in mx-auto w-full max-w-sm rounded-[28px] p-5 text-center">
              <p id="gw-away-title" className="w-ink text-base font-medium leading-snug [text-wrap:balance]">
                You were away {awayLabel(sheet.ms)}. Your world waited for you.
              </p>
              <button ref={resumeBtn} type="button" onClick={backAndResume} className={cn(gold, "mt-4 w-full")}>
                Resume
              </button>
              <button type="button" onClick={backFromPaper} className={cn(pill, "mt-2 w-full")}>
                I was studying on paper
              </button>
            </div>
          </div>
        )}

        {running && !sheet && (
          <div className={cn("room-foot shrink-0", fade)} data-gw-controls="">
            {confirming != null ? (
              <div role="alertdialog" aria-labelledby="gw-end-title" className="w-card away-in mx-auto flex w-full max-w-[340px] flex-col gap-3 rounded-[28px] p-4 text-center">
                <p id="gw-end-title" className="w-ink text-[15px] leading-snug">
                  {doneNowMin >= MIN_COUNTED ? `End now? Your ${doneNowMin} ${doneNowMin === 1 ? "minute is" : "minutes are"} saved.` : "End now? Under 5 minutes isn't saved."}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => void end()} className={pill}>
                    End
                  </button>
                  <button type="button" autoFocus onClick={() => setConfirming(null)} className={pill}>
                    Keep going
                  </button>
                </div>
              </div>
            ) : (
              // Like the Clock app: End on the left, Pause (the main one) on the right. Nothing gold while timing.
              <div className="mx-auto grid w-full max-w-[320px] grid-cols-2 gap-3">
                <button type="button" onClick={askEnd} className={pill} aria-label="End session">
                  End
                </button>
                <button type="button" onClick={phase === "rest" ? skipBreak : togglePause} className={pill} aria-label={phase === "rest" ? "Skip the break" : undefined}>
                  {phase === "rest" ? "Skip break" : pausedLeft != null ? "Resume" : "Pause"}
                </button>
              </div>
            )}
          </div>
        )}

        {phase === "done" && receipt && (
          <div className="flex flex-1 flex-col items-center justify-end gap-4 pb-2 pt-6">
            {/* Low on the screen, so the finished build stays in view above it. The card rises; today's circle ticks in the scene's light.
                One message, the week's circles (or one quick question), one button. */}
            <div className="gw-finish w-card w-full max-w-[340px] rounded-[28px] px-6 pb-4 pt-7 text-center">
              <h2 className="w-ink text-title font-semibold tracking-[-0.025em]">{afterBreak ? "Break over." : "Nicely done."}</h2>
              <p className="w-soft mt-1.5 text-base [text-wrap:balance]">
                {afterBreak
                  ? "Ready for another block?"
                  : `${receipt.focusedMin} ${receipt.focusedMin === 1 ? "minute" : "minutes"} of ${mission?.item ? mission.item.title : subject === OTHER_CHOICE ? "study" : subject}`}
              </p>
              {/* The middle line: a quick question when there is one (how the topic went, or whether they finished), else the nearest goal. */}
              {!afterBreak && mission && !mission.item && subject === mission.subject && !checked ? (
                <Ask
                  q={`How did ${mission.topic} go?`}
                  a={["Got it", "Still shaky"]}
                  onPick={(i) => {
                    const key = topicKey(mission.subject, mission.topic);
                    if (i === 0) {
                      setChecked("got");
                      updateProfile((latest) => ({ reviews: reviewDone(latest.reviews, key, Date.now()) }));
                    } else {
                      setChecked("shaky");
                      const tomorrow = addDays(pkDate(Date.now()), 1);
                      updateProfile((latest) => ({ reviews: { ...latest.reviews, [key]: { step: latest.reviews?.[key]?.step ?? 0, due: tomorrow } } }));
                    }
                  }}
                />
              ) : !afterBreak && receipt.intention && finished == null ? (
                <Ask q="Did you finish it?" a={["Yes", "Not yet"]} onPick={(i) => setFinished(i === 0)} />
              ) : (
                <WeekDots className="mt-6" days={weekDays(profile.focus, now)} label={goal.label} />
              )}
              <div className="mt-6">
                {afterBreak ? (
                  <button type="button" onClick={() => startBlock(chosenMin)} className={cn(gold, "w-full")}>
                    Start {chosenMin} minutes
                  </button>
                ) : (
                  <button type="button" onClick={close} className={cn(gold, "w-full")}>
                    Done
                  </button>
                )}
              </div>
              <p className="mt-2 flex items-center justify-center gap-1 text-sm">
                {afterBreak ? (
                  <button type="button" onClick={close} className={quietLink}>
                    Done
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => startBlock(5)} className={quietLink}>
                      5 more minutes
                    </button>
                    <span aria-hidden className="w-soft opacity-60">·</span>
                    <button type="button" onClick={takeBreak} className={quietLink}>
                      5 minute break
                    </button>
                  </>
                )}
              </p>
            </div>
            <button type="button" onClick={() => setShowReceipt((v) => !v)} aria-expanded={showReceipt} className={cn(quietLink, "gw-finish-late text-[13px]")}>
              {showReceipt ? "Hide receipt" : "See receipt"}
            </button>
            {showReceipt && (
              <div className="flex w-full max-w-[340px] flex-col gap-3 pb-4">
                <Receipt r={receipt} variant="glass" className="gw-sheet" />
                <ShareReceipt r={receipt} scene={scene} buttonClassName={cn(pill, "w-full gap-2")} />
                {mission?.item?.href && (
                  <Link href={mission.item.href} className={cn(quietLink, "self-center")}>
                    {mission.item.kind === "test" ? "Go to the test" : "Go to the homework"}
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {sheetOpen && phase === "setup" && (
        <SetupSheet
          onClose={() => setSheetOpen(false)}
          subject={subject}
          subjects={subjectChoices}
          onSubject={setSubject}
          sound={sound}
          onSound={setSound}
          world={world.id}
          surprise={surprise}
          onWorld={(id) => updateProfile({ world: id })}
          noteHref={mission?.noteHref}
          onSurprise={() => {
            if (surprise) return;
            nextSurprise(world.id);
            updateProfile({ world: SURPRISE });
          }}
        />
      )}

      {float.portal}

      <style>{`
        /* The world's colours, registered so a change of world cross fades them. */
        @property --w-ink { syntax: "<color>"; inherits: true; initial-value: #f4f2ee; }
        @property --w-light { syntax: "<color>"; inherits: true; initial-value: #e6e2da; }
        @property --w-shade { syntax: "<color>"; inherits: true; initial-value: #0d0c0b; }
        @property --w-shade-low { syntax: "<color>"; inherits: true; initial-value: #171412; }
        @property --w-glow { syntax: "<color>"; inherits: true; initial-value: #f3d9a4; }
        .focus-dark {
          transition: --w-ink .9s ease, --w-light .9s ease, --w-shade .9s ease, --w-shade-low .9s ease, --w-glow .9s ease;
          background: var(--w-shade);
          color: var(--w-ink);
          /* Derived from the five: secondary text, the glass, its hairline, the scrim. */
          --w-ink-soft: color-mix(in srgb, var(--w-ink) 84%, transparent);
          --w-glass: color-mix(in srgb, var(--w-light) 11%, color-mix(in srgb, var(--w-shade) 24%, transparent));
          --w-glass-hover: color-mix(in srgb, var(--w-light) 17%, color-mix(in srgb, var(--w-shade) 24%, transparent));
          --w-glass-border: color-mix(in srgb, var(--w-light) 22%, transparent);
          --w-scrim-top: color-mix(in srgb, var(--w-shade) 64%, transparent);
          --w-scrim-bottom: color-mix(in srgb, var(--w-shade-low) 72%, transparent);
          --gw-glide: 450ms cubic-bezier(0.33, 1, 0.68, 1); --gw-drop: 52px;
        }
        .w-ink { color: var(--w-ink); text-shadow: 0 1px 24px color-mix(in srgb, var(--w-shade) 55%, transparent); }
        .w-soft { color: var(--w-ink-soft); }
        .w-link { transition: color 150ms ease; } .w-link:hover { color: var(--w-ink); }
        .w-divider { border-color: var(--w-glass-border); }
        .w-scrim-run { background: linear-gradient(180deg, var(--w-scrim-top), color-mix(in srgb, var(--w-shade) 16%, transparent) 30%, transparent 46%, transparent 64%, var(--w-scrim-bottom)); }
        .w-scrim-still { background:
          radial-gradient(90% 30% at 50% 24%, color-mix(in srgb, var(--w-shade) 40%, transparent), transparent 80%),
          linear-gradient(180deg, var(--w-scrim-top), color-mix(in srgb, var(--w-shade) 18%, transparent) 45%, color-mix(in srgb, var(--w-shade) 10%, transparent) 65%, var(--w-scrim-bottom)); }
        /* Entry animations on glass use fill backwards (never both): an opacity effect left on the element stops its backdrop blur. */
        /* Frosted glass: a little of the scene's light over a little of its shade, blurred, a hairline edge, no shadow. */
        .w-glass {
          color: var(--w-ink);
          background: var(--w-glass);
          border: 1px solid var(--w-glass-border);
          -webkit-backdrop-filter: blur(14px) saturate(1.25);
          backdrop-filter: blur(14px) saturate(1.25);
          transition: background-color 150ms ease, opacity 150ms ease, transform 150ms ease;
        }
        .w-glass:hover { background: var(--w-glass-hover); }
        .w-press:active { transform: scale(.97); }
        .w-glass:focus-visible, .w-icon:focus-visible, .w-link:focus-visible { outline: 2px solid var(--w-ink); outline-offset: 2px; }
        .w-card {
          color: var(--w-ink);
          background: color-mix(in srgb, var(--w-light) 9%, color-mix(in srgb, var(--w-shade) 40%, transparent));
          border: 1px solid var(--w-glass-border);
          -webkit-backdrop-filter: blur(22px) saturate(1.3);
          backdrop-filter: blur(22px) saturate(1.3);
        }
        .w-icon { color: var(--w-ink-soft); transition: color 150ms ease; } .w-icon:hover { color: var(--w-ink); }
        /* Circles, never lines: the running block's dots and the week's days. Hairline rings, soft fills. */
        .w-dot { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--w-ink) 45%, transparent); }
        .w-dot-fill { background: var(--w-ink); transition: opacity 600ms ease; }
        @keyframes gw-breathe { 0%, 100% { opacity: .15; } 50% { opacity: .55; } }
        .gw-breathe { animation: gw-breathe 2.4s ease-in-out infinite; }
        .w-day { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--w-ink) 30%, transparent); }
        .w-day-on { background: color-mix(in srgb, var(--w-ink) 88%, transparent); color: var(--w-shade); }
        .w-day-today { background: color-mix(in srgb, var(--w-glow) 92%, transparent); color: var(--w-shade); box-shadow: 0 0 14px color-mix(in srgb, var(--w-glow) 55%, transparent); }
        @keyframes gw-tick { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        .gw-tick { stroke-dasharray: 1; stroke-dashoffset: 1; animation: gw-tick 350ms cubic-bezier(0.33, 1, 0.68, 1) 820ms forwards; }
        .room-count { font-size: clamp(5rem, min(23vw, 15dvh), 11rem); }
        .room-len { font-size: clamp(5rem, min(27vw, 18dvh), 10.5rem); }
        .room-body { --room-pb: max(1rem, env(safe-area-inset-bottom)); padding-bottom: var(--room-pb); }
        .room-foot { padding-bottom: .5rem; }
        /* One gesture, the same both ways and the same as the phone app's own timer and bar (450ms, ease out, no bounce):
           with the room clean (data-clean) the controls fade, the clock rises a little and the line drops into the space
           Pause and End leave. Transforms and opacity only. */
        .gw-fade, .gw-rise, .gw-drop { transition: opacity var(--gw-glide), transform var(--gw-glide); }
        [data-clean] .gw-fade { opacity: 0; transform: translateY(7px); pointer-events: none; }
        [data-clean] .gw-rise { transform: translateY(calc(-1 * min(4dvh, 2.5rem))); }
        [data-clean] .gw-drop { transform: translateY(var(--gw-drop)); }
        /* In the phone app its floating tab bar (112px above the safe area) lies over the bottom of the web view: keep everything clear of it.
           While the app has hidden the bar (data-dock-hidden, set in the same frame as data-clean), the line also drops into the bar's space,
           to a comfortable margin above the home indicator. */
        @media (max-width: 767px) {
          html[data-app] .room-body { --room-pb: calc(112px + env(safe-area-inset-bottom)); }
          html[data-app] [data-dock-hidden] { --gw-drop: calc(52px + 112px + env(safe-area-inset-bottom) - max(1rem, env(safe-area-inset-bottom))); }
        }
        @keyframes gw-in { from { opacity: 0; } }
        @keyframes gw-out { to { opacity: 0; } }
        .gw-in { animation: gw-in var(--gw-glide) both; }
        .gw-leave { animation: gw-out var(--gw-glide) both; }
        .gw-in-late { animation: gw-in 420ms ease-out 280ms both; }
        /* The start: everything on the set up but the number fades and sinks while the number glides into the clock. */
        @keyframes gw-sink { to { opacity: 0; transform: translateY(16px); } }
        .gw-leave-glide .gw-sink { animation: gw-sink 420ms cubic-bezier(0.33, 1, 0.68, 1) both; }
        /* The length's digits: only a digit that changes rolls (up for more, down for less). */
        @keyframes gw-roll-in-up { from { opacity: 0; transform: translateY(.38em); } }
        @keyframes gw-roll-in-down { from { opacity: 0; transform: translateY(-.38em); } }
        @keyframes gw-roll-out-up { to { opacity: 0; transform: translateY(-.38em); } }
        @keyframes gw-roll-out-down { to { opacity: 0; transform: translateY(.38em); } }
        .gw-roll-in-up { animation: gw-roll-in-up 180ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .gw-roll-in-down { animation: gw-roll-in-down 180ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .gw-roll-out-up { animation: gw-roll-out-up 180ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        .gw-roll-out-down { animation: gw-roll-out-down 180ms cubic-bezier(0.22, 1, 0.36, 1) both; }
        @keyframes gw-finish { from { opacity: 0; transform: translateY(18px); } }
        .gw-finish { animation: gw-finish 620ms cubic-bezier(0.22, 1, 0.36, 1) 380ms backwards; }
        .gw-finish-late { animation: gw-finish 620ms cubic-bezier(0.22, 1, 0.36, 1) 560ms backwards; }
        @keyframes gw-sheet { from { opacity: 0; transform: translateY(24px); } }
        .gw-sheet { animation: gw-sheet 320ms cubic-bezier(0.22, 1, 0.36, 1) backwards; }
        .gw-line-in { animation: gw-in .6s ease-out both; }
        .gw-line-out { animation: gw-out .6s ease-out both; }
        /* Reduced motion: nothing moves, just a plain short fade (the site's global rule would make it instant). */
        @media (prefers-reduced-motion: reduce) {
          .gw-fade { transform: none !important; transition: opacity 200ms linear !important; }
          .gw-rise, .gw-drop { transform: none !important; transition: none !important; }
          .gw-in, .gw-leave, .gw-line-in, .gw-line-out, .gw-in-late { animation-duration: 200ms !important; animation-delay: 0ms !important; }
          .gw-roll-in-up, .gw-roll-in-down, .gw-roll-out-up, .gw-roll-out-down, .gw-breathe { animation: none !important; }
          .gw-breathe { opacity: .35; }
          .gw-tick { animation: none !important; stroke-dashoffset: 0; }
          .gw-finish, .gw-finish-late, .gw-sheet { animation: gw-in 200ms linear backwards !important; }
          .focus-dark { transition: none; }
        }
        .no-scrollbar { scrollbar-width: none; } .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes away-in { from { opacity: 0; transform: translateY(8px); } }
        @media (prefers-reduced-motion: no-preference) { .away-in { animation: away-in .4s ease-out backwards; } }
      `}</style>
    </div>
  );
}

const S = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const Glyph = {
  Sliders: () => (
    <svg {...S}>
      <path d="M4 8h9M17 8h3M4 16h3M11 16h9" />
      <circle cx="15" cy="8" r="2" />
      <circle cx="9" cy="16" r="2" />
    </svg>
  ),
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
            className={cn("col-start-1 row-start-1 self-end", lines.length > 1 && (old ? "gw-line-out" : "gw-line-in"))}
          >
            <blockquote className="w-soft line-clamp-2 text-[13px] leading-snug [text-wrap:balance]">{l.line.by ? `“${l.line.text}”` : l.line.text}</blockquote>
            {l.line.by && <figcaption className="w-soft mt-0.5 text-[11px] opacity-75">{l.line.by}</figcaption>}
          </figure>
        );
      })}
    </div>
  );
}

const fmtMin = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`);

/** A soft sideways nudge: the answer to a press at a limit (never a dead tap). Skipped with reduced motion; the dimmed button says it. */
function nudge(el: Element | null) {
  if (!el || reducedMotion()) return;
  el.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }],
    { duration: 320, easing: "ease-out" },
  );
}

/** One quick question on the finish card, answered with two quiet words. */
function Ask({ q, a, onPick }: { q: string; a: [string, string]; onPick: (i: 0 | 1) => void }) {
  const link = "w-glass w-press inline-flex min-h-10 items-center rounded-full px-4 text-sm font-medium";
  return (
    <div className="mt-6">
      <p className="w-soft text-[13px]">{q}</p>
      <div className="mt-2 flex justify-center gap-2">
        <button type="button" onClick={() => onPick(0)} className={link}>
          {a[0]}
        </button>
        <button type="button" onClick={() => onPick(1)} className={link}>
          {a[1]}
        </button>
      </div>
    </div>
  );
}

/** The soft glass round button for minus 5 and plus 5. */
const glassRound =
  "w-glass relative flex shrink-0 select-none items-center justify-center rounded-full font-medium tabular-nums [touch-action:manipulation] [-webkit-touch-callout:none] active:scale-[0.96]";

/**
 * The running block as a few small circles, one per 5 minutes (at most 12: longer blocks give each circle more
 * minutes, so the row never wraps). Done circles fill softly; the current one breathes while the clock runs.
 */
function SegmentDots({ totalMs, doneMs, held, className }: { totalMs: number; doneMs: number; held: boolean; className?: string }) {
  const totalMin = Math.max(1, Math.round(totalMs / 60_000));
  const n = Math.max(1, Math.min(12, Math.ceil(totalMin / 5)));
  const per = totalMs / n;
  const filled = Math.min(n, Math.floor((doneMs + 250) / per));
  return (
    <span aria-hidden className={cn("flex items-center justify-center gap-2", className)}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="w-dot relative block h-1.5 w-1.5 rounded-full">
          <span className={cn("w-dot-fill absolute inset-0 rounded-full", i < filled ? "opacity-100" : i === filled && !held ? "gw-breathe" : "opacity-0")} />
        </span>
      ))}
    </span>
  );
}

/**
 * The week as seven circles, Monday to Sunday: a day with focus is filled with a tick; today's tick draws in
 * (in the scene's light) as the card rises. One honest line of words above.
 */
function WeekDots({ days, label, className }: { days: Array<{ date: string; minutes: number; isToday: boolean }>; label: string; className?: string }) {
  return (
    <div className={cn("mx-auto", className)}>
      <p className="w-soft text-[13px]">{label}</p>
      <div className="mt-3 flex items-center justify-center gap-2.5" role="img" aria-label={`Studied on ${days.filter((d) => d.minutes > 0).length} of 7 days this week`}>
        {days.map((d) => {
          const on = d.minutes > 0;
          return (
            <span key={d.date} className={cn("relative flex h-6 w-6 items-center justify-center rounded-full", on ? (d.isToday ? "w-day-today" : "w-day-on") : "w-day")}>
              {on && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M2.5 6.3 5 8.6l4.5-5" pathLength={1} className={d.isToday ? "gw-tick" : undefined} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The set up's small sheet: what this block is for (subject), the sound, and the world (Surprise me first).
 * Frosted glass over the scene; closes on a tap outside, Escape (the room's key handler) or Done.
 */
function SetupSheet({
  onClose,
  subject,
  subjects,
  onSubject,
  sound,
  onSound,
  world,
  surprise,
  onWorld,
  onSurprise,
  noteHref,
}: {
  onClose: () => void;
  /** The block's notes, when it has some: a quiet link at the foot of the sheet. */
  noteHref?: string;
  subject: string;
  subjects: string[];
  onSubject: (s: string) => void;
  sound: Sound;
  onSound: (s: Sound) => void;
  world: WorldId;
  surprise: boolean;
  onWorld: (id: WorldId) => void;
  onSurprise: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus({ preventScroll: true });
  }, []);
  const chip = (on: boolean) =>
    cn("w-press inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors duration-150", on ? "w-chip-on font-semibold" : "w-chip");
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label="Subject, sound and world"
        className="w-card gw-sheet mx-3 mb-[calc(var(--room-pb)+0.5rem)] w-full max-w-md rounded-[28px] p-5"
      >
        <p className="w-soft text-xs font-medium">Subject</p>
        <div role="radiogroup" aria-label="Subject" className="mt-2 flex flex-wrap gap-2">
          {subjects.map((x) => (
            <button key={x} type="button" role="radio" aria-checked={subject === x} onClick={() => onSubject(x)} className={chip(subject === x)}>
              {x}
            </button>
          ))}
        </div>
        <p className="w-soft mt-5 text-xs font-medium">Sound</p>
        <div role="radiogroup" aria-label="Sound" className="mt-2 flex flex-wrap gap-2">
          {SOUNDS.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={sound === x.id} onClick={() => onSound(x.id)} className={chip(sound === x.id)}>
              {x.id === "off" ? "Silence" : x.label}
            </button>
          ))}
        </div>
        <p className="w-soft mt-5 text-xs font-medium">World</p>
        <div role="radiogroup" aria-label="World" className="mt-2 grid grid-cols-5 gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={surprise}
            aria-label="Surprise me: a different world each block"
            onClick={onSurprise}
            className={cn("w-press flex aspect-[3/4] items-center justify-center rounded-2xl border transition-colors duration-150", surprise ? "w-chip-on" : "w-chip")}
          >
            <ShuffleGlyph size={20} />
          </button>
          {WORLDS.map((w) => {
            const on = !surprise && w.id === world;
            return (
              <button
                key={w.id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={w.title}
                onClick={() => onWorld(w.id)}
                className={cn("w-press relative aspect-[3/4] overflow-hidden rounded-2xl border-2 transition-[border-color] duration-150", on ? "border-[var(--w-ink)]" : "border-transparent")}
                style={{ background: w.sky }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.thumb} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
        {noteHref && (
          <Link href={noteHref} className="w-soft w-link mt-4 inline-flex min-h-11 items-center text-sm font-medium">
            Open the notes first
          </Link>
        )}
        <button type="button" onClick={onClose} className="w-glass w-press mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-full text-[15px] font-semibold">
          Done
        </button>
      </div>
      <style>{`
        .w-chip { color: var(--w-ink-soft); border-color: var(--w-glass-border); background: transparent; }
        .w-chip:hover { color: var(--w-ink); }
        .w-chip-on { color: var(--w-ink); border-color: color-mix(in srgb, var(--w-ink) 55%, transparent); background: color-mix(in srgb, var(--w-light) 16%, transparent); }
        .w-chip:focus-visible, .w-chip-on:focus-visible { outline: 2px solid var(--w-ink); outline-offset: 2px; }
      `}</style>
    </div>
  );
}

/**
 * The set up's length: one big number (minutes) between minus 5 and plus 5. Press and hold runs it (after 0.4 s,
 * a step every 120 ms, then every 60 ms after 1.5 s). Tapping the number opens a numeric field (whole minutes,
 * kept to 5 to 180). The buttons dim at the limits and a press there nudges the number.
 */
function LengthPicker({ value, onChange, numRef }: { value: number; onChange: (v: number) => void; numRef: React.RefObject<HTMLSpanElement | null> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const current = useRef(value);
  useLayoutEffect(() => {
    current.current = value;
  }, [value]);
  const row = useRef<HTMLDivElement>(null);
  const hold = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (hold.current != null) clearTimeout(hold.current);
    hold.current = null;
  }, []);
  useEffect(() => stop, [stop]);
  /** One step; false at a limit (and the number nudges). */
  const bump = (dir: 1 | -1) => {
    const cur = current.current;
    if (dir < 0 ? cur <= MIN_LEN : cur >= MAX_LEN) {
      nudge(row.current);
      return false;
    }
    const next = stepLen(cur, dir);
    current.current = next;
    onChange(next);
    return true;
  };
  const press = (dir: 1 | -1) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    stop();
    if (!bump(dir)) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    const began = performance.now();
    const run = (wait: number) => {
      hold.current = window.setTimeout(() => {
        if (!bump(dir)) return stop();
        run(performance.now() - began > 1500 ? 60 : 120);
      }, wait);
    };
    run(400);
  };
  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onChange(clampLen(n));
    setEditing(false);
  };
  const button = (dir: 1 | -1) => {
    const can = dir < 0 ? value > MIN_LEN : value < MAX_LEN;
    return (
      <button
        type="button"
        aria-label={dir < 0 ? "5 minutes less" : "5 minutes more"}
        aria-disabled={!can || undefined}
        onPointerDown={press(dir)}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
        onContextMenu={(e) => e.preventDefault()}
        // A pointer press is handled on the way down (so holding runs); the keyboard's Enter or Space arrives as a click with no detail.
        onClick={(e) => e.detail === 0 && bump(dir)}
        className={cn(glassRound, "h-14 w-14 text-[17px] sm:h-16 sm:w-16", !can && "opacity-35")}
      >
        <span aria-hidden>{dir < 0 ? "− 5" : "+ 5"}</span>
      </button>
    );
  };
  return (
    <div className="mt-5 flex flex-col items-center">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 sm:gap-6">
        <span className="gw-sink">{button(-1)}</span>
        <div ref={row} className="flex min-w-[3.3ch] justify-center room-len">
          {editing ? (
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="done"
              maxLength={3}
              aria-label="Minutes, 5 to 180"
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                else if (e.key === "Escape") {
                  // Escape here only leaves the field (the room's own Escape would close it).
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              className="w-glass w-[3.3ch] rounded-3xl text-center font-semibold leading-none tabular-nums tracking-[-0.045em] caret-[var(--w-ink)] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setDraft(String(value));
                setEditing(true);
              }}
              aria-label={`${value} minutes. Tap to type a length`}
              className="w-ink w-link rounded-2xl px-1 font-semibold leading-none tabular-nums tracking-[-0.045em]"
            >
              <span ref={numRef} className="relative inline-block">
                <RollNumber value={value} />
                {/* "min", small and tight to the number's baseline, outside its box so the number stays centred. */}
                <span aria-hidden className="w-soft absolute bottom-[0.08em] left-full ml-1.5 text-[0.16em] font-medium tracking-normal">
                  min
                </span>
              </span>
            </button>
          )}
        </div>
        <span className="gw-sink">{button(1)}</span>
      </div>
      <p className="sr-only" aria-live="polite">
        {value} minutes
      </p>
    </div>
  );
}

/** A number whose changed digits roll (about 180 ms); tabular digits, so nothing around it moves. */
function RollNumber({ value }: { value: number }) {
  const [state, setState] = useState({ cur: value, old: null as number | null, dir: 1 as 1 | -1, key: 0 });
  if (state.cur !== value) setState((s) => ({ cur: value, old: s.cur, dir: value > s.cur ? 1 : -1, key: s.key + 1 }));
  useEffect(() => {
    if (state.old == null) return;
    const t = setTimeout(() => setState((s) => (s.key === state.key ? { ...s, old: null } : s)), 200);
    return () => clearTimeout(t);
  }, [state.old, state.key]);
  const now = String(state.cur);
  const was = state.old == null ? null : String(state.old);
  const way = state.dir > 0 ? "up" : "down";
  return (
    <span aria-hidden className="inline-flex">
      {now.split("").map((d, i) => {
        const fromRight = now.length - 1 - i;
        const prev = was == null ? undefined : was[was.length - 1 - fromRight];
        if (was == null || prev === d) return <span key={`s${fromRight}`} className="inline-block">{d}</span>;
        return (
          <span key={`r${fromRight}-${state.key}`} className="relative inline-block">
            <span className={cn("inline-block", `gw-roll-in-${way}`)}>{d}</span>
            {prev != null && <span className={cn("absolute inset-0", `gw-roll-out-${way}`)}>{prev}</span>}
          </span>
        );
      })}
    </span>
  );
}
