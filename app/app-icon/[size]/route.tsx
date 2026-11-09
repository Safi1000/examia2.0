import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The Pencil Balance mark at its old addresses, kept so older links still
 * work. manifest.ts, sw.js and the focus-sound player now use
 * /brand-icons/*.png?v=2 directly, so installed copies pick up the new icon. "512-maskable" has extra space so Android can crop it
 * to a circle or squircle without cutting the mark.
 */

export const dynamic = "force-static";
export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }, { size: "512-maskable" }];
}

const FILES: Record<string, string> = {
  "192": "app-192.png",
  "512": "app-512.png",
  "512-maskable": "app-512-maskable.png",
};

export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const file = FILES[size] ?? FILES["192"];
  const png = await readFile(path.join(process.cwd(), "public", "brand-icons", file));
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
  });
}
