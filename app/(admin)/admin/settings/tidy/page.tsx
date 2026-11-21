"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { countPill, panelTitle } from "@/components/admin/surface";
import { Button, Card, EmptyState, Icon, Spinner } from "@/components/ui";
import { useDatabase, useStore } from "@/lib/data/store";
import { TIDY_MAX, type DoubledNotice } from "@/lib/doubled-notices";
import { useIsStaff } from "@/lib/staff";

/**
 * Tidy doubled notices (Settings, Hamza only).
 *
 * Step one only looks: the "New test" notices that were written more than once
 * and how many extra copies each has. Step two removes exactly the copies
 * shown, after a second press. The store checks every id again at that moment
 * and always keeps the oldest copy (lib/doubled-notices.ts).
 */

const THIS_YEAR = new Date().getFullYear();
const when = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi", ...(d.getFullYear() !== THIS_YEAR ? { year: "numeric" } : {}) });
};
const copies = (n: number) => `${n} ${n === 1 ? "copy" : "copies"}`;
const extraCopies = (n: number) => `${n} extra ${n === 1 ? "copy" : "copies"}`;
const notices = (n: number) => `${n} ${n === 1 ? "notice" : "notices"}`;

interface Done {
  removed: number;
  asked: number;
  stopped: boolean;
  /** What went, by notice, for the summary. */
  lines: Array<{ key: string; title: string; who: string; removed: number }>;
}

export default function TidyDoubledNoticesPage() {
  const staff = useIsStaff();
  const store = useStore();
  const db = useDatabase();
  const [list, setList] = useState<DoubledNotice[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const got = await store.loadDoubledNotices();
    setFailed(!got);
    setList(got);
  }, [store]);

  // Looking only: nothing is removed by opening this page.
  useEffect(() => {
    if (staff) return;
    let alive = true;
    void store.loadDoubledNotices().then((got) => {
      if (!alive) return;
      setFailed(!got);
      setList(got);
    });
    return () => {
      alive = false;
    };
  }, [staff, store]);

  // The layout sends staff away from Settings; this page shows them nothing either way.
  if (staff) return null;

  const who = (n: DoubledNotice) => {
    if (n.audience === "admin") return "Your own feed";
    if (!n.cohortId) return "All students";
    return db.cohorts.find((c) => c.id === n.cohortId)?.name ?? "A cohort that was removed";
  };
  const total = (list ?? []).reduce((sum, n) => sum + n.extraIds.length, 0);

  async function remove() {
    if (!list || busy) return;
    setBusy(true);
    setError("");
    // Exactly the ids on screen, in parts the store accepts.
    const shown = list;
    const ids = shown.flatMap((n) => n.extraIds);
    const gone = new Set<string>();
    let stopped = false;
    let problem = "";
    for (let i = 0; i < ids.length && !stopped; i += TIDY_MAX) {
      const res = await store.removeDoubledNotices(ids.slice(i, i + TIDY_MAX));
      if ("error" in res) {
        problem = res.error;
        stopped = true;
      } else {
        res.removed.forEach((id) => gone.add(id));
        stopped = !!res.stopped;
      }
    }
    setConfirming(false);
    if (problem && !gone.size) setError(problem);
    else
      setDone({
        removed: gone.size,
        asked: ids.length,
        stopped,
        lines: shown
          .map((n) => ({ key: n.key, title: n.title, who: who(n), removed: n.extraIds.filter((id) => gone.has(id)).length }))
          .filter((l) => l.removed > 0),
      });
    await load();
    setBusy(false);
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-5 py-8 sm:px-8">
      <PageHeader
        title="Tidy doubled notices"
        subtitle="Before 21 November, publishing a test could write its New test notice twice. This finds those and removes the extra copies. The first copy of each notice always stays."
        back={{ href: "/admin/settings", label: "Settings" }}
      />

      {done && (
        <Card className="p-5 sm:p-6" as="section">
          <div role="status">
            <h2 className={panelTitle}>
              {done.removed ? `Removed ${extraCopies(done.removed)}.` : "Nothing was removed."}
            </h2>
            <p className="mt-1.5 text-base text-ink-2">
              {done.removed === done.asked
                ? "One copy of each notice is still there, so students see each New test once."
                : done.stopped
                  ? "It stopped part way. What is left is listed below, and you can try again."
                  : done.removed
                    ? "The rest had already changed, so I left them alone."
                    : "The list had already changed, so I left everything alone."}
            </p>
          </div>
          {done.lines.length > 0 && (
            <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
              {done.lines.map((l) => (
                <li key={l.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                  <span className="min-w-0 text-base text-ink">
                    {l.title} <span className="text-ink-3">· {l.who}</span>
                  </span>
                  <span className="text-sm tabular-nums text-ink-3">{copies(l.removed)} removed</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {error && (
        <Card className="p-5 text-base text-ink-2 sm:p-6">
          <p role="alert">{error}</p>
        </Card>
      )}

      {failed ? (
        <Card className="p-5 text-base text-ink-2 sm:p-6">
          The notices didn&apos;t load. Nothing was changed.{" "}
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setList(null);
              void load();
            }}
            className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4"
          >
            Try again
          </button>
        </Card>
      ) : list === null ? (
        <p role="status" className="flex items-center gap-2 text-sm text-ink-3">
          <span aria-hidden className="contents"><Spinner size={16} className="text-ink-3" /></span> Looking…
        </p>
      ) : list.length === 0 ? (
        <EmptyState icon={<Icon.Check />} title="Nothing to tidy" message="Every New test notice is there once." />
      ) : (
        <Card className="overflow-hidden p-0" as="section">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4">
            <div className="min-w-0">
              <h2 className={panelTitle}>
                {extraCopies(total)} in {notices(list.length)}
              </h2>
              <p className="mt-1 text-sm text-ink-3">Nothing has been removed yet. This is only the list.</p>
            </div>
            {!confirming && (
              <Button onClick={() => setConfirming(true)} disabled={busy}>
                Remove the extra copies
              </Button>
            )}
          </div>

          {confirming && (
            <div role="alertdialog" aria-labelledby="tidy-confirm-title" aria-describedby="tidy-confirm-text" className="border-b border-hairline bg-surface-2 px-5 py-4">
              <p id="tidy-confirm-title" className="text-base font-semibold text-ink">
                Remove {extraCopies(total)}?
              </p>
              <p id="tidy-confirm-text" className="mt-1 text-base text-ink-2">
                This cannot be undone. One copy of each notice stays, so no student loses a notice.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="danger" loading={busy} onClick={() => void remove()}>
                  Yes, remove {total}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => setConfirming(false)} autoFocus>
                  Keep them
                </Button>
              </div>
            </div>
          )}

          <ul className="divide-y divide-hairline">
            {list.map((n) => (
              <li key={n.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
                <span className="min-w-0 flex-1 max-sm:basis-full">
                  <span className="block text-base font-semibold text-ink">{n.title}</span>
                  <span className="block text-sm text-ink-3">
                    {who(n)} · first sent {when(n.firstAt)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-ink-2 max-sm:basis-full">
                  <span className={countPill}>{copies(n.copies)} found</span>
                  <span>{n.extraIds.length} to remove</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
