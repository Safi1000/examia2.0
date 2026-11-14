"use client";

import { useMemo, useRef, useState } from "react";
import type { Student } from "@/types";
import { useDatabase } from "@/lib/data/store";
import { useNow } from "@/hooks/useNow";
import { useToast } from "@/components/toast";
import { archivedCohortIds } from "@/lib/data/selectors";
import { displayName, isTestAccount } from "@/lib/display-name";
import { useStudentProfiles } from "@/lib/student-profiles";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Icon, Modal, chipClass, filterField } from "@/components/ui";
import { cn } from "@/lib/cn";
import { panelTitle } from "@/components/admin/surface";
import { LEVEL_LABEL, RECORDING_HOURS, addDays, levelOf, pkDate, slotsOn, useSchedule, type LevelKey } from "@/lib/classes";
import { useRecordingRows, useTeacherAccess, type RecordingRow, type TeacherResult } from "@/lib/recordings";
import { CATCH_UP_HOURS, REFRESH_EVERY_DAYS, noAccess, openUntil, pkWhen, pkWhenLong } from "@/lib/recording-access";
import { BulkBar, ConfirmBulk, RowCheck, SelectAll, copyText, outcome, type BulkAction } from "@/components/admin/BulkBar";
import { useSelection } from "@/lib/use-selection";

/**
 * Hamza's Recordings page: every class recording so far, whether students can
 * open it right now, and the controls that open and close them (one at a
 * time, or all at once for a 48 hour catch-up), plus new links for older ones.
 */

