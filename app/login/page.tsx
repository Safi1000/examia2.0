"use client";

import { useEffect, useState } from "react";
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
  const { loginStudent, session, initializing, loadFailed, retryLoad } = useAuth();
  const lock = useLockout("examia.lock.student");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit =
    username.trim().length > 0 && password.length > 0 && !lock.isLocked;

  // Already signed in (a bookmark, the home-screen app, Back): straight in.
  useEffect(() => {
    if (initializing || !session) return;
    router.replace(session.role === "admin" ? "/admin" : "/dashboard");
  }, [session, initializing, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    let ok: boolean;
    try {
      ok = await loginStudent(username, password);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "network"
          ? "Can't reach the server. Check your internet and try again."
          : "You're signed in, but your portal didn't load. Check your internet and tap Enter again.",
      );
      setBusy(false);
      return;
    }
    if (ok) {
      lock.reset();
      router.replace("/dashboard");
    } else {
      lock.registerFailure();
      setError("Wrong username or password.");
      setBusy(false);
    }
  }

  const forgotLink = waTextLink(
    `Hi Hamza, I forgot my portal password. My username is ${username.trim() || "[your username]"}.`,
  );

  // Checking for an earlier sign-in, or on the way in: no form to flash.
  if ((initializing && !busy) || session) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-ink-3">Opening your portal…</div>;
  }

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

        {/* Signed in, but the portal didn't load (weak signal): no need to type it all again. */}
        {loadFailed && !busy && (
          <>
            <AuthAlert tone="warning">Couldn&apos;t load your portal. Check your internet.</AuthAlert>
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
