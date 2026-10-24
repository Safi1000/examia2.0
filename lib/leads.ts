/** Sign-ups for future products and free resources (the waitlist). */
export const INTERESTS = [
  { id: "notes", label: "Revision notes pack" },
  { id: "crash-course", label: "Past paper crash course (March to April)" },
  { id: "recorded", label: "Recorded course I can watch any time" },
  { id: "tools", label: "New free tools and guides" },
] as const;
export type InterestId = (typeof INTERESTS)[number]["id"];

export interface Lead {
  id: string;
  name: string;
  /** WhatsApp, E.164. */
  phone: string;
  level: string;
  subjects: string[];
  interests: InterestId[];
  /** Page it came from. */
  source: string;
  createdAt: string;
}
