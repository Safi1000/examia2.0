"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { useToast } from "@/components/toast";
import { Card, CardBody, CardHeader } from "@/components/ui";

/**
 * The hands-off jobs (lib/automation.ts): their switches for Settings, and the
 * health line for Today that warns before a class goes wrong.
 */
type Settings = { autoAbsent: boolean; autoRelease: boolean };
type Issue = { kind: "google" | "timer" | "links" | "recording"; text: string };

async function call(method: "GET" | "POST", path: string, body?: object) {
  const { data } = await supabase().auth.getSession();
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? "Couldn't reach the server. Try again.");
  return j;
}

function useAutomation() {
  const [settings, setSettings] = useState<Settings | null>(DEMO ? { autoAbsent: true, autoRelease: false } : null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const load = useCallback(() => {
    if (DEMO) return;
    call("GET", "/api/automation")
      .then((j: { settings: Settings; issues: Issue[] }) => {
        setSettings(j.settings);
        setIssues(j.issues ?? []);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { settings, setSettings, issues, reload: load };
}

/** Today: one quiet card, only when something needs Hamza. */
export function HealthLine() {
  const { issues, reload } = useAutomation();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!issues.length) return null;

  async function makeLinks() {
    setBusy(true);
    try {
      const j = await call("POST", "/api/google", { action: "sync" });
      toast(`Done: ${j.links ?? 0} new link${j.links === 1 ? "" : "s"}.`, "success");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't make the links. Try again.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 space-y-2 rounded-lg border border-warning/40 bg-warning-soft px-5 py-4" role="status">
      {issues.map((i) => (
        <div key={i.kind} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink">{i.text}</p>
          {i.kind === "google" && (
            <Link href="/admin/classes" className="text-sm font-semibold text-brand hover:underline">
              Reconnect
            </Link>
          )}
          {i.kind === "links" && (
            <button type="button" disabled={busy} onClick={() => void makeLinks()} className="text-sm font-semibold text-brand hover:underline disabled:opacity-50">
              {busy ? "Working…" : "Make them now"}
            </button>
          )}
          {i.kind === "recording" && (
            <Link href="/admin/classes" className="text-sm font-semibold text-brand hover:underline">
              Open Classes
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}

const SWITCHES: Array<{ key: keyof Settings; label: string; detail: string }> = [
  {
    key: "autoAbsent",
    label: "Mark no-shows absent",
    detail:
      "10 minutes after a level's last class, anyone who didn't join and has no mark is marked absent. Only when at least one student joined, so a class that didn't happen marks nobody. Change any mark in Attendance.",
  },
  {
    key: "autoRelease",
    label: "Release multiple-choice results",
    detail:
      "When a test with only multiple-choice questions closes, its results are released and students get the usual notification. Tests with written or photo answers still wait for you.",
  },
];

/** Settings: the automation switches. */
export function AutomationSettings() {
  const { settings, setSettings } = useAutomation();
  const { toast } = useToast();

  async function flip(key: keyof Settings) {
    if (!settings) return;
    const next = { ...settings, [key]: !settings[key] };
    setSettings(next);
    if (DEMO) return;
    try {
      const j = await call("POST", "/api/automation", { [key]: next[key] });
      setSettings(j.settings);
    } catch (e) {
      setSettings(settings);
      toast(e instanceof Error ? e.message : "Couldn't save. Try again.", "error");
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="font-bold text-ink">Automations</h2>
      </CardHeader>
      <CardBody>
        <p className="mb-2 text-sm text-ink-3">
          These run by themselves every 15 minutes. Meet links (1 pm), recordings and reminders are always on.
        </p>
        {!settings ? (
          <p className="py-3 text-sm text-ink-3">Loading…</p>
        ) : (
          <ul className="divide-y divide-border">
            {SWITCHES.map((s) => (
              <li key={s.key} className="flex items-start justify-between gap-4 py-4">
                <span>
                  <span className="block text-sm font-semibold text-ink">{s.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-3">{s.detail}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings[s.key]}
                  aria-label={s.label}
                  onClick={() => void flip(s.key)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${settings[s.key] ? "bg-brand" : "bg-surface-2 ring-1 ring-inset ring-border-strong"}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${settings[s.key] ? "left-6" : "left-1"}`} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
