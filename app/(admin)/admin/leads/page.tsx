"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, Spinner } from "@/components/ui";
import { DEMO } from "@/lib/demo";
import { INTERESTS, type Lead } from "@/lib/leads";
import { waDigits } from "@/lib/phone";
import { supabase } from "@/lib/supabase";
import { BulkBar, OneByOne, RowCheck, SelectAll, copyText, plural, waLink, type BulkAction, type Step } from "@/components/admin/BulkBar";
import { useSelection } from "@/lib/use-selection";
import { useToast } from "@/components/toast";

/** Everyone who joined the waitlist from the free tools, newest first. */
export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(DEMO ? [] : null);
  const [interest, setInterest] = useState<string>("");
  // A failed load is its own state: showing "No sign-ups yet" after an error would read as an empty waitlist.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (DEMO) return;
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase().auth.getSession();
        const res = await fetch("/api/leads", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
        const j = (await res.json().catch(() => ({}))) as { leads?: Lead[]; error?: string };
        if (!alive) return;
        if (!res.ok || !j.leads) {
          setFailed(true);
          return;
        }
        setFailed(false);
        setLeads(j.leads);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);

  const shown = useMemo(() => (leads ?? []).filter((l) => !interest || l.interests.includes(interest as Lead["interests"][number])), [leads, interest]);
  const label = (id: string) => INTERESTS.find((i) => i.id === id)?.label ?? id;
  const { toast } = useToast();

  // Ticked sign-ups: only ever ones the chosen interest shows.
  const ids = useMemo(() => shown.map((l) => l.id), [shown]);
  const sel = useSelection(ids);
  const chosen = shown.filter((l) => sel.isSelected(l.id));
  const [steps, setSteps] = useState<Step[] | null>(null);
  async function copyNumbers() {
    const ok = await copyText(chosen.map((l) => l.phone).join("\n"));
    toast(ok ? `${plural(chosen.length, "number")} copied, one per line.` : "Couldn't copy. Your browser blocked it; try again.", ok ? "success" : "error");
  }
  const bulkActions: BulkAction[] = [
    {
      id: "message",
      label: "Message one by one",
      primary: true,
      run: () =>
        setSteps(
          chosen.map((l) => {
            const href = waLink(l.phone);
            return { id: l.id, name: l.name, detail: l.phone, href, missing: href ? undefined : "the number looks wrong" };
          }),
        ),
    },
    { id: "copy", label: "Copy numbers", run: () => void copyNumbers() },
    { id: "export", label: "Download as spreadsheet", run: () => csv(chosen) },
  ];

  function csv(list: Lead[] = shown) {
    const rows = [["Name", "WhatsApp", "Level", "Subjects", "Interested in", "From page", "Date"], ...list.map((l) => [l.name, l.phone, l.level, l.subjects.join(" / "), l.interests.map(label).join(" / "), l.source, l.createdAt.slice(0, 10)])];
    // These fields are typed by the public. One that starts like a formula would run when the sheet opens, so it is kept as text.
    const safe = (c: string, i: number) => (i !== 1 && /^[=+\-@\t\r]/.test(c) ? `'${c}` : c);
    const text = "﻿" + rows.map((r) => r.map((c, i) => `"${safe(String(c), i).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.href = url;
    a.download = `waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-8">
      <PageHeader title="Waitlist" subtitle="Students who asked to hear about new tools, guides and courses." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[{ id: "", label: "Everyone" }, ...INTERESTS].map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => setInterest(i.id)}
            aria-pressed={interest === i.id}
            className={`h-9 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-md:h-11 ${interest === i.id ? "border border-white/[0.16] bg-white/[0.09] text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" : "border border-border text-ink-3 hover:border-border-strong hover:text-ink"}`}
          >
            {i.label}
          </button>
        ))}
        {shown.length > 0 && (
          <Button size="sm" variant="secondary" onClick={() => csv()} className="ml-auto">
            Download spreadsheet
          </Button>
        )}
      </div>
      {failed ? (
        <Card className="p-6 text-sm text-ink-2">
          The waitlist didn&apos;t load. Nothing is lost.{" "}
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setLeads(null);
              setAttempt((n) => n + 1);
            }}
            className="inline-flex min-h-11 items-center font-semibold text-brand underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </Card>
      ) : leads === null ? (
        <p className="flex items-center gap-2 text-sm text-ink-3"><Spinner size={16} className="text-brand" /> Loading…</p>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-sm text-ink-2">
          {leads.length ? "Nobody has asked for this one yet." : "No sign-ups yet. They appear here from the free tools pages."}
        </Card>
      ) : (
        <div role="group" aria-label="Sign-ups" onKeyDown={sel.listKeyDown}>
        <SelectAll sel={sel} noun="sign-up" className="px-5" />
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {shown.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm transition-colors hover:bg-white/[0.018]">
                <RowCheck id={l.id} checked={sel.isSelected(l.id)} onToggle={sel.toggle} label={`Select ${l.name}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink">
                    {l.name} <span className="font-normal text-ink-3">· {[l.level, ...l.subjects].filter(Boolean).join(", ")}</span>
                  </span>
                  <span className="block text-xs text-ink-3">
                    {l.interests.map(label).join(" · ") || "No preference"} · from {l.source || "site"} · {new Date(l.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Karachi" })}
                  </span>
                </span>
                <a href={`https://wa.me/${waDigits(l.phone)}`} target="_blank" rel="noreferrer" className="inline-flex h-10 shrink-0 items-center rounded-full border border-border-strong px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 max-md:h-11">
                  WhatsApp
                </a>
              </li>
            ))}
          </ul>
        </Card>
        </div>
      )}
      <BulkBar count={sel.count} onClear={sel.clear} actions={bulkActions} />
      <OneByOne onClose={() => setSteps(null)} title="Message one by one" steps={steps} />
    </div>
  );
}
