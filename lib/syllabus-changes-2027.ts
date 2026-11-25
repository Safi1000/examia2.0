/**
 * What Cambridge changed for first exams in 2027, for the six O Level / IGCSE
 * syllabuses Hamza teaches. Feeds /past-papers/2027-changes.
 *
 * Source: only Cambridge International's own syllabus PDFs for 2027, 2028 and
 * 2029, kept in ../syllabus-data/pdf/<code>-2027-2029.pdf. Every line below
 * carries the PDF page it comes from ("7707 p27" = page 27 of
 * 7707-2027-2029.pdf). Page numbers are the printed ones, which match the PDF
 * page index in these files. Nothing here is from memory: if Cambridge does not
 * spell a change out, it is not listed.
 *
 * Old codes (7115 → 7081, 0450 → 0264) come from lib/past-papers.ts (`next`);
 * the new PDFs only say "There is a new syllabus code" (7081 p30, 0264 p31).
 *
 * Topic numbers are the NEW syllabus subtopics (lib/syllabus.ts). Practice
 * links use lib/topical.ts, where old past-paper questions are filed under
 * those new topics.
 */
import { PAST_PAPER_SYLLABI, type PastPaperSyllabus } from "@/lib/past-papers";
import { syllabusByCode } from "@/lib/syllabus";
import { topicalFor, topicalHrefFor } from "@/lib/topical";

export type ChangeKind = "added" | "removed" | "reorganised";

export interface ContentChange {
  kind: ChangeKind;
  /** Plain words; short Cambridge phrases only in quotes. */
  text: string;
  /** New-syllabus subtopic numbers this change sits in, if any. */
  topics?: string[];
  /** Cambridge calls it new content / a new topic. */
  isNew?: boolean;
}

export interface AssessmentChange {
  part: "Assessment objectives" | "Paper 1" | "Paper 2";
  text: string;
}

export interface PaperRow {
  paper: string;
  name: string;
  duration: string;
  durationWas?: string;
  marks: string;
  marksWas?: string;
  weight: string;
  /** What is different from the old paper, as Cambridge states it. */
  change: string;
}

export interface Course {
  /** The 2027 code. */
  code: string;
  level: "O Level" | "IGCSE";
  /** Code of the syllabus it replaces, when the code itself changed. */
  oldCode?: string;
  /** One plain line a parent can read in five seconds. */
  summary: string;
}

export interface SubjectChanges {
  id: "business" | "accounting" | "economics";
  subject: "Business" | "Accounting" | "Economics";
  courses: [Course, Course];
  /** Exam series, from each PDF's title page (p1). */
  series: string;
  codeChange?: string;
  content: ContentChange[];
  assessment: AssessmentChange[];
  papers: PaperRow[];
  /** Subtopics Cambridge lists as new: old papers have few or no questions on them. */
  newTopics: string[];
  oldPapers: { verdict: string; body: string };
  reading: Array<{ href: string; label: string }>;
}

