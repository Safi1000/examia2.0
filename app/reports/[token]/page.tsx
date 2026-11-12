import type { Metadata } from "next";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { COMPANY_NAME } from "@/lib/config";
import { signDownloadUrl } from "@/lib/signed-view";
import { displayName, firstName } from "@/lib/display-name";
import { isReportLinkLive, reportLinkDay } from "@/lib/report-data";
import { OpenReportLink, ReportPreview } from "./ReportPreview";

/**
 * The parent's view of a monthly report.
 *
 * No login: the link itself is the credential, it is unguessable, and it stops
 * working 7 days after Hamza sends it (`reports.expires_at`, set by the store).
 * The row is fetched through `report_by_token`, which returns that one report
 * and nothing else and only while it is in date, so anonymous visitors never
 * get a readable view of the reports table.
 */
export const dynamic = "force-dynamic";

interface ReportRow {
  student_name: string;
  month: string;
  pdf_url: string;
  teacher_note: string | null;
  expires_at: string;
}

const TOKEN_SHAPE = /^[A-Za-z0-9]{8,64}$/;

/**
 * The report, or why there is none: "finished" (a real link past its 7 days),
 * "gone" (no such link: mistyped, cut short, or replaced by a newer one) or
 * "error" (the lookup itself failed, so trying again later may work).
 */
async function fetchReport(token: string): Promise<ReportRow | "finished" | "gone" | "error"> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return "error";
  if (!TOKEN_SHAPE.test(token)) return "gone";
  try {
    const { data, error } = await createClient(url, key).rpc("report_by_token", { p_token: token });
    if (error) return "error";
    const row = data?.[0] as ReportRow | undefined;
    // The lookup already leaves out links past their date; checked here too.
    if (row && isReportLinkLive(row.expires_at)) return row;
    return (await linkFinished(token)) ? "finished" : "gone";
  } catch {
    return "error";
  }
}

/**
 * Whether the token belongs to a report whose link has run out. The public
 * lookup can't tell "expired" from "never existed", so this asks for the
 * expiry date alone with the server's key (never sent to the browser). Without
 * that key the page simply shows the "isn't working" message.
 */
async function linkFinished(token: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const { data } = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      .from("reports")
      .select("expires_at")
      .eq("token", token)
      .maybeSingle();
    return !!data && !isReportLinkLive((data as { expires_at: string }).expires_at);
  } catch {
    return false;
  }
}

// Fixed locale and time zone: the server's own would decide otherwise.
function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Amelia's", or "Your child's" when the username gives no usable name. Never the raw username. */
function whose(username: string): string {
  const name = displayName(username) ? firstName(username) : "";
  return name ? `${name}\u2019s` : "Your child\u2019s";
}

/**
 * Android browsers and in-app browsers (WhatsApp, Instagram, Facebook) mostly
 * show an inline PDF as an empty box, and most parents open the link there.
 * There the preview and the Open button are left out and Download does the job.
 */
const INLINE_PDF_UNRELIABLE = /Android|; wv\)|WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly/i;

const NO_INDEX: Metadata["robots"] = { index: false, follow: false, nocache: true };

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
  const title = `${whose(report.student_name)} report for ${monthLabel(report.month)}`;
  const description = `Monthly progress report from ${COMPANY_NAME}. Open to read or download.`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: COMPANY_NAME, type: "article" },
    twitter: { card: "summary_large_image", title, description },
    robots: NO_INDEX,
  };
}

/**
 * The PDF's address for this visit: signed on the server after the token
 * lookup proved access, sealed so the stored file address is never shown, and
 * dead within the hour or when the link finishes, whichever comes first.
 */
function signedFileHref(report: ReportRow): string {
  const msLeft = new Date(report.expires_at).getTime() - Date.now();
  const fileName = `report-${firstName(report.student_name).toLowerCase() || "student"}-${report.month.slice(0, 7)}.pdf`;
  return signDownloadUrl(report.pdf_url, fileName, Math.max(0, Math.min(60 * 60_000, msLeft)));
}

/** The quiet page for every state without a report: brand, one heading, one line. */
function NoReport({ title, line }: { title: string; line: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
      <p className="text-[14px] font-semibold text-brand">{COMPANY_NAME}</p>
      <h1 className="mt-3 font-display text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-2">{line}</p>
    </main>
  );
}

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const report = await fetchReport(token);

  if (report === "error") return <NoReport title={"The report didn’t load"} line="Please try again in a few minutes." />;
  if (report === "finished")
    return <NoReport title="This link has finished" line="Report links work for 7 days. Please ask Hamza for a new one." />;
  if (report === "gone")
    return (
      <NoReport
        title={"This link isn’t working"}
        line="It may have been cut short when it was copied, or replaced by a newer link. Please ask Hamza for a fresh one."
      />
    );

  const downloadHref = signedFileHref(report);
  // Decided here first, so an Android phone never paints the empty preview box at all.
  const preview = !INLINE_PDF_UNRELIABLE.test((await headers()).get("user-agent") ?? "");
  const inlineHref = `${downloadHref}&inline=1`;

  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-5 py-10 md:py-16">
      <header className="border-b border-hairline pb-6">
        <p className="text-[14px] font-semibold text-brand">{COMPANY_NAME}</p>
        <h1 className="mt-2 break-words font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
          {whose(report.student_name)} monthly report
        </h1>
        <p className="mt-2 text-[16px] tabular-nums text-ink-2">{monthLabel(report.month)}</p>
      </header>

      {report.teacher_note && (
        <section className="surface mt-8 rounded-[20px] px-5 py-5">
          <h2 className="text-[14px] font-semibold text-brand">From the teacher</h2>
          <p className="mt-2 max-w-[68ch] whitespace-pre-wrap break-words text-[16px] leading-relaxed text-ink">{report.teacher_note}</p>
        </section>
      )}

      <section className="mt-8">
        <div className="flex flex-wrap gap-3">
          <a
            href={downloadHref}
            className="inline-flex h-12 items-center justify-center rounded-full bg-brand px-6 text-[16px] font-semibold text-on-brand transition-colors hover:bg-gold-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Download the report
          </a>
          {preview && <OpenReportLink href={inlineHref} />}
        </div>
        {!preview && <p className="mt-3 text-[16px] text-ink-2">The report opens as a PDF on your phone.</p>}
        <p className="mt-3 text-[16px] text-ink-2">This link works until {reportLinkDay(report.expires_at)}.</p>
      </section>

      <ReportPreview src={`${inlineHref}#toolbar=0`} initialShow={preview} />
    </main>
  );
}
