import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { COMPANY_NAME } from "@/lib/config";

/**
 * The card WhatsApp shows when the report link is pasted into a chat.
 *
 * Rendered on the server so it needs no image asset, and it names the student
 * and the month — a parent sees what the link is before they tap it.
 */
export const runtime = "nodejs";
export const alt = "Monthly Progress Report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let studentName = "";
  let month = "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) {
    const { data } = await createClient(url, key).rpc("report_by_token", { p_token: token });
    const row = data?.[0] as { student_name: string; month: string } | undefined;
    if (row) {
      studentName = row.student_name;
      const [y, m] = row.month.split("-");
      month = new Date(Number(y), Number(m) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#1a1f20",
          color: "#e9ecef",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 30, letterSpacing: 8, color: "#FBC159", textTransform: "uppercase" }}>
          {COMPANY_NAME}
        </div>
        <div style={{ fontSize: 68, fontWeight: 700, marginTop: 24, textTransform: "capitalize" }}>
          {studentName || "Progress report"}
        </div>
        <div style={{ fontSize: 36, marginTop: 12, color: "#8a949a" }}>
          Monthly Progress Report{month ? ` · ${month}` : ""}
        </div>
        <div style={{ marginTop: 48, height: 6, width: 180, background: "#FBC159" }} />
      </div>
    ),
    size,
  );
}