export const SYLLABUS_CHANGES_2027: SubjectChanges[] = [
  {
    id: "business",
    subject: "Business",
    courses: [
      // 7081 p30: "There is a new syllabus code 7081." / "The syllabus name has been changed"
      { code: "7081", level: "O Level", oldCode: "7115", summary: "New code 7081 (was 7115). Two new topics, and Paper 1 questions now have four parts instead of five." },
      // 0264 p31: "There is a new syllabus code 0264."
      { code: "0264", level: "IGCSE", oldCode: "0450", summary: "New code 0264 (was 0450). The same changes as O Level 7081." },
    ],
    // 7081 p1: June and November. 0264 p1: June and November, also March in India.
    series: "June and November. IGCSE 0264 is also sat in March in India.",
    // 7081 p30, 0264 p31
    codeChange: "New codes and a new name: Business Studies is now just Business.",
    content: [
      // 7081 p30, 0264 p31: "New topics have been added – 4.2 Technology and production of goods and services and 4.3 Sustainable production of goods and services."
      { kind: "added", text: "New topic: technology and the production of goods and services.", topics: ["4.2"], isNew: true },
      { kind: "added", text: "New topic: sustainable production of goods and services.", topics: ["4.3"], isNew: true },
      // 7081 p30, 0264 p31: "Digital methods of communication have been included in Topic 2 People in business." Sits in 2.3.1 (7081 p14, 0264 p14).
      { kind: "added", text: "Digital ways of communicating, such as virtual meetings and social media, are now part of People in business.", topics: ["2.3"] },
      // 7081 p30, 0264 p31: "A list of formulas and ratios have been added to the subject content." List on p23 (both). Version 2 (March 2025) updated the total cost and margin of safety formulas on p23.
      { kind: "added", text: "A list of formulas and ratios (marketing, production and finance) is now part of the syllabus. Cambridge has since updated the total cost and margin of safety formulas in it.", topics: ["4.4"] },
      // 7081 p30, 0264 p31: "Some content has been removed." (no list given)
      { kind: "removed", text: "Some content has been removed. Cambridge does not list which, so check your topic list against the new syllabus." },
      // 7081 p30, 0264 p31
      { kind: "reorganised", text: "Some topics have been reorganised and made smaller, and the order of some content has changed." },
      { kind: "reorganised", text: "Wording is clearer and terms have been updated to reflect current business practice." },
      { kind: "reorganised", text: "Each topic now opens with a short explanation, and the syllabus aims have been updated." },
    ],
    assessment: [
      // 7081 p31, 0264 p32
      { part: "Assessment objectives", text: "Reworded, but Cambridge says they test the same knowledge and skills. Application (AO2) now carries more weight; knowledge, analysis and evaluation carry less." },
      { part: "Paper 1", text: "Each question now has four parts instead of five, and the marks are split differently." },
      { part: "Paper 2", text: "Every part (a) question is now an applied question. The mark scheme wording has changed, but the marking criteria stay largely the same." },
    ],
    // 7081 p9, 0264 p9 (Assessment overview). Old durations and marks are not in the new PDFs, so no "was".
    papers: [
      { paper: "Paper 1", name: "Short Answer and Data Response", duration: "1 hour 30 minutes", marks: "80", weight: "50%", change: "Four questions, each now in four parts, not five" },
      { paper: "Paper 2", name: "Case Study", duration: "1 hour 30 minutes", marks: "80", weight: "50%", change: "Every part (a) is now an applied question" },
    ],
    newTopics: ["4.2", "4.3"],
    oldPapers: {
      verdict: "Mostly yes.",
      body: "Every old 7115 and 0450 question on this site is already filed under the new 7081 and 0264 topic numbers, so you can practise topic by topic. Cambridge says the reworded objectives test the same knowledge and skills. Two things to watch: Paper 1 questions now come in four parts, not five, and topics 4.2 and 4.3 are new, so old papers have only a few questions on them.",
    },
    reading: [
      { href: "/blog/igcse-business-0264-o-level-7081-changes-2027-parents", label: "0450 to 0264 and 7115 to 7081, explained for parents" },
      { href: "/blog/igcse-business-0450-past-papers-for-0264", label: "Using 0450 and 7115 past papers for 0264 and 7081" },
      { href: "/blog/0264-7081-business-specimen-paper-2027", label: "The 2027 specimen paper, question by question" },
    ],
  },
  {
    id: "accounting",
    subject: "Accounting",
    courses: [
      // 7707 p27, 0452 p28: "reviewed and revised for first examination in 2027"; Paper 1 35 → 40, 1 h 15 → 1 h 30; new content 7.2, 7.3
      { code: "7707", level: "O Level", summary: "Same code. Paper 1 grows to 40 questions in 1 hour 30 minutes, and there are two new topics." },
      { code: "0452", level: "IGCSE", summary: "Same code. The same changes as O Level 7707." },
    ],
    // 7707 p1: June and November. 0452 p1: June and November, also March in India.
    series: "June and November. IGCSE 0452 is also sat in March in India.",
    content: [
      // 7707 p27, 0452 p28: "New content has been added – 7.2 Ethical considerations and 7.3 Technology and sustainability." Content on p20 (both).
      { kind: "added", text: "New topic: ethical considerations.", topics: ["7.2"], isNew: true },
      { kind: "added", text: "New topic: technology and sustainability.", topics: ["7.3"], isNew: true },
      // 7707 p27, 0452 p28: "The title for Topic 7 has changed to 'Accounting concepts and modern practice'."
      { kind: "reorganised", text: "Topic 7 is renamed 'Accounting concepts and modern practice'.", topics: ["7.1"] },
      // 7707 p27, 0452 p28: "The accounting ratios have been updated."
      { kind: "reorganised", text: "The accounting ratios have been updated.", topics: ["6.1", "6.2"] },
      // 7707 p27, 0452 p28: "The international standards list has been removed from the syllabus."
      { kind: "removed", text: "The list of international standards has been taken out of the syllabus." },
      // 7707 p27, 0452 p28
      { kind: "reorganised", text: "The order of some content has changed, and wording is clearer." },
      { kind: "reorganised", text: "Each topic now opens with a short explanation. The syllabus aims and the list of command words have been updated." },
    ],
    assessment: [
      // 7707 p27, 0452 p28
      { part: "Assessment objectives", text: "Reworded, but Cambridge says they test the same knowledge and skills. AO1 and AO2 are rounded differently in the percentage table." },
      { part: "Paper 1", text: "Now 40 questions and 40 marks (was 35), in 1 hour 30 minutes (was 1 hour 15 minutes)." },
      { part: "Paper 2", text: "No changes." },
    ],
    // 7707 p9, 0452 p9 (Assessment overview); "was" values from 7707 p27, 0452 p28
    papers: [
      { paper: "Paper 1", name: "Multiple Choice", duration: "1 hour 30 minutes", durationWas: "1 hour 15 minutes", marks: "40", marksWas: "35", weight: "30%", change: "Five more questions, 15 more minutes" },
      { paper: "Paper 2", name: "Structured Written Paper", duration: "1 hour 45 minutes", marks: "100", weight: "70%", change: "No change: five compulsory questions" },
    ],
    newTopics: ["7.2", "7.3"],
    oldPapers: {
      verdict: "Yes, almost all of them.",
      body: "Paper 2 has not changed, and Cambridge says the reworded objectives test the same knowledge and skills. Every topic except the two new ones has old 7707 and 0452 questions filed under it. Old Paper 1s have 35 questions; the 2027 paper has 40. The ratios have been updated, so check ratio answers against the formulas in the new syllabus.",
    },
    reading: [
      { href: "/blog/o-level-accounting-7707-syllabus-2027", label: "7707 for 2027: what changed and what stays the same" },
      { href: "/blog/igcse-accounting-0452-syllabus-2027-changes", label: "0452 for 2027: every change listed" },
      { href: "/blog/7707-0452-specimen-paper-2027", label: "The 2027 specimen paper, question by question" },
      { href: "/blog/igcse-o-level-accounting-ethics-technology-sustainability-0452-7707", label: "The new topics: ethics, technology and sustainability" },
    ],
  },
  {
    id: "economics",
    subject: "Economics",
    courses: [
      // 2281 p34-36, 0455 p34-36
      { code: "2281", level: "O Level", summary: "Same code. Paper 1 is now 40 questions in 1 hour, Paper 2 drops to 80 marks in 2 hours, and some content is cut or added." },
      { code: "0455", level: "IGCSE", summary: "Same code. The same changes as O Level 2281." },
    ],
    // 2281 p1: June and November. 0455 p1: June and November, also March in India.
    series: "June and November. IGCSE 0455 is also sat in March in India.",
    content: [
      // Removed: 2281 p34, 0455 p34 ("Some content has been removed or significantly reduced"). Old topic numbers, so no links.
      { kind: "removed", text: "Trade unions as a topic of their own (old 3.4). They are still mentioned in 3.3.2.", topics: ["3.3"] },
      { kind: "removed", text: "Causes and forms of the growth of firms (old 3.5.3)." },
      { kind: "removed", text: "The role of government (old 4.1)." },
      { kind: "removed", text: "Principles of taxation (old 4.3.5)." },
      { kind: "removed", text: "Changing patterns and level of employment (old 4.7.2)." },
      { kind: "removed", text: "Deflation content (old 4.8)." },
      { kind: "removed", text: "Interpreting population pyramid diagrams (old 5.3.3)." },
      { kind: "removed", text: "Fixed exchange rates (old 6.3.5), including comparing floating and fixed systems." },
      { kind: "removed", text: "Mobility of capital, enterprise and land. Mobility of labour stays (3.3.4).", topics: ["1.2"] },
      { kind: "removed", text: "How household spending, saving and borrowing differ 'between different households and over time'.", topics: ["3.2"] },
      { kind: "removed", text: "PPC references under causes of recession and causes of growth, and 'changes in investment and technology' as a cause of growth.", topics: ["4.5"] },
      { kind: "removed", text: "The claimant count as a way to measure unemployment.", topics: ["4.6"] },
      // Added: 2281 p34-35, 0455 p34-35. Topic placement from the subject content pages (same pages in both PDFs).
      { kind: "added", text: "The environment and sustainability now run through the whole syllabus." }, // e.g. p19, p20, p25
      { kind: "added", text: "The concept of scarcity.", topics: ["1.1"] }, // p11, 1.1.1
      { kind: "added", text: "The terms perfectly inelastic, unitary elastic and perfectly elastic.", topics: ["2.6", "2.7"] }, // p14
      { kind: "added", text: "Monopoly as a term linked to market failure, plus the non-provision of public goods and higher prices from restricted supply.", topics: ["2.9"] }, // p15, 2.9.4
      { kind: "added", text: "Arguments for and against the mixed economic system.", topics: ["2.10"] }, // p15, 2.10.2
      { kind: "added", text: "Age and culture as influences on household spending, saving and borrowing.", topics: ["3.2"] }, // p16, 3.2.1
      { kind: "added", text: "Drawing and reading national minimum wage diagrams.", topics: ["3.3"] }, // p16, 3.3.2
      { kind: "added", text: "Types of mergers, and average total cost diagrams for economies and diseconomies of scale.", topics: ["3.4"] }, // p17, 3.4.2-3.4.3
      { kind: "added", text: "How changes in investment affect productivity.", topics: ["3.5"] }, // p18, 3.5.3
      { kind: "added", text: "Competitive markets, and the effect of having only one firm on price, quality, choice and profit.", topics: ["3.7"] }, // p18-19, 3.7.1-3.7.2
      { kind: "added", text: "Reasons for taxation, covered more explicitly.", topics: ["4.2"] }, // p20, 4.2.3
      { kind: "added", text: "Infrastructure spending as a supply-side policy.", topics: ["4.4"] }, // p20, 4.4.2
      { kind: "added", text: "Causes and consequences of recession.", topics: ["4.5"] }, // p21, 4.5.4
      { kind: "added", text: "Seasonal unemployment.", topics: ["4.6"] }, // p21, 4.6.3
      { kind: "added", text: "Better healthcare as a way to reduce poverty.", topics: ["5.2"] }, // p23, 5.2.3
      { kind: "added", text: "Definitions of specialisation by country and of free trade.", topics: ["6.1"] }, // p24, 6.1.1-6.1.2
      { kind: "added", text: "New topic: causes and consequences of changes in globalisation.", topics: ["6.2"], isNew: true }, // p24, 6.2.2
      { kind: "added", text: "Reasons for trade restrictions, and the case for and against restricting free trade.", topics: ["6.2"] }, // p25, 6.2.5-6.2.6
      { kind: "added", text: "Why people buy and sell foreign currencies, and definitions of floating exchange rate, appreciation and depreciation.", topics: ["6.3"] }, // p25, 6.3.2-6.3.3
      // 2281 p35, 0455 p35
      { kind: "reorganised", text: "Some topics have been reorganised and made smaller, and the order of some content has changed." },
      { kind: "reorganised", text: "Each topic now opens with a short explanation, wording is clearer, and the syllabus aims have been updated." },
    ],
    assessment: [
      // 2281 p36, 0455 p35
      { part: "Assessment objectives", text: "Reworded; Cambridge says they test most of the same knowledge and skills. Evaluation (AO3) now carries less weight; knowledge and understanding (AO1) and analysis (AO2) carry more." },
      // 2281 p36, 0455 p35
      { part: "Paper 1", text: "Now 40 questions and 40 marks (was 30), in 1 hour (was 45 minutes)." },
      // 2281 p36, 0455 p36
      { part: "Paper 2", text: "Now 80 marks (was 90), in 2 hours (was 2 hours 15 minutes). Question 1 in Section A carries fewer marks. The mark scheme layout and wording have changed, but the marking criteria stay largely the same." },
    ],
    // 2281 p9, 0455 p9 (Assessment overview); "was" values from 2281 p36, 0455 p35-36
    papers: [
      { paper: "Paper 1", name: "Multiple Choice", duration: "1 hour", durationWas: "45 minutes", marks: "40", marksWas: "30", weight: "30%", change: "Ten more questions, 15 more minutes" },
      { paper: "Paper 2", name: "Structured Questions", duration: "2 hours", durationWas: "2 hours 15 minutes", marks: "80", marksWas: "90", weight: "70%", change: "Question 1 (Section A) carries fewer marks" },
    ],
    newTopics: [],
    oldPapers: {
      verdict: "Yes, with a few skips.",
      body: "Old 2281 and 0455 questions are filed under the new topic numbers, so most of your practice carries straight over. Skip any old question on the removed list above. Old Paper 1s have 30 questions and old Paper 2s are out of 90; the 2027 papers are 40 questions and 80 marks.",
    },
    reading: [
      { href: "/blog/o-level-economics-2281-syllabus-2027-changes", label: "2281 for 2027: what changes and what to do about it" },
      { href: "/blog/igcse-economics-0455-syllabus-2027-changes", label: "0455 for 2027: every change listed" },
      { href: "/blog/2281-0455-specimen-paper-2027", label: "The 2027 specimen paper, question by question" },
    ],
  },
];

