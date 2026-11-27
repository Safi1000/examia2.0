"use client";

import type { ReactNode } from "react";
import { LogoTight } from "@/components/Brand";
import { buttonClasses } from "@/components/ui";
import { waTextLink } from "@/lib/landing";
import { PAUSE_COPY, pauseBody, pauseWhatsAppText, type PauseReason } from "@/lib/farewell-copy";

/**
 * The quiet page a student sees on their own: the paused screen, the farewell
 * screen and the public farewell link. Centred, the small logo on top, lots
 * of room, safe on a notched phone.
 */
export function CalmShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="flex min-h-dvh flex-col items-center bg-paper px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]"
    >
      <div className="flex w-full max-w-[28rem] flex-1 flex-col">
        <div className="flex justify-center pb-10 pt-2" aria-label="Hamza Teaches">
          <LogoTight className="h-5" />
        </div>
        <div className="flex flex-1 flex-col justify-center pb-10">{children}</div>
      </div>
    </main>
  );
}

/**
 * Hamza has paused this student's access (Students in the teacher console).
 * They see why (when Hamza gave a reason), a way to message Hamza, and Sign out.
 */
export function PausedScreen({ reason, username, onSignOut }: { reason: PauseReason | null; username: string; onSignOut: () => void }) {
  return (
    <CalmShell>
      <div className="text-center motion-safe:animate-fade-up">
        <h1 className="text-balance text-2xl font-semibold tracking-tight text-ink">{PAUSE_COPY.title}</h1>
        <p className="mx-auto mt-3 max-w-[24rem] text-pretty text-base leading-relaxed text-ink-2">{pauseBody(reason)}</p>
        <div className="mt-9 flex flex-col items-stretch gap-3">
          <a
            href={waTextLink(pauseWhatsAppText(username || "unknown"))}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses({ size: "lg", fullWidth: true })}
          >
            {PAUSE_COPY.whatsapp}
          </a>
          <button type="button" onClick={onSignOut} className={buttonClasses({ variant: "ghost", size: "lg", fullWidth: true })}>
            {PAUSE_COPY.signOut}
          </button>
        </div>
      </div>
    </CalmShell>
  );
}
