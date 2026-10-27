/**
 * Groundwork habits: study slots (planned times, with a reminder), the week's
 * study days against a days-per-week target (a kinder streak), the review
 * queue (weak topics come back after 1, 3, 7 and 14 days), the Sunday review,
 * and the calm start screen (scene, today's one thing, quote). Pure helpers;
 * everything is saved on the student's profile.
 */
import type { FocusStats } from "@/lib/profile";
import { addDays, pkDate } from "@/lib/timetable";
import { mondayOf } from "@/lib/focus";

/** A planned study time: weekday (0 = Sunday … 6) and "HH:MM" Pakistan time. */
export interface StudySlot {
  day: number;
  time: string;
}
export interface ReviewState {
  /** How many reviews are done (0 to 4). */
  step: number;
  /** YYYY-MM-DD the next review is due. */
  due: string;
}
export interface TodayFocus {
  date: string;
  text: string;
  done?: boolean;
}

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Reminders don't go out at night (see isQuietHours), so slots run 8 am to 9:45 pm. */
export const SLOT_TIMES = Array.from({ length: (22 - 8) * 4 }, (_, i) => {
  const m = 8 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
export const DAYS_TARGETS = [3, 4, 5, 6] as const;
export const DEFAULT_DAYS_TARGET = 4;
/** Days after each review before the next: 1, 3, 7, 14. */
export const REVIEW_GAPS = [1, 3, 7, 14];

export const clock12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
};
export const slotLabel = (s: StudySlot) => `${DAY_SHORT[s.day]} ${clock12(s.time)}`;
export const sortSlots = (slots: StudySlot[]) => [...slots].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.time.localeCompare(b.time));

/** The next planned slot from now (Pakistan time), within a week. */
export function nextSlot(slots: StudySlot[] | undefined, nowMs: number): { slot: StudySlot; atMs: number } | null {
  if (!slots?.length) return null;
  const today = pkDate(nowMs);
  for (let i = 0; i < 8; i++) {
    const d = addDays(today, i);
    const wd = new Date(`${d}T12:00:00+05:00`).getUTCDay();
    const todays = sortSlots(slots.filter((s) => s.day === wd));
    for (const s of todays) {
      const at = Date.parse(`${d}T${s.time}:00+05:00`);
      if (at > nowMs - 30 * 60_000) return { slot: s, atMs: at };
    }
  }
  return null;
}

/** Mon to Sun of this week, with minutes studied each day. */
export function weekDays(focus: FocusStats | undefined, nowMs: number): Array<{ date: string; minutes: number; isToday: boolean; isFuture: boolean }> {
  const today = pkDate(nowMs);
  const mon = mondayOf(today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(mon, i);
    return { date, minutes: focus?.days?.[date] ?? 0, isToday: date === today, isFuture: date > today };
  });
}

/** Days with at least one counted session in the week starting `monday`. */
const daysIn = (focus: FocusStats | undefined, monday: string) => Array.from({ length: 7 }, (_, i) => focus?.days?.[addDays(monday, i)] ?? 0).filter((m) => m > 0).length;

/**
 * The weekly streak: full weeks in a row that hit the days target, plus this
 * week once it is hit. Rest days inside a week never break it.
 */
export function weekStreak(focus: FocusStats | undefined, target: number, nowMs: number): { weeks: number; thisWeek: number; hit: boolean } {
  const mon = mondayOf(pkDate(nowMs));
  const thisWeek = daysIn(focus, mon);
  let weeks = 0;
  for (let w = 1; w < 20; w++) {
    if (daysIn(focus, addDays(mon, -7 * w)) >= target) weeks++;
    else break;
  }
  const hit = thisWeek >= target;
  return { weeks: weeks + (hit ? 1 : 0), thisWeek, hit };
}

/** A stable key for a topic in the review queue. */
export const topicKey = (subject: string, topic: string) => `${subject}|${topic}`.toLowerCase();

