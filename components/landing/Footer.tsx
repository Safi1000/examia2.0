import { LANDING } from "@/lib/landing";
import { Logo } from "@/components/Brand";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-hairline bg-band-c">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-6 pb-24 min-[720px]:pb-6">
        <Logo className="h-6 opacity-90" />
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
