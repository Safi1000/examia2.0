"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Magnetic } from "./Magnetic";
import { track, type LevelName, type SubjectName } from "@/lib/landing";
import {
  bookingLink,
  hourLabel,
  localSlotLabel,
  upcomingDays,
  visitorInPakistanTime,
  type Day,
  type Board,
  type Who,
} from "@/lib/booking";

const SUBJECTS: SubjectName[] = ["Accounting", "Business", "Economics"];
const LEVELS: LevelName[] = ["O Level / IGCSE", "AS Level", "A2 Level"];
const WHO: Who[] = ["Student", "Parent"];
const BOARDS: Board[] = ["Cambridge", "Pearson Edexcel", "Not sure"];

const chip =
  "relative flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-hairline-strong px-4 py-2 text-center text-[15px] font-semibold leading-tight text-muted-foreground transition-colors hover:text-foreground has-[:checked]:border-gold has-[:checked]:bg-gold has-[:checked]:text-[#1b1e21] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold";

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
 * Pick a subject, level, day and time; the button opens WhatsApp with all of it
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
  const [subject, setSubject] = useState<SubjectName | null>(fixedSubject ?? null);
  const [level, setLevel] = useState<LevelName | null>(fixedLevel ?? null);
  const [who, setWho] = useState<Who>("Student");
  const [board, setBoard] = useState<Board>("Not sure");
  const [days, setDays] = useState<Day[] | null>(null);
  const [abroad, setAbroad] = useState(false);
  const [dayKey, setDayKey] = useState<string | null>(null);
  const [hour, setHour] = useState<number | null>(null);

  // Dates depend on the visitor's clock, so they are worked out after load
  // (the page itself is pre-built and would otherwise show the build day).
  useEffect(() => {
    const id = setTimeout(() => {
      setDays(upcomingDays(new Date()));
      setAbroad(!visitorInPakistanTime());
    }, 0);
    return () => clearTimeout(id);
  }, []);


  const day = days?.find((d) => d.key === dayKey) ?? null;
  const ready = subject && level && day && hour !== null;
  const missing = !subject ? "your subject" : !level ? "your level" : !day ? "a day" : hour === null ? "a time" : null;

  let step = 0;
  const n = () => `${++step}.`;

  return (
    <div className="space-y-8">
      <Choice legend={`${n()} Subject`} name={`${uid}-s`} options={SUBJECTS} value={subject} onChange={setSubject} />
      <Choice legend={`${n()} Level`} name={`${uid}-l`} options={LEVELS} value={level} onChange={setLevel} />
      <Choice legend={`${n()} Exam board`} name={`${uid}-b`} options={BOARDS} value={board} onChange={setBoard} />
      <Choice legend={`${n()} Who is booking?`} name={`${uid}-w`} options={WHO} value={who} onChange={setWho} />

      <fieldset className="min-w-0">
        <legend className="text-sm font-semibold text-foreground">{n()} Pick a day</legend>
        {days === null ? (
          <div className="mt-3 h-[72px] animate-pulse rounded-2xl bg-card-raised" aria-hidden />
        ) : (
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
            {days.map((d) => (
              <label
                key={d.key}
                className="relative flex min-h-[72px] min-w-[72px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-2xl border border-hairline-strong px-3 text-muted-foreground transition-colors hover:text-foreground has-[:checked]:border-gold has-[:checked]:bg-gold has-[:checked]:text-[#1b1e21] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold"
              >
                <input
                  type="radio"
                  name={`${uid}-d`}
                  value={d.key}
                  checked={dayKey === d.key}
                  onChange={() => {
                    setDayKey(d.key);
                    if (hour !== null && !d.hours.includes(hour)) setHour(null);
                  }}
                  className="sr-only"
                />
                <span className="text-xs font-semibold uppercase tracking-wider">{d.weekday}</span>
                <span className="mt-1 text-[15px] font-bold tabular-nums">{d.date}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      {day && (
        <Choice
          legend={
            <>
              {n()} Pick a time{" "}
              <span className="font-normal text-faint">{abroad ? "(Pakistan time, yours underneath)" : "(Pakistan time)"}</span>
            </>
          }
          name={`${uid}-h`}
          options={day.hours}
          value={hour}
          onChange={setHour}
          label={(h) =>
            abroad ? (
              <span className="flex flex-col items-center">
                <span>{hourLabel(h)}</span>
                <span className="text-xs font-normal opacity-80">{localSlotLabel(day, h)}</span>
              </span>
            ) : (
              hourLabel(h)
            )
          }
          cols="grid grid-cols-3 gap-2 sm:grid-cols-5 [&_label]:whitespace-nowrap [&_label]:px-2"
        />
      )}

      <div className="border-t border-hairline pt-6">
        {ready ? (
          <Magnetic block strength={0.08}>
          <a
            href={bookingLink({ subject: subject!, level: level!, day: day!, hour: hour!, who, board })}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("whatsapp_click", { from, subject, level, board })}
            className="btn-shine flex min-h-12 w-full items-center justify-center rounded-full bg-gold px-6 py-3.5 text-center text-[15px] font-semibold text-[#1b1e21] transition-[background-color,transform] hover:bg-[#ffd07a] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Send my booking on WhatsApp
          </a>
          </Magnetic>
        ) : (
          <p className="flex min-h-12 w-full items-center justify-center rounded-full border border-hairline-strong px-6 text-center text-[15px] text-faint">
            Choose {missing} to continue
          </p>
        )}
        <p className="mt-3 text-center text-sm text-faint">
          Your choice is typed into WhatsApp. You press send, and I confirm the time in the chat.
        </p>
      </div>
    </div>
  );
}
