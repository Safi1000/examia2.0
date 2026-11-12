import Link from "next/link";
import { LANDING } from "@/lib/landing";
import { Logo } from "@/components/Brand";

const linkCls =
  "inline-flex min-h-11 items-center text-[15px] text-muted-foreground transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

// Three links, one row: the footer stays calm (the header keeps only Login and the free trial). The other free pages are reached from Free tools,
// from each other, and from the links at the foot of every study page.
const LINKS: Array<{ label: string; href: string; external?: boolean }> = [
  { label: "Past papers", href: "/past-papers" },
  { label: "Free tools", href: "/tools" },
  { label: "@hamzateaches", href: LANDING.instagram, external: true },
];

/**
 * Centred to sit under the closing call to action. Only what appears nowhere
 * else: WhatsApp has the floating button and Login is in the header, so
 * neither repeats here. The legal line is the privacy policy only (it links
 * to the terms).
 */
export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-hairline bg-gradient-to-b from-transparent to-[rgba(10,11,12,0.6)]">
      <div className="mx-auto flex max-w-6xl flex-col items-center px-5 pb-8 pt-12 text-center">
        <Link href="/" aria-label="Hamza Teaches home" className="inline-block rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold">
          <Logo className="h-10 opacity-95" />
        </Link>
        <nav aria-label="Footer" className="mt-6">
          <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-1">
            {LINKS.map((l) => (
              <li key={l.label}>
                {l.external ? (
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                    {l.label}
                  </a>
                ) : (
                  <Link href={l.href} className={linkCls}>
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-8 flex w-full flex-col items-center justify-between gap-1 border-t border-hairline pb-16 pt-6 text-sm text-faint sm:flex-row sm:pb-2 sm:pr-20">
          <p>© {year} {LANDING.brand}</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="inline-flex min-h-11 items-center transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
              Privacy policy
            </Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center transition-colors hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
