"use client";

/**
 * The end of every article: one question, "Did this answer your question?".
 * A yes ends on a good note and offers the next read. A "not quite" asks why,
 * in one tap. Each answer is sent as an event (article_feedback), so the
 * articles that fail readers can be found and fixed. Asked once per article
 * per browser.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "@/lib/landing";

const REASONS = ["Too long", "Hard to follow", "Missing what I needed", "I found a mistake"];
const KEY = (slug: string) => `exam-room:fb:${slug}`;

const pill =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-hairline-strong px-5 text-base font-semibold text-body transition-colors duration-150 hover:border-white/[0.28] hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

type Step = "ask" | "yes" | "why" | "thanks";

export function ArticleFeedback({ slug, next, askHref, shareHref }: { slug: string; next?: { href: string; title: string }; askHref: string; shareHref: string }) {
  const [step, setStep] = useState<Step>("ask");

  // A reader who already answered sees the quiet ending, not the question again.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const v = localStorage.getItem(KEY(slug));
        if (v === "yes") setStep("yes");
        else if (v) setStep("thanks");
      } catch {
        /* private mode */
      }
    }, 0);
    return () => window.clearTimeout(t);
  }, [slug]);

  const save = (v: string) => {
    try {
      localStorage.setItem(KEY(slug), v);
    } catch {
      /* private mode */
    }
  };

  return (
    <section aria-labelledby="fb-h" className="mt-14 rounded-card border border-hairline bg-card/60 p-5 text-center md:p-6">
      {step === "ask" && (
        <>
          <h2 id="fb-h" className="text-lg font-bold text-ink">
            Did this answer your question?
          </h2>
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              className={pill}
              onClick={() => {
                track("article_feedback", { slug, helpful: "yes" });
                save("yes");
                setStep("yes");
              }}
            >
              Yes
            </button>
            <button
              type="button"
              className={pill}
              onClick={() => {
                track("article_feedback", { slug, helpful: "no" });
                setStep("why");
              }}
            >
              Not quite
            </button>
          </div>
        </>
      )}

      {step === "yes" && (
        <>
          <h2 id="fb-h" className="text-lg font-bold text-ink">
            Good. One topic down.
          </h2>
          {next && (
            <p className="mt-2 text-base text-muted-foreground">
              Next:{" "}
              <Link href={next.href} className="font-semibold text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-current">
                {next.title}
              </Link>
            </p>
          )}
          <p className="mt-3">
            <a
              href={shareHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("article_share", { slug, via: "whatsapp" })}
              className={pill}
            >
              Send it to a friend on WhatsApp
            </a>
          </p>
        </>
      )}

      {step === "why" && (
        <>
          <h2 id="fb-h" className="text-lg font-bold text-ink">
            What went wrong?
          </h2>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className={pill}
                onClick={() => {
                  track("article_feedback_reason", { slug, reason: r });
                  save("no");
                  setStep("thanks");
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </>
      )}

      {step === "thanks" && (
        <>
          <h2 id="fb-h" className="text-lg font-bold text-ink">
            Thank you. That helps me fix it.
          </h2>
          <p className="mt-2 text-base text-muted-foreground">
            Still stuck?{" "}
            <a href={askHref} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-hairline-strong underline-offset-4 hover:decoration-current">
              Ask me on WhatsApp
            </a>
          </p>
        </>
      )}
    </section>
  );
}
