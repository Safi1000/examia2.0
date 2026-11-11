"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { readRatings, type Rating } from "@/components/syllabus/Checklist";
import { spread, splitWeeks } from "@/components/tools/calc";
import { NumberField } from "@/components/tools/ToolBits";
import { TrackedLink } from "@/components/landing/TrackedLink";
import { cn } from "@/lib/cn";
import { waTextLink } from "@/lib/landing";
import type { SyllabusInfo } from "@/lib/syllabus";

/**
 * Only what the planner needs from each syllabus (names and subtopic titles).
 * The page passes this in, so the full syllabus files (every learning point)
 * stay on the server instead of in this page's JavaScript.
 */
export type PlannerSyllabus = Pick<SyllabusInfo, "code" | "slug" | "name" | "level"> & {
  topics: Array<{ subs: Array<{ num: string; name: string }> }>;
};

type Item = { code: string; subject: string; num: string; name: string; rating: Rating };
type Week = { start: Date; phase: "learn" | "papers" | "final"; items: Item[] };

const DAY = 86_400_000;
/** Subjects, exam date and hours, kept on this device so a reload does not lose them. */
const STORE = "tools:revision-planner";
type Saved = { codes: string[]; exam: string; hours: string };
function readSaved(): Partial<Saved> {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<Saved>;
    return {
      codes: Array.isArray(v.codes) ? v.codes.filter((c): c is string => typeof c === "string") : undefined,
      exam: typeof v.exam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.exam) ? v.exam : undefined,
      hours: typeof v.hours === "string" ? v.hours : undefined,
    };
  } catch {
    return {};
  }
}
function writeSaved(v: Saved) {
  try {
    localStorage.setItem(STORE, JSON.stringify(v));
  } catch {
    // Private mode or storage full: the plan still works, it just is not kept.
  }
}
const WEIGHT: Record<Rating, number> = { unsure: 2.5, new: 2, confident: 0.6 };

/**
 * A week-by-week plan to the first exam, built from the real Cambridge
 * subtopics: weak ("Not sure") topics first, subjects interleaved, then a
 * past paper phase, then a final week on the weakest topics.
 */
