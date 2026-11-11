"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { STUDY_NAME, MIN_COUNTED, currentStats, quoteFor, recordFocus, recordFocusOn } from "@/lib/focus";
import { clearRunning, loadRunning, minutesToAdd, ownRunning, saveRunning } from "@/components/student/focus-session";
import { useBackToClose } from "@/components/student/useBackToClose";
import { AWAY_GRACE_MS, awayFor, awayLabel, creditedAway, hideTip, setFocusRoomOpen, tipHidden } from "@/components/student/focus-away";
import { cn } from "@/lib/cn";
import { displayName } from "@/lib/display-name";
import { worldScene, reviewDone, topicKey } from "@/lib/groundwork";
import { worldFor, type WorldPhase } from "@/lib/groundwork-worlds";
import { pkDate, addDays } from "@/lib/timetable";
import { setStudying } from "@/components/student/StudyRoom";
import { SOUNDS, backgroundTicker, chime, clearLockScreen, pauseSound, playSound, restChime, showOnLockScreen, stopSound, wakeChime, type Sound } from "@/lib/focus-sound";
import { clock, useFloatTimer } from "@/components/student/FloatTimer";
import { GroundworkWorld } from "@/components/student/GroundworkWorld";
import { WorldGlyph, WorldPicker } from "@/components/student/WorldPicker";
import { Receipt, ShareReceipt, receiptId, type ReceiptData } from "@/components/student/StudyReceipt";
import { setTitleOverride } from "@/hooks/usePageTitle";
import { trackFocusItem, type FocusItem } from "@/lib/activity-tracker";

/**
 * The focus room: the student's 3D world, full screen, building as they
 * focus, with one big timer on top. The world follows this timer exactly
 * (see worldPhase and worldProgress below).
 *
 * Controls fade away while they work and come back on a touch. The timer can
 * float over other apps (picture-in-picture), sits on the lock screen while a
 * sound plays, keeps the screen awake, and ends with a study receipt.
 * Loaded only when opened, so the rest of the portal doesn't carry it.
 */
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

