/**
 * The portal's own menu icons: thin line drawings, each with one small gold
 * detail (a door, a destination, a bookmark…). The gold detail is dim until
 * the item is active, then it lights up. Drawn for this portal, 24px grid,
 * 1.5px strokes.
 */
import { cn } from "@/lib/cn";

type P = { active?: boolean; className?: string };

function Svg({ active, className, children }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-5 w-5 shrink-0", className)}
      data-active={active ? "" : undefined}
    >
      {children}
    </svg>
  );
}

/** The gold detail. Dim when idle, full when active. */
function Gold({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <g
      fill="var(--color-brand)"
      stroke="var(--color-brand)"
      className={cn("transition-opacity duration-300", active ? "opacity-100" : "opacity-40")}
    >
      {children}
    </g>
  );
}

export const NavIcon = {
  Home: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M3.5 10.5L12 4l8.5 6.5V19a1 1 0 01-1 1h-15a1 1 0 01-1-1z" />
      <Gold active={active}><rect x="10" y="13.5" width="4" height="6.5" rx="1" strokeWidth="0" /></Gold>
    </Svg>
  ),
  Plan: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M5 19c0-3 2.5-4 5-4s5-1 5-4-2.5-4-5-4" strokeDasharray="0.1 3.2" strokeWidth="1.8" />
      <circle cx="5" cy="19" r="1.6" />
      <Gold active={active}><path d="M17 3.5c-1.9 0-3.4 1.4-3.4 3.3 0 2.4 3.4 5.2 3.4 5.2s3.4-2.8 3.4-5.2c0-1.9-1.5-3.3-3.4-3.3z" strokeWidth="0" /></Gold>
      <circle cx="17" cy="6.9" r="1" fill="var(--color-paper)" stroke="none" />
    </Svg>
  ),
  Progress: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M4 20h16" />
      <rect x="5.5" y="13" width="3" height="5" rx="0.8" />
      <rect x="10.5" y="9.5" width="3" height="8.5" rx="0.8" />
      <Gold active={active}><rect x="15.5" y="5" width="3" height="13" rx="0.8" strokeWidth="0" /></Gold>
    </Svg>
  ),
  Tasks: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3.8a.8.8 0 01.8-.8h4.4a.8.8 0 01.8.8v.7" />
      <path d="M8.5 11h7M8.5 15h4" />
      <Gold active={active}><circle cx="16" cy="16.5" r="2.6" strokeWidth="0" /></Gold>
    </Svg>
  ),
  Notes: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5z" />
      <path d="M12 6.5v13" />
      <Gold active={active}><path d="M15 5.2V10l1.4-1 1.4 1V4.8" strokeWidth="0" /></Gold>
    </Svg>
  ),
  Settings: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2" fill="var(--color-paper)" />
      <Gold active={active}><circle cx="15" cy="12" r="2.2" /></Gold>
      <circle cx="7" cy="17" r="2" fill="var(--color-paper)" />
    </Svg>
  ),
  Classes: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <rect x="3" y="6" width="13" height="12" rx="2.5" />
      <path d="M16 10.5l5-3v9l-5-3" />
      <Gold active={active}><circle cx="9.5" cy="12" r="2.2" strokeWidth="0" /></Gold>
    </Svg>
  ),
  Today: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" />
      <circle cx="12" cy="12" r="5" />
      <Gold active={active}><circle cx="12" cy="12" r="2.4" strokeWidth="0" /></Gold>
    </Svg>
  ),
  Tests: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M14 3.5H7a2 2 0 00-2 2v13a2 2 0 002 2h10a2 2 0 002-2v-10z" />
      <path d="M14 3.5v5h5M8.5 12.5h5M8.5 16h3" />
      <Gold active={active}><path d="M15.2 17.8l4.6-4.6 1.4 1.4-4.6 4.6-2 .6z" strokeWidth="0" /></Gold>
    </Svg>
  ),
  Bank: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <rect x="4" y="9" width="16" height="11" rx="2" />
      <path d="M6 6h12M8 3.5h8" />
      <Gold active={active}><rect x="9" y="12.5" width="6" height="2" rx="1" strokeWidth="0" /></Gold>
    </Svg>
  ),
  Inbox: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M3.5 13.5l2.4-7.2A2 2 0 017.8 5h8.4a2 2 0 011.9 1.3l2.4 7.2V18a2 2 0 01-2 2h-13a2 2 0 01-2-2z" />
      <path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" />
      <Gold active={active}><path d="M12 7.5v4.5M10 10l2 2 2-2" fill="none" strokeWidth="1.6" /></Gold>
    </Svg>
  ),
  Assignments: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5V3.8a.8.8 0 01.8-.8h4.4a.8.8 0 01.8.8v.7" />
      <Gold active={active}><path d="M8.7 13l2.2 2.2 4.4-4.6" fill="none" strokeWidth="1.8" /></Gold>
    </Svg>
  ),
  Cohorts: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" />
      <Gold active={active}><path d="M12 3.5l8.5 4.5L12 12.5 3.5 8z" strokeWidth="1" /></Gold>
    </Svg>
  ),
  Roster: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
      <Gold active={active}><circle cx="16.5" cy="9" r="2.4" strokeWidth="0" /><path d="M16.2 13.8c2.3.1 4 1.7 4.4 4.2h-3.4" strokeWidth="0" /></Gold>
    </Svg>
  ),
  Attendance: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <Gold active={active}><rect x="13" y="12.5" width="4" height="4" rx="1" strokeWidth="0" /></Gold>
    </Svg>
  ),
  Megaphone: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M4 10v4a1 1 0 001 1h2l7 4V5L7 9H5a1 1 0 00-1 1z" />
      <path d="M7.5 15l1 4.5" />
      <Gold active={active}><path d="M17 9.5a3.5 3.5 0 010 5M19 7.5a6.5 6.5 0 010 9" fill="none" strokeWidth="1.6" /></Gold>
    </Svg>
  ),
  Analytics: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M4 4v15.5a.5.5 0 00.5.5H20" />
      <path d="M7.5 15l3.5-4 3 2.5 4.5-6" />
      <Gold active={active}><circle cx="18.5" cy="7.5" r="2" strokeWidth="0" /></Gold>
    </Svg>
  ),
  Export: ({ active, className }: P) => (
    <Svg active={active} className={className}>
      <path d="M4.5 13.5v5a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5v-5" />
      <Gold active={active}><path d="M12 15V4M8 7.5L12 3.5l4 4" fill="none" strokeWidth="1.7" /></Gold>
    </Svg>
  ),
  Logout: ({ className }: P) => (
    <Svg className={className}>
      <path d="M14 4h3.5A1.5 1.5 0 0119 5.5v13a1.5 1.5 0 01-1.5 1.5H14M10 8l-4 4 4 4M6 12h9" />
    </Svg>
  ),
};