export function RevisionPlanner({ initial, syllabi: SYLLABI }: { initial?: string; syllabi: PlannerSyllabus[] }) {
  const [codes, setCodes] = useState<string[]>(initial ? [initial] : []);
  const [exam, setExam] = useState("");
  const [hours, setHours] = useState("6");
  const [ratings, setRatings] = useState<Record<string, Record<string, Rating>>>({});
  const [today, setToday] = useState<number | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setRatings(Object.fromEntries(SYLLABI.map((s) => [s.code, readRatings(s.code)])));
      const saved = readSaved();
      const known = (saved.codes ?? []).filter((c) => SYLLABI.some((x) => x.code === c));
      // A link to one syllabus (?s=0452) adds it to what was saved, rather than wiping it.
      if (known.length) setCodes(initial && !known.includes(initial) ? [...known, initial].slice(-4) : known);
      if (saved.exam) setExam(saved.exam);
      if (saved.hours !== undefined) setHours(saved.hours);
      setToday(Date.now());
    }, 0);
    return () => clearTimeout(id);
  }, [SYLLABI, initial]);

  const save = (next: Partial<Saved>) => writeSaved({ codes, exam, hours, ...next });
  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    const code = e.currentTarget.dataset.code!;
    const next = codes.includes(code) ? codes.filter((x) => x !== code) : [...codes, code].slice(-4);
    setCodes(next);
    save({ codes: next });
  };

  const plan = useMemo<Week[] | null>(() => {
    if (!codes.length || !exam || today === null) return null;
    const end = new Date(`${exam}T09:00:00`).getTime();
    const weeks = Math.floor((end - today) / (7 * DAY));
    if (weeks < 2) return null;
    const { learn: learnWeeks, papers: paperWeeks } = splitWeeks(weeks);
    // Weak first, then not started, then confident (a quick check), subjects interleaved.
    const lists = codes.map((c) => {
      const s = SYLLABI.find((x) => x.code === c)!;
      const r = ratings[c] ?? {};
      const items: Item[] = s.topics.flatMap((t) => t.subs.map((u) => ({ code: c, subject: s.name, num: u.num, name: u.name, rating: r[u.num] ?? "new" })));
      const order: Rating[] = ["unsure", "new", "confident"];
      return items.sort((a, b) => order.indexOf(a.rating) - order.indexOf(b.rating));
    });
    const merged: Item[] = [];
    for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i]) merged.push(l[i]);
    // Spread over every learn week, so a short topic list still fills the time
    // up to the past paper weeks instead of leaving the plan short.
    const slot = spread(merged.map((x) => WEIGHT[x.rating]), learnWeeks);
    const out: Week[] = Array.from({ length: learnWeeks }, (_, i) => ({ start: new Date(today + i * 7 * DAY), phase: "learn" as const, items: [] as Item[] }));
    merged.forEach((it, i) => out[slot[i]].items.push(it));
    for (let i = 0; i < paperWeeks; i++) out.push({ start: new Date(today + out.length * 7 * DAY), phase: "papers", items: [] });
    out.push({ start: new Date(today + out.length * 7 * DAY), phase: "final", items: merged.filter((x) => x.rating === "unsure").slice(0, 8) });
    return out;
  }, [codes, exam, today, ratings, SYLLABI]);

  const rated = codes.reduce((n, c) => n + Object.values(ratings[c] ?? {}).filter((r) => r !== "new").length, 0);
  const h = Number(hours) || 0;
  const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const chip = (on: boolean) =>
    cn("min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold", on ? "border-gold bg-gold text-[#1b1e21]" : "border-hairline-strong text-body hover:border-gold-border");

  return (
    <div className="space-y-8">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-foreground">Your subjects</legend>
        <div className="space-y-3">
          {(["O Level", "IGCSE", "AS and A Level"] as const).map((lvl) => (
            <div key={lvl} className="flex flex-wrap gap-2">
              {SYLLABI.filter((s) => s.level === lvl).map((s) => (
                <button
                  key={s.code}
                  type="button"
                  aria-pressed={codes.includes(s.code)}
                  data-code={s.code}
                  onClick={toggle}
                  className={chip(codes.includes(s.code))}
                >
                  {s.name.replace("AS and A Level", "A Level")}
                </button>
              ))}
            </div>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-foreground">Date of your first exam</span>
          <input
            type="date"
            value={exam}
            onChange={(e) => {
              setExam(e.target.value);
              save({ exam: e.target.value });
            }}
            className="h-12 w-full rounded-[12px] border border-hairline-strong bg-card px-4 text-[16px] text-foreground outline-none focus:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold [color-scheme:dark]"
          />
          <span className="mt-1 block text-[13px] text-muted-foreground">It is on your statement of entry, or Cambridge&apos;s exam timetable.</span>
        </label>
        <NumberField
          label="Hours a week you can study"
          value={hours}
          onChange={(v) => {
            setHours(v);
            save({ hours: v });
          }}
          hint="Across all your subjects"
        />
      </div>
      {codes.length > 0 && (
        <p className="text-[15px] text-muted-foreground">
          {rated > 0
            ? `Using your syllabus checklist ratings (${rated} subtopics rated): weak topics come first.`
            : "Tip: rate your topics in the syllabus checklist first, and your weak topics come first in the plan. "}
          {rated === 0 &&
            codes.map((c) => {
              const s = SYLLABI.find((x) => x.code === c)!;
              return (
                <Link key={c} href={`/syllabus/${s.slug}`} className="mr-3 inline-flex min-h-11 items-center text-gold hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                  {s.code} checklist
                </Link>
              );
            })}
        </p>
      )}

      {plan === null && codes.length > 0 && exam && <p className="text-[15px] text-muted-foreground">Pick an exam date at least two weeks away.</p>}

      {plan && (
        <div className="space-y-3">
          <p className="text-[15px] text-body">
            {plan.length} weeks to your first exam.{" "}
            {h > 0 && plan[0].items.length > 0 && `At ${h} hours a week, that is about ${Math.round((h * 60) / plan[0].items.length)} minutes per subtopic in week 1.`}
          </p>
          {plan.map((w, i) => (
            <div key={i} className={cn("rounded-[16px] border p-5", w.phase === "learn" ? "border-hairline bg-card" : "border-gold-border bg-card-raised")}>
              <p className="text-sm font-semibold text-gold">
                Week {i + 1} · from {fmtDate(w.start)}
              </p>
              {w.phase === "learn" && (
                <ul className="mt-2 space-y-1 text-[15px] text-body">
                  {w.items.length === 0 && <li>Catch up week: go back over the topics so far.</li>}
                  {w.items.map((it) => (
                    <li key={it.code + it.num}>
                      <span className="text-faint">{it.code}</span> {it.num} {it.name}
                      {it.rating === "unsure" && <span className="ml-2 text-xs font-semibold text-gold">weak</span>}
                      {it.rating === "confident" && <span className="ml-2 text-xs text-muted-foreground">quick check</span>}
                    </li>
                  ))}
                  <li className="pt-1 text-sm text-muted-foreground">End of week: past paper questions on these topics, marked with the mark scheme.</li>
                </ul>
              )}
              {w.phase === "papers" && (
                <p className="mt-2 text-[15px] text-body">
                  Full past papers under timed conditions, one per subject. Mark them strictly, then spend the next session on every topic you lost marks on.
                </p>
              )}
              {w.phase === "final" && (
                <div className="mt-2 text-[15px] text-body">
                  <p>Last week: the most recent papers again, and only your weakest topics.</p>
                  {w.items.length > 0 && <p className="mt-1 text-muted-foreground">{w.items.map((x) => `${x.code} ${x.num}`).join(", ")}</p>}
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-3 pt-2">
            <TrackedLink
              href={waTextLink(
                `Hi, I made a revision plan on your site: ${codes.join(", ")}, first exam ${exam}, ${hours} hours a week, ${plan.length} weeks. Can you help me stick to it?`,
              )}
              props={{ from: "tool:revision-planner" }}
              className="inline-flex min-h-12 items-center rounded-full bg-gold px-6 text-[15px] font-semibold text-[#1b1e21] hover:bg-[#ffd07a]"
            >
              Get help sticking to it
            </TrackedLink>
            <button type="button" onClick={() => window.print()} className="web-only inline-flex min-h-12 items-center rounded-full border border-hairline-strong px-6 text-[15px] font-semibold text-body hover:border-gold-border">
              Print or save as PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
