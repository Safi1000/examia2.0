import { displayName } from "@/lib/display-name";

/**
 * The words for a paused or a leaving student, in Hamza's voice, and the
 * shapes of the marks the server keeps on a student's sign-in account
 * (app_metadata, written only by the server: app/api/admin/access and
 * app/api/farewell). Shared by the student screens, the teacher console and
 * the server, so every place says the same thing.
 */

export type PauseReason = "fees" | "break";
export type LeftKind = "finished" | "dropped";
export type Rating = 1 | 2 | 3 | 4 | 5;
export type LeftMark = { kind: LeftKind; at: string; username: string };
export type FarewellNote = { rating: Rating | null; helped: string; change: string; at: string };

/** Longest a feedback answer may be, in characters (after trimming). */
export const FAREWELL_TEXT_MAX = 1000;

export const isPauseReason = (v: unknown): v is PauseReason => v === "fees" || v === "break";
export const isLeftKind = (v: unknown): v is LeftKind => v === "finished" || v === "dropped";
export const isRating = (v: unknown): v is Rating => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;

/** A `left` mark read from app_metadata, or null when it isn't a proper one. */
export function readLeft(v: unknown): LeftMark | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isLeftKind(o.kind) || typeof o.at !== "string" || typeof o.username !== "string") return null;
  return { kind: o.kind, at: o.at, username: o.username };
}

/** A `farewell` note read from app_metadata, or null when there isn't a proper one. */
export function readFarewell(v: unknown): FarewellNote | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.at !== "string") return null;
  return {
    rating: isRating(o.rating) ? o.rating : null,
    helped: typeof o.helped === "string" ? o.helped.slice(0, FAREWELL_TEXT_MAX) : "",
    change: typeof o.change === "string" ? o.change.slice(0, FAREWELL_TEXT_MAX) : "",
    at: o.at,
  };
}

/* ---- Pause screen ---- */

export const PAUSE_COPY = {
  title: "Your access is paused",
  body: {
    fees: "This month's fees are still due. Once that's sorted, everything opens again, just as you left it.",
    break: "You're on a break for now. Your notes, tests and results are all safe for when you're back.",
    none: "Nothing of yours is gone. Message me and we'll get you back in.",
  },
  whatsapp: "Message Hamza on WhatsApp",
  signOut: "Sign out",
} as const;

export const pauseBody = (reason: PauseReason | null | undefined) => (reason ? PAUSE_COPY.body[reason] : PAUSE_COPY.body.none);

/** The WhatsApp message a paused student sends Hamza. */
export const pauseWhatsAppText = (username: string) => `hi, my portal access is paused (username: ${username})`;

/* ---- Farewell screen ---- */

export const FAREWELL_COPY = {
  finished: {
    title: "Thank you for learning with me",
    body: "It's been a real pleasure teaching you. Go into your exams calm, you've done the work.",
  },
  dropped: {
    title: "Thank you for the time you spent here",
    body: "If you ever want to come back, you're always welcome. Your place is easy to open again.",
  },
  cardTitle: "How were the classes for you?",
  cardSub: "Takes a minute. I read every one, and it helps the next batch.",
  ratingLow: "Not great",
  ratingHigh: "Loved them",
  helped: "What helped you most?",
  change: "What should I change?",
  send: "Send to Hamza",
  sending: "Sending…",
  error: "Couldn't send. Check your connection and try again.",
  doneTitle: "Thank you. That means a lot.",
  doneSign: "All the best, Hamza",
  alreadySent: "You've already sent this. Thank you.",
  sendAnother: "Send another note",
  signOut: "Sign out",
} as const;

/* ---- WhatsApp farewell, sent by Hamza one by one from Students ---- */

/** First word of the student's display name, lower case ("amelia.k" → "amelia"). */
export const farewellFirst = (username: string) => (displayName(username).split(" ")[0] ?? "").toLowerCase();

/** The farewell WhatsApp text from a username (the first name is taken from it). */
export function farewellWhatsAppText(kind: LeftKind, username: string, link: string): string {
  return farewellWhatsApp(kind, farewellFirst(username), link);
}

/** The farewell WhatsApp text, given the first name already (lower case). */
export function farewellWhatsApp(kind: LeftKind, first: string, link: string): string {
  return kind === "finished"
    ? `${first}, it was genuinely a pleasure teaching you. all the best for your exams, you've put the work in. if you have a minute, tell me how the classes were for you: ${link}`
    : `${first}, thank you for the time you spent in class. if you ever want to come back, you're always welcome. if you have a minute, tell me honestly how it went for you: ${link}`;
}
