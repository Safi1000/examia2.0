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
import { COMPANY_NAME } from "@/lib/config";
import { DIAGRAM_SETS } from "@/lib/econ-diagrams";
import { FORMULA_SHEETS } from "@/lib/formula-sheets";
import type { LevelName } from "@/lib/landing";
import { PAST_PAPER_SYLLABI } from "@/lib/past-papers";
import { SHOTS, VIDEO_REVIEWS } from "@/lib/reviews";
import { VideoReviewCard } from "@/components/landing/Sections";
import { absolute, breadcrumbLd, faqLd, fitTitle } from "@/lib/seo";
import {
  LEVEL_PAGES,
  LEVEL_SLUG_LEVELS,
  levelPage,
  levelPath,
  subjectBySlug,
  tuitionPath,
  type LevelInfo,
  type LevelSlug,
} from "@/lib/subjects";
import { SYLLABI, type SyllabusInfo, type Topic } from "@/lib/syllabus";
import { DEFAULT_SCHEDULE, RECORDING_HOURS, span, type LevelKey } from "@/lib/timetable";
import { hasTopical, topicalHrefFor } from "@/lib/topical";

/**
 * One page per subject and level: O Level and IGCSE, or A Level (AS and A2).
 * Every fact is already on the site: the codes and the Cambridge topic lists in
 * lib/syllabus.ts, the level blurbs in lib/subjects.ts, the class times in
 * lib/timetable.ts, the reviews in lib/reviews.ts.
 */
export const dynamicParams = false;
export function generateStaticParams() {
  return LEVEL_PAGES.map((p) => ({ slug: p.subjectSlug, level: p.slug }));
}

type Props = { params: Promise<{ slug: string; level: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, level } = await params;
  const p = levelPage(slug, level);
  if (!p) return {};
  const path = levelPath(p.subjectSlug, p.slug);
  return {
    title: fitTitle(p.seoTitle),
    description: p.seoDescription,
    alternates: { canonical: path },
    openGraph: { title: p.seoTitle, description: p.seoDescription, url: path, type: "website", images: ["/opengraph-image"] },
    twitter: { card: "summary_large_image", title: p.seoTitle, description: p.seoDescription, images: ["/opengraph-image"] },
  };
}

const gold =
  "inline-flex min-h-12 w-full items-center justify-center rounded-full bg-gold px-7 text-base font-semibold text-on-brand transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-gold-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:w-auto";
const quietLink =
  "font-semibold text-ink underline decoration-hairline-strong underline-offset-4 transition-colors duration-200 hover:decoration-current";
const row =
  "group flex min-h-12 items-center justify-between gap-4 py-3 text-base font-semibold text-foreground transition-colors duration-150 hover:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/** "O Level" and "A Level" never break across two lines. */
const keep = (t: string) => t.replace(/\b(O|A|AS) Level/g, "$1 Level");
/** Visible copy has no hyphenated words: "Supply-side policy" reads "Supply side policy". */
const plain = (t: string) => t.replace(/(\w)-(\w)/g, "$1 $2");
/** "a, b and c" */
const list = (xs: string[]) => xs.join(", ").replace(/, ([^,]*)$/, " and $1");

const TIMETABLE_KEY: Record<LevelName, LevelKey> = { "O Level / IGCSE": "O", "AS Level": "AS", "A2 Level": "A2" };

/** This subject's class at a level, Monday to Friday, from the standard timetable. */
function classTime(subject: string, level: LevelName): string | null {
  const slot = DEFAULT_SCHEDULE.slots.find((x) => x.level === TIMETABLE_KEY[level] && x.subject === subject);
  return slot ? span(slot.start, slot.end) : null;
}

/** The Cambridge syllabuses a level page covers, O Level first. */
function syllabiFor(subject: string, slug: LevelSlug): SyllabusInfo[] {
  const levels: SyllabusInfo["level"][] = slug === "a-level" ? ["AS and A Level"] : ["O Level", "IGCSE"];
  return levels.flatMap((l) => SYLLABI.filter((x) => x.subject === subject && x.level === l));
}

