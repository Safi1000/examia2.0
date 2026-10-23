"use client";

import { useStudentProfiles } from "@/lib/student-profiles";
import { Avatar } from "@/components/student/Avatar";
import type { Profile } from "@/lib/profile";
import { currentStats } from "@/lib/focus";
import { useNow } from "@/hooks/useNow";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useDatabase, useStore } from "@/lib/data/store";
import { attendancePercent, cohortById, studentById, submissionsForStudent, testById } from "@/lib/data/selectors";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Badge, CohortDot, EmptyState, Icon, Modal } from "@/components/ui";
import { useToast } from "@/components/toast";
import { COMPANY_NAME } from "@/lib/config";
import { waDigits } from "@/lib/phone";
import { notesConfigured, uploadNote } from "@/lib/cloudinary";
import { Button, buttonClasses } from "@/components/ui/Button";
import { LineChart, type LinePoint } from "@/components/charts/LineChart";
import { MasteryBar } from "@/components/charts/MasteryBar";
import { LoginDetails } from "@/components/admin/LoginDetails";
import { gradeSubmission } from "@/lib/grading";
import { topicMastery } from "@/lib/scoring";
import { buildStudentReport } from "@/lib/report-build";
import { formatTimestamp } from "@/lib/time";

function monthOf(iso: string | null | undefined) {
  return iso ? iso.slice(0, 7) : "";
}

