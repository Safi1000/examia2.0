"use client";

import { watchLabel } from "@/lib/watch";
import { openLater } from "@/lib/open-later";

import { useStudentProfiles } from "@/lib/student-profiles";
import { Avatar } from "@/components/student/Avatar";
import type { Profile } from "@/lib/profile";
import { currentStats } from "@/lib/focus";
import { useNow } from "@/hooks/useNow";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { isTa } from "@/lib/staff";
import Link from "next/link";
import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useDatabase, useStore } from "@/lib/data/store";
import { attendancePercent, cohortById, homeworkSetFor, studentById, submissionsForStudent, testById } from "@/lib/data/selectors";
import { isInPersonStudent } from "@/lib/in-person";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Badge, CohortDot, EmptyState, Icon, Modal } from "@/components/ui";
import { useToast } from "@/components/toast";
import { waDigits } from "@/lib/phone";
import { displayName } from "@/lib/display-name";
import { guardMessage, withLink } from "@/lib/outgoing-message";
import { parentReport } from "@/lib/portal-messages";
import { introNeeded, logMessage } from "@/lib/sent-log";
import { addDays, pkDate, useClassLinks } from "@/lib/classes";
import { usePausedIds } from "@/lib/paused";
import { classDay, subjectAttendance, subjectSummary } from "@/lib/subject-attendance";
import { notesConfigured, uploadNote } from "@/lib/cloudinary";
import { Button, buttonClasses } from "@/components/ui/Button";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";
import { MasteryBar } from "@/components/charts/MasteryBar";
import { LoginDetails } from "@/components/admin/LoginDetails";
import { StudentNoteCard } from "@/components/admin/StudentNote";
import { statLabel, statTile, statValue } from "@/components/admin/surface";
import { StudentActivitySection } from "@/components/admin/ActivityParts";
import { gradeSubmission } from "@/lib/grading";
import { shownPercent } from "@/lib/performance";
import { fmtTime } from "@/lib/activity";
import { RowMenu } from "@/components/admin/RowMenu";
import { topicMastery } from "@/lib/scoring";
import { buildStudentReport } from "@/lib/report-build";
import { isReportLinkLive, REPORT_LINK_DAYS, reportLinkDay, reportLinkExpiry } from "@/lib/report-data";
import { formatTimestamp } from "@/lib/time";
import { newPassword } from "@/lib/password";

function monthOf(iso: string | null | undefined) {
  return iso ? iso.slice(0, 7) : "";
}

function formatMonthLabel(m: string) {
  if (!m) return "All time";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
}

/** Suspense wrapper: `useSearchParams` needs a boundary during prerender. */
export default function StudentDetailPage() {
  return (
    <Suspense fallback={null}>
      <StudentDetail />
    </Suspense>
  );
}

