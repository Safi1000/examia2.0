"use client";

import { useState } from "react";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { supabase } from "@/lib/supabase";

/**
 * Settings: send one test notification to the phones signed in to your own account
 * or the test account, to check the app's notifications end to end. Never reaches students.
 */
export function TestNotificationCard() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const { data } = await supabase().auth.getSession();
      const res = await fetch("/api/notify/test", { method: "POST", headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` }, cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { sent?: number; devices?: number; ready?: boolean };
      if (res.status === 503 || j.ready === false) toast("Phone notifications aren't set up on the server.", "error");
      else if (!res.ok) toast("Couldn't send the test. Try again in a minute.", "error");
      else if (!j.devices) toast("No phone found. Sign in to the app on your phone with your account or the test account, and allow notifications.", "error");
      else if (!j.sent) toast("Found your phone, but notices are switched off for it in the app's notification settings.", "error");
      else toast(`Sent to ${j.devices === 1 ? "1 phone" : `${j.devices} phones`}. It should arrive in a few seconds.`, "success");
    } catch {
      toast("Couldn't send the test. Check your connection.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader><h2 className="text-base font-semibold text-ink">Phone notifications</h2></CardHeader>
      <CardBody>
        <p className="mb-4 text-base text-ink-2">Send one test notification to the phones signed in to your account or the test account. Students never get it.</p>
        <Button variant="secondary" onClick={send} disabled={busy}>
          {busy ? "Sending…" : "Send a test to my phone"}
        </Button>
      </CardBody>
    </Card>
  );
}
