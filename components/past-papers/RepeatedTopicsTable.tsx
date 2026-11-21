"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { RepeatRow, Scope } from "@/lib/repeated-topics";

const TOP = 15;

/** Most questions first, then most series; ties keep syllabus order. */
const rank = (rows: RepeatRow[], scope: string) =>
  rows.filter((r) => r.by[scope]?.q).toSorted((a, b) => b.by[scope].q - a.by[scope].q || b.by[scope].series - a.by[scope].series);

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

export function RepeatedTopicsTable({ rows, scopes }: { rows: RepeatRow[]; scopes: Scope[] }) {
  const [scopeId, setScopeId] = useState("all");
  const [all, setAll] = useState(false);
  const scope = scopes.find((s) => s.id === scopeId) ?? scopes[0];
  const list = rank(rows, scope.id);
  const shown = all ? list : list.slice(0, TOP);
  const papers = scopes.filter((s) => s.id !== "all");

  // Main topics, summed, for the smaller table underneath.
  const mains = new Map<string, { num: string; name: string; q: number }>();
  for (const r of list) {
    const m = mains.get(r.topicNum) ?? { num: r.topicNum, name: r.topicName, q: 0 };
    m.q += r.by[scope.id].q;
    mains.set(r.topicNum, m);
  }
  const mainList = [...mains.values()].toSorted((a, b) => b.q - a.q);

  return (
    <div>
      {scopes.length > 2 && (
        <div role="group" aria-label="Which paper" className="flex flex-wrap gap-2">
          {scopes.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === scope.id}
              onClick={() => {
                setScopeId(s.id);
                setAll(false);
              }}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-semibold transition-colors duration-150",
                FOCUS,
                s.id === scope.id ? "border-white/[0.16] bg-white/[0.12] text-foreground" : "border-hairline-strong text-muted-foreground hover:border-white/25 hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <p className="mt-4 text-sm text-faint" aria-live="polite">
        {scope.id === "all" ? "All papers" : `${scope.label}, ${scope.kind}`}: <span className="tabular-nums">{scope.questions.toLocaleString("en-GB")}</span> questions from{" "}
        <span className="tabular-nums">{scope.series}</span> series.
      </p>

      <div className="mt-4 overflow-hidden rounded-tile border border-hairline bg-card">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">Topics ranked by number of past paper questions, {scope.label.toLowerCase()}</caption>
          <thead>
            <tr className="text-xs font-semibold text-faint">
              <th scope="col" className="w-9 py-3 pl-3 pr-1 sm:w-12 sm:pl-5">#</th>
              <th scope="col" className="px-2 py-3">Topic</th>
              <th scope="col" className="w-[4.5rem] px-2 py-3 text-right sm:w-24">Questions</th>
              <th scope="col" className="w-[4.5rem] py-3 pl-2 pr-3 text-right sm:w-24 sm:pr-5">Series</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const c = r.by[scope.id];
              return (
                <tr key={r.subNum} className="border-t border-hairline align-top">
                  <td className="py-3 pl-3 pr-1 text-sm tabular-nums text-faint sm:pl-5">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <Link href={r.href} className={cn("group flex min-h-11 flex-col justify-center rounded-sm py-1.5", FOCUS)}>
                      <span className="text-xs text-faint">
                        {r.topicNum} {r.topicName}
                      </span>
                      <span className="mt-0.5 font-semibold leading-snug text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 group-hover:decoration-gold">
                        <span className="tabular-nums text-faint">{r.subNum}</span> {r.subName}
                      </span>
                      {scope.id === "all" && papers.length > 1 && (
                        <span className="mt-1 text-xs tabular-nums text-faint">
                          {papers
                            .filter((p) => r.by[p.id]?.q)
                            .map((p) => `${p.label}: ${r.by[p.id].q}`)
                            .join(" · ")}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-2 py-3 text-right text-lg font-semibold tabular-nums text-foreground">{c.q}</td>
                  <td className="py-3 pl-2 pr-3 text-right text-sm tabular-nums text-body sm:pr-5">
                    {c.series}
                    <span className="text-faint">/{scope.series}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.length > TOP && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className={cn("mt-4 inline-flex min-h-11 items-center rounded-full border border-hairline-strong px-5 text-sm font-semibold text-foreground transition-colors duration-150 hover:border-white/25", FOCUS)}
        >
          {all ? `Show the top ${TOP} only` : `Show all ${list.length} topics`}
        </button>
      )}
      <p className="mt-3 text-sm text-faint">Series: how many exam series it came up in, out of the series counted.</p>

      <h2 className="mt-12 text-xl font-bold text-foreground">By main topic</h2>
      <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
        {mainList.map((m) => (
          <li key={m.num} className="flex min-h-11 items-center justify-between gap-4 py-2.5">
            <span className="text-body">
              <span className="tabular-nums text-faint">{m.num}</span> {m.name}
            </span>
            <span className="shrink-0 text-right tabular-nums">
              <span className="font-semibold text-foreground">{m.q}</span>{" "}
              <span className="text-sm text-faint">({Math.round((m.q / scope.questions) * 100)}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
