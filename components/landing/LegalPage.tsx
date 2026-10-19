import type { ReactNode } from "react";
import Link from "next/link";
import { Eyebrow, MarketingShell } from "./MarketingShell";

export type LegalSection = { h: string; body: ReactNode };

/** Shared layout for /privacy and /terms: a readable single column. */
export function LegalPage({
  eyebrow,
  title,
  updated,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <MarketingShell>
      <article className="pb-20 pt-14 md:pb-28 md:pt-20">
        <div className="mx-auto max-w-3xl px-5">
          <nav aria-label="Breadcrumb" className="text-sm text-faint">
            <Link href="/" className="hover:text-gold">Home</Link>
            <span aria-hidden className="mx-2">/</span>
            <span aria-current="page" className="text-muted-foreground">{title}</span>
          </nav>
          <div className="mt-8">
            <Eyebrow>{eyebrow}</Eyebrow>
          </div>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-foreground md:text-5xl">{title}</h1>
          <p className="mt-4 text-sm text-faint">Last updated {updated}</p>
          <div className="mt-8 text-[17px] leading-relaxed text-muted-foreground">{intro}</div>
          <div className="mt-12 space-y-10">
            {sections.map((s, i) => (
              <section key={s.h} aria-labelledby={`legal-${i}`} className="border-t border-hairline pt-8">
                <h2 id={`legal-${i}`} className="text-xl font-bold text-foreground md:text-2xl">{s.h}</h2>
                <div className="mt-4 space-y-4 text-[17px] leading-relaxed text-muted-foreground [&_a]:font-semibold [&_a]:text-gold [&_a:hover]:underline [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                  {s.body}
                </div>
              </section>
            ))}
          </div>
        </div>
      </article>
    </MarketingShell>
  );
}
