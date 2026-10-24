"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { readRatings, type Rating } from "@/components/syllabus/Checklist";
import { NumberField } from "@/components/tools/ToolBits";
import { TrackedLink } from "@/components/landing/TrackedLink";
import { cn } from "@/lib/cn";
import { waTextLink } from "@/lib/landing";
import { SYLLABI } from "@/lib/syllabus";

type Item = { code: string; subject: string; num: string; name: string; rating: Rating };
type Week = { start: Date; phase: "learn" | "papers" | "final"; items: Item[] };

const DAY = 86_400_000;
const WEIGHT: Record<Rating, number> = { unsure: 2.5, new: 2, confident: 0.6 };

/**
 * A week-by-week plan to the first exam, built from the real Cambridge
 * subtopics: weak ("Not sure") topics first, subjects interleaved, then a
 * past paper phase, then a final week on the weakest topics.
 */
export function RevisionPlanner({ initial }: { initial?: string }) {
  const [codes, setCodes] = useState<string[]>(initial ? [initial] : []);
  const [exam, setExam] = useState("");
  const [hours, setHours] = useState("6");
  const [ratings, setRatings] = useState<Record<string, Record<string, Rating>>>({});
  const [today, setToday] = useState<number | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setRatings(Object.fromEntries(SYLLABI.map((s) => [s.code, readRatings(s.code)])));
      setToday(Date.now());
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const plan = useMemo<Week[] | null>(() => {
    if (!codes.length || !exam || today === null) return null;
    const end = new Date(`${exam}T09:00:00`).getTime();
    const weeks = Math.floor((end - today) / (7 * DAY));
    if (weeks < 2) return null;
    const paperWeeks = Math.min(8, Math.max(1, Math.round(weeks * 0.3)));
    const learnWeeks = Math.max(1, weeks - paperWeeks - 1);
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
    const total = merged.reduce((n, x) => n + WEIGHT[x.rating], 0);
    const perWeek = total / learnWeeks;
    const out: Week[] = [];
    let w: Week = { start: new Date(today), phase: "learn", items: [] };
    let load = 0;
    for (const it of merged) {
      if (load >= perWeek && out.length < learnWeeks - 1) {
        out.push(w);
        w = { start: new Date(today + out.length * 7 * DAY), phase: "learn", items: [] };
        load = 0;
      }
      w.items.push(it);
      load += WEIGHT[it.rating];
    }
    out.push(w);
    for (let i = 0; i < paperWeeks; i++) out.push({ start: new Date(today + out.length * 7 * DAY), phase: "papers", items: [] });
    out.push({ start: new Date(today + out.length * 7 * DAY), phase: "final", items: merged.filter((x) => x.rating === "unsure").slice(0, 8) });
    return out;
  }, [codes, exam, today, ratings]);

  const rated = codes.reduce((n, c) => n + Object.values(ratings[c] ?? {}).filter((r) => r !== "new").length, 0);
  const h = Number(hours) || 0;
  const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const chip = (on: boolean) =>
    cn("min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors", on ? "border-gold bg-gold text-[#1b1e21]" : "border-hairline-strong text-body hover:border-gold-border");

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
                  onClick={() => setCodes((c) => (c.includes(s.code) ? c.filter((x) => x !== s.code) : [...c, s.code].slice(-4)))}
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
            onChange={(e) => setExam(e.target.value)}
            className="h-12 w-full rounded-[12px] border border-hairline-strong bg-card px-4 text-[16px] text-foreground outline-none focus:border-gold-border [color-scheme:dark]"
          />
          <span className="mt-1 block text-xs text-faint">It is on your statement of entry, or Cambridge&apos;s exam timetable.</span>
        </label>
        <NumberField label="Hours a week you can study" value={hours} onChange={setHours} hint="Across all your subjects" />
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
                <Link key={c} href={`/syllabus/${s.slug}`} className="mr-3 text-gold hover:underline">
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
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-12 items-center rounded-full border border-hairline-strong px-6 text-[15px] font-semibold text-body hover:border-gold-border">
              Print or save as PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
