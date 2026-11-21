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
            <Link href={t.href} className="transition-colors duration-150 hover:text-foreground">
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
      {intro && <div className="mt-3 max-w-[68ch] text-lg leading-relaxed text-muted-foreground">{intro}</div>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A table that scrolls sideways on its own on a phone, never the page. */
export function Table({ head, rows, caption }: { head: ReactNode[]; rows: ReactNode[][]; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-tile border border-hairline">
      <table className="w-full min-w-[480px] border-collapse text-left text-base">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="bg-card-raised">
          <tr>
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-muted-foreground">
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
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gold px-7 text-base font-semibold text-on-brand transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-gold-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto";

const quietLink =
  "font-semibold text-ink underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:decoration-current";

/**
 * The one ask on a study page: a free trial lesson. `classes` adds one quiet line
 * linking to the online classes pages (leave it off on those pages themselves).
 */
export function TrialBox({
  from,
  subject,
  level,
  title,
  body,
  classes,
}: {
  from: string;
  subject?: SubjectName;
  level?: LevelName;
  title: string;
  body: string;
  classes?: boolean;
}) {
  return (
    <aside className="mt-16 rounded-card border border-hairline bg-card-raised p-6 md:p-10">
      <h2 className="max-w-[24ch] text-2xl font-bold leading-tight text-foreground md:text-3xl">{title}</h2>
      <p className="mt-3 max-w-[56ch] text-lg leading-relaxed text-muted-foreground">{body}</p>
      <div className="mt-7">
        <BookButton from={from} subject={subject} level={level} className={gold}>
          Book your free trial lesson
        </BookButton>
      </div>
      {classes && (
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">
          See how the{" "}
          <Link href="/online-classes" className={quietLink}>
            online classes
          </Link>{" "}
          work, with class times for Pakistan and for{" "}
          <Link href="/online-classes/gulf" className={quietLink}>
            students in the Gulf
          </Link>
          .
        </p>
      )}
    </aside>
  );
}
