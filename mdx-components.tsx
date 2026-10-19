import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";

/**
 * How article text looks. Required by @next/mdx. Article-specific boxes
 * (<BookingBox />) are passed in by app/blog/[slug]/page.tsx.
 */
const components: MDXComponents = {
  h2: (p) => <h2 className="mt-14 scroll-mt-28 text-2xl font-bold leading-tight text-foreground md:text-3xl" {...p} />,
  h3: (p) => <h3 className="mt-10 text-xl font-bold text-foreground" {...p} />,
  p: (p) => <p className="mt-5 text-[17px] leading-[1.75] text-body" {...p} />,
  ul: (p) => <ul className="mt-5 list-disc space-y-2 pl-6 text-[17px] leading-[1.7] text-body marker:text-gold" {...p} />,
  ol: (p) => <ol className="mt-5 list-decimal space-y-2 pl-6 text-[17px] leading-[1.7] text-body marker:font-semibold marker:text-gold" {...p} />,
  li: (p) => <li className="pl-1" {...p} />,
  strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
  em: (p) => <em className="italic text-foreground" {...p} />,
  blockquote: (p) => <blockquote className="mt-6 border-l-2 border-gold pl-5 text-[17px] italic text-muted-foreground" {...p} />,
  hr: () => <hr className="my-12 border-hairline" />,
  a: ({ href = "", ...p }: ComponentPropsWithoutRef<"a">) =>
    href.startsWith("/") || href.startsWith("#") ? (
      <Link href={href} className="font-semibold text-gold underline-offset-4 hover:underline" {...p} />
    ) : (
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-gold underline-offset-4 hover:underline" {...p} />
    ),
  table: (p) => (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-hairline">
      <table className="w-full border-collapse text-left text-[15px] tabular-nums" {...p} />
    </div>
  ),
  thead: (p) => <thead className="bg-card-raised text-foreground" {...p} />,
  th: (p) => <th className="border-b border-hairline px-3 py-3 font-semibold sm:px-4" {...p} />,
  td: (p) => <td className="border-b border-hairline px-3 py-2.5 text-body sm:px-4" {...p} />,
  code: (p) => <code className="rounded bg-card-raised px-1.5 py-0.5 text-[0.9em] text-foreground" {...p} />,
  Tip: ({ title = "Exam tip", children }: { title?: string; children: ReactNode }) => (
    <aside className="mt-8 rounded-2xl border border-gold-border bg-gold-tint p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">{title}</p>
      <div className="[&>p:first-child]:mt-2">{children}</div>
    </aside>
  ),
};

export function useMDXComponents(): MDXComponents {
  return components;
}