/** "O Level Business 7081 (was 7115)" */
const codeName = (x: SyllabusInfo) => `${x.name}${x.replaces ? ` (was ${x.replaces})` : ""}`;

/**
 * The Cambridge topics a level block teaches. AS and A Level syllabuses mark each
 * topic "(AS Level)" or "(A Level)"; the A2 class teaches the A Level ones.
 */
function topicsFor(syl: SyllabusInfo, level: LevelName): Topic[] {
  if (level === "O Level / IGCSE") return syl.topics;
  const tag = level === "AS Level" ? "(AS Level)" : "(A Level)";
  return syl.topics.filter((t) => t.name.endsWith(tag));
}
const topicName = (t: Topic) => plain(t.name.replace(/\s*\((AS|A) Level\)$/, ""));

/** "1 and 2", "1 to 6" */
const numRange = (ts: Topic[]) => (ts.length === 0 ? "" : ts.length <= 2 ? list(ts.map((t) => t.num)) : `${ts[0].num} to ${ts[ts.length - 1].num}`);

/** Extra free pages for one syllabus that the shared resource rows don't list. */
function extraLinks(syl: SyllabusInfo): Array<{ href: string; label: string }> {
  const pp = PAST_PAPER_SYLLABI.find((p) => p.code === syl.code || p.next?.code === syl.code);
  const out: Array<{ href: string; label: string }> = [];
  if (pp && hasTopical(pp.code)) out.push({ href: `/past-papers/${pp.slug}/most-repeated-topics`, label: `${pp.name} most repeated topics` });
  if (FORMULA_SHEETS.some((f) => f.slug === syl.slug)) out.push({ href: `/tools/formula-sheet/${syl.slug}`, label: `${syl.name} formula sheet` });
  if (DIAGRAM_SETS.some((d) => d.code === syl.code)) out.push({ href: `/tools/economics-diagrams/${syl.slug}`, label: `${syl.name} diagrams` });
  return out;
}

