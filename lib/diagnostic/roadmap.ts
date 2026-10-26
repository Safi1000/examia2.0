/**
 * The order Hamza teaches each course in: the Cambridge syllabus topics,
 * in syllabus order (lib/syllabus-data). O Level and IGCSE share the same
 * topic order, so one list covers both. AS Accounting and A2 Accounting
 * use subtopics, because their syllabus has only two topics per year.
 */
import type { LevelKey, SubjectKey } from "@/lib/diagnostic/bank";

export const ROADMAP: Record<LevelKey, Record<SubjectKey, string[]>> = {
  igcse: {
    Accounting: [
      "The fundamentals of accounting",
      "Sources and recording of data",
      "Verification of accounting records",
      "Accounting procedures",
      "Preparation of financial statements",
      "Analysis and interpretation",
      "Accounting concepts",
    ],
    Business: ["Understanding business activity", "People in business", "Marketing", "Operations management", "Financial information and decisions", "External influences"],
    Economics: ["The basic economic problem", "The allocation of resources", "Microeconomic decision makers", "Government and the macroeconomy", "Economic development", "International trade"],
  },
  as: {
    Accounting: [
      "Types of business entity",
      "The accounting system",
      "Non current assets",
      "Reconciliation and verification",
      "Financial statements",
      "Analysis of information",
      "Costs and cost behaviour",
      "Traditional costing",
    ],
    Business: ["Business and its environment", "Human resource management", "Marketing", "Operations management", "Finance and accounting"],
    Economics: ["Basic economic ideas", "The price system", "Government micro intervention", "The macroeconomy", "Government macro intervention", "International economic issues"],
  },
  a2: {
    Accounting: [
      "Financial statements",
      "Regulation and ethics",
      "Acquisitions and mergers",
      "Computerised accounting",
      "Analysis and communication",
      "Activity based costing",
      "Standard costing",
      "Budgeting and control",
      "Investment appraisal",
    ],
    Business: ["Business and its environment", "Human resource management", "Marketing", "Operations management", "Finance and accounting"],
    Economics: ["The price system and the microeconomy", "Government micro intervention", "The macroeconomy", "Government macro intervention", "International economic issues"],
  },
};

/** Short, first person labels for the habit tracker, by Part 1 answer code. */
export const HABIT: Record<string, string> = {
  reread: "Test myself instead of rereading",
  copy: "Answer my own questions from memory",
  video: "Three questions after every video",
  cram: "Revise a little on several days",
  norevise: "Revise 20 minutes, four days a week",
  ignore: "Redo every question I get wrong",
  readfix: "Redo wrong questions, not just read them",
  search: "Ask Hamza before searching online",
  leave: "Ask the same day when I am stuck",
  runout: "Time myself: one minute per mark",
  rush: "Underline the command word first",
  skim: "Read the question before the passage",
  hardread: "Question first, then one paragraph at a time",
  points: "Develop each point: because, so",
  enghard: "Learn five new exam words a week",
  oneline: "Write explain answers as a chain",
  unsure: "Learn one command word a week",
  anxious: "One timed question a day",
  lowhours: "Study three to five hours a week",
  phonehand: "Phone in another room while I study",
  forget: "Ten minutes on old topics each week",
  technique: "Check my answers against mark schemes",
  calcs: "Five calculation questions a day",
  writing: "Practise one answer structure a week",
  stretch: "Do the stretch question every week",
  lowbelief: "Write down every test score",
};

export const DEFAULT_HABITS = ["Redo every question I get wrong", "Revise 20 minutes, four days a week", "Ask the same day when I am stuck"];