const restFor = (focus: number) => Math.max(3, Math.min(15, Math.round(focus / 5)));

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
  const [subjectChoices] = useState(() => [...new Set([...subjects, subject, "Something else"])]);
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
  const [idle, setIdle] = useState(false);
  const [fs, setFs] = useState(false);
  const [quote] = useState(() => quoteFor(Math.floor(Date.now() / 60_000)));
  const [sessionAt, setSessionAt] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
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
      updateProfile((latest) => ({ focus: recordFocus(latest.focus, m, subj, at) }));
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
      { play: resume, pause, stop: () => void end() },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, minsLeft, held, phase, subject]);
  useEffect(() => {
    if (!running) return setTitleOverride(null);
    setTitleOverride(`${clock(left)} · ${held ? "Paused" : phase === "rest" ? "Break" : subject}`);
  }, [running, left, phase, subject, held]);

  // ---- Controls fade away while they work; any touch brings them back.
  useEffect(() => {
    if (!running || pausedLeft != null) return;
    let t = setTimeout(() => setIdle(true), 3500);
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 3500);
    };
    const el = panel.current;
    el?.addEventListener("pointermove", wake);
    el?.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(t);
      setIdle(false);
      el?.removeEventListener("pointermove", wake);
      el?.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [running, pausedLeft]);

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
        // The world picker closes itself first; the "builder waited" sheet needs an answer.
        if (picker || sheet) return;
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
          subject,
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
  const accent = phase === "rest" ? "#7FD1A6" : "#FBC159";
  const hide = running && idle && pausedLeft == null;
  const fade = cn("transition-opacity duration-700", hide ? "pointer-events-none opacity-0" : "opacity-100");
  const glass = "bg-white/[0.08] backdrop-blur-2xl [@media(pointer:coarse)]:backdrop-blur-md border border-white/[0.12]";
  const roundBtn = cn("flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white active:scale-95", glass);

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
          "relative mx-auto flex h-full w-full max-w-5xl flex-col px-5 sm:px-8",
          "pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]",
          (phase === "setup" || phase === "done") && "overflow-y-auto overscroll-contain",
        )}
      >
        {/* Top bar */}
        <div className={cn("flex h-14 shrink-0 items-center justify-between gap-3", fade)}>
          <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.3em] text-white/70">
            {running ? (phase === "rest" ? "Break" : subject) : STUDY_NAME}
          </p>
          {/* The picker hangs from the whole group (right aligned), so on a phone it stays on screen. */}
          <div className="relative flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setPicker((v) => !v)} aria-expanded={picker} className={roundBtn} aria-label={`World: ${world.title}. Change world`} title={world.title}>
              <WorldGlyph size={20} />
            </button>
            {picker && <WorldPicker current={world.id} placement="below" onPick={(id) => updateProfile({ world: id })} onClose={() => setPicker(false)} />}
            {running && float.kind && (
              <button type="button" onClick={() => void (float.active ? float.close() : float.open())} className={roundBtn} aria-label={float.active ? "Stop floating the timer" : "Float the timer over other apps"} title="Float (P)">
                <Glyph.Float />
              </button>
            )}
            {fsOk && (
              <button type="button" onClick={toggleFs} className={roundBtn} aria-label={fs ? "Exit full screen" : "Full screen"} title="Full screen (F)">
                {fs ? <Glyph.Shrink /> : <Glyph.Expand />}
              </button>
            )}
            {!running && (
              <button type="button" onClick={close} className={roundBtn} aria-label="Close">
                <Glyph.X />
              </button>
            )}
          </div>
        </div>

        {phase === "setup" && (
          <div className="flex flex-1 flex-col items-center justify-center pb-8 text-center">
            {mission && (
              <p className="mb-8 max-w-xs truncate text-[13px] text-white/55">
                {mission.tag ? `${mission.tag} · ` : ""}
                {mission.topic}
              </p>
            )}
            <label className="relative inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[15px] font-medium text-white/80 hover:text-white">
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
            <div className="mt-4 flex max-w-full items-center gap-3 sm:gap-8">
              <button type="button" onClick={() => setFocusMin((m) => Math.max(5, m - 5))} className={cn(roundBtn, "text-xl")} aria-label="5 minutes less">
                −
              </button>
              <p className="room-time font-extralight leading-none tabular-nums tracking-[-0.05em] text-white">{clock(focusMin * 60_000)}</p>
              <button type="button" onClick={() => setFocusMin((m) => Math.min(120, m + 5))} className={cn(roundBtn, "text-xl")} aria-label="5 minutes more">
                +
              </button>
            </div>
            <p className="mt-3 text-[13px] text-white/45">then a {restMin} minute break</p>
            <div role="radiogroup" aria-label="Length" className="mt-5 flex items-center gap-1.5">
              {LENGTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={focusMin === m}
                  onClick={() => setFocusMin(m)}
                  className={cn(
                    "min-h-11 min-w-14 rounded-full px-3 text-[13px] font-medium tabular-nums transition-colors active:scale-[0.97]",
                    focusMin === m ? "bg-white/[0.16] text-white" : "text-white/50 hover:text-white/80",
                  )}
                >
                  {m} min
                </button>
              ))}
            </div>
            <div role="radiogroup" aria-label="Sound" className="mt-6 flex items-center gap-1">
              {SOUNDS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={sound === x.id}
                  onClick={() => setSound(x.id)}
                  className={cn("min-h-11 rounded-full px-3 text-[13px] transition-colors", sound === x.id ? "font-semibold text-white" : "text-white/40 hover:text-white/75")}
                >
                  {x.id === "off" ? "Silence" : x.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={startBlock} className="mt-8 h-14 w-full max-w-xs rounded-full bg-white text-base font-semibold text-black transition hover:bg-white/90 active:scale-[0.98]">
              Start
            </button>
            {mission?.noteHref && (
              <Link href={mission.noteHref} className="mt-3 inline-flex min-h-11 items-center text-[13px] font-medium text-white/60 hover:text-white">
                Open the notes first
              </Link>
            )}
            {tip && (
              <p className="mt-4 flex max-w-xs items-center gap-1 text-left text-[12px] leading-snug text-white/50">
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
          <div className="flex flex-1 flex-col items-center justify-start pt-2" onClick={() => setIdle(false)}>
            {/* A small pill under the top bar, so the world and the builder fill the screen. No blur on touch screens: it would sit over the live 3D canvas. */}
            <div className="flex h-9 items-center gap-2 rounded-full border border-[rgba(244,241,234,0.16)] bg-[rgba(15,20,32,0.55)] pl-3.5 pr-4 lg:h-10 [@media(pointer:fine)]:backdrop-blur-sm">
              <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", pausedLeft != null && "opacity-40")} style={{ background: accent }} />
              <span className={cn("text-[17px] font-normal leading-none tabular-nums lg:text-[20px]", pausedLeft != null ? "text-ink/60" : "text-ink")} role="timer" aria-live="off">
                {clock(left)}
              </span>
              <span className="text-[12px] leading-none text-ink/65">{pausedLeft != null ? "paused" : phase === "rest" ? "break" : "left"}</span>
            </div>
            {phase === "rest" && <p className="mt-2.5 text-[12px] text-ink/65 [text-shadow:0_1px_8px_rgba(0,0,0,.5)]">Stand up, drink some water</p>}
            {phase === "rest" && (
              <figure className="mb-4 mt-auto max-w-sm px-6 pt-6 text-center [text-shadow:0_1px_10px_rgba(0,0,0,.55)]">
                <blockquote className="text-[15px] leading-snug text-white/80 [text-wrap:balance]">“{quote.text}”</blockquote>
                {quote.by && <figcaption className="mt-1 text-xs text-white/40">{quote.by}</figcaption>}
              </figure>
            )}
          </div>
        )}

        {sheet && (
          <div className="shrink-0 pb-2">
            <div role="alertdialog" aria-labelledby="gw-away-title" className={cn("away-in mx-auto w-full max-w-sm rounded-[24px] p-5 text-center", glass)}>
              <p id="gw-away-title" className="text-[15px] font-medium leading-snug text-white [text-wrap:balance]">
                You were away {awayLabel(sheet.ms)}. The builder waited.
              </p>
              <button
                ref={resumeBtn}
                type="button"
                onClick={backAndResume}
                className="mt-4 h-12 w-full rounded-full bg-brand text-[15px] font-semibold text-black transition hover:bg-brand-strong active:scale-[0.98]"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={backFromPaper}
                className="mt-2 h-12 w-full rounded-full border border-white/25 text-[15px] font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
              >
                I was studying on paper
              </button>
            </div>
          </div>
        )}

        {running && !sheet && (
          <div className={cn("shrink-0 pb-2", fade)}>
            <div className="mx-auto flex max-w-sm items-center justify-between">
              <div className="flex w-20 flex-col items-center gap-1.5">
                <button type="button" onClick={() => void end()} className={cn(roundBtn, "h-14 w-14")} aria-label="End session">
                  <Glyph.X />
                </button>
                <span className="text-[11px] text-white/60">End</span>
              </div>
              <button
                type="button"
                onClick={phase === "rest" ? skipBreak : togglePause}
                className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-white text-black shadow-[0_18px_40px_-12px_rgba(0,0,0,.6)] transition active:scale-95"
                aria-label={phase === "rest" ? "Skip the break" : pausedLeft != null ? "Resume" : "Pause"}
              >
                {phase === "rest" || pausedLeft != null ? <Glyph.Play /> : <Glyph.Pause />}
              </button>
              <div className="flex w-20 flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => pickSound(SOUNDS[(SOUNDS.findIndex((s) => s.id === sound) + 1) % SOUNDS.length].id)}
                  className={cn(roundBtn, "h-14 w-14", sound !== "off" && "text-brand")}
                  aria-label={`Sound: ${SOUNDS.find((s) => s.id === sound)?.label}. Change sound`}
                >
                  <Glyph.Sound off={sound === "off"} />
                </button>
                <span className="text-[11px] text-white/60">{SOUNDS.find((s) => s.id === sound)?.label}</span>
              </div>
            </div>
          </div>
        )}

        {phase === "done" && receipt && (
          <div className="flex flex-1 flex-col items-center gap-6 py-6">
            <div className="text-center">
              <h2 className="text-[1.75rem] font-semibold tracking-[-0.02em]">Nicely done.</h2>
              <p className="mt-1 text-sm text-white/70">
                {mission?.item
                  ? `${receipt.focusedMin} ${receipt.focusedMin === 1 ? "minute" : "minutes"} on ${mission.item.title}. Added to your week.`
                  : `${receipt.focusedMin} minutes of ${subject} added to your week.`}
              </p>
              {mission?.item?.href && (
                <Link href={mission.item.href} className="mt-2 inline-flex min-h-11 items-center text-[13px] font-medium text-white/60 underline-offset-4 hover:text-white hover:underline">
                  {mission.item.kind === "test" ? "Go to the test" : "Go to the homework"}
                </Link>
              )}
            </div>

            {receipt.intention && finished == null && (
              <div className={cn("w-full max-w-[340px] rounded-[22px] p-4 text-center", glass)}>
                <p className="text-sm text-white/80">Did you finish it?</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setFinished(true)} className="h-11 rounded-full bg-white text-sm font-semibold text-black active:scale-[0.98]">
                    Yes
                  </button>
                  <button type="button" onClick={() => setFinished(false)} className="h-11 rounded-full border border-white/20 text-sm font-semibold text-white active:scale-[0.98]">
                    Not yet
                  </button>
                </div>
              </div>
            )}

            {mission && !mission.item && subject === mission.subject && (
              <div className={cn("w-full max-w-[340px] rounded-[22px] p-4 text-center", glass)}>
                <p className="text-sm text-white/80">How did {mission.topic} go?</p>
                {checked ? (
                  <p className="mt-2 text-sm text-white/70">{checked === "got" ? "Good. It comes back in a few days so it sticks." : "No problem. It's back on your plan tomorrow."}</p>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setChecked("got");
                        const key = topicKey(mission.subject, mission.topic);
                        updateProfile((latest) => ({ reviews: reviewDone(latest.reviews, key, Date.now()) }));
                      }}
                      className="h-11 rounded-full bg-white text-sm font-semibold text-black active:scale-[0.98]"
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
                      className="h-11 rounded-full border border-white/20 text-sm font-semibold text-white active:scale-[0.98]"
                    >
                      Still shaky
                    </button>
                  </div>
                )}
              </div>
            )}

            <Receipt r={receipt} />

            <div className="flex w-full max-w-[340px] flex-col gap-2 pb-4">
              <button type="button" onClick={startBlock} className="h-12 rounded-full bg-white text-sm font-semibold text-black active:scale-[0.98]">
                Another {focusMin} minutes
              </button>
              <div className="grid grid-cols-2 gap-2">
                <ShareReceipt r={receipt} scene={scene} />
                <button type="button" onClick={close} className="h-12 rounded-full border border-white/20 text-sm font-semibold text-white active:scale-[0.98]">
                  Finish
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {float.portal}

      <style>{`
        .room-time { font-size: clamp(3.25rem, min(16vw, 10dvh), 8rem); }
        .no-scrollbar { scrollbar-width: none; } .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes away-in { from { opacity: 0; transform: translateY(8px); } }
        @media (prefers-reduced-motion: no-preference) { .away-in { animation: away-in .4s ease-out both; } }
      `}</style>
    </div>
  );
}

const S = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
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
