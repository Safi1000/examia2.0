/**
 * The install manifest for the portal, at the same address as before
 * (/manifest.webmanifest). It is a plain route rather than app/manifest.ts on
 * purpose: Next links app/manifest.ts on every page, which made Chrome offer
 * "Install app" to every visitor. Now only signed-in students and the teacher
 * get the link (components/PortalManifest.tsx).
 */
export const dynamic = "force-static";

const MANIFEST = {
  name: "Hamza Teaches",
  short_name: "Hamza Teaches",
  description: "Your classes, tests and marks with Hamza Teaches.",
  start_url: "/dashboard",
  scope: "/",
  display: "standalone",
  // The page background (--color-paper), so the launch screen does not change shade as the app opens.
  background_color: "#1a1d20",
  theme_color: "#1a1d20",
  icons: [
    // New addresses (not /app-icon/...) so Chrome sees the icon changed and updates installed copies:
    // the old "ht" icons were cached by browsers for a year under the old addresses.
    { src: "/brand-icons/app-192.png?v=2", sizes: "192x192", type: "image/png" },
    { src: "/brand-icons/app-512.png?v=2", sizes: "512x512", type: "image/png" },
    { src: "/brand-icons/app-512-maskable.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export function GET() {
  return new Response(JSON.stringify(MANIFEST), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=0, must-revalidate" },
  });
}
