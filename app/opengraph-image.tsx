import { ImageResponse } from "next/og";

/**
 * Default share image (WhatsApp, Instagram DMs, Facebook, Google). Drawn in
 * code from the brand tokens so it never goes stale. Swap for a designed
 * 1200x630 PNG (app/opengraph-image.png) when one exists.
 */
export const alt = "Hamza Teaches: Accounting, Business and Economics tuition for O Level, IGCSE and A Level";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#212427",
          color: "#F0EDE8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 24, letterSpacing: 6, color: "#FBC159", fontWeight: 700 }}>
          O LEVEL · IGCSE · AS · A2
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 960 }}>
            Accounting, Business and Economics tuition
          </div>
          <div style={{ marginTop: 28, fontSize: 36, color: "#B0B6BB" }}>
            Start from scratch. Finish exam ready.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#FBC159" }}>hamzateaches.com</div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              color: "#1B1E21",
              background: "#FBC159",
              padding: "14px 30px",
              borderRadius: 999,
            }}
          >
            Free trial lesson
          </div>
        </div>
      </div>
    ),
    size,
  );
}
