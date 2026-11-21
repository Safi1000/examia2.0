import Image from "next/image";
import Link from "next/link";
import { Signature } from "@/components/spell/signature";

/**
 * After the article: who wrote it, in one short line, with my signature
 * writing itself in gold. Small on purpose: the article is the point.
 */
export function AuthorBio() {
  return (
    <section data-reveal aria-labelledby="author-h" className="mt-16 flex items-center gap-4 border-y border-hairline py-6">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-card-raised">
        <Image src="/hamza.jpg" alt="" fill sizes="56px" className="object-cover object-top" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-faint">Written by</p>
        <h2 id="author-h" className="text-lg font-bold text-ink">
          <Link href="/#meet" className="underline decoration-transparent underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
            Hamza Sadaqat
          </Link>
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">I teach Accounting, Business and Economics, and I answer every message myself.</p>
      </div>
      <Signature className="hidden h-10 w-auto shrink-0 sm:block" />
    </section>
  );
}
