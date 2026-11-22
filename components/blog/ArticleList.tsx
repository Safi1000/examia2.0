"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Article } from "@/lib/blog";

/**
 * The Exam Room's shelf. One choice (your subject) and a search box, then the
 * articles, newest first. Every article link is in the page for Google; the
 * filter only hides cards.
 */
const SUBJECTS = ["All", "Accounting", "Business", "Economics"] as const;
type Subject = (typeof SUBJECTS)[number];

const chip = (on: boolean) =>
  `inline-flex min-h-11 items-center rounded-full border px-3 text-[13px] font-semibold sm:px-4 sm:text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
    on ? "border-white/[0.16] bg-white/[0.12] text-foreground" : "border-hairline-strong text-muted-foreground hover:border-white/25 hover:text-foreground"
  }`;

export function ArticleList({ articles, dates }: { articles: Article[]; dates: Record<string, string> }) {
  const [subject, setSubject] = useState<Subject>("All");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return new Set(
      articles
        .filter((a) => subject === "All" || a.subject === subject)
        .filter((a) => {
          if (!words.length) return true;
          const hay = `${a.title} ${a.code} ${a.level} ${a.description}`.toLowerCase();
          return words.every((w) => hay.includes(w));
        })
        .map((a) => a.slug),
    );
  }, [articles, subject, q]);

  return (
    <div>
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <div role="group" aria-label="Subject" className="flex justify-center gap-1.5 sm:gap-2">
          {SUBJECTS.map((s) => (
            <button key={s} type="button" aria-pressed={subject === s} onClick={() => setSubject(s)} className={chip(subject === s)}>
              {s}
            </button>
          ))}
        </div>
        <label className="relative block">
          <span className="sr-only">Search articles</span>
          <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-faint">
            <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <path d="m14 14 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a topic or code, like 7707 or elasticity"
            className="min-h-12 w-full rounded-full border border-hairline-strong bg-card pl-11 pr-4 text-base text-ink placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          />
        </label>
        <p aria-live="polite" className="text-center text-sm tabular-nums text-faint">
          {shown.size} {shown.size === 1 ? "article" : "articles"}
        </p>
      </div>

      <ul className="mt-6 flex flex-wrap justify-center gap-4 md:mt-8 md:gap-5">
        {articles.map((a) => (
          <li key={a.slug} hidden={!shown.has(a.slug)} className="w-full sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)]">
            <Link
              href={`/blog/${a.slug}`}
              className="pc-surface pc-surface-link group flex h-full flex-col rounded-card p-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold md:p-6"
            >
              <p className="text-sm font-semibold text-faint">
                <span className="text-muted-foreground">{a.subject}</span>
                <span aria-hidden className="mx-2">/</span>
                <span className="tabular-nums">{a.code}</span>
              </p>
              <h2 className="mt-2.5 text-lg font-bold leading-snug text-ink md:text-xl">{a.title}</h2>
              <p className="mt-2.5 line-clamp-2 text-base leading-relaxed text-muted-foreground">{a.description}</p>
              <p className="mt-auto pt-4 text-sm tabular-nums text-faint">
                {dates[a.slug]}, {a.minutes} min read
              </p>
            </Link>
          </li>
        ))}
      </ul>

      {shown.size === 0 && (
        <p className="mt-10 text-center text-base text-muted-foreground">
          Nothing matches yet.{" "}
          <button
            type="button"
            onClick={() => {
              setQ("");
              setSubject("All");
            }}
            className="font-semibold text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-current"
          >
            Show every article
          </button>
        </p>
      )}
    </div>
  );
}
