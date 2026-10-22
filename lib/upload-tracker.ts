"use client";

import { useSyncExternalStore } from "react";

/**
 * How many answer photos are uploading right now, so the test runner can wait
 * for them before handing a paper in automatically when time runs out.
 */
let busy = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call when an upload starts; call the returned function when it ends. */
export function trackUpload(): () => void {
  busy++;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    busy = Math.max(0, busy - 1);
    emit();
  };
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useUploadsInProgress(): number {
  return useSyncExternalStore(subscribe, () => busy, () => 0);
}
