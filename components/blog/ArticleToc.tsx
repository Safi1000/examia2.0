"use client";

/**
 * "On this page": the article's sections, with the one you are reading lit
 * in gold and a small ring showing how much is left. On wide screens it sits
 * in the right margin; on phones it is a fold-out list under the header.
 *
 * It also remembers where you stopped (this browser only). Come back to the
 * same article later and a quiet "Pick up where you left off" appears.
 */
import { useEffect, useMemo, useState } from "react";

type H = { id: string; text: string };

const KEY = (slug: string) => `exam-room:pos:${slug}`;

function readPos(slug: string): number | null {
  try {
    const v = Number(localStorage.getItem(KEY(slug)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function savePos(slug: string, v: number) {
  try {
    localStorage.setItem(KEY(slug), String(Math.round(v)));
  } catch {
    /* private mode: nothing to remember */
  }
}

export function ArticleToc({ slug, headings, minutes }: { slug: string; headings: H[]; minutes: number }) {
  const [active, setActive] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [resume, setResume] = useState<number | null>(null);

  // Section in view, and how far through the article.
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => !!e);
    const article = document.getElementById("article-body");
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = window.innerHeight * 0.3;
      let current: string | null = null;
      for (const el of els) if (el.getBoundingClientRect().top <= line) current = el.id;
      setActive(current);
      if (article) {
        const r = article.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (window.innerHeight * 0.6 - r.top) / r.height));
        setProgress(p);
        if (window.scrollY > 400) savePos(slug, window.scrollY);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [headings, slug]);

  // Returning reader: offer to jump back, once, if they stopped part way.
  useEffect(() => {
    // A short pause first, so the offer arrives after the page has settled.
    const t = window.setTimeout(() => {
      const pos = readPos(slug);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (pos && window.scrollY < 200 && pos > 800 && pos < max * 0.9) setResume(pos);
    }, 900);
    return () => window.clearTimeout(t);
  }, [slug]);

  const left = Math.max(1, Math.round(minutes * (1 - progress)));
  const done = progress > 0.97;
  const C = 2 * Math.PI * 9;

  const list = useMemo(
    () => (
      <ol className="space-y-1">
        {headings.map((h) => {
          const on = h.id === active;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                aria-current={on ? "location" : undefined}
                className={`group flex min-h-9 items-start gap-2.5 rounded-lg py-1.5 pr-2 text-sm leading-snug transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                  on ? "text-ink" : "text-faint hover:text-body"
                }`}
              >
                <span aria-hidden className={`toc-dot mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${on ? "scale-125 bg-gold" : "bg-hairline-strong group-hover:bg-faint"}`} />
                {h.text}
              </a>
            </li>
          );
        })}
      </ol>
    ),
    [headings, active],
  );

  const ring = (
    <span className="relative inline-flex h-6 w-6 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90">
        <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2" className="stroke-hairline-strong" />
        <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2" strokeLinecap="round" className="toc-ring stroke-gold" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
      </svg>
    </span>
  );
  const status = done ? "Finished. Well done." : `${left} min left`;

  if (headings.length < 3) return null;

  return (
    <>
      {/* Phones and laptops: fold-out list in the reading column. */}
      <details className="group mt-8 rounded-tile border border-hairline bg-card xl:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold [&::-webkit-details-marker]:hidden">
          <span>On this page · {headings.length} sections</span>
          <span aria-hidden className="text-faint transition-transform duration-200 group-open:rotate-180">⌄</span>
        </summary>
        <nav aria-label="On this page" className="border-t border-hairline px-4 pb-3 pt-2">
          {list}
        </nav>
      </details>

      {/* Wide screens: fixed in the right margin. */}
      <aside className="fixed top-28 hidden max-h-[calc(100dvh-9rem)] w-60 overflow-y-auto pr-2 [scrollbar-width:thin] xl:block" style={{ left: "calc(50% + 23rem)" }}>
        <div className="flex items-center gap-2.5 text-sm font-semibold text-ink">
          {ring}
          <span aria-live="polite">{status}</span>
        </div>
        <nav aria-label="On this page" className="mt-4 border-l border-hairline pl-3">
          {list}
        </nav>
      </aside>

      {resume !== null && (
        <div className="resume-in fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-full border border-hairline-strong bg-band-c/95 py-2 pl-5 pr-2 text-sm text-body shadow-[var(--shadow-lg)] backdrop-blur md:bottom-8">
          <span>Pick up where you left off?</span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: resume, behavior: "smooth" });
                setResume(null);
              }}
              className="min-h-10 rounded-full bg-gold px-4 font-semibold text-band-b focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Continue
            </button>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setResume(null)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-faint hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              ✕
            </button>
          </span>
        </div>
      )}
    </>
  );
}
