/**
 * Subject and level content: the homepage course data (lib/seo.ts coursesLd). Plain data, no
 * "use client", so server pages can read it for metadata and structured data.
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
  /** <title>, about 60 characters. */
  seoTitle: string;
  /** Meta description, about 155 characters. */
  seoDescription: string;
  h1: string;
  intro: string;
  levels: LevelInfo[];
}

export const SUBJECT_PAGES: SubjectInfo[] = [
  {
    slug: "accounting",
    subject: "Accounting",
    seoTitle: "Accounting Tuition: O Level, IGCSE and A Level | Hamza Teaches",
    seoDescription:
      "Live small-group Accounting classes for O Level (7707), IGCSE (0452), AS and A2 (9706). Live online. Watch a free trial lesson first.",
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
    seoTitle: "Business Tuition: O Level, IGCSE and A Level | Hamza Teaches",
    seoDescription:
      "Live small-group Business classes for O Level (7115), IGCSE (0450), AS and A2 (9609). Live online. Watch a free trial lesson first.",
    h1: "Business tuition for O Level, IGCSE and A Level",
    intro:
      "How a firm actually reaches a decision, and how to build the argument the mark scheme rewards on the long case study questions.",
    levels: [
      {
        level: "O Level / IGCSE",
        codes: "O Level 7115 · IGCSE 0450",
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
  },
  {
    slug: "economics",
    subject: "Economics",
    seoTitle: "Economics Tuition: O Level, IGCSE and A Level | Hamza Teaches",
    seoDescription:
      "Live small-group Economics classes for O Level (2281), IGCSE (0455), AS and A2 (9708). Live online. Watch a free trial lesson first.",
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
