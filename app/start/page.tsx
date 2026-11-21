import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { MarketingShell } from "@/components/landing/MarketingShell";
import "@/components/landing/public-calm.css";
import { TrialBox } from "@/components/study/StudyBits";
import { PAST_PAPER_SYLLABI } from "@/lib/past-papers";
import { fitTitle } from "@/lib/seo";
import { hasTopical } from "@/lib/topical";

/*
  /start: the Instagram bio link. Name, one line, then the free things in one
  thumb-scroll, then the free trial. Indexable, but kept out of the sitemap.
*/

const title = "Free Resources and Free Trial";
const description =
  "Free O Level, IGCSE and A Level past papers, most repeated topics, grade thresholds and tools for Accounting, Business and Economics, plus a free trial.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/start" },
  openGraph: { title, description, url: "/start", type: "website", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

/** Most repeated topics, in the order students ask for them. */
const REPEATED_CODES = ["7707", "0452", "2281", "0455", "9706", "9708", "9609"];
const repeated = REPEATED_CODES.map((code) => PAST_PAPER_SYLLABI.find((s) => s.code === code)).filter(
  (s): s is (typeof PAST_PAPER_SYLLABI)[number] => !!s && hasTopical(s.code),
);

const LINKS_BEFORE = [
  { href: "/past-papers", label: "Free past papers", note: "Every series, with mark schemes." },
  { href: "/past-papers/topics", label: "Practise by topic", note: "Past paper questions sorted by topic." },
];

const LINKS_AFTER = [
  { href: "/grade-thresholds", label: "Grade thresholds", note: "The marks you need for each grade." },
  { href: "/tools", label: "Free tools", note: "MCQ checker, grade predictor and calculators." },
  { href: "/blog", label: "The Exam Room", note: "Topic guides and exam technique." },
];

const row =
  "flex min-h-14 w-full items-center justify-between gap-4 rounded-card border border-hairline bg-card px-5 py-3.5 transition-colors duration-150 hover:border-hairline-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

function LinkRow({ href, label, note }: { href: string; label: string; note: string }) {
  return (
    <li>
      <Link href={href} className={row}>
        <span className="min-w-0">
          <span className="block text-base font-semibold text-body">{label}</span>
          <span className="mt-0.5 block text-sm leading-snug text-faint">{note}</span>
        </span>
        <span aria-hidden className="shrink-0 text-faint">
          →
        </span>
      </Link>
    </li>
  );
}

export default function StartPage() {
  return (
    <MarketingShell>
      <div className="public-calm mx-auto max-w-xl px-4 pb-24 pt-8 sm:px-5 md:pt-14">
        <header className="flex items-center gap-4">
          <Image
            src="/hamza.jpg"
            alt=""
            width={56}
            height={56}
            priority
            className="h-14 w-14 shrink-0 rounded-full object-cover object-top"
          />
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight text-body">Hamza Sadaqat</h1>
            <p className="mt-1 text-sm leading-snug text-faint">
              Accounting, Business and Economics. O Level, IGCSE, AS and A Level.
            </p>
          </div>
        </header>

        <ul className="mt-6 flex flex-col gap-3">
          {LINKS_BEFORE.map((l) => (
            <LinkRow key={l.href} {...l} />
          ))}

          {repeated.length > 0 && (
            <li className="rounded-card border border-hairline bg-card px-5 py-3.5">
              <p className="text-base font-semibold text-body">Most repeated topics</p>
              <p className="mt-0.5 text-sm leading-snug text-faint">Choose your subject.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {repeated.map((s) => (
                  <Link
                    key={s.code}
                    href={`/past-papers/${s.slug}/most-repeated-topics`}
                    aria-label={`Most repeated topics, ${s.name}`}
                    className="inline-flex min-h-11 min-w-14 items-center justify-center rounded-full border border-hairline px-4 text-sm font-semibold tabular-nums text-body transition-colors duration-150 hover:border-hairline-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                  >
                    {s.code}
                  </Link>
                ))}
              </div>
            </li>
          )}

          {LINKS_AFTER.map((l) => (
            <LinkRow key={l.href} {...l} />
          ))}
        </ul>

        <TrialBox
          from="start"
          title="Try one class, free."
          body="Join a real class at your level and see how it works before you decide."
        />
      </div>
    </MarketingShell>
  );
}
