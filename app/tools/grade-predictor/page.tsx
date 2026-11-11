import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/JsonLd";
import { GradePredictor } from "@/components/landing/GradePredictor";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { RelatedLinks } from "@/components/study/RelatedLinks";
import { breadcrumbLd, toolLd, fitTitle } from "@/lib/seo";

const title = "Free Grade Predictor: O Level, IGCSE and A Level";
const description =
  "Free Cambridge grade predictor for O Level, IGCSE, AS and A Level Accounting, Business and Economics, using the official June 2026 and June 2025 grade thresholds.";

export const metadata: Metadata = {
  title: fitTitle(title),
  description,
  alternates: { canonical: "/tools/grade-predictor" },
  openGraph: { title, description, url: "/tools/grade-predictor", type: "website", images: ["/opengraph-image"] },
  twitter: { card: "summary_large_image", title, description, images: ["/opengraph-image"] },
};


export default function GradePredictorPage() {
  return (
    <MarketingShell>
      <JsonLd data={toolLd()} />
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Free tools", path: "/tools" },
          { name: "Grade predictor", path: "/tools/grade-predictor" },
        ])}
      />

      <section className="pb-16 pt-14 md:pb-24 md:pt-20">
        <div className="mx-auto max-w-6xl px-5 text-center">
          <nav aria-label="Breadcrumb" className="text-sm text-faint">
            <Link href="/" className="hover:text-gold">Home</Link>
            <span aria-hidden className="mx-2">/</span>
            <Link href="/tools" className="hover:text-gold">Free tools</Link>
            <span aria-hidden className="mx-2">/</span>
            <span aria-current="page" className="text-muted-foreground">Grade predictor</span>
          </nav>
          <h1 className="mx-auto mt-8 max-w-[18ch] text-4xl font-bold leading-[1.05] tracking-tight text-foreground md:text-6xl">
            Where would your mock marks land you?
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground">
            Pick your subject, enter your marks, and see the grade Cambridge would have given you, plus the marks
            you need for May / June 2027.
          </p>
          <div className="mt-12 text-left">
            <GradePredictor />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-5 pb-20">
        <RelatedLinks
          className="mt-0"
          links={[
            { href: "/grade-thresholds", label: "Cambridge grade thresholds" },
            { href: "/blog/cambridge-grade-thresholds-explained", label: "Cambridge grade thresholds explained" },
            { href: "/blog/a-level-a-star-marks-9706-9708-9609", label: "Marks for an A* in A Level Accounting, Business and Economics" },
            { href: "/past-papers", label: "Past papers with mark schemes" },
          ]}
        />
      </div>
    </MarketingShell>
  );
}
