import type { Profile } from "@/lib/profile";

/**
 * Recording watch time. A recording plays inside the portal (Google Drive's
 * own player in a frame), and the portal counts the seconds it was open on
 * screen. Drive doesn't say whether the video is playing or paused, so this is
 * "time with the recording open", not exact play time.
 */

/** The Drive file id in a recording's link, if it is a Drive link. */
export const driveFileId = (url: string) => url.match(/\/d\/([\w-]+)/)?.[1] ?? url.match(/[?&]id=([\w-]+)/)?.[1] ?? null;

/** The most one recording can add up to: a left-open tab can't run it up forever. */
const MOST_SEC = 4 * 3600;

/** Mark a recording opened and add seconds to it. Keeps the newest 60, like `watched`. */
export function watchPatch(key: string, addSec: number) {
  return (p: Profile): Partial<Profile> => {
    const watched = [...(p.watched ?? []).filter((k) => k !== key), key].slice(-60);
    const watchSec: Record<string, number> = {};
    for (const k of watched) {
      const v = (p.watchSec?.[k] ?? 0) + (k === key ? Math.max(0, Math.round(addSec)) : 0);
      if (v > 0) watchSec[k] = Math.min(MOST_SEC, v);
    }
    return { watched, watchSec };
  };
}

/** "under 1 min", "32 min", "1 h 5 min". */
export function watchLabel(sec: number | undefined) {
  if (!sec) return "";
  const m = Math.round(sec / 60);
  if (m < 1) return "under 1 min";
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}
