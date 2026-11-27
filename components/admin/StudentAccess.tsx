"use client";

import { useState } from "react";
import type { Student } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { Button, Modal, RadioCard } from "@/components/ui";
import { ConfirmBulk, NameList, OneByOne, copyText, plural, waLink, type Step } from "@/components/admin/BulkBar";
import { displayName, isTestAccount } from "@/lib/display-name";
import { inPersonIds } from "@/lib/in-person";
import { farewellWhatsApp } from "@/lib/farewell-copy";
import { patchAccess, postAccess, reasonLabel, useAccess, type LeftKind, type PauseReason } from "@/lib/paused";

type Done = { kind: LeftKind; rows: Array<{ id: string; name: string; was: string; now?: string; link?: string; phone?: string; inPerson: boolean }> };

/**
 * Pause, resume, mark as left and bring back, for Hamza (staff never get these).
 * Returns the four actions and the dialogs they open; put `ui` once on the page.
 *
 * Pausing asks for the reason the student sees. Leaving asks finished or dropped
 * out; the server frees their username and sends back a farewell link for each,
 * which Hamza can send one by one on WhatsApp. Undo on a leave brings them back.
 */
export function useStudentAccess(opts: { onChanged?: () => void } = {}) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const access = useAccess();
  const [pauseFor, setPauseFor] = useState<Student[] | null>(null);
  const [reason, setReason] = useState<PauseReason | "">("");
  const [leaveFor, setLeaveFor] = useState<Student[] | null>(null);
  const [kind, setKind] = useState<LeftKind | "">("");
  const [done, setDone] = useState<Done | null>(null);
  const [steps, setSteps] = useState<Step[] | null>(null);

  const label = (list: Student[], n: number) => (n === 1 ? displayName(list[0].username) : plural(n, "student"));
  const trouble = (list: Student[], failed: Array<{ id: string; why: string }>) => {
    if (!failed.length) return "";
    const nameOf = (id: string) => displayName(list.find((s) => s.id === id)?.username ?? "");
    return ` Not changed: ${failed.slice(0, 5).map((f) => `${nameOf(f.id)} (${f.why})`).join(", ")}${failed.length > 5 ? " and more" : ""}.`;
  };

  async function pause(list: Student[], why: PauseReason | null) {
    if (!list.length) return;
    if (list.length > 1) toast(`Pausing ${plural(list.length, "student")}…`, "info");
    const r = await postAccess({ ids: list.map((s) => s.id), paused: true, reason: why });
    if (!r.ok) return toast(r.error, "error");
    const ok = r.out.done ?? [];
    const failed = r.out.failed ?? [];
    patchAccess((now) => {
      const paused = new Set(now.paused);
      const reasons = { ...now.reasons };
      for (const id of ok) {
        paused.add(id);
        if (why) reasons[id] = why;
        else delete reasons[id];
      }
      return { ...now, paused, reasons };
    });
    opts.onChanged?.();
    if (!ok.length) return toast(`Nothing changed.${trouble(list, failed)}`, "error");
    toast(
      `${label(list, ok.length)} paused${why ? ` (${reasonLabel(why)})` : ""}. They see the pause screen, get no reminders and no absent marks until you resume them.${trouble(list, failed)}`,
      failed.length ? "info" : "success",
      { label: "Undo", onClick: () => void resume(list.filter((s) => ok.includes(s.id))) },
    );
  }

  async function resume(all: Student[]) {
    // A left student comes back with Bring back, which also gives their username back.
    const list = all.filter((s) => !access.left[s.id]);
    if (!list.length) return;
    const before = Object.fromEntries(list.map((s) => [s.id, access.reasons[s.id] ?? null]));
    if (list.length > 1) toast(`Resuming ${plural(list.length, "student")}…`, "info");
    const r = await postAccess({ ids: list.map((s) => s.id), paused: false });
    if (!r.ok) return toast(r.error, "error");
    const ok = r.out.done ?? [];
    const failed = r.out.failed ?? [];
    patchAccess((now) => {
      const paused = new Set(now.paused);
      const reasons = { ...now.reasons };
      for (const id of ok) {
        paused.delete(id);
        delete reasons[id];
      }
      return { ...now, paused, reasons };
    });
    opts.onChanged?.();
    if (!ok.length) return toast(`Nothing changed.${trouble(list, failed)}`, "error");
    toast(`${label(list, ok.length)} resumed. The portal is open for them again.${trouble(list, failed)}`, failed.length ? "info" : "success", {
      label: "Undo",
      onClick: () => {
        // Paused again with the reason each one had.
        const back = list.filter((s) => ok.includes(s.id));
        for (const why of [null, "fees", "break"] as const) {
          const group = back.filter((s) => before[s.id] === why);
          if (group.length) void pause(group, why);
        }
      },
    });
  }

  async function leave(list: Student[], k: LeftKind) {
    if (!list.length) return;
    if (list.length > 1) toast(`Marking ${plural(list.length, "student")} as left…`, "info");
    const r = await postAccess({ ids: list.map((s) => s.id), left: k });
    if (!r.ok) return toast(r.error, "error");
    const ok = r.out.done ?? [];
    const failed = r.out.failed ?? [];
    const renamed = r.out.renamed ?? {};
    const links = r.out.links ?? {};
    const at = new Date().toISOString();
    patchAccess((now) => {
      const paused = new Set(now.paused);
      const reasons = { ...now.reasons };
      const left = { ...now.left };
      for (const id of ok) {
        const s = list.find((x) => x.id === id);
        paused.add(id);
        delete reasons[id];
        left[id] = { kind: k, at, username: s?.username ?? "", link: links[id] };
      }
      return { paused, reasons, left };
    });
    // Their new login names come from the database.
    if (Object.keys(renamed).length) void store.refresh();
    opts.onChanged?.();
    setLeaveFor(null);
    if (!ok.length) return toast(`Nothing changed.${trouble(list, failed)}`, "error");
    const tagged = inPersonIds(db);
    const leavers = list.filter((s) => ok.includes(s.id));
    toast(`${label(list, ok.length)} marked as left. ${ok.length === 1 ? "Their username is" : "Their usernames are"} free for a new student.${trouble(list, failed)}`, failed.length ? "info" : "success", {
      label: "Undo",
      onClick: () => void bringBack(leavers.map((s) => ({ ...s, username: renamed[s.id] ?? s.username }))),
    });
    setDone({
      kind: k,
      rows: leavers.map((s) => ({ id: s.id, name: displayName(s.username), was: s.username, now: renamed[s.id], link: links[s.id], phone: s.phone, inPerson: tagged.has(s.id) })),
    });
  }

  async function bringBack(list: Student[]) {
    if (!list.length) return;
    if (list.length > 1) toast(`Bringing back ${plural(list.length, "student")}…`, "info");
    const r = await postAccess({ ids: list.map((s) => s.id), left: null });
    if (!r.ok) return toast(r.error, "error");
    const ok = r.out.done ?? [];
    const failed = r.out.failed ?? [];
    const renamed = r.out.renamed ?? {};
    const kept = (r.out.notRestored ?? []).filter((id) => ok.includes(id));
    patchAccess((now) => {
      const paused = new Set(now.paused);
      const reasons = { ...now.reasons };
      const left = { ...now.left };
      for (const id of ok) {
        paused.delete(id);
        delete reasons[id];
        delete left[id];
      }
      return { paused, reasons, left };
    });
    if (Object.keys(renamed).length) void store.refresh();
    opts.onChanged?.();
    if (!ok.length) return toast(`Nothing changed.${trouble(list, failed)}`, "error");
    const keptLine = kept.length
      ? ` Someone else has the old username now, so ${kept.map((id) => `${displayName(list.find((s) => s.id === id)?.username ?? "")} signs in as ${renamed[id] ?? "their new one"}`).slice(0, 3).join(", ")}${kept.length > 3 ? " and more" : ""}. Change it in Edit if you like, then send their login.`
      : "";
    toast(`${label(list, ok.length)} brought back. The portal is open for them again.${keptLine}${trouble(list, failed)}`, kept.length || failed.length ? "info" : "success");
  }

  /**
   * The farewell for students who have already left: asking the server to mark
   * them left again (same kind) changes nothing and hands back their links.
   */
  async function sendFarewell(list: Student[]) {
    const tagged = inPersonIds(db);
    const rows: Done["rows"] = [];
    const kinds = new Map<string, LeftKind>();
    for (const k of ["finished", "dropped"] as const) {
      const group = list.filter((s) => access.left[s.id]?.kind === k);
      if (!group.length) continue;
      const r = await postAccess({ ids: group.map((s) => s.id), left: k });
      if (!r.ok) return toast(r.error, "error");
      for (const s of group) {
        const was = access.left[s.id]?.username || s.username;
        kinds.set(s.id, k);
        rows.push({ id: s.id, name: displayName(was), was, link: r.out.links?.[s.id], phone: s.phone, inPerson: tagged.has(s.id) });
      }
    }
    if (!rows.length) return;
    setSteps(rows.map((row) => farewellSteps({ kind: kinds.get(row.id) ?? "finished", rows: [row] })[0]));
  }

  function farewellSteps(d: Done): Step[] {
    return d.rows.map((row) => {
      const first = (row.name.split(" ")[0] ?? row.name).toLowerCase();
      const message = row.link ? farewellWhatsApp(d.kind, first, row.link) : undefined;
      return {
        id: row.id,
        name: row.name,
        detail: `Student${row.phone ? ` · ${row.phone}` : ""}`,
        message,
        href: message ? waLink(row.phone, message) : null,
        missing: !row.link ? "no farewell link came back" : row.inPerson ? "taught in person, no numbers kept" : "no student number saved",
      };
    });
  }

  const real = (list: Student[]) => list.filter((s) => !isTestAccount(s));

  const ui = (
    <>
      <ConfirmBulk
        open={!!pauseFor}
        onClose={() => setPauseFor(null)}
        title={pauseFor ? `Pause ${label(pauseFor, pauseFor.length)}?` : "Pause access?"}
        description="They see the pause screen, get no reminders and are left out of attendance. Their work and marks are all kept, and you can resume them any time."
        confirmLabel="Pause access"
        onConfirm={async () => {
          if (!pauseFor) return;
          await pause(pauseFor, reason || null);
          setPauseFor(null);
        }}
      >
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold text-ink-2">What they see</legend>
          <RadioCard name="pause-reason" checked={reason === ""} onChange={() => setReason("")} label="No reason shown" />
          <RadioCard name="pause-reason" checked={reason === "fees"} onChange={() => setReason("fees")} label="Fees due" />
          <RadioCard name="pause-reason" checked={reason === "break"} onChange={() => setReason("break")} label="On a break" />
        </fieldset>
        {pauseFor && pauseFor.length > 1 && <NameList names={pauseFor.map((s) => displayName(s.username))} />}
      </ConfirmBulk>

      <ConfirmBulk
        open={!!leaveFor}
        onClose={() => setLeaveFor(null)}
        title={leaveFor ? `Mark ${label(leaveFor, leaveFor.length)} as left?` : "Mark as left?"}
        description="Their username is freed for a new student. They keep a farewell screen; nothing of theirs is deleted."
        confirmLabel="Mark as left"
        disabled={!kind}
        onConfirm={async () => {
          if (leaveFor && kind) await leave(leaveFor, kind);
        }}
      >
        <fieldset className="space-y-2">
          <legend className="sr-only">Why they left</legend>
          <RadioCard name="left-kind" checked={kind === "finished"} onChange={() => setKind("finished")} label="Finished the course" />
          <RadioCard name="left-kind" checked={kind === "dropped"} onChange={() => setKind("dropped")} label="Dropped out" />
        </fieldset>
        {leaveFor && leaveFor.length > 1 && <NameList names={leaveFor.map((s) => displayName(s.username))} />}
        <p>You can bring them back any time.</p>
      </ConfirmBulk>

      <Modal
        open={!!done}
        onClose={() => setDone(null)}
        title={done && done.rows.length === 1 ? `${done.rows[0].name} has left` : `${plural(done?.rows.length ?? 0, "student")} marked as left`}
        description="Send each one a goodbye with a link to tell you how the classes were."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDone(null)}>Done</Button>
            {done && done.rows.some((r) => r.link && r.phone && !r.inPerson) && (
              <Button
                onClick={() => {
                  setSteps(farewellSteps(done));
                  setDone(null);
                }}
              >
                Send farewell on WhatsApp
              </Button>
            )}
          </>
        }
      >
        {done && (
          <ul className="divide-y divide-hairline rounded-tile bg-surface-2 text-sm">
            {done.rows.slice(0, 8).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">{row.name}</span>
                  <span className="block break-all text-ink-3">
                    {row.now ? `${row.was} is free. They sign in as ${row.now} now.` : `${row.was} is free.`}
                  </span>
                </span>
                {row.link && (
                  <button
                    type="button"
                    onClick={() => void copyText(row.link!).then((ok) => toast(ok ? `${row.name}'s farewell link copied.` : "Couldn't copy. Your browser blocked it; try again.", ok ? "success" : "error"))}
                    className="min-h-11 text-sm font-semibold text-ink-2 underline underline-offset-4 hover:text-ink"
                  >
                    Copy link
                  </button>
                )}
              </li>
            ))}
            {done.rows.length > 8 && <li className="px-4 py-2.5 text-ink-3">and {done.rows.length - 8} more</li>}
          </ul>
        )}
      </Modal>

      <OneByOne onClose={() => setSteps(null)} title="Send farewell one by one" steps={steps} />
    </>
  );

  return {
    access,
    /** Asks for the reason first. Hamza's test account is left out. */
    askPause: (list: Student[]) => {
      const go = real(list).filter((s) => !access.paused.has(s.id));
      if (!go.length) return;
      setReason("");
      setPauseFor(go);
    },
    resume: (list: Student[]) => void resume(list),
    /** Asks finished or dropped out first. */
    askLeave: (list: Student[]) => {
      // Ticked together: Hamza's test account is left out (it can still be marked on its own, to try the farewell).
      const go = (list.length > 1 ? real(list) : list).filter((s) => !access.left[s.id]);
      if (!go.length) return;
      setKind("");
      setLeaveFor(go);
    },
    bringBack: (list: Student[]) => void bringBack(list.filter((s) => access.left[s.id])),
    /** For students who have already left: their farewell links, one by one on WhatsApp. */
    sendFarewell: (list: Student[]) => void sendFarewell(list.filter((s) => access.left[s.id] && !isTestAccount(s))),
    ui,
  };
}
