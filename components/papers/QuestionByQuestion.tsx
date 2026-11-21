import Link from "next/link";
import type { QuestionRow } from "@/lib/paper-seo";

const link =
  "text-foreground underline decoration-hairline-strong underline-offset-4 transition-colors duration-150 hover:text-gold hover:decoration-gold focus-visible:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

const answerText = (a: string) => (a === "-" ? "Removed" : a === "*" ? "Any (mark given to all)" : a);

/**
 * "Question by question": each question on the paper with the syllabus topic it
 * tests, linked to that topic's question page. Multiple choice papers also get
 * the answer key from the mark scheme, folded away so it does not spoil a timed
 * attempt. Renders nothing without data. Server component, no client script.
 */
export function QuestionByQuestion({ rows, code }: { rows: QuestionRow[]; code: string }) {
  if (!rows.length) return null;
  const tagged = rows.some((r) => r.topics.length);
  const answers = rows.filter((r) => r.answer);
  return (
    <section aria-labelledby="qbq-h" className="mt-14 max-w-[70ch]">
      <h2 id="qbq-h" className="text-lg font-semibold text-foreground">
        Question by question
      </h2>
      {tagged && (
        <>
          <p className="mt-1 text-sm text-muted-foreground">
            The syllabus topic each question on {code} tests. Tap a topic for every past paper question on it.
          </p>
          <table className="mt-4 w-full border-collapse text-left text-sm">
            <caption className="sr-only">Questions in {code} and the topics they test</caption>
            <thead>
              <tr className="border-b border-hairline text-xs text-faint">
                <th scope="col" className="w-14 py-2 pr-3 font-semibold">
                  Question
                </th>
                <th scope="col" className="py-2 font-semibold">
                  Topic
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((r) => (
                <tr key={r.n}>
                  <th scope="row" className="py-2.5 pr-3 align-top font-semibold tabular-nums text-foreground">
                    {r.n}
                  </th>
                  <td className="py-2.5 align-top leading-relaxed text-muted-foreground">
                    {r.topics.length ? (
                      r.topics.map((t, i) => (
                        <span key={t.href}>
                          {i > 0 && <span className="text-faint"> and </span>}
                          <Link href={t.href} className={link}>
                            {t.name}
                          </Link>
                          <span className="ml-1.5 text-xs tabular-nums text-faint">{t.num}</span>
                        </span>
                      ))
                    ) : (
                      <span className="text-faint">Not tagged yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {answers.length > 0 && (
        <details className="pc-surface group mt-6 rounded-card px-5 py-1 open:pb-5">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
            Answer key ({answers.length} questions)
            <span aria-hidden className="text-lg text-faint transition-transform duration-200 group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-1 text-sm text-muted-foreground">From the {code} mark scheme. Try the paper first, then check.</p>
          <ol className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 text-sm">
            {answers.map((r) => (
              <li key={r.n} className="flex items-baseline justify-between gap-2 rounded-tile border border-hairline px-2.5 py-1.5">
                <span className="tabular-nums text-faint">{r.n}</span>
                <span className="font-semibold text-foreground" title={r.answer === "-" || r.answer === "*" ? answerText(r.answer!) : undefined}>
                  {r.answer === "-" ? "None" : r.answer === "*" ? "Any" : r.answer}
                  {(r.answer === "-" || r.answer === "*") && <span className="sr-only"> ({answerText(r.answer)})</span>}
                </span>
              </li>
            ))}
          </ol>
          {answers.some((r) => r.answer === "-" || r.answer === "*") && (
            <p className="mt-3 text-xs text-faint">None: question removed by Cambridge. Any: mark given to everyone.</p>
          )}
        </details>
      )}
    </section>
  );
}
