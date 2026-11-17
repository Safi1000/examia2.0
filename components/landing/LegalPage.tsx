import type { ReactNode } from "react";
import Link from "next/link";
import { Eyebrow, MarketingShell } from "./MarketingShell";

/** `id` gives a section a stable link (for example /privacy#delete); otherwise it is legal-<n>. */
export type LegalSection = { h: string; body: ReactNode; id?: string };

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
            <Link href="/" className="transition-colors duration-200 hover:text-ink">Home</Link>
            <span aria-hidden className="mx-2">/</span>
            <span aria-current="page" className="text-muted-foreground">{title}</span>
          </nav>
          <div className="mt-8">
            <Eyebrow>{eyebrow}</Eyebrow>
          </div>
          <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-ink md:text-5xl">{title}</h1>
          <p className="mt-4 text-sm text-faint">Last updated {updated}</p>
          <div className="mt-8 max-w-[65ch] text-lg leading-relaxed text-muted-foreground">{intro}</div>
          <div className="mt-12 space-y-10">
            {sections.map((s, i) => (
              <section key={s.h} aria-labelledby={s.id ?? `legal-${i}`} className="border-t border-hairline pt-8">
                <h2 id={s.id ?? `legal-${i}`} className="scroll-mt-32 text-xl font-bold text-ink">{s.h}</h2>
                <div className="mt-4 max-w-[65ch] space-y-4 text-lg leading-relaxed text-muted-foreground [&_a]:font-semibold [&_a]:text-ink [&_a]:underline [&_a]:decoration-hairline-strong [&_a]:underline-offset-4 [&_a:hover]:decoration-current [&_li]:pl-1 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
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
