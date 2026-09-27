"use client";

import { useMemo, useState } from "react";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { useNow } from "@/hooks/useNow";
import { dueReminders, KINDS, type Reminder } from "@/lib/reminders";
import { buildStudentReport } from "@/lib/report-build";
import { notesConfigured, uploadNote } from "@/lib/cloudinary";
import { waDigits } from "@/lib/phone";
import { useToast } from "@/components/toast";
import { Card, Button, Badge, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * What still needs chasing, filled in from the data itself: tests that closed
 * unsat, students absent twice in a row, and last month's reports. Each row
 * opens the parent's WhatsApp with the message written; once sent it is
 * recorded, so nobody gets chased twice for the same thing.
 */
export function RemindersPanel() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const { cohortId } = useAdminFilter();
  const nowMs = useNow();

  const [busy, setBusy] = useState<string | null>(null);
  const [runIndex, setRunIndex] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const reminders = useMemo(() => dueReminders(db, nowMs, cohortId), [db, nowMs, cohortId]);
  const reportRun = useMemo(() => reminders.filter((r) => r.kind === "report_due"), [reminders]);

  if (!reminders.length) return null;

  const key = (r: Reminder) => `${r.student.id}|${r.kind}|${r.ref}`;

  /** Builds and records the report, returning its private link. */
  async function reportLink(r: Reminder): Promise<string | null> {
    const month = r.ref.slice(0, 7);
    const built = await buildStudentReport(db, r.student.id, month);
    if (!built) return null;
    if (!notesConfigured()) {
      toast("Uploads are not configured, so the report has no link yet.", "error");
      return null;
    }
    const { url } = await uploadNote(new File([built.blob], built.fileName, { type: "application/pdf" }));
    const record = await store.saveReport({ studentId: r.student.id, month: r.ref, pdfUrl: url });
    store.markReportSent(record.id);
    return `${window.location.origin}/reports/${record.token}`;
  }

  /** Opens the parent's chat with the message (and link) ready to send. */
  async function open(r: Reminder) {
    const number = r.student.whatsapp;
    if (!number) {
      toast(`${r.student.username} has no parent WhatsApp number saved.`, "error");
      return;
    }
    setBusy(key(r));
    try {
      let text = r.message;
      if (r.kind === "report_due") {
        const link = await reportLink(r);
        if (link) text = `${text}\n\n${link}`;
      }
      window.open(`https://wa.me/${waDigits(number)}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    } catch (err) {
      console.error("Reminder failed:", err);
      toast("Could not prepare that message.", "error");
    } finally {
      setBusy(null);
    }
  }

  function confirmSent(r: Reminder) {
    store.markReminderSent(r.student.id, r.kind, r.ref);
  }

  // ---- the one-by-one monthly report run ---------------------------------
  const running = runIndex != null ? reportRun[runIndex] : null;

  async function startRun() {
    if (!reportRun.length) return;
    setRunIndex(0);
    await open(reportRun[0]);
  }

  async function nextInRun(markSent: boolean) {
    const current = runIndex != null ? reportRun[runIndex] : null;
    if (current && markSent) confirmSent(current);
    const next = (runIndex ?? 0) + 1;
    // The list shrinks as rows are marked sent, so walk the snapshot we started
    // with and stop when it runs out.
    if (next >= reportRun.length) {
      setRunIndex(null);
      toast("Monthly reports done.", "success");
      return;
    }
    setRunIndex(next);
    await open(reportRun[next]);
  }

  return (
    <Card className="mb-4 p-0">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-2">
          Needs attention <span className="text-ink-3">({reminders.length})</span>
        </h2>
        {reportRun.length > 0 && !running && (
          <Button size="sm" variant="secondary" onClick={() => void startRun()}>
            Send monthly reports ({reportRun.length})
          </Button>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
          aria-label={collapsed ? "Show reminders" : "Hide reminders"}
        >
          <Icon.ChevronRight className={cn("h-4 w-4 transition-transform", collapsed ? "" : "rotate-90")} />
        </button>
      </div>

      {running && (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-brand-soft/40 px-4 py-3">
          <span className="text-sm font-semibold text-ink">
            {running.student.username} — report {(runIndex ?? 0) + 1} of {reportRun.length}. Sent?
          </span>
          <Button size="sm" onClick={() => void nextInRun(true)}>Sent — next</Button>
          <Button size="sm" variant="secondary" onClick={() => void nextInRun(false)}>Skip</Button>
          <Button size="sm" variant="ghost" onClick={() => setRunIndex(null)}>Stop</Button>
        </div>
      )}

      {!collapsed && (
        <ul className="divide-y divide-border">
          {reminders.slice(0, 25).map((r) => (
            <li key={key(r)} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Badge tone={KINDS[r.kind].tone}>{KINDS[r.kind].label}</Badge>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.label}</span>
              <Button
                size="sm"
                variant="secondary"
                loading={busy === key(r)}
                disabled={!r.student.whatsapp}
                onClick={() => void open(r)}
                title={r.student.whatsapp ? `Message ${r.student.whatsapp}` : "No parent number saved"}
              >
                Send
              </Button>
              <button
                onClick={() => confirmSent(r)}
                className="text-xs font-semibold text-ink-3 hover:text-ink"
                title="Stop showing this"
              >
                Done
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
