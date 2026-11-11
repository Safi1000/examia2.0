import { firstName } from "@/lib/display-name";

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

/** A small, stable number from text (no randomness, so render stays pure). */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

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
 * The student's first name for a message ("amelia.k2" → "Amelia"), or "" when
 * nothing name-like can be made, so the greeting goes without a name rather
 * than showing a username with dots or digits.
 */
export function messageName(username: string | null | undefined): string {
  const name = clean(firstName(clean(username)));
  return name && /^[\p{L}][\p{L}' ]*$/u.test(name) ? name : "";
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

/** First letter upper case, for a clause that starts a sentence. */
export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A title in quotes, or the fallback words when there is no title. */
export const titled = (title: unknown, fallback: string) => {
  const t = clean(title);
  return t ? `"${t}"` : fallback;
};

/** "Hi Amelia," / "Assalamualaikum Amelia," / "Hello Amelia," (no name: "Hi,"), stable per student and message kind. */
export function studentHello(seed: string, name: string): string {
  const word = ["Hi", "Assalamualaikum", "Hello"][hash(`s|${seed}`) % 3];
  return name ? `${word} ${name},` : `${word},`;
}

/** One of three parent openings, stable per student and message kind. */
export function parentHello(seed: string): string {
  return ["Assalamualaikum.", "Assalamualaikum, this is Hamza.", "Hello, this is Hamza from Hamza Teaches."][hash(`p|${seed}`) % 3];
}

/** Hamza's sign-off under every parent message. */
export const PARENT_SIGN = "\n\nHamza";

/** Puts a link above the sign-off (or at the end when there is none). */
export function withLink(text: string, link: string): string {
  const l = clean(link);
  if (!l) return text;
  return text.endsWith(PARENT_SIGN) ? `${text.slice(0, -PARENT_SIGN.length)}\n\n${l}${PARENT_SIGN}` : `${text}\n\n${l}`;
}

/** The plain, always-safe check-in each audience falls back to. */
export function checkIn(audience: "student" | "parent", seed: string, name: string): string {
  return audience === "student"
    ? `${studentHello(seed, name)} I thought I'd ask how things are going. Message me any time.`
    : `${parentHello(seed)} I thought I'd ask how ${name || "your child"} is finding the classes. I'm happy to talk whenever suits you.${PARENT_SIGN}`;
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