/**
 * The review queue: each weak topic is due today when first seen, then again
 * after 1, 3, 7 and 14 days as it is reviewed. After four reviews it is done,
 * unless it shows up weak again in a later test (then it starts over).
 */
export function reviewQueue(
  weak: Array<{ subject: string; topic: string }>,
  reviews: Record<string, ReviewState> | undefined,
  nowMs: number,
): Array<{ subject: string; topic: string; key: string; step: number; due: string; isDue: boolean }> {
  const today = pkDate(nowMs);
  return weak
    .map((w) => {
      const key = topicKey(w.subject, w.topic);
      const st = reviews?.[key] ?? { step: 0, due: today };
      return { ...w, key, step: st.step, due: st.due, isDue: st.due <= today && st.step < REVIEW_GAPS.length };
    })
    .filter((x) => x.step < REVIEW_GAPS.length)
    .sort((a, b) => a.due.localeCompare(b.due));
}

/** Mark a topic reviewed today: move it to the next gap. */
export function reviewDone(reviews: Record<string, ReviewState> | undefined, key: string, nowMs: number): Record<string, ReviewState> {
  const cur = reviews?.[key] ?? { step: 0, due: pkDate(nowMs) };
  const step = cur.step + 1;
  const due = addDays(pkDate(nowMs), REVIEW_GAPS[Math.min(step, REVIEW_GAPS.length) - 1]);
  return { ...reviews, [key]: { step, due } };
}

/** The Sunday review shows on Sunday, and on Monday if it was missed. */
export function reviewWeekDue(weekReviewed: string | undefined, nowMs: number): string | null {
  const today = pkDate(nowMs);
  const wd = new Date(`${today}T12:00:00+05:00`).getUTCDay();
  // The week being reviewed: this one on Sunday, last one on Monday.
  const week = wd === 0 ? mondayOf(today) : wd === 1 ? addDays(mondayOf(today), -7) : null;
  if (!week || weekReviewed === week) return null;
  return week;
}

/* ------------------------------------------------------------------ */
/* The calm start screen                                               */
/* ------------------------------------------------------------------ */

/**
 * Scenes, drawn in code: a sky (layered gradients) and three hill lines.
 * `ink` is the text colour that reads on that sky.
 */
export interface Scene {
  id: string;
  name: string;
  sky: string;
  hills: [string, string, string];
  glow: string;
  stars?: boolean;
  /** Photo scenes: file name in public/wallpapers ("x.jpg" wide, "x-m.jpg" tall). */
  photo?: string;
  /** Photographer and photo page, for the credit (Unsplash licence). */
  by?: string;
  link?: string;
  /** Light photos get a stronger shade so white text stays readable. */
  light?: boolean;
}

/**
 * Photo wallpapers, from Unsplash (free licence, no fee; credited anyway).
 * `sky` is the photo's main colours, shown while it loads.
 */
