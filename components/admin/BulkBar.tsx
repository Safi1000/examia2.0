"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button, Modal } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { CSV_BOM, toCsv } from "@/lib/export";
import type { Selection } from "@/lib/use-selection";
import type { Test } from "@/types";
import type { Database } from "@/lib/data/seed";
import { archivedCohortIds, eligibleStudents, liveStatus } from "@/lib/data/selectors";
import { displayName, isTestAccount } from "@/lib/display-name";
import { studentMissedTest, studentTestClosing } from "@/lib/portal-messages";
import { waDigits } from "@/lib/phone";
import { formatRelative } from "@/lib/time";

/*
 * Selecting several rows anywhere in the teacher console, one way everywhere:
 *
 *   <SelectAll sel={sel} noun="test" />      the three-state "Select all 23" strip
 *   <RowCheck id=… checked=… onToggle=… />   one tick box per row (shift-click for a range)
 *   <BulkBar …actions />                     the bar at the bottom once something is ticked
 *   <ConfirmBulk />                          the confirmation every bulk action goes through
 *   <OneByOne />                             WhatsApp (or marking) one person after another
 */

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------------ */

/**
 * Square tick box used to select a row: quiet when off, off-white when on (gold
 * stays for the action). The hit area reaches 44px without moving the layout.
 * With `id` and `onToggle`, a shift-click ticks the whole range.
 */
