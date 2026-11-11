"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useDatabase } from "@/lib/data/store";
import { studentById } from "@/lib/data/selectors";
import { studentSubjects } from "@/components/student/Welcome";
import { NavIcon } from "@/components/nav/NavIcons";
import { cn } from "@/lib/cn";

// The timer screen loads only when it's opened.
const FocusMode = dynamic(() => import("@/components/student/FocusMode"), { ssr: false });

/**
 * "Focus on this": starts a Groundwork block for one test or piece of homework,
 * with its subject set and the item as the block's mission. Always quiet (an
 * outline or an icon), so the page's one gold button stays the main action.
 */
export function FocusOnThis({
  kind,
  title,
  subject,
  href,
  id,
  variant = "pill",
  className,
}: {
  kind: "test" | "homework";
  title: string;
  /** The subject to preset; falls back to the student's first subject. */
  subject?: string;
  /** Where "Go to the test" leads after the block (only from another page). */
  href?: string;
  /** The assignment or test id, so the block's minutes are counted against it. */
  id?: string;
  /** "icon": a round 44px button for tight rows; "pill": icon and the word Focus. */
  variant?: "icon" | "pill";
  className?: string;
}) {
  const { session, profile } = useAuth();
  const db = useDatabase();
  const [open, setOpen] = useState(false);
  const student = session?.studentId ? studentById(db, session.studentId) : null;
  if (!student) return null;
  const subjects = studentSubjects(db, student);
  const label = `Focus on ${title} in Groundwork`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={cn(
          "relative z-10 inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-border-strong text-sm font-semibold text-ink-2 transition-colors hover:border-ink-3 hover:bg-surface-2 hover:text-ink active:scale-[0.98]",
          variant === "icon" ? "w-11" : "px-4",
          className,
        )}
      >
        <NavIcon.Groundwork className="h-[18px] w-[18px]" />
        {variant === "pill" && <span aria-hidden>Focus</span>}
      </button>
      {open &&
        createPortal(
          <FocusMode
            subjects={subjects}
            mission={{
              subject: subject ?? subjects[0] ?? "Study",
              topic: title,
              tag: kind === "test" ? "Test prep" : "Homework",
              item: { kind, title, href, id },
            }}
            me={{ id: student.id, name: student.username, avatar: profile.avatar }}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}
