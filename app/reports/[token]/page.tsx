import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { COMPANY_NAME } from "@/lib/config";
import { signDownloadUrl } from "@/lib/signed-view";
import { displayName } from "@/lib/display-name";

/**
 * The parent's view of a monthly report.
 *
 * No login: the link itself is the credential, it is unguessable, and it stops
 * working after 90 days. The row is fetched through `report_by_token`, which
 * returns that one report and nothing else, so anonymous visitors never get a
 * readable view of the reports table.
 */
export const dynamic = "force-dynamic";

interface ReportRow {
  student_name: string;
  month: string;
  pdf_url: string;
  teacher_note: string | null;
  expires_at: string;
}

/**
 * The report, or why there is none: "gone" (no such link, or past its 90 days;
 * the lookup cannot tell these apart) or "error" (the lookup itself failed, so
 * trying again later may work).
 */
async function fetchReport(token: string): Promise<ReportRow | "gone" | "error"> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return "error";
  try {
    const { data, error } = await createClient(url, key).rpc("report_by_token", { p_token: token });
    if (error) return "error";
    if (!data?.length) return "gone";
    return data[0] as ReportRow;
  } catch {
    return "error";
  }
}

// Fixed locale and time zone: the server's own would decide otherwise (Pakistan time is what parents live by).
function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

const NO_INDEX: Metadata["robots"] = { index: false, follow: false };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const report = await fetchReport(token);
  // A private page either way: never in search results, even when the link no longer works.
  if (typeof report === "string") return { title: `Report · ${COMPANY_NAME}`, robots: NO_INDEX };

  // WhatsApp reads these to build the preview card on the link.
  const title = `Monthly Progress Report · ${displayName(report.student_name)}`;
  const description = `${monthLabel(report.month)} · ${COMPANY_NAME}`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: COMPANY_NAME, type: "article" },
    twitter: { card: "summary", title, description },
    robots: NO_INDEX,
  };
}

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await fetchReport(token);

  if (typeof report === "string") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">
          {report === "error" ? "The report didn\u2019t load" : "This link isn\u2019t working"}
        </h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-2">
          {report === "error"
            ? "Please try again in a few minutes."
            : `It may have expired (report links stay live for 90 days) or been cut short when it was copied. Ask ${COMPANY_NAME} for a fresh one.`}
        </p>
      </main>
    );
  }

  const name = displayName(report.student_name) || report.student_name;

  // Signed here, after the token lookup proved access; valid for an hour.
  const downloadHref = signDownloadUrl(report.pdf_url, `report-${report.student_name}-${report.month.slice(0, 7)}.pdf`);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 py-12 md:py-16">
      <header className="border-b border-hairline pb-6">
        <p className="text-[14px] font-semibold text-brand">{COMPANY_NAME}</p>
        <h1 className="mt-2 break-words font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">{name}</h1>
        <p className="mt-2 text-[15px] tabular-nums text-ink-2">Monthly Progress Report · {monthLabel(report.month)}</p>
      </header>

      {report.teacher_note && (
        <section className="surface mt-8 rounded-[20px] px-5 py-5">
          <h2 className="text-[14px] font-semibold text-brand">From the teacher</h2>
          <p className="mt-2 max-w-[68ch] whitespace-pre-wrap break-words text-[16px] leading-relaxed text-ink">{report.teacher_note}</p>
        </section>
      )}

      <section className="mt-8">
        <a
          href={downloadHref}
          className="inline-flex h-12 items-center justify-center rounded-full bg-brand px-6 text-[15px] font-semibold text-on-brand transition-colors hover:bg-[#ffd07a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Download PDF
        </a>
        <p className="mt-3 text-[13px] text-ink-3">
          This link is private and stops working on{" "}
          {new Date(report.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" })}.
        </p>
      </section>

      <iframe
        src={`${downloadHref}&inline=1#toolbar=0`}
        title="Monthly report"
        className="mt-8 h-[70vh] w-full rounded-[20px] border border-hairline bg-surface"
      />
    </main>
  );
}
