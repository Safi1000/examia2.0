"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLockout } from "@/hooks/useLockout";
import { formatCountdown } from "@/lib/time";
import { waTextLink } from "@/lib/landing";
import { AuthAlert, AuthShell, PasswordField, SubmitButton, fieldClass } from "@/components/auth/AuthShell";

export default function StudentLoginPage() {
  const router = useRouter();
  const { loginStudent } = useAuth();
  const lock = useLockout("examia.lock.student");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !lock.isLocked;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    let ok: boolean;
    try {
      ok = await loginStudent(username, password);
    } catch {
      setError("You're signed in, but your portal didn't load. Check your internet and tap Sign in again.");
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
      eyebrow="Student portal"
      title="Welcome back."
      note="Start from scratch. Finish exam ready."
      points={[
        { title: "Notes and recordings", text: "Every class and every handout, in one place." },
        { title: "Weekly tests", text: "Sit them here. I mark them and tell you where the marks went." },
        { title: "Your progress", text: "See your marks topic by topic, week by week." },
      ]}
      footer={
        <>
          Forgot your password?{" "}
          <a href={forgotLink} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand hover:underline">
            Message Hamza on WhatsApp
          </a>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate>
        <div className="space-y-4">
          <div>
            <label htmlFor="login-username" className="mb-2 block text-sm font-semibold text-ink-2">
              Username
            </label>
            <input
              id="login-username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null); }}
              placeholder="The username Hamza gave you"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              disabled={busy || lock.isLocked}
              className={fieldClass}
            />
          </div>
          <PasswordField
            id="login-password"
            label="Password"
            value={password}
            onChange={(v) => { setPassword(v); setError(null); }}
            disabled={busy || lock.isLocked}
          />
        </div>

        {error && !lock.isLocked && <AuthAlert tone="error">{error}</AuthAlert>}
        {lock.isLocked && (
          <AuthAlert tone="warning">
            Too many wrong tries. Try again in <span className="font-mono">{formatCountdown(lock.remainingSeconds)}</span>.
          </AuthAlert>
        )}

        <SubmitButton busy={busy} disabled={!canSubmit}>Sign in</SubmitButton>
      </form>

      {/* Hidden admin hotspot */}
      <button
        onClick={() => router.push("/admin")}
        aria-label="Administrator access"
        title=""
        className="mx-auto mt-2 block h-6 w-24 rounded opacity-0"
        tabIndex={-1}
      />
    </AuthShell>
  );
}
