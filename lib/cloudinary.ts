"use client";

/**
 * Cloudinary unsigned upload. Replaces the demo's base64 data URLs with a hosted
 * asset: the browser POSTs the file straight to Cloudinary with an unsigned
 * preset and we keep the returned secure_url (stored in answers.photo_url).
 */
import { CLOUDINARY_CLOUD, CLOUDINARY_NOTES_PRESET, CLOUDINARY_PRESET } from "@/lib/config";

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
    throw new Error(`Cloudinary upload failed (${res.status}). ${detail}`);
  }
  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) throw new Error("Cloudinary upload returned no secure_url.");
  return { url: json.secure_url, fileType: file.type || "application/octet-stream", fileName: file.name };
}

export async function uploadImage(file: File): Promise<string> {
  if (!cloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD and NEXT_PUBLIC_CLOUDINARY_PRESET.",
    );
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload failed (${res.status}). ${detail}`);
  }
  const json = (await res.json()) as { secure_url?: string };
  if (!json.secure_url) throw new Error("Cloudinary upload returned no secure_url.");
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
export async function uploadPdfPages(file: File): Promise<string[]> {
  if (!cloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Set NEXT_PUBLIC_CLOUDINARY_CLOUD and NEXT_PUBLIC_CLOUDINARY_PRESET.",
    );
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", CLOUDINARY_PRESET);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`PDF upload failed (${res.status}). ${detail}`);
  }
  const json = (await res.json()) as { secure_url?: string; pages?: number };
  if (!json.secure_url) throw new Error("Cloudinary upload returned no secure_url.");
  const pages = Math.max(1, json.pages ?? 1);
  return Array.from({ length: pages }, (_, i) =>
    json.secure_url!.replace("/upload/", `/upload/pg_${i + 1}/`).replace(/\.pdf$/i, ".jpg"),
  );
}

/** Picked file -> image URLs: images give one, PDFs give one per page. */
export async function uploadAsImages(file: File): Promise<string[]> {
  if (file.type === "application/pdf") return uploadPdfPages(file);
  return [await uploadImage(file)];
}
