import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { COMPANY_NAME } from "@/lib/config";

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

async function fetchReport(token: string): Promise<ReportRow | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const { data, error } = await createClient(url, key).rpc("report_by_token", { p_token: token });
  if (error || !data?.length) return null;
  return data[0] as ReportRow;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const report = await fetchReport(token);
  if (!report) return { title: `Report · ${COMPANY_NAME}` };

  // WhatsApp reads these to build the preview card on the link.
  const title = `Monthly Progress Report · ${report.student_name}`;
  const description = `${monthLabel(report.month)} · ${COMPANY_NAME}`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: COMPANY_NAME, type: "article" },
    twitter: { card: "summary", title, description },
    robots: { index: false, follow: false },
  };
}

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await fetchReport(token);

  if (!report) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="font-display text-2xl font-bold text-ink">This link has expired</h1>
        <p className="mt-2 text-sm text-ink-2">
          Report links stay live for 90 days. Ask {COMPANY_NAME} for a fresh one.
        </p>
      </main>
    );
  }

  const downloadHref = `/api/download?url=${encodeURIComponent(report.pdf_url)}&name=${encodeURIComponent(
    `report-${report.student_name}-${report.month.slice(0, 7)}.pdf`,
  )}`;

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-4 py-10">
      <header className="border-b border-border pb-5">
        <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-brand">{COMPANY_NAME}</p>
        <h1 className="mt-2 font-display text-3xl font-bold capitalize text-ink">{report.student_name}</h1>
        <p className="mt-1 text-sm text-ink-2">Monthly Progress Report · {monthLabel(report.month)}</p>
      </header>

      {report.teacher_note && (
        <section className="mt-6 rounded-lg border border-brand/30 bg-brand-soft/40 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-brand">From the teacher</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{report.teacher_note}</p>
        </section>
      )}

      <section className="mt-6">
        <a
          href={downloadHref}
          className="inline-flex h-12 items-center justify-center rounded-md bg-brand px-6 text-sm font-semibold text-on-brand"
        >
          Download PDF
        </a>
        <p className="mt-3 text-xs text-ink-3">
          This link is private and stops working on{" "}
          {new Date(report.expires_at).toLocaleDateString("default", { day: "numeric", month: "long", year: "numeric" })}.
        </p>
      </section>

      <iframe
        src={`${downloadHref}#toolbar=0`}
        title="Monthly report"
        className="mt-6 h-[70vh] w-full rounded-lg border border-border bg-surface"
      />
    </main>
  );
}