const LEVEL_ORDER: LevelKey[] = ["O", "AS", "A2"];
const dayLabel = (ymd: string) => new Date(`${ymd}T12:00:00+05:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Karachi" });
const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00+05:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "Asia/Karachi" });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Presses of a batch button before giving up (each handles a dozen or so recordings). */
const MAX_ROUNDS = 120;

type Row = RecordingRow & { level: LevelKey | null; levelName: string; subject: string; until: number };

export default function RecordingsPage() {
  const db = useDatabase();
  const nowMs = useNow();
  const { toast } = useToast();
  useSchedule(); // re-render once the saved timetable arrives (normal 48 hour windows use it)
  const { rows: raw, ready, reload } = useRecordingRows(true);
  const { state, error, act, reload: reloadAccess } = useTeacherAccess();
  const profiles = useStudentProfiles();
  const today = pkDate(nowMs);

  // Current students only (not past cohorts, not Hamza's test account): who opened a recording.
  const counted = useMemo(() => {
    const off = archivedCohortIds(db);
    return db.students.filter((s) => !off.has(s.cohortId) && !isTestAccount(s));
  }, [db]);
  const openedBy = useMemo(() => {
    const m = new Map<string, Student[]>();
    for (const st of counted) for (const k of profiles[st.id]?.watched ?? []) m.set(k, [...(m.get(k) ?? []), st]);
    return m;
  }, [counted, profiles]);

  const view = state?.view ?? noAccess;
  const rows: Row[] = useMemo(() => {
    const oldest = addDays(today, -3);
    return raw.map((r) => {
      const cls = db.classes.find((c) => c.id === r.classId);
      const level = cls ? levelOf(cls) : null;
      // Its own 48 hours, from the class's end on the timetable (only the last few days can still be open).
      const slot = r.date >= oldest ? slotsOn(db, r.date).find((s) => s.classId === r.classId && s.subjectId === r.subjectId) : undefined;
      const normal = slot ? slot.endMs + RECORDING_HOURS * 3_600_000 : 0;
      return {
        ...r,
        level,
        levelName: level ? LEVEL_LABEL[level] : (cls?.name ?? "Other"),
        subject: db.subjects.find((s) => s.id === r.subjectId)?.name ?? "Class",
        until: openUntil(r.key, r.date, normal, view, nowMs),
      };
    });
  }, [raw, db, today, view, nowMs]);

  // ---- Filters ---------------------------------------------------------------
  const [level, setLevel] = useState<string>("all");
  const [subject, setSubject] = useState<string>("all");
  const months = useMemo(() => [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort().reverse(), [rows]);
  const [monthPick, setMonthPick] = useState<string | null>(null);
  const month = monthPick ?? months[0] ?? "all";
  const levels = useMemo(() => [...new Set(rows.map((r) => r.levelName))].sort((a, b) => order(rows, a) - order(rows, b)), [rows]);
  const subjects = useMemo(() => [...new Set(rows.map((r) => r.subject))].sort(), [rows]);
  const shown = rows.filter((r) => (level === "all" || r.levelName === level) && (subject === "all" || r.subject === subject) && (month === "all" || r.date.startsWith(month)));
  const groups = useMemo(() => {
    const out: Array<{ title: string; rows: Row[] }> = [];
    for (const r of [...shown].sort((a, b) => order(rows, a.levelName) - order(rows, b.levelName) || a.subject.localeCompare(b.subject) || (a.date < b.date ? 1 : -1))) {
      const title = `${r.levelName} · ${r.subject}`;
      if (out[out.length - 1]?.title !== title) out.push({ title, rows: [] });
      out[out.length - 1].rows.push(r);
    }
    return out;
  }, [shown, rows]);

  // Ticked recordings: only ever ones the filters show, in the order they appear.
  const ids = useMemo(() => groups.flatMap((g) => g.rows.map((r) => r.key)), [groups]);
  const sel = useSelection(ids);
  const chosen = groups.flatMap((g) => g.rows).filter((r) => sel.isSelected(r.key));
  const chosenOpen = chosen.filter((r) => r.until > nowMs);
  const chosenClosed = chosen.filter((r) => r.until <= nowMs);
  const [ask, setAsk] = useState<null | "open" | "close" | "refresh">(null);
  const labelOf = (r: Row) => `${r.levelName} ${r.subject}, ${dayLabel(r.date)}`;

  const openNow = rows.filter((r) => r.until > nowMs);
  const closedCount = rows.length - openNow.length;

  // ---- Batch runs ------------------------------------------------------------
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [refreshAsk, setRefreshAsk] = useState<{ title: string; keys: string[] } | null>(null);

  /** Press a batch button until the server says nothing is left (or it stops moving). */
  async function run(label: string, first: () => Promise<TeacherResult>, more: (r: TeacherResult) => Promise<TeacherResult> | null) {
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(label);
    try {
      let r = await first();
      for (let i = 0; i < MAX_ROUNDS && !r.error; i++) {
        const next = more(r);
        if (!next) break;
        r = await next;
      }
      if (r.error) toast(r.error, "error");
      return r;
    } finally {
      busyRef.current = false;
      setBusy(null);
      setProgress(null);
    }
  }

  const keepOpening = (r: TeacherResult) => {
    const c = r.catchUp;
    if (!c || !c.waiting) return null;
    setProgress(`Opening recordings in Google Drive: ${c.total - c.waiting - c.failed.length} of ${c.total} done. Keep this page open.`);
    return act("catchup-continue");
  };
  const keepClosing = (r: TeacherResult) => {
    if (!r.closing || r.closing <= 0) return null;
    setProgress(`Closing recordings in Google Drive: ${plural(r.closing, "recording")} left.`);
    return act("sweep");
  };

  async function startAll() {
    setConfirmAll(false);
    const r = await run("all", () => act("catchup-start", {}, rows.length), keepOpening);
    if (r && !r.error && r.catchUp) {
      const failed = r.catchUp.failed.length;
      toast(
        failed
          ? `Open to students until ${pkWhen(r.catchUp.endsAt)}. ${failed} couldn't be opened; use "Try the rest again".`
          : `All ${r.catchUp.total} recordings are open to students until ${pkWhen(r.catchUp.endsAt)}.`,
        failed ? "error" : "success",
      );
    }
  }
  async function closeAll() {
    const r = await run("close-all", () => act("catchup-close"), keepClosing);
    if (r && !r.error) toast(r.closing && r.closing > 0 ? "Closed for students. Google is still closing a few; the site keeps trying every 15 minutes." : "Closed. Students can no longer open older recordings.", "success");
  }
  async function retry() {
    await run("all", () => act("catchup-retry"), keepOpening);
  }
  async function continueOpening() {
    await run("all", () => act("catchup-continue"), keepOpening);
  }
  async function refresh(keys: string[]) {
    setRefreshAsk(null);
    let done = 0;
    let skipped = 0;
    const failed: string[] = [];
    const r = await run(
      "refresh",
      () => act("refresh", { keys }, keys.length),
      (prev) => {
        done += prev.refreshed ?? 0;
        skipped += prev.skipped ?? 0;
        failed.push(...(prev.failed ?? []).map((f) => f.key));
        if (!prev.left?.length) return null;
        setProgress(`Making new links: ${done} done, ${prev.left.length} to go. Keep this page open.`);
        return act("refresh", { keys: prev.left });
      },
    );
    if (r && !r.error) {
      toast(
        `${plural(done, "recording")} got a new link.${skipped ? ` ${skipped} open to students right now were left as they are.` : ""}${failed.length ? ` ${failed.length} couldn't be done; try them again later.` : ""}`,
        failed.length ? "error" : "success",
      );
      void reload();
    }
  }
  // Delete: asked first, then the video goes to Drive's bin and the portal forgets it.
  const [delAsk, setDelAsk] = useState<Row | null>(null);
  async function removeOne() {
    const r0 = delAsk;
    setDelAsk(null);
    if (!r0 || busyRef.current) return;
    busyRef.current = true;
    setBusy(r0.key);
    try {
      const r = await act("delete", { key: r0.key });
      if (r.error) toast(r.error, "error");
      else {
        toast(r.binned === false ? "Removed from the portal. Google didn't answer, so delete the video in Drive yourself." : "Deleted. It's in your Google Drive bin for 30 days.", "success");
        void reload();
      }
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }
  // The main recordings folder in Drive, opened in a new tab.
  async function openFolder() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("folder");
    // Opened straight away, so the browser doesn't block it as a pop-up; the address follows.
    const tab = window.open("about:blank", "_blank");
    try {
      const r = await act("folder");
      if (r.error || !r.folderUrl) {
        tab?.close();
        toast(r.error ?? "Couldn't find the folder. Try again.", "error");
      } else if (tab) tab.location.href = r.folderUrl;
      else window.location.href = r.folderUrl;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  async function one(key: string, action: "open" | "close") {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(key);
    try {
      const r = await act(action, { key });
      if (r.error) toast(r.error, "error");
      else if (action === "open") toast(`Open to students for ${CATCH_UP_HOURS} hours.`, "success");
      else toast(r.closed === false ? "Closed for students. Google didn't answer, so the site keeps trying every 15 minutes." : "Closed for students.", "success");
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  /** The same open or close as each row's own button, one recording after another. */
  async function many(list: Row[], action: "open" | "close") {
    setAsk(null);
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("selected");
    let done = 0;
    const problems: { name: string; why: string }[] = [];
    try {
      for (let i = 0; i < list.length; i++) {
        setProgress(`${action === "open" ? "Opening" : "Closing"} ${i + 1} of ${list.length}. Keep this page open.`);
        try {
          const r = await act(action, { key: list[i].key });
          if (r.error) problems.push({ name: labelOf(list[i]), why: r.error.replace(/\.$/, "") });
          else done++;
        } catch (e) {
          problems.push({ name: labelOf(list[i]), why: e instanceof Error ? e.message.replace(/\.$/, "") : "no answer" });
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(null);
      setProgress(null);
    }
    sel.clear();
    toast(
      outcome(done, action === "open" ? `open to students for ${CATCH_UP_HOURS} hours` : "closed for students", problems, "recording"),
      problems.length ? (done ? "info" : "error") : "success",
    );
  }

  async function copyLinks() {
    const ok = await copyText(chosen.map((r) => `${labelOf(r)}: ${r.url}`).join("\n"));
    toast(ok ? `${plural(chosen.length, "link")} copied, one per line.` : "Couldn't copy. Your browser blocked it; try again.", ok ? "success" : "error");
  }

  const bulkActions: BulkAction[] = [
    ...(chosenClosed.length ? [{ id: "open", label: `Open for ${CATCH_UP_HOURS} hours`, primary: true, run: () => setAsk("open") }] : []),
    ...(chosenOpen.length ? [{ id: "close", label: "Close now", primary: !chosenClosed.length, run: () => setAsk("close") }] : []),
    { id: "copy", label: "Copy links", run: () => void copyLinks() },
    ...(chosenClosed.length ? [{ id: "refresh", label: "New links", run: () => setAsk("refresh") }] : []),
  ];

  const catchUp = state?.catchUp ?? null;
  const daysSinceRefresh = state?.refreshedAt ? Math.floor((nowMs - state.refreshedAt) / 86_400_000) : null;
  const olderThan30 = rows.filter((r) => r.date <= addDays(today, -REFRESH_EVERY_DAYS) && r.until <= nowMs).map((r) => r.key);
  const endsIfStarted = nowMs + CATCH_UP_HOURS * 3_600_000;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 *:max-w-4xl">
      <PageHeader
        title="Recordings"
        subtitle="Every class recording so far. Only you see this page."
        actions={
          <Button variant="secondary" loading={busy === "folder"} onClick={() => void openFolder()}>
            <Icon.NewTab className="h-4 w-4" /> Recordings folder
          </Button>
        }
      />
      <Modal
        open={!!delAsk}
        onClose={() => setDelAsk(null)}
        title="Delete this recording?"
        description={delAsk ? `${delAsk.subject}, ${dayLabel(delAsk.date)}` : ""}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDelAsk(null)}>Keep it</Button>
            <Button variant="danger" onClick={() => void removeOne()}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Students won&apos;t see it any more. The video goes to the bin in your Google Drive, where you can restore it for 30 days.</p>
      </Modal>

      {error && !state && (
        <Card className="mb-4 p-4 text-sm text-ink-2">
          Couldn&apos;t load who can open recordings right now. <button type="button" className="font-semibold text-ink underline" onClick={() => void reloadAccess()}>Try again</button>
        </Card>
      )}

      {/* ---- Catch-up ---- */}
      <Card className="p-5 sm:p-6">
        {catchUp ? (
          <div className="space-y-3">
            <h2 className={panelTitle}>Catch-up is on until {pkWhen(catchUp.endsAt)}</h2>
            <p className="max-w-[65ch] text-sm text-ink-2">
              Current students can open every past recording for their own level and subjects. It closes by itself on {pkWhenLong(catchUp.endsAt)}.
            </p>
            {catchUp.total > 0 && <p className="text-sm tabular-nums text-ink-3">
              {catchUp.total - catchUp.waiting - catchUp.failed.length} of {catchUp.total} opened in Google Drive
              {catchUp.failed.length ? `, ${catchUp.failed.length} failed` : ""}
              {catchUp.waiting ? `, ${catchUp.waiting} still to open` : ""}.
            </p>}
            {catchUp.failed.length > 0 && (
              <details className="text-[13px] text-ink-3">
                <summary className="min-h-11 cursor-pointer content-center font-semibold text-ink-2">Which ones failed</summary>
                <ul className="mt-1 space-y-1">
                  {catchUp.failed.slice(0, 50).map((f) => {
                    const r = rows.find((x) => x.key === f.key);
                    return (
                      <li key={f.key}>
                        {r ? `${r.levelName} ${r.subject}, ${dayLabel(r.date)}` : f.key.split("|")[0]}: {f.why}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
            {progress && busy === "all" && <p className="text-sm text-ink-2" role="status">{progress}</p>}
            <div className="flex flex-wrap gap-2">
              {catchUp.waiting > 0 && busy !== "all" && (
                <Button size="sm" variant="secondary" onClick={() => void continueOpening()} disabled={!!busy}>
                  Open the {catchUp.waiting} left
                </Button>
              )}
              {catchUp.failed.length > 0 && (
                <Button size="sm" variant="secondary" loading={busy === "all"} disabled={!!busy} onClick={() => void retry()}>
                  Try the rest again
                </Button>
              )}
              <Button size="sm" variant="secondary" loading={busy === "close-all"} disabled={!!busy && busy !== "close-all"} onClick={() => void closeAll()}>
                Close now
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className={panelTitle}>Let students catch up</h2>
            <p className="max-w-[65ch] text-sm text-ink-2">
              Opens every past recording to current students for {CATCH_UP_HOURS} hours, each student only their own level and subjects. It closes by itself.
            </p>
            {state?.lastCatchUp && (
              <p className="text-[13px] text-ink-3">
                Last catch-up: {dayLabel(pkDate(state.lastCatchUp.startedAt))} to {pkWhen(state.lastCatchUp.endsAt)}{state.lastCatchUp.opened ? `, ${plural(state.lastCatchUp.opened, "recording")} opened` : ""}.
              </p>
            )}
            {progress && busy && <p className="text-sm text-ink-2" role="status">{progress}</p>}
            <Button className="h-auto min-h-11 py-2.5 text-center" onClick={() => setConfirmAll(true)} loading={busy === "all"} disabled={!!busy || !rows.length || !state?.ready}>
              Open all recordings to students for {CATCH_UP_HOURS} hours
            </Button>
          </div>
        )}
      </Card>

      {/* ---- At a glance ---- */}
      <div className="mt-4 space-y-1 px-1 text-sm text-ink-2" aria-live="polite">
        {ready === null ? (
          <p className="text-ink-3">Loading recordings…</p>
        ) : ready === false ? (
          <p>Couldn&apos;t load the recordings. Check the internet, then open this page again.</p>
        ) : !rows.length ? (
          <p>No recordings yet. Each class recording appears here after class.</p>
        ) : openNow.length === rows.length ? (
          <p>
            <span className="font-semibold text-ink">All {rows.length} recordings are open to students right now.</span>
          </p>
        ) : openNow.length ? (
          <p>
            <span className="font-semibold text-ink">{plural(openNow.length, "recording")} open to students right now.</span> The other {closedCount} {closedCount === 1 ? "is" : "are"} closed: nobody can open {closedCount === 1 ? "it" : "them"}, not even with a saved link.
          </p>
        ) : (
          <p>
            <span className="font-semibold text-ink">All {rows.length} recordings are closed.</span> Nobody can open them, not even with a saved link.
          </p>
        )}
        {!!state?.stuck.length && (
          <p className="text-warning">
            Google wouldn&apos;t close {plural(state.stuck.length, "recording")} yet. The site tries again every 15 minutes.
          </p>
        )}
      </div>

      {/* ---- Filters ---- */}
      {rows.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Chips label="Level" value={level} onChange={setLevel} options={levels} />
          <Chips label="Subject" value={subject} onChange={setSubject} options={subjects} />
          <select
            aria-label="Month"
            value={month}
            onChange={(e) => setMonthPick(e.target.value)}
            className={filterField}
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)} ({rows.filter((r) => r.date.startsWith(m)).length})
              </option>
            ))}
            <option value="all">All months ({rows.length})</option>
          </select>
        </div>
      )}

      {/* ---- The list ---- */}
      {groups.length > 0 && (
        <div className="mt-4" role="group" aria-label="Recordings" onKeyDown={sel.listKeyDown}>
        <SelectAll sel={sel} noun="recording" />
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.title} className="overflow-hidden p-0">
              <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-5">
                <h2 className={panelTitle}>{g.title}</h2>
                <span className="text-xs tabular-nums text-ink-3">{plural(g.rows.length, "recording")}</span>
              </div>
              <ul className="divide-y divide-border border-t border-border">
                {g.rows.map((r) => (
                  <RecordingItem key={r.key} r={r} nowMs={nowMs} busy={busy} opened={openedBy.get(r.key) ?? []} onOne={one} onDelete={setDelAsk} picked={sel.isSelected(r.key)} onPick={sel.toggle} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
        </div>
      )}

      <BulkBar count={sel.count} onClear={sel.clear} actions={bulkActions} busy={busy} status={busy === "selected" ? progress : null} />

      <ConfirmBulk
        open={ask === "open"}
        onClose={() => setAsk(null)}
        title={`Open ${plural(chosenClosed.length, "recording")} for ${CATCH_UP_HOURS} hours?`}
        description={`Current students of each class can open ${chosenClosed.length === 1 ? "it" : "them"} until about ${pkWhenLong(endsIfStarted)} (Pakistan time). Then ${chosenClosed.length === 1 ? "it closes" : "they close"} by ${chosenClosed.length === 1 ? "itself" : "themselves"}.`}
        confirmLabel={`Open for ${CATCH_UP_HOURS} hours`}
        onConfirm={() => many(chosenClosed, "open")}
      >
        <p className="text-ink-3">{chosenClosed.slice(0, 6).map(labelOf).join("; ")}{chosenClosed.length > 6 ? ` and ${chosenClosed.length - 6} more` : ""}.</p>
        {chosenOpen.length > 0 && <p>{plural(chosenOpen.length, "recording")} already open {chosenOpen.length === 1 ? "is" : "are"} left as {chosenOpen.length === 1 ? "it is" : "they are"}.</p>}
        <p>Each one is opened in Google Drive in turn. Keep this page open until it says done.</p>
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "close"}
        onClose={() => setAsk(null)}
        title={`Close ${plural(chosenOpen.length, "recording")} now?`}
        description="Nobody can open them after this, not even with a saved link."
        confirmLabel="Close now"
        onConfirm={() => many(chosenOpen, "close")}
      >
        <p className="text-ink-3">{chosenOpen.slice(0, 6).map(labelOf).join("; ")}{chosenOpen.length > 6 ? ` and ${chosenOpen.length - 6} more` : ""}.</p>
      </ConfirmBulk>

      <ConfirmBulk
        open={ask === "refresh"}
        onClose={() => setAsk(null)}
        title={`New links for ${plural(chosenClosed.length, "recording")}?`}
        description="Any copy of an old link stops working for good. Recordings open right now are left as they are."
        confirmLabel="Make new links"
        onConfirm={() => {
          const keys = chosenClosed.map((r) => r.key);
          setAsk(null);
          sel.clear();
          return refresh(keys);
        }}
      >
        <p>Google Drive copies each video (it can take a while; keep this page open). The old files move to &quot;Hamza Teaches recordings / Replaced links&quot; and are never deleted by the site.</p>
      </ConfirmBulk>
      {rows.length > 0 && !groups.length && <p className="mt-4 px-1 text-sm text-ink-3">No recordings match these filters.</p>}

      {/* ---- New links ---- */}
      {rows.length > 0 && (
        <Card className="mt-8 p-5 sm:p-6">
          <h2 className={panelTitle}>New links for older recordings</h2>
          <p className="mt-1 max-w-[65ch] text-sm text-ink-2">
            A closed recording can&apos;t be opened by anyone, so a past student&apos;s saved link only matters while recordings are open. New links make every old saved link stop working for good, even during a later catch-up.
          </p>
          <p className="mt-2 text-sm font-semibold text-ink">
            {daysSinceRefresh === null
              ? "Links have never been refreshed."
              : daysSinceRefresh >= REFRESH_EVERY_DAYS
                ? `It has been ${daysSinceRefresh} days since the links were refreshed.`
                : `Links were refreshed ${daysSinceRefresh === 0 ? "today" : `${plural(daysSinceRefresh, "day")} ago`}.`}
          </p>
          {progress && busy === "refresh" && <p className="mt-2 text-sm text-ink-2" role="status">{progress}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={busy === "refresh"}
              disabled={!!busy || !olderThan30.length}
              onClick={() => setRefreshAsk({ title: `all ${plural(olderThan30.length, "recording")} older than ${REFRESH_EVERY_DAYS} days`, keys: olderThan30 })}
            >
              Refresh links older than {REFRESH_EVERY_DAYS} days ({olderThan30.length})
            </Button>
            {month !== "all" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={!!busy}
                onClick={() => {
                  const keys = rows.filter((r) => r.date.startsWith(month) && r.until <= nowMs).map((r) => r.key);
                  if (keys.length) setRefreshAsk({ title: `the ${plural(keys.length, "closed recording")} from ${monthLabel(month)}`, keys });
                  else toast("Nothing to refresh: every recording in this month is open to students right now.", "error");
                }}
              >
                Refresh {monthLabel(month)}
              </Button>
            )}
          </div>
          <p className="mt-3 max-w-[65ch] text-[13px] text-ink-3">
            Recordings open to students right now are left as they are. Nothing is deleted: Google Drive keeps each old file in &quot;Hamza Teaches recordings / Replaced links&quot;. Each new link is a full copy of the video, so delete that folder&apos;s files in Drive when you want the space back.
          </p>
        </Card>
      )}

      <Modal
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title={`Open all recordings for ${CATCH_UP_HOURS} hours?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAll(false)}>Cancel</Button>
            <Button onClick={() => void startAll()}>Open for {CATCH_UP_HOURS} hours</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          <p>
            Every current student will be able to open every past recording for their own level and subjects until <span className="font-semibold text-ink">{pkWhenLong(endsIfStarted)}</span> (Pakistan time). Then it closes by itself.
          </p>
          <p>Past students and removed students won&apos;t see them. You can close it sooner with &quot;Close now&quot;.</p>
          <p>Opening {plural(rows.length, "recording")} in Google Drive can take a minute or two. Keep this page open until it says done.</p>
        </div>
      </Modal>

      <Modal
        open={!!refreshAsk}
        onClose={() => setRefreshAsk(null)}
        title="Give these recordings new links?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefreshAsk(null)}>Cancel</Button>
            <Button onClick={() => refreshAsk && void refresh(refreshAsk.keys)}>Make new links</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-ink-2">
          <p>This makes new links for {refreshAsk?.title}. Any copy of an old link stops working for good.</p>
          <p>Google Drive copies each video (it can take a while; keep this page open). The old files move to &quot;Hamza Teaches recordings / Replaced links&quot; and are never deleted by the site.</p>
        </div>
      </Modal>
    </div>
  );
}

/** Timetable order of a level name (O Level, AS, A2), unknown levels last. */
function order(rows: Row[], levelName: string) {
  const r = rows.find((x) => x.levelName === levelName);
  const i = r?.level ? LEVEL_ORDER.indexOf(r.level) : -1;
  return i < 0 ? 99 : i;
}

function Chips({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  if (options.length < 2) return null;
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {["all", ...options].map((o) => (
        <button key={o} type="button" aria-pressed={value === o} onClick={() => onChange(o)} className={chipClass(value === o)}>
          {o === "all" ? `All ${label === "Level" ? "levels" : "subjects"}` : o}
        </button>
      ))}
    </div>
  );
}

/** The Drive file id in a recording's link, if it is a Drive link. */
const driveFileId = (url: string) => url.match(/\/d\/([\w-]+)/)?.[1] ?? url.match(/[?&]id=([\w-]+)/)?.[1] ?? null;

function RecordingItem({
  r,
  nowMs,
  busy,
  opened,
  onOne,
  onDelete,
  picked,
  onPick,
}: {
  r: Row;
  nowMs: number;
  busy: string | null;
  opened: Student[];
  onOne: (key: string, a: "open" | "close") => void;
  onDelete: (r: Row) => void;
  picked: boolean;
  onPick: (key: string, range: boolean) => void;
}) {
  const { toast } = useToast();
  const open = r.until > nowMs;
  const small = "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors pointer-coarse:h-11 pointer-coarse:px-4 disabled:opacity-50";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
      <RowCheck id={r.key} checked={picked} onToggle={onPick} label={`Select the ${r.subject} recording from ${dayLabel(r.date)}`} />
      <span className="min-w-0 flex-1 basis-48">
        <span className="block font-semibold tabular-nums text-ink">{dayLabel(r.date)}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-3">
          <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", open ? "bg-white/[0.07] text-ink" : "bg-surface-2 text-ink-3")}>
            {open ? `Open to students until ${pkWhen(r.until)}` : "Closed"}
          </span>
          {opened.length > 0 && (
            <span title={opened.map((s) => displayName(s.username)).join(", ")}>
              Opened by {opened.length <= 3 ? opened.map((s) => displayName(s.username)).join(", ") : `${opened.length} students`}
            </span>
          )}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-1">
        <a href={r.url} target="_blank" rel="noreferrer" className={cn(small, "text-ink-2 hover:bg-surface-2 hover:text-ink")} aria-label={`Open the ${r.subject} recording from ${dayLabel(r.date)}`}>
          <Icon.NewTab className="h-3.5 w-3.5" /> Open
        </a>
        <button
          type="button"
          className={cn(small, "text-ink-2 hover:bg-surface-2 hover:text-ink")}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(r.url)
              .then(() => toast("Link copied", "success"))
              .catch(() => toast("Couldn't copy. Use Open, then copy the address.", "error"));
          }}
        >
          Copy link
        </button>
        {driveFileId(r.url) && (
          <a
            href={`https://drive.google.com/uc?export=download&id=${driveFileId(r.url)}`}
            target="_blank"
            rel="noreferrer"
            className={cn(small, "text-ink-2 hover:bg-surface-2 hover:text-ink")}
            aria-label={`Download the ${r.subject} recording from ${dayLabel(r.date)}`}
          >
            <Icon.Download className="h-3.5 w-3.5" /> Download
          </a>
        )}
        <button
          type="button"
          disabled={!!busy}
          className={cn(small, "text-ink-3 hover:bg-[#E5685A]/[0.12] hover:text-[#F4A397]")}
          onClick={() => onDelete(r)}
          aria-label={`Delete the ${r.subject} recording from ${dayLabel(r.date)}`}
        >
          <Icon.Trash className="h-3.5 w-3.5" /> Delete
        </button>
        {open ? (
          <button type="button" disabled={!!busy} aria-busy={busy === r.key} className={cn(small, "border border-border-strong text-ink hover:bg-surface-2")} onClick={() => onOne(r.key, "close")}>
            {busy === r.key ? "Closing" : "Close now"}
          </button>
        ) : (
          <button type="button" disabled={!!busy} aria-busy={busy === r.key} className={cn(small, "border border-border-strong text-ink hover:bg-surface-2")} onClick={() => onOne(r.key, "open")}>
            {busy === r.key ? "Opening" : `Open for ${CATCH_UP_HOURS} hours`}
          </button>
        )}
      </span>
    </li>
  );
}