export function RowCheck({
  checked,
  onChange,
  onToggle,
  id,
  label,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  onToggle?: (id: string, range: boolean) => void;
  id?: string;
  label: string;
}) {
  return (
    <label className="relative inline-flex h-5 w-5 shrink-0 cursor-pointer select-none before:absolute before:-inset-3 before:content-['']">
      <input
        type="checkbox"
        checked={checked}
        data-row={id}
        // Shift-click: no text gets highlighted on the way.
        onMouseDown={shiftNoSelect}
        onClick={onToggle && id ? (e) => onToggle(id, e.shiftKey) : undefined}
        onChange={onToggle ? noop : (e) => onChange?.(e.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <Box state={checked ? "all" : "none"} />
    </label>
  );
}

function noop() {}
function shiftNoSelect(e: React.MouseEvent) {
  if (e.shiftKey) e.preventDefault();
}

function Box({ state }: { state: "none" | "some" | "all" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-[6px] border transition-colors duration-150 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand",
        state !== "none" ? "border-ink/80 bg-ink text-paper" : "border-border-strong bg-surface hover:border-ink-3",
      )}
    >
      {state === "all" && (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {state === "some" && <span className="h-0.5 w-2.5 rounded-full bg-current" />}
    </span>
  );
}

/**
 * The strip above a list: a three-state tick box that selects every row the
 * current filter shows, and says how many that is.
 */
export function SelectAll({ sel, noun, className }: { sel: Selection; noun: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = sel.all === "some";
  }, [sel.all]);
  if (sel.total === 0) return null;
  const many = sel.total === 1 ? noun : `${noun}s`;
  return (
    <div className={cn("mb-2 flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-4", className)}>
      <label className="flex min-h-11 cursor-pointer select-none items-center gap-3 text-sm font-semibold text-ink-2 hover:text-ink">
        <span className="relative inline-flex h-5 w-5 shrink-0">
          <input
            ref={ref}
            type="checkbox"
            checked={sel.all === "all"}
            onChange={sel.toggleAll}
            aria-label={sel.all === "all" ? `Clear all ${sel.total} ${many}` : `Select all ${sel.total} ${many} shown`}
            className="peer sr-only"
          />
          <Box state={sel.all} />
        </span>
        <span className="tabular-nums">
          {sel.all === "all" ? `All ${sel.total} selected` : sel.all === "some" ? `${sel.count} of ${sel.total} selected` : `Select all ${sel.total}`}
        </span>
      </label>
      {sel.all === "some" && (
        <button type="button" onClick={sel.selectAll} className="min-h-11 text-sm font-semibold text-ink-3 underline-offset-4 hover:text-ink hover:underline">
          Select all {sel.total}
        </button>
      )}
      <span className="hidden text-xs text-ink-3 pointer-fine:inline">Shift-click ticks a range. Esc clears.</span>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

export type BulkAction = {
  id: string;
  label: string;
  run: () => void;
  /** The one gold button in the bar. */
  primary?: boolean;
  /** Destructive: always last, in the More menu, below a line. */
  danger?: boolean;
  disabled?: boolean;
  title?: string;
};

/**
 * The bar that appears once rows are ticked. It sits at the bottom of the
 * screen (above the phone's menu bar and safe area) while the list scrolls, and
 * settles under the list at the end, so it never covers the last row.
 *
 * The list hands it the actions, most useful first. The first few show as
 * buttons (two on a phone, four from tablet width); the rest, and anything
 * destructive, go under More.
 */
export function BulkBar({
  count,
  onClear,
  actions,
  busy,
  status,
  children,
}: {
  count: number;
  /** Kept for older callers; the bar now just says "3 selected". */
  noun?: string;
  onClear: () => void;
  actions?: BulkAction[];
  /** A bulk action is running: every button waits. */
  busy?: string | null;
  /** Progress while it runs ("Opening 3 of 8"), shown in place of the count. */
  status?: string | null;
  children?: React.ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const menuId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const list = useMemo(() => actions ?? [], [actions]);
  const safe = list.filter((a) => !a.danger);
  const danger = list.filter((a) => a.danger);
  const phoneMore = safe.slice(2);
  const wideMore = safe.slice(4);
  const hasMore = phoneMore.length > 0 || danger.length > 0;
  const wideHasMore = wideMore.length > 0 || danger.length > 0;

  // The menu closes on a tap outside it or Escape (which then doesn't clear the selection).
  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenu(false);
      }
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [menu]);

  const onAction = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const a = list.find((x) => x.id === e.currentTarget.dataset.action);
      setMenu(false);
      if (a && !a.disabled && !busy) a.run();
    },
    [list, busy],
  );

  if (count === 0) return null;
  return (
    <div
      ref={wrap}
      role="region"
      aria-label="Selected rows"
      data-toast-avoid
      className="sticky bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-30 mt-3 md:bottom-4"
    >
      <div className="rounded-2xl border border-border-strong bg-surface-2/95 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_40px_-12px_rgba(0,0,0,0.75)] backdrop-blur animate-fade-up xl:flex xl:items-center xl:gap-2">
        {/* Phone and tablet: the count and Clear on top, the actions below. Wide laptop: one line. */}
        <div className="flex items-center justify-between gap-2 xl:contents">
          <span className={cn("pl-1 text-sm font-semibold tabular-nums text-ink", !status && "whitespace-nowrap")} aria-live="polite">
            {status || `${count} selected`}
          </span>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={!!busy} aria-label="Clear the selection" className="xl:order-last">
            Clear
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-1 pt-1 md:justify-end xl:ml-auto xl:py-0">
          {children}
          {safe.map((a, i) => (
            <Button
              key={a.id}
              size="sm"
              variant={a.primary ? "primary" : "secondary"}
              data-action={a.id}
              onClick={onAction}
              disabled={a.disabled || !!busy}
              loading={busy === a.id}
              title={a.title}
              className={cn(i >= 2 && "max-md:hidden", i >= 4 && "md:hidden")}
            >
              {a.label}
            </Button>
          ))}
          {hasMore && (
            <div className={cn(!wideHasMore && "md:hidden")}>
              <Button
                size="sm"
                variant="secondary"
                aria-haspopup="menu"
                aria-expanded={menu}
                aria-controls={menuId}
                onClick={() => setMenu((m) => !m)}
                disabled={!!busy}
                aria-label="More actions"
                // Phones: just the arrow, so the two actions and More keep to one line.
                className="max-md:w-11 max-md:px-0"
              >
                <span className="max-md:hidden">More</span>
                <svg viewBox="0 0 24 24" className={cn("h-4 w-4 transition-transform", menu && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="m6 15 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Button>
              {menu && (
                <div
                  id={menuId}
                  role="menu"
                  className="absolute bottom-full right-0 z-40 mb-2 w-64 max-w-full overflow-hidden rounded-xl border border-border-strong bg-surface-2 py-1 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]"
                >
                  {safe.map((a, i) => (
                    <button
                      key={a.id}
                      type="button"
                      role="menuitem"
                      data-action={a.id}
                      onClick={onAction}
                      disabled={a.disabled}
                      title={a.title}
                      className={cn(
                        "flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold text-ink-2 hover:bg-white/[0.05] hover:text-ink disabled:opacity-50",
                        i < 2 && "hidden",
                        i < 4 && "md:hidden",
                      )}
                    >
                      {a.label}
                    </button>
                  ))}
                  {danger.length > 0 && <div className="my-1 border-t border-border" role="separator" />}
                  {danger.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      role="menuitem"
                      data-action={a.id}
                      onClick={onAction}
                      disabled={a.disabled}
                      title={a.title}
                      className="flex min-h-11 w-full items-center px-4 text-left text-sm font-semibold text-error hover:bg-error-soft disabled:opacity-50"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

/**
 * The confirmation for a bulk action: says how many and what happens, then
 * runs once (a second tap while it runs does nothing). With `ack`, the confirm
 * button waits until Hamza ticks that line (for deletes that take results too).
 */
export function ConfirmBulk({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  danger,
  ack,
  disabled,
  onConfirm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  danger?: boolean;
  ack?: string;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}) {
  const [running, setRunning] = useState(false);
  const [acked, setAcked] = useState(false);
  const once = useRef(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setAcked(false);
  }
  async function go() {
    if (once.current) return;
    once.current = true;
    setRunning(true);
    try {
      await onConfirm();
    } finally {
      once.current = false;
      setRunning(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => !running && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} loading={running} disabled={disabled || (!!ack && !acked)} onClick={() => void go()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-ink-2">
        {children}
        {ack && (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-error/30 bg-error-soft px-3 py-2.5 text-ink">
            <input type="checkbox" checked={acked} onChange={(e) => setAcked(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-error,#e5484d)]" />
            <span>{ack}</span>
          </label>
        )}
      </div>
    </Modal>
  );
}

/** A short list of names inside a confirmation ("Amelia, Bilal and 4 more"). */
export function NameList({ names, max = 6 }: { names: string[]; max?: number }) {
  if (!names.length) return null;
  const shown = names.slice(0, max);
  return (
    <p className="text-ink-3">
      {shown.join(", ")}
      {names.length > max ? ` and ${names.length - max} more` : ""}.
    </p>
  );
}

/* ------------------------------------------------------------------------ */

export type Step = {
  id: string;
  name: string;
  /** Under the name: who it goes to, the number. */
  detail?: string;
  /** The ready message, shown before opening. */
  message?: string;
  /** Where "Open" goes. Missing = this one is skipped, with `missing` as the reason. */
  href?: string | null;
  missing?: string;
};

/**
 * One after another: WhatsApp only opens one chat at a time, so this steps
 * through the people picked, opening each prepared chat in turn. "Next" moves
 * on. Anyone without a number is named up front and at the end, never dropped
 * silently, and never makes Hamza tap through an empty step.
 */
const NO_STEPS: Step[] = [];

export function OneByOne({
  onClose,
  title,
  steps: run,
  openLabel = "Open WhatsApp",
  doneNoun = "chat",
}: {
  onClose: () => void;
  title: string;
  /** null = closed. A new list starts again at the first person. */
  steps: Step[] | null;
  openLabel?: string;
  doneNoun?: string;
}) {
  const open = !!run;
  const all = run ?? NO_STEPS;
  const [i, setI] = useState(0);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  // A new run starts at the first person.
  const [seen, setSeen] = useState(all);
  if (seen !== all) {
    setSeen(all);
    setI(0);
    setOpened(new Set());
  }
  const steps = useMemo(() => all.filter((x) => x.href), [all]);
  const left = useMemo(() => all.filter((x) => !x.href), [all]);
  const done = i >= steps.length;
  const s = done ? null : steps[i];
  const sent = opened.size;
  // Grouped by reason, each name once: "Left out, no student number saved: Amelia, Noah and 6 more."
  const leftNote = left.length > 0 && (
    <div className="space-y-1 text-sm text-ink-3">
      {[...new Set(left.map((x) => x.missing ?? "no number saved"))].map((why) => {
        const names = [...new Set(left.filter((x) => (x.missing ?? "no number saved") === why).map((x) => x.name))];
        return (
          <p key={why}>
            Left out, {why}: {names.slice(0, 10).join(", ")}
            {names.length > 10 ? ` and ${names.length - 10} more` : ""}.
          </p>
        );
      })}
    </div>
  );

  function markOpened() {
    if (s) setOpened((o) => new Set(o).add(s.id));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={s ? `${i + 1} of ${steps.length}` : undefined}
      footer={
        !s ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0}>
              Back
            </Button>
            {!opened.has(s.id) && (
              <Button variant="secondary" onClick={() => setI((n) => n + 1)}>
                Skip
              </Button>
            )}
            {!opened.has(s.id) ? (
              <a href={s.href ?? undefined} target="_blank" rel="noreferrer" onClick={markOpened} className={buttonClasses()}>
                {openLabel}
              </a>
            ) : (
              <Button onClick={() => setI((n) => n + 1)} autoFocus>
                {i + 1 >= steps.length ? "Finish" : "Next"}
              </Button>
            )}
          </>
        )
      }
    >
      {!s ? (
        <div className="space-y-2 text-sm text-ink-2" role="status">
          {steps.length === 0 ? (
            <p className="font-semibold text-ink">Nobody here has a number to open.</p>
          ) : (
            <p className="font-semibold text-ink">
              {sent ? `${plural(sent, doneNoun)} opened.` : `No ${doneNoun}s opened.`}
              {steps.length - sent > 0 ? ` ${steps.length - sent} skipped by you.` : ""}
            </p>
          )}
          {leftNote}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-base font-semibold text-ink">{s.name}</p>
            {s.detail && <p className="text-sm tabular-nums text-ink-3">{s.detail}</p>}
          </div>
          {s.message && (
            <p className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-surface px-3 py-2.5 text-sm leading-relaxed text-ink-2">{s.message}</p>
          )}
          {opened.has(s.id) && <p className="text-sm text-ink-3">Opened. Send it there, then come back for the next one.</p>}
          {/* Progress dots for short runs. */}
          {steps.length > 1 && steps.length <= 24 && (
            <div className="flex flex-wrap gap-1" aria-hidden>
              {steps.map((x, n) => (
                <span key={x.id} className={cn("h-1.5 w-4 rounded-full", n === i ? "bg-ink" : opened.has(x.id) ? "bg-ink-3" : "bg-border-strong")} />
              ))}
            </div>
          )}
          {i === 0 && leftNote}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------------ */

/** Copy text, saying honestly whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Download rows as a spreadsheet Excel opens with Urdu names intact. */
export function downloadCsv(rows: Record<string, string | number>[], name: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(new Blob([CSV_BOM + toCsv(rows)], { type: "text/csv" }));
  a.href = url;
  a.download = `${name}-${new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * The outcome line for a bulk action: "12 released. 1 not released: Amelia
 * (the test is still open)."
 */
export function outcome(done: number, verb: string, problems: { name: string; why: string }[], noun = "") {
  const head = done ? `${done}${noun ? ` ${done === 1 ? noun : `${noun}s`}` : ""} ${verb}.` : `Nothing ${verb}.`;
  if (!problems.length) return head;
  const byWhy = new Map<string, string[]>();
  for (const p of problems) byWhy.set(p.why, [...(byWhy.get(p.why) ?? []), p.name]);
  const parts = [...byWhy].map(([why, names]) => `${names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ")} (${why})`);
  return `${head} ${problems.length} not ${verb}: ${parts.join("; ")}.`;
}

/** A WhatsApp link with the message typed in, or null without a number. */
export const waLink = (phone: string | null | undefined, text?: string) =>
  phone && waDigits(phone).length >= 8 ? `https://wa.me/${waDigits(phone)}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;

/**
 * Everyone a test was set for who hasn't handed it in, one step each, with the
 * existing message: "closes soon" while it is open, "didn't get your paper"
 * once it has closed. Never Hamza's test account, never past students.
 */
export function chaseSteps(db: Database, tests: Test[], nowMs: number): Step[] {
  const off = archivedCohortIds(db);
  const out: Step[] = [];
  for (const t of tests) {
    if (t.status === "draft") continue;
    const handed = new Set(db.submissions.filter((x) => x.testId === t.id && x.status !== "in_progress").map((x) => x.studentId));
    const open = liveStatus(t, nowMs) === "active";
    for (const s of eligibleStudents(db, t)) {
      if (handed.has(s.id) || off.has(s.cohortId) || isTestAccount(s)) continue;
      const message = open
        ? studentTestClosing({ id: s.id, username: s.username, title: t.title, when: formatRelative(t.closesAt, nowMs) })
        : studentMissedTest({ id: s.id, username: s.username, title: t.title });
      const href = waLink(s.phone, message);
      out.push({
        id: `${t.id}|${s.id}`,
        name: displayName(s.username),
        detail: `${t.title}${s.phone ? ` · ${s.phone}` : ""}`,
        message,
        href,
        missing: href ? undefined : "no student number saved",
      });
    }
  }
  return out;
}
