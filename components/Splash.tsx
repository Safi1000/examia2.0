import { LogoTight } from "@/components/Brand";

/** The one loading screen: the wordmark, breathing softly, and an optional line. */
export function Splash({ label }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoTight className="h-6 animate-[low-pulse_2.2s_ease-in-out_infinite]" />
      <span className="h-[2px] w-24 overflow-hidden rounded-full bg-white/[0.06]">
        <span className="block h-full w-1/3 animate-[splash-bar_1.1s_ease-in-out_infinite] rounded-full bg-brand/70" />
      </span>
      <span className={label ? "text-sm text-ink-3" : "sr-only"}>{label ?? "Loading"}</span>
    </div>
  );
}
