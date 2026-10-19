import { ImageResponse } from "next/og";

/** iPhone home-screen icon: the same gold "ht" as app/icon.svg, as a PNG.
 * Keeps the dark square: iPhones fill a see-through icon with black. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1B1E21" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <g transform="translate(6.4 6.4) scale(0.8)" fill="none" stroke="#FBC159" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 52 C13 38 15.5 23 18.5 13 C20 8 25.5 8.5 24 14 C21.5 23 16.5 37 13.5 52" />
            <path d="M15.5 44 C19.5 36 23.5 31.5 28 31.5 C32 31.5 33 35.5 31 41.5 C30 45.5 30.5 49.5 33.5 50.5 C35.5 51 37.5 50 39 47.5" />
            <path d="M43.5 17 C42.5 29 41.5 40 42.5 47.5 C43.5 52 48 52.5 52.5 49" />
            <path d="M36 29.5 C41 29 46.5 28.5 52 28" />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
