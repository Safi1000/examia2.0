/**
 * Subject and level content: the subject tuition pages (/tuition/[slug]), the homepage
 * picker's codes and the course data (lib/seo.ts coursesLd). Plain data, no "use client",
 * so server pages can read it for metadata and structured data.
 *
 * Level titles and blurbs are the homepage picker's own copy. Syllabus codes
 * and section names follow the Cambridge syllabuses; check them against the
 * current syllabus PDF when a new one is published.
 */
import type { LevelName, SubjectName } from "@/lib/landing";

export interface LevelInfo {
  level: LevelName;
  /** Cambridge qualification names and codes this level covers. */
  codes: string;
  title: string;
  body: string;
  topics: string[];
}

export interface SubjectInfo {
  slug: string;
  subject: SubjectName;
  /** <title> without the brand; fitTitle() adds " | Hamza Teaches" (about 60 characters in all). */
  seoTitle: string;
  /** Meta description, about 155 characters. */
  seoDescription: string;
  h1: string;
  intro: string;
  levels: LevelInfo[];
  /** Review screenshots from lib/reviews.ts (by src) that are about this subject. Only ones already on the homepage. */
  reviewShots?: string[];
  /** Questions only this subject needs, answered from facts already on the site. */
  faq?: Array<{ q: string; a: string }>;
}

/** The subject tuition page for a slug. */
export const tuitionPath = (slug: string) => `/tuition/${slug}`;

export const SUBJECT_PAGES: SubjectInfo[] = [
  {
    slug: "accounting",
    subject: "Accounting",
    seoTitle: "Accounting Tuition: O Level, IGCSE, A Level",
    seoDescription:
      "Live small group Accounting classes on Google Meet for O Level 7707, IGCSE 0452 and AS and A Level 9706. Cambridge and Edexcel. Book a free trial lesson.",
    h1: "Accounting tuition for O Level, IGCSE and A Level",
    intro:
      "From double entry to investment appraisal, taught in the order the examiner expects, with past paper practice every week.",
    levels: [
      {
        level: "O Level / IGCSE",
        codes: "O Level 7707 · IGCSE 0452",
        title: "The foundations",
        body: "Double entry, the trial balance, and a full set of final accounts from a blank page.",
        topics: [
          "The fundamentals of accounting",
          "Sources and recording of data",
          "Verification of accounting records",
          "Accounting procedures",
          "Preparation of financial statements",
          "Analysis and interpretation",
          "Accounting principles and policies",
        ],
      },
      {
        level: "AS Level",
        codes: "AS Level 9706",
        title: "Building up",
        body: "Partnerships, limited companies, and the ratios examiners keep coming back to.",
        topics: [
          "Financial accounting: partnerships and limited companies",
          "Statements of cash flows",
          "Ratio analysis",
          "Cost and management accounting: costing methods",
          "Absorption and marginal costing",
        ],
      },
      {
        level: "A2 Level",
        codes: "A Level 9706",
        title: "The hard marks",
        body: "Manufacturing accounts, investment appraisal, and the analysis questions that carry the weight.",
        topics: [
          "Manufacturing accounts",
          "Business purchase and consolidated statements",
          "Analysis and communication of accounting information",
          "Budgeting and standard costing",
          "Investment appraisal",
        ],
      },
    ],
  },
  {
    slug: "business",
    subject: "Business",
    seoTitle: "Business Tuition: O Level, IGCSE, A Level",
    seoDescription:
      "Small live Business classes on Google Meet: O Level 7081 (was 7115), IGCSE 0264 (was 0450), AS and A Level 9609. Cambridge and Edexcel. Free trial lesson.",
    h1: "Business tuition for O Level, IGCSE and A Level",
    intro:
      "How a firm actually reaches a decision, and how to build the argument the mark scheme rewards on the long case study questions.",
    levels: [
      {
        level: "O Level / IGCSE",
        codes: "O Level 7081 / 7115 · IGCSE 0264 / 0450",
        title: "The foundations",
        body: "Business types, the marketing mix, and how a firm actually reaches a decision.",
        topics: [
          "Understanding business activity",
          "People in business",
          "Marketing",
          "Operations management",
          "Financial information and decisions",
          "External influences on business activity",
        ],
      },
      {
        level: "AS Level",
        codes: "AS Level 9609",
        title: "Building up",
        body: "Motivation theory, cash flow, and building an argument the mark scheme rewards.",
        topics: [
          "Business and its environment",
          "Human resource management",
          "Marketing",
          "Operations management",
          "Finance and accounting",
        ],
      },
      {
        level: "A2 Level",
        codes: "A Level 9609",
        title: "The hard marks",
        body: "Strategy, stakeholder conflict, and the long case study questions.",
        topics: [
          "Business and its environment, in depth",
          "Human resource and marketing strategy",
          "Operations and finance, in depth",
          "Strategic management",
          "Case study technique",
        ],
      },
    ],
    reviewShots: ["/reviews/armaan.jpg", "/reviews/talal.jpg"],
    faq: [
      {
        q: "My Business syllabus code changed. Which one do you teach?",
        a: "Both, depending on when you sit. O Level Business 7081 replaces Business Studies 7115 from June 2027, and IGCSE Business 0264 replaces Business Studies 0450 from the 2027 exams. AS and A Level stays 9609.",
      },
    ],
  },
  {
    slug: "economics",
    subject: "Economics",
    seoTitle: "Economics Tuition: O Level, IGCSE, A Level",
    seoDescription:
      "Live small group Economics classes on Google Meet for O Level 2281, IGCSE 0455 and AS and A Level 9708. Cambridge and Edexcel. Book a free trial lesson.",
    h1: "Economics tuition for O Level, IGCSE and A Level",
    intro:
      "Diagrams you can draw under pressure, and evaluation answers that pick a side and back it up.",
    levels: [
      {
        level: "O Level / IGCSE",
        codes: "O Level 2281 · IGCSE 0455",
        title: "The foundations",
        body: "Supply, demand, and why a price moves the way it does.",
        topics: [
          "The basic economic problem",
          "The allocation of resources",
          "Microeconomic decision makers",
          "Government and the macroeconomy",
          "Economic development",
          "International trade and globalisation",
        ],
      },
      {
        level: "AS Level",
        codes: "AS Level 9708",
        title: "Building up",
        body: "Elasticity, market failure, and reading a diagram under exam pressure.",
        topics: [
          "Basic economic ideas and resource allocation",
          "The price system and the microeconomy",
          "Government microeconomic intervention",
          "The macroeconomy",
          "Government macroeconomic intervention",
        ],
      },
      {
        level: "A2 Level",
        codes: "A Level 9708",
        title: "The hard marks",
        body: "Macro policy, trade, and the evaluation questions that ask you to pick a side.",
        topics: [
          "The price system and the microeconomy, in depth",
          "Government microeconomic intervention",
          "The macroeconomy, in depth",
          "Government macroeconomic intervention",
          "International economic issues",
        ],
      },
    ],
  },
];

