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

const drive = (id: string) => `https://drive.google.com/file/d/${id}/view`;

/** Videos first, then voice notes. Drive files must stay shared as
 *  "anyone with the link"; YouTube (unlisted is fine) loads faster. Add a
 *  student's first name in `name` once they've agreed. */
export const VIDEO_REVIEWS: VideoReview[] = [
  // On camera (9:16)
  { kind: "video", ratio: 9 / 16, name: "", meta: "On camera", quote: "", src: drive("11QIKq4c54ljRzTF-UvZXF_EA9NMtOubB") },
  { kind: "video", ratio: 9 / 16, name: "", meta: "On camera", quote: "", src: "https://youtube.com/shorts/FceZFLYhPSM" },
  { kind: "video", ratio: 9 / 16, name: "", meta: "On camera", quote: "", src: drive("1FeMOIR87bJh3Ie0L2ioa5TTmOJ36Vx2U") },
  { kind: "video", ratio: 9 / 16, name: "", meta: "On camera", quote: "", src: drive("1U4Mb-lrc8XjEDClTMjpZi1QAux1FWAoN") },
  { kind: "video", ratio: 9 / 16, name: "", meta: "On camera", quote: "", src: drive("1V5tFZrcqeGXHmxR_UGnMKAVhsz4ivzF9") },
  // Voice notes (screen recordings, each its own shape)
  { kind: "voice", ratio: 1080 / 1178, name: "", meta: "Voice note", quote: "", src: "https://youtube.com/shorts/zjlHTRHlDn8" },
  { kind: "voice", ratio: 1000 / 1065, name: "", meta: "Voice note", quote: "", src: drive("1GYoJtalJs8haGZkfLMEXY_4FhqoBbCJX") },
  { kind: "voice", ratio: 1000 / 695, name: "", meta: "Voice note", quote: "", src: drive("1bqRqGrfyOAzSCWIBqNp7MBX_M2oIgOh7") },
  { kind: "voice", ratio: 1000 / 664, name: "", meta: "Voice note", quote: "", src: drive("1wdtAAHuBno-lHcpXCin2Z6de5r6o_qBE") },
];

/** WhatsApp screenshots are 900 x 1524. */
export const SHOT_RATIO = 900 / 1524;

export const SHOTS: Shot[] = [
  { src: "/reviews/armaan.jpg", name: "Armaan", meta: "AS · Business", alt: "WhatsApp message from Armaan about his Business classes" },
  { src: "/reviews/talal.jpg", name: "Talal", meta: "Business", alt: "WhatsApp message from Talal about his Business classes" },
  { src: "/reviews/meerab.jpg", name: "Meerab", meta: "AS Level", alt: "WhatsApp message from Meerab about her classes" },
];
