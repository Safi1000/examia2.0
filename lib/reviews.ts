/**
 * Student reviews, shown on the homepage. Add a review by adding
 * a row. Video `src`: a YouTube / Vimeo / .mp4 link.
 *
 * TODO-ASK (Hamza): names, levels and a quoted line for the two video reviews,
 * plus written permission for every review shown.
 */
import type { Shot } from "@/components/landing/ReviewSlider";

export type VideoReview = {
  name: string;
  meta: string;
  quote: string;
  src?: string;
  poster?: string;
  /** "video" = student on camera, "voice" = a recorded voice note. */
  kind: "video" | "voice";
  /** Width divided by height of the actual video, so its card has no empty space. */
  ratio: number;
};

const yt = (id: string) => `https://youtu.be/${id}`;
/** Shorts link: the cover image then comes in the video's own shape, not a 16:9 box. */
const short = (id: string) => `https://youtube.com/shorts/${id}`;

/** Videos first, then voice notes. Drive files must stay shared as
 *  "anyone with the link"; YouTube (unlisted is fine) loads faster. Add a
 *  student's first name in `name` once they've agreed. */
export const VIDEO_REVIEWS: VideoReview[] = [
  // On camera (9:16)
  { kind: "video", ratio: 9 / 16, name: "Salar", meta: "O Level", quote: "", src: short("n5GIbBgd-pM") },
  { kind: "video", ratio: 9 / 16, name: "Mahrosh", meta: "O Level", quote: "", src: "https://youtube.com/shorts/FceZFLYhPSM" },
  { kind: "video", ratio: 9 / 16, name: "Hussain", meta: "A Level", quote: "", src: short("2cMbX3fzi2s") },
  { kind: "video", ratio: 9 / 16, name: "Mahnum", meta: "AS Level", quote: "", src: short("PKagXtcSP2o") },
  { kind: "video", ratio: 9 / 16, name: "Humble", meta: "O Level", quote: "", src: short("IqLl6J299BM") },
  // Voice notes (screen recordings, each its own shape)
  { kind: "voice", ratio: 1080 / 1178, name: "Hajrah", meta: "O Level", quote: "", src: "https://youtube.com/shorts/zjlHTRHlDn8" },
  { kind: "voice", ratio: 608 / 648, name: "Ibrahim", meta: "O Level", quote: "", src: short("OcgMrVw8-k4") },
  { kind: "voice", ratio: 518 / 360, name: "Insia", meta: "AS Level", quote: "", src: yt("kPVFoWDEcpg") },
  { kind: "voice", ratio: 542 / 360, name: "Zainab", meta: "O Level", quote: "", src: yt("7di8vBdkQLk") },
];

/** WhatsApp screenshots are 900 x 1524. */
export const SHOT_RATIO = 900 / 1524;

export const SHOTS: Shot[] = [
  { src: "/reviews/armaan.jpg", name: "Armaan", meta: "AS Level", alt: "WhatsApp message from Armaan about his Business classes" },
  { src: "/reviews/talal.jpg", name: "Talal", meta: "O Level", alt: "WhatsApp message from Talal about his Business classes" },
  { src: "/reviews/meerab.jpg", name: "Meerab", meta: "AS Level", alt: "WhatsApp message from Meerab about her classes" },
];
