"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { useToast } from "@/components/toast";
import { Button, Card } from "@/components/ui";

/**
 * Admin → Classes: connect Google once, then Meet links are made every
 * morning and recordings collected after class (lib/class-automation.ts).
 */
type Status = { ready: boolean; connected: boolean; email?: string | null };

async function call(method: "GET" | "POST", body?: object) {
  const { data } = await supabase().auth.getSession();
  const res = await fetch("/api/google", {
    method,
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export function GoogleConnect({ onSynced }: { onSynced: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<Status | null>(DEMO ? { ready: false, connected: false } : null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (DEMO) return;
    call("GET").then(setStatus).catch(() => setStatus({ ready: false, connected: false }));
    // Coming back from Google's sign-in page.
    const r = new URLSearchParams(window.location.search).get("google");
    if (r === "connected") toast("Google connected. Links will now make themselves.", "success");
    if (r === "failed") toast("Couldn't connect Google. Try again.", "error");
  }, [toast]);

  if (!status) return null;

  async function act(action: "connect" | "sync" | "disconnect") {
    setBusy(action);
    try {
      const j = await call("POST", { action });
      if (action === "connect" && j.url) {
        window.location.href = j.url;
        return;
      }
      if (action === "sync") {
        toast(j.connected === false ? "Google isn't connected." : `Done: ${j.links} new link${j.links === 1 ? "" : "s"}, ${j.recordings} recording${j.recordings === 1 ? "" : "s"}.`, "success");
        onSynced();
      }
      if (action === "disconnect") setStatus({ ...status!, connected: false, email: null });
    } catch {
      toast("Something went wrong. Try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-md">
          <h2 className="text-base font-semibold text-ink">Automatic Meet links and recordings</h2>
          {!status.ready ? (
            <p className="mt-1 text-sm text-ink-3">Switches on once the Google setup is done and your developer has added the keys.</p>
          ) : status.connected ? (
            <p className="mt-1 text-sm text-ink-2">
              Connected{status.email ? ` as ${status.email}` : ""}. Every class gets its own link at 8 am. Press Record in Meet, and
              the recording appears here about 15 minutes after class.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-2">Connect your Google account once. You can still paste a link by hand at any time.</p>
          )}
        </div>
        {status.ready && (
          <div className="flex flex-wrap gap-2">
            {status.connected ? (
              <>
                <Button size="sm" loading={busy === "sync"} onClick={() => void act("sync")}>
                  Make today&apos;s links now
                </Button>
                <Button size="sm" variant="ghost" loading={busy === "disconnect"} onClick={() => void act("disconnect")}>
                  Disconnect
                </Button>
              </>
            ) : (
              <Button size="sm" loading={busy === "connect"} onClick={() => void act("connect")}>
                Connect Google
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
