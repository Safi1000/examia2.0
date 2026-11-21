import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Article } from "@/lib/blog";
import { formatDate } from "@/lib/blog";
import "./article.css";

/**
 * The top of every article: what it is, the title, and who wrote it: my name
 * and photo in a gold ring that draws itself once. Kept small on purpose, so
 * the article leads, not the author.
 * Server rendered; the motion is CSS only and skipped with reduced motion.
 */

const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

function Portrait({ size }: { size: number }) {
  const r = size / 2 - 2;
  return (
    <span className="ah-photo relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg aria-hidden viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="1.5" className="ah-ring-track" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="2" strokeLinecap="round" pathLength={1} className="ah-ring" />
      </svg>
      <span className="absolute inset-[5px] overflow-hidden rounded-full bg-card">
        <Image src="/hamza.jpg" alt="Hamza Sadaqat" fill sizes={`${size}px`} priority className="object-cover object-top" />
      </span>
    </span>
  );
}

export function ArticleHeader({ a, sections }: { a: Article; sections: number }) {
  const when = a.updated ?? a.date;
  return (
    <header className="mt-8">
      <p className="ah-in flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-faint" style={d(0)}>
        <span className="text-gold">{a.subject}</span>
        <span aria-hidden>·</span>
        <span>{a.level}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{a.code}</span>
      </p>

      <h1 className="ah-title mt-4 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-ink md:text-5xl">{a.title}</h1>

      <p className="ah-in mt-6 text-lg leading-relaxed text-muted-foreground" style={d(120)}>
        {a.description}
      </p>

      <div className="ah-in mt-8 flex items-center gap-3.5 border-b border-hairline pb-8" style={d(220)}>
        <Portrait size={52} />
        <div className="min-w-0">
          <p className="text-base font-semibold text-ink">
            <Link href="/#meet" className="underline decoration-transparent underline-offset-4 transition-colors duration-200 hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
              Hamza Sadaqat
            </Link>
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-sm text-faint">
            <span>
              {a.updated ? "Updated " : ""}
              <time dateTime={when}>{formatDate(when)}</time>
            </span>
            <span aria-hidden>·</span>
            <span>{a.minutes} min read</span>
            {sections > 2 && (
              <>
                <span aria-hidden>·</span>
                <span>{sections} sections</span>
              </>
            )}
          </p>
        </div>
      </div>
    </header>
  );
}
