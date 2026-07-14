import { COMPANY_NAME } from "@/lib/config";
import { LANDING } from "@/lib/landing";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-hairline bg-band-c">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6 pb-24 min-[720px]:pb-6">
        <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-faint">
          <span aria-hidden className="h-[6px] w-[6px] rounded-[2px] bg-gold opacity-70" />
          {COMPANY_NAME}
        </span>
        <a
          href={LANDING.instagram}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] uppercase tracking-[0.28em] text-faint transition-colors hover:text-gold"
        >
          @hamzateaches
        </a>
        <span className="hidden text-[11px] uppercase tracking-[0.28em] text-faint min-[720px]:inline">
          {year}
        </span>
      </div>
    </footer>
  );
}
