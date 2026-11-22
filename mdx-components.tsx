import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { headingId, textOf } from "@/components/blog/headings";

/**
 * How article text looks. Required by @next/mdx. Article-specific boxes
 * (<BookingBox />) are passed in by app/blog/[slug]/page.tsx.
 */
const components: MDXComponents = {
  // The id matches the "On this page" list (components/blog/headings.ts).
  h2: (p) => <h2 id={headingId(textOf(p.children))} className="mt-14 scroll-mt-28 text-2xl font-bold leading-tight text-foreground md:text-3xl" {...p} />,
  h3: (p) => <h3 className="mt-10 text-xl font-bold text-foreground" {...p} />,
  // The closing "Sources:" line is a footnote, not body text: small, quiet, under a rule.
  p: (p) =>
    /^Sources\b/.test(textOf(p.children)) ? (
      <p className="mt-12 border-t border-hairline pt-5 text-sm leading-relaxed text-faint [&_a]:font-normal [&_a]:text-muted-foreground [&_strong]:font-semibold [&_strong]:text-muted-foreground" {...p} />
    ) : (
      <p className="mt-5 text-lg leading-[1.75] text-body" {...p} />
    ),
  ul: (p) => <ul className="mt-5 list-disc space-y-2 pl-6 text-lg leading-[1.7] text-body marker:text-faint" {...p} />,
  ol: (p) => <ol className="mt-5 list-decimal space-y-2 pl-6 text-lg leading-[1.7] text-body marker:font-semibold marker:text-faint" {...p} />,
  li: (p) => <li className="pl-1" {...p} />,
  strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
  em: (p) => <em className="italic text-foreground" {...p} />,
  blockquote: (p) => <blockquote className="mt-6 border-l-2 border-hairline-strong pl-5 text-lg italic text-muted-foreground" {...p} />,
  hr: () => <hr className="my-12 border-hairline" />,
  a: ({ href = "", ...p }: ComponentPropsWithoutRef<"a">) =>
    href.startsWith("/") || href.startsWith("#") ? (
      <Link href={href} className="font-semibold text-ink underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:decoration-current" {...p} />
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:decoration-current" {...p} />
    ),
  table: (p) => (
    // Focusable so a keyboard user can scroll a wide table sideways with the arrow keys.
    <div
      tabIndex={0}
      role="region"
      aria-label="Table, scrolls sideways"
      className="mt-6 overflow-x-auto rounded-tile border border-hairline bg-card [scrollbar-width:thin] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <table className="w-full border-collapse text-left text-sm tabular-nums" {...p} />
    </div>
  ),
  thead: (p) => <thead className="bg-card-raised text-foreground" {...p} />,
  th: (p) => <th className="whitespace-nowrap border-b border-hairline px-3 py-3 text-sm font-semibold sm:px-4" {...p} />,
  td: (p) => <td className="border-b border-hairline px-3 py-2.5 text-body sm:px-4" {...p} />,
  code: (p) => <code className="rounded bg-card-raised px-1.5 py-0.5 text-[0.9em] text-foreground" {...p} />,
  Tip: ({ title = "Exam tip", children }: { title?: string; children: ReactNode }) => (
    <aside className="pc-surface mt-8 rounded-tile p-5">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <div className="[&>p:first-child]:mt-2">{children}</div>
    </aside>
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
