/**
 * Pearson Edexcel qualifications that match the Cambridge subjects Hamza teaches:
 * International GCSE and International A Level (IAL) Accounting, Business and
 * Economics. Used by /syllabus/edexcel and /syllabus/edexcel/[slug].
 *
 * Every code, paper, length, mark, weighting and date below was read on 24 Nov 2026
 * from Pearson's own pages and documents (the `sources` of each entry):
 * the qualification page, the specification PDF it links, and Pearson's
 * information manual for 2026/2027 (exam series and entry codes).
 * Where the specification and the 2026/2027 manual differ on exam series, the
 * manual wins (it is newer). Nothing here is copied word for word from Pearson.
 */
import type { LevelName, SubjectName } from "@/lib/landing";

export interface EdexcelPaper {
  /** Pearson's paper or unit name, with its number. */
  name: string;
  code: string;
  length: string;
  marks: number;
  /** Share of the qualification, as Pearson prints it. */
  weight: string;
  /** What the paper holds, in plain words. */
  holds: string[];
}

export interface EdexcelQual {
  slug: string;
  subject: SubjectName;
  level: "International GCSE" | "International A Level";
  /** For the booking box. */
  levelName: LevelName;
  /** Short name used in lists and crumbs, e.g. "International GCSE Accounting". */
  name: string;
  /** Pearson qualification code (the IAL code; the IAS code sits in `asCode`). */
  code: string;
  asCode?: string;
  title: string;
  description: string;
  teaching: string;
  firstExam: string;
  grading: string;
  /** Exam series in Pearson's 2026/2027 information manual. */
  series: string;
  /** How the papers add up, one line. */
  shape: string;
  papers: EdexcelPaper[];
  /** Content groups: heading, then the topics under it (Pearson's topic names). */
  content: Array<{ heading: string; items: string[] }>;
  /** Extra facts worth knowing, each from the sources. */
  notes: string[];
  /** The Cambridge syllabus for the same subject and level on this site. */
  cambridge: { code: string; slug: string; name: string };
  faq: Array<{ q: string; a: string }>;
  sources: Array<{ href: string; label: string }>;
}

const P = "https://qualifications.pearson.com";
export const IG_MANUAL = { href: `${P}/content/dam/pdf/Support/Information-manual/6-international-gcse-2026-2027.pdf`, label: "Pearson information manual 2026/2027, International GCSE" };
export const IAL_MANUAL = {
  href: `${P}/content/dam/pdf/Support/Information-manual/4-international-a-level-2026-2027.pdf`,
  label: "Pearson information manual 2026/2027, International A Level",
};

/** Said the same way on every Edexcel page: what the rest of the site already says about Edexcel students. */
export const EDEXCEL_CLASSES =
  "I teach Cambridge and Edexcel. If you are on Edexcel, send me your specification on WhatsApp before the trial, so I can check it against what I teach.";

