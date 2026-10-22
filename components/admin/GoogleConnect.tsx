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
type TestRun = { eventId: string; meetUrl: string | null; startedAt: string; recordingUrl?: string | null };
const TEST_KEY = "ht_google_test";

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
  // The last test class, remembered on this computer so the check works later.
  const [test, setTest] = useState<TestRun | null>(() => {
    try {
      return typeof window === "undefined" ? null : (JSON.parse(localStorage.getItem(TEST_KEY) ?? "null") as TestRun | null);
    } catch {
      return null;
    }
  });
  const keepTest = (t: TestRun | null) => {
    setTest(t);
    try {
      if (t) localStorage.setItem(TEST_KEY, JSON.stringify(t));
      else localStorage.removeItem(TEST_KEY);
    } catch {}
  };

  useEffect(() => {
    if (DEMO) return;
    call("GET").then(setStatus).catch(() => setStatus({ ready: false, connected: false }));
    // Coming back from Google's sign-in page.
    const r = new URLSearchParams(window.location.search).get("google");
    if (r === "connected") toast("Google connected. Links will now make themselves at 1 pm.", "success");
    if (r === "failed") toast("Couldn't connect Google. Try again.", "error");
  }, [toast]);

  if (!status) return null;

  async function act(action: "connect" | "sync" | "disconnect" | "test" | "test-check") {
    setBusy(action);
    try {
      const j = await call("POST", action === "test-check" ? { action, eventId: test?.eventId, startedAt: test?.startedAt } : { action });
      if (action === "test") {
        if (!j.eventId) throw new Error();
        keepTest({ eventId: j.eventId, meetUrl: j.meetUrl, startedAt: j.startedAt });
        toast("Test class made. It's also in your Google Calendar.", "success");
      }
      if (action === "test-check") {
        if (j.recordingUrl) keepTest({ ...test!, recordingUrl: j.recordingUrl });
        else toast("Not in Drive yet. Google can take 30 to 40 minutes after the call ends.", "info");
      }
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
              Connected{status.email ? ` as ${status.email}` : ""}. Every class gets its own link at 1 pm. Press Record in Meet; the
              recording is saved in your Drive&apos;s &quot;Meet Recordings&quot; folder and appears here once Google has processed it
              (usually within an hour).
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

      {status.ready && status.connected && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-sm font-semibold text-ink">Try it first</p>
          <p className="mt-1 text-sm text-ink-3">
            A 20-minute test class starting now. Students never see it. Join, press Record for a minute, end the call, then check for the
            recording later.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" loading={busy === "test"} onClick={() => void act("test")}>
              {test ? "Make another test class" : "Make a test class"}
            </Button>
            {test?.meetUrl && (
              <a href={test.meetUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand hover:underline">
                Open test class
              </a>
            )}
            {test && !test.recordingUrl && (
              <Button size="sm" variant="ghost" loading={busy === "test-check"} onClick={() => void act("test-check")}>
                Check for the recording
              </Button>
            )}
            {test?.recordingUrl && (
              <a href={test.recordingUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-success hover:underline">
                Recording found: watch it
              </a>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