const P = (id: string, name: string, photo: string, by: string, slug: string, sky: string, light = false): Scene => ({
  id,
  name,
  photo,
  by,
  link: `https://unsplash.com/photos/${slug}?utm_source=hamza_teaches&utm_medium=referral`,
  sky,
  hills: ["#000", "#000", "#000"],
  glow: "rgba(251,193,89,.35)",
  light,
});
export const PHOTO_SCENES: Scene[] = [
  P("milky-way", "Milky Way", "milky-way", "Nathan Anderson", "milky-way-over-mountain-landscape-at-night-L95xDkSSuWw", "linear-gradient(180deg,#0b1020,#1d2440 60%,#3a2c3a)"),
  P("aurora-trees", "Northern lights", "aurora-trees", "Vincent Guth", "silhouette-of-trees-near-aurora-borealis-at-night-62V7ntlKgL8", "linear-gradient(180deg,#120c2a,#1d6b52 60%,#0a0f12)"),
  P("aurora-peaks", "Aurora peaks", "aurora-peaks", "Lightscape", "northern-lights-over-snow-capped-mountian-LtnPejWDSAY", "linear-gradient(180deg,#0d1430,#2b3a6b 55%,#1a2234)"),
  P("pastel-peaks", "Pastel peaks", "pastel-peaks", "Alessio Soggetti", "mountains-covered-with-fogs-gdE-5Oui1Y0", "linear-gradient(180deg,#dfe7ee,#a9b8c6 60%,#7d8ea0)", true),
  P("green-mist", "Green mist", "green-mist", "Tobias Tullius", "green-leafed-trees-covered-by-fog-during-daytime-PXXtq6bp6cs", "linear-gradient(180deg,#c9d0c8,#7f8f7c 55%,#2f3d2c)", true),
  P("lake-fog", "Lake in the fog", "lake-fog", "Dana Luig", "a-body-of-water-surrounded-by-trees-and-fog-AbR69d3Xn6g", "linear-gradient(180deg,#b9bcc0,#6d7471 55%,#2a302e)", true),
  P("blue-ranges", "Blue ranges", "blue-ranges", "Alessio Soggetti", "view-of-mountain-PdGBci-4jR8", "linear-gradient(180deg,#b9cde6,#5f7fae 55%,#1f3561)", true),
  P("mountain-lake", "Mountain lake", "mountain-lake", "Katelyn G", "a-body-of-water-with-mountains-in-the-background-mgQt89wjeuM", "linear-gradient(180deg,#6f86ad,#a99aa8 50%,#3c4b6b)"),
  P("pink-sea", "Pink sea", "pink-sea", "Clark Gu", "a-large-body-of-water-sitting-under-a-pink-sky-sbNlS7dWqKE", "linear-gradient(180deg,#e9d6db,#a9b6c8 55%,#56708e)", true),
  P("fog-forest", "Forest fog", "fog-forest", "Thomas Griesbeck", "evergreen-trees-in-dense-mountain-fog-BS-Uxe8wU5Y", "linear-gradient(180deg,#9aa1a6,#565d61 55%,#1e2326)"),
  P("desert-dusk", "Desert dusk", "desert-dusk", "Vlad D", "a-desert-landscape-with-mountains-in-the-distance-Ag9cWC8-eY8", "linear-gradient(180deg,#e7955e,#c46b4e 50%,#5a3a37)"),
  P("above-the-fog", "Above the fog", "above-the-fog", "Andreas Slotosch", "castle-ruins-on-a-hill-above-the-fog-at-sunrise-CEX9Y1gZQjg", "linear-gradient(180deg,#f2c27b,#9a8e89 50%,#3b3f49)"),
];
const DRAWN: Scene[] = [
  { id: "gold-hour", name: "Gold hour", sky: "linear-gradient(180deg,#1c2a3a 0%,#4b4a5c 38%,#c9895a 72%,#f2c27b 100%)", hills: ["#6b5a63", "#3d3a48", "#1e2029"], glow: "rgba(251,193,89,.55)" },
  { id: "night-shift", name: "Night shift", sky: "linear-gradient(180deg,#05070f 0%,#0d1630 55%,#1c2a4a 100%)", hills: ["#1b2640", "#121a2e", "#080c17"], glow: "rgba(120,160,255,.25)", stars: true },
  { id: "monsoon", name: "Monsoon", sky: "linear-gradient(180deg,#3d4b57 0%,#68798a 50%,#9aa9b4 100%)", hills: ["#5c6b77", "#3f4b55", "#252e35"], glow: "rgba(255,255,255,.25)" },
  { id: "desert-dusk", name: "Desert dusk", sky: "linear-gradient(180deg,#2a1d3a 0%,#7a3f5c 45%,#e08a6d 80%,#f5c49a 100%)", hills: ["#9a5b55", "#5e3546", "#2b1a2a"], glow: "rgba(255,170,120,.5)" },
  { id: "aurora", name: "Aurora", sky: "radial-gradient(120% 70% at 30% 10%,rgba(80,230,180,.45),transparent 60%),radial-gradient(90% 60% at 80% 20%,rgba(120,120,255,.35),transparent 60%),linear-gradient(180deg,#040a12 0%,#0b1d26 70%,#10262c 100%)", hills: ["#163038", "#0e2128", "#071217"], glow: "rgba(90,230,190,.3)", stars: true },
  { id: "sea-glass", name: "Sea glass", sky: "linear-gradient(180deg,#0f3a45 0%,#2f7d84 50%,#9fd3c7 100%)", hills: ["#3f8a86", "#24605f", "#123b3c"], glow: "rgba(200,255,240,.35)" },
  { id: "margalla", name: "Margalla", sky: "linear-gradient(180deg,#d9e4dc 0%,#a9c2b4 45%,#6f9384 100%)", hills: ["#5e8170", "#3c5a4c", "#22362d"], glow: "rgba(255,255,240,.45)" },
  { id: "gunmetal", name: "Gunmetal", sky: "radial-gradient(80% 60% at 70% 30%,rgba(251,193,89,.28),transparent 60%),linear-gradient(180deg,#1b2226 0%,#2a3439 60%,#323e44 100%)", hills: ["#3a474e", "#2a3439", "#1b2226"], glow: "rgba(251,193,89,.4)" },
];
/** Every scene: the photos first, then the drawn ones. */
export const SCENES: Scene[] = [...PHOTO_SCENES, ...DRAWN];

