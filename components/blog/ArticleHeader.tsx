import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Article } from "@/lib/blog";
import { formatDate } from "@/lib/blog";
import "./article.css";

/**
 * The top of every article, kept editorial and quiet: subject, title, then my
 * name with the date and reading time. One authored moment: the gold ring
 * around my photo and the rule under the byline draw themselves once.
 * Server rendered; the motion is CSS only and skipped with reduced motion.
 */

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

function Portrait({ size }: { size: number }) {
  const r = size / 2 - 1.5;
  return (
    <span className="ah-photo relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg aria-hidden viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="1" className="ah-ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="1.5" strokeLinecap="round" pathLength={1} className="ah-ring" />
      </svg>
      <span className="absolute inset-[4px] overflow-hidden rounded-full bg-card">
        <Image src="/hamza.jpg" alt="" fill sizes={`${size}px`} priority className="object-cover object-top" />
      </span>
    </span>
  );
}

export function ArticleHeader({ a }: { a: Article }) {
  const when = a.updated ?? a.date;
  return (
    <header className="mt-10 md:mt-14">
      <p className="ah-in text-sm font-semibold" style={d(0)}>
        <span className="text-gold">{a.subject}</span>
        <span className="text-faint">
          <span aria-hidden className="mx-2">/</span>
          <span className="tabular-nums">{a.code}</span>
        </span>
      </p>

      <h1 className="ah-title mt-5 text-balance text-[2.375rem] font-bold leading-[1.06] tracking-[-0.022em] text-ink md:text-[3.25rem]">
        {a.title}
      </h1>

      <div className="ah-in mt-9 flex items-center gap-3" style={d(160)}>
        <Portrait size={44} />
        <div className="min-w-0 leading-tight">
          <Link
            href="/#meet"
            className="text-[0.95rem] font-semibold text-ink underline decoration-transparent underline-offset-4 transition-colors duration-200 hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
          >
            Hamza Sadaqat
          </Link>
          <p className="mt-1 text-sm text-faint">
            {a.updated ? "Updated " : ""}
            <time dateTime={when}>{formatDate(when)}</time>
            <span aria-hidden className="mx-1.5">·</span>
            {a.minutes} min read
          </p>
        </div>
      </div>

      <div aria-hidden className="ah-rule mt-9 h-px w-full" />
    </header>
  );
}
