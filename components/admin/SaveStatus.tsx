"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getStore, type SaveState } from "@/lib/data/store";
import { cn } from "@/lib/cn";

/** Whether this device's marks, comments and pen strokes have all reached the database. */
export function useSaveState(): SaveState {
  const store = getStore();
  return useSyncExternalStore(store.subscribeSaves, store.getSaveState, () => "saved" as const);
}

/**
 * The console's quiet "Saved" light, in the top bar. Silent while saves land
 * as normal: "Saving…" only shows when one is slow (a weak signal), "Saved"
 * for a moment after it lands, and "Not saved yet" (tap to try now) while one
 * keeps failing. Closing the tab with marking still on its way asks first.
 */
export function SaveStatus({ className }: { className?: string }) {
  const state = useSaveState();
  const [shown, setShown] = useState<"none" | "saving" | "saved">("none");

  useEffect(() => {
    if (state === "saving") {
      const slow = setTimeout(() => setShown("saving"), 1500);
      return () => clearTimeout(slow);
    }
    if (state === "saved") {
      const landed = setTimeout(() => setShown((s) => (s === "saving" ? "saved" : s)), 0);
      const quiet = setTimeout(() => setShown("none"), 2500);
      return () => {
        clearTimeout(landed);
        clearTimeout(quiet);
      };
    }
  }, [state]);

  useEffect(() => {
    if (state === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  if (state === "failed") {
    return (
      <button
        type="button"
        onClick={() => getStore().retrySaves()}
        className={cn("inline-flex min-h-11 items-center px-2 text-sm font-semibold text-warning underline-offset-4 hover:underline", className)}
      >
        Not saved yet · Try again
      </button>
    );
  }
  const text = state === "saving" && shown === "saving" ? "Saving…" : shown === "saved" ? "Saved" : "";
  return (
    <span role="status" className={cn("px-2 text-sm text-ink-3", !text && "sr-only", className)}>
      {text}
    </span>
  );
}

/** The same state as one short line, for the pen view's toolbar (on a phone only when a save is failing: the row is full). */
export function SaveNote({ className }: { className?: string }) {
  const state = useSaveState();
  return (
    <span className={cn("shrink-0 text-sm", state === "failed" ? "font-semibold text-warning" : "text-ink-3 max-sm:hidden", className)}>
      {state === "failed" ? "Not saved yet" : state === "saving" ? "Saving…" : "Saved"}
    </span>
  );
}
