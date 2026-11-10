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
  const { loginAdmin, loadFailed, retryLoad } = useAuth();
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
    let ok: boolean;
    try {
      ok = await loginAdmin(email.trim(), password);
      // A password pasted with a space on the end: try it without, before calling it wrong.
      if (!ok && password.trim() !== password && password.trim()) ok = await loginAdmin(email.trim(), password.trim());
    } catch {
      // No internet is not a wrong password: it never counts toward the lockout.
      setError("Can't reach the server. Check your internet and try again.");
      setBusy(false);
      return;
    }
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
          type="button"
          onClick={() => router.push("/login")}
          className="inline-flex min-h-11 items-center px-3 text-ink-3 transition-colors hover:text-ink-2"
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
                name="email"
                autoComplete="email"
                enterKeyHint="next"
                inputMode="email"
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

        {/* Signed in, but the console didn't load (weak signal): no need to type it all again. */}
        {loadFailed && !busy && (
          <>
            <AuthAlert tone="warning">The console didn&apos;t load. Check your internet and try again.</AuthAlert>
            <button
              type="button"
              onClick={retryLoad}
              className="mt-3 inline-flex min-h-11 items-center rounded-full border border-brand/40 px-5 text-sm font-semibold text-brand transition-colors hover:bg-brand/10 active:scale-[0.98]"
            >
              Try again
            </button>
          </>
        )}
        {error && !lock.isLocked && !loadFailed && <AuthAlert tone="error">{error}</AuthAlert>}
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
