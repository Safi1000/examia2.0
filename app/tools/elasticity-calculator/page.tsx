import type { Metadata } from "next";
import { ElasticityCalculator } from "@/components/tools/ElasticityCalculator";
import { ToolShell } from "@/components/tools/ToolShell";
import { fitTitle } from "@/lib/seo";

const title = "Elasticity Calculator: PED, YED and XED";
const description = "Free elasticity calculator for IGCSE, O Level and A Level Economics: price, income and cross elasticity of demand with the working and what it means.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/tools/elasticity-calculator" },
  openGraph: { title, description, url: "/tools/elasticity-calculator", type: "website", images: ["/opengraph-image"] },
};

const FAQ = [
  {
    q: "Is PED always negative?",
    a: "For almost every good, yes, because price and quantity demanded move in opposite directions. Many textbooks and mark schemes ignore the sign when they call a good elastic or inelastic.",
  },
  {
    q: "When does a price rise increase total revenue?",
    a: "When demand is price inelastic: quantity falls by a smaller percentage than price rises, so price \u00d7 quantity goes up.",
  },
  {
    q: "How do I tell substitutes from complements?",
    a: "With XED. A positive XED means substitutes (one gets dearer, people buy more of the other). A negative XED means complements.",
  },
];

export default function Page() {
  return (
    <ToolShell
      slug="elasticity-calculator"
      name="Elasticity calculator"
      h1="Elasticity calculator: PED, YED and XED"
      intro="Enter the figures before and after the change. You get the elasticity, the working, what the number means and, for PED, what happened to total revenue."
      subject="Economics"
      level="O Level / IGCSE"
      faq={FAQ}
      related={[{ href: "/blog/igcse-economics-price-elasticity-of-demand", label: "Price elasticity of demand explained (IGCSE 0455)" }, { href: "/blog/how-to-answer-igcse-o-level-economics-questions", label: "How to answer IGCSE and O Level Economics questions" }]}
      how={
        <div className="space-y-3 text-[17px] leading-relaxed text-body">
          <p>Each elasticity is a percentage change in quantity demanded divided by a percentage change in something else. Percentage change = (new − old) ÷ old × 100.</p>
          <p>PED divides by the % change in the good&apos;s price, YED by the % change in income, XED by the % change in the price of another good. Keep the minus sign: for YED and XED the sign is the answer.</p>
        </div>
      }
    >
      <ElasticityCalculator />
    </ToolShell>
  );
}
