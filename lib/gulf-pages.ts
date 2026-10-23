/**
 * Class times for students in the Gulf. The timetable is kept in Pakistan
 * time (lib/timetable.ts); these offsets turn it into local time, so the
 * Gulf page stays in sync when the timetable changes. None of these
 * countries use daylight saving, and neither does Pakistan.
 */
import { DEFAULT_SCHEDULE, type LevelKey } from "@/lib/timetable";

export interface GulfZone {
  /** Countries that share this clock. */
  countries: string;
  /** Hours behind Pakistan (UTC+5). */
  behindPk: number;
}

export const GULF_ZONES: GulfZone[] = [
  { countries: "UAE and Oman", behindPk: 1 },
  { countries: "Saudi Arabia, Qatar, Kuwait and Bahrain", behindPk: 2 },
];

/** "15:30" moved back by n hours. */
export const shiftHours = (hhmm: string, n: number) => {
  const h = (Number(hhmm.slice(0, 2)) - n + 24) % 24;
  return `${String(h).padStart(2, "0")}${hhmm.slice(2)}`;
};

/** Each level's weekly block, first class start to last class end, in Pakistan time. */
export function levelBlocks() {
  const order: LevelKey[] = ["A2", "O", "AS"];
  return order.map((level) => {
    const slots = DEFAULT_SCHEDULE.slots.filter((s) => s.level === level).sort((a, b) => a.start.localeCompare(b.start));
    return { level, from: slots[0]?.start ?? "", to: slots[slots.length - 1]?.end ?? "", subjects: slots.map((s) => s.subject) };
  });
}

/** Official pages each Gulf fact comes from. Re-check them each session. */
export const GULF_SOURCES = {
  khdaWeek: { label: "KHDA, 4.5 day week FAQs for Dubai private schools", href: "https://web.khda.gov.ae/en/Guides/Parents/Faq/4-5-day-week-FAQs-for-Dubai-private-schools" },
  uaeWeek: { label: "UAE government portal, working hours in the public sector", href: "https://u.ae/en/information-and-services/jobs/Sector-of-employment/working-in-uae-government-sector/working-hours-in-the-public-sector" },
  bcUae: { label: "British Council UAE, Cambridge candidate information, October / November 2026", href: "https://www.britishcouncil.ae/sites/default/files/candidate_information_flyer_-_oct_nov_2026.pdf" },
  saWeek: { label: "Saudi Press Agency, Royal Order on the Friday and Saturday weekend", href: "https://www.spa.gov.sa/en/bee255bdbb" },
  bcSa: { label: "British Council Saudi Arabia, how to register for school exams", href: "https://www.britishcouncil.sa/en/exam/igcse-school/register" },
  qaWeek: { label: "Qatar News Agency, Ministry of Education school hours notice", href: "https://qna.org.qa/en/news/news-details?id=qatar-to-apply-summer-school-hours-on-may-3&date=27/04/2026" },
  bcQa: { label: "British Council Qatar, exam registration for private candidates", href: "https://www.britishcouncil.qa/en/exam/igcse-school/register/private-candidates" },
} as const;

export type GulfSourceKey = keyof typeof GULF_SOURCES;

/**
 * Gulf city pages. Like the Pakistan ones (lib/city-pages.ts), each carries
 * only what is different there: local class times, how the school week
 * meets the Monday to Friday timetable, and the British Council office for
 * private candidates. Facts are taken from the pages in GULF_SOURCES.
 */
export interface GulfCityPage {
  slug: string;
  city: string;
  country: string;
  /** Index into GULF_ZONES. */
  zone: number;
  heading: string;
  description: string;
  intro: string;
  local: Array<{ title: string; body: string }>;
  /** Private candidate guide for this country, if there is one. */
  guide?: { href: string; label: string };
  faq: Array<{ q: string; a: string }>;
  sources: GulfSourceKey[];
}

const UAE_GUIDE = { href: "/private-candidates/uae", label: "UAE private candidate guide" };
const SA_GUIDE = { href: "/private-candidates/saudi-arabia", label: "Saudi Arabia private candidate guide" };

