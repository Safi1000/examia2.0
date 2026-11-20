"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { newPassword } from "@/lib/password";
import { useToast } from "@/components/toast";
import { Button, Card, CardBody, CardHeader, Input, Modal } from "@/components/ui";
import { formatTimestamp } from "@/lib/time";
import { DEFAULT_ACCESS, STAFF_AREAS, type StaffArea } from "@/lib/staff-areas";

/**
 * Settings, "Staff": Hamza gives anyone a console sign-in (a teaching
 * assistant, a marker), chooses which parts of the console each person can
 * open, pauses or removes them, gives a new password, and reads the log of
 * what they did. A password is shown once, here, and never stored anywhere readable.
 */
type Assistant = { id: string; name: string; email: string; paused: boolean; lastSeen: string | null; access: string[] };
type Line = { at: string; name: string; what: string };

async function call(method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const { data } = await supabase().auth.getSession();
  const res = await fetch("/api/admin/staff", {
    method,
    cache: "no-store",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

const NEVER = "Never for staff: student activity and Groundwork, Today, phone numbers and parent messages, adding or changing students, cohorts, export and these settings.";
// Preview only: one sample person, so the switches can be tried.
const SAMPLE: Assistant = { id: "demo-staff", name: "Sample assistant", email: "assistant@example.com", paused: false, lastSeen: null, access: [...DEFAULT_ACCESS] };

export function StaffCard() {
  const { toast } = useToast();
  const [staff, setStaff] = useState<Assistant[] | null>(null);
  const [log, setLog] = useState<Line[]>([]);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // A sign-in just made or reset: shown once so Hamza can pass it on.
  const [shown, setShown] = useState<{ email: string; password: string } | null>(null);
  const [removeAsk, setRemoveAsk] = useState<Assistant | null>(null);

  const load = useCallback(async () => {
    if (DEMO) {
      setStaff((cur) => cur ?? [SAMPLE]);
      return;
    }
    try {
      const r = await call("GET");
      if (!r.ok) throw new Error();
      setStaff((r.data.staff as Assistant[]) ?? []);
      setLog((r.data.log as Line[]) ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function run(method: string, body: unknown, done: string): Promise<boolean> {
    if (busy) return false;
    if (DEMO) {
      toast("The preview doesn't make real accounts.", "success");
      return false;
    }
    setBusy(true);
    try {
      const r = await call(method, body);
      if (!r.ok) {
        toast(typeof r.data.error === "string" ? r.data.error : "That didn't work. Try again.", "error");
        return false;
      }
      toast(done, "success");
      await load();
      return true;
    } catch {
      toast("No connection. Check the internet and try again.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const password = newPassword() + newPassword();
    const mail = email.trim().toLowerCase();
    if (await run("POST", { name: name.trim(), email: mail, password }, "Their sign-in is ready.")) {
      setShown({ email: mail, password });
      setAdding(false);
      setName("");
      setEmail("");
    }
  }
  /** Switch one part of the console on or off for one person. Shown at once, put back if the save fails. */
  async function toggle(a: Assistant, key: StaffArea, on: boolean) {
    const next = STAFF_AREAS.map((x) => x.key).filter((k) => (k === key ? on : a.access.includes(k)));
    setStaff((list) => list?.map((x) => (x.id === a.id ? { ...x, access: next } : x)) ?? list);
    if (DEMO) return;
    try {
      const r = await call("PATCH", { id: a.id, action: "access", access: next });
      if (!r.ok) throw new Error();
    } catch {
      setStaff((list) => list?.map((x) => (x.id === a.id ? { ...x, access: a.access } : x)) ?? list);
      toast("Couldn't save that. Try again.", "error");
    }
  }

  async function reset(a: Assistant) {
    if (!window.confirm(`Give ${a.name || "this person"} a new password? Their old one stops working straight away.`)) return;
    const password = newPassword() + newPassword();
    if (await run("PATCH", { id: a.id, action: "password", password }, "New password set.")) setShown({ email: a.email, password });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="text-base font-semibold tracking-[-0.01em] text-ink">Staff</h2>
      </CardHeader>
      <CardBody className="space-y-5">
        <p className="text-sm text-ink-2">
          Give a teaching assistant, or anyone you choose, their own sign-in, then switch on only the parts of the console they need.
        </p>
        <p className="text-sm text-ink-3">{NEVER}</p>
        <p className="text-sm text-ink-3">
          The console holds them to this. It is a guard rail, not a lock: give a sign-in only to someone you trust, until a developer adds the stricter role. A change reaches someone already signed in within a few minutes, and pausing signs them out of the console in the same time.
        </p>

        {failed && (
          <p className="text-sm text-error">
            Couldn&apos;t load this just now.{" "}
            <button type="button" className="font-semibold underline" onClick={() => void load()}>Try again</button>
          </p>
        )}

        {staff?.map((a) => (
          <div key={a.id} className="rounded-tile bg-surface-2 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink">{a.name || "Staff"}</p>
              <p className="truncate text-sm text-ink-3">
                {a.email} · {a.paused ? "Paused" : a.lastSeen ? `Last signed in ${formatTimestamp(a.lastSeen)}` : "Not signed in yet"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run("PATCH", { id: a.id, action: a.paused ? "resume" : "pause" }, a.paused ? "They can sign in again." : "Paused. They can't sign in.")}>
                {a.paused ? "Let them back in" : "Pause"}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reset(a)}>New password</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRemoveAsk(a)}>Remove</Button>
            </div>
          </div>
            <fieldset className="mt-3 border-t border-hairline pt-3">
              <legend className="text-sm font-semibold text-ink">Can open</legend>
              <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {STAFF_AREAS.map((area) => {
                  const on = a.access.includes(area.key);
                  return (
                    <li key={area.key}>
                      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5 md:min-h-0">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={on}
                          aria-checked={on}
                          onChange={(e) => void toggle(a, area.key, e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-brand)]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm text-ink">{area.label}</span>
                          {"hint" in area && area.hint && <span className="block text-xs text-ink-3">{area.hint}</span>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          </div>
        ))}

        {shown && (
          <div className="rounded-tile bg-surface-2 px-4 py-3 text-sm">
            <p className="font-semibold text-ink">Their sign-in, shown once</p>
            <p className="mt-1.5 text-ink-2">They sign in at www.hamzateaches.com/admin</p>
            <p className="mt-1 break-all font-mono text-ink">{shown.email}</p>
            <p className="break-all font-mono text-ink">{shown.password}</p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(`Sign in: www.hamzateaches.com/admin\nEmail: ${shown.email}\nPassword: ${shown.password}`)
                    .then(() => toast("Copied", "success"))
                    .catch(() => toast("Couldn't copy. Select the text instead.", "error"))
                }
              >
                Copy
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShown(null)}>I&apos;ve saved it</Button>
            </div>
          </div>
        )}

        {adding ? (
          <div className="space-y-3">
            <Input label="Their name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayesha" />
            <Input label="Their email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            <p className="text-sm text-ink-3">A password is made for you and shown once after you save. They start with marking, homework replies, looking up students and reading notes; change that once they are added.</p>
            <div className="flex gap-2">
              <Button loading={busy} disabled={!name.trim() || !email.trim()} onClick={() => void create()}>Make their sign-in</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          staff && <Button variant="secondary" onClick={() => setAdding(true)}>Add a staff member</Button>
        )}

        {log.length > 0 && (
          <div>
            <p className="label-quiet text-ink-3">What staff did, newest first</p>
            <ul className="mt-2 max-h-64 divide-y divide-hairline overflow-y-auto rounded-tile bg-surface-2 text-sm">
              {log.map((l, i) => (
                <li key={`${l.at}-${i}`} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0 text-ink-2">
                    <span className="font-semibold text-ink">{l.name}</span> {l.what}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-ink-3">{formatTimestamp(l.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>

      <Modal
        open={!!removeAsk}
        onClose={() => setRemoveAsk(null)}
        title={`Remove ${removeAsk?.name ? `${removeAsk.name}'s` : "this"} sign-in?`}
        description="They can no longer sign in. Marks and replies they already gave stay as they are."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveAsk(null)}>Keep it</Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => {
                const a = removeAsk;
                setRemoveAsk(null);
                if (a) void run("DELETE", { id: a.id }, "Their sign-in is removed.");
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">To stop them for a while instead, use Pause.</p>
      </Modal>
    </Card>
  );
}
