"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useProgress } from "./progress";

export interface ProgressSyllabus {
  code: string;
  short: string;
  level: string;
  slug: string;
  /** Newest first: key, code on the paper, link. */
  papers: Array<{ k: string; c: string; u: string; t: string }>;
}

const card = "rounded-[20px] border border-hairline bg-card px-6 py-6";

/** Everything a student has done in the library, from this device. */
export function ProgressView({ syllabi, exam }: { syllabi: ProgressSyllabus[]; exam: { name: string; start: string } }) {
  const { done, seen, recent } = useProgress();
  const [today, setToday] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToday(Date.now());
  }, []);
  const days = today ? Math.max(0, Math.ceil((+new Date(`${exam.start}T00:00:00+05:00`) - today) / 86_400_000)) : null;
  const weeks = days != null ? Math.floor(days / 7) : null;
  const doneKeys = Object.keys(done);
  const answered = Object.keys(seen).length;
  const scoredAll = Object.values(done).filter((d) => d.s != null && d.m);
  const avgAll = scoredAll.length ? Math.round(scoredAll.reduce((n, d) => n + (d.s! / d.m!) * 100, 0) / scoredAll.length) : null;

  if (!doneKeys.length && !answered) {
    return (
      <div className={`${card} text-center md:py-12`}>
        <p className="text-xl font-semibold text-foreground">Nothing here yet. That changes today.</p>
        <p className="mx-auto mt-2 max-w-[44ch] text-[16px] leading-relaxed text-muted-foreground">
          Do one paper or ten quick questions and this page starts keeping score: grades, scores, and every mistake worth a second look. It lives on your phone. No sign up.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/past-papers/topics" className="inline-flex min-h-12 items-center rounded-full bg-gold px-6 font-semibold text-[#1b1e21] hover:bg-[#ffd07a]">
            Pick a topic
          </Link>
          <Link href="/past-papers" className="inline-flex min-h-12 items-center rounded-full border border-hairline-strong px-6 font-semibold text-foreground hover:border-gold-border">
            Find a paper
          </Link>
        </div>
      </div>
    );
  }

  const mine = syllabi
    .map((s) => {
      const papers = s.papers.filter((p) => done[p.k]);
      const scored = papers.map((p) => done[p.k]).filter((d) => d.s != null && d.m);
      const avg = scored.length ? Math.round(scored.reduce((n, d) => n + (d.s! / d.m!) * 100, 0) / scored.length) : null;
      const prefix = `${s.code}_`;
      const asked = Object.keys(seen).filter((id) => id.startsWith(prefix)).length;
      const next = s.papers.find((p) => !done[p.k]) ?? null;
      const last = [...papers].sort((a, b) => done[b.k].at - done[a.k].at).slice(0, 5);
      return { s, papers, avg, asked, next, last };
    })
    .filter((x) => x.papers.length || x.asked);

  return (
    <div className="space-y-8">
      {days != null && days > 0 && (
        <div className="rounded-[20px] border border-gold-border bg-card-raised px-6 py-5">
          <p className="text-[15px] text-muted-foreground">{exam.name} exams start in</p>
          <p className="mt-1 text-4xl font-bold tabular-nums text-foreground">
            {days} <span className="text-2xl text-muted-foreground">days</span>
          </p>
          {weeks != null && weeks > 0 && (
            <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-muted-foreground">
              Two timed papers a week from now is about {weeks * 2} papers per subject before the exams. Do the newest papers last, so they feel closest to the real thing.
            </p>
          )}
        </div>
      )}

      <dl className="grid grid-cols-3 gap-3">
        {[
          ["Papers done", doneKeys.length],
          ["Questions answered", answered],
          ["Average score", avgAll != null ? `${avgAll}%` : "none yet"],
        ].map(([l, v]) => (
          <div key={l} className="rounded-[18px] border border-hairline bg-card px-4 py-4 md:px-6">
            <dt className="text-[13px] text-muted-foreground md:text-[14px]">{l}</dt>
            <dd className="mt-1 text-3xl font-bold tabular-nums text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      {mine.map(({ s, papers, avg, asked, next, last }) => (
        <section key={s.code} className={card} aria-labelledby={`pg-${s.code}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id={`pg-${s.code}`} className="text-xl font-bold text-foreground">
              {s.level === "AS and A Level" ? "A Level" : s.level} {s.short}
            </h2>
            <p className="text-[15px] text-muted-foreground">
              {papers.length} {papers.length === 1 ? "paper" : "papers"}
              {avg != null ? ` · average ${avg}%` : ""}
              {asked ? ` · ${asked} questions` : ""}
            </p>
          </div>

          {last.length > 0 && (
            <ul className="mt-5 divide-y divide-hairline border-y border-hairline">
              {last.map((p) => {
                const d = done[p.k];
                return (
                  <li key={p.k}>
                    <Link href={p.u} className="flex min-h-12 items-center justify-between gap-3 py-2.5 hover:text-gold">
                      <span className="font-semibold tabular-nums text-foreground">{p.c}</span>
                      <span className="text-[15px] tabular-nums text-muted-foreground">
                        {d.s != null && d.m ? `${d.s}/${d.m}` : "Done"}
                        {d.g && <span className="ml-3 inline-block min-w-8 rounded-full bg-gold-tint px-2 py-0.5 text-center font-semibold text-gold">{d.g}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {next && (
              <Link href={next.u} className="inline-flex min-h-11 items-center rounded-full bg-gold px-5 text-[15px] font-semibold text-[#1b1e21] hover:bg-[#ffd07a]">
                Next paper: <span className="ml-1 tabular-nums">{next.c}</span>
              </Link>
            )}
            <Link href={`/past-papers/${s.slug}/topics`} className="inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-semibold text-muted-foreground hover:text-foreground">
              Topics
            </Link>
          </div>
        </section>
      ))}

      {recent.length > 0 && (
        <section aria-labelledby="recent-h">
          <h2 id="recent-h" className="text-lg font-semibold text-foreground">
            Recently opened
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {recent.map((r) => (
              <li key={r.u}>
                <Link href={r.u} className="inline-flex min-h-11 items-center rounded-full border border-hairline px-4 text-[15px] font-semibold tabular-nums text-foreground hover:border-gold-border">
                  {r.c}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[14px] text-faint">Saved on this device only. Clearing your browser data clears it.</p>
    </div>
  );
}
