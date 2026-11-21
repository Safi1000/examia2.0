/**
 * Online class pages for students in India, Bangladesh, Malaysia and
 * Indonesia. The timetable is kept in Pakistan time (lib/timetable.ts, the
 * same source as the Pakistan and Gulf pages); these offsets turn it into
 * local time, so every page follows timetable changes. Pakistan (UTC+5) and
 * all four countries keep one fixed offset all year, with no daylight saving.
 *
 * Every fact here comes from the official pages in COUNTRY_SOURCES. Fees and
 * payment from abroad are not stated on these pages (the owner has not set them).
 */
import { DEFAULT_SCHEDULE, LEVEL_LABEL, span } from "@/lib/timetable";
import { levelBlocks } from "@/lib/gulf-pages";
import { PERSON_ID, absolute } from "@/lib/seo";

/** "15:30" moved forward by n minutes, wrapping past midnight. */
export const shiftMinutes = (hhmm: string, n: number) => {
  const total = (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) + n + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

/** The whole teaching day, first class start to last class end, n minutes ahead of Pakistan. */
export function dayAhead(n: number) {
  const slots = [...DEFAULT_SCHEDULE.slots].sort((a, b) => a.start.localeCompare(b.start));
  const first = slots[0]?.start ?? "";
  const last = slots.reduce((m, s) => (s.end > m ? s.end : m), "");
  return span(shiftMinutes(first, n), shiftMinutes(last, n));
}

/** One level's block in local time, n minutes ahead of Pakistan. */
export function blockAhead(level: "A2" | "O" | "AS", n: number) {
  const b = levelBlocks().find((x) => x.level === level);
  return b ? span(shiftMinutes(b.from, n), shiftMinutes(b.to, n)) : "";
}

/** The day's classes in local time, grouped by level: one block per level, one line per subject. */
export function localDayAhead(n: number) {
  const at = (hhmm: string) => shiftMinutes(hhmm, n);
  return levelBlocks().map((b) => ({
    level: LEVEL_LABEL[b.level],
    time: span(at(b.from), at(b.to)),
    classes: DEFAULT_SCHEDULE.slots
      .filter((s) => s.level === b.level)
      .sort((x, y) => x.start.localeCompare(y.start))
      .map((s) => ({ subject: s.subject, time: span(at(s.start), at(s.end)) })),
  }));
}

/** Official pages each fact comes from. Re-check them before each session. */
export const COUNTRY_SOURCES = {
  cambridgeIndia: { label: "Cambridge International, Cambridge in India", href: "https://www.cambridgeinternational.org/cambridge-international-in-india/" },
  cambridgeIndiaFaq: { label: "Cambridge International, frequently asked questions for India (2025)", href: "https://www.cambridgeinternational.org/Images/745293-india-frequently-asked-questions.pdf" },
  cambridgeMalaysia: { label: "Cambridge International, recognition in Malaysia", href: "https://www.cambridgeinternational.org/programmes-and-qualifications/recognition-and-acceptance/country/malaysia/" },
  cambridgeIndonesia: { label: "Cambridge International, recognition in Indonesia", href: "https://www.cambridgeinternational.org/programmes-and-qualifications/recognition-and-acceptance/country/indonesia/" },
  cambridge7094: { label: "Cambridge International, O Level Bangladesh Studies 7094", href: "https://www.cambridgeinternational.org/programmes-and-qualifications/cambridge-o-level-bangladesh-studies-7094/" },
  cambridgePrivate: { label: "Cambridge International, register as a private candidate", href: "https://www.cambridgeinternational.org/exam-administration/private-candidates/register-as-a-private-candidate/" },
  cambridgeFind: { label: "Cambridge International, find a centre", href: "https://www.cambridgeinternational.org/why-choose-us/find-a-cambridge-school/index.aspx" },
  bcPrivate: { label: "British Council, private candidate registration", href: "https://internationalschools.britishcouncil.org/students/private-candidates/registration" },
  bcIndonesia: { label: "British Council Indonesia Foundation, private candidates", href: "https://britishcouncilfoundation.id/en/exam/school/igcse/register/private-candidates" },
} as const;

export type CountrySourceKey = keyof typeof COUNTRY_SOURCES;

export interface CountryPage {
  slug: string;
  country: string;
  /** Minutes ahead of Pakistan. */
  aheadMin: number;
  /** Used as "India time", "Malaysia time". */
  clock: string;
  /** <title> (fitTitle adds the brand when it fits) and meta description. */
  title: string;
  description: string;
  heading: string;
  intro: string;
  /** A line under the times: other zones, or how late the last block ends. */
  timeNotes: string[];
  /** Which exams, from official sources. */
  exams: string[];
  /** How private candidates enter, from official sources. */
  privateCandidates: string[];
  /** Official pages linked right under the private candidate text. */
  pcLinks: CountrySourceKey[];
  faq: Array<{ q: string; a: string }>;
  sources: CountrySourceKey[];
  trial: { title: string; body: string };
}

/** Said the same way on every page: the confirmed "Cambridge and Edexcel", and the codes already on /online-classes. */
export const BOARDS_LINE =
  "I teach Cambridge and Edexcel. The Cambridge syllabuses are O Level 7707, 7081 (formerly 7115) and 2281, IGCSE 0452, 0264 (formerly 0450) and 0455, and AS and A Level 9706, 9609 and 9708. For Pearson Edexcel, send your specification on WhatsApp before the trial.";

const recordingFaq = {
  q: "What if school or a family plan clashes with a class?",
  a: "Every class is recorded, and the recording stays open for 48 hours. You can watch it later the same day or the next day, and the weekly test is still marked by me.",
};

const IN = 30;
const BD = 60;
const ID = 120;
const MY = 180;

export const COUNTRY_PAGES: CountryPage[] = [
  {
    slug: "india",
    country: "India",
    aheadMin: IN,
    clock: "India",
    title: "O Level, IGCSE and A Level Classes in India",
    description: `Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for students in India, ${dayAhead(IN)} India time, Monday to Friday.`,
    heading: "O Level, IGCSE and A Level Accounting, Business and Economics classes for students in India",
    intro: `I teach every class live from Rawalpindi, and India is 30 minutes ahead of Pakistan. So the classes run from ${dayAhead(IN)} India time, Monday to Friday, and you join the two hour block for your level.`,
    timeNotes: [],
    exams: [
      "Cambridge says over 700 schools in India offer its programmes, and lists Cambridge IGCSE, Cambridge O Level and Cambridge International AS & A Level among them.",
      "Cambridge also runs a March exam series in India for its most widely taken IGCSE and AS & A Level subjects, with results in May, so students applying to Indian colleges get their results in time. My classes are planned around the May / June exams, with a past paper window in March and April. If your school enters you in March, mention it when you book the trial so we can check the timing together.",
      "For moving on after Class 10, Cambridge notes that the Association of Indian Universities treats passes in five Cambridge IGCSE or O Level subjects, including English Language, as equivalent to Standard 10.",
    ],
    privateCandidates: [
      "If you are entering without a school, Cambridge says you register with a Cambridge school or approved exam provider in India that accepts private candidates, and make every arrangement with that centre, not with Cambridge. Its find a centre search lists the centres.",
    ],
    faq: [
      {
        q: "Is the timetable in India time or Pakistan time?",
        a: `It is set in Pakistan time, Monday to Friday. India is 30 minutes ahead, so for you the classes run from ${dayAhead(IN)}.`,
      },
      recordingFaq,
      {
        q: "Do you teach Edexcel as well as Cambridge?",
        a: "Yes, I teach Cambridge and Edexcel. For Edexcel, send your specification on WhatsApp before the trial, so I can check it against what I teach.",
      },
    ],
    pcLinks: ["cambridgePrivate", "cambridgeFind"],
    sources: ["cambridgeIndia", "cambridgeIndiaFaq", "cambridgePrivate", "cambridgeFind"],
    trial: {
      title: "Try one class. Then decide.",
      body: "Join one real class at your level, free, in India time, and see how a lesson and a marked test work before you decide.",
    },
  },
  {
    slug: "bangladesh",
    country: "Bangladesh",
    aheadMin: BD,
    clock: "Bangladesh",
    title: "O Level, IGCSE and A Level Classes in Bangladesh",
    description: `Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for students in Bangladesh, ${dayAhead(BD)} Bangladesh time.`,
    heading: "O Level, IGCSE and A Level Accounting, Business and Economics classes for students in Bangladesh",
    intro: `I teach every class live from Rawalpindi, and Bangladesh is one hour ahead of Pakistan. So the classes run from ${dayAhead(BD)} Bangladesh time, Monday to Friday, and you join the two hour block for your level.`,
    timeNotes: [],
    exams: [
      "Cambridge O Level is part of school life in Bangladesh: Cambridge even publishes an O Level syllabus written for it, Bangladesh Studies 7094. My O Level classes follow the Cambridge Accounting, Business and Economics syllabuses listed below.",
    ],
    privateCandidates: [
      "The British Council's private candidate page lists Bangladesh in its network of country offices. It describes the route as two steps online, through its School Registration System: you register, then pay, and your entry is processed once the payment arrives. If you are under 18, a parent or guardian completes the registration.",
      "Subjects, dates and fees are set for each country, so check them on the British Council's site for Bangladesh, linked from its private candidate page, before you register.",
    ],
    faq: [
      {
        q: "Is the timetable in Bangladesh time or Pakistan time?",
        a: `It is set in Pakistan time, Monday to Friday. Bangladesh is one hour ahead, so for you the classes run from ${dayAhead(BD)}.`,
      },
      recordingFaq,
      {
        q: "Do you teach Edexcel as well as Cambridge?",
        a: "Yes, I teach Cambridge and Edexcel. For Edexcel, send your specification on WhatsApp before the trial, so I can check it against what I teach.",
      },
    ],
    pcLinks: ["bcPrivate"],
    sources: ["cambridge7094", "bcPrivate"],
    trial: {
      title: "Try one class. Then decide.",
      body: "Join one real class at your level, free, in Bangladesh time, and see how a lesson and a marked test work before you decide.",
    },
  },
  {
    slug: "malaysia",
    country: "Malaysia",
    aheadMin: MY,
    clock: "Malaysia",
    title: "O Level, IGCSE and A Level Classes in Malaysia",
    description: `Live online IGCSE, O Level, AS and A Level Accounting, Business and Economics classes for students in Malaysia, with every class recorded for 48 hours.`,
    heading: "IGCSE, O Level and A Level Accounting, Business and Economics classes for students in Malaysia",
    intro: `I teach every class live from Rawalpindi, and Malaysia is three hours ahead of Pakistan. So the classes run from ${dayAhead(MY)} Malaysia time, Monday to Friday. That is late for the AS block, and I would rather say so here than in the trial.`,
    timeNotes: [
      `A2 and IGCSE / O Level finish by ${blockAhead("O", MY).split(" to ")[1]}. AS runs ${blockAhead("AS", MY)}, which is late on a school night. If it is too late for you, the recording of every class stays open for 48 hours, so you can watch it after school the next day.`,
    ],
    exams: [
      "If you are planning ahead to university: Cambridge's recognition page for Malaysia says universities there usually ask for three Cambridge International A Levels, and some private universities accept two.",
      "The same page notes that state universities may ask for SPM, which it calls the local equivalent of Cambridge IGCSE, and that national education policy limits their places for Cambridge students. If a state university is your aim, check its entry rules early.",
    ],
    privateCandidates: [
      "The British Council's private candidate page lists Malaysia in its network of country offices. It describes the route as two steps online, through its School Registration System: you register, then pay, and your entry is processed once the payment arrives. If you are under 18, a parent or guardian completes the registration.",
      "Subjects, dates and fees are set for each country, so check them on the British Council's site for Malaysia, linked from its private candidate page, before you register.",
    ],
    faq: [
      {
        q: "Is the timetable in Malaysia time or Pakistan time?",
        a: `It is set in Pakistan time, Monday to Friday. Malaysia is three hours ahead, so for you the classes run from ${dayAhead(MY)}.`,
      },
      recordingFaq,
      {
        q: "Do you teach Edexcel as well as Cambridge?",
        a: "Yes, I teach Cambridge and Edexcel. For Edexcel, send your specification on WhatsApp before the trial, so I can check it against what I teach.",
      },
    ],
    pcLinks: ["bcPrivate"],
    sources: ["cambridgeMalaysia", "bcPrivate"],
    trial: {
      title: "Try one class. Then decide.",
      body: "Join one real class at your level, free, in Malaysia time, and see whether the times work for you before you decide.",
    },
  },
  {
    slug: "indonesia",
    country: "Indonesia",
    aheadMin: ID,
    clock: "Western Indonesia (WIB)",
    title: "O Level, IGCSE and A Level Classes in Indonesia",
    description: `Live online IGCSE, O Level, AS and A Level Accounting, Business and Economics classes for students in Indonesia, ${dayAhead(ID)} WIB, Monday to Friday.`,
    heading: "IGCSE, O Level and A Level Accounting, Business and Economics classes for students in Indonesia",
    intro: `I teach every class live from Rawalpindi. Indonesia has three time zones; the times on this page are Western Indonesia Time (WIB, UTC+7), used in Jakarta, Java and Sumatra. That is two hours ahead of Pakistan, so the classes run from ${dayAhead(ID)} WIB, Monday to Friday.`,
    timeNotes: [
      `In Central Indonesia Time (WITA, for example Bali and Makassar) add one hour: ${dayAhead(ID + 60)}. In Eastern Indonesia Time (WIT, Papua and Maluku) add two hours: ${dayAhead(ID + 120)}.`,
      `AS is the latest block, ${blockAhead("AS", ID)} WIB. If that is too late for you, the recording of every class stays open for 48 hours.`,
    ],
    exams: [
      "If you are planning ahead to university: Cambridge's recognition page for Indonesia says a growing number of Indonesian universities and colleges recognise Cambridge International AS & A Levels, and that students usually need their certificates certified as equivalent by the education ministry. Check this with the universities you have in mind.",
    ],
    privateCandidates: [
      "The British Council Indonesia Foundation says private candidates may enter Cambridge IGCSE and International AS & A Level exams through it. The British Council describes the route as two steps online, through its School Registration System: you register, then pay. If you are under 18, a parent or guardian completes the registration.",
      "Subjects, dates and fees are set by the Foundation, so check them on its page before you register.",
    ],
    faq: [
      {
        q: "Is the timetable in Indonesia time or Pakistan time?",
        a: `It is set in Pakistan time, Monday to Friday. Western Indonesia Time (WIB) is two hours ahead, so for you the classes run from ${dayAhead(ID)} WIB, one hour later in WITA and two hours later in WIT.`,
      },
      recordingFaq,
      {
        q: "Do you teach Edexcel as well as Cambridge?",
        a: "Yes, I teach Cambridge and Edexcel. For Edexcel, send your specification on WhatsApp before the trial, so I can check it against what I teach.",
      },
    ],
    pcLinks: ["bcIndonesia", "bcPrivate"],
    sources: ["cambridgeIndonesia", "bcIndonesia", "bcPrivate"],
    trial: {
      title: "Try one class. Then decide.",
      body: "Join one real class at your level, free, in your own time zone, and see how a lesson and a marked test work before you decide.",
    },
  },
];

export const countryPage = (slug: string) => COUNTRY_PAGES.find((c) => c.slug === slug) ?? null;

/** schema.org Service for a country page: online classes, from Hamza, for that country. */
export function countryServiceLd(c: CountryPage) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `Online O Level, IGCSE and A Level classes for students in ${c.country}`,
    serviceType: "Online tutoring in Accounting, Business and Economics",
    url: absolute(`/online-classes/${c.slug}`),
    provider: { "@type": "Person", "@id": PERSON_ID, name: "Hamza" },
    areaServed: { "@type": "Country", name: c.country },
  };
}