function Chevron() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-faint transition-colors duration-150 group-hover:text-foreground">
      <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkRows({ label, links }: { label: string; links: Array<{ href: string; label: string }> }) {
  return (
    <ul aria-label={label} className="mt-2 divide-y divide-hairline border-y border-hairline">
      {links.map((l) => (
        <li key={l.href}>
          <Link href={l.href} className={row}>
            {plain(l.label)}
            <Chevron />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function LevelTuitionPage({ params }: Props) {
  const { slug, level } = await params;
  const p = levelPage(slug, level);
  const s = subjectBySlug(slug);
  if (!p || !s) notFound();
  const path = levelPath(p.subjectSlug, p.slug);
  const isA = p.slug === "a-level";
  const blocks: LevelInfo[] = s.levels.filter((l) => LEVEL_SLUG_LEVELS[p.slug].includes(l.level));
  const syllabi = syllabiFor(s.subject, p.slug);
  const main = syllabi[0];
  // Taught from one syllabus's topic list: O Level and IGCSE share theirs (checked below).
  const sameTopics =
    syllabi.length < 2 ||
    syllabi.every((x) => JSON.stringify(x.topics.map((t) => [t.num, t.name, t.subs.map((u) => u.name)])) === JSON.stringify(main.topics.map((t) => [t.num, t.name, t.subs.map((u) => u.name)])));
  const times = blocks.map((l) => ({ level: l.level, time: classTime(s.subject, l.level) }));
  const other = LEVEL_PAGES.find((x) => x.subjectSlug === p.subjectSlug && x.slug !== p.slug);
  const levelLabel = isA ? "A Level" : "O Level and IGCSE";
  const bookLevel: LevelName | undefined = isA ? undefined : "O Level / IGCSE";

  // Reviews already on the homepage, for this subject and this level only.
  const shots = (s.reviewShots ?? [])
    .map((src) => SHOTS.find((x) => x.src === src))
    .filter((x) => !!x)
    .filter((x) => (isA ? x.meta === "AS Level" || x.meta === "A2 Level" || x.meta === "A Level" : x.meta === "O Level" || x.meta === "IGCSE"));

  // No subject review yet: show video reviews from students at this level (the same
  // reviews as the homepage). The heading names the level only, never a subject.
  const videos = shots.length
    ? []
    : VIDEO_REVIEWS.filter((r) => r.kind === "video" && r.src && (isA ? r.meta === "AS Level" || r.meta === "A2 Level" || r.meta === "A Level" : r.meta === "O Level" || r.meta === "IGCSE")).slice(0, 2);

  // Articles for this subject at this level, or naming one of this level's codes.
  const codes = syllabi.flatMap((x) => [x.code, ...(x.replaces ? [x.replaces] : [])]);
  const levels = LEVEL_SLUG_LEVELS[p.slug];
  const articles = (await allArticles()).filter(
    (a) =>
      !["private-candidate-pakistan-2027-registration", "cambridge-grade-thresholds-explained"].includes(a.slug) &&
      ((a.subject === s.subject && levels.includes(a.level)) || codes.some((c) => new RegExp(`\\b${c}\\b`).test(a.code))),
  );

  const t = (l: LevelName) => times.find((x) => x.level === l)?.time;
  const faq: Array<{ q: string; a: string }> = [];
  if (isA) {
    const as = t("AS Level");
    const a2 = t("A2 Level");
    if (as && a2)
      faq.push({
        q: `Are AS and A2 ${s.subject} taught separately?`,
        a: `Yes. They are two separate classes, Monday to Friday, Pakistan time: AS Level from ${as}, and A2 from ${a2}.`,
      });
    const asTopics = topicsFor(main, "AS Level");
    const aTopics = topicsFor(main, "A2 Level");
    if (asTopics.length && aTopics.length)
      faq.push({
        q: `Which ${main.code} topics are AS and which are A2?`,
        a: `In the Cambridge ${main.name} syllabus, topics ${numRange(asTopics)} are the AS Level part and topics ${numRange(aTopics)} are the A Level part, which is what A2 covers. Every topic is listed on this page.`,
      });
  } else {
    const o = t("O Level / IGCSE");
    if (syllabi.length === 2 && sameTopics)
      faq.push({
        q: `Do you teach O Level and IGCSE ${s.subject} in the same class?`,
        a: `Yes. For exams from 2027, ${syllabi[0].name} and ${syllabi[1].name} have the same papers and the same topics, so both sit in one class${o ? `, Monday to Friday from ${o}, Pakistan time` : ""}. What differs is the code, the grade scale (IGCSE runs A* to G, O Level A* to E) and the exam series.`,
      });
  }
  faq.push({
    q: `Which ${s.subject} syllabus do you follow?`,
    a: `Cambridge ${syllabi.map((x) => `${x.name} (exams in ${x.exams})`).join(" and ")}.${
      s.subject === "Business" && !isA
        ? " O Level Business 7081 replaces Business Studies 7115 from June 2027, and IGCSE Business 0264 replaces Business Studies 0450 from the 2027 exams."
        : ""
    }`,
  });
  faq.push(
    {
      q: "I'm on Pearson Edexcel. Can I join?",
      a: "Yes, I teach Pearson Edexcel too. Send me your specification on WhatsApp before the trial.",
    },
    {
      q: "Where do the classes happen?",
      a: "Live on Google Meet, in a small group, with cameras on. You can stop me and ask anything, any time.",
    },
    {
      q: "What if I miss a class?",
      a: `Every class is recorded, and the recording stays open for ${RECORDING_HOURS} hours.`,
    },
    {
      q: "How much are the classes?",
      a: "Fees depend on your level and how many subjects you take. Book the free trial lesson or message me on WhatsApp and you get the exact fee for your subjects.",
    },
    {
      q: "Can my parents talk to you first?",
      a: "Of course. Most families start that way. I'm happy to have a short call before you decide anything.",
    },
  );

  const courses = blocks.map((l) => ({
    "@context": "https://schema.org",
    "@type": "Course",
    name: `${s.subject} tuition: ${l.level}`,
    description: `${l.title}. ${l.body} Cambridge and Pearson Edexcel.`,
    courseCode: syllabi.map((x) => x.code).join(", "),
    url: absolute(path),
    provider: { "@id": `${absolute("/")}/#organization`, "@type": "EducationalOrganization", name: COMPANY_NAME },
    inLanguage: "en",
    hasCourseInstance: [{ "@type": "CourseInstance", courseMode: "online" }],
    offers: { "@type": "Offer", category: "Paid" },
  }));

  const from = `tuition:${s.slug}:${p.slug}`;

  return (
    <MarketingShell heroCta>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: `${s.subject} tuition`, path: tuitionPath(s.slug) },
          { name: `${p.name} ${s.subject}`, path },
        ])}
      />
      {courses.map((c) => (
        <JsonLd key={c.name} data={c} />
      ))}
      <JsonLd data={faqLd(faq)} />

      <div className="public-calm mx-auto max-w-3xl px-5 pb-24 pt-12 md:pt-20">
        <Crumbs trail={[{ name: "Home", href: "/" }, { name: `${s.subject} tuition`, href: tuitionPath(s.slug) }, { name: p.name }]} />

        <h1 className="mt-8 max-w-[22ch] text-balance text-title leading-[1.1] sm:text-title-lg md:text-5xl md:leading-[1.08]">{keep(p.h1)}</h1>

        <section aria-label="Classes and codes" className="pc-surface mt-8 rounded-tile p-5 md:p-6">
          <p className="text-base leading-relaxed text-body">Cambridge {keep(list(syllabi.map(codeName)))}, and Pearson Edexcel too.</p>
          <dl className="mt-3 divide-y divide-hairline border-y border-hairline">
            {times
              .filter((x) => x.time)
              .map((x) => (
                <div key={x.level} className="flex items-baseline justify-between gap-4 py-2.5">
                  <dt className="text-base font-semibold text-foreground">{keep(x.level === "O Level / IGCSE" ? "O Level and IGCSE" : x.level === "A2 Level" ? "A2" : x.level)}</dt>
                  <dd className="text-base tabular-nums text-body">{x.time}</dd>
                </div>
              ))}
          </dl>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Monday to Friday, Pakistan time. Small live groups on Google Meet, cameras on. Studying in the Gulf? See the{" "}
            <Link href="/online-classes/gulf" className={quietLink}>
              class times in your time zone
            </Link>
            .
          </p>
        </section>
        <div data-hero-cta className="mt-8">
          <BookButton from={from} subject={s.subject} level={bookLevel} className={gold}>
            Book your free trial lesson
          </BookButton>
        </div>

        {blocks.map((l) => {
          const time = t(l.level);
          const name = l.level === "O Level / IGCSE" ? `O Level and IGCSE ${s.subject}` : l.level === "A2 Level" ? `A2 ${s.subject}` : `AS Level ${s.subject}`;
          const lists = sameTopics ? [main] : syllabi;
          return (
            <Section key={l.level} title={`${keep(name)}: ${l.title.toLowerCase()}`}>
              <p className="max-w-[60ch] text-lg leading-relaxed text-muted-foreground">{l.body}</p>
              {time && (
                <p className="mt-3 text-base leading-relaxed text-body">
                  Class: Monday to Friday, {time}, Pakistan time.
                </p>
              )}
              {lists.map((syl) => {
                const topics = topicsFor(syl, l.level);
                const heading =
                  syllabi.length > 1 && sameTopics
                    ? `The Cambridge topics, the same for ${list(syllabi.map((x) => x.code))}`
                    : `The Cambridge ${syl.code} topics${l.level === "A2 Level" ? " for A Level" : l.level === "AS Level" ? " for AS Level" : ""}`;
                return (
                  <div key={syl.code} className="mt-8">
                    <h3 className="text-sm font-semibold text-muted-foreground">{heading}</h3>
                    <ol className="mt-2 divide-y divide-hairline border-y border-hairline">
                      {topics.map((tp) => (
                        <li key={tp.num} className="py-5">
                          <h4 className="text-lg font-bold text-ink">
                            {tp.num}. {topicName(tp)}
                          </h4>
                          <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-base leading-relaxed text-body sm:grid-cols-2">
                            {tp.subs.map((u) => {
                              const href = topicalHrefFor(syl.code, u.num);
                              return (
                                <li key={u.num} className="flex gap-2.5">
                                  <span className="w-9 shrink-0 tabular-nums text-faint">{u.num}</span>
                                  {href ? (
                                    <Link href={href} className={quietLink}>
                                      {plain(u.name)}
                                    </Link>
                                  ) : (
                                    <span>{plain(u.name)}</span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </li>
                      ))}
                    </ol>
                  </div>
                );
              })}
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Underlined topics open past paper questions on that topic. Tick topics off in the{" "}
                <Link href={`/syllabus/${main.slug}`} className={quietLink}>
                  {main.name} syllabus checklist
                </Link>
                .
              </p>
            </Section>
          );
        })}

        <Section title="How the classes work">
          <ul className="list-disc space-y-2 pl-5 text-lg leading-relaxed text-body marker:text-faint">
            <li className="pl-1">
              Live {keep(levelLabel)} {s.subject} classes five days a week, the full syllabus plus past papers.
            </li>
            <li className="pl-1">A recording of every class, open for {RECORDING_HOURS} hours.</li>
            <li className="pl-1">Weekly tests made and marked by me, with written feedback on the exact mistakes that cost you marks.</li>
            <li className="pl-1">A dedicated past paper window in March and April, before the May / June exams.</li>
            <li className="pl-1">Your notes, tests and marks in one place, in your own student portal.</li>
            <li className="pl-1">A direct line to me for questions between classes.</li>
          </ul>
        </Section>

        <TrialBox
          from={from}
          subject={s.subject}
          level={bookLevel}
          title="Try one class. Then decide."
          body={`Join a real ${levelLabel} ${s.subject} class, free, and see how lessons and tests work before you decide.`}
        />

        {videos.length > 0 && (
          <Section title={`What my ${levelLabel} students say`}>
            <ul className="grid grid-cols-2 gap-4 sm:max-w-[560px]">
              {videos.map((r) => (
                <li key={r.src} className="flex">
                  <VideoReviewCard r={r} tile="aspect-[9/16]" />
                </li>
              ))}
            </ul>
          </Section>
        )}

        {shots.length > 0 && (
          <Section title={`From my ${levelLabel} ${s.subject} students`}>
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

        <Section title={`Free ${levelLabel} ${s.subject} resources`}>
          <div className="space-y-10">
            {syllabi.map((x) => (
              <nav key={x.code} aria-label={`${x.name} resources`}>
                <h3 className="text-sm font-semibold text-muted-foreground">{x.name}</h3>
                <LinkRows label={`${x.name} resources`} links={[...syllabusLinks(x.code), ...extraLinks(x)]} />
              </nav>
            ))}
            {articles.length > 0 && (
              <nav aria-label={`${levelLabel} ${s.subject} articles`}>
                <h3 className="text-sm font-semibold text-muted-foreground">Articles from The Exam Room</h3>
                <LinkRows label="Articles" links={articles.map((a) => ({ href: `/blog/${a.slug}`, label: a.title }))} />
              </nav>
            )}
          </div>
        </Section>

        <Section title="Questions">
          <FaqList items={faq} />
        </Section>

        {other && (
          <Section title={`${s.subject} at other levels`}>
            <LinkRows
              label={`${s.subject} at other levels`}
              links={[
                { href: levelPath(other.subjectSlug, other.slug), label: keep(other.h1) },
                { href: tuitionPath(s.slug), label: keep(s.h1) },
              ]}
            />
          </Section>
        )}

        <TrialBox
          from={`${from}:end`}
          subject={s.subject}
          level={bookLevel}
          title="Start with one free lesson."
          body={`Pick a time and sit in on a real ${levelLabel} ${s.subject} class. If it isn't for you, that's fine. I won't chase you.`}
        />
      </div>
    </MarketingShell>
  );
}
