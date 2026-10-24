import type { Metadata } from "next";
import { InvestmentCalculator } from "@/components/tools/InvestmentCalculator";
import { ToolShell } from "@/components/tools/ToolShell";
import { fitTitle } from "@/lib/seo";

const title = "Investment Appraisal Calculator: Payback, ARR, NPV";
const description = "Free investment appraisal calculator for A Level Business 9609: payback period, accounting rate of return and net present value for any project.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/tools/investment-appraisal-calculator" },
  openGraph: { title, description, url: "/tools/investment-appraisal-calculator", type: "website", images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "What is a good payback period?",
    a: "There is no fixed answer. Compare it with the business's own target and with other projects, and mention risk: a shorter payback means the money is at risk for less time.",
  },
  {
    q: "Why do the NPV figures differ slightly from my mark scheme?",
    a: "Exam questions give discount factors rounded to two or three decimal places. Using those exact factors in the paper is what earns the marks.",
  },
  {
    q: "Which is the best method?",
    a: "Each has a weakness: payback ignores cash after the payback point, ARR ignores timing, NPV depends on the chosen discount rate. The best answers use more than one and add non-financial factors.",
  },
];

export default function Page() {
  return (
    <ToolShell
      slug="investment-appraisal-calculator"
      name="Investment appraisal calculator"
      h1="Investment appraisal calculator: payback, ARR and NPV"
      intro="Enter the investment and the cash inflows each year. You get payback, the accounting rate of return and net present value, each with the method behind it."
      subject="Business"
      level="AS Level"
      faq={FAQ}
      related={[{ href: "/blog/a-level-business-9609-investment-appraisal", label: "Investment appraisal worked example (9609)" }, { href: "/grade-thresholds/a-level-business-9609", label: "A Level Business 9609 grade thresholds" }]}
      how={
        <div className="space-y-3 text-[17px] leading-relaxed text-body">
          <p>Payback adds up the yearly inflows until they cover the investment; the part year is (amount still needed ÷ that year&apos;s inflow) × 12 months.</p>
          <p>ARR = average annual profit ÷ average investment × 100. Average profit = (total inflows − (cost − residual value)) ÷ years. Average investment = (cost + residual value) ÷ 2.</p>
          <p>NPV discounts each year&apos;s inflow by (1 + r) to the power of the year, adds them, and subtracts the investment. In the exam you will usually be given discount factors: use those.</p>
        </div>
      }
    >
      <InvestmentCalculator />
    </ToolShell>
  );
}
