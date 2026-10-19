/**
 * The guides shop (/guides). Plain data, server-safe.
 *
 * Launch switch, per guide: leave `buyUrl` empty and the card shows
 * "Coming soon" with a WhatsApp "tell me when it's out" button. Paste the
 * product's checkout link (Lemon Squeezy, Gumroad or similar; store not chosen
 * yet, TODO-ASK) into `buyUrl` and the card becomes "Buy now".
 *
 * TODO-ASK (Hamza): bundle price, refund policy wording, final page counts.
 */
import type { LevelName } from "@/lib/landing";

export type CoverStyle = "paper" | "ink" | "gold" | "slate";

export interface Guide {
  slug: string;
  title: string;
  /** Short title printed on the cover. */
  coverTitle: string;
  subjects: Array<"Accounting" | "Business" | "Economics">;
  level: LevelName | "AS & A Level" | "All levels";
  /** Price as shown, US dollars. */
  price: string;
  points: string[];
  cover: CoverStyle;
  /** Checkout link. Empty = not on sale yet. */
  buyUrl: string;
}

export const GUIDES: Guide[] = [
  {
    slug: "accounting-cheat-sheets",
    title: "Accounting cheat sheet pack",
    coverTitle: "Cheat sheets",
    subjects: ["Accounting"],
    level: "O Level / IGCSE",
    price: "$9.99",
    points: ["Every topic on one page", "All the formats, ready to copy", "The mistakes that cost marks"],
    cover: "paper",
    buyUrl: "",
  },
  {
    slug: "accounting-revision-guide",
    title: "Complete revision guide",
    coverTitle: "The complete revision guide",
    subjects: ["Accounting"],
    level: "O Level / IGCSE",
    price: "$19.99",
    points: ["Every syllabus topic, explained simply", "Worked examples, start to finish", "Exam tips after each topic"],
    cover: "ink",
    buyUrl: "",
  },
  {
    slug: "exam-technique-guide",
    title: "Exam technique guide",
    coverTitle: "Exam technique",
    subjects: ["Accounting", "Business", "Economics"],
    level: "All levels",
    price: "$9.99",
    points: ["Every question type, and how to answer it", "Model answers with the marks shown", "Turn a 7 mark answer into an 11"],
    cover: "gold",
    buyUrl: "",
  },
  {
    slug: "a-level-accounting-guide",
    title: "A Level Accounting guide",
    coverTitle: "A Level Accounting",
    subjects: ["Accounting"],
    level: "AS & A Level",
    price: "$19.99",
    points: ["The hard topics, step by step", "Cambridge 9706 and Edexcel IAL", "Worked examples and exam tips"],
    cover: "slate",
    buyUrl: "",
  },
];

/** Shown only once a price and a checkout link are set. */
export const BUNDLE: { price: string; buyUrl: string } = { price: "", buyUrl: "" };
