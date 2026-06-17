"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLockout } from "@/hooks/useLockout";
import { Button, Input } from "@/components/ui";
import { BrandMark } from "@/components/Brand";
import { COMPANY_NAME } from "@/lib/config";
import { formatCountdown } from "@/lib/time";

export default function StudentLoginPage() {
  const router = useRouter();
  const { loginStudent } = useAuth();
  const lock = useLockout("examia.lock.student");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !lock.isLocked;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    // Simulate the round-trip a real auth call would make.
    window.setTimeout(() => {
      const ok = loginStudent(username, password);
      if (ok) {
        lock.reset();
        router.push("/dashboard");
      } else {
        lock.registerFailure();
        setError("That username and password don't match. Please try again.");
        setBusy(false);
      }
    }, 350);
  }

  return (
    <main className="flex min-h-dvh flex-col">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="animate-fade-up text-center" style={{ animationDelay: "40ms" }}>
            <div className="mb-4 inline-flex"><BrandMark size={48} /></div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">{COMPANY_NAME}</h1>
            <p className="mt-1 text-sm text-ink-2">Sign in to your exam portal</p>
          </div>

          <form
            onSubmit={onSubmit}
            className="mt-7 animate-fade-up rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-md)]"
            style={{ animationDelay: "120ms" }}
          >
            <div className="space-y-4">
              <Input
                label="Username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(null); }}
                placeholder="e.g. amelia"
                autoComplete="username"
                autoCapitalize="none"
                required
              />
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && !lock.isLocked && (
              <p className="mt-3 rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error" role="alert">
                {error}
              </p>
            )}
            {lock.isLocked && (
              <p className="mt-3 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning" role="alert">
                Too many attempts. Try again in <span className="font-mono">{formatCountdown(lock.remainingSeconds)}</span>.
              </p>
            )}

            <Button type="submit" size="lg" fullWidth loading={busy} disabled={!canSubmit} className="mt-5">
              Sign in
            </Button>

            <p className="mt-4 text-center text-xs text-ink-3">
              No account? Accounts are created by your administrator.
            </p>
          </form>

          <div className="mt-5 animate-fade-up rounded-lg border border-dashed border-border-strong bg-surface/60 px-4 py-3 text-center text-xs text-ink-2" style={{ animationDelay: "200ms" }}>
            <span className="font-semibold text-ink">Demo student</span> — username <span className="font-mono text-ink">amelia</span>, password <span className="font-mono text-ink">study123</span>
          </div>
        </div>
      </div>

      {/* Hidden admin hotspot — an invisible tap target at the very bottom. */}
      <button
        onClick={() => router.push("/admin")}
        aria-label="Administrator access"
        title=""
        className="mx-auto mb-2 h-8 w-24 rounded opacity-0"
        tabIndex={-1}
      />
    </main>
  );
}
