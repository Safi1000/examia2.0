import type { Metadata } from "next";
import { DepreciationCalculator } from "@/components/tools/DepreciationCalculator";
import { ToolShell } from "@/components/tools/ToolShell";
import { fitTitle } from "@/lib/seo";

const title = "Depreciation Calculator: Straight Line, Reducing Balance";
const description = "Free depreciation calculator for IGCSE, O Level and A Level Accounting: a year-by-year schedule for straight line and reducing balance depreciation.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/tools/depreciation-calculator" },
  openGraph: { title, description, url: "/tools/depreciation-calculator", type: "website", images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "Why does reducing balance never reach zero?",
    a: "Each year takes a percentage of what is left, so a little always remains. That is why it suits assets that lose most of their value early, like vehicles.",
  },
  {
    q: "Does residual value affect reducing balance?",
    a: "Not in the calculation. The rate is applied to the net book value each year; residual value is used in straight line.",
  },
  {
    q: "What about part years?",
    a: "If the business charges depreciation by the month, multiply the yearly charge by the months owned \u00f7 12. The question will say which policy to use.",
  },
];

export default function Page() {
  return (
    <ToolShell
      slug="depreciation-calculator"
      name="Depreciation calculator"
      h1="Depreciation calculator"
      intro="A year-by-year schedule of the depreciation charge, accumulated depreciation and net book value, for straight line or reducing balance."
      subject="Accounting"
      level="O Level / IGCSE"
      faq={FAQ}
      related={[{ href: "/blog/a-level-accounting-depreciation-questions", label: "A Level Accounting depreciation questions, worked" }, { href: "/blog/igcse-o-level-accounting-formats", label: "Every accounting format you need" }]}
      how={
        <div className="space-y-3 text-[17px] leading-relaxed text-body">
          <p>Straight line: (cost − residual value) ÷ useful life, the same charge every year. Reducing balance: rate × net book value at the start of the year, so the charge falls each year.</p>
          <p>Accumulated depreciation is the total charged so far. Net book value (called carrying amount at A Level) is cost minus accumulated depreciation, and is what goes on the statement of financial position.</p>
        </div>
      }
    >
      <DepreciationCalculator />
    </ToolShell>
  );
}
