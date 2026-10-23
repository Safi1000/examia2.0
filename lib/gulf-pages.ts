/**
 * Class times and city pages for students in the Gulf. The timetable is
 * kept in Pakistan time (lib/timetable.ts); these offsets turn it into local
 * time, so every Gulf page follows timetable changes. None of these
 * countries use daylight saving, and neither does Pakistan.
 */
import { DEFAULT_SCHEDULE, LEVEL_LABEL, span, type LevelKey } from "@/lib/timetable";

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

/** The day's classes in local time, grouped by level: one block per level, one line per subject. */
export function localDay(behindPk: number) {
  const at = (hhmm: string) => shiftHours(hhmm, behindPk);
  return levelBlocks().map((b) => ({
    level: LEVEL_LABEL[b.level],
    time: span(at(b.from), at(b.to)),
    classes: DEFAULT_SCHEDULE.slots
      .filter((s) => s.level === b.level)
      .sort((x, y) => x.start.localeCompare(y.start))
      .map((s) => ({ subject: s.subject, time: span(at(s.start), at(s.end)) })),
  }));
}

/** Official pages each Gulf fact comes from. Re-check them each session. */
export const GULF_SOURCES = {
  khdaWeek: { label: "KHDA, 4.5 day week FAQs for Dubai private schools", href: "https://web.khda.gov.ae/en/Guides/Parents/Faq/4-5-day-week-FAQs-for-Dubai-private-schools" },
  uaeWeek: { label: "UAE government portal, working hours in the public sector", href: "https://u.ae/en/information-and-services/jobs/Sector-of-employment/working-in-uae-government-sector/working-hours-in-the-public-sector" },
  bcUae: { label: "British Council UAE, Cambridge candidate information, October / November 2026", href: "https://www.britishcouncil.ae/sites/default/files/candidate_information_flyer_-_oct_nov_2026.pdf" },
  bcUaeCentres: { label: "British Council UAE, attached centres", href: "https://www.britishcouncil.ae/en/exam/igcse-school/choosing/find-british-council-attached-centre" },
  saWeek: { label: "Saudi Press Agency, Royal Order on the Friday and Saturday weekend", href: "https://www.spa.gov.sa/en/bee255bdbb" },
  saRiyadhYear: { label: "Saudi Press Agency, Riyadh students return to school", href: "https://spa.gov.sa/en/N2659363" },
  saRegions2025: { label: "Saudi Press Agency, new academic year begins", href: "https://www.spa.gov.sa/en/N2384169" },
  saPrivateSchools: { label: "Saudi Ministry of Education, private and international schools", href: "https://www.moe.gov.sa/en/education/generaleducation/Pages/Reg-priv-int-schools.aspx" },
  bcSa: { label: "British Council Saudi Arabia, how to register for school exams", href: "https://www.britishcouncil.sa/en/exam/igcse-school/register" },
  bcSaRiyadh: { label: "British Council Saudi Arabia, Riyadh office", href: "https://www.britishcouncil.sa/english/schools/riyadh/mens" },
  qaWeek: { label: "Qatar News Agency, Ministry of Education school hours notice", href: "https://qna.org.qa/en/news/news-details?id=qatar-to-apply-summer-school-hours-on-may-3&date=27/04/2026" },
  qaThursday: { label: "Qatar Ministry of Education, study plans from 2024 to 2025", href: "https://www.edu.gov.qa/en/News/Details/9271800" },
  bcQa: { label: "British Council Qatar, exam registration for private candidates", href: "https://www.britishcouncil.qa/en/exam/igcse-school/register/private-candidates" },
  bcQaDates: { label: "British Council Qatar, registration dates and deadlines", href: "https://www.britishcouncil.qa/en/exam/igcse-school/register/registration-dates-deadlines" },
} as const;

export type GulfSourceKey = keyof typeof GULF_SOURCES;

/**
 * Gulf city pages. Each one only carries what is true of that city: the
 * day's classes on the local clock, how the local school week meets the
 * Monday to Friday timetable, and where private candidates enter. Shared
 * material (what the classes include, the full private candidate process)
 * lives once, on /online-classes/gulf and the country guides.
 */
export interface GulfCityPage {
  slug: string;
  city: string;
  /** Used as "UAE time", "Saudi time". */
  clock: string;
  /** Index into GULF_ZONES. */
  zone: number;
  heading: string;
  description: string;
  intro: string;
  local: Array<{ title: string; body: string[] }>;
  /** Private candidate guide for this country, if there is one. */
  guide?: { href: string; label: string };
  faq: Array<{ q: string; a: string }>;
  sources: GulfSourceKey[];
  trial: { title: string; body: string };
}

const UAE_GUIDE = { href: "/private-candidates/uae", label: "UAE private candidate guide" };
const SA_GUIDE = { href: "/private-candidates/saudi-arabia", label: "Saudi Arabia private candidate guide" };

