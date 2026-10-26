"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import { DEMO } from "@/lib/demo";
import type { Kind } from "@/lib/diagnostic/logic";
import { supabase } from "@/lib/supabase";

/**
 * Settings: open the Starting Point Check for the first class, close it
 * after, and switch it to the end-of-session check when the session ends.
 */
export function StartingPointSwitch() {
  const { toast } = useToast();
  const [st, setSt] = useState<{ open: boolean; kind: Kind } | null>(DEMO ? { open: false, kind: "start" } : null);
  const [busy, setBusy] = useState(false);
  const link = "https://www.hamzateaches.com/starting-point";

  useEffect(() => {
    if (DEMO) return;
    fetch("/api/diagnostic", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { open?: boolean; kind?: Kind }) => setSt({ open: !!j.open, kind: j.kind === "end" ? "end" : "start" }))
      .catch(() => setSt({ open: false, kind: "start" }));
  }, []);

  async function change(patch: Partial<{ open: boolean; kind: Kind }>, msg: string) {
    if (!st) return;
    const next = { ...st, ...patch };
    setBusy(true);
    try {
      if (!DEMO) {
        const { data } = await supabase().auth.getSession();
        const res = await fetch("/api/diagnostic", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error();
      }
      setSt(next);
      toast(msg, "success");
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
          The diagnostic for day one, and the same check again at the end of the session so you can compare. Open it in class, share the link,
          close it afterwards. It is not in any menu and not on Google. Results appear under{" "}
          <Link href="/admin/starting-points" className="font-semibold text-brand hover:underline">
            Starting points
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Which check">
          {(
            [
              ["start", "Starting point (day one)"],
              ["end", "End of session"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              disabled={!st || busy}
              aria-pressed={st?.kind === k}
              onClick={() => st?.kind !== k && void change({ kind: k }, k === "end" ? "Switched to the end-of-session check." : "Switched to the day-one check.")}
              className={`h-9 rounded-full px-4 text-sm font-semibold ${st?.kind === k ? "bg-brand text-on-brand" : "border border-border text-ink-2 hover:text-ink"}`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className={`h-2.5 w-2.5 rounded-full ${st?.open ? "bg-success" : "bg-ink-3"}`} aria-hidden />
            {st === null ? "Checking…" : st.open ? "Open" : "Closed"}
          </span>
          <Button
            size="sm"
            variant={st?.open ? "secondary" : "primary"}
            loading={busy}
            disabled={st === null}
            onClick={() =>
              void change(
                { open: !st?.open },
                st?.open ? "Closed. Anyone already part-way through can still finish." : "Open. Students with the link can start now (allow up to 20 seconds).",
              )
            }
          >
            {st?.open ? "Close it" : "Open it"}
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