function formatMonthLabel(m: string) {
  if (!m) return "All time";
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
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

  // Landing here from the roster's WhatsApp button opens the report dialog
  // straight away, so start fetching the PDF renderer now rather than on click.
  useEffect(() => {
    void import("@react-pdf/renderer");
    void import("@/components/admin/ReportDocument");
  }, []);

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
    const avg = points.length ? Math.round((points.reduce((a, p) => a + p.value, 0) / points.length) * 10) / 10 : 0;
    const months = Array.from(new Set(released.map((s) => monthOf(s.submittedAt)).filter(Boolean))).sort();
    // This month's attendance, typed or from the daily register.
    const thisMonth = `${new Date().toISOString().slice(0, 7)}-01`;
    const attendance = attendancePercent(db, student.id, thisMonth);
    return { subs, released, mastery: topicMastery(tests, released), points, avg, months, attendance };
  }, [db, student]);

  if (!student || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        <PageHeader title="Student not found" back={{ href: "/admin/roster", label: "Roster" }} />
        <EmptyState icon={<Icon.Users />} title="No such student" />
      </div>
    );
  }

  const cohort = cohortById(db, student.cohortId);

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
    URL.revokeObjectURL(url);
  }

  async function downloadReport() {
    setDownloading(true);
    try {
      const built = await buildReport();
      if (built) saveBlob(built.blob, built.fileName);
      setReportOpen(false);
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast("Could not build the report.", "error");
    } finally {
      setDownloading(false);
    }
  }

  /**
   * One click: report link into that parent's chat.
   *
   * The PDF is uploaded, recorded with a short private link
   * (hamzateaches.com/reports/xxxx, live for 90 days, branded preview card in
   * WhatsApp), and the chat opens with the message already typed — the admin
   * just presses Send. No browser API can attach a file to a chosen
   * conversation, so the link is what travels; it opens the report with a
   * Download PDF button and needs no login.
   */
  async function sendReportOnWhatsapp() {
    if (!student?.whatsapp) return;
    setSending(true);
    try {
      const link = await publishReport();
      if (!link) return;
      window.open(
        `https://wa.me/${waDigits(student.whatsapp)}?text=${encodeURIComponent(`${reportMessage()}\n\n${link}`)}`,
        "_blank",
        "noopener",
      );
      setReportOpen(false);
    } catch (err) {
      console.error("WhatsApp send failed:", err);
      toast(err instanceof Error ? err.message : "Could not build the report.", "error");
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
      toast("Uploads are not configured — the report was saved instead.", "info");
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

  function reportMessage() {
    const month = reportMonth || data?.months[data.months.length - 1] || "";
    return `${student!.username}'s report — ${month ? formatMonthLabel(month) : "all results"} (${COMPANY_NAME})`;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title={student.username}
        subtitle={student.email}
        back={{ href: "/admin/roster", label: "Roster" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {cohort && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2">
                <CohortDot color={cohort.color} />{cohort.name}
              </span>
            )}
            {student.phone && (
              <a
                href={`https://wa.me/${waDigits(student.phone)}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
                title={`Chat with ${student.username} — ${student.phone}`}
              >
                <Icon.Users className="h-4 w-4" /> Student
              </a>
            )}
            {student.whatsapp && (
              <a
                href={`https://wa.me/${waDigits(student.whatsapp)}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
                title={`Chat with the parent — ${student.whatsapp}`}
              >
                <Icon.Users className="h-4 w-4" /> Parent
              </a>
            )}
            <ResetPassword studentId={student.id} username={student.username} phone={student.phone} parent={student.whatsapp} />
            <Button variant="secondary" size="sm" onClick={openReport}>
              <Icon.Download className="h-4 w-4" /> Monthly Report
            </Button>
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Submissions" value={String(data.subs.length)} />
        <Stat label="Released" value={String(data.released.length)} />
        <Stat label="Average" value={`${data.avg}%`} />
        <Stat
          label="Attendance"
          value={data.attendance != null ? `${data.attendance}%` : "—"}
        />
      </div>

      {profiles[student.id] && <TheirPortal profile={profiles[student.id]} />}

      {data.released.length > 0 ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h2 className="mb-2 text-base font-semibold text-ink">Score trend</h2>
            <LineChart points={data.points} />
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-base font-semibold text-ink">Topic mastery</h2>
            <div className="space-y-3.5">
              {data.mastery.map((m) => <MasteryBar key={m.topic} topic={m.topic} percent={m.percent} band={m.band} />)}
            </div>
          </Card>
        </div>
      ) : (
        <EmptyState className="mt-5" icon={<Icon.Chart />} title="No released results yet" message="Release a result to build this student's analytics." />
      )}

      <h2 className="mb-2.5 mt-7 text-base font-semibold text-ink">Submissions</h2>
      {data.subs.length === 0 ? (
        <EmptyState icon={<Icon.Inbox />} title="No submissions" />
      ) : (
        <div className="space-y-2">
          {data.subs.map((s) => {
            const test = testById(db, s.testId);
            const grade = test ? gradeSubmission(test, s) : null;
            return (
              <Card key={s.id} className="flex items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{test?.title ?? "—"}</p>
                  <p className="text-sm text-ink-2">{s.submittedAt ? formatTimestamp(s.submittedAt) : "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {s.status === "released" && grade ? (
                    <Badge tone="success">{grade.percent}% · {grade.letter}</Badge>
                  ) : (
                    <Badge tone="warning">Awaiting</Badge>
                  )}
                  <Link href={`/admin/grading/${s.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    {s.status === "released" ? "Review" : "Grade"}
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Monthly Report Modal */}
      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Monthly report"
        description="Pick the month and add an optional teacher note."
        footer={
          <>
            <Button variant="secondary" onClick={() => setReportOpen(false)} disabled={downloading || sending}>Cancel</Button>
            <Button variant="secondary" onClick={downloadReport} loading={downloading} disabled={data.months.length === 0 || sending}>
              {downloading ? "Generating..." : "Download PDF"}
            </Button>
            <Button
              onClick={sendReportOnWhatsapp}
              loading={sending}
              disabled={data.months.length === 0 || downloading || !student.whatsapp}
              title={student.whatsapp ? `Send to ${student.whatsapp}` : "Add the parent's WhatsApp number first"}
            >
              {sending ? "Preparing..." : "Send on WhatsApp"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-2">Month</label>
            {data.months.length === 0 ? (
              <p className="text-sm text-ink-3">No released results yet.</p>
            ) : (
              <select
                value={reportMonth || data.months[data.months.length - 1]}
                onChange={(e) => setReportMonth(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              >
                {data.months.map((m) => (
                  <option key={m} value={m}>{formatMonthLabel(m)}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink-2">
              Teacher note <span className="font-normal normal-case text-ink-3">(optional)</span>
            </label>
            <textarea
              value={teacherNote}
              onChange={(e) => setTeacherNote(e.target.value)}
              placeholder="Add a personal note for the parent..."
              rows={4}
              maxLength={260}
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <p className="mt-1 text-right text-xs text-ink-3">{teacherNote.length}/260 · keeps the report to one page</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4 text-center">
      <p className="font-display text-2xl font-extrabold text-ink">{value}</p>
      <p className="text-xs text-ink-3">{label}</p>
    </Card>
  );
}

/** What the student set for themselves, and their study timer this week. */
function TheirPortal({ profile }: { profile: Profile }) {
  const nowMs = useNow();
  const focus = currentStats(profile.focus, nowMs);
  // Only real grades (the student's own data could hold anything).
  const targets = Object.entries(profile.targets ?? {}).filter(([, t]) => typeof t === "string" && ["A*", "A", "B", "C"].includes(t));
  return (
    <Card className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
      <Avatar id={profile.avatar} initials="?" className="h-10 w-10" />
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
        Groundwork: <span className="font-semibold text-ink">{Math.round(focus.weekMinutes / 6) / 10} h</span> this week
        {profile.weeklyGoal ? ` of ${profile.weeklyGoal} h` : ""}
        {focus.streak > 1 ? ` · ${focus.streak}-day streak` : ""}
      </p>
    </Card>
  );
}

/** Same style as the roster's generated passwords: an easy word plus 3 digits (8+ characters). */
function newPassword() {
  const words = ["maple", "river", "amber", "delta", "lunar", "cedar", "north", "ochre", "coral", "atlas"];
  const pick = new Uint32Array(2);
  crypto.getRandomValues(pick);
  return `${words[pick[0] % words.length]}${100 + (pick[1] % 900)}`;
}

/**
 * "Reset password": makes a new password and opens the ready-made message
 * (copy, or WhatsApp to the student or parent). Passwords are never stored
 * in a readable form, so this is also how Hamza re-sends login details.
 */
function ResetPassword({ studentId, username, phone, parent }: { studentId: string; username: string; phone?: string; parent?: string }) {
  const store = useStore();
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
      <Button variant="secondary" size="sm" onClick={() => { setKind("welcome"); setStep("confirm"); }}>
        <Icon.Users className="h-4 w-4" /> Send login details
      </Button>
      <Button variant="secondary" size="sm" onClick={() => { setKind("reset"); setStep("confirm"); }}>
        <Icon.Lock className="h-4 w-4" /> Reset password
      </Button>
      <Modal
        open={step === "confirm" || step === "busy"}
        onClose={() => setStep("idle")}
        title={kind === "welcome" ? `Send ${username} their login?` : `Reset ${username}'s password?`}
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
      <LoginDetails open={step === "done"} onClose={() => setStep("idle")} kind={kind} username={username} password={pw} phone={phone} parent={parent} />
    </>
  );
}
