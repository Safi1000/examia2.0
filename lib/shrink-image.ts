/**
 * Makes phone photos small before they leave the device.
 *
 * A camera photo is 3-10 MB; on mobile data that is what made uploads crawl.
 * Resizing the long edge to 2000px and saving as JPEG keeps handwriting sharp
 * for marking and brings a page down to roughly 300-700 KB.
 *
 * Anything the browser can't decode (e.g. HEIC outside Safari) or that would
 * not get smaller is sent as it is, so an upload never fails because of this.
 */
const MAX_EDGE = 2000;
const QUALITY = 0.82;
const SKIP_BELOW = 700 * 1024;

export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < SKIP_BELOW) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // transparent PNGs become white pages, not black
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
