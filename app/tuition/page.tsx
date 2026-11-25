import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { BookButton } from "@/components/landing/BookingModal";
import { MarketingShell } from "@/components/landing/MarketingShell";
import "@/components/landing/public-calm.css";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { breadcrumbLd, fitTitle } from "@/lib/seo";
import { LEVEL_PAGES, SUBJECT_PAGES, levelPath, tuitionPath } from "@/lib/subjects";
import { SYLLABI } from "@/lib/syllabus";
import { RECORDING_HOURS } from "@/lib/timetable";

/**
 * /tuition: one calm list of every tuition page (each subject, then each
 * level), so the address people and Google try first is never a dead end.
 * Every fact comes from lib/subjects.ts and lib/timetable.ts, as on the
 * subject pages.
 */
const seoTitle = "Online Tuition: Accounting, Business, Economics";
const seoDescription =
  "Live small group Accounting, Business and Economics classes on Google Meet for O Level, IGCSE and A Level. Cambridge and Edexcel. Book a free trial lesson.";

export const metadata: Metadata = {
  title: fitTitle(seoTitle),
  description: seoDescription,
  alternates: { canonical: "/tuition" },
  openGraph: { title: seoTitle, description: seoDescription, url: "/tuition", type: "website", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title: seoTitle, description: seoDescription, images: ["/opengraph-image"] },
};

const gold =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gold px-7 text-base font-semibold text-on-brand transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-gold-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto";
const quietLink =
  "font-semibold text-ink underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:decoration-current";
const row =
  "group flex min-h-12 items-center justify-between gap-4 py-3 text-base font-semibold text-foreground transition-colors duration-150 hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const arrow = (
  <span aria-hidden className="text-faint transition-colors duration-150 group-hover:text-foreground">
    →
  </span>
);

/** "O Level 7707, IGCSE 0452 and AS and A Level 9706", said the same way as on each subject page. */
const codesFor = (subject: string) =>
  SYLLABI.filter((x) => x.subject === subject)
    .map((x) => `${x.name.replace(` ${subject}`, "")}${x.replaces ? ` (was ${x.replaces})` : ""}`)
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");

/** "O Level" and "A Level" never break across two lines. */
const keep = (t: string) => t.replace(/\b(O|A|AS) Level/g, "$1 Level");

export default function TuitionHub() {
  return (
    <MarketingShell heroCta>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Tuition", path: "/tuition" }])} />

      <div className="public-calm mx-auto max-w-3xl px-5 pb-24 pt-12 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Tuition" }]} />

        <h1 className="mt-8 max-w-[22ch] text-balance text-title leading-[1.1] sm:text-title-lg md:text-5xl md:leading-[1.08]">
          {keep("Accounting, Business and Economics tuition")}
        </h1>
        <p className="mt-5 max-w-[56ch] text-pretty text-lg leading-relaxed text-muted-foreground">
          Small live classes with me on Google Meet, a test every week that I mark myself, and every class recorded for {RECORDING_HOURS} hours.
          Cambridge and Pearson Edexcel.
        </p>
        <div data-hero-cta className="mt-8">
          <BookButton from="tuition:hub" className={gold}>
            Book your free trial lesson
          </BookButton>
        </div>

        <Section title="Pick your subject and level">
          <ul className="space-y-5">
            {SUBJECT_PAGES.map((s) => {
              const levels = LEVEL_PAGES.filter((l) => l.subjectSlug === s.slug);
              return (
                <li key={s.slug} className="pc-surface rounded-card px-5 pt-5 md:px-6">
                  <h3 className="text-xl font-bold text-ink">
                    <Link href={tuitionPath(s.slug)} className={quietLink}>
                      {s.subject} tuition
                    </Link>
                  </h3>
                  <p className="mt-1 text-sm tabular-nums text-faint">Cambridge {keep(codesFor(s.subject))}</p>
                  <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
                    {levels.map((l) => (
                      <li key={l.slug}>
                        <Link href={levelPath(l.subjectSlug, l.slug)} className={row}>
                          {keep(`${l.name} ${s.subject}`)}
                          {arrow}
                        </Link>
                      </li>
                    ))}
                    <li>
                      <Link href={tuitionPath(s.slug)} className={row}>
                        <span className="font-normal text-muted-foreground">Every level, timings and questions</span>
                        {arrow}
                      </Link>
                    </li>
                  </ul>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 max-w-[62ch] text-base leading-relaxed text-muted-foreground">
            Class times for every level:{" "}
            <Link href="/online-classes" className={quietLink}>
              online classes in Pakistan
            </Link>
            , or{" "}
            <Link href="/online-classes/gulf" className={quietLink}>
              in your Gulf time zone
            </Link>
            .
          </p>
        </Section>

        <TrialBox
          from="tuition:hub:end"
          title="Try one class. Then decide."
          body="Join a real class at your level, free, and see how lessons and tests work before you decide."
        />
      </div>
    </MarketingShell>
  );
}
