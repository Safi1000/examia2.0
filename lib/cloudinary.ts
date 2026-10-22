"use client";

/**
 * Cloudinary unsigned upload. Replaces the demo's base64 data URLs with a hosted
 * asset: the browser POSTs the file straight to Cloudinary with an unsigned
 * preset and we keep the returned secure_url (stored in answers.photo_url).
 */
import { CLOUDINARY_CLOUD, CLOUDINARY_NOTES_PRESET, CLOUDINARY_PRESET } from "@/lib/config";
import { shrinkImage } from "@/lib/shrink-image";

export function cloudinaryConfigured(): boolean {
  return Boolean(CLOUDINARY_CLOUD && CLOUDINARY_PRESET);
}

export function notesConfigured(): boolean {
  return Boolean(CLOUDINARY_CLOUD && CLOUDINARY_NOTES_PRESET);
}

/** Upload any file (PDF, docx, image…) using the notes preset (resource_type: raw). */
export async function uploadNote(file: File): Promise<{ url: string; fileType: string; fileName: string }> {
  if (!CLOUDINARY_CLOUD) {
    throw new Error("Cloudinary is not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD.");
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_NOTES_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/raw/upload`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Cloudinary upload failed", res.status, detail);
    throw new Error("That file didn't upload. Try again.");
  }
  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) throw new Error("Cloudinary upload returned no secure_url.");
  return { url: json.secure_url, fileType: file.type || "application/octet-stream", fileName: file.name };
}

/** Upload progress: 0 to 1. */
export type OnProgress = (fraction: number) => void;

/** POST to Cloudinary with upload progress (fetch can't report it). */
function postWithProgress(url: string, form: FormData, onProgress?: OnProgress): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new Error("Upload failed. Check your internet and try again."));
    // A stalled connection must end, so the student can simply try again.
    xhr.timeout = 120_000;
    xhr.ontimeout = () => reject(new Error("The upload took too long. Check your internet and try again."));
    xhr.onabort = () => reject(new Error("Upload stopped. Try again."));
    xhr.send(form);
  });
}

export async function uploadImage(file: File, onProgress?: OnProgress): Promise<string> {
  if (!cloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD and NEXT_PUBLIC_CLOUDINARY_PRESET.",
    );
  }
  // Shrink phone photos on the device first: the main reason uploads were slow.
  const small = await shrinkImage(file);
  const form = new FormData();
  form.append("file", small);
  form.append("upload_preset", CLOUDINARY_PRESET);

  const res = await postWithProgress(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, form, onProgress);
  if (!res.ok) {
    console.error("Cloudinary upload failed", res.status, res.text);
    throw new Error("That photo didn't upload. Try again.");
  }
  const json = JSON.parse(res.text) as { secure_url?: string };
  if (!json.secure_url) throw new Error("Cloudinary upload returned no secure_url.");
  onProgress?.(1);
  return json.secure_url;
}

/**
 * Upload a PDF and get back one image URL per page.
 *
 * Cloudinary rasterises PDF pages on delivery (`pg_N`), so a PDF becomes an
 * ordinary list of images — which is what every viewer here already handles:
 * inline display, scrolling and the grader's annotation layer all work without
 * a PDF engine in the browser.
 *
 * NOTE: this account has raw PDF delivery disabled (the .pdf URL answers 401),
 * so the original file is deliberately not linked anywhere. Turning on
 * "PDF and ZIP files delivery" in the Cloudinary console would allow that too.
 */
export async function uploadPdfPages(file: File, onProgress?: OnProgress): Promise<string[]> {
  if (!cloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD and NEXT_PUBLIC_CLOUDINARY_PRESET.",
    );
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_PRESET);

  const res = await postWithProgress(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, form, onProgress);
  if (!res.ok) {
    console.error("PDF upload failed", res.status, res.text);
    throw new Error("That PDF didn't upload. Try again.");
  }
  const json = JSON.parse(res.text) as { secure_url?: string; pages?: number };
  onProgress?.(1);
  if (!json.secure_url) throw new Error("Cloudinary upload returned no secure_url.");
  const pages = Math.max(1, json.pages ?? 1);
  return Array.from({ length: pages }, (_, i) =>
    json.secure_url!.replace("/upload/", `/upload/pg_${i + 1}/`).replace(/\.pdf$/i, ".jpg"),
  );
}

/** Picked file -> image URLs: images give one, PDFs give one per page. */
export async function uploadAsImages(file: File, onProgress?: OnProgress): Promise<string[]> {
  if (file.type === "application/pdf") return uploadPdfPages(file, onProgress);
  return [await uploadImage(file, onProgress)];
}
