"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Magnetic } from "./Magnetic";
import { track, waLink, type LevelName, type SubjectName } from "@/lib/landing";
import {
  bookingLink,
  localTimeLabel,
  timeLabel,
  trialClasses,
  upcomingDays,
  visitorInPakistanTime,
  type Board,
  type Who,
} from "@/lib/booking";

const SUBJECTS: SubjectName[] = ["Accounting", "Business", "Economics"];
const LEVELS: LevelName[] = ["O Level / IGCSE", "AS Level", "A2 Level"];
const WHO: Who[] = ["Student", "Parent"];
const BOARDS: Board[] = ["Cambridge", "Pearson Edexcel", "Not sure"];

const chip =
  "relative flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-hairline-strong px-4 py-2 text-center text-base font-semibold leading-tight text-muted-foreground transition-colors duration-200 hover:text-foreground has-[:checked]:border-white/[0.16] has-[:checked]:bg-white/[0.09] has-[:checked]:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold";

function Choice<T extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
  label = (o) => String(o),
  cols = "flex flex-wrap gap-2",
}: {
  legend: ReactNode;
  name: string;
  options: T[];
  value: T | null;
  onChange: (v: T) => void;
  label?: (o: T) => ReactNode;
  cols?: string;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-foreground">{legend}</legend>
      <div className={`mt-3 ${cols}`}>
        {options.map((o) => (
          <label key={String(o)} className={chip}>
            <input
              type="radio"
              name={name}
              value={String(o)}
              checked={value === o}
              onChange={() => onChange(o)}
              className="sr-only"
            />
            {label(o)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Pick one or more subjects, a level and a class day; the real class time for that
 * choice is shown from the timetable, and the button opens WhatsApp with all of it
 * typed in. `subject`/`level` pre-select a choice; every step stays editable.
 */
export function BookingFlow({
  subject: fixedSubject,
  level: fixedLevel,
  from = "booking",
}: {
  subject?: SubjectName;
  level?: LevelName;
  from?: string;
}) {
  const uid = useId().replace(/:/g, "");
  // More than one subject can be picked: the trial covers whichever they choose.
  const [subjects, setSubjects] = useState<SubjectName[]>(fixedSubject ? [fixedSubject] : []);
  const toggleSubject = (x: SubjectName) =>
    setSubjects((cur) => (cur.includes(x) ? cur.filter((y) => y !== x) : SUBJECTS.filter((y) => cur.includes(y) || y === x)));
  const [level, setLevel] = useState<LevelName | null>(fixedLevel ?? null);
  const [who, setWho] = useState<Who>("Student");
  const [board, setBoard] = useState<Board>("Not sure");
  const [now, setNow] = useState<Date | null>(null);
  const [abroad, setAbroad] = useState(false);
  const [dayKey, setDayKey] = useState<string | null>(null);
  // Board and "who is booking" keep their defaults and sit behind a toggle, so
  // the form shows only what's needed to pick a class.
  const [more, setMore] = useState(false);

  // Dates depend on the visitor's clock, so they are worked out after load
  // (the page itself is pre-built and would otherwise show the build day).
  useEffect(() => {
    const id = setTimeout(() => {
      setNow(new Date());
      setAbroad(!visitorInPakistanTime());
    }, 0);
    return () => clearTimeout(id);
  }, []);


  // Only days when the chosen classes really run (any class day until a subject and level are picked).
  const days = useMemo(() => (now ? upcomingDays(now, level, subjects) : null), [now, level, subjects]);
  const day = days?.find((d) => d.key === dayKey) ?? null;
  // The free trial is a seat in a real class: these are that day's classes for the choice.
  const classes = day && level && subjects.length ? trialClasses(level, subjects, day.weekdayIndex) : [];
  const ready = subjects.length > 0 && level && day && classes.length > 0;
  const missing = !subjects.length ? "a subject" : !level ? "your level" : "a day";

  let step = 0;
  const n = () => `${++step}.`;

  return (
    <div className="space-y-8">
      <fieldset className="min-w-0">
        <legend className="text-sm font-semibold text-foreground">
          {n()} Subjects <span className="font-normal text-faint">(pick one or more)</span>
        </legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUBJECTS.map((x) => (
            <label key={x} className={chip}>
              <input
                type="checkbox"
                name={`${uid}-s`}
                value={x}
                checked={subjects.includes(x)}
                onChange={() => toggleSubject(x)}
                className="sr-only"
              />
              {x}
            </label>
          ))}
        </div>
      </fieldset>
      <Choice legend={`${n()} Level`} name={`${uid}-l`} options={LEVELS} value={level} onChange={setLevel} />

      <fieldset className="min-w-0">
        <legend className="text-sm font-semibold text-foreground">{n()} Pick a class day</legend>
        {days === null ? (
          <div className="skeleton mt-3 h-[72px] rounded-tile" aria-hidden />
        ) : (
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
            {days.map((d) => (
              <label
                key={d.key}
                className="relative flex min-h-[72px] min-w-[72px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-tile border border-hairline-strong px-3 text-muted-foreground transition-colors duration-200 hover:text-foreground has-[:checked]:border-white/[0.16] has-[:checked]:bg-white/[0.09] has-[:checked]:text-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold"
              >
                <input
                  type="radio"
                  name={`${uid}-d`}
                  value={d.key}
                  checked={dayKey === d.key}
                  onChange={() => setDayKey(d.key)}
                  className="sr-only"
                />
                <span className="text-xs font-semibold">{d.weekday}</span>
                <span className="mt-1 text-base font-bold tabular-nums">{d.date}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {days !== null && days.length === 0 && (
        <p className="-mt-4 text-sm text-muted-foreground">No class days are open in the next two weeks for this choice. Message me and I&apos;ll find you one.</p>
      )}

      {day && classes.length > 0 && (
        <div aria-live="polite">
          <p className="text-sm font-semibold text-foreground">
            {n()} Your class that day{" "}
            <span className="font-normal text-faint">{abroad ? "(Pakistan time, yours underneath)" : "(Pakistan time)"}</span>
          </p>
          <ul className="mt-3 divide-y divide-hairline rounded-tile border border-hairline-strong">
            {classes.map((c) => (
              <li key={c.subject} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-base font-semibold text-foreground">{c.subject}</span>
                <span className="text-right text-base tabular-nums text-muted-foreground">
                  {timeLabel(c.start)} to {timeLabel(c.end)}
                  {abroad && <span className="block text-xs text-faint">{localTimeLabel(day, c.start)} your time</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-faint">You join the real class, live, with my current students.</p>
        </div>
      )}
      {day && !classes.length && (
        <p className="text-sm text-faint">Pick your subjects and level to see the class time.</p>
      )}

      <div className="-mt-4">
        <a
          href={waLink({ subject: subjects.length === 1 ? subjects[0] : undefined, level: level ?? undefined, trial: true })}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("whatsapp_click", { from: `${from}:no_time`, subject: subjects.join(", "), level })}
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          None of these days suit you? Message me
        </a>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          aria-controls={`${uid}-more`}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-foreground transition-colors duration-200 hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          More details <span className="font-normal text-faint">(optional)</span>
          <svg viewBox="0 0 16 16" aria-hidden className={`h-4 w-4 transition-transform duration-200 ${more ? "rotate-180" : ""}`}>
            <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div id={`${uid}-more`} hidden={!more} className="mt-4 space-y-8">
          <Choice legend="Exam board" name={`${uid}-b`} options={BOARDS} value={board} onChange={setBoard} />
          <Choice legend="Who is booking?" name={`${uid}-w`} options={WHO} value={who} onChange={setWho} />
        </div>
      </div>

      <div className="border-t border-hairline pt-6">
        {ready ? (
          <Magnetic block strength={0.08}>
          <a
            href={bookingLink({ subjects, level: level!, day: day!, classes, who, board })}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("whatsapp_click", { from, subject: subjects.join(", "), level, board })}
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-gold px-6 py-3.5 text-center text-base font-semibold text-band-b transition-[background-color,transform] duration-200 ease-[var(--ease-out)] hover:bg-gold-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Send my booking on WhatsApp
          </a>
          </Magnetic>
        ) : (
          <p aria-live="polite" className="flex min-h-12 w-full items-center justify-center rounded-full border border-hairline-strong px-6 text-center text-base text-faint">
            Choose {missing} to continue
          </p>
        )}
        <p className="mt-3 text-center text-sm text-faint">
          Your choice is typed into WhatsApp. You press send, and I confirm your seat in the chat.
        </p>
      </div>
    </div>
  );
}
