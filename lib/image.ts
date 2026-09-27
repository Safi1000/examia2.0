"use client";

/**
 * Centre-crop a picked image to a square and shrink it before upload.
 *
 * Profile photos are shown at thumbnail size everywhere, so shipping the
 * original 4000px camera shot would cost every roster page a few megabytes for
 * nothing.
 */
export async function squareThumbnail(file: File, size = 512): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the image.");
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) throw new Error("Could not prepare the image.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
