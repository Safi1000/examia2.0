"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLockout } from "@/hooks/useLockout";
import { formatCountdown } from "@/lib/time";
import { waTextLink } from "@/lib/landing";
import {
  AuthAlert,
  AuthShell,
  Field,
  PasswordField,
  SubmitButton,
  fieldClass,
  labelClass,
} from "@/components/auth/AuthShell";

export default function StudentLoginPage() {
  const router = useRouter();
  const { loginStudent } = useAuth();
  const lock = useLockout("examia.lock.student");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit =
    username.trim().length > 0 && password.length > 0 && !lock.isLocked;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    let ok: boolean;
    try {
      ok = await loginStudent(username, password);
    } catch {
      setError(
        "You're signed in, but your portal didn't load. Check your internet and tap Sign in again.",
      );
      setBusy(false);
      return;
    }
    if (ok) {
      lock.reset();
      router.push("/dashboard");
    } else {
      lock.registerFailure();
      setError("Wrong username or password.");
      setBusy(false);
    }
  }

  const forgotLink = waTextLink(
    `Hi Hamza, I forgot my portal password. My username is ${username.trim() || "[your username]"}.`,
  );

  return (
    <AuthShell
      kicker="Private · Students only"
      title="Student sign in"
      greeting="Welcome back."
      onSecret={() => router.push("/admin")}
      footer={
        <>
          Forgot your password?{" "}
          <a
            href={forgotLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-ink-2 underline decoration-white/20 underline-offset-4 transition-colors hover:text-brand hover:decoration-brand"
          >
            Message Hamza
          </a>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <div className="space-y-7">
          <div>
            <label htmlFor="login-username" className={labelClass}>
              Username
            </label>
            <Field>
              <input
                id="login-username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                placeholder=""
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                disabled={busy || lock.isLocked}
                className={fieldClass}
              />
            </Field>
          </div>
          <PasswordField
            id="login-password"
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
            Too many wrong tries. Try again in{" "}
            <span className="font-mono">
              {formatCountdown(lock.remainingSeconds)}
            </span>
            .
          </AuthAlert>
        )}

        <SubmitButton busy={busy} disabled={!canSubmit}>
          Enter
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
