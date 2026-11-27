import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { BookButton } from "@/components/landing/BookingModal";
import { FaqList, MarketingShell } from "@/components/landing/MarketingShell";
import "@/components/landing/public-calm.css";
import { syllabusLinks } from "@/components/study/RelatedLinks";
import { Crumbs, Section, TrialBox } from "@/components/study/StudyBits";
import { allArticles } from "@/lib/blog";
import { SHOTS } from "@/lib/reviews";
import { breadcrumbLd, coursesLd, faqLd, fitTitle } from "@/lib/seo";
import { LEVEL_PAGES, SUBJECT_PAGES, levelPath, levelSlugFor, subjectBySlug, tuitionPath } from "@/lib/subjects";
import { SYLLABI } from "@/lib/syllabus";
import { DEFAULT_SCHEDULE, RECORDING_HOURS, span, type LevelKey } from "@/lib/timetable";

/**
 * One tuition page per subject (Accounting, Business, Economics), each covering
 * O Level / IGCSE, AS and A2. Every fact here is already stated elsewhere on the
 * site: the codes and topics in lib/subjects.ts, the class times in
 * lib/timetable.ts, the reviews in lib/reviews.ts.
 */
export const dynamicParams = false;
export function generateStaticParams() {
  return SUBJECT_PAGES.map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = subjectBySlug((await params).slug);
  if (!s) return {};
  const path = tuitionPath(s.slug);
  return {
    title: fitTitle(s.seoTitle),
    description: s.seoDescription,
    alternates: { canonical: path },
    openGraph: { title: s.seoTitle, description: s.seoDescription, url: path, type: "website", images: ["/opengraph-image"] },
    twitter: { card: "summary_large_image", title: s.seoTitle, description: s.seoDescription, images: ["/opengraph-image"] },
  };
}

const gold =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gold px-7 text-base font-semibold text-on-brand transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-gold-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto";
const quietLink =
  "font-semibold text-ink underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:decoration-current";
const row =
  "group flex min-h-12 items-center justify-between gap-4 py-3 text-base font-semibold text-foreground transition-colors duration-150 hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/** This subject's class at each level, Monday to Friday, from the standard timetable. */
function weekFor(subject: string) {
  // The same level names as the level list above.
  const order: Array<[LevelKey, string]> = [["O", "O Level / IGCSE"], ["AS", "AS Level"], ["A2", "A2 Level"]];
  return order.flatMap(([level, label]) => {
    const slot = DEFAULT_SCHEDULE.slots.find((x) => x.level === level && x.subject === subject);
    return slot ? [{ level: label, time: span(slot.start, slot.end) }] : [];
  });
}

/** "O Level" and "A Level" never break across two lines. */
const keep = (t: string) => t.replace(/\b(O|A|AS) Level/g, "$1\u00a0Level");

/** Questions every subject page answers, from the facts on the homepage and the online classes page. */
function commonFaq(subject: string, codes: string) {
  return [
    {
      q: "Which exam boards do you teach?",
      a: `Cambridge and Pearson Edexcel. For Cambridge ${subject}, that is ${codes}. If you are on Edexcel, send me your specification on WhatsApp before the trial.`,
    },
    {
      q: "Where do the classes happen?",
      a: "Live on Google Meet, with cameras on. You can stop me and ask anything, any time.",
    },
    {
      q: "What if I miss a class?",
      a: `Every class is recorded, and the recording stays open for ${RECORDING_HOURS} hours.`,
    },
    {
      q: "I'm starting from zero. Is that okay?",
      a: "Yes. Starting from zero is easier than fixing shaky basics. I start with why a topic exists, then the steps. You won't feel behind.",
    },
    {
      q: "How much are the classes?",
      a: "Fees depend on your level and how many subjects you take. Book the free trial lesson or message me on WhatsApp and you get the exact fee for your subjects.",
    },
    {
      q: "Can my parents talk to you first?",
      a: "Of course. Most families start that way. I'm happy to have a short call before you decide anything.",
    },
  ];
}

