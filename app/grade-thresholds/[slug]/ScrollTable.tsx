"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Threshold tables: numbers right aligned in tabular figures, the row label
 * pinned while the rest scrolls sideways on a phone, and a quiet hint plus an
 * edge fade only when there really are columns out of view.
 */
export function ScrollTable({ head, rows, caption }: { head: ReactNode[]; rows: ReactNode[][]; caption?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const check = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, []);

  return (
    <div>
      <div className="relative">
        <div ref={box} className="overflow-x-auto rounded-[16px] border border-hairline bg-card [scrollbar-width:thin]">
          <table className="w-full border-collapse text-left text-[15px]">
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
              <tr className="bg-card-raised">
                {head.map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={
                      i === 0
                        ? "sticky left-0 z-10 whitespace-nowrap bg-card-raised px-4 py-3 text-[13px] font-semibold text-muted-foreground"
                        : "whitespace-nowrap px-4 py-3 text-right text-[13px] font-semibold text-muted-foreground"
                    }
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-hairline">
                  {r.map((c, j) =>
                    j === 0 ? (
                      <th key={j} scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-card px-4 py-3 font-semibold text-foreground">
                        {c}
                      </th>
                    ) : (
                      <td key={j} className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-body">
                        {c}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-px right-px w-10 rounded-r-[15px] bg-gradient-to-l from-card to-transparent transition-opacity duration-300 ${more ? "opacity-100" : "opacity-0"}`}
        />
      </div>
      {more && (
        <p aria-hidden className="mt-2 text-right text-[13px] text-faint">
          Swipe for more columns →
        </p>
      )}
    </div>
  );
}
