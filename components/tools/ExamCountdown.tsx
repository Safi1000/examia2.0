"use client";

import { useEffect, useMemo, useState } from "react";
import { calendarDaysUntil } from "@/components/tools/calc";
import { AskHamza } from "@/components/tools/ToolBits";

export interface CountdownSyllabus {
  code: string;
  name: string;
  /** Number of subtopics in the syllabus. */
  subs: number;
}

const DAY = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/**
 * "Mon 26 April 2027", spelled out by hand: the server and each browser format
 * dates slightly differently (a comma after the day name), which broke
 * hydration, and a visitor's time zone could shift the day.
 */
const fmtDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`;
};

/**
 * Days to the exam, and the pace that gets the syllabus done before the
 * past paper weeks. Pick a syllabus, set your paper's date from your
 * statement of entry, share it with your class.
 */
export function ExamCountdown({
  syllabi,
  seriesName,
  seriesStart,
  papersFrom,
  initial,
}: {
  syllabi: CountdownSyllabus[];
  seriesName: string;
  seriesStart: string;
  papersFrom: string;
  initial?: { code?: string; date?: string };
}) {
  const [code, setCode] = useState(initial?.code && syllabi.some((s) => s.code === initial.code) ? initial.code : syllabi[0].code);
  const [date, setDate] = useState(initial?.date && calendarDaysUntil(initial.date, 0) !== null ? initial.date : seriesStart);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // The clock starts after load, so the page itself is the same for everyone.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const s = syllabi.find((x) => x.code === code) ?? syllabi[0];

  const m = useMemo(() => {
    if (now == null) return null;
    // Calendar days in the visitor's own time zone (Pakistan, the Gulf), so the
    // count drops at their midnight and reads 0 on the day itself.
    const days = calendarDaysUntil(date, now);
    if (days === null) return null;
    const [y, mo, d] = date.split("-").map(Number);
    const examMs = new Date(y, mo - 1, d).getTime();
    const [py, pm, pd] = papersFrom.split("-").map(Number);
    const seriesPapersMs = new Date(py, pm - 1, pd).getTime();
    // The series' past paper start only applies to a paper in that series
    // (within about four months of it); any other date gets four weeks of papers.
    const inSeries = examMs >= seriesPapersMs && examMs - seriesPapersMs < 120 * DAY;
    const papersMs = inSeries ? Math.min(seriesPapersMs, examMs - 28 * DAY) : examMs - 28 * DAY;
    const learnWeeks = Math.max(0, (papersMs - now) / (7 * DAY));
    return {
      days: Math.max(0, days),
      past: days < 0,
      weeks: Math.floor(Math.max(0, days) / 7),
      perWeek: learnWeeks >= 1 ? Math.ceil(s.subs / learnWeeks) : null,
      papersDays: Math.max(0, Math.ceil((examMs - Math.max(now, papersMs)) / DAY)),
    };
  }, [now, date, papersFrom, s.subs]);

  const share = typeof window === "undefined" ? "" : `${window.location.origin}/tools/exam-countdown?s=${code}&d=${date}`;
  const shareText = m ? `${m.days === 1 ? "1 day" : `${m.days} days`} to my ${s.name} exam. How many days do you have? ${share}` : "";
  const upcoming = m !== null && !m.past && m.days > 0;

  const copyLink = () => {
    navigator.clipboard
      ?.writeText(share)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-foreground">Your syllabus</span>
          <select
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="h-12 w-full rounded-[12px] border border-hairline-strong bg-card px-4 text-[16px] text-foreground outline-none focus:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            {syllabi.map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-foreground">Date of your paper</span>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-12 w-full rounded-[12px] border border-hairline-strong bg-card px-4 text-[16px] text-foreground outline-none focus:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold [color-scheme:dark]"
          />
          <span className="mt-1 block text-sm text-muted-foreground">
            {date === seriesStart ? `${seriesName} starts ${fmtDate(seriesStart)}. Change it to your paper's date from your statement of entry.` : fmtDate(date)}
          </span>
        </label>
      </div>

      <div className="rounded-[24px] border border-gold-border bg-card-raised p-7 text-center md:p-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold">{s.name}</p>
        <div aria-live="polite">
          <p className="mt-3 text-[5.5rem] font-extralight leading-none tabular-nums tracking-[-0.04em] text-foreground md:text-[7rem]">{m ? m.days : "…"}</p>
          <p className="mt-2 text-lg text-muted-foreground">
            {!m
              ? "days to go"
              : m.past
                ? "This date has passed. Set the date of your next paper."
                : m.days === 0
                  ? "Your paper is today. Good luck."
                  : `${m.days === 1 ? "day to go" : "days to go"}${m.weeks > 0 ? ` · ${m.weeks} ${m.weeks === 1 ? "week" : "weeks"}` : ""}`}
          </p>
        </div>
        {upcoming && m && (
          <div className="mx-auto mt-7 grid max-w-md gap-3 text-left sm:grid-cols-2">
            <div className="rounded-[16px] border border-hairline bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">To finish the syllabus</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{m.perWeek ? `${m.perWeek} subtopics a week` : "Revise, don't start new"}</p>
              <p className="mt-0.5 text-sm text-faint">{s.subs} subtopics in total</p>
            </div>
            <div className="rounded-[16px] border border-hairline bg-card px-4 py-3">
              <p className="text-sm text-muted-foreground">Past paper weeks</p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{(() => { const w = Math.round(m.papersDays / 7); return w === 1 ? "1 week" : `${w} weeks`; })()}</p>
              <p className="mt-0.5 text-sm text-faint">Full timed papers, marked strictly</p>
            </div>
          </div>
        )}
        {upcoming && m && (
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center rounded-full bg-gold px-6 text-[15px] font-semibold text-[#1b1e21] hover:bg-[#ffd07a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Share on WhatsApp
            </a>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex min-h-12 items-center rounded-full border border-hairline-strong px-6 text-[15px] font-semibold text-foreground hover:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
            </button>
          </div>
        )}
      </div>
      {upcoming && m && <AskHamza tool="exam countdown" summary={`I have ${m.days} days until my ${s.name} exam. What should I focus on?`} />}
    </div>
  );
}
