"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { useToast } from "@/components/toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";
import { NotificationSettings } from "@/components/student/NotificationSettings";
import { ProfileSettings } from "@/components/student/ProfileSettings";
import { useDatabase } from "@/lib/data/store";
import { studentById } from "@/lib/data/selectors";
import { PageHeader } from "@/components/student/PortalKit";

export default function StudentSettingsPage() {
  const studentId = useAuth().session?.studentId;
  const db = useDatabase();
  const student = studentId ? studentById(db, studentId) : null;
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <div className="rise space-y-5">
      <PageHeader title="Settings" className="mb-3">Your password, notifications and how your portal looks.</PageHeader>

      {student && <ProfileSettings db={db} student={student} />}
      {studentId && <NotificationSettings studentId={studentId} />}
      <ChangePassword />

      </div>
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
    const { data, error: userErr } = await sb.auth.getUser();
    if (userErr && !navigator.onLine) {
      setBusy(false);
      return setError({ field: "current", msg: "You're offline. Connect to the internet and try again." });
    }
    const email = data.user?.email;
    // Check the current password first, so a phone left signed in can't be
    // used to lock the student out.
    const check = email ? await sb.auth.signInWithPassword({ email, password: current }) : null;
    if (!check || check.error) {
      setBusy(false);
      if (check?.error && /fetch|network/i.test(check.error.message)) {
        return setError({ field: "current", msg: "Couldn't reach the server. Check your internet and try again." });
      }
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
    <Card className="p-5 sm:p-6">
      <h2 className="text-[17px] font-bold tracking-[-0.01em] text-ink">Change password</h2>
      <p className="mt-1 text-sm text-ink-3">Replace the password I gave you with your own.</p>
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
