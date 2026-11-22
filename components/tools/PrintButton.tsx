"use client";

import { track } from "@/lib/landing";

/** Opens the browser's print box. Hidden inside the phone app, which cannot print. */
export function PrintButton({ label, what }: { label: string; what: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        track("formula_sheet_print", { sheet: what });
        window.print();
      }}
      className="web-only fs-noprint inline-flex min-h-12 items-center justify-center gap-2.5 rounded-full bg-gold px-6 text-base font-semibold text-on-brand transition-[background-color,transform] duration-150 ease-[var(--ease-out)] hover:bg-gold-hover active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 7V3h8v4M6 14H4.5A1.5 1.5 0 0 1 3 12.5v-4A1.5 1.5 0 0 1 4.5 7h11A1.5 1.5 0 0 1 17 8.5v4a1.5 1.5 0 0 1-1.5 1.5H14M6 11.5h8V17H6z" />
      </svg>
      {label}
    </button>
  );
}
