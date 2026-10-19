import type { CoverStyle } from "@/lib/guides";

const STYLES: Record<CoverStyle, { box: string; label: string }> = {
  paper: { box: "bg-[#f4f1ea] text-[#1b1e21]", label: "text-[#8a5a0c]" },
  ink: { box: "bg-band-b text-foreground border border-gold-border", label: "text-gold" },
  gold: { box: "bg-gold text-[#1b1e21]", label: "text-[#1b1e21]/75" },
  slate: { box: "bg-card-raised text-foreground", label: "text-gold" },
};

/**
 * A guide cover drawn in code, so the shop looks finished before the real
 * cover artwork exists. Swap for an <Image> when the designed covers land.
 */
export function GuideCover({
  title,
  label,
  style,
  className = "",
}: {
  title: string;
  label: string;
  style: CoverStyle;
  className?: string;
}) {
  const s = STYLES[style];
  return (
    <div
      aria-hidden
      className={`relative flex aspect-[3/4] flex-col justify-between overflow-hidden rounded-l-[10px] rounded-r-[14px] p-4 shadow-[inset_6px_0_0_rgba(0,0,0,0.25),0_18px_36px_rgba(0,0,0,0.35)] ${s.box} ${className}`}
    >
      <span className={`text-[10px] font-bold uppercase tracking-[0.22em] ${s.label}`}>{label}</span>
      <span className="absolute inset-x-4 top-[38%] grid gap-1.5 opacity-30">
        <i className="block h-[3px] rounded bg-current" />
        <i className="block h-[3px] w-4/5 rounded bg-current" />
        <i className="block h-[3px] w-3/5 rounded bg-current" />
      </span>
      <span className="text-xl font-extrabold leading-[1.02] tracking-tight">{title}</span>
    </div>
  );
}
