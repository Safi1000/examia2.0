import { allArticles } from "@/lib/blog";
import { FAQS, LANDING } from "@/lib/landing";
import { PAPERS } from "@/lib/mcq-papers";
import { absolute } from "@/lib/seo";

/**
 * /llms.txt: a plain summary of the site for AI assistants (ChatGPT, Claude,
 * Perplexity, Google's AI answers), in the llmstxt.org format. Built from the
 * same data as the pages, so new articles appear here on their own.
 */
export const dynamic = "force-static";

export async function GET() {
  const articles = await allArticles();

  const body = `# Hamza Teaches

> Live online small-group tuition in Accounting, Business and Economics for Cambridge O Level, IGCSE, AS Level and A Level students, taught by Hamza Sadaqat. Classes run on Google Meet or Zoom with cameras on. The first lesson is a free trial, booked on WhatsApp.

Key facts:
- Teacher: Hamza Sadaqat, ACCA Affiliate, who got straight A's in these same subjects and teaches every class personally. 100+ students taught over 4+ years.
- Subjects: Accounting, Business Studies, Economics.
- Syllabuses: Cambridge IGCSE Accounting 0452, Business 0264 (replaces Business Studies 0450 from 2027 exams), Economics 0455; Cambridge O Level Accounting 7707, Business 7081 (replaces Business Studies 7115 from June 2027), Economics 2281; Cambridge International AS & A Level Accounting 9706, Business 9609, Economics 9708.
- Format: live online classes in small groups, every class recorded, weekly tests marked by Hamza, and a personal student portal for notes, tests and marks.
- Current session: preparing students for the May/June 2027 Cambridge exams.
- Fees: shared privately on WhatsApp; they depend on level and number of subjects.
- Based in Rawalpindi, Pakistan; teaches students online.
- Contact: WhatsApp from the website, Instagram ${LANDING.instagram}, YouTube ${LANDING.youtube}, email ${LANDING.email}.

## Main pages

- [Home](${absolute("/")}): how the classes work, student reviews, and booking the free trial lesson.
- [Grade predictor](${absolute("/tools/grade-predictor")}): free tool. Enter your marks and see your likely Cambridge grade using official grade thresholds, plus what to work on for May/June 2027.
${PAPERS.length ? `- [Past paper MCQ checker](${absolute("/tools/past-paper-mcq")}): free tool. Do a real Cambridge Paper 1 multiple-choice past paper (Accounting or Economics, IGCSE, O Level, AS or A Level) from the official PDF, then mark it instantly with a timer and a topic breakdown.\n` : ""}- [The Exam Room](${absolute("/blog")}): free articles on topics and exam technique.
- [Syllabus checklists](${absolute("/syllabus")}): the full Cambridge syllabus for O Level, IGCSE and A Level Accounting, Business and Economics (2027 exams), as an interactive checklist, plus a revision planner built from it.
- [Free tools](${absolute("/tools")}): accounting ratio, break-even, elasticity (PED, YED, XED), depreciation and investment appraisal calculators, each with the working.
- [Grade thresholds](${absolute("/grade-thresholds")}): official Cambridge grade thresholds for O Level, IGCSE, AS and A Level Accounting, Business and Economics, every variant, with 2027 targets.
- [Private candidate guide, Pakistan](${absolute("/private-candidates/pakistan")}): how to enter Cambridge exams through the British Council without a school, deadlines and a study plan.
- [Online classes](${absolute("/online-classes")}): live online classes for students in Pakistan, with pages for Karachi, Lahore and Islamabad / Rawalpindi.
- [Online classes for Gulf students](${absolute("/online-classes/gulf")}): the same live classes for students in the UAE, Saudi Arabia, Qatar, Oman, Kuwait and Bahrain, with class times in local time and pages for Dubai, Abu Dhabi, Riyadh, Jeddah and Doha.
- [Private candidate guide, UAE](${absolute("/private-candidates/uae")}): how to enter Cambridge exams through the British Council in the UAE, documents, the No Objection Certificate and deadlines.
- [Private candidate guide, Saudi Arabia](${absolute("/private-candidates/saudi-arabia")}): how private candidates enter Cambridge exams through the British Council in Saudi Arabia.

## Articles

${articles.map((a) => `- [${a.title}](${absolute(`/blog/${a.slug}`)}): ${a.description}`).join("\n")}

## Common questions

${FAQS.map((f) => `- ${f.q} ${f.a}`).join("\n")}

## Optional

- [Privacy policy](${absolute("/privacy")})
- [Terms](${absolute("/terms")})
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
