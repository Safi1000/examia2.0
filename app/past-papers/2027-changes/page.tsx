import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { JsonLd } from "@/components/JsonLd";
import { MarketingShell } from "@/components/landing/MarketingShell";
import { Crumbs, TrialBox } from "@/components/study/StudyBits";
import { PastPapersNav } from "@/components/past-papers/Bits";
import { searchName } from "@/lib/past-papers";
import { syllabusByCode } from "@/lib/syllabus";
import { SYLLABUS_CHANGES_2027, pastPapersFor, practiceRows, type ChangeKind, type SubjectChanges } from "@/lib/syllabus-changes-2027";
import { breadcrumbLd, fitTitle } from "@/lib/seo";
import "@/components/landing/public-calm.css";

const URL = "/past-papers/2027-changes";
const title = "2027 Cambridge syllabus changes and old past papers";
const description =
  "Every change Cambridge made for 2027 in O Level and IGCSE Accounting, Business and Economics, and how to keep using old past papers, topic by topic.";

export const metadata: Metadata = {
  title: { absolute: fitTitle(title) },
  description,
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL, type: "website", images: ["/opengraph-image"] },
};

const KIND_LABEL: Record<ChangeKind, string> = {
  added: "Added",
  removed: "Removed or cut back",
  reorganised: "Moved, renamed or reworded",
};

const link =
  "font-semibold text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:decoration-foreground";

function NewTag({ children = "New" }: { children?: string }) {
  return <span className="ml-2 inline-block rounded-full border border-gold/40 px-2 py-px align-[1px] text-xs font-semibold text-gold">{children}</span>;
}

