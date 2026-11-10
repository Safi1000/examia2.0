"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DEMO } from "@/lib/demo";
import { useToast } from "@/components/toast";
import { Card, CardBody, CardHeader, Spinner } from "@/components/ui";

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
  }).catch(() => null);
  if (!res) throw new Error("Can't reach the server. Check your internet and try again.");
  const j = await res.json().catch(() => ({}));
  // The server sends a sentence for things Hamza can act on, and a bare code ("forbidden") otherwise.
  if (res.status === 403) throw new Error("Your session has expired. Sign in again.");
  if (!res.ok) throw new Error(typeof j.error === "string" && /^[A-Z]/.test(j.error) ? j.error : "Couldn't reach the server. Try again.");
  return j;
}

function useAutomation() {
  const [settings, setSettings] = useState<Settings | null>(DEMO ? { autoAbsent: true, autoRelease: true } : null);
  const [issues, setIssues] = useState<Issue[]>([]);
  // The switches couldn't be read: say so, rather than spin for ever.
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    if (DEMO) return;
    call("GET", "/api/automation")
      .then((j: { settings: Settings; issues: Issue[] }) => {
        setFailed(false);
        setSettings(j.settings);
        setIssues(j.issues ?? []);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { settings, setSettings, issues, failed, reload: load };
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
    <div className="mb-4 space-y-2 rounded-xl border border-warning/30 bg-warning-soft px-5 py-4" role="status">
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
    label: "Mark late and absent",
    detail:
      "Joining more than 10 minutes after a class starts is marked late. 10 minutes after a level's last class, anyone who didn't join and has no mark is marked absent (only when at least one student joined, so a class that didn't happen marks nobody). Change any mark in Attendance.",
  },
  {
    key: "autoRelease",
    label: "Release multiple choice results",
    detail:
      "When a test with only multiple choice questions closes, its results are released and students get the usual notification. Tests with written or photo answers still wait for you.",
  },
];

/** Settings: the automation switches. */
export function AutomationSettings() {
  const { settings, setSettings, failed, reload } = useAutomation();
  const { toast } = useToast();
  // One save at a time: two quick flips could land out of order and undo each other.
  const [saving, setSaving] = useState<keyof Settings | null>(null);

  async function flip(key: keyof Settings) {
    if (!settings || saving) return;
    const label = SWITCHES.find((s) => s.key === key)?.label ?? "Setting";
    const value = !settings[key];
    setSettings({ ...settings, [key]: value });
    if (DEMO) return void toast(`${label}: ${value ? "on" : "off"}.`, "success");
    setSaving(key);
    try {
      const j = await call("POST", "/api/automation", { [key]: value });
      setSettings(j.settings);
      toast(`${label}: ${j.settings?.[key] ? "on" : "off"}.`, "success");
    } catch (e) {
      // Put back only this switch, as it was.
      setSettings((cur) => (cur ? { ...cur, [key]: !value } : cur));
      toast(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.", "error");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Automations</h2>
      </CardHeader>
      <CardBody>
        <p className="mb-2 text-sm text-ink-3">
          These run by themselves every 15 minutes. Meet links (1 pm), recordings and reminders are always on.
        </p>
        {!settings && failed ? (
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="text-sm text-ink-3">Couldn&apos;t load these switches. Check your internet.</p>
            <button
              type="button"
              onClick={reload}
              className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 text-sm font-semibold text-ink hover:bg-surface-2"
            >
              Try again
            </button>
          </div>
        ) : !settings ? (
          <p className="flex items-center gap-2 py-3 text-sm text-ink-3"><Spinner size={16} className="text-brand" /> Loading…</p>
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
                  aria-busy={saving === s.key}
                  disabled={!!saving}
                  onClick={() => void flip(s.key)}
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 after:absolute after:-inset-2 after:content-[''] disabled:cursor-wait disabled:opacity-70 ${settings[s.key] ? "bg-brand" : "bg-surface-2 ring-1 ring-inset ring-border-strong"}`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-ink shadow-[0_1px_3px_rgba(0,0,0,0.45)] transition-[left] duration-200 ease-[var(--ease-out)] ${settings[s.key] ? "left-6" : "left-1"}`} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
