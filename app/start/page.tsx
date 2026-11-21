import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { BookButton } from "@/components/landing/BookingModal";
import { MarketingShell } from "@/components/landing/MarketingShell";
import "@/components/landing/public-calm.css";
import { PAST_PAPER_SYLLABI } from "@/lib/past-papers";
import { fitTitle } from "@/lib/seo";
import { hasTopical } from "@/lib/topical";

/*
  /start: the Instagram bio link. One job: book the free trial class.
  Photo, one promise, one gold button, proof, then three free things for
  students not ready yet, and the button again at the end.
  Indexable, but kept out of the sitemap.
*/

const title = "Free Trial Class with Hamza";
const description =
  "Live Accounting, Business and Economics classes for O Level, IGCSE, AS and A Level. Your first class is free. Plus free past papers and topic practice.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/start" },
  openGraph: { title, description, url: "/start", type: "website", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

// Facts as shown in the homepage's Meet Hamza section.
const PROOF = [
  { v: "100+", k: "students taught" },
  { v: "4+", k: "years teaching" },
  { v: "Straight As", k: "in these subjects" },
];

const REPEATED_CODES = ["7707", "0452", "2281", "0455", "9706", "9708", "9609"];
const repeated = REPEATED_CODES.map((code) => PAST_PAPER_SYLLABI.find((s) => s.code === code)).filter(
  (s): s is (typeof PAST_PAPER_SYLLABI)[number] => !!s && hasTopical(s.code),
);

const gold =
  "inline-flex min-h-14 w-full items-center justify-center rounded-full bg-gold px-7 text-lg font-semibold text-on-brand transition-[background-color,transform] duration-150 hover:bg-gold-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

const row =
  "flex min-h-14 w-full items-center justify-between gap-4 px-5 py-3.5 transition-colors duration-150 hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gold";

export default function StartPage() {
  return (
    <MarketingShell heroCta>
      <div className="public-calm mx-auto max-w-md px-4 pb-24 pt-8 sm:px-5 md:pt-14">
        <section aria-labelledby="start-h" className="text-center">
          <span className="relative mx-auto block h-24 w-24 rounded-full bg-[conic-gradient(from_210deg,#FBC159,rgba(251,193,89,0.18)_38%,#FBC159_72%,rgba(251,193,89,0.35))] p-[2px]">
            <span className="block h-full w-full overflow-hidden rounded-full bg-band-c p-[3px]">
              <Image src="/hamza.jpg" alt="Hamza Sadaqat" width={96} height={96} priority className="h-full w-full rounded-full object-cover object-top" />
            </span>
          </span>
          <p className="mt-4 text-sm font-semibold text-faint">Hamza Sadaqat, Accounting, Business and Economics teacher</p>
          <h1 id="start-h" className="mx-auto mt-3 max-w-[16ch] text-balance text-[2.25rem] font-bold leading-[1.05] tracking-tight text-ink">
            Your first class is free.
          </h1>
          <p className="mx-auto mt-4 max-w-[30ch] text-lg leading-relaxed text-muted-foreground">
            Live classes in small groups for O Level, IGCSE, AS and A2. Sit in, then decide.
          </p>
          <div data-hero-cta className="mt-7">
            <BookButton from="start" className={gold}>
              Book my free class
            </BookButton>
          </div>
        </section>

        <dl className="mt-8 grid grid-cols-3 divide-x divide-hairline rounded-card border border-hairline bg-card">
          {PROOF.map((p) => (
            <div key={p.k} className="px-2 py-4 text-center">
              <dd className="text-lg font-bold tabular-nums text-ink">{p.v}</dd>
              <dt className="mt-1 text-xs leading-tight text-faint">{p.k}</dt>
            </div>
          ))}
        </dl>

        <section aria-labelledby="free-h" className="mt-12">
          <h2 id="free-h" className="text-sm font-semibold text-muted-foreground">
            Not ready yet? Start free.
          </h2>
          <ul className="mt-3 divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-card">
            <li>
              <Link href="/past-papers" className={row}>
                <span>
                  <span className="block text-base font-semibold text-body">Past papers with mark schemes</span>
                  <span className="mt-0.5 block text-sm text-faint">Every series up to 2026.</span>
                </span>
                <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-faint"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            </li>
            {repeated.length > 0 && (
              <li className="px-5 py-3.5">
                <span className="block text-base font-semibold text-body">Most repeated topics</span>
                <span className="mt-0.5 block text-sm text-faint">Counted from every past paper. Pick your code.</span>
                <span className="mt-3 flex flex-wrap gap-2">
                  {repeated.map((s) => (
                    <Link
                      key={s.code}
                      href={`/past-papers/${s.slug}/most-repeated-topics`}
                      aria-label={`Most repeated topics, ${s.name}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-hairline px-4 text-sm font-semibold tabular-nums text-body transition-colors duration-150 hover:border-hairline-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                    >
                      {s.code}
                    </Link>
                  ))}
                </span>
              </li>
            )}
            <li>
              <Link href="/tools" className={row}>
                <span>
                  <span className="block text-base font-semibold text-body">Free tools</span>
                  <span className="mt-0.5 block text-sm text-faint">Grade predictor, MCQ checker, calculators.</span>
                </span>
                <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-faint"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            </li>
          </ul>
        </section>

        <section aria-labelledby="end-h" className="mt-12 rounded-card border border-hairline bg-card-raised p-6 text-center">
          <h2 id="end-h" className="text-2xl font-bold leading-tight text-ink">
            One free class. No payment.
          </h2>
          <p className="mx-auto mt-2 max-w-[30ch] text-base leading-relaxed text-muted-foreground">
            Pick your subject and level. I confirm on WhatsApp.
          </p>
          <div className="mt-6">
            <BookButton from="start-end" className={gold}>
              Book my free class
            </BookButton>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}
