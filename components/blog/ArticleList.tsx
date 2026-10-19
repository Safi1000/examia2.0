import Link from "next/link";
import type { Article } from "@/lib/blog";

/** Every article as a card, newest first. No filters: students just browse.
 *  Centred, so one or two articles don't sit off to the left. */
export function ArticleList({ articles, dates }: { articles: Article[]; dates: Record<string, string> }) {
  return (
    <ul className="flex flex-wrap justify-center gap-5">
      {articles.map((a) => (
        <li key={a.slug} className="w-full sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)]">
          <Link
            href={`/blog/${a.slug}`}
            data-spot
            className="group flex h-full flex-col rounded-[20px] border border-hairline bg-card/80 p-7 backdrop-blur-sm transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-gold-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
              {a.subject} · {a.level}
            </p>
            <h2 className="mt-3 text-xl font-bold leading-snug text-foreground group-hover:text-gold">{a.title}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{a.description}</p>
            <p className="mt-auto pt-6 text-sm text-faint">
              {dates[a.slug]} · {a.minutes} min read
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
