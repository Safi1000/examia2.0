"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { ThemeSettings } from "@/components/ThemeSettings";
import { useToast } from "@/components/toast";
import { supabase } from "@/lib/supabase";

export default function StudentSettingsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Settings</h1>
      <p className="mt-1 text-sm text-ink-2">Your password and how your portal looks.</p>

      <ChangePassword />

      <Card className="mt-5 p-5">
        <h2 className="text-base font-semibold text-ink">Accent colour</h2>
        <p className="mb-4 mt-1 text-sm text-ink-3">
          Choose the highlight colour used across your app. Saved to your account.
        </p>
        <ThemeSettings />
      </Card>
    </div>
  );
}

const MIN = 8;

/** Lets a student replace the temporary password their teacher gave them. */
function ChangePassword() {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<{ field: "current" | "next" | "confirm"; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN) return setError({ field: "next", msg: `Use at least ${MIN} characters.` });
    if (next === current) return setError({ field: "next", msg: "Pick a password different from your current one." });
    if (next !== confirm) return setError({ field: "confirm", msg: "The two new passwords don't match." });

    setBusy(true);
    const sb = supabase();
    const { data } = await sb.auth.getUser();
    const email = data.user?.email;
    // Check the current password first, so a phone left signed in can't be
    // used to lock the student out.
    const check = email ? await sb.auth.signInWithPassword({ email, password: current }) : null;
    if (!check || check.error) {
      setBusy(false);
      return setError({ field: "current", msg: "That isn't your current password." });
    }
    const { error: upErr } = await sb.auth.updateUser({ password: next });
    setBusy(false);
    if (upErr) return setError({ field: "next", msg: "Couldn't change it. Check your internet and try again." });
    setCurrent("");
    setNext("");
    setConfirm("");
    toast("Password changed. Use the new one next time you sign in.", "success");
  }

  return (
    <Card className="mt-5 p-5">
      <h2 className="text-base font-semibold text-ink">Change password</h2>
      <p className="mt-1 text-sm text-ink-3">Replace the password your teacher gave you with your own.</p>
      <form onSubmit={onSubmit} className="mt-4 space-y-4" noValidate>
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => { setCurrent(e.target.value); setError(null); }}
          error={error?.field === "current" ? error.msg : undefined}
          required
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => { setNext(e.target.value); setError(null); }}
          hint={`At least ${MIN} characters.`}
          error={error?.field === "next" ? error.msg : undefined}
          required
        />
        <Input
          label="New password again"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(null); }}
          error={error?.field === "confirm" ? error.msg : undefined}
          required
        />
        <Button type="submit" loading={busy} disabled={!current || !next || !confirm}>
          Change password
        </Button>
      </form>
    </Card>
  );
}
