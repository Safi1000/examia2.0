/**
 * Landing-page seam. Kept separate from lib/config.ts so the marketing surface
 * can evolve without touching the portal's brand/auth wiring.
 *
 * Nothing here talks to the database: Examia has no `leads` table and the
 * portal's auth is admin-provisioned, so the lead form is capture-only and the
 * conversion path is WhatsApp -> admin creates the student -> /login.
 */
import { COMPANY_NAME } from "@/lib/config";

export type SubjectName = "Accounting" | "Business" | "Economics";
export type LevelName = "O Level / IGCSE" | "AS Level" | "A2 Level";

export const LANDING = {
  /** Digits only, full international form (e.g. 923001234567). */
  waNumber: process.env.NEXT_PUBLIC_WA_NUMBER || "",
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM || "https://instagram.com/hamzateaches",
  brand: COMPANY_NAME,
  /** The hero VSL. YouTube / Vimeo / direct .mp4 all work. */
  heroVideo: process.env.NEXT_PUBLIC_HERO_VIDEO || "",
  /** Optional poster frame behind the hero play button. */
  heroPoster: process.env.NEXT_PUBLIC_HERO_POSTER || "",
} as const;

/* ---------------------------------------------------------------------------
 * VIDEO SOURCES — paste URLs here and they render. Every player accepts a
 * YouTube link, a Vimeo link, or a direct file URL (.mp4/.webm/.mov); see
 * toEmbedUrl/isFileVideo below. Anything left blank falls back to a placeholder
 * instead of an empty black iframe.
 * ------------------------------------------------------------------------- */

/** Trial lessons, keyed `${subject}|${level}`. */
const TRIAL_VIDEOS: Partial<Record<string, string>> = {
  // "Accounting|O Level / IGCSE": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
  // "Accounting|AS Level": "",
  // "Accounting|A2 Level": "",
  // "Business|O Level / IGCSE": "",
  // "Business|AS Level": "",
  // "Business|A2 Level": "",
  // "Economics|O Level / IGCSE": "",
  // "Economics|AS Level": "",
  // "Economics|A2 Level": "",
};

export function trialVideoFor(subject: SubjectName, level: LevelName): string | null {
  return TRIAL_VIDEOS[`${subject}|${level}`] || null;
}

/** True for URLs a native <video> can play directly. */
export function isFileVideo(url: string): boolean {
  return /\.(mp4|webm|ogv|mov|m4v)(\?|$)/i.test(url);
}

/**
 * Normalises a share link into something an <iframe> can load. Returns the URL
 * untouched if it is already an embed URL or an unrecognised host.
 */
export function toEmbedUrl(url: string, autoplay = true): string {
  const auto = autoplay ? 1 : 0;

  // youtu.be/ID  |  youtube.com/watch?v=ID  |  youtube.com/shorts/ID
  const yt =
    url.match(/youtu\.be\/([\w-]{6,})/) ||
    url.match(/[?&]v=([\w-]{6,})/) ||
    url.match(/youtube\.com\/(?:embed|shorts)\/([\w-]{6,})/);
  if (yt) {
    return `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=${auto}&rel=0&modestbranding=1&playsinline=1`;
  }

  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=${auto}&byline=0&portrait=0`;
  }

  return url;
}

/** Prefills the chat with the subject/level the visitor picked. */
export function waLink(ctx?: { subject?: SubjectName; level?: LevelName }): string {
  const text = ctx?.subject
    ? `Hi, I'd like to start ${ctx.subject}${ctx.level ? ` (${ctx.level})` : ""}.`
    : "Hi, I'd like to know more about your classes.";
  return `https://wa.me/${LANDING.waNumber}?text=${encodeURIComponent(text)}`;
}

/** Accepts local (03xx xxxxxxx) and international forms; 10-15 digits. */
export function validatePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export interface Lead {
  name: string;
  number: string;
  subject?: SubjectName;
  level?: LevelName;
  message?: string;
}

/**
 * Capture-only. There is no `leads` table in the Examia schema and adding one
 * was explicitly out of scope, so this resolves without persisting. Point it at
 * a table or an edge function when lead storage is wanted — every caller
 * already awaits it and handles rejection.
 */
export async function submitLead(lead: Lead): Promise<void> {
  track("lead_captured", { subject: lead.subject, level: lead.level });
}

/** Analytics seam — no vendor wired up, so this is a no-op in production. */
export function track(event: string, props: Record<string, unknown> = {}): void {
  if (process.env.NODE_ENV === "development") {
    console.debug("[landing]", event, props);
  }
}

/** Right-hand scroll rail. Ids must match the section ids rendered on `/`. */
export const RAIL_SECTIONS: Array<{ id: string; label: string }> = [
  { id: "top", label: "Top" },
  { id: "picker", label: "Free lesson" },
  { id: "compare", label: "Difference" },
  { id: "teach", label: "How I teach" },
  { id: "inside", label: "Inside a class" },
  { id: "meet", label: "Meet Hamza" },
  { id: "reviews", label: "Reviews" },
  { id: "faq", label: "FAQ" },
];
