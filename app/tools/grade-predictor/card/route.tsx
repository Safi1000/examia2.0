import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

/**
 * Shareable result card (1080 x 1920, story size) for the grade predictor:
 * grade, subject and level only. No marks or names, so it's safe to post.
 */
export const runtime = "edge";

const clean = (v: string | null, max: number) => (v ?? "").replace(/[^\w* /-]/g, "").slice(0, max);

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const grade = clean(q.get("g"), 2) || "?";
  const subject = clean(q.get("s"), 20);
  const level = clean(q.get("l"), 12);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "140px 110px",
          background: "radial-gradient(circle at 80% 10%, #2E2510 0%, #1B1E21 55%)",
          color: "#F0EDE8",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, letterSpacing: 8, color: "#FBC159" }}>MY PREDICTED GRADE</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 440, fontWeight: 800, lineHeight: 1, color: "#FBC159" }}>{grade}</div>
          <div style={{ display: "flex", marginTop: 40, fontSize: 64, fontWeight: 700 }}>{subject}</div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 44, color: "#B0B6BB" }}>{level} · Cambridge</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 40, color: "#B0B6BB" }}>Check yours free at</div>
          <div style={{ display: "flex", marginTop: 10, fontSize: 52, fontWeight: 700 }}>hamzateaches.com</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920 },
  );
}
