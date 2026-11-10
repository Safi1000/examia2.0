/**
 * Stay to build: while a focus block runs, leaving Groundwork (another tab or
 * app, or a locked phone) for more than a short grace makes the builder wait
 * from the moment they left. On return they choose: Resume (the away time is
 * not counted) or "I was studying on paper" (it is, up to what was left of the
 * block, since a locked phone looks the same as leaving).
 *
 * The same rule as the app's Groundwork (mobile/src/features/groundwork/away.ts).
 * Minutes still go through recordFocus, so the leaderboard's trusted minutes
 * rule is unchanged: a block never counts more than its own length.
 */

/** Away for this long or less: nothing happens, the block keeps going. */
export const AWAY_GRACE_MS = 15_000;

/** How long they were away, or 0 when it is short enough to ignore. */
export function awayFor(leftAt: number, backAt: number): number {
  const ms = backAt - leftAt;
  return ms > AWAY_GRACE_MS ? ms : 0;
}

/** Away time to count for "I was studying on paper": never more than what was left of the block. */
export function creditedAway(awayMs: number, leftMs: number): number {
  return Math.max(0, Math.min(awayMs, leftMs));
}

/** "40 seconds", "4 min", "1 h 5 min". */
export function awayLabel(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} seconds`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

// ---- The focus room is open (so the Home island behind it can stop drawing).
let roomOpen = false;
const roomListeners = new Set<() => void>();

export function setFocusRoomOpen(on: boolean) {
  if (roomOpen === on) return;
  roomOpen = on;
  roomListeners.forEach((l) => l());
}

export function subscribeFocusRoom(l: () => void): () => void {
  roomListeners.add(l);
  return () => {
    roomListeners.delete(l);
  };
}

export const focusRoomOpen = () => roomOpen;

const TIP_KEY = "gw_tip_dnd_off";

/** The Do Not Disturb tip shows until it is dismissed on this device. */
export function tipHidden(): boolean {
  try {
    return localStorage.getItem(TIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function hideTip() {
  try {
    localStorage.setItem(TIP_KEY, "1");
  } catch {}
}
