import { ImageResponse } from "next/og";
import { articleSlugs, getArticle } from "@/lib/blog";

export const alt = "Hamza Teaches article";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return articleSlugs().map((slug) => ({ slug }));
}

/** Per-article share image: subject and level, then the title. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getArticle((await params).slug);
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
          {a ? `${a.subject} · ${a.level}`.toUpperCase() : "HAMZA TEACHES"}
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.5, maxWidth: 1040 }}>
          {a?.title ?? "The Exam Room"}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#FBC159" }}>hamzateaches.com</div>
          <div style={{ fontSize: 26, color: "#B0B6BB" }}>{a?.code ?? ""}</div>
        </div>
      </div>
    ),
    size,
  );
}
