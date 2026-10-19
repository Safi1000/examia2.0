import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { GuideCover } from "@/components/guides/GuideCover";
import { BookButton } from "@/components/landing/BookingModal";
import { FaqList, MarketingShell } from "@/components/landing/MarketingShell";
import { TrackedLink } from "@/components/landing/TrackedLink";
import { BUNDLE, GUIDES, type Guide } from "@/lib/guides";
import { waTextLink } from "@/lib/landing";
import { breadcrumbLd } from "@/lib/seo";

const title = "Accounting, Business and Economics Revision Guides | Hamza Teaches";
const description =
  "Revision guides and cheat sheets written by Hamza for O Level, IGCSE and A Level Accounting, Business and Economics. Cambridge and Edexcel. Instant PDF.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/guides" },
  openGraph: { title, description, url: "/guides", type: "website", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
  // Hidden until the PDF pack launches: not in the footer or sitemap.
  robots: { index: false, follow: true },
};

const FAQ = [
  {
    q: "How do I get my guide?",
    a: "Straight after payment you get a download link on screen and by email. The PDF is yours to keep.",
  },
  {
    q: "Can I pay from the UK or the Gulf?",
    a: "Yes. You pay by card at checkout, from anywhere.",
  },
  {
    q: "Which syllabus does it follow?",
    a: "Cambridge and Pearson Edexcel. Each guide says which levels and syllabus codes it covers.",
  },
];

