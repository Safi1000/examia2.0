import { AVATARS } from "@/lib/profile";
import { cn } from "@/lib/cn";

/** A student's portal avatar (or their initials until they pick one). */
export function Avatar({ id, initials, className }: { id?: string; initials?: string; className?: string }) {
  const a = AVATARS.find((x) => x.id === id);
  if (!a)
    return (
      <span className={cn("flex items-center justify-center rounded-xl bg-[linear-gradient(145deg,#2c3034,#1c1f22)] font-bold text-brand", className)}>
        {initials}
      </span>
    );
  const ink = "#F6F1E7";
  const eyes: Record<string, React.ReactNode> = {
    smile: <><circle cx="15" cy="17" r="2.2" fill={ink} /><circle cx="25" cy="17" r="2.2" fill={ink} /></>,
    grin: <><circle cx="15" cy="17" r="2.2" fill={ink} /><circle cx="25" cy="17" r="2.2" fill={ink} /></>,
    wink: <><circle cx="15" cy="17" r="2.2" fill={ink} /><path d="M22.5 17.5h5" stroke={ink} strokeWidth="2.2" strokeLinecap="round" /></>,
    cool: <path d="M10.5 15.5h19v2.5a3 3 0 0 1-3 3h-3.5a2.5 2.5 0 0 1-2.5-2.5 2.5 2.5 0 0 1-2.5 2.5h-3.5a3 3 0 0 1-3-3Z" fill={ink} />,
    calm: <><path d="M12.5 17.5q2.5-2.5 5 0M22.5 17.5q2.5-2.5 5 0" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" /></>,
    wow: <><circle cx="15" cy="16.5" r="2.8" fill="none" stroke={ink} strokeWidth="2" /><circle cx="25" cy="16.5" r="2.8" fill="none" stroke={ink} strokeWidth="2" /></>,
    focus: <><circle cx="15" cy="17.5" r="2.2" fill={ink} /><circle cx="25" cy="17.5" r="2.2" fill={ink} /><path d="M12 13.5l4-1M28 13.5l-4-1" stroke={ink} strokeWidth="1.8" strokeLinecap="round" /></>,
    joy: <><path d="M12.5 18q2.5-3 5 0M22.5 18q2.5-3 5 0" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" /></>,
  };
  const mouth: Record<string, React.ReactNode> = {
    smile: <path d="M14.5 25q5.5 4.5 11 0" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />,
    grin: <path d="M13.5 24h13q-1 6-6.5 6t-6.5-6Z" fill={ink} />,
    wink: <path d="M15 25q5 4 10 0" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />,
    cool: <path d="M16 26q4 2.5 8-.5" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />,
    calm: <path d="M15.5 25.5q4.5 3.5 9 0" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />,
    wow: <ellipse cx="20" cy="26.5" rx="2.6" ry="3" fill={ink} />,
    focus: <path d="M16 25.5q4 3 8 0" stroke={ink} strokeWidth="2.2" fill="none" strokeLinecap="round" />,
    joy: <path d="M13.5 23.5h13q-1 7-6.5 7t-6.5-7Z" fill={ink} />,
  };
  return (
    <svg viewBox="0 0 40 40" className={cn("rounded-xl", className)} role="img" aria-label="Avatar">
      <rect width="40" height="40" rx="10" fill={a.bg} />
      <rect width="40" height="40" rx="10" fill="url(#av-shine)" />
      <defs>
        <linearGradient id="av-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      {eyes[a.face]}
      {mouth[a.face]}
    </svg>
  );
}