export function subjectBySlug(slug: string): SubjectInfo | undefined {
  return SUBJECT_PAGES.find((s) => s.slug === slug);
}

/**
 * Level pages under each subject page: /tuition/<subject>/o-level-igcse and
 * /tuition/<subject>/a-level (AS and A2). Same facts as the subject page, cut to
 * one level and taken deeper (the full Cambridge topic list, that level's class
 * times, resources and articles).
 */
export type LevelSlug = "o-level-igcse" | "a-level";

/** The subject page level blocks each level page covers. */
export const LEVEL_SLUG_LEVELS: Record<LevelSlug, LevelName[]> = {
  "o-level-igcse": ["O Level / IGCSE"],
  "a-level": ["AS Level", "A2 Level"],
};

export const levelSlugFor = (level: LevelName): LevelSlug => (level === "O Level / IGCSE" ? "o-level-igcse" : "a-level");

export interface LevelPageInfo {
  subjectSlug: string;
  slug: LevelSlug;
  /** For links and the breadcrumb: "O Level and IGCSE" or "A Level". */
  name: string;
  /** <title> without the brand; fitTitle() adds " | Hamza Teaches" (about 60 characters in all). */
  seoTitle: string;
  /** Meta description, about 155 characters. */
  seoDescription: string;
  h1: string;
}

/** The level page for a subject and level. */
export const levelPath = (subjectSlug: string, slug: LevelSlug) => `/tuition/${subjectSlug}/${slug}`;

export const LEVEL_PAGES: LevelPageInfo[] = [
  {
    subjectSlug: "accounting",
    slug: "o-level-igcse",
    name: "O Level and IGCSE",
    seoTitle: "Online O Level and IGCSE Accounting Tuition",
    seoDescription:
      "Live O Level Accounting 7707 and IGCSE Accounting 0452 classes with me on Google Meet, Monday to Friday, with a weekly marked test. Book a free trial lesson.",
    h1: "O Level and IGCSE Accounting tuition",
  },
  {
    subjectSlug: "accounting",
    slug: "a-level",
    name: "A Level",
    seoTitle: "Online A Level Accounting Tuition: AS and A2",
    seoDescription:
      "Live AS and A Level Accounting 9706 classes on Google Meet: separate AS and A2 groups, Monday to Friday, with weekly marked tests. Book a free trial lesson.",
    h1: "A Level Accounting tuition, AS and A2",
  },
  {
    subjectSlug: "business",
    slug: "o-level-igcse",
    name: "O Level and IGCSE",
    seoTitle: "Online O Level and IGCSE Business Tuition",
    seoDescription:
      "Live O Level Business 7081 (was 7115) and IGCSE Business 0264 (was 0450) classes on Google Meet, Monday to Friday, weekly tests. Book a free trial lesson.",
    h1: "O Level and IGCSE Business tuition",
  },
  {
    subjectSlug: "business",
    slug: "a-level",
    name: "A Level",
    seoTitle: "Online A Level Business Tuition: AS and A2",
    seoDescription:
      "Live AS and A Level Business 9609 classes on Google Meet: separate AS and A2 groups, Monday to Friday, with weekly marked tests. Book a free trial lesson.",
    h1: "A Level Business tuition, AS and A2",
  },
  {
    subjectSlug: "economics",
    slug: "o-level-igcse",
    name: "O Level and IGCSE",
    seoTitle: "Online O Level and IGCSE Economics Tuition",
    seoDescription:
      "Live O Level Economics 2281 and IGCSE Economics 0455 classes with me on Google Meet, Monday to Friday, with a weekly marked test. Book a free trial lesson.",
    h1: "O Level and IGCSE Economics tuition",
  },
  {
    subjectSlug: "economics",
    slug: "a-level",
    name: "A Level",
    seoTitle: "Online A Level Economics Tuition: AS and A2",
    seoDescription:
      "Live AS and A Level Economics 9708 classes on Google Meet: separate AS and A2 groups, Monday to Friday, with weekly marked tests. Book a free trial lesson.",
    h1: "A Level Economics tuition, AS and A2",
  },
];

export function levelPage(subjectSlug: string, slug: string): LevelPageInfo | undefined {
  return LEVEL_PAGES.find((p) => p.subjectSlug === subjectSlug && p.slug === slug);
}
