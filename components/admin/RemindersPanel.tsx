"use client";

import { openLater } from "@/lib/open-later";

import { useMemo, useState } from "react";
import { useDatabase, useStore } from "@/lib/data/store";
import { useAdminFilter } from "@/lib/admin-filter";
import { useNow } from "@/hooks/useNow";
import { dueReminders, KINDS, type Reminder } from "@/lib/reminders";
import { buildStudentReport } from "@/lib/report-build";
import { REPORT_LINK_DAYS, reportLinkDay, reportLinkExpiry } from "@/lib/report-data";
import { notesConfigured, uploadNote } from "@/lib/cloudinary";
import { waDigits } from "@/lib/phone";
import { displayName } from "@/lib/display-name";
import { guardMessage, withLink } from "@/lib/outgoing-message";
import { parentReport } from "@/lib/portal-messages";
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
  // The monthly run walks the list as it stood when the run began: the live
  // list shrinks as each report goes out, so an index into it would skip people.
  const [run, setRun] = useState<{ list: Reminder[]; index: number; reportId: string | null; failed: boolean } | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  // What is due follows the clock in 5-minute steps, not every 30 second tick.
  const tick = Math.floor(nowMs / 300_000) * 300_000;
  const reminders = useMemo(() => dueReminders(db, tick, cohortId), [db, tick, cohortId]);
  const reportRun = useMemo(() => reminders.filter((r) => r.kind === "report_due"), [reminders]);

  if (!reminders.length && !run) return null;

  const key = (r: Reminder) => `${r.student.id}|${r.kind}|${r.ref}`;

  /** Builds and records the report, returning its private link. Not marked as sent yet. */
  async function reportLink(r: Reminder): Promise<{ link: string; reportId: string } | null> {
    if (!notesConfigured()) {
      toast("Uploads are not configured, so the report has no link yet.", "error");
      return null;
    }
    const month = r.ref.slice(0, 7);
    const built = await buildStudentReport(db, r.student.id, month);
    if (!built) {
      toast(`Could not build the report for ${r.student.username}.`, "error");
      return null;
    }
    const { url } = await uploadNote(new File([built.blob], built.fileName, { type: "application/pdf" }));
    const record = await store.saveReport({ studentId: r.student.id, month: r.ref, pdfUrl: url });
    return { link: `${window.location.origin}/reports/${record.token}`, reportId: record.id };
  }

  /**
   * Opens the parent's chat with the message (and link) ready to send. A single
   * Send also clears the reminder (Hamza, 2026-11-09: opening the message is
   * enough, no separate "Done" tap). The monthly report run keeps its own
   * "Sent, next" / "Skip" buttons, so it passes clear = false.
   */
  async function open(r: Reminder, clear = true): Promise<{ ok: boolean; reportId: string | null }> {
    const number = r.student.whatsapp;
    if (!number) {
      toast(`${r.student.username} has no parent WhatsApp number saved.`, "error");
      return { ok: false, reportId: null };
    }
    setBusy(key(r));
    const tab = openLater();
    try {
      let text = r.message;
      let reportId: string | null = null;
      if (r.kind === "report_due") {
        const made = await reportLink(r);
        // No link, no message: "here is the report" with nothing to open helps
        // nobody, and the reminder has to stay until the report really goes.
        if (!made) {
          tab.cancel();
          return { ok: false, reportId: null };
        }
        // The link sits above the sign-off; checked again once it is in.
        text = guardMessage(withLink(text, made.link), withLink(parentReport({ id: r.student.id, username: r.student.username }), made.link), [made.link]);
        reportId = made.reportId;
      }
      tab.go(`https://wa.me/${waDigits(number)}?text=${encodeURIComponent(text)}`);
      if (clear) confirmSent(r, reportId);
      if (clear && reportId) toast(`Link works for ${REPORT_LINK_DAYS} days, until ${reportLinkDay(reportLinkExpiry(), "short")}.`, "success");
      return { ok: true, reportId };
    } catch (err) {
      tab.cancel();
      console.error("Reminder failed:", err);
      toast("Could not prepare that message.", "error");
      return { ok: false, reportId: null };
    } finally {
      setBusy(null);
    }
  }

  function confirmSent(r: Reminder, reportId?: string | null) {
    if (reportId) store.markReportSent(reportId);
    store.markReminderSent(r.student.id, r.kind, r.ref);
  }

  // ---- the one-by-one monthly report run ---------------------------------
  const running = run ? run.list[run.index] : null;

  async function openInRun(list: Reminder[], index: number) {
    setRun({ list, index, reportId: null, failed: false });
    const res = await open(list[index], false);
    // Still on this report (not stopped meanwhile): keep what "Sent, next" needs to stamp it.
    setRun((cur) => (cur && cur.list === list && cur.index === index ? { ...cur, reportId: res.reportId, failed: !res.ok } : cur));
  }

  async function startRun() {
    if (!reportRun.length || busy) return;
    await openInRun(reportRun, 0);
  }

  async function nextInRun(markSent: boolean) {
    if (!run || busy) return;
    const current = run.list[run.index];
    if (current && markSent) confirmSent(current, run.reportId);
    // Pass over anyone whose report went out another way during the run (a row's Send or Done).
    const due = new Set(reportRun.map(key));
    let next = run.index + 1;
    while (next < run.list.length && !due.has(key(run.list[next]))) next++;
    if (next >= run.list.length) {
      setRun(null);
      toast("Monthly reports done.", "success");
      return;
    }
    await openInRun(run.list, next);
  }

  return (
    <Card className="mb-4 overflow-hidden p-0">
      <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 py-3 pl-5 pr-3", (!collapsed || !!running) && "border-b border-border")}>
        <h2 className="whitespace-nowrap text-[15px] font-semibold tracking-[-0.01em] text-ink">
          Tell parents <span className="tabular-nums text-ink-3">({reminders.length})</span>
        </h2>
        {reportRun.length > 0 && !running && (
          <Button size="sm" variant="secondary" className="order-last whitespace-nowrap sm:order-none" disabled={busy !== null} onClick={() => void startRun()}>
            Send monthly reports ({reportRun.length})
          </Button>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          aria-label={collapsed ? "Show reminders" : "Hide reminders"}
          aria-expanded={!collapsed}
        >
          <Icon.ChevronRight className={cn("h-4 w-4 transition-transform duration-200", collapsed ? "" : "rotate-90")} />
        </button>
      </div>

      {running && run && (
        <div className={cn("flex flex-wrap items-center gap-3 bg-surface-2/60 px-5 py-3", !collapsed && "border-b border-border")}>
          <span className="text-sm font-semibold text-ink">
            {displayName(running.student.username)}: report {run.index + 1} of {run.list.length}.{" "}
            {busy ? "Getting it ready." : run.failed ? "It was not sent." : "Sent?"}
            {!busy && !run.failed && (
              <span className="font-normal text-ink-3"> Link works for {REPORT_LINK_DAYS} days, until {reportLinkDay(reportLinkExpiry(nowMs), "short")}.</span>
            )}
          </span>
          {run.failed ? (
            <Button size="sm" disabled={busy !== null} onClick={() => void openInRun(run.list, run.index)}>Try again</Button>
          ) : (
            <Button size="sm" disabled={busy !== null} onClick={() => void nextInRun(true)}>Sent, next</Button>
          )}
          <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void nextInRun(false)}>Skip</Button>
          <Button size="sm" variant="ghost" onClick={() => setRun(null)}>Stop</Button>
        </div>
      )}

      {!collapsed && (
        <ul className="divide-y divide-border">
          {reminders.slice(0, 25).map((r) => (
            <li key={key(r)} className="flex flex-wrap items-center gap-3 px-5 py-3">
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
                type="button"
                onClick={() => confirmSent(r)}
                className="min-h-11 px-2 text-xs font-semibold text-ink-3 hover:text-ink"
                title="Stop showing this"
              >
                Done
              </button>
            </li>
          ))}
          {reminders.length > 25 && (
            <li className="px-5 py-3 text-xs text-ink-3">Showing the first 25. The rest appear as you clear these.</li>
          )}
        </ul>
      )}
    </Card>
  );
}
