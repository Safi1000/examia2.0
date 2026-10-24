import type { Metadata } from "next";
import { RatioCalculator } from "@/components/tools/RatioCalculator";
import { ToolShell } from "@/components/tools/ToolShell";
import { fitTitle } from "@/lib/seo";

const title = "Accounting Ratio Calculator (IGCSE 0452, O Level 7707)";
const description =
  "Free accounting ratio calculator using Cambridge's own formulas: gross margin, profit margin, ROCE, current and acid test ratios, inventory, receivables and payables.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/tools/ratio-calculator" },
  openGraph: { title, description, url: "/tools/ratio-calculator", type: "website", images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "Which profit do I use for ROCE?",
    a: "Net profit before interest, divided by capital employed, times 100. Capital employed is issued shares plus reserves plus non-current liabilities; for a sole trader, capital plus non-current liabilities.",
  },
  {
    q: "Is inventory turnover in days or times?",
    a: "In the IGCSE and O Level syllabus it is in times: cost of goods sold divided by average inventory, where average inventory is opening plus closing inventory divided by two.",
  },
  {
    q: "What is the difference between margin and mark-up?",
    a: "Both use gross profit. Margin divides it by revenue, mark-up divides it by cost of sales. A 25% mark-up is a 20% margin.",
  },
  {
    q: "What is a good current ratio?",
    a: "There is no single right answer in the exam. Explain what the figure shows, compare it with last year or another business, and say whether the business can pay its short-term debts.",
  },
];

export default function RatioCalculatorPage() {
  return (
    <ToolShell
      slug="ratio-calculator"
      name="Accounting ratio calculator"
      h1="Accounting ratio calculator"
      intro="Every ratio in the IGCSE 0452 and O Level 7707 syllabus, using Cambridge's own formulas, with what each answer means. Fill in the figures you have."
      subject="Accounting"
      level="O Level / IGCSE"
      faq={FAQ}
      related={[
        { href: "/blog/igcse-o-level-accounting-formats", label: "Every accounting format you need (0452 and 7707)" },
        { href: "/grade-thresholds/o-level-accounting-7707", label: "O Level Accounting 7707 grade thresholds" },
      ]}
      how={
        <div className="space-y-3 text-[17px] leading-relaxed text-body">
          <p>These are the formulas from the accounting ratios appendix of the Cambridge IGCSE Accounting 0452 syllabus, which O Level 7707 shares:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Gross margin = gross profit ÷ revenue × 100</li>
            <li>Mark-up = gross profit ÷ cost of sales × 100</li>
            <li>Profit margin = profit for the year ÷ revenue × 100</li>
            <li>ROCE = net profit before interest ÷ capital employed × 100</li>
            <li>Current ratio = current assets ÷ current liabilities</li>
            <li>Liquid (acid test) ratio = (current assets − inventory) ÷ current liabilities</li>
            <li>Rate of inventory turnover = cost of goods sold ÷ average inventory (times)</li>
            <li>Trade receivables turnover = trade receivables ÷ credit sales × 365 (days)</li>
            <li>Trade payables turnover = trade payables ÷ credit purchases × 365 (days)</li>
          </ul>
          <p>In the exam, show the formula, then the figures, then the answer with its unit (%, : 1, times or days). Then say what it means.</p>
        </div>
      }
    >
      <RatioCalculator />
    </ToolShell>
  );
}
