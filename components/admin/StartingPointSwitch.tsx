"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import { DEMO } from "@/lib/demo";
import { supabase } from "@/lib/supabase";

/** Settings: open the Starting Point Check for the first class, close it after. */
export function StartingPointSwitch() {
  const { toast } = useToast();
  const [open, setOpen] = useState<boolean | null>(DEMO ? false : null);
  const [busy, setBusy] = useState(false);
  const link = "https://www.hamzateaches.com/starting-point";

  useEffect(() => {
    if (DEMO) return;
    fetch("/api/diagnostic", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { open?: boolean }) => setOpen(!!j.open))
      .catch(() => setOpen(false));
  }, []);

  async function flip() {
    if (open === null) return;
    const next = !open;
    setBusy(true);
    try {
      if (!DEMO) {
        const { data } = await supabase().auth.getSession();
        const res = await fetch("/api/diagnostic", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify({ open: next }),
        });
        if (!res.ok) throw new Error();
      }
      setOpen(next);
      toast(next ? "Open. Students with the link can start now (allow up to 20 seconds)." : "Closed. Anyone already part-way through can still finish.", "success");
    } catch {
      toast("Couldn't change it. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="font-bold text-ink">Starting Point Check</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-ink-3">
          The Blueprint diagnostic for day one. Open it at the start of the class, share the link, close it afterwards. It is not in any menu
          and not on Google.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className={`h-2.5 w-2.5 rounded-full ${open ? "bg-success" : "bg-ink-3"}`} aria-hidden />
            {open === null ? "Checking…" : open ? "Open" : "Closed"}
          </span>
          <Button size="sm" variant={open ? "secondary" : "primary"} loading={busy} disabled={open === null} onClick={() => void flip()}>
            {open ? "Close it" : "Open it"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2">{link}</code>
          <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast("Link copied.", "success"))}>
            Copy link
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
