import { ImageResponse } from "next/og";

/** iPhone home-screen icon: the same gold "h" as app/icon.svg, as a PNG. */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#1B1E21" }}>
        <svg width="180" height="180" viewBox="0 0 64 64">
          <g fill="none" stroke="#FBC159" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 52 C 24 38 26 23 29 13 C 30.5 8 36 8.5 34.5 14 C 32 23 27 37 24 52" />
            <path d="M25 44 C 29 36 34 31.5 39 31.5 C 44 31.5 45 35.5 43 41.5 C 41.8 45.5 42 49.5 45 51 C 47 52 49.5 51 51.5 48.5" />
          </g>
        </svg>
      </div>
    ),
    size,
  );
}