function StudentDetail() {
  const params = useParams();
  const id = String(params.id);
  const db = useDatabase();
  const { session } = useAuth();
  const ta = isTa(session);
  const profiles = useStudentProfiles();
  const store = useStore();
  const student = studentById(db, id);

  // `?report=1` — the roster's WhatsApp button lands straight on this dialog.
  const [reportOpen, setReportOpen] = useState(useSearchParams().get("report") === "1");
  const [reportMonth, setReportMonth] = useState("");
  const [teacherNote, setTeacherNote] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  // The report whose fresh link is being made, for its button's spinner.
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [allHomework, setAllHomework] = useState(false);
  const reportNow = useNow();
  // Attendance by subject, the last 4 weeks, from the Join taps (lib/subject-attendance.ts).
  const todayPk = pkDate(reportNow);
  const attFrom = addDays(todayPk, -27);
  const { joins: attJoins, joinsOk: attOk } = useClassLinks(attFrom, todayPk, true, false);
  const pausedIds = usePausedIds();
  const bySubject = useMemo(() => {
    // Paused: which days fell inside the pause isn't known, so nothing is shown rather than false misses.
    // In-person students have no Joins: they keep the per-level figure above.
    if (!student || !attOk || pausedIds.has(student.id) || isInPersonStudent(db, student)) return null;
    return subjectSummary(subjectAttendance(db, { joins: attJoins, joinsOk: true, nowMs: reportNow })(student, attFrom, todayPk));
  }, [db, student, attOk, attJoins, pausedIds, reportNow, attFrom, todayPk]);

  // Landing here from the roster's WhatsApp button (?report=1) opens the report
  // dialog straight away, so only then fetch the PDF renderer early (it's large).
  const wantsReport = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("report");
  useEffect(() => {
    if (!wantsReport) return;
    void import("@react-pdf/renderer");
    void import("@/components/admin/ReportDocument");
  }, [wantsReport]);

  const data = useMemo(() => {
    if (!student) return null;
    const subs = submissionsForStudent(db, student.id).sort(
      (a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""),
    );
    const released = subs.filter((s) => s.status === "released");
    const tests = released.flatMap((s) => { const t = testById(db, s.testId); return t ? [t] : []; });
    const points: LinePoint[] = released.flatMap((s) => {
      const t = testById(db, s.testId);
      if (!t) return [];
      return [{ label: (s.submittedAt ?? "").slice(5, 10), value: gradeSubmission(t, s).percent }];
    });
    // No results is "none yet", never a 0% average.
    const avg = points.length ? Math.round((points.reduce((a, p) => a + p.value, 0) / points.length) * 10) / 10 : null;
    const months = Array.from(new Set(released.map((s) => monthOf(s.submittedAt)).filter(Boolean))).sort();
    // This month's attendance, typed or from the daily register.
    // The month in Pakistan: on the 1st, before 5 am, UTC is still in last month.
    const thisMonth = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()).slice(0, 7)}-01`;
    const attendance = attendancePercent(db, student.id, thisMonth);
    // The latest released result, as a percent.
    const lastPct = points.length ? Math.round(points[points.length - 1].value) : null;
    // Homework set for this student (the Homework page's rule, so work from before they started there never counts), newest deadline first.
    const handIns = new Map(db.assignmentSubmissions.filter((x) => x.studentId === student.id).map((x) => [x.assignmentId, x]));
    const homework = db.assignments
      .filter((a) => homeworkSetFor(db, student, a) || handIns.has(a.id))
      .sort((a, b) => b.dueAt.localeCompare(a.dueAt))
      .map((a) => {
        const h = handIns.get(a.id);
        const dueMs = +new Date(a.dueAt);
        const state = h ? (+new Date(h.submittedAt) > dueMs ? "late" : "in") : dueMs <= reportNow ? "owed" : "open";
        return { a, state } as const;
      });
    const owed = homework.filter((x) => x.state === "owed").length;
    return { subs, released, mastery: topicMastery(tests, released), points, avg, months, attendance, lastPct, homework, owed };
  }, [db, student, reportNow]);

  if (!student || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
        <PageHeader title="Student not found" back={{ href: "/admin/roster", label: "Roster" }} />
        <EmptyState icon={<Icon.Users />} title="No such student" />
      </div>
    );
  }

  const cohort = cohortById(db, student.cohortId);
  // This student's reports that went to the parent, newest month first.
  const sentReports = db.reports
    .filter((r) => r.studentId === student.id && r.sentAt)
    .sort((a, b) => b.month.localeCompare(a.month));

  function openReport() {
    setReportMonth(data!.months[data!.months.length - 1] ?? "");
    setTeacherNote("");
    setReportOpen(true);
  }

  /** Build the PDF. Delivery (download / WhatsApp) is the caller's business. */
  async function buildReport(): Promise<{ blob: Blob; fileName: string } | null> {
    if (!student) return null;
    const month = reportMonth || data?.months[data.months.length - 1] || "";
    return buildStudentReport(db, student.id, month, teacherNote);
  }

  function saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Not straight away: some browsers have not started reading the file yet.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function downloadReport() {
    setDownloading(true);
    try {
      const built = await buildReport();
      if (built) saveBlob(built.blob, built.fileName);
      setReportOpen(false);
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast("Couldn't build the report. Check your internet and try again.", "error");
    } finally {
      setDownloading(false);
    }
  }

  /**
   * One click: report link into that parent's chat.
   *
   * The PDF is uploaded, recorded with a short private link
   * (hamzateaches.com/reports/xxxx, live for 7 days from now, branded preview card in
   * WhatsApp), and the chat opens with the message already typed — the admin
   * just presses Send. No browser API can attach a file to a chosen
   * conversation, so the link is what travels; it opens the report with a
   * Download PDF button and needs no login.
   */
  async function sendReportOnWhatsapp() {
    if (!student?.whatsapp) return;
    setSending(true);
    const tab = openLater();
    // Worked out before the report is stamped as sent (that stamp counts as a message).
    const intro = introNeeded(db, student.id, "parent");
    try {
      const link = await publishReport();
      if (!link) return tab.cancel();
      const text = guardMessage(withLink(reportMessage(intro), link), withLink(parentReport({ id: student.id, username: student.username, intro }), link), [link]);
      tab.go(`https://wa.me/${waDigits(student.whatsapp)}?text=${encodeURIComponent(text)}`);
      logMessage(store, student.id, "parent", "report");
      setReportOpen(false);
      toast(linkLasts(), "success");
    } catch (err) {
      tab.cancel();
      console.error("WhatsApp send failed:", err);
      toast(err instanceof Error ? err.message : "Couldn't build the report. Check your internet and try again.", "error");
    } finally {
      setSending(false);
    }
  }

  /** Build, upload and record the report; returns its public link. */
  async function publishReport(): Promise<string | null> {
    if (!student) return null;
    const built = await buildReport();
    if (!built) return null;
    if (!notesConfigured()) {
      // Nowhere to host it: fall back to the file itself.
      saveBlob(built.blob, built.fileName);
      toast("File uploads are switched off, so the report was saved to this device instead. Ask your developer to check the file storage.", "info");
      return null;
    }

    const { url } = await uploadNote(new File([built.blob], built.fileName, { type: "application/pdf" }));
    const month = reportMonth || data?.months[data.months.length - 1] || "";
    const record = await store.saveReport({
      studentId: student.id,
      month: month ? `${month}-01` : `${new Date().toISOString().slice(0, 7)}-01`,
      pdfUrl: url,
      teacherNote: teacherNote.trim() || undefined,
    });
    store.markReportSent(record.id);
    return `${window.location.origin}/reports/${record.token}`;
  }

  /** "Link works for 7 days, until 19 Nov." from this moment. */
  function linkLasts() {
    return `Link works for ${REPORT_LINK_DAYS} days, until ${reportLinkDay(reportLinkExpiry(), "short")}.`;
  }

  /**
   * "Send a fresh link": the same PDF and note under a new link with 7 new
   * days. The old link stops at once. Opens the parent's chat like Send does.
   */
  async function sendFreshLink(reportId: string, month: string) {
    if (!student?.whatsapp) return;
    setRefreshing(reportId);
    const tab = openLater();
    const intro = introNeeded(db, student.id, "parent");
    try {
      const record = await store.freshReportLink(reportId);
      const link = `${window.location.origin}/reports/${record.token}`;
      const message = parentReport({ id: student.id, username: student.username, intro, month: formatMonthLabel(month.slice(0, 7)) });
      const text = guardMessage(withLink(message, link), withLink(parentReport({ id: student.id, username: student.username, intro }), link), [link]);
      tab.go(`https://wa.me/${waDigits(student.whatsapp)}?text=${encodeURIComponent(text)}`);
      logMessage(store, student.id, "parent", "report");
      toast(linkLasts(), "success");
    } catch (err) {
      tab.cancel();
      toast(err instanceof Error ? err.message : "Couldn't make a fresh link. Check your internet and try again.", "error");
    } finally {
      setRefreshing(null);
    }
  }

  function reportMessage(intro: boolean) {
    const month = reportMonth || data?.months[data.months.length - 1] || "";
    return parentReport({ id: student!.id, username: student!.username, intro, month: month ? formatMonthLabel(month) : "" });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <PageHeader
        title={displayName(student.username)}
        subtitle={[student.username, student.email].filter(Boolean).join(" · ")}
        back={{ href: "/admin/roster", label: "Roster" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {cohort && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2">
                <CohortDot color={cohort.color} />{cohort.name}
              </span>
            )}
            {/* Owner only from here: numbers, account changes and the parent's report. */}
            <span data-owner className="contents">
            {student.phone && (
              <a
                href={`https://wa.me/${waDigits(student.phone)}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
                title={`WhatsApp ${displayName(student.username)}: ${student.phone}`}
              >
                WhatsApp student
              </a>
            )}
            {student.whatsapp && (
              <a
                href={`https://wa.me/${waDigits(student.whatsapp)}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
                title={`WhatsApp the parent: ${student.whatsapp}`}
              >
                WhatsApp parent
              </a>
            )}
            {/* Edit, login details and password sit under one More button, so the row stays one line on a phone. */}
            <ResetPassword studentId={student.id} username={student.username} phone={student.phone} parent={student.whatsapp} editHref={`/admin/roster?edit=${student.id}`} />
            {/* In-person students get no monthly report. */}
            {!isInPersonStudent(db, student) && (
              <Button variant="secondary" size="sm" onClick={openReport}>
                <Icon.Download className="h-4 w-4" /> Monthly report
              </Button>
            )}
            </span>
          </div>
        }
      />

      {student.photoUrl && (
        <div className="mb-4 flex items-center gap-3">
          <span className="h-16 w-16 overflow-hidden rounded-full bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={student.photoUrl} alt="" className="h-full w-full object-cover" />
          </span>
        </div>
      )}

      {/* Hamza's own note, near the top so it's the first thing seen before a call. */}
      {/* Hamza's private note: not the assistant's. */}
      {!ta && <StudentNoteCard studentId={student.id} />}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Homework owed" value={String(data.owed)} />
        <Stat label="Last test" value={data.lastPct === null ? "None yet" : `${data.lastPct}%`} />
        <Stat label="Average" value={data.avg === null ? "None yet" : `${Math.round(data.avg)}%`} />
        <Stat
          label="Attendance this month"
          value={isInPersonStudent(db, student) ? "In person" : data.attendance != null ? `${data.attendance}%` : "None yet"}
        />
      </div>

      {bySubject && bySubject.length > 0 && (
        <Card className="mt-3 p-5 sm:p-6">
          <h2 className="label-quiet text-ink-3">Attendance by subject, last 4 weeks</h2>
          <ul className="mt-2 space-y-1 text-base text-ink-2">
            {bySubject.map((x) => (
              <li key={x.key}>
                <span className="font-semibold text-ink">
                  {bySubject.some((y) => y.level !== x.level) ? `${x.level} ` : ""}
                  {x.subject}
                </span>{" "}
                <span className="tabular-nums">
                  {x.came} of {x.due}
                </span>
                {x.late > 0 && <span className="text-ink-3"> · {x.late} late</span>}
                {x.missed.length > 0 && (
                  <span className="text-sm text-ink-3">
                    {" "}
                    (missed {x.missed.slice(-4).map(classDay).join(", ")}
                    {x.missed.length > 4 ? ` and ${x.missed.length - 4} more` : ""})
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!ta && profiles[student.id] && <TheirPortal profile={profiles[student.id]} initial={displayName(student.username).charAt(0).toUpperCase()} />}

      {data.released.length > 0 ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <h2 className="mb-2 text-base font-semibold tracking-[-0.01em] text-ink">Score trend</h2>
            <LineChart points={data.points} />
          </Card>
          <Card className="p-5 sm:p-6">
            <h2 className="mb-3 text-base font-semibold tracking-[-0.01em] text-ink">Topic mastery</h2>
            <div className="space-y-3.5">
              {data.mastery.map((m) => <MasteryBar key={m.topic} topic={m.topic} percent={m.percent} band={m.band} />)}
            </div>
          </Card>
        </div>
      ) : (
        <EmptyState className="mt-5" icon={<Icon.Chart />} title="No released results yet" message="Release a result to build this student's analytics." />
      )}

      {!ta && <StudentActivitySection studentId={student.id} />}

      <h2 className="mb-3 mt-10 text-xl font-semibold tracking-[-0.015em] text-ink">Homework</h2>
      {data.homework.length === 0 ? (
        <p className="text-base text-ink-2">No homework set for {displayName(student.username)} yet.</p>
      ) : (
        <Card className="divide-y divide-hairline overflow-hidden p-0">
          {(allHomework ? data.homework : data.homework.slice(0, 8)).map(({ a, state }) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <Link href={`/admin/assignments?open=${a.id}`} className="block truncate text-base font-semibold text-ink underline-offset-4 hover:underline">{a.title}</Link>
                <p className="text-sm tabular-nums text-ink-3">Due {formatTimestamp(a.dueAt)}</p>
              </div>
              {state === "in" ? (
                <Badge tone="success">Handed in</Badge>
              ) : state === "late" ? (
                <Badge tone="warning">Late</Badge>
              ) : state === "owed" ? (
                <Badge tone="error">Owed</Badge>
              ) : (
                <Badge tone="neutral">Not due yet</Badge>
              )}
            </div>
          ))}
        </Card>
      )}
      {data.homework.length > 8 && (
        <button type="button" onClick={() => setAllHomework((v) => !v)} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          {allHomework ? "Show the latest 8" : `Show all ${data.homework.length}`}
        </button>
      )}

      <h2 className="mb-3 mt-10 text-xl font-semibold tracking-[-0.015em] text-ink">Tests</h2>
      {data.subs.length === 0 ? (
        <EmptyState icon={<Icon.Inbox />} title="No tests handed in yet" />
      ) : (
        <Card className="divide-y divide-hairline overflow-hidden p-0">
          {/* Newest first, so the latest test is at the top. */}
          {[...data.subs].reverse().map((s) => {
            const test = testById(db, s.testId);
            const grade = test ? gradeSubmission(test, s) : null;
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink">{test?.title ?? "Deleted test"}</p>
                  <p className="text-sm tabular-nums text-ink-3">{s.submittedAt ? formatTimestamp(s.submittedAt) : "Not submitted"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.status === "released" && grade ? (
                    <Badge tone="success" className="tabular-nums">{shownPercent(grade.percent)}% · {grade.letter}</Badge>
                  ) : s.status === "in_progress" ? (
                    <Badge tone="neutral">In progress</Badge>
                  ) : (
                    <Badge tone="warning">To mark</Badge>
                  )}
                  <Link href={`/admin/grading/${s.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    {s.status === "released" ? "Open" : "Mark"}
                  </Link>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Monthly Report Modal */}
      {/* Hamza's only: staff never get this window, whatever the address says. */}
      <Modal
        open={reportOpen && !ta}
        onClose={() => setReportOpen(false)}
        title="Monthly report"
        description="Pick the month and add an optional teacher note."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReportOpen(false)} disabled={downloading || sending}>Cancel</Button>
            <Button variant="secondary" onClick={downloadReport} loading={downloading} disabled={data.months.length === 0 || sending}>
              {downloading ? "Making the PDF…" : "Download PDF"}
            </Button>
            <Button
              onClick={sendReportOnWhatsapp}
              loading={sending}
              disabled={data.months.length === 0 || downloading || !student.whatsapp}
              title={student.whatsapp ? `Send to ${student.whatsapp}` : "Add the parent's WhatsApp number first"}
            >
              {sending ? "Preparing…" : "Send on WhatsApp"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="report-month" className="mb-1.5 block text-sm font-semibold text-ink-2">Month</label>
            {data.months.length === 0 ? (
              <p className="text-sm text-ink-3">No released results yet.</p>
            ) : (
              <select
                id="report-month"
                value={reportMonth || data.months[data.months.length - 1]}
                onChange={(e) => setReportMonth(e.target.value)}
                className="h-12 w-full rounded-field border border-field bg-surface px-3.5 text-base text-ink transition-colors hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {data.months.map((m) => (
                  <option key={m} value={m}>{formatMonthLabel(m)}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label htmlFor="report-note" className="mb-1.5 block text-sm font-semibold text-ink-2">
              Teacher note <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <textarea
              id="report-note"
              value={teacherNote}
              onChange={(e) => setTeacherNote(e.target.value)}
              placeholder="Add a personal note for the parent…"
              rows={4}
              maxLength={260}
              className="w-full resize-none rounded-field border border-field bg-surface px-3.5 py-3 text-base leading-relaxed text-ink placeholder:text-ink-3 transition-colors hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            />
            <p className="mt-1.5 text-right text-sm tabular-nums text-ink-3">{teacherNote.length}/260 · keeps the report to one page</p>
          </div>
          <p className="text-sm text-ink-2">
            Link works for {REPORT_LINK_DAYS} days, until {reportLinkDay(reportLinkExpiry(reportNow), "short")}.
          </p>
          {sentReports.length > 0 && (
            <div>
              <h3 className="label-quiet mb-2 text-ink-3">Sent reports</h3>
              <ul className="divide-y divide-hairline rounded-tile bg-surface-2">
                {sentReports.map((r) => {
                  const live = isReportLinkLive(r.expiresAt, reportNow);
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                      <span className="min-w-0 flex-1 text-base font-semibold text-ink">
                        {formatMonthLabel(r.month.slice(0, 7))}
                        <span className="block text-sm font-normal text-ink-3">
                          {live ? `Link live until ${reportLinkDay(r.expiresAt, "short")}` : `Link finished ${reportLinkDay(r.expiresAt, "short")}`}
                        </span>
                      </span>
                      <Badge tone={live ? "success" : "neutral"}>{live ? "Live" : "Finished"}</Badge>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={refreshing === r.id}
                        disabled={!student.whatsapp || refreshing !== null || sending || downloading}
                        onClick={() => void sendFreshLink(r.id, r.month)}
                        title={student.whatsapp ? `Send to ${student.whatsapp}` : "Add the parent's WhatsApp number first"}
                      >
                        Send a fresh link
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className={statTile}>
      <p className={statLabel}>{label}</p>
      <p className={statValue}>{value}</p>
    </Card>
  );
}

/** What the student set for themselves, and their study timer this week. */
function TheirPortal({ profile, initial }: { profile: Profile; initial: string }) {
  const nowMs = useNow();
  const focus = currentStats(profile.focus, nowMs);
  // The student's own saved data could hold anything: only real, believable numbers are shown (70 h a week at most, as on Today).
  const weekHours = Math.round(Math.min(70 * 60, Math.max(0, Number(focus.weekMinutes) || 0)) / 6) / 10;
  const goal = Number(profile.weeklyGoal) > 0 ? Number(profile.weeklyGoal) : 0;
  const streak = Math.max(0, Number(focus.streak) || 0);
  // Only real grades (the student's own data could hold anything).
  const targets = Object.entries(profile.targets ?? {}).filter(([, t]) => typeof t === "string" && ["A*", "A", "B", "C"].includes(t));
  // The newest 60 recordings they opened, and the believable seconds on each (4 hours at most apiece).
  const recordings = Array.isArray(profile.watched) ? profile.watched.length : 0;
  const watchedSec = Object.values(profile.watchSec ?? {}).reduce((n, v) => n + Math.min(4 * 3600, Math.max(0, Number(v) || 0)), 0);
  return (
    <Card className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 p-5 sm:p-6">
      {/* Their chosen picture, else their initial (it used to show a bare "?"). */}
      {/* Only a picture they chose: a bare initial beside the numbers read like a grade. */}
      {profile.avatar && <Avatar id={profile.avatar} initials={initial} className="h-10 w-10" />}
      {targets.length > 0 && (
        <p className="text-sm text-ink-2">
          Aiming for{" "}
          {targets.map(([sub, t], i) => (
            <span key={sub}>
              {i > 0 && ", "}
              <span className="font-semibold text-ink">{t}</span> in {sub}
            </span>
          ))}
        </p>
      )}
      <p className="text-sm text-ink-2">
        Focus: <span className="font-semibold text-ink">{fmtTime(weekHours * 3600)}</span> this week
        {goal ? ` of ${goal} h` : ""}
        {streak > 1 ? ` · ${streak} day streak` : ""}
      </p>
      {/* Recordings they opened, and how long those were on their screen in the portal. */}
      {recordings > 0 && (
        <p className="text-sm text-ink-2">
          Recordings: <span className="font-semibold text-ink">{recordings}</span> opened
          {watchedSec > 0 ? (
            <>
              {" "}
              · <span className="font-semibold text-ink">{watchLabel(watchedSec)}</span> watched
            </>
          ) : (
            ""
          )}
        </p>
      )}
    </Card>
  );
}

/**
 * "Reset password": makes a new password and opens the ready-made message
 * (copy, or WhatsApp to the student or parent). Passwords are never stored
 * in a readable form, so this is also how Hamza re-sends login details.
 */
function ResetPassword({ studentId, username, phone, parent, editHref }: { studentId: string; username: string; phone?: string; parent?: string; editHref: string }) {
  const store = useStore();
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [kind, setKind] = useState<"reset" | "welcome">("reset");
  const [pw, setPw] = useState("");

  async function reset() {
    const next = newPassword();
    setStep("busy");
    try {
      await store.updateStudent(studentId, { tempPassword: next });
      setPw(next);
      setStep("done");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't reset the password. Try again.", "error");
      setStep("idle");
    }
  }

  return (
    <>
      <RowMenu
        label={`More for ${displayName(username)}`}
        items={[
          { label: "Edit details", onSelect: () => router.push(editHref) },
          { label: "Send login details", onSelect: () => { setKind("welcome"); setStep("confirm"); } },
          { label: "Reset password", onSelect: () => { setKind("reset"); setStep("confirm"); } },
        ]}
      />
      <Modal
        open={step === "confirm" || step === "busy"}
        onClose={() => setStep("idle")}
        title={kind === "welcome" ? `Send ${displayName(username)} their login?` : `Reset ${displayName(username)}'s password?`}
        description={
          kind === "welcome"
            ? "Passwords can't be read back, so this makes a new one and puts it in the welcome message. Their old password stops working."
            : "Their current password stops working straight away."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setStep("idle")}>
              Cancel
            </Button>
            <Button loading={step === "busy"} onClick={() => void reset()}>
              {kind === "welcome" ? "Make the message" : "Reset password"}
            </Button>
          </>
        }
      >
        {null}
      </Modal>
      {/* Closing it forgets the password: it is not kept in the page once the message is dealt with. */}
      <LoginDetails
        studentId={studentId}
        open={step === "done"}
        onClose={() => {
          setStep("idle");
          setPw("");
        }}
        kind={kind}
        username={username}
        password={pw}
        phone={phone}
        parent={parent}
      />
    </>
  );
}
