import { displayName, firstName } from "@/lib/display-name";

/**
 * Everything a message to a student or parent is built from, plus the one
 * guard every message passes through before its WhatsApp link (or bell note)
 * is made. Pure: the same student and message kind always give the same text.
 *
 * The rule: a message never goes out with a gap, "undefined", "null", "NaN",
 * "Invalid Date", empty quotes or brackets, a brace, or a raw username. A
 * missing optional detail drops its clause; if something still slips through,
 * the guard swaps in the plain check-in for that audience.
 */

const BAD_VALUE = /^(undefined|null|nan|invalid date)$/i;

/** A value fit to go into a sentence, or "" when it is missing or broken. */
export function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && !Number.isFinite(value)) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  if (!text || BAD_VALUE.test(text) || /[{}]/.test(text)) return "";
  return text;
}

/**
 * The student's first name for a message ("amelia.k2" → "Amelia",
 * "k.amelia" → "Amelia"): the first word of two or more letters. "" when there
 * is none ("a.b.c", "123"), so the greeting goes without a name rather than
 * showing initials or a username with dots or digits.
 */
export function messageName(username: string | null | undefined): string {
  const first = clean(firstName(clean(username)));
  const full = first.includes(" ") ? first : clean(displayName(clean(username)));
  return full.split(" ").find((w) => /^\p{L}[\p{L}']+$/u.test(w)) ?? "";
}

/** "1 class", "3 classes". Only for whole numbers of 0 or more; anything else gives "". */
export function count(n: number, one: string, many = `${one}s`): string {
  return Number.isInteger(n) && n >= 0 ? `${n} ${n === 1 ? one : many}` : "";
}

/** "a", "a and b", "a, b and c" (empty items dropped). */
export function joinAnd(items: string[]): string {
  const xs = items.map(clean).filter(Boolean);
  return xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/**
 * A plain word value in the lower-case texting style ("Economics" → "economics",
 * "Wednesday at 9:00 PM" → "wednesday at 9:00 pm"). Only for subjects, days,
 * dates, months and times: never for names, titles, usernames, passwords or links.
 */
export const low = (value: unknown) => clean(value).toLowerCase();

/** A subject in the texting style, keeping a level as written ("AS Economics" → "AS economics"). */
export const lowSubject = (value: unknown) =>
  clean(value)
    .split(" ")
    .map((w) => (/^(AS|A2|IGCSE|O)$/.test(w) ? w : w.toLowerCase()))
    .join(" ");

/** First letter upper case (the bell note keeps normal capitals). */
export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A title in quotes, or the fallback words when there is no title. */
export const titled = (title: unknown, fallback: string) => {
  const t = clean(title);
  return t ? `"${t}"` : fallback;
};

/*
 * Greetings (Hamza, 27 Nov 2026: "less AI"). The first two messages ever to a
 * person say who Hamza is, once, naturally; after that it is a normal text with
 * no introduction, no sign-off and no rotating set phrases. Whether a message
 * is one of the first two comes from the log (introNeeded in lib/sent-log.ts).
 */

/** "hi Amelia," or, in the first two messages, "hi Amelia, it's Hamza." (no name: "hi,"). */
export function studentHello(name: string, intro = false): string {
  const hi = name ? `hi ${name},` : "hi,";
  return intro ? `${hi} it's Hamza.` : hi;
}

/**
 * "assalamualaikum." or, in the first two messages, "assalamualaikum, this is
 * Hamza, Amelia's economics teacher." (the subject only when the message is about one).
 */
export function parentHello(name: string, intro = false, subject = ""): string {
  if (!intro) return "assalamualaikum.";
  const s = lowSubject(subject);
  return `assalamualaikum, this is Hamza, ${name ? `${name}'s` : "your child's"} ${s ? `${s} ` : ""}teacher.`;
}

/** Hamza's sign-off, only under the first two messages to a parent. */
export const PARENT_SIGN = "\n\nHamza";

/** Puts a link above the sign-off (or at the end when there is none). */
export function withLink(text: string, link: string): string {
  const l = clean(link);
  if (!l) return text;
  return text.endsWith(PARENT_SIGN) ? `${text.slice(0, -PARENT_SIGN.length)}\n\n${l}${PARENT_SIGN}` : `${text}\n\n${l}`;
}

/** The plain, always-safe check-in each audience falls back to (its one short question is the point of it). */
export function checkIn(audience: "student" | "parent", name: string, intro = false): string {
  return audience === "student"
    ? `${studentHello(name, intro)} how are your classes going?`
    : `${parentHello(name, intro)} how is ${name || "your child"} finding the classes?${intro ? PARENT_SIGN : ""}`;
}

const tidy = (text: string) =>
  text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,!?;:])/g, "$1")
    .replace(/,\./g, ".")
    .replace(/(^|[^.])\.\.(?!\.)/g, "$1.")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const BROKEN = /\bundefined\b|\bnull\b|\bNaN\b|Invalid Date|[{}]|""|“”|\(\s*\)|\[\s*\]/;

/**
 * The last check before a message leaves: tidies spacing and stray full
 * stops, then refuses anything still broken and returns `fallback` instead.
 * `allow` lists exact values that may legitimately contain odd text (a
 * username, a password, a link) so they aren't mistaken for a fault.
 */
export function guardMessage(text: string, fallback: string, allow: string[] = []): string {
  // Allowed values are set aside first, so tidying never touches a password or link.
  const kept = allow.filter(Boolean).sort((x, y) => y.length - x.length);
  const hide = (t: string) => kept.reduce((acc, a, i) => acc.split(a).join(`\u0000${i}\u0000`), t);
  const show = (t: string) => kept.reduce((acc, a, i) => acc.split(`\u0000${i}\u0000`).join(a), t);
  const t = tidy(hide(String(text ?? "")));
  return t && !BROKEN.test(t) ? show(t) : show(tidy(hide(String(fallback ?? ""))));
}

/** True when a message would pass the guard unchanged in meaning (for tests). */
export const isBroken = (text: string) => BROKEN.test(text);