export const GULF_CITY_PAGES: GulfCityPage[] = [
  {
    slug: "dubai",
    city: "Dubai",
    clock: "UAE",
    zone: 0,
    heading: "O Level and A Level Accounting, Business and Economics classes for Dubai students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Dubai students, 2:30 to 8:30 pm UAE time, Monday to Friday.",
    intro:
      "Dubai's private schools and my classes run on the same five days, Monday to Friday. The first class is at 2:30 pm UAE time and the last one ends at 8:30 pm, so you study at home after school with no drive across the city.",
    local: [
      {
        title: "Friday is the easy day",
        body: [
          "KHDA's rule for Dubai private schools is that Friday finishes by 12 pm at the latest, and Saturday and Sunday are the weekend. That leaves more than two hours between the end of school and the first class on a Friday, more than on any other day.",
          "Monday to Thursday depends on your school's own hours. If yours runs late, the recording of every class stays open for 24 hours.",
        ],
      },
      {
        title: "Sitting exams from Dubai",
        body: [
          "If your school enters you, nothing changes. If you are entering on your own, the British Council's Dubai office in Oud Metha registers private candidates, and candidates registered at its Sharjah office also sit their exams in Dubai.",
          "The British Council also lists Dubai schools that run its exams as attached centres. The UAE guide covers the documents, the No Objection Certificate and the deadlines.",
        ],
      },
    ],
    guide: UAE_GUIDE,
    faq: [
      {
        q: "I live in Sharjah. Do these times apply to me?",
        a: "Yes, Sharjah is on UAE time. One thing to check: the Sharjah government's weekend is Friday to Sunday. If your school follows it, your Friday class falls on a day off, which makes it an easy one to attend.",
      },
    ],
    sources: ["khdaWeek", "uaeWeek", "bcUae", "bcUaeCentres"],
    trial: { title: "After school. At home.", body: "Join one real class at your level, free, in UAE time, and see how it works before you decide." },
  },
  {
    slug: "abu-dhabi",
    city: "Abu Dhabi",
    clock: "UAE",
    zone: 0,
    heading: "O Level and A Level Accounting, Business and Economics classes for Abu Dhabi students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Abu Dhabi students, in UAE time, with every class recorded.",
    intro:
      "Abu Dhabi is one hour behind Pakistan, so the classes run from 2:30 pm to 8:30 pm your time, Monday to Friday. Each level has its own two-hour block, and you only join yours.",
    local: [
      {
        title: "Weekends stay free",
        body: [
          "The Abu Dhabi government, like the federal government, works Monday to Friday, with Saturday and Sunday as the weekend. My classes keep to the same five days, so Saturday and Sunday are yours for revision or rest.",
          "School hours differ from school to school, so check where your block falls against your own timetable. AS starts latest, at 6:30 pm.",
        ],
      },
      {
        title: "Entering without a school",
        body: [
          "The British Council has an office in Abu Dhabi as well as in Dubai and Sharjah. If you are at a school recognised by the Ministry of Education, you need a No Objection Certificate from it before you can enter privately. The UAE guide walks through it.",
        ],
      },
    ],
    guide: UAE_GUIDE,
    faq: [
      {
        q: "Can I take subjects at two levels, for example AS Economics and O Level Accounting?",
        a: "The levels run one after another, not at the same time, so yes. O Level runs from 4:30 pm and AS from 6:30 pm UAE time. Ask on WhatsApp and I will check the combination with you.",
      },
    ],
    sources: ["uaeWeek", "bcUae"],
    trial: { title: "Your block. Your evening.", body: "Join one real class at your level, free, in UAE time, and see how a lesson and a marked test work before you decide." },
  },
  {
    slug: "riyadh",
    city: "Riyadh",
    clock: "Saudi",
    zone: 1,
    heading: "O Level and A Level Accounting, Business and Economics classes for Riyadh students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Riyadh students, 1:30 to 7:30 pm Saudi time. Free trial lesson.",
    intro:
      "Saudi Arabia is two hours behind Pakistan, so classes run from 1:30 pm to 7:30 pm Riyadh time. Your school week and my timetable overlap on four days, not five, and it helps to see how.",
    local: [
      {
        title: "How the two weeks line up",
        body: [
          "Saudi Arabia's official week is Sunday to Thursday, with Friday and Saturday off. My classes run Monday to Friday. So Sunday is a school day with no class, Monday to Thursday have both, and Friday's class falls on your weekend.",
          "Riyadh's 2026 to 2027 school year started on Sunday 23 August 2026.",
        ],
      },
      {
        title: "If school runs past 1:30 pm",
        body: [
          "Only the A2 block starts that early. O Level starts at 3:30 pm and AS at 5:30 pm Riyadh time. If you are A2 and your school day runs late, the recording stays open for 24 hours.",
        ],
      },
      {
        title: "Entering without a school",
        body: [
          "The British Council's Riyadh office is in the Diplomatic Quarter. If you need special arrangements in the exam, apply through it at least six weeks before the exam date, with a medical certificate issued in the last two years.",
        ],
      },
    ],
    guide: SA_GUIDE,
    faq: [
      {
        q: "Is there a class on Sunday?",
        a: "No. Classes run Monday to Friday Pakistan time, which is the same days in Saudi Arabia. Sunday is a school day for you without a class.",
      },
    ],
    sources: ["saWeek", "saRiyadhYear", "bcSa", "bcSaRiyadh"],
    trial: { title: "Four school days. One weekend class.", body: "Join one real class at your level, free, in Saudi time, and see how it fits your week before you decide." },
  },
  {
    slug: "jeddah",
    city: "Jeddah",
    clock: "Saudi",
    zone: 1,
    heading: "O Level and A Level Accounting, Business and Economics classes for Jeddah students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Jeddah students, in Saudi time, every class recorded. Free trial lesson.",
    intro:
      "Classes run from 1:30 pm to 7:30 pm Saudi time, Monday to Friday. Because Friday is part of your weekend, one class a week lands on a day when you are not tired from school.",
    local: [
      {
        title: "Your school calendar may not match Riyadh's",
        body: [
          "In 2025, schools in Jeddah and Taif, and in the Makkah and Madinah regions, started the year a week after most of the country. Private and international schools can also move their start date by up to two weeks from the official calendar.",
          "None of that changes the class timetable, which runs on the same days all year. It does mean that if you compare notes with a friend in Riyadh, your terms may not line up.",
        ],
      },
      {
        title: "Make Friday your paper day",
        body: [
          "A weekend afternoon is the best time in the week for a timed past paper question. My suggestion: after Friday's class, do one past paper question under timed conditions straight away, while the method is fresh, and bring it to the next class if it went wrong.",
        ],
      },
      {
        title: "Entering without a school",
        body: [
          "The British Council has an office in Jeddah. If you spot a mistake in your exam entry, contact it straight away, because each session has a deadline for corrections.",
        ],
      },
    ],
    guide: SA_GUIDE,
    faq: [
      {
        q: "I am A2 and school ends after 1:30 pm. What happens?",
        a: "The A2 block runs from 1:30 pm to 3:30 pm Saudi time. Watch the recording the same day: it stays open for 24 hours. O Level and AS start later, at 3:30 pm and 5:30 pm.",
      },
    ],
    sources: ["saWeek", "saRegions2025", "saPrivateSchools", "bcSa"],
    trial: { title: "Try a Friday class. Then decide.", body: "Join one real class at your level, free, in Saudi time, and see how a lesson and a marked test work." },
  },
  {
    slug: "doha",
    city: "Doha",
    clock: "Qatar",
    zone: 1,
    heading: "O Level and A Level Accounting, Business and Economics classes for Doha students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Doha students, 1:30 to 7:30 pm Qatar time. Free trial lesson.",
    intro:
      "Qatar is two hours behind Pakistan, so classes run from 1:30 pm to 7:30 pm Doha time, Monday to Friday. If you are entering without a school, the British Council in Doha has its own process, set out below.",
    local: [
      {
        title: "School and class, side by side",
        body: [
          "Schools in Qatar run Sunday to Thursday, with a shorter day on Thursday. Friday is not a school day, so your Friday class is a quiet weekend session, and Sunday has school but no class.",
          "If school runs past the first class at 1:30 pm, it only affects A2. The recording stays open for 24 hours.",
        ],
      },
      {
        title: "Entering without a school in Qatar",
        body: [
          "The British Council registers private candidates through its online school exams system. You then pay in person, by cash or card, at its office on Al Sadd Street. In special cases, you can authorise someone else to hand in the application and pay for you.",
          "Keep a copy of your Qatar ID, passport photos and the signed declaration ready. If you are under 18, you need a No Objection Letter from the Ministry of Education and Higher Education before you register.",
          "Private candidates can take any subject except those with practical exams. Accounting, Business and Economics are written papers only, so all three are open to you.",
        ],
      },
    ],
    faq: [
      {
        q: "When do Cambridge registrations open in Qatar?",
        a: "The British Council publishes dates for each session. For October / November 2026, regular registration ran from 13 July to 10 August 2026, with late registration at a penalty fee until 14 September 2026. Check its page for May / June 2027.",
      },
    ],
    sources: ["qaWeek", "qaThursday", "bcQa", "bcQaDates"],
    trial: { title: "Your time zone. My class.", body: "Join one real class at your level, free, in Qatar time, and see how it fits around school before you decide." },
  },
];

export const gulfCityPage = (slug: string) => GULF_CITY_PAGES.find((c) => c.slug === slug) ?? null;
