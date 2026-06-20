"use client";

/**
 * Cloudinary unsigned upload. Replaces the demo's base64 data URLs with a hosted
 * asset: the browser POSTs the file straight to Cloudinary with an unsigned
 * preset and we keep the returned secure_url (stored in answers.photo_url).
 */
import { CLOUDINARY_CLOUD, CLOUDINARY_PRESET } from "@/lib/config";

export function cloudinaryConfigured(): boolean {
  return Boolean(CLOUDINARY_CLOUD && CLOUDINARY_PRESET);
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
