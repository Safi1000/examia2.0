"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDatabase } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { useAuth } from "@/lib/auth-context";
import { LogoTight } from "@/components/Brand";
import { CohortDot } from "@/components/ui";
import { NavIcon } from "@/components/nav/NavIcons";
import { cn } from "@/lib/cn";

// Grouped by the job you're doing, so the list reads as a console, not a
// pile of links.
const GROUPS = [
  {
    title: "Teach",
    items: [
      { href: "/admin/today", label: "Today", Icon: NavIcon.Today },
      { href: "/admin/classes", label: "Classes", Icon: NavIcon.Classes },
      { href: "/admin/whiteboard", label: "Whiteboard", Icon: NavIcon.Board },
      { href: "/admin/tests", label: "Tests", Icon: NavIcon.Tests },
      { href: "/admin/submissions", label: "Submissions", Icon: NavIcon.Inbox },
      { href: "/admin/assignments", label: "Assignments", Icon: NavIcon.Assignments },
    ],
  },
  {
    title: "Library",
    items: [
      { href: "/admin/bank", label: "Question bank", Icon: NavIcon.Bank },
      { href: "/admin/notes", label: "Notes", Icon: NavIcon.Notes },
      { href: "/admin/announcements", label: "Announcements", Icon: NavIcon.Megaphone },
    ],
  },
  {
    title: "Students",
    items: [
      { href: "/admin/roster", label: "Roster", Icon: NavIcon.Roster },
      { href: "/admin/cohorts", label: "Cohorts", Icon: NavIcon.Cohorts },
      { href: "/admin/attendance", label: "Attendance", Icon: NavIcon.Attendance },
    ],
  },
  {
    title: "Insight",
    items: [
      { href: "/admin/analytics", label: "Analytics", Icon: NavIcon.Analytics },
      { href: "/admin/export", label: "Export", Icon: NavIcon.Export },
      { href: "/admin/settings", label: "Settings", Icon: NavIcon.Settings },
    ],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const db = useDatabase();
  const { logout } = useAuth();
  const { cohortId, setCohortId } = useAdminFilter();
  const cohorts = db.cohorts.filter((c) => c.active);

  return (
    <div className="flex h-full flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0)_30%)] bg-paper">
      <div className="px-5 pb-5 pt-6">
        <Link href="/admin/today" onClick={onNavigate} className="inline-flex">
          <LogoTight className="h-[22px]" />
        </Link>
        <p className="mt-3 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.32em] text-ink-3">
          <span className="h-1 w-1 rounded-full bg-brand" /> Teacher console
        </p>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Admin">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-3/70">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-semibold transition-all duration-300",
                        active
                          ? "bg-linear-to-r from-brand/16 to-brand/3 text-ink ring-1 ring-inset ring-brand/20"
                          : "text-ink-3 hover:bg-white/[0.035] hover:text-ink",
                      )}
                    >
                      <item.Icon active={active} className={cn("h-[18px] w-[18px]", active ? "text-brand" : "text-ink-3 group-hover:text-ink-2")} />
                      {item.label}
                      {active && <span aria-hidden className="ml-auto h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_10px_var(--color-brand)]" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div>
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.24em] text-ink-3/70">Viewing</p>
          {/* Switched-off cohorts drop out of the filter, but stay on the
              Cohorts page where they can be switched back on. */}
          <div className="flex flex-wrap gap-1.5 px-2">
            <button
              onClick={() => setCohortId(null)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                cohortId === null ? "border-brand/40 bg-brand/10 text-brand" : "border-white/[0.08] text-ink-3 hover:text-ink",
              )}
            >
              All
            </button>
            {cohorts.map((c) => (
              <button
                key={c.id}
                onClick={() => setCohortId(cohortId === c.id ? null : c.id)}
                className={cn(
                  "flex h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                  cohortId === c.id ? "border-brand/40 bg-brand/10 text-ink" : "border-white/[0.08] text-ink-3 hover:text-ink",
                )}
              >
                <CohortDot color={c.color} />
                <span className="truncate">{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Who's signed in, and the way out. */}
      <div className="m-3 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-surface/60 p-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#2c3034,#1c1f22)] text-xs font-bold text-brand ring-1 ring-inset ring-brand/35">
          HS
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-ink">Hamza Sadaqat</span>
          <span className="block text-[11px] text-ink-3">Teacher</span>
        </span>
        <button
          onClick={() => { logout(); router.replace("/login"); }}
          aria-label="Sign out"
          title="Sign out"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-white/[0.05] hover:text-ink"
        >
          <NavIcon.Logout className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