export const GULF_CITY_PAGES: GulfCityPage[] = [
  {
    slug: "dubai",
    city: "Dubai",
    country: "UAE",
    zone: 0,
    heading: "O Level and A Level Accounting, Business and Economics classes for Dubai students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Dubai students, 2:30 to 8:30 pm UAE time. Free trial lesson.",
    intro:
      "Dubai's private schools run Monday to Friday, the same days as my timetable. Classes start at 2:30 pm UAE time, so they sit after the school day, at home, with no drive across the city.",
    local: [
      {
        title: "Fridays work too",
        body: "KHDA says Dubai private schools finish by 12 pm on Fridays at the latest, with Saturday and Sunday as the weekend. The first class on a Friday is at 2:30 pm, so even the shortest school day leaves time to get home and eat first.",
      },
      {
        title: "Private candidates in Dubai",
        body: "The British Council has a Dubai office in Oud Metha. You register online, then email your documents to its Dubai school exams team or take them to the office. Candidates registered at the Sharjah office also sit their exams in Dubai. My UAE guide lists the documents and the deadlines.",
      },
    ],
    guide: UAE_GUIDE,
    faq: [
      {
        q: "Do you have a centre in Dubai?",
        a: "No. Every class is live online from Rawalpindi, so you study from home anywhere in Dubai, and each lesson is recorded.",
      },
      {
        q: "Who is this for?",
        a: "Dubai students sitting Cambridge O Level, IGCSE, AS or A2 in Accounting, Business or Economics, at school or as a private candidate.",
      },
    ],
    sources: ["khdaWeek", "bcUae"],
  },
  {
    slug: "abu-dhabi",
    city: "Abu Dhabi",
    country: "UAE",
    zone: 0,
    heading: "O Level and A Level Accounting, Business and Economics classes for Abu Dhabi students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Abu Dhabi students, after school in UAE time. Free trial lesson.",
    intro:
      "Abu Dhabi is on UAE time, one hour behind Pakistan, so the classes run from 2:30 pm to 8:30 pm your time, Monday to Friday.",
    local: [
      {
        title: "Saturday and Sunday stay free",
        body: "The Abu Dhabi government, like the federal government, works Monday to Friday with Saturday and Sunday as the weekend. My classes follow the same days, so weekends stay free for family and revision.",
      },
      {
        title: "Private candidates in Abu Dhabi",
        body: "The British Council's Abu Dhabi office is on Al Qasbah Street in Al Bateen, and it runs Cambridge exam sessions at its Abu Dhabi centre. My UAE guide covers registration, the No Objection Certificate and the deadlines.",
      },
    ],
    guide: UAE_GUIDE,
    faq: [
      {
        q: "Do you have a centre in Abu Dhabi?",
        a: "No. Every class is live online, so you study from home anywhere in Abu Dhabi, and each lesson is recorded.",
      },
      {
        q: "What if my school day runs late?",
        a: "Every class is recorded and the recording stays open for 24 hours, so you can watch it the same evening.",
      },
    ],
    sources: ["uaeWeek", "bcUae"],
  },
  {
    slug: "riyadh",
    city: "Riyadh",
    country: "Saudi Arabia",
    zone: 1,
    heading: "O Level and A Level Accounting, Business and Economics classes for Riyadh students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Riyadh students, 1:30 to 7:30 pm Saudi time. Free trial lesson.",
    intro:
      "Saudi Arabia is two hours behind Pakistan, so classes run from 1:30 pm to 7:30 pm Riyadh time. The school week here is different from my timetable, and it is worth knowing how the two fit.",
    local: [
      {
        title: "Friday is a weekend class",
        body: "Saudi Arabia's official week runs Sunday to Thursday, with Friday and Saturday as the weekend. My classes run Monday to Friday, so four are on school days and Friday's is on your weekend. Sunday has no class. If school runs past the first class at 1:30 pm, the recording stays open for 24 hours.",
      },
      {
        title: "Private candidates in Riyadh",
        body: "The British Council has an office in Riyadh. If you need special arrangements for your exams, contact it at least six weeks before the exam date, with a medical certificate issued within the last two years. My Saudi Arabia guide explains the rest.",
      },
    ],
    guide: SA_GUIDE,
    faq: [
      {
        q: "Do you have a centre in Riyadh?",
        a: "No. Every class is live online, so you study from home anywhere in Riyadh, and each lesson is recorded.",
      },
      {
        q: "Who is this for?",
        a: "Riyadh students sitting Cambridge O Level, IGCSE, AS or A2 in Accounting, Business or Economics, at school or as a private candidate.",
      },
    ],
    sources: ["saWeek", "bcSa"],
  },
  {
    slug: "jeddah",
    city: "Jeddah",
    country: "Saudi Arabia",
    zone: 1,
    heading: "O Level and A Level Accounting, Business and Economics classes for Jeddah students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Jeddah students, in Saudi time, with recorded lessons. Free trial lesson.",
    intro:
      "Classes run from 1:30 pm to 7:30 pm Saudi time, Monday to Friday. In Jeddah that means four school days and one weekend afternoon.",
    local: [
      {
        title: "Your week and mine",
        body: "School in Saudi Arabia runs Sunday to Thursday. My classes run Monday to Friday. On Sunday there is no class, and on Friday you study at home on a weekend afternoon.",
      },
      {
        title: "Private candidates in Jeddah",
        body: "The British Council has an office in Jeddah, which handles exam entries and special arrangement requests for candidates in the city. Spot a mistake in your entry? Contact the office straight away, because each session has a deadline for corrections.",
      },
    ],
    guide: SA_GUIDE,
    faq: [
      {
        q: "Do you have a centre in Jeddah?",
        a: "No. Every class is live online, so you study from home anywhere in Jeddah, and each lesson is recorded.",
      },
      {
        q: "Can I join if my school teaches the subject too?",
        a: "Yes. The classes focus on exam technique and past paper practice, so they work alongside what your school covers.",
      },
    ],
    sources: ["saWeek", "bcSa"],
  },
  {
    slug: "doha",
    city: "Doha",
    country: "Qatar",
    zone: 1,
    heading: "O Level and A Level Accounting, Business and Economics classes for Doha students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Doha students, 1:30 to 7:30 pm Qatar time. Free trial lesson.",
    intro:
      "Qatar is two hours behind Pakistan, so classes run from 1:30 pm to 7:30 pm Doha time, Monday to Friday.",
    local: [
      {
        title: "After school, Sunday to Thursday",
        body: "Schools in Qatar run Sunday to Thursday, with a shorter day on Thursday. Friday is not a school day, so Friday's class is a quiet weekend session. If school runs past the first class at 1:30 pm, the recording stays open for 24 hours.",
      },
      {
        title: "Private candidates in Doha",
        body: "The British Council registers private candidates through its online school exams system, and you pay in person, by cash or card, at its office on Al Sadd Street. Keep a copy of your Qatar ID, passport photos and the signed declaration ready. Candidates under 18 need a No Objection Letter from the Ministry of Education and Higher Education before they register.",
      },
      {
        title: "No practicals needed",
        body: "The British Council in Qatar offers private candidates every subject except those with practical exams. Accounting, Business and Economics are written papers only, so all three are open to you.",
      },
    ],
    faq: [
      {
        q: "Do you have a centre in Doha?",
        a: "No. Every class is live online, so you study from home anywhere in Doha, and each lesson is recorded.",
      },
      {
        q: "When do Cambridge registrations open in Qatar?",
        a: "The British Council publishes dates for each session. For October / November 2026, regular registration ran from 13 July to 10 August 2026, with late registration at a penalty fee until 14 September 2026. Check its page for May / June 2027.",
      },
    ],
    sources: ["qaWeek", "bcQa"],
  },
];

export const gulfCityPage = (slug: string) => GULF_CITY_PAGES.find((c) => c.slug === slug) ?? null;
