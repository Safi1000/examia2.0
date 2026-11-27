import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell, FaqList } from "@/components/landing/MarketingShell";
import { BookButton } from "@/components/landing/BookingModal";
import { Reviews } from "@/components/landing/Sections";
import { WordsStagger } from "@/components/spell/words-stagger";
import { Signature } from "@/components/spell/signature";
import "@/components/landing/public-calm.css";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { articleSlugs } from "@/lib/blog";
import { EXAMINER_REPORTS, EXAMINER_REPORTS_HUB } from "@/lib/examiner-reports";
import { FORMULA_SHEETS } from "@/lib/formula-sheets";
import { FAQS, LANDING } from "@/lib/landing";
import { PAST_PAPER_SYLLABI, paperCount } from "@/lib/past-papers";
import { absolute, breadcrumbLd, fitTitle, personLd, SITE_URL } from "@/lib/seo";
import { LEVEL_PAGES, levelPath, SUBJECT_PAGES, tuitionPath } from "@/lib/subjects";
import { RECORDING_HOURS } from "@/lib/timetable";
import { topicalFor } from "@/lib/topical";

/**
 * /about: the one page that says who Hamza is, for parents, Google and AI tools.
 * Every fact comes from brand.md or is already on the live homepage: ACCA
 * Affiliate (confirmed 27 Nov 2026), "Straight As", "100+ students", "4+ years",
 * subjects and boards, Rawalpindi, Google Meet, recordings for RECORDING_HOURS
 * hours, weekly tests Hamza marks, the March and April past paper window, and
 * the mission line from the VSL. Resource counts are worked out from the site's
 * own data at build time, so they stay true. No class size wording.
 * Off-site profiles (Instagram, YouTube, Google Business Profile) should link here.
 */
const title = "About Hamza: Accounting, Business and Economics Teacher";
const description =
  "Hamza is an ACCA Affiliate teaching Cambridge and Edexcel O Level, IGCSE, AS and A Level Accounting, Business and Economics, live online from Rawalpindi.";
const path = "/about";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: path },
  openGraph: { title, description, url: path, type: "profile", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};

const CODES: Record<string, string> = {
  "accounting/o-level-igcse": "7707 · 0452",
  "accounting/a-level": "9706",
  "business/o-level-igcse": "7081 · 0264",
  "business/a-level": "9609",
  "economics/o-level-igcse": "2281 · 0455",
  "economics/a-level": "9708",
};

const STATS = [
  { v: "Straight As", k: "In the subjects I teach" },
  { v: "100+", k: "Students taught" },
  { v: "4+", k: "Years teaching" },
];

const WEEK = [
  { t: "Live classes", d: "Monday to Friday on Google Meet, cameras on. Stop me and ask in the class itself." },
  { t: "Every class recorded", d: `Missed one, or want it again? The recording stays open for ${RECORDING_HOURS} hours.` },
  { t: "A test every week", d: "I make it and mark it myself, with feedback on the exact mistakes that cost you marks." },
  { t: "A direct line to me", d: "Questions between classes go to my WhatsApp. I answer everything myself." },
  { t: "March and April", d: "The syllabus is finished first, then a past paper window before the May / June exams." },
];

// The questions parents and new students ask about the teacher, answered in the homepage's own words.
const ABOUT_FAQ = FAQS.filter((f) => /parents|exam boards|starting from zero|outside Pakistan|really free/i.test(f.q));

const rise = "transition-colors duration-150 group-hover:text-foreground";

function Arrow({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`text-faint ${rise} ${className}`}>
      →
    </span>
  );
}

const fmt = (n: number) => n.toLocaleString("en-GB");

