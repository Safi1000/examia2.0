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
