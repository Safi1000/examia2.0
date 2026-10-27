"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { useToast } from "@/components/toast";
import { Button, Card } from "@/components/ui";
import { DEMO } from "@/lib/demo";
import { INTERESTS, type Lead } from "@/lib/leads";
import { waDigits } from "@/lib/phone";
import { supabase } from "@/lib/supabase";

/** Everyone who joined the waitlist from the free tools, newest first. */
export default function LeadsPage() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[] | null>(DEMO ? [] : null);
  const [interest, setInterest] = useState<string>("");

  useEffect(() => {
    if (DEMO) return;
    void (async () => {
      try {
        const { data } = await supabase().auth.getSession();
        const res = await fetch("/api/leads", { headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` } });
        const j = (await res.json().catch(() => ({}))) as { leads?: Lead[]; error?: string };
        if (!res.ok) toast(j.error ?? "Couldn't load the waitlist.", "error");
        setLeads(j.leads ?? []);
      } catch {
        toast("Couldn't load the waitlist. Check your connection.", "error");
        setLeads([]);
      }
    })();
  }, [toast]);

  const shown = useMemo(() => (leads ?? []).filter((l) => !interest || l.interests.includes(interest as Lead["interests"][number])), [leads, interest]);
  const label = (id: string) => INTERESTS.find((i) => i.id === id)?.label ?? id;

  function csv() {
    const rows = [["Name", "WhatsApp", "Level", "Subjects", "Interested in", "From page", "Date"], ...shown.map((l) => [l.name, l.phone, l.level, l.subjects.join(" / "), l.interests.map(label).join(" / "), l.source, l.createdAt.slice(0, 10)])];
    const text = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    a.download = `waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
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
            className={`h-9 rounded-full px-4 text-sm font-semibold ${interest === i.id ? "bg-brand text-on-brand" : "border border-border text-ink-2 hover:text-ink"}`}
          >
            {i.label}
          </button>
        ))}
        {shown.length > 0 && (
          <Button size="sm" variant="secondary" onClick={csv} className="ml-auto">
            Download spreadsheet
          </Button>
        )}
      </div>
      {leads === null ? (
        <p className="text-sm text-ink-3">Loading…</p>
      ) : shown.length === 0 ? (
        <Card className="p-6 text-sm text-ink-2">No sign-ups yet. They appear here from the free tools pages.</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {shown.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">
                    {l.name} <span className="font-normal text-ink-3">· {[l.level, ...l.subjects].filter(Boolean).join(", ")}</span>
                  </span>
                  <span className="block text-xs text-ink-3">
                    {l.interests.map(label).join(" · ") || "No preference"} · from {l.source || "site"} · {new Date(l.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </span>
                <a href={`https://wa.me/${waDigits(l.phone)}`} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-brand hover:underline">
                  WhatsApp
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
