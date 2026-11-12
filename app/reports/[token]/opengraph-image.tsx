import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { COMPANY_NAME } from "@/lib/config";
import { displayName, firstName } from "@/lib/display-name";
import { isReportLinkLive } from "@/lib/report-data";

/**
 * The card WhatsApp shows when the report link is pasted into a chat.
 *
 * Rendered on the server so it needs no image asset. It names the student by
 * first name only and the month, so a parent sees what the link is before they
 * tap it. A link that has finished, or never existed, gets the plain card.
 */
export const runtime = "nodejs";
export const alt = "Monthly progress report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let studentName = "";
  let month = "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key && /^[A-Za-z0-9]{8,64}$/.test(token)) {
    const { data } = await createClient(url, key).rpc("report_by_token", { p_token: token });
    const row = data?.[0] as { student_name: string; month: string; expires_at: string } | undefined;
    if (row && isReportLinkLive(row.expires_at)) {
      // First name only, never the raw username.
      studentName = displayName(row.student_name) ? firstName(row.student_name) : "";
      const [y, m] = row.month.split("-");
      month = new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
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
        <div style={{ fontSize: 68, fontWeight: 700, marginTop: 24 }}>
          {studentName ? `${studentName}\u2019s report` : "Monthly report"}
        </div>
        <div style={{ fontSize: 36, marginTop: 12, color: "#8a949a" }}>
          {month ? `Monthly progress report · ${month}` : "Monthly progress report"}
        </div>
        <div style={{ marginTop: 48, height: 6, width: 180, background: "#FBC159" }} />
      </div>
    ),
    size,
  );
}
