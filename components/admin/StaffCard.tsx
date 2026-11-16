"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { newPassword } from "@/lib/password";
import { useToast } from "@/components/toast";
import { Button, Card, CardBody, CardHeader, Input, Modal } from "@/components/ui";
import { formatTimestamp } from "@/lib/time";

/**
 * Settings, "Teaching assistant": Hamza makes her sign-in, pauses or removes
 * it, gives her a new password, and reads the log of what she did. Her
 * password is shown once, here, and never stored anywhere readable.
 */
type Assistant = { id: string; name: string; email: string; paused: boolean; lastSeen: string | null };
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

const CAN = ["Mark every test and release results", "Reply to homework hand-ins", "Look up students: names, marks, attendance", "See activity"];
const CANNOT = ["Add, change or remove students, or reset passwords", "See phone numbers or message parents", "Set tests, homework, notes or announcements", "Timetable, recordings, cohorts, export or these settings"];

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
      setStaff([]);
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
    if (await run("POST", { name: name.trim(), email: mail, password }, "Her sign-in is ready.")) {
      setShown({ email: mail, password });
      setAdding(false);
      setName("");
      setEmail("");
    }
  }
  async function reset(a: Assistant) {
    const password = newPassword() + newPassword();
    if (await run("PATCH", { id: a.id, action: "password", password }, "New password set.")) setShown({ email: a.email, password });
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Teaching assistant</h2>
      </CardHeader>
      <CardBody className="space-y-5">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <p className="font-semibold text-ink">She can</p>
            <ul className="mt-1.5 space-y-1 text-ink-2">{CAN.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div>
            <p className="font-semibold text-ink">She can&apos;t</p>
            <ul className="mt-1.5 space-y-1 text-ink-2">{CANNOT.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </div>
        <p className="text-sm text-ink-3">
          The console holds her to this. It is a guard rail, not a lock: give a sign-in only to someone you trust, until a developer adds the stricter role.
        </p>

        {failed && (
          <p className="text-sm text-error">
            Couldn&apos;t load this just now.{" "}
            <button type="button" className="font-semibold underline" onClick={() => void load()}>Try again</button>
          </p>
        )}

        {staff?.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{a.name || "Assistant"}</p>
              <p className="truncate text-sm text-ink-3">
                {a.email} · {a.paused ? "Paused" : a.lastSeen ? `Last signed in ${formatTimestamp(a.lastSeen)}` : "Not signed in yet"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run("PATCH", { id: a.id, action: a.paused ? "resume" : "pause" }, a.paused ? "She can sign in again." : "Paused. She can't sign in.")}>
                {a.paused ? "Let her back in" : "Pause"}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void reset(a)}>New password</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRemoveAsk(a)}>Remove</Button>
            </div>
          </div>
        ))}

        {shown && (
          <div className="rounded-lg border border-border-strong bg-surface-2 px-4 py-3 text-sm">
            <p className="font-semibold text-ink">Her sign-in, shown once</p>
            <p className="mt-1.5 text-ink-2">She signs in at www.hamzateaches.com/admin</p>
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
            <Input label="Her name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ayesha" />
            <Input label="Her email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
            <p className="text-sm text-ink-3">A password is made for you and shown once after you save.</p>
            <div className="flex gap-2">
              <Button loading={busy} disabled={!name.trim() || !email.trim()} onClick={() => void create()}>Make her sign-in</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          staff && <Button variant="secondary" onClick={() => setAdding(true)}>Add a teaching assistant</Button>
        )}

        {log.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-ink">What she did, newest first</p>
            <ul className="mt-2 max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
              {log.map((l, i) => (
                <li key={`${l.at}-${i}`} className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <span className="min-w-0 text-ink-2">
                    <span className="font-semibold text-ink">{l.name}</span> {l.what}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-3">{formatTimestamp(l.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>

      <Modal
        open={!!removeAsk}
        onClose={() => setRemoveAsk(null)}
        title={`Remove ${removeAsk?.name || "her"}'s sign-in?`}
        description="She can no longer sign in. Marks and replies she already gave stay as they are."
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
                if (a) void run("DELETE", { id: a.id }, "Her sign-in is removed.");
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">To stop her for a while instead, use Pause.</p>
      </Modal>
    </Card>
  );
}