export const EDEXCEL: EdexcelQual[] = [
  {
    slug: "international-gcse-accounting-4ac1",
    subject: "Accounting",
    level: "International GCSE",
    levelName: "O Level / IGCSE",
    name: "International GCSE Accounting",
    code: "4AC1",
    title: "Edexcel IGCSE Accounting 4AC1: Papers, Marks and Topics",
    description:
      "Edexcel International GCSE Accounting 4AC1: both papers with length, marks and weighting, all five topics, the 2026/27 exam series and grading.",
    teaching: "September 2017",
    firstExam: "June 2019",
    grading: "9 to 1, where 9 is the highest",
    series: "November 2026 and June 2027",
    shape: "Two written papers, 150 marks in all. Both are sat at the end of the course.",
    papers: [
      {
        name: "Paper 1: Introduction to Bookkeeping and Accounting",
        code: "4AC1/01",
        length: "2 hours",
        marks: 100,
        weight: "66.6%",
        holds: [
          "Section A: 10 multiple choice questions worth 1 mark each, then three short questions worth 5 marks each.",
          "Section B: five longer questions in parts, worth 15 marks each.",
          "Questions come only from topics 1 to 3.",
        ],
      },
      {
        name: "Paper 2: Financial Statements",
        code: "4AC1/02",
        length: "1 hour 15 minutes",
        marks: 50,
        weight: "33.3%",
        holds: [
          "Two longer questions in parts, built around preparing, analysing or judging financial statements.",
          "Tests topics 4 and 5, and expects you to use everything from topics 1 to 3 as well.",
        ],
      },
    ],
    content: [
      { heading: "Topic 1: The accounting environment", items: ["Types of business organisation", "Accounting concepts", "Use of technology in accounting", "Professional ethics"] },
      {
        heading: "Topic 2: Introduction to bookkeeping",
        items: [
          "Business documentation",
          "Books of original entry",
          "Ledger accounting",
          "Capital expenditure and revenue expenditure",
          "Depreciation",
          "Irrecoverable debts",
          "Other receivables and payables",
        ],
      },
      { heading: "Topic 3: Introduction to control processes", items: ["Trial balance", "Control accounts", "Correction of errors", "Bank reconciliation statements"] },
      {
        heading: "Topic 4: The preparation of financial statements",
        items: [
          "Financial statements of a sole trader",
          "Financial statements of a partnership",
          "Incomplete records",
          "Calculating and interpreting accounting ratios",
          "Financial statements of a manufacturer",
        ],
      },
      {
        heading: "Topic 5: Accounting for end of period adjustments",
        items: ["Applying accounting concepts", "Depreciation", "Irrecoverable debts", "Other receivables and payables"],
      },
    ],
    notes: [
      "The ratios named in the specification are gross profit percentage, profit for the year as a percentage of revenue, return on capital employed, the current ratio and the liquid (acid test) ratio.",
      "Pearson also runs a modular version for international centres only: Unit 1 (4WAC1) and Unit 2 (4WAC2), cashed in as 4XAC1. Your school decides which route you sit.",
      "Regional papers (marked R) are listed for June 2027 only.",
    ],
    cambridge: { code: "0452", slug: "igcse-accounting-0452", name: "IGCSE Accounting 0452" },
    faq: [
      { q: "How many papers are in Edexcel IGCSE Accounting 4AC1?", a: "Two. Paper 1 is 2 hours for 100 marks and Paper 2 is 1 hour 15 minutes for 50 marks." },
      { q: "Which topics does Paper 1 test?", a: "Only topics 1 to 3: the accounting environment, bookkeeping and control processes such as the trial balance and bank reconciliation." },
      { q: "Is 4AC1 graded A* to G?", a: "No. Pearson grades it 9 to 1, where 9 is the highest grade. The papers are not graded on their own." },
      { q: "When can I sit 4AC1?", a: "Pearson's 2026/2027 information manual lists November 2026 and June 2027 for the linear papers." },
      { q: "Do you teach Edexcel IGCSE Accounting?", a: EDEXCEL_CLASSES },
    ],
    sources: [
      { href: `${P}/en/qualifications/edexcel-international-gcses/international-gcse-accounting-2017.html`, label: "Pearson, International GCSE Accounting qualification page" },
      {
        href: `${P}/content/dam/pdf/International%20GCSE/Accounting/2017/Specification-and-sample-assessments/ig-accountancy-spec.pdf`,
        label: "Pearson Edexcel International GCSE in Accounting (4AC1) specification",
      },
      IG_MANUAL,
    ],
  },
  {
    slug: "international-gcse-business-4bs1",
    subject: "Business",
    level: "International GCSE",
    levelName: "O Level / IGCSE",
    name: "International GCSE Business",
    code: "4BS1",
    title: "Edexcel IGCSE Business 4BS1: Papers, Marks and Topics",
    description:
      "Edexcel International GCSE Business 4BS1: both papers with length, marks and weighting, the five content areas, 2026/27 exam series and the new 2027 spec.",
    teaching: "September 2017",
    firstExam: "June 2019",
    grading: "9 to 1, where 9 is the highest",
    series: "November 2026 and June 2027",
    shape: "Two written papers of 80 marks each, worth half the grade each. Both papers can test any part of the content.",
    papers: [
      {
        name: "Paper 1: Investigating small businesses",
        code: "4BS1/01",
        length: "1 hour 30 minutes",
        marks: 80,
        weight: "50%",
        holds: [
          "Four compulsory questions worth 20 marks each.",
          "A mix of multiple choice, short answer, data response and open questions.",
          "Every case is a small business, which Pearson sets at up to 49 employees.",
        ],
      },
      {
        name: "Paper 2: Investigating large businesses",
        code: "4BS1/02",
        length: "1 hour 30 minutes",
        marks: 80,
        weight: "50%",
        holds: [
          "Four compulsory questions worth 20 marks each, in the same mix of question types.",
          "Every case is a large business, which Pearson sets at more than 250 employees.",
        ],
      },
    ],
    content: [
      {
        heading: "1. Business activity and influences on business",
        items: ["Business objectives", "Types of organisations", "Classifying businesses", "Location", "Globalisation, multinationals and exchange rates", "Government objectives and policies", "External factors", "What makes a business successful"],
      },
      { heading: "2. People in business", items: ["Internal and external communication", "Recruitment and selection", "Training", "Motivation and rewards", "Organisation structure and employees"] },
      { heading: "3. Business finance", items: ["Sources of finance", "Cash flow forecasting", "Costs and break even analysis", "Financial documents", "Accounts analysis and ratios"] },
      { heading: "4. Marketing", items: ["Market research", "The market and segmentation", "The marketing mix: product, price, place and promotion"] },
      { heading: "5. Business operations", items: ["Economies and diseconomies of scale", "Production", "Factors of production", "Quality"] },
    ],
    notes: [
      "Calculators are allowed in both papers.",
      "Each paper can be sat on paper or onscreen. Your school has to ask Pearson for approval to offer the onscreen option.",
      "Pearson has a new International GCSE Business for first teaching from September 2027, with first exams in May / June 2028. The last 4BS1 exams are in November 2028.",
    ],
    cambridge: { code: "0264", slug: "igcse-business-0264", name: "IGCSE Business 0264" },
    faq: [
      { q: "What is the difference between 4BS1 Paper 1 and Paper 2?", a: "Both cover the whole specification and have the same length and marks. Paper 1 is set around a small business and Paper 2 around a large one." },
      { q: "How long is each 4BS1 paper?", a: "1 hour 30 minutes for 80 marks. Each paper is half of your grade." },
      { q: "Is 4BS1 changing?", a: "Yes. Pearson lists a new International GCSE Business for teaching from September 2027, first examined in May / June 2028. 4BS1 is last examined in November 2028." },
      { q: "Can I use a calculator in 4BS1?", a: "Yes. The specification allows calculators in both papers." },
      { q: "Do you teach Edexcel IGCSE Business?", a: EDEXCEL_CLASSES },
    ],
    sources: [
      { href: `${P}/en/qualifications/edexcel-international-gcses/business-2017.html`, label: "Pearson, International GCSE Business (2017) qualification page" },
      {
        href: `${P}/content/dam/pdf/International%20GCSE/Business%20Studies/2017/specification-and-sample-assessment/9781446942765-international-gcse-business-specification.pdf`,
        label: "Pearson Edexcel International GCSE in Business (4BS1) specification, Issue 2",
      },
      { href: `${P}/en/qualifications/edexcel-international-gcses/business-2027.html`, label: "Pearson, International GCSE Business (2027) qualification page" },
      IG_MANUAL,
    ],
  },
  {
    slug: "international-gcse-economics-4ec1",
    subject: "Economics",
    level: "International GCSE",
    levelName: "O Level / IGCSE",
    name: "International GCSE Economics",
    code: "4EC1",
    title: "Edexcel IGCSE Economics 4EC1: Papers, Marks and Topics",
    description:
      "Edexcel International GCSE Economics 4EC1: both papers with length, marks and weighting, every topic in both papers, the 2026/27 exam series and grading.",
    teaching: "September 2017",
    firstExam: "June 2019",
    grading: "9 to 1, where 9 is the highest",
    series: "November 2026 and June 2027",
    shape: "Two written papers of 80 marks each, worth half the grade each. Paper 1 is microeconomics, Paper 2 is macroeconomics.",
    papers: [
      {
        name: "Paper 1: Microeconomics and Business Economics",
        code: "4EC1/01",
        length: "1 hour 30 minutes",
        marks: 80,
        weight: "50%",
        holds: ["Four compulsory questions worth 20 marks each.", "A mix of multiple choice, short answer, data response and open questions."],
      },
      {
        name: "Paper 2: Macroeconomics and the Global Economy",
        code: "4EC1/02",
        length: "1 hour 30 minutes",
        marks: 80,
        weight: "50%",
        holds: ["Four compulsory questions worth 20 marks each, in the same mix of question types."],
      },
    ],
    content: [
      {
        heading: "Paper 1: The market system",
        items: ["The economic problem", "Economic assumptions", "Demand, supply and market equilibrium", "Elasticity", "The mixed economy", "Externalities"],
      },
      {
        heading: "Paper 1: Business economics",
        items: ["Production", "Productivity and division of labour", "Business costs, revenues and profit", "Business competition", "The labour market", "Government intervention"],
      },
      { heading: "Paper 2: Government and the economy", items: ["Macroeconomic objectives", "Government policies", "Relationships between objectives and policies"] },
      { heading: "Paper 2: The global economy", items: ["Globalisation", "International trade", "Exchange rates"] },
    ],
    notes: [
      "Each paper can be sat on paper or onscreen. Your school has to ask Pearson for approval to offer the onscreen option.",
      "The latest specification (Issue 3, February 2026) lists the papers in June and November, with no January series.",
      "Pearson also runs a modular version of International GCSE Economics for international centres only. Your school decides which route you sit.",
    ],
    cambridge: { code: "0455", slug: "igcse-economics-0455", name: "IGCSE Economics 0455" },
    faq: [
      { q: "How many papers are in Edexcel IGCSE Economics 4EC1?", a: "Two, each 1 hour 30 minutes for 80 marks. Paper 1 is microeconomics and business economics, Paper 2 is macroeconomics and the global economy." },
      { q: "Does 4EC1 have a January exam?", a: "No. The February 2026 specification removed January and added November. The 2026/2027 manual lists November 2026 and June 2027." },
      { q: "Is 4EC1 graded A* to G?", a: "No. Pearson grades it 9 to 1, where 9 is the highest grade." },
      { q: "Can I sit 4EC1 onscreen?", a: "Pearson offers an onscreen option for both papers, but only at schools it has approved for onscreen exams." },
      { q: "Do you teach Edexcel IGCSE Economics?", a: EDEXCEL_CLASSES },
    ],
    sources: [
      { href: `${P}/en/qualifications/edexcel-international-gcses/international-gcse-economics-2017.html`, label: "Pearson, International GCSE Economics qualification page" },
      {
        href: `${P}/content/dam/pdf/International%20GCSE/Economics/2017/Specification%20and%20SAMS/international-gcse-spec-9781446942789.pdf`,
        label: "Pearson Edexcel International GCSE in Economics (4EC1) specification, Issue 3",
      },
      IG_MANUAL,
    ],
  },
  {
    slug: "ial-accounting-yac11",
    subject: "Accounting",
    level: "International A Level",
    levelName: "AS Level",
    name: "International A Level Accounting",
    code: "YAC11",
    asCode: "XAC11",
    title: "Edexcel IAL Accounting YAC11: Units, Marks and Topics",
    description:
      "Edexcel International A Level Accounting YAC11 and AS XAC11: both units with length, marks and weighting, every topic, the 2026/27 exam series and grading.",
    teaching: "September 2015",
    firstExam: "June 2016",
    grading: "A* to E for the full A Level, A to E for the AS",
    series: "October 2026, January 2027 and June 2027",
    shape: "Two units of 200 marks each. Unit 1 alone gives you the AS (XAC11). Units 1 and 2 together give the full A Level (YAC11).",
    papers: [
      {
        name: "Unit 1: The Accounting System and Costing",
        code: "WAC11/01",
        length: "3 hours",
        marks: 200,
        weight: "100% of the AS, 50% of the A Level",
        holds: [
          "Section A: two compulsory questions in parts, 55 marks each, built on data you are given.",
          "Section B: answer three of four questions, 30 marks each.",
          "A resource booklet comes with the paper. Calculators are allowed.",
        ],
      },
      {
        name: "Unit 2: Corporate and Management Accounting",
        code: "WAC12/01",
        length: "3 hours",
        marks: 200,
        weight: "50% of the A Level",
        holds: ["The same layout as Unit 1: two compulsory 55 mark questions, then three of four 30 mark questions.", "A resource booklet comes with the paper. Calculators are allowed."],
      },
    ],
    content: [
      {
        heading: "Unit 1: The Accounting System and Costing",
        items: [
          "Principles of accounting and double entry bookkeeping",
          "Control procedures",
          "Financial statements of organisations",
          "Introduction to costing",
          "Analysis of accounting statements",
          "Social and ethical accounting",
        ],
      },
      {
        heading: "Unit 2: Corporate and Management Accounting",
        items: [
          "Limited companies",
          "Investment ratios",
          "Statement of cash flows",
          "Budgeting",
          "Standard costing",
          "Project appraisal",
          "Break even analysis",
          "Marginal costing and absorption costing",
          "ICT in accounting",
        ],
      },
    ],
    notes: [
      "This is a modular qualification. You can sit the units in different series and bank the result, but no grade is issued until your school enters the cash in code (XAC11 or YAC11).",
      "Pearson has said it is correcting errors in its sample assessment materials for YAC11, so check the qualification page for the latest version before you use them.",
    ],
    cambridge: { code: "9706", slug: "a-level-accounting-9706", name: "AS and A Level Accounting 9706" },
    faq: [
      { q: "How many papers are in Edexcel IAL Accounting?", a: "Two units, each a 3 hour paper for 200 marks. Unit 1 (WAC11) is the AS. Unit 2 (WAC12) completes the A Level." },
      { q: "What is the difference between XAC11 and YAC11?", a: "XAC11 is the International Advanced Subsidiary, awarded for Unit 1. YAC11 is the full International A Level, which needs Unit 1 and Unit 2." },
      { q: "How is Unit 1 laid out?", a: "Section A has two compulsory 55 mark questions. In Section B you answer three of four 30 mark questions." },
      { q: "When can I sit IAL Accounting?", a: "Pearson's 2026/2027 manual lists both units in October 2026, January 2027 and June 2027." },
      { q: "Do you teach Edexcel IAL Accounting?", a: EDEXCEL_CLASSES },
    ],
    sources: [
      { href: `${P}/en/qualifications/edexcel-international-advanced-levels/accounting-2015.html`, label: "Pearson, International Advanced Level Accounting qualification page" },
      {
        href: `${P}/content/dam/pdf/International%20Advanced%20Level/Accounting/2015/specification-and-sample-assessments/pearson-edexcel-ial-accounting-specification.pdf`,
        label: "Pearson Edexcel IAS and IAL in Accounting specification, Issue 2",
      },
      { href: `${P}/en/news-policy/subject-updates/finance-and-accounting/amends-ial-accounting-yac11-sam.html`, label: "Pearson, amends to the YAC11 sample assessment materials" },
      IAL_MANUAL,
    ],
  },
  {
    slug: "ial-business-ybs11",
    subject: "Business",
    level: "International A Level",
    levelName: "AS Level",
    name: "International A Level Business",
    code: "YBS11",
    asCode: "XBS11",
    title: "Edexcel IAL Business YBS11: Units, Marks and Topics",
    description:
      "Edexcel International A Level Business YBS11 and AS XBS11: all four units with length, marks and sections, every topic, and the 2026/27 exam series.",
    teaching: "September 2018",
    firstExam: "January 2019",
    grading: "A* to E for the full A Level, A to E for the AS",
    series: "October 2026, January 2027 and June 2027",
    shape: "Four units of 80 marks each, all 2 hours. Units 1 and 2 give you the AS (XBS11). All four give the full A Level (YBS11).",
    papers: [
      {
        name: "Unit 1: Marketing and people",
        code: "WBS11/01",
        length: "2 hours",
        marks: 80,
        weight: "50% of the AS, 25% of the A Level",
        holds: ["Sections A and B: short and longer answers on sources, 30 marks each.", "Section C: one 20 mark essay on one or more sources."],
      },
      {
        name: "Unit 2: Managing business activities",
        code: "WBS12/01",
        length: "2 hours",
        marks: 80,
        weight: "50% of the AS, 25% of the A Level",
        holds: ["Sections A and B: short and longer answers on sources, 30 marks each.", "Section C: one 20 mark essay on one or more sources."],
      },
      {
        name: "Unit 3: Business decisions and strategy",
        code: "WBS13/01",
        length: "2 hours",
        marks: 80,
        weight: "25% of the A Level",
        holds: ["Section A: short and longer answers on sources, 40 marks.", "Sections B and C: one 20 mark essay each."],
      },
      {
        name: "Unit 4: Global business",
        code: "WBS14/01",
        length: "2 hours",
        marks: 80,
        weight: "25% of the A Level",
        holds: ["Section A: short and longer answers on sources, 40 marks.", "Sections B and C: one 20 mark essay each."],
      },
    ],
    content: [
      { heading: "Unit 1: Marketing and people", items: ["Meeting customer needs", "The market", "Marketing mix and strategy", "Managing people", "Entrepreneurs and leaders"] },
      { heading: "Unit 2: Managing business activities", items: ["Planning a business and raising finance", "Financial planning", "Managing finance", "Resource management", "External influences"] },
      {
        heading: "Unit 3: Business decisions and strategy",
        items: ["Business objectives and strategy", "Business growth", "Decision making techniques", "Influences on business decisions", "Assessing competitiveness", "Managing change"],
      },
      { heading: "Unit 4: Global business", items: ["Globalisation", "Global markets and business expansion", "Global marketing", "Global industries and companies (multinational corporations)"] },
    ],
    notes: [
      "This is a modular qualification. You can sit units in different series and bank the results, but no grade is issued until your school enters the cash in code (XBS11 or YBS11).",
    ],
    cambridge: { code: "9609", slug: "a-level-business-9609", name: "AS and A Level Business 9609" },
    faq: [
      { q: "How many units are in Edexcel IAL Business?", a: "Four, each a 2 hour paper for 80 marks. Units 1 and 2 make the AS (XBS11). All four make the A Level (YBS11)." },
      { q: "Which IAL Business units have essays?", a: "All four. Units 1 and 2 end with one 20 mark essay. Units 3 and 4 have two 20 mark essays." },
      { q: "When can I sit IAL Business units?", a: "Pearson's 2026/2027 manual lists all four units in October 2026, January 2027 and June 2027." },
      { q: "How is IAL Business graded?", a: "The full A Level is graded A* to E and the AS is graded A to E. Pearson reports a result for each unit too." },
      { q: "Do you teach Edexcel IAL Business?", a: EDEXCEL_CLASSES },
    ],
    sources: [
      { href: `${P}/en/qualifications/edexcel-international-advanced-levels/business-2018.html`, label: "Pearson, International Advanced Level Business (2018) qualification page" },
      {
        href: `${P}/content/dam/pdf/International%20Advanced%20Level/Business/2018/Specification-and-Sample-Assessment/International-A-Level-Business-Spec.pdf`,
        label: "Pearson Edexcel IAS and IAL in Business specification, Issue 1",
      },
      IAL_MANUAL,
    ],
  },
  {
    slug: "ial-economics-yec11",
    subject: "Economics",
    level: "International A Level",
    levelName: "AS Level",
    name: "International A Level Economics",
    code: "YEC11",
    asCode: "XEC11",
    title: "Edexcel IAL Economics YEC11: Units, Marks and Topics",
    description:
      "Edexcel International A Level Economics YEC11 and AS XEC11: all four units with length, marks and sections, every topic, and the 2026/27 exam series.",
    teaching: "September 2018",
    firstExam: "January 2019",
    grading: "A* to E for the full A Level, A to E for the AS",
    series: "October 2026, January 2027 and June 2027",
    shape: "Four units of 80 marks each. Units 1 and 2 give you the AS (XEC11). All four give the full A Level (YEC11).",
    papers: [
      {
        name: "Unit 1: Markets in action",
        code: "WEC11/01",
        length: "1 hour 45 minutes",
        marks: 80,
        weight: "50% of the AS, 25% of the A Level",
        holds: [
          "Section A: six multiple choice questions (6 marks).",
          "Section B: five short answer questions (20 marks).",
          "Section C: one question in five parts on a source booklet (34 marks).",
          "Section D: one 20 mark essay, chosen from two.",
        ],
      },
      {
        name: "Unit 2: Macroeconomic performance and policy",
        code: "WEC12/01",
        length: "1 hour 45 minutes",
        marks: 80,
        weight: "50% of the AS, 25% of the A Level",
        holds: ["The same four sections as Unit 1: 6, 20, 34 and 20 marks."],
      },
      {
        name: "Unit 3: Business behaviour",
        code: "WEC13/01",
        length: "2 hours",
        marks: 80,
        weight: "25% of the A Level",
        holds: [
          "Section A: six multiple choice questions (6 marks).",
          "Section B: one question in five parts on a source booklet (34 marks).",
          "Section C: two 20 mark essays, chosen from three (40 marks).",
        ],
      },
      {
        name: "Unit 4: Developments in the global economy",
        code: "WEC14/01",
        length: "2 hours",
        marks: 80,
        weight: "25% of the A Level",
        holds: ["The same three sections as Unit 3: 6, 34 and 40 marks."],
      },
    ],
    content: [
      {
        heading: "Unit 1: Markets in action",
        items: ["Introductory concepts", "Consumer behaviour and demand", "Supply", "Price determination", "Market failure", "Government intervention in markets"],
      },
      {
        heading: "Unit 2: Macroeconomic performance and policy",
        items: ["Measures of economic performance", "Aggregate demand", "Aggregate supply", "National income", "Economic growth", "Macroeconomic objectives and policies"],
      },
      { heading: "Unit 3: Business behaviour", items: ["Types and sizes of businesses", "Revenue, costs and profits", "Market structures and contestability", "Labour markets", "Government intervention"] },
      {
        heading: "Unit 4: Developments in the global economy",
        items: [
          "Causes and effects of globalisation",
          "Trade and the global economy",
          "Balance of payments, exchange rates and international competitiveness",
          "Poverty and inequality",
          "The role of the state in the macroeconomy",
          "Growth and development in developing, emerging and developed economies",
        ],
      },
    ],
    notes: [
      "This is a modular qualification. You can sit units in different series and bank the results, but no grade is issued until your school enters the cash in code (XEC11 or YEC11).",
    ],
    cambridge: { code: "9708", slug: "a-level-economics-9708", name: "AS and A Level Economics 9708" },
    faq: [
      { q: "How many units are in Edexcel IAL Economics?", a: "Four, each worth 80 marks. Units 1 and 2 are 1 hour 45 minutes and make the AS (XEC11). Units 3 and 4 are 2 hours. All four make the A Level (YEC11)." },
      { q: "How many essays are in each IAL Economics unit?", a: "Units 1 and 2 have one 20 mark essay, chosen from two. Units 3 and 4 have two 20 mark essays, chosen from three." },
      { q: "Are there multiple choice questions in IAL Economics?", a: "Yes. Every unit opens with six multiple choice questions worth 6 marks in total." },
      { q: "When can I sit IAL Economics units?", a: "Pearson's 2026/2027 manual lists all four units in October 2026, January 2027 and June 2027." },
      { q: "Do you teach Edexcel IAL Economics?", a: EDEXCEL_CLASSES },
    ],
    sources: [
      { href: `${P}/en/qualifications/edexcel-international-advanced-levels/economics-2018.html`, label: "Pearson, International Advanced Level Economics (2018) qualification page" },
      {
        href: `${P}/content/dam/pdf/International%20Advanced%20Level/Economics/2018/Specification-and-Sample-Assessment/International-A-Level-Economics-spec.pdf`,
        label: "Pearson Edexcel IAS and IAL in Economics specification, Issue 2",
      },
      IAL_MANUAL,
    ],
  },
];

export const edexcelBySlug = (slug: string) => EDEXCEL.find((q) => q.slug === slug) ?? null;

/** "4AC1" or "YAC11 (AS: XAC11)". */
export const edexcelCodes = (q: EdexcelQual) => (q.asCode ? `${q.code}, AS ${q.asCode}` : q.code);
