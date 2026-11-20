"use client";

import { useState } from "react";
import type { Test } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { eligibleStudents, lateWindows, liveStatus } from "@/lib/data/selectors";
import { useIsStaff } from "@/lib/staff";
import { useNow } from "@/hooks/useNow";
import { useToast } from "@/components/toast";
import { Card, CardHeader, CardBody, Button, Modal } from "@/components/ui";
import { displayName } from "@/lib/display-name";
import { formatWhen } from "@/lib/time";
import { unsentAnswers } from "@/lib/sitting";

type Found = { studentId: string; answered: number; savedAt: string };

/**
 * Answers a student saved while sitting a test but never handed in (the
 * phone died, the last hand in failed, they never came back). They sit on
 * the server as the student's saved copy; this brings them in as papers
 * handed in at time up, so nobody reads as "not attempted" by mistake.
 *
 * Hamza only, and only from 30 minutes after the test closed for everyone:
 * a phone still retrying its own hand in on a weak signal gets there first
 * (the server keeps the first paper in). It first lists who it would bring
 * in, and nothing changes until he says so.
 */
const SETTLE_MS = 30 * 60_000;
export function CollectUnsentCard({ test }: { test: Test }) {
  const staff = useIsStaff();
  const db = useDatabase();
  const store = useStore();
  const nowMs = useNow();
  const { toast } = useToast();
  const [checking, setChecking] = useState(false);
  const [found, setFound] = useState<Found[] | null>(null);
  const [collecting, setCollecting] = useState(false);

  if (staff || test.status === "draft" || liveStatus(test, nowMs) !== "closed") return null;
  const readyAt = +new Date(test.closesAt) + SETTLE_MS;
  const waiting = nowMs < readyAt;

  const nameOf = (id: string) => {
    const s = db.students.find((x) => x.id === id);
    return s ? displayName(s.username) : "A student";
  };
  const paper = test.questions.length;

  // Everyone the test was for who hasn't handed in, minus anyone in a late window (or out of one under 30 minutes ago).
  function candidates() {
    const openLate = new Set(lateWindows(db).filter((e) => e.testId === test.id && +new Date(e.until) + SETTLE_MS > Date.now()).map((e) => e.studentId));
    return eligibleStudents(db, test)
      .filter((s) => !openLate.has(s.id) && !db.submissions.some((x) => x.testId === test.id && x.studentId === s.id))
      .map((s) => s.id);
  }

  async function look() {
    const ids = candidates();
    if (!ids.length) {
      toast("Everyone this test was for has handed it in.", "info");
      return;
    }
    setChecking(true);
    try {
      const r = await unsentAnswers("unsent", test.id, ids);
      if (r.error) return toast(r.error, "error");
      if (!r.unsent?.length) return toast("No unsent answers on this test.", "info");
      setFound(r.unsent);
    } catch {
      toast("Couldn't check. Check your internet and try again.", "error");
    } finally {
      setChecking(false);
    }
  }

  async function collect() {
    if (!found) return;
    setCollecting(true);
    try {
      const r = await unsentAnswers("collect", test.id, found.map((f) => f.studentId));
      if (r.error) return toast(r.error, "error");
      await store.refresh();
      const got = r.collected?.length ?? 0;
      const failed = r.failed?.length ?? 0;
      setFound(null);
      if (failed) toast(`${got} brought in. ${failed} didn't save (${r.failed!.map(nameOf).join(", ")}). Try again.`, got ? "info" : "error");
      else toast(`${got} ${got === 1 ? "paper" : "papers"} brought in. They're in Marking, marked as handed in at time up.`, "success");
    } catch {
      toast("That didn't finish. Check Marking, then try again for anyone missing.", "error");
    } finally {
      setCollecting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Unsent answers</h2>
        <p className="mt-1 text-sm text-ink-3">
          Answers a student saved while sitting it but never handed in: a dead phone, a hand in that failed. Bring them in to mark.
        </p>
      </CardHeader>
      <CardBody>
        {waiting ? (
          <p className="text-sm text-ink-3">
            Ready from {formatWhen(new Date(readyAt).toISOString())}, 30 minutes after it closed, so a phone still trying to hand in on a weak signal gets there first.
          </p>
        ) : (
          <Button variant="secondary" fullWidth loading={checking} onClick={() => void look()}>
            Collect unsent answers
          </Button>
        )}
      </CardBody>

      <Modal
        open={!!found}
        onClose={() => !collecting && setFound(null)}
        title={found ? `Bring in ${found.length} ${found.length === 1 ? "paper" : "papers"}?` : ""}
        description="Each comes in as handed in at time up, with the answers they last saved."
        footer={
          <>
            <Button variant="secondary" disabled={collecting} onClick={() => setFound(null)}>Cancel</Button>
            <Button loading={collecting} onClick={() => void collect()}>
              Bring them in
            </Button>
          </>
        }
      >
        <ul className="divide-y divide-hairline rounded-tile bg-surface-2 text-sm">
          {(found ?? []).map((f) => (
            <li key={f.studentId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-4 py-2.5">
              <span className="font-semibold text-ink">{nameOf(f.studentId)}</span>
              <span className="tabular-nums text-ink-3">
                {f.answered} of {paper} answered · saved {formatWhen(f.savedAt)}
              </span>
            </li>
          ))}
        </ul>
      </Modal>
    </Card>
  );
}
