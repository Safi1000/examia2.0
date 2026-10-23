import Link from "next/link";
import type { ReactNode } from "react";
import { BookButton } from "@/components/landing/BookingModal";
import type { LevelName, SubjectName } from "@/lib/landing";

/** Shared pieces for the public study pages (thresholds, guides, city pages). */
export function Crumbs({ trail }: { trail: Array<{ name: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-faint">
      {trail.map((t, i) => (
        <span key={t.name}>
          {i > 0 && <span aria-hidden className="mx-2">/</span>}
          {t.href ? (
            <Link href={t.href} className="hover:text-gold">
              {t.name}
            </Link>
          ) : (
            <span aria-current="page" className="text-muted-foreground">
              {t.name}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Section({ title, id, children, intro }: { title: string; id?: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="mt-16 scroll-mt-24">
      <h2 className="text-2xl font-bold leading-tight text-foreground md:text-3xl">{title}</h2>
      {intro && <div className="mt-3 max-w-[68ch] text-[17px] leading-relaxed text-muted-foreground">{intro}</div>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A table that scrolls sideways on its own on a phone, never the page. */
export function Table({ head, rows, caption }: { head: ReactNode[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-[16px] border border-hairline">
      <table className="w-full min-w-[480px] border-collapse text-left text-[15px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-card-raised">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-4 py-3 text-[13px] font-semibold text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-hairline">
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row" className="whitespace-nowrap px-4 py-3 font-semibold text-foreground">
                    {c}
                  </th>
                ) : (
                  <td key={j} className="whitespace-nowrap px-4 py-3 tabular-nums text-body">
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const gold =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gold px-6 text-[15px] font-semibold text-[#1b1e21] transition-colors hover:bg-[#ffd07a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto";

/** The one ask on a study page: a free trial lesson. */
export function TrialBox({ from, subject, level, title, body }: { from: string; subject?: SubjectName; level?: LevelName; title: string; body: string }) {
  return (
    <aside className="mt-16 rounded-[24px] border border-gold-border bg-card-raised p-7 md:p-10">
      <h2 className="max-w-[24ch] text-2xl font-bold leading-tight text-foreground md:text-3xl">{title}</h2>
      <p className="mt-3 max-w-[56ch] text-[17px] leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-7">
        <BookButton from={from} subject={subject} level={level} className={gold}>
          Book your free trial lesson
        </BookButton>
      </div>
    </aside>
  );
}
