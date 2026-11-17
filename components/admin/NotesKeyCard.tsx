"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { useToast } from "@/components/toast";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import { formatTimestamp } from "@/lib/time";

/**
 * Settings, "Notes from Claude": one button makes an upload key and saves it
 * as a small file on this computer. With it, notes Claude builds on Hamza's
 * Mac are filed on the right chapter without the upload screen. The key can
 * only add notes, is shown once, and can be switched off here.
 */
type State = { on: boolean; createdAt: string | null; lastUsedAt: string | null; lastNote: string | null };
export const KEY_FILE = "hamzateaches-notes-key.txt";

async function call(method: string): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const { data } = await supabase().auth.getSession();
  const res = await fetch("/api/admin/notes-key", { method, cache: "no-store", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function saveFile(key: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([key + "\n"], { type: "text/plain" }));
  a.download = KEY_FILE;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function NotesKeyCard() {
  const { toast } = useToast();
  const [state, setState] = useState<State | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (DEMO) return setState({ on: false, createdAt: null, lastUsedAt: null, lastNote: null });
    try {
      const r = await call("GET");
      if (!r.ok) throw new Error();
      setState(r.data as State);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function make() {
    if (busy) return;
    if (DEMO) return toast("The preview doesn't make real keys.", "success");
    setBusy(true);
    try {
      const r = await call("POST");
      if (!r.ok || typeof r.data.key !== "string") return toast(typeof r.data.error === "string" ? r.data.error : "That didn't work. Try again.", "error");
      saveFile(r.data.key);
      setSaved(true);
      await load();
    } catch {
      toast("No connection. Check the internet and try again.", "error");
    } finally {
      setBusy(false);
    }
  }
  async function off() {
    if (busy || DEMO) return;
    setBusy(true);
    try {
      const r = await call("DELETE");
      if (!r.ok) return toast("That didn't work. Try again.", "error");
      setSaved(false);
      toast("Switched off. The old key no longer works.", "success");
      await load();
    } catch {
      toast("No connection. Check the internet and try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="text-base font-semibold text-ink">Notes from Claude</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-base text-ink-2">
          Lets Claude on this Mac file finished notes on the right chapter for you. The key can only add notes. It can&apos;t read students, marks or anything else.
        </p>
        {failed && (
          <p className="text-sm text-error">
            Couldn&apos;t load this just now.{" "}
            <button type="button" className="font-semibold underline" onClick={() => void load()}>Try again</button>
          </p>
        )}
        {saved && (
          <p className="rounded-tile bg-surface-2 px-4 py-3 text-sm text-ink-2">
            Done. A file called <span className="font-semibold text-ink">{KEY_FILE}</span> was saved to your Downloads. Leave it there and tell Claude it&apos;s ready.
          </p>
        )}
        {state && (
          <>
            <p className="text-sm text-ink-3">
              {state.on
                ? `On since ${formatTimestamp(state.createdAt!)}. ${state.lastUsedAt ? `Last note added ${formatTimestamp(state.lastUsedAt)}${state.lastNote ? `: ${state.lastNote}` : ""}.` : "No notes added with it yet."}`
                : "Off. No key exists."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" loading={busy} onClick={() => void make()}>{state.on ? "Make a new key" : "Make upload key"}</Button>
              {state.on && <Button variant="ghost" disabled={busy} onClick={() => void off()}>Switch off</Button>}
            </div>
            {state.on && <p className="text-sm text-ink-3">A new key replaces the old one, which stops working.</p>}
          </>
        )}
      </CardBody>
    </Card>
  );
}