const gold =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-gold px-5 text-[15px] font-semibold text-[#1b1e21] transition-colors hover:bg-[#ffd07a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const ghost =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-hairline-strong px-5 text-[15px] font-semibold text-body transition-colors hover:border-gold-border hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const tag = "rounded-full border border-gold-border bg-gold-tint px-2.5 py-0.5 text-xs font-semibold text-gold";

function coverLabel(g: Guide) {
  return g.subjects.length > 1 ? "All three subjects" : g.level;
}

function GuideCard({ g }: { g: Guide }) {
  const onSale = Boolean(g.buyUrl);
  return (
    <article className="grid gap-6 rounded-[24px] border border-hairline bg-card p-6 sm:grid-cols-[150px_minmax(0,1fr)]">
      <GuideCover title={g.coverTitle} label={coverLabel(g)} style={g.cover} className="max-w-[180px] sm:max-w-none" />
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          {g.subjects.map((s) => (
            <span key={s} className={tag}>
              {s}
            </span>
          ))}
          <span className={tag}>{g.level}</span>
        </div>
        <h3 className="mt-3 text-[22px] font-bold leading-tight text-foreground">{g.title}</h3>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[15px] text-muted-foreground marker:text-gold">
          {g.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="text-[26px] font-extrabold tabular-nums tracking-tight text-foreground">{g.price}</span>
          {onSale ? (
            <TrackedLink href={g.buyUrl} event="guide_buy_click" props={{ guide: g.slug }} className={gold}>
              Buy now
            </TrackedLink>
          ) : (
            <>
              <span className="rounded-full border border-hairline-strong px-3 py-1 text-sm text-faint">Coming soon</span>
              <TrackedLink
                href={waTextLink(`Hi, please tell me when the ${g.title} is out.`)}
                event="guide_notify_click"
                props={{ guide: g.slug }}
                className={ghost}
              >
                Tell me when it&apos;s out
              </TrackedLink>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

const WHY = [
  { t: "Written by me", b: "ACCA qualified, and I teach these exams every week." },
  { t: "Tested in class", b: "The same notes my own students revise from." },
  { t: "Matched to your syllabus", b: "Cambridge and Edexcel, with the codes on every guide." },
];

export default function GuidesPage() {
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Guides", path: "/guides" },
        ])}
      />

      {/* Hero */}
      <section className="pb-20 pt-14 md:pb-28 md:pt-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] md:gap-16">
          <div>
            <nav aria-label="Breadcrumb" className="text-sm text-faint">
              <Link href="/" className="hover:text-gold">Home</Link>
              <span aria-hidden className="mx-2">/</span>
              <span aria-current="page" className="text-muted-foreground">Guides</span>
            </nav>
            <p className="mt-10 font-hand text-[clamp(1.6rem,3vw,2.1rem)] font-bold leading-none text-gold">
              Written by me, for my students.
            </p>
            <h1 className="mt-4 max-w-[14ch] text-4xl font-bold leading-[1.03] tracking-tight text-foreground md:text-6xl">
              Exam guides that read like my lessons.
            </h1>
            <p className="mt-6 max-w-[44ch] text-lg leading-relaxed text-muted-foreground">
              The same explanations, worked examples and exam tips I use in class, as PDFs you keep.
            </p>
            <ul className="mt-8 flex flex-wrap gap-2.5 text-sm text-body">
              {["Instant PDF download", "Cambridge & Edexcel", "Pay by card, from anywhere"].map((f) => (
                <li key={f} className="flex items-center gap-2 rounded-full border border-hairline-strong px-3.5 py-2">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div aria-hidden className="relative mx-auto h-[260px] w-full max-w-[380px] md:h-[340px] md:max-w-none">
            {GUIDES.slice(0, 3).map((g, i) => (
              <div
                key={g.slug}
                className={`absolute w-[46%] ${
                  i === 0 ? "left-[2%] top-8 -rotate-[8deg]" : i === 1 ? "left-[27%] top-0 z-10" : "left-[52%] top-8 rotate-[7deg]"
                }`}
              >
                <GuideCover title={g.coverTitle} label={coverLabel(g)} style={g.cover} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guides */}
      <section aria-labelledby="guides-title" className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <h2 id="guides-title" className="max-w-[18ch] text-3xl font-bold leading-tight text-foreground md:text-5xl">
            Pick the guide you need.
          </h2>
          <div className="mt-12 grid gap-5 lg:grid-cols-2">
            {GUIDES.map((g) => (
              <GuideCard key={g.slug} g={g} />
            ))}
          </div>
          {BUNDLE.price && BUNDLE.buyUrl && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-5 rounded-[24px] border border-gold-border bg-gold-tint px-7 py-6">
              <div>
                <h3 className="text-[22px] font-bold text-foreground">All four guides</h3>
                <p className="mt-1 text-[15px] text-muted-foreground">Everything above in one download.</p>
              </div>
              <TrackedLink href={BUNDLE.buyUrl} event="guide_buy_click" props={{ guide: "bundle" }} className={gold}>
                Get the bundle · {BUNDLE.price}
              </TrackedLink>
            </div>
          )}
        </div>
      </section>

      {/* Sample page */}
      <section aria-labelledby="sample-title" className="py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-16">
          <figure
            className="rounded-lg bg-[#f4f1ea] p-6 text-[14px] leading-snug text-[#2a2a2a] shadow-[0_30px_60px_rgba(0,0,0,0.35)] md:rotate-1"
            aria-label="Sample page from the cheat sheet pack: the trial balance rule"
          >
            <div className="flex items-baseline justify-between border-b-2 border-[#1b1e21] pb-2">
              <b className="text-lg tracking-tight">The trial balance</b>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#8a5a0c]">Sample page</span>
            </div>
            <div className="overflow-x-auto">
              <table className="mt-3.5 w-full border-collapse text-[13px]">
                <thead>
                  <tr>
                    <th className="bg-[#1b1e21] px-2 py-1.5 text-left font-semibold text-[#f4f1ea]">Debit (DEAD)</th>
                    <th className="bg-[#1b1e21] px-2 py-1.5 text-left font-semibold text-[#f4f1ea]">Credit (CLIC)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Expenses", "Liabilities"],
                    ["Assets", "Income"],
                    ["Drawings", "Capital"],
                    ["Returns inwards", "Returns outwards"],
                    ["Discount allowed", "Discount received"],
                  ].map(([d, c]) => (
                    <tr key={d}>
                      <td className="border-b border-black/10 px-2 py-1.5">{d}</td>
                      <td className="border-b border-black/10 px-2 py-1.5">{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3.5 border-l-[3px] border-[#8a5a0c] bg-[#8a5a0c]/[0.08] px-3 py-2.5">
              <span className="block font-hand text-xl font-bold leading-none text-[#8a5a0c]">careful!</span>
              Closing inventory is usually not in the trial balance. It&apos;s given as a note.
            </p>
          </figure>
          <div>
            <h2 id="sample-title" className="max-w-[14ch] text-3xl font-bold leading-tight text-foreground md:text-5xl">
              One topic. One page. No fluff.
            </h2>
            <p className="mt-6 max-w-[42ch] text-lg leading-relaxed text-muted-foreground">
              Every cheat sheet looks like this: the rule, the traps, and the one tip I give in class.
            </p>
          </div>
        </div>
      </section>

      {/* Why */}
      <section aria-labelledby="why-title" className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <h2 id="why-title" className="max-w-[16ch] text-3xl font-bold leading-tight text-foreground md:text-5xl">
            Why buy from a teacher?
          </h2>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {WHY.map((w) => (
              <div key={w.t} className="rounded-[20px] bg-card p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold-border bg-gold-tint text-gold" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12.5l5 5L20 6.5" />
                  </svg>
                </span>
                <p className="mt-4 text-lg font-semibold text-foreground">{w.t}</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{w.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="gfaq-title" className="py-20 md:py-28">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] md:gap-16">
          <h2 id="gfaq-title" className="text-3xl font-bold leading-tight text-foreground md:text-4xl">
            Before you buy.
          </h2>
          <FaqList items={FAQ} />
        </div>
      </section>

      {/* Upsell */}
      <section className="py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] border border-hairline bg-card-raised p-7 md:p-12">
            <div className="flex min-w-0 items-center gap-5">
              <Image src="/hamza.jpg" alt="" width={72} height={72} className="h-[72px] w-[72px] shrink-0 rounded-full object-cover object-top" />
              <div>
                <h2 className="text-2xl font-bold text-foreground md:text-3xl">Rather learn it live?</h2>
                <p className="mt-1 text-[17px] text-muted-foreground">Take one free lesson with me first.</p>
              </div>
            </div>
            <BookButton from="guides_upsell" className={`${gold} min-h-12 px-7 text-base`}>
              Book your free trial lesson
            </BookButton>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
