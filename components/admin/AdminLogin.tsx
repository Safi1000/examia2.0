"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLockout } from "@/hooks/useLockout";
import {
  AuthAlert,
  AuthShell,
  Field,
  PasswordField,
  SubmitButton,
  fieldClass,
  labelClass,
} from "@/components/auth/AuthShell";
import { formatCountdown } from "@/lib/time";

export function AdminLogin() {
  const router = useRouter();
  const { loginAdmin } = useAuth();
  const lock = useLockout("examia.lock.admin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit =
    email.trim().length > 0 && password.length > 0 && !lock.isLocked;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const ok = await loginAdmin(email.trim(), password);
    if (ok) {
      lock.reset();
      router.replace("/admin/today");
    } else {
      lock.registerFailure();
      setError("That email and password don't match an administrator account.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      kicker="Restricted · Teacher console"
      title="Teacher sign in"
      footer={
        <button
          onClick={() => router.push("/login")}
          className="text-ink-3 transition-colors hover:text-ink-2"
        >
          ← Back
        </button>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <div className="space-y-7">
          <div>
            <label htmlFor="admin-email" className={labelClass}>
              Email
            </label>
            <Field>
              <input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={busy || lock.isLocked}
                className={fieldClass}
              />
            </Field>
          </div>
          <PasswordField
            id="admin-password"
            label="Password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              setError(null);
            }}
            disabled={busy || lock.isLocked}
          />
        </div>

        {error && !lock.isLocked && <AuthAlert tone="error">{error}</AuthAlert>}
        {lock.isLocked && (
          <AuthAlert tone="warning">
            Too many attempts. Try again in{" "}
            <span className="font-mono">
              {formatCountdown(lock.remainingSeconds)}
            </span>
            .
          </AuthAlert>
        )}

        <SubmitButton busy={busy} disabled={!canSubmit}>
          Sign in
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
