"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/toast";
import { Button, Card, CardBody, CardHeader } from "@/components/ui";
import { DEMO } from "@/lib/demo";
import type { Kind } from "@/lib/diagnostic/logic";
import { supabase } from "@/lib/supabase";

const SITE = "https://www.hamzateaches.com";
const LINKS = [
  {
    label: "Online students",
    note: "For students who join my classes online.",
    url: `${SITE}/check`,
    message: "Hi, please take my Starting Point Check before we begin. It helps me start your classes at exactly the right place.",
  },
  {
    label: "Students in the classroom",
    note: "For students sitting in the room. Put the code on the TV and they scan it with their phones.",
    url: `${SITE}/check/class`,
    message: "Hi, please take my Starting Point Check now. It helps me start your classes at exactly the right place.",
  },
];

/** A big code and link for the TV or projector, so a room can scan and start. */
function TvCode({ label, url, onClose }: { label: string; url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const img = `https://api.qrserver.com/v1/create-qr-code/?size=700x700&margin=0&data=${encodeURIComponent(url)}`;
  return (
    <div role="dialog" aria-label="Starting Point Check code" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 text-center" onClick={onClose}>
      <p className="text-2xl font-bold text-[#1b1e21] sm:text-4xl">Scan to start the Starting Point Check</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img} alt={`Code for ${url}`} className="aspect-square w-[min(70vh,80vw)] max-w-[640px] rounded-2xl border border-black/10 p-4" />
      <p className="text-xl font-semibold text-[#1b1e21] sm:text-3xl">{url.replace("https://", "")}</p>
      <p className="text-sm text-[#5b6168]">{label}. Tap anywhere or press Escape to close.</p>
    </div>
  );
}

/**
 * Settings: open the Starting Point Check for the first class, close it
 * after, and switch it to the end of session check when the session ends.
 */
export function StartingPointSwitch() {
  const { toast } = useToast();
  const [st, setSt] = useState<{ open: boolean; kind: Kind } | null>(DEMO ? { open: false, kind: "start" } : null);
  const [busy, setBusy] = useState(false);
  const [tv, setTv] = useState<{ label: string; url: string } | null>(null);

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
              onClick={() => st?.kind !== k && void change({ kind: k }, k === "end" ? "Switched to the end of session check." : "Switched to the day one check.")}
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
                st?.open ? "Closed. Anyone already partway through can still finish." : "Open. Students with the link can start now (allow up to 20 seconds).",
              )
            }
          >
            {st?.open ? "Close it" : "Open it"}
          </Button>
        </div>
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-semibold text-ink">Links to share</p>
          {LINKS.map((l) => (
            <div key={l.url} className="rounded-xl border border-border bg-surface-2/40 p-3">
              <p className="text-sm font-semibold text-ink">{l.label}</p>
              <p className="mt-0.5 text-xs text-ink-3">{l.note}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-ink-2">{l.url.replace("https://", "")}</code>
                <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(l.url).then(() => toast("Link copied.", "success"))}>
                  Copy link
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void navigator.clipboard?.writeText(`${l.message}\n${l.url}`).then(() => toast("Message copied. Paste it into WhatsApp.", "success"))}
                >
                  Copy message
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setTv({ label: l.label, url: l.url })}>
                  Show on TV
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-ink-3">
            Both open the same check. Results from the classroom link are marked &ldquo;In class&rdquo;, so you can look at them apart from the online students.
          </p>
        </div>
      </CardBody>
      {tv && <TvCode label={tv.label} url={tv.url} onClose={() => setTv(null)} />}
    </Card>
  );
}
