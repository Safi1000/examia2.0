"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui";

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

  const btn = "inline-flex h-9 items-center rounded-full px-3 text-xs font-semibold transition-colors disabled:opacity-50";

  return (
    <div className="mt-10 border-t border-border pt-5 text-sm">
      {!status.ready ? (
        <p className="text-ink-3">Automatic Meet links switch on once the Google keys are added.</p>
      ) : !status.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-2">Connect Google once and every class gets its own Meet link at 1 pm.</p>
          <Button size="sm" loading={busy === "connect"} onClick={() => void act("connect")}>
            Connect Google
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-ink-3">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
              Google connected{status.email ? ` (${status.email})` : ""}. Links at 1 pm, recordings open 24 h.
            </p>
            <div className="flex items-center gap-1">
              <button type="button" className={`${btn} text-ink-2 hover:bg-surface-2 hover:text-ink`} disabled={!!busy} onClick={() => void act("sync")}>
                {busy === "sync" ? "Working…" : "Make today's links now"}
              </button>
              <button type="button" className={`${btn} text-ink-3 hover:text-error`} disabled={!!busy} onClick={() => void act("disconnect")}>
                Disconnect
              </button>
            </div>
          </div>
          <details className="mt-3 text-ink-3">
            <summary className="cursor-pointer select-none text-xs font-semibold hover:text-ink">Test the setup</summary>
            <div className="mt-3 space-y-2">
              <p className="text-xs">
                A 20-minute test class starting now (students never see it). Join, press Record for a minute, end the call, then check
                30 to 40 minutes later. Recordings go to &quot;Hamza Teaches recordings&quot; in your Drive, sorted by level and subject. To give
                a late joiner old classes, share that folder with their Gmail.
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <button type="button" className={`${btn} text-ink-2 hover:bg-surface-2 hover:text-ink`} disabled={!!busy} onClick={() => void act("test")}>
                  {busy === "test" ? "Working…" : test ? "Make another test class" : "Make a test class"}
                </button>
                {test?.meetUrl && (
                  <a href={test.meetUrl} target="_blank" rel="noreferrer" className={`${btn} text-brand hover:underline`}>
                    Open test class
                  </a>
                )}
                {test && !test.recordingUrl && (
                  <button type="button" className={`${btn} text-ink-2 hover:bg-surface-2 hover:text-ink`} disabled={!!busy} onClick={() => void act("test-check")}>
                    {busy === "test-check" ? "Checking…" : "Check for the recording"}
                  </button>
                )}
                {test?.recordingUrl && (
                  <a href={test.recordingUrl} target="_blank" rel="noreferrer" className={`${btn} text-success hover:underline`}>
                    Recording found: watch it
                  </a>
                )}
              </div>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
