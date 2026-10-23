/**
 * Online class pages for students in Pakistan's three biggest Cambridge cities.
 * Google treats near-identical city pages as doorway pages, so each one only
 * exists for what genuinely differs for that city (how students there search
 * and study, private-candidate paperwork at that British Council office),
 * and the shared offer lives once, on /online-classes.
 */
export interface CityPage {
  slug: string;
  city: string;
  /** For the <title> and h1. */
  heading: string;
  description: string;
  intro: string;
  local: Array<{ title: string; body: string }>;
  faq: Array<{ q: string; a: string }>;
}

export const CITY_PAGES: CityPage[] = [
  {
    slug: "karachi",
    city: "Karachi",
    heading: "O Level and A Level Accounting, Business and Economics classes for Karachi students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Karachi students, in the evening after school. Free trial lesson.",
    intro:
      "Karachi students usually choose between a coaching centre across town and studying alone from past papers. These classes are a third option: a small live class at home in the evening, with every lesson recorded and every weekly test marked by me.",
    local: [
      {
        title: "No evening commute",
        body: "Classes start at 3:30 pm and finish by 9:30 pm Pakistan time, at home. The hours you would spend getting to and from a centre go into past papers instead.",
      },
      {
        title: "Private candidates in Karachi",
        body: "If you are entering without a school, your registration goes through the British Council, which has an office in Karachi. My private candidate guide walks through the registration system, the deadlines and the payment slip step by step.",
      },
      {
        title: "Load-shedding or a bad connection",
        body: "Every class is recorded and the recording stays open for 24 hours, so a power cut or a weak signal does not mean a missed lesson.",
      },
    ],
    faq: [
      {
        q: "Do you have a physical academy in Karachi?",
        a: "No. Every class is live online, so you study from home anywhere in Karachi, and each lesson is recorded.",
      },
      {
        q: "Who is this for?",
        a: "Karachi students sitting Cambridge O Level, IGCSE, AS or A2 in Accounting, Business or Economics, at school or as a private candidate.",
      },
    ],
  },
  {
    slug: "lahore",
    city: "Lahore",
    heading: "O Level and A Level Accounting, Business and Economics classes for Lahore students",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes for Lahore students, small groups, recorded lessons. Free trial lesson.",
    intro:
      "Lahore has no shortage of academies, which makes it hard to tell who will actually fix your written answers. These classes are small and live, and every weekly test is marked by me with feedback on the exact mistakes that cost you marks.",
    local: [
      {
        title: "Study after school, at home",
        body: "Classes run in the evening, Pakistan time, so they fit around a full school day without a drive across the city.",
      },
      {
        title: "Private candidates in Lahore",
        body: "Private entries go through the British Council, which has an office in Lahore. My private candidate guide covers registration, deadlines and what to keep ready.",
      },
      {
        title: "Small groups, not a hall",
        body: "You are in a small group where your questions get answered in the class, not a large room where you copy notes from the back.",
      },
    ],
    faq: [
      {
        q: "Do you have a physical academy in Lahore?",
        a: "No. Every class is live online, so you study from home anywhere in Lahore, and each lesson is recorded.",
      },
      {
        q: "Can I join if my school teaches the subject too?",
        a: "Yes. The classes focus on exam technique and past paper practice, so they work alongside what your school covers.",
      },
    ],
  },
  {
    slug: "islamabad-rawalpindi",
    city: "Islamabad and Rawalpindi",
    heading: "O Level and A Level Accounting, Business and Economics classes in Islamabad and Rawalpindi",
    description:
      "Live online O Level, IGCSE, AS and A Level Accounting, Business and Economics classes from Rawalpindi, for Islamabad and Rawalpindi students. Free trial lesson.",
    intro:
      "I teach from Rawalpindi. Students across Islamabad and Rawalpindi join the same live online classes as students in the rest of Pakistan and the Gulf, in the evening after school.",
    local: [
      {
        title: "Taught from Rawalpindi",
        body: "The classes are online, so there is no centre to travel to, but you are learning from a teacher in your own city.",
      },
      {
        title: "Private candidates in Islamabad",
        body: "Private entries go through the British Council, which has an office in Islamabad. My private candidate guide explains registration and deadlines.",
      },
      {
        title: "Recorded the same night",
        body: "Miss a class for a school event or a family plan and you can watch the recording within 24 hours.",
      },
    ],
    faq: [
      {
        q: "Can I attend in person in Rawalpindi?",
        a: "Classes are online only. That keeps the groups small and lets every lesson be recorded.",
      },
      {
        q: "Who is this for?",
        a: "Students in Islamabad and Rawalpindi sitting Cambridge O Level, IGCSE, AS or A2 in Accounting, Business or Economics, at school or as a private candidate.",
      },
    ],
  },
];

export const cityPage = (slug: string) => CITY_PAGES.find((c) => c.slug === slug) ?? null;