function SubjectSection({ sc }: { sc: SubjectChanges }) {
  const rows = practiceRows(sc);
  const [a, b] = sc.courses;
  return (
    <section aria-labelledby={`${sc.id}-h`} className="mt-16 scroll-mt-24 border-t border-hairline pt-10">
      {/* Anchors for each code: /past-papers/2027-changes#7081 and #0264 land here. */}
      <span id={a.code} className="block scroll-mt-24" />
      <span id={b.code} className="block scroll-mt-24" />
      <h2 id={`${sc.id}-h`} className="text-2xl font-bold leading-tight text-foreground md:text-3xl">
        {sc.subject}: <span className="tabular-nums">{a.code}</span> and <span className="tabular-nums">{b.code}</span>
      </h2>
      <p className="mt-3 max-w-[64ch] text-base leading-relaxed text-muted-foreground">
        {sc.codeChange ? `${sc.codeChange} ` : ""}First exams in 2027. {sc.series}
      </p>

      <h3 className="mt-10 text-xl font-bold text-foreground">What changed</h3>
      {(["added", "removed", "reorganised"] as const).map((kind) => {
        const items = sc.content.filter((c) => c.kind === kind);
        if (!items.length) return null;
        return (
          <div key={kind} className="mt-6">
            <h4 className="text-sm font-semibold text-muted-foreground">{KIND_LABEL[kind]}</h4>
            <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
              {items.map((c) => (
                <li key={c.text} className="flex gap-3 py-3 text-base leading-relaxed text-body">
                  <span className="w-12 shrink-0 pt-px text-sm tabular-nums text-faint">{c.topics?.join(", ") ?? ""}</span>
                  <span className="min-w-0 flex-1">
                    {c.text}
                    {c.isNew && <NewTag />}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      <div className="mt-6">
        <h4 className="text-sm font-semibold text-muted-foreground">Exams and marking</h4>
        <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
          {sc.assessment.map((x) => (
            <li key={x.part} className="flex flex-col gap-1 py-3 sm:flex-row sm:gap-3">
              <span className="shrink-0 text-sm font-semibold text-foreground sm:w-44 sm:pt-0.5">{x.part}</span>
              <span className="min-w-0 flex-1 text-base leading-relaxed text-body">{x.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <h3 className="mt-10 text-xl font-bold text-foreground">The 2027 papers</h3>
      <p className="mt-2 text-sm text-faint">The same for {a.level} {a.code} and {b.level} {b.code}.</p>
      {/* A table on wider screens; on a phone each row stacks into its own card, so nothing scrolls sideways. */}
      <table className="mt-4 w-full border-collapse text-left text-base">
        <caption className="sr-only">
          {sc.subject} {a.code} and {b.code} papers from 2027
        </caption>
        <thead className="sr-only md:not-sr-only">
          <tr className="border-b border-hairline">
            {["Paper", "Length", "Marks", "Weighting", "What is different"].map((h) => (
              <th key={h} scope="col" className="px-3 py-3 text-sm font-semibold text-muted-foreground first:pl-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="block space-y-3 md:table-row-group md:space-y-0">
          {sc.papers.map((p) => (
            <tr key={p.paper} className="block rounded-tile border border-hairline px-4 py-3 md:table-row md:rounded-none md:border-0 md:border-b md:px-0 md:py-0">
              <th scope="row" className="block pb-2 font-semibold text-foreground md:table-cell md:py-4 md:pr-3 md:align-top">
                {p.paper}
                <span className="block text-sm font-normal text-muted-foreground">{p.name}</span>
              </th>
              <Cell label="Length">
                {p.duration}
                {p.durationWas && <span className="block text-sm text-faint">was {p.durationWas}</span>}
              </Cell>
              <Cell label="Marks">
                {p.marks}
                {p.marksWas && <span className="block text-sm text-faint">was {p.marksWas}</span>}
              </Cell>
              <Cell label="Weighting">{p.weight}</Cell>
              <Cell label="What is different">{p.change}</Cell>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mt-10 text-xl font-bold text-foreground">Can I still use old past papers?</h3>
      <p className="mt-3 max-w-[64ch] text-base leading-relaxed text-body">
        <strong className="font-semibold text-foreground">{sc.oldPapers.verdict}</strong> {sc.oldPapers.body}
      </p>

      <h4 className="mt-6 text-sm font-semibold text-muted-foreground">Practise the changed topics with old questions</h4>
      <ul className="mt-2 divide-y divide-hairline border-y border-hairline">
        {rows.map((r) => (
          <li key={r.num} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-baseline sm:gap-3">
            <span className="flex min-w-0 flex-1 gap-3">
              <span className="w-10 shrink-0 text-sm tabular-nums text-faint">{r.num}</span>
              <span className="min-w-0 text-base font-semibold text-foreground">
                {r.name}
                {r.isNew && <NewTag>New: few or no past questions yet</NewTag>}
              </span>
            </span>
            <span className="flex shrink-0 flex-wrap gap-x-5 gap-y-1 pl-[3.25rem] text-sm sm:pl-0">
              {r.links.map((l) =>
                l.href ? (
                  <Link key={l.code} href={l.href} className={`inline-flex min-h-11 items-center sm:min-h-0 ${link}`}>
                    {l.level} {l.code}: {l.count} {l.count === 1 ? "question" : "questions"}
                  </Link>
                ) : (
                  <span key={l.code} className="inline-flex min-h-11 items-center text-faint sm:min-h-0">
                    {l.level} {l.code}: none yet
                  </span>
                ),
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col gap-2 text-base">
        {sc.courses.map((c) => {
          const pp = pastPapersFor(c.code);
          return pp ? (
            <Link key={c.code} href={`/past-papers/${pp.slug}`} className={`inline-flex min-h-11 w-fit items-center ${link}`}>
              All {searchName(pp)} past papers
            </Link>
          ) : null;
        })}
      </div>

      <div className="mt-6">
        <h4 className="text-sm font-semibold text-muted-foreground">Read more</h4>
        <ul className="mt-2 space-y-1 text-base">
          {sc.reading.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className="inline-flex min-h-11 items-center text-muted-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:text-foreground">
                {r.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <td className="flex gap-3 py-1 text-body md:table-cell md:px-3 md:py-4 md:align-top">
      <span className="w-24 shrink-0 text-sm text-faint md:hidden">{label}</span>
      <span className="min-w-0 flex-1 tabular-nums">{children}</span>
    </td>
  );
}

export default function Changes2027() {
  const all = SYLLABUS_CHANGES_2027.flatMap((sc) => sc.courses.map((c) => ({ ...c, subject: sc.subject })));
  return (
    <MarketingShell>
      <JsonLd
        data={breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Past papers", path: "/past-papers" },
          { name: "2027 changes", path: URL },
        ])}
      />
      <div className="mx-auto max-w-3xl px-5 pb-20 pt-8 md:pt-12">
        <PastPapersNav className="w-fit max-w-full" />
        <div className="mt-8">
          <Crumbs trail={[{ name: "Home", href: "/" }, { name: "Past papers", href: "/past-papers" }, { name: "2027 changes" }]} />
        </div>
        <h1 className="mt-4 text-4xl font-bold leading-[1.06] tracking-tight text-foreground md:text-5xl">What changed for 2027</h1>
        <p className="mt-4 max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
          Six Cambridge O Level and IGCSE syllabuses change for exams from 2027. Here is every change Cambridge lists, in plain words, and how to keep using the old past papers.
        </p>

        <section aria-labelledby="short-h" className="mt-10">
          <h2 id="short-h" className="text-sm font-semibold text-muted-foreground">
            In short
          </h2>
          <ul className="pc-surface mt-3 divide-y divide-hairline overflow-hidden rounded-card">
            {all.map((c) => (
              <li key={c.code}>
                <a href={`#${c.code}`} className="group flex flex-col gap-1 px-5 py-4 transition-colors duration-150 hover:bg-white/[0.04] sm:flex-row sm:gap-4">
                  <span className="shrink-0 text-base font-bold text-foreground sm:w-48">
                    {c.level} {c.subject} <span className="tabular-nums text-gold">{c.code}</span>
                  </span>
                  <span className="min-w-0 flex-1 text-base leading-relaxed text-muted-foreground group-hover:text-body">{c.summary}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        {SYLLABUS_CHANGES_2027.map((sc) => (
          <SubjectSection key={sc.id} sc={sc} />
        ))}

        <section aria-labelledby="src-h" className="mt-16 border-t border-hairline pt-6">
          <h2 id="src-h" className="text-sm font-semibold text-muted-foreground">
            Where this comes from
          </h2>
          <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-faint">
            Every change above is taken from the &lsquo;Changes to this syllabus&rsquo; pages and assessment overviews of Cambridge International&apos;s own syllabuses for 2027, 2028 and 2029. Cambridge asks
            teachers to read the whole syllabus before planning. The syllabuses:{" "}
            {all.map((c, i) => {
              const syl = syllabusByCode(c.code);
              return (
                <span key={c.code}>
                  {syl ? (
                    <a href={syl.source} className="underline decoration-hairline-strong underline-offset-4 hover:text-foreground" rel="noopener" target="_blank">
                      {c.code}
                    </a>
                  ) : (
                    c.code
                  )}
                  {i < all.length - 1 ? ", " : "."}
                </span>
              );
            })}
          </p>
        </section>

        <TrialBox
          from="2027-changes"
          title="New syllabus. Same marks to win."
          body="Old papers show you where the marks go missing. In class, that is exactly what we fix. One free lesson to see if it clicks."
        />
      </div>
    </MarketingShell>
  );
}
