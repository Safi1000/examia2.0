import type { Metadata } from "next";
import { BreakEvenCalculator } from "@/components/tools/BreakEvenCalculator";
import { ToolShell } from "@/components/tools/ToolShell";
import { fitTitle } from "@/lib/seo";

const title = "Break-Even Calculator for Business Students";
const description = "Free break-even calculator for IGCSE, O Level and A Level Business: break-even output and revenue, contribution per unit, margin of safety and profit.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/tools/break-even-calculator" },
  openGraph: { title, description, url: "/tools/break-even-calculator", type: "website", images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "Why round break-even output up?",
    a: "A business cannot sell part of a unit. 1,250.4 units means it needs to sell 1,251 to cover all its costs.",
  },
  {
    q: "What is the margin of safety?",
    a: "How far sales can fall before the business makes a loss: output minus break-even output. It can also be shown as a percentage of output.",
  },
  {
    q: "What are the limits of break-even analysis?",
    a: "It assumes every unit made is sold, that price and variable cost per unit stay the same at every output, and that costs can be split neatly into fixed and variable. Evaluation questions often ask about these.",
  },
];

export default function Page() {
  return (
    <ToolShell
      slug="break-even-calculator"
      name="Break-even calculator"
      h1="Break-even calculator"
      intro="Break-even output, contribution and margin of safety, with the working shown the way a Business mark scheme expects it."
      subject="Business"
      level="O Level / IGCSE"
      faq={FAQ}
      related={[{ href: "/blog/igcse-business-0450-justify-evaluate-questions", label: "How to answer IGCSE Business 'justify' questions" }, { href: "/grade-thresholds/igcse-business-0450", label: "IGCSE Business grade thresholds" }]}
      how={
        <div className="space-y-3 text-[17px] leading-relaxed text-body">
          <p>Contribution per unit = selling price − variable cost per unit. Break-even output = total fixed costs ÷ contribution per unit, rounded up to a whole unit. Break-even revenue = break-even output × selling price. Margin of safety = actual or planned output − break-even output.</p>
          <p>In the exam, always show the formula and the figures, then give the unit. If you draw a break-even chart, label fixed costs, total costs, revenue, the break-even point and the margin of safety.</p>
        </div>
      }
    >
      <BreakEvenCalculator />
    </ToolShell>
  );
}
