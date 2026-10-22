import type { MetadataRoute } from "next";

/** Lets students (and Hamza) add the portal to their phone's home screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hamza Teaches",
    short_name: "Hamza Teaches",
    description: "Your classes, tests and marks with Hamza Teaches.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#17191C",
    theme_color: "#1a1d20",
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
