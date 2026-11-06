import type { Metadata } from "next";
import { ExamCountdown } from "@/components/tools/ExamCountdown";
import { ToolShell } from "@/components/tools/ToolShell";
import { SYLLABI } from "@/lib/syllabus";
import { EXAMS } from "@/lib/study-plan";
import { fitTitle } from "@/lib/seo";

const title = "Exam Countdown for O Level, IGCSE and A Level 2027";
const description =
  "How many days until your Cambridge exam? Pick your syllabus and paper date, see the days left and the weekly pace that finishes the syllabus before past paper weeks.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/tools/exam-countdown" },
  openGraph: { title, description, url: "/tools/exam-countdown", type: "website", images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: `When do the ${EXAMS.name} exams start?`,
    a: "The countdown starts from the first day of the series. Your own papers may be later: check the date of each paper on your statement of entry, or the Cambridge timetable for your syllabus, and set it here.",
  },
  {
    q: "What is a subtopic?",
    a: "The numbered points inside each topic of the Cambridge syllabus, such as 2.3 Price elasticity of demand. The count comes from the full syllabus checklist on this site.",
  },
  {
    q: "Why leave weeks for past papers?",
    a: "Knowing the content and scoring in the exam are different skills. Timed papers, marked with the mark scheme, show where marks go on technique and timing, and leave time to fix it.",
  },
];

type Props = { searchParams: Promise<{ s?: string; d?: string }> };

export default async function ExamCountdownPage({ searchParams }: Props) {
  const { s, d } = await searchParams;
  const syllabi = SYLLABI.map((x) => ({ code: x.code, name: x.name, subs: x.topics.reduce((n, t) => n + t.subs.length, 0) }));
  return (
    <ToolShell
      slug="exam-countdown"
      name="Exam countdown"
      h1="Exam countdown"
      intro="Days until your Cambridge exam, and the weekly pace that finishes your syllabus with time left for past papers. Share it with your class."
      subject="Accounting"
      level="O Level / IGCSE"
      faq={FAQ}
      related={[
        { href: "/tools/revision-planner", label: "Revision planner: turn the days into a weekly plan" },
        { href: "/past-papers", label: "Past papers 2022 to 2026, with mark schemes" },
        { href: "/grade-thresholds", label: "Grade thresholds: the marks you need" },
      ]}
      how={
        <div className="space-y-3 text-[17px] leading-relaxed text-body">
          <p>
            The countdown runs to the day of your paper. The pace assumes you finish learning new content before the past paper weeks start ({new Date(`${EXAMS.pastPapersFrom}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}, or four weeks before your paper if that is sooner) and splits your syllabus&apos;s subtopics evenly across the weeks left.
          </p>
        </div>
      }
    >
      <ExamCountdown syllabi={syllabi} seriesName={EXAMS.name} seriesStart={EXAMS.start} papersFrom={EXAMS.pastPapersFrom} initial={{ code: s, date: d }} />
    </ToolShell>
  );
}
