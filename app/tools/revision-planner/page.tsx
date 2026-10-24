import type { Metadata } from "next";
import { RevisionPlanner } from "@/components/tools/RevisionPlanner";
import { ToolShell } from "@/components/tools/ToolShell";
import { fitTitle } from "@/lib/seo";

const title = "Revision Planner for O Level, IGCSE and A Level";
const description =
  "Free revision timetable built from the real Cambridge syllabus: your subjects, your exam date and your weak topics, week by week, with a past paper phase.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/tools/revision-planner" },
  openGraph: { title, description, url: "/tools/revision-planner", type: "website", images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "How does it know my weak topics?",
    a: "From the syllabus checklists. Mark each subtopic Not sure or Confident there, on the same device, and the planner puts your Not sure topics first and gives Confident ones only a quick check.",
  },
  {
    q: "Why save the last weeks for past papers?",
    a: "Knowing the topics and scoring in the exam are different skills. Timed full papers, marked strictly, show where marks are lost on technique and timing, and leave time to fix it.",
  },
  {
    q: "How many hours a week should I study?",
    a: "Enough to finish the topic list before the past paper weeks start. If week one looks crowded, add hours or start earlier. Consistent short sessions beat a few long ones.",
  },
  {
    q: "Is my plan saved?",
    a: "Your checklist ratings are saved on your device. Print the plan or save it as a PDF to keep it.",
  },
];

type Props = { searchParams: Promise<{ s?: string }> };

export default async function RevisionPlannerPage({ searchParams }: Props) {
  const { s } = await searchParams;
  return (
    <ToolShell
      slug="revision-planner"
      name="Revision planner"
      h1="Revision planner"
      intro="Your subjects, your first exam date and your weak topics turned into a week-by-week plan, using every subtopic of the real Cambridge syllabus."
      subject="Economics"
      level="O Level / IGCSE"
      faq={FAQ}
      related={[
        { href: "/syllabus", label: "Syllabus checklists: rate your topics first" },
        { href: "/grade-thresholds", label: "Grade thresholds: the marks you need" },
      ]}
      how={
        <div className="space-y-3 text-[17px] leading-relaxed text-body">
          <p>The weeks up to your first exam are split in three. First, every subtopic of your syllabuses, weak ones first and your subjects mixed so none is left to the end. Then about a third of the time for full past papers. Then a final week on the latest papers and your weakest topics.</p>
          <p>Topics you marked Not sure get the most time, ones you have not rated get normal time, and Confident ones get a quick check.</p>
        </div>
      }
    >
      <RevisionPlanner initial={s && /^\d{4}$/.test(s) ? s : undefined} />
    </ToolShell>
  );
}