/** Scenes that suit each part of the day; a different one each day within it. */
const BY_TIME: Array<[number, string[]]> = [
  [5, ["milky-way", "aurora-trees", "aurora-peaks"]],
  [11, ["pastel-peaks", "green-mist", "lake-fog", "blue-ranges"]],
  [16, ["mountain-lake", "pink-sea", "fog-forest"]],
  [19, ["desert-dusk", "above-the-fog"]],
  [24, ["milky-way", "aurora-trees", "aurora-peaks"]],
];
export function sceneFor(id: string | undefined, nowMs: number): Scene {
  const chosen = SCENES.find((s) => s.id === id);
  if (chosen) return chosen;
  const h = new Date(nowMs).getHours();
  const ids = BY_TIME.find(([until]) => h < until)![1];
  const day = Math.floor(Date.parse(`${pkDate(nowMs)}T00:00:00Z`) / 864e5);
  return SCENES.find((s) => s.id === ids[day % ids.length])!;
}

/** Quotes of the day: well sourced, short, one a day. */
export const QUOTES: Array<{ q: string; by: string }> = [
  { q: "You do not rise to the level of your goals. You fall to the level of your systems.", by: "James Clear" },
  { q: "Every action you take is a vote for the type of person you wish to become.", by: "James Clear" },
  { q: "One child, one teacher, one book, one pen can change the world.", by: "Malala Yousafzai" },
  { q: "Khudi ko kar buland itna ke har taqdeer se pehle, Khuda bande se khud poochay, bata teri raza kya hai.", by: "Allama Iqbal" },
  { q: "Unity, faith, discipline.", by: "Muhammad Ali Jinnah" },
  { q: "Practice isn’t the thing you do once you’re good. It’s the thing you do that makes you good.", by: "Malcolm Gladwell" },
  { q: "Amateurs sit and wait for inspiration, the rest of us just get up and go to work.", by: "Stephen King" },
  { q: "Enthusiasm is common. Endurance is rare.", by: "Angela Duckworth" },
  { q: "Stay hungry. Stay foolish.", by: "Steve Jobs" },
  { q: "The only way to do great work is to love what you do.", by: "Steve Jobs" },
  { q: "We are what we repeatedly do.", by: "Will Durant" },
  { q: "Well begun is half done.", by: "Aristotle" },
];
export const quoteFor = (nowMs: number) => QUOTES[Math.floor(Date.parse(`${pkDate(nowMs)}T00:00:00Z`) / 864e5) % QUOTES.length];

/** Greeting by Pakistan time of day. */
export function greeting(nowMs: number): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "numeric", hour12: false }).format(nowMs));
  return h < 5 ? "Still up" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
