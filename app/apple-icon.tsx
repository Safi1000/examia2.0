import { readFile } from "node:fs/promises";
import path from "node:path";

/** iPhone home-screen icon: the Pencil Balance mark (same as the phone app's icon).
 * Served from public/brand-icons so it matches the app pixel for pixel. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const png = await readFile(path.join(process.cwd(), "public", "brand-icons", "apple-180.png"));
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
}