/** The past-paper syllabus a 2027 code's old questions live under (7081 → 7115). */
export const pastPapersFor = (code: string): PastPaperSyllabus | null =>
  PAST_PAPER_SYLLABI.find((p) => p.code === code || p.next?.code === code) ?? null;

export const subtopicName = (code: string, num: string) =>
  syllabusByCode(code)?.topics.flatMap((t) => t.subs).find((s) => s.num === num)?.name ?? null;

export interface PracticeLink {
  code: string;
  level: string;
  /** Old questions filed under this topic. */
  count: number;
  href: string | null;
}

/** Changed subtopics, in syllabus order, with where to practise old questions on each. */
export function practiceRows(sc: SubjectChanges) {
  const nums = [...new Set(sc.content.flatMap((c) => c.topics ?? []))].sort((a, b) => {
    const [a1, a2] = a.split(".").map(Number);
    const [b1, b2] = b.split(".").map(Number);
    return a1 - b1 || a2 - b2;
  });
  return nums.map((num) => ({
    num,
    name: subtopicName(sc.courses[0].code, num) ?? num,
    isNew: sc.newTopics.includes(num),
    links: sc.courses.map((c): PracticeLink => {
      const pp = pastPapersFor(c.code);
      const count = pp ? (topicalFor(pp.code).find((e) => e.sub.num === num)?.questions.length ?? 0) : 0;
      return { code: pp?.code ?? c.code, level: c.level, count, href: topicalHrefFor(c.code, num) };
    }),
  }));
}