export default async function TuitionPage({ params }: Props) {
  const s = subjectBySlug((await params).slug);
  if (!s) notFound();
  const path = tuitionPath(s.slug);
  const syllabi = SYLLABI.filter((x) => x.subject === s.subject);
  // "O Level 7081 (was 7115), IGCSE 0264 (was 0450) and AS and A Level 9609"
  const codes = syllabi
    .map((x) => `${x.name.replace(` ${s.subject}`, "")}${x.replaces ? ` (was ${x.replaces})` : ""}`)
    .join(", ")
    .replace(/, ([^,]*)$/, " and $1");
  const faq = [...commonFaq(s.subject, codes), ...(s.faq ?? [])];
  const week = weekFor(s.subject);
  const shots = (s.reviewShots ?? []).map((src) => SHOTS.find((x) => x.src === src)).filter((x) => !!x);
  // Subject articles, leaving out the two that are about every subject (registration, thresholds).
  const articles = (await allArticles()).filter(
    (a) => a.subject === s.subject && !["private-candidate-pakistan-2027-registration", "cambridge-grade-thresholds-explained"].includes(a.slug),
  );

  return (
    <MarketingShell heroCta>
      <JsonLd data={breadcrumbLd([{ name: "Home", path: "/" }, { name: "Tuition", path: "/tuition" }, { name: `${s.subject} tuition`, path }])} />
      {coursesLd(s.slug).map((c) => (
        <JsonLd key={c.name} data={c} />
      ))}
      <JsonLd data={faqLd(faq)} />

      <div className="public-calm mx-auto max-w-3xl px-5 pb-24 pt-12 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Tuition", href: "/tuition" }, { name: `${s.subject} tuition` }]} />

        <h1 className="mt-8 max-w-[22ch] text-balance text-title leading-[1.1] sm:text-title-lg md:text-5xl md:leading-[1.08]">{keep(s.h1)}</h1>
        <p className="mt-5 max-w-[56ch] text-pretty text-lg leading-relaxed text-muted-foreground">
          Small live classes with me on Google Meet, a test every week that I mark myself, and every class recorded for {RECORDING_HOURS} hours.
        </p>
        <div data-hero-cta className="mt-8">
          <BookButton from={`tuition:${s.slug}`} subject={s.subject} className={gold}>
            Book your free trial lesson
          </BookButton>
        </div>

        <section aria-labelledby="in-short-h" className="pc-surface mt-8 rounded-tile p-5 md:p-6">
          <h2 id="in-short-h" className="text-sm font-semibold text-ink">
            In short
          </h2>
          <p className="mt-2 text-base leading-relaxed text-body">
            Cambridge {keep(codes)}, and Pearson Edexcel too.
          </p>
          <dl className="mt-3 divide-y divide-hairline border-y border-hairline">
            {week.map((w) => (
              <div key={w.level} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-base font-semibold text-foreground">{w.level}</dt>
                <dd className="text-base tabular-nums text-body">{w.time}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Monday to Friday, Pakistan time. Small live groups on Google Meet, cameras on.
          </p>
        </section>

        <Section title="What I teach, level by level" intro={<p>{s.intro}</p>}>
          <ol className="divide-y divide-hairline border-y border-hairline">
            {s.levels.map((l) => (
              <li key={l.level} className="py-7">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className="text-xl font-bold text-ink">
                    {l.level}: {l.title.toLowerCase()}
                  </h3>
                  <span className="text-sm tabular-nums text-faint">Cambridge {l.codes}</span>
                </div>
                <p className="mt-2 max-w-[60ch] text-lg leading-relaxed text-muted-foreground">{l.body}</p>
                <ul className="mt-4 grid gap-x-6 gap-y-1.5 text-base leading-relaxed text-body sm:grid-cols-2">
                  {l.topics.map((t) => (
                    <li key={t} className="flex gap-2.5">
                      <span aria-hidden className="mt-[0.7em] h-1 w-1 shrink-0 rounded-full bg-faint" />
                      {t}
                    </li>
                  ))}
                </ul>
                {(() => {
                  const lp = LEVEL_PAGES.find((x) => x.subjectSlug === s.slug && x.slug === levelSlugFor(l.level));
                  return lp ? (
                    <p className="mt-4 text-base">
                      <Link href={levelPath(lp.subjectSlug, lp.slug)} className={quietLink}>
                        {keep(lp.h1)}
                      </Link>
                    </p>
                  ) : null;
                })()}
              </li>
            ))}
          </ol>
        </Section>

        <Section title="What you get">
          <ul className="list-disc space-y-2 pl-5 text-lg leading-relaxed text-body marker:text-faint">
            <li className="pl-1">Live classes five days a week, the full syllabus plus past papers.</li>
            <li className="pl-1">A recording of every class, open for {RECORDING_HOURS} hours.</li>
            <li className="pl-1">Weekly tests made and marked by me, with written feedback on the exact mistakes that cost you marks.</li>
            <li className="pl-1">A dedicated past paper window in March and April, before the May / June exams.</li>
            <li className="pl-1">Your notes, tests and marks in one place, in your own student portal.</li>
            <li className="pl-1">A direct line to me for questions between classes.</li>
          </ul>
        </Section>

        <Section
          title="How a week works"
          intro={
            <p>
              Monday to Friday, one 40 minute {s.subject} class a day at your level, at the times above, Pakistan time.
            </p>
          }
        >
          <p className="max-w-[62ch] text-lg leading-relaxed text-muted-foreground">
            Every week there is a test I make and mark myself. If school runs late, the recording is there for {RECORDING_HOURS} hours. Studying in
            the Gulf? See the{" "}
            <Link href="/online-classes/gulf" className={quietLink}>
              class times in your time zone
            </Link>
            .
          </p>
        </Section>

        <TrialBox
          from={`tuition:${s.slug}`}
          subject={s.subject}
          title="Try one class. Then decide."
          body={`Join a real ${s.subject} class at your level, free, and see how lessons and tests work before you decide.`}
        />

        {shots.length > 0 && (
          <Section title={`From my ${s.subject} students`}>
            <ul className="grid grid-cols-2 gap-4 sm:max-w-[560px]">
              {shots.map((x) => (
                <li key={x.src}>
                  <figure className="pc-surface overflow-hidden rounded-card">
                    <a
                      href={x.src}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${x.name}'s message full size`}
                      className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                    >
                      <Image src={x.src} alt={x.alt} width={900} height={1524} sizes="(max-width: 640px) 45vw, 270px" className="h-auto w-full" />
                    </a>
                    <figcaption className="flex flex-col gap-0.5 px-4 py-3">
                      <span className="text-sm font-semibold text-ink">{x.name}</span>
                      <span className="text-xs text-faint">{x.meta}</span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={`Free ${s.subject} resources`} intro={<p>Everything here is free to use, with or without my classes.</p>}>
          <div className="space-y-10">
            {syllabi.map((x) => (
              <nav key={x.code} aria-label={`${x.name} resources`}>
                <h3 className="text-sm font-semibold text-muted-foreground">{x.name}</h3>
                <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
                  {syllabusLinks(x.code).map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className={row}>
                        {l.label}
                        <span aria-hidden className="text-faint transition-colors duration-150 group-hover:text-foreground">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
            {articles.length > 0 && (
              <nav aria-label={`${s.subject} articles`}>
                <h3 className="text-sm font-semibold text-muted-foreground">Articles from The Exam Room</h3>
                <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
                  {articles.map((a) => (
                    <li key={a.slug}>
                      <Link href={`/blog/${a.slug}`} className={row}>
                        {a.title}
                        <span aria-hidden className="text-faint transition-colors duration-150 group-hover:text-foreground">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </Section>

        <Section title="Questions">
          <FaqList items={faq} />
        </Section>

        <TrialBox
          from={`tuition:${s.slug}:end`}
          subject={s.subject}
          title="Start with one free lesson."
          body={`Pick your level and a time, and sit in on a real ${s.subject} class. If it isn't for you, that's fine. I won't chase you.`}
        />
      </div>
    </MarketingShell>
  );
}