export default function AboutPage() {
  // Real counts from the site's data.
  const papers = PAST_PAPER_SYLLABI.reduce((n, s) => n + paperCount(s.code), 0);
  const questions = PAST_PAPER_SYLLABI.reduce((n, s) => n + topicalFor(s.code).reduce((m, e) => m + e.questions.length, 0), 0);
  const reports = EXAMINER_REPORTS.length;
  const articles = articleSlugs().length;
  const RESOURCES = [
    { href: "/past-papers", n: papers, label: "Past papers with mark schemes", note: "Question papers and mark schemes for every syllabus I teach" },
    { href: "/past-papers/topics", n: questions, label: "Past paper questions by topic", note: "Sorted into the syllabus, so you can drill one topic" },
    { href: EXAMINER_REPORTS_HUB, n: reports, label: "Examiner reports", note: "Where students lost marks, in plain words" },
    { href: "/tools", n: FORMULA_SHEETS.length, label: "Formula sheets", note: "Plus diagrams and calculators, free" },
    { href: "/blog", n: articles, label: "Articles in The Exam Room", note: "Exam technique, topic by topic" },
  ];

  // The Person node without its own @context, nested inside the ProfilePage.
  const personNode: Record<string, unknown> = { ...personLd() };
  delete personNode["@context"];

  return (
    <MarketingShell>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "About", path }])} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          "@id": `${absolute(path)}#page`,
          url: absolute(path),
          name: title,
          description,
          isPartOf: { "@id": `${SITE_URL}/#website` },
          mainEntity: {
            ...personNode,
            description,
            homeLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Rawalpindi", addressCountry: "PK" } },
            hasCredential: {
              "@type": "EducationalOccupationalCredential",
              credentialCategory: "Professional qualification",
              name: "ACCA Affiliate",
              recognizedBy: { "@type": "Organization", name: "ACCA", url: "https://www.accaglobal.com" },
            },
          },
        }}
      />

      <div className="public-calm">
        {/* ---------- Hero: portrait and who I am ---------- */}
        <section id="top" className="relative pb-16 pt-10 md:pb-24 md:pt-16">
          <div className="mx-auto max-w-6xl px-5">
            <Crumbs trail={[{ name: "Home", href: "/" }, { name: "About" }]} />
            <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-center md:gap-16">
              <div className="relative mx-auto w-full max-w-[17rem] md:mx-0 md:max-w-sm">
                <div className="pc-frame relative aspect-[4/5] w-full overflow-hidden rounded-card bg-card">
                  <Image
                    src="/hamza.jpg"
                    alt="Hamza, Accounting, Business and Economics teacher"
                    fill
                    priority
                    sizes="(max-width: 768px) 272px, 384px"
                    className="object-cover object-top"
                  />
                  <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-band-c/80 to-transparent" />
                  <span className="absolute bottom-4 left-4 rounded-full border border-hairline-strong bg-band-c/80 px-3 py-1 text-xs font-semibold text-ink backdrop-blur-sm">
                    ACCA Affiliate
                  </span>
                </div>
              </div>

              <div data-reveal>
                <p className="pc-label">About</p>
                <h1 className="mt-4 max-w-[18ch] text-[2.25rem] leading-[1.06] md:text-6xl md:leading-[1.02]">
                  <WordsStagger>I&apos;m Hamza. I teach three subjects, and only three.</WordsStagger>
                </h1>
                <p className="mt-6 max-w-[58ch] text-lg leading-relaxed text-body">
                  Accounting, Business and Economics, for Cambridge O Level, IGCSE, AS and A Level and the Pearson Edexcel equivalents. I&apos;m
                  qualified in the subjects I teach. No side hustles, no rotating tutors: the person who teaches your class is the person who
                  marks your test and answers your messages.
                </p>
                <p className="mt-4 text-base text-muted-foreground">Based in Rawalpindi. Teaching students across Pakistan and the Gulf.</p>

                <dl className="pc-surface mt-8 grid grid-cols-3 divide-x divide-hairline rounded-tile">
                  {STATS.map((s) => (
                    <div key={s.k} className="flex flex-col-reverse justify-end px-3 py-4 sm:px-5">
                      <dt className="mt-1 text-xs leading-snug text-faint">{s.k}</dt>
                      <dd className="whitespace-nowrap text-base font-extrabold leading-tight tracking-[-0.02em] tabular-nums text-ink sm:text-2xl">{s.v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-8">
                  <BookButton
                    from="about"
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gold px-7 text-base font-semibold text-on-brand transition-[background-color,transform] duration-150 hover:bg-gold-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto"
                  >
                    Book your free trial lesson
                    <span aria-hidden>→</span>
                  </BookButton>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------- What I believe ---------- */}
        <section className="border-y border-hairline py-16 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-16">
            <figure data-reveal>
              <span aria-hidden className="block text-6xl font-extrabold leading-none text-gold md:text-7xl">
                &ldquo;
              </span>
              <blockquote className="mt-2 max-w-[24ch] text-[1.75rem] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink md:text-[2.5rem]">
                That is the standard I hold myself up to, and that is the standard I will hold you up to.
              </blockquote>
              <figcaption className="mt-6">
                <Signature className="h-14 w-auto md:h-16" />
              </figcaption>
            </figure>
            <div data-reveal style={{ "--rd": "120ms" } as React.CSSProperties} className="space-y-5 self-end text-lg leading-relaxed text-body">
              <h2 className="text-2xl leading-tight md:text-3xl">I teach the way I wish someone had taught me.</h2>
              <p>
                Most marks are not lost on knowing the syllabus. They are lost between knowing it and writing the answer the examiner wants. That
                gap is what I teach.
              </p>
              <p>I mark every weekly test myself, so I know which topic you got stuck on last week, and that is where we start.</p>
            </div>
          </div>
        </section>

        {/* ---------- A week in my class ---------- */}
        <section className="py-16 md:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <div data-reveal className="max-w-2xl">
              <p className="pc-label">How it works</p>
              <h2 className="mt-4 text-[2rem] leading-[1.08] md:text-5xl">A week in my class.</h2>
            </div>
            <ol className="relative mt-12 grid gap-4 md:grid-cols-5 md:gap-5">
              <span aria-hidden className="absolute left-[1.15rem] top-6 bottom-6 w-px md:left-6 md:right-6 md:top-[1.15rem] md:bottom-auto md:h-px md:w-auto bg-gradient-to-b from-gold/50 via-white/15 to-transparent md:bg-gradient-to-r" />
              {WEEK.map((w, i) => (
                <li
                  key={w.t}
                  data-reveal
                  style={{ "--rd": `${i * 80}ms` } as React.CSSProperties}
                  className="relative grid grid-cols-[2.3rem_1fr] gap-4 md:grid-cols-1 md:gap-5"
                >
                  <span className="relative z-10 flex h-[2.3rem] w-[2.3rem] items-center justify-center rounded-full border border-gold/45 bg-band-b text-sm font-bold tabular-nums text-gold shadow-[0_0_0_6px_var(--color-band-b)]">
                    {i + 1}
                  </span>
                  <div className="pc-surface rounded-card p-5 md:min-h-[12.5rem]">
                    <h3 className="text-lg leading-snug">{w.t}</h3>
                    <p className="mt-2 text-base leading-relaxed text-muted-foreground">{w.d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------- Proof ---------- */}
        <Reviews />

        {/* ---------- What I teach ---------- */}
        <section className="py-16 md:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <div data-reveal className="max-w-2xl">
              <p className="pc-label">What I teach</p>
              <h2 className="mt-4 text-[2rem] leading-[1.08] md:text-5xl">Three subjects. Every level.</h2>
            </div>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {SUBJECT_PAGES.map((s, i) => (
                <article
                  key={s.slug}
                  data-reveal
                  style={{ "--rd": `${i * 100}ms` } as React.CSSProperties}
                  className="pc-surface flex flex-col overflow-hidden rounded-card"
                >
                  <div className="border-b border-hairline px-6 py-6">
                    <h3 className="text-2xl">
                      <Link href={tuitionPath(s.slug)} className="transition-colors hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold">
                        {s.subject}
                      </Link>
                    </h3>
                    <p className="mt-3 text-base leading-relaxed text-muted-foreground">{s.intro}</p>
                  </div>
                  <ul className="mt-auto divide-y divide-hairline">
                    {LEVEL_PAGES.filter((p) => p.subjectSlug === s.slug).map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={levelPath(p.subjectSlug, p.slug)}
                          className="group flex min-h-16 items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-white/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-gold"
                        >
                          <span>
                            <span className="block text-base font-semibold text-ink">{p.name}</span>
                            <span className="mt-0.5 block text-sm tabular-nums text-faint">{CODES[`${p.subjectSlug}/${p.slug}`]}</span>
                          </span>
                          <Arrow />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
            <p className="mt-6 text-base text-muted-foreground">
              On Edexcel?{" "}
              <Link href="/syllabus/edexcel" className="font-semibold text-ink underline decoration-hairline-strong underline-offset-4 transition-colors hover:decoration-current">
                See the International GCSE and International A Level guides
              </Link>
              .
            </p>
          </div>
        </section>

        {/* ---------- Free resources, with real counts ---------- */}
        <section className="border-t border-hairline py-16 md:py-28">
          <div className="mx-auto max-w-6xl px-5">
            <div data-reveal className="max-w-2xl">
              <p className="pc-label">Free for everyone</p>
              <h2 className="mt-4 text-[2rem] leading-[1.08] md:text-5xl">Built for my students. Open to all.</h2>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">Use them with or without my classes.</p>
            </div>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {RESOURCES.map((r, i) => (
                <li key={r.href} data-reveal style={{ "--rd": `${i * 70}ms` } as React.CSSProperties} className={i === 0 ? "lg:row-span-2" : ""}>
                  <Link
                    href={r.href}
                    className="pc-surface pc-surface-link group flex h-full flex-col justify-between gap-8 rounded-card p-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold md:p-7"
                  >
                    <span className={`block font-extrabold leading-none tracking-[-0.03em] tabular-nums text-ink ${i === 0 ? "text-6xl md:text-7xl" : "text-5xl"}`}>
                      {fmt(r.n)}
                    </span>
                    <span className="flex items-end justify-between gap-4">
                      <span>
                        <span className="block text-lg font-semibold text-ink">{r.label}</span>
                        <span className="mt-1 block text-sm leading-relaxed text-faint">{r.note}</span>
                      </span>
                      <Arrow className="text-lg" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ---------- Questions and where to find me ---------- */}
        <section className="border-t border-hairline py-16 md:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-16">
            <div data-reveal>
              <h2 className="text-[2rem] leading-[1.08] md:text-4xl">Questions families ask me.</h2>
              <div className="mt-6">
                <FaqList items={ABOUT_FAQ} />
              </div>
            </div>
            <div data-reveal style={{ "--rd": "120ms" } as React.CSSProperties}>
              <h2 className="text-2xl leading-tight md:text-3xl">Where to find me.</h2>
              <ul className="mt-6 space-y-3">
                {[
                  { href: LANDING.instagram, label: "Instagram", handle: "@hamzateaches", note: "Teaching reels" },
                  { href: LANDING.youtube, label: "YouTube", handle: "@humzateaches", note: "Video lessons" },
                ].map((p) => (
                  <li key={p.href}>
                    <a
                      href={p.href}
                      target="_blank"
                      rel="noopener noreferrer me"
                      className="pc-surface pc-surface-link group flex min-h-16 items-center justify-between gap-4 rounded-tile px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
                    >
                      <span>
                        <span className="block text-base font-semibold text-ink">
                          {p.label} <span className="font-normal text-faint">{p.handle}</span>
                        </span>
                        <span className="mt-0.5 block text-sm text-faint">{p.note}</span>
                      </span>
                      <Arrow />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-5 pb-24">
          <TrialBox from="about" classes title="Try one class. Then decide." body="Join a real class at your level, free, and see how I teach before you decide anything." />
        </div>
      </div>
    </MarketingShell>
  );
}
