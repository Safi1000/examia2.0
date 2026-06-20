"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLockout } from "@/hooks/useLockout";
import { Button, Input, Icon } from "@/components/ui";
import { BrandMark } from "@/components/Brand";
import { formatCountdown } from "@/lib/time";

/** Hidden admin login (password only) with escalating brute-force lockout. */
export function AdminLogin() {
  const router = useRouter();
  const { loginAdmin } = useAuth();
  const lock = useLockout("examia.lock.admin");

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = password.length > 0 && !lock.isLocked;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    if (await loginAdmin(password)) {
      lock.reset();
      router.replace("/admin/tests");
    } else {
      lock.registerFailure();
      setError("Incorrect administrator password.");
      setBusy(false);
      setPassword("");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="animate-fade-up text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-paper">
            <Icon.Lock className="h-5 w-5" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-ink">Administrator access</h1>
          <p className="mt-1 text-sm text-ink-2">Restricted area — staff only.</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-6 animate-fade-up rounded-xl border border-border bg-surface p-6 shadow-[var(--shadow-md)]"
          style={{ animationDelay: "100ms" }}
        >
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="Administrator password"
            autoComplete="current-password"
            autoFocus
          />

          {error && !lock.isLocked && (
            <p className="mt-3 rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error" role="alert">
              {error} <span className="text-ink-2">({lock.attemptsLeft} attempts left)</span>
            </p>
          )}
          {lock.isLocked && (
            <p className="mt-3 rounded-md border border-error/30 bg-error-soft px-3 py-2 text-sm font-medium text-error" role="alert">
              Locked due to repeated failures. Retry in <span className="font-mono">{formatCountdown(lock.remainingSeconds)}</span>.
            </p>
          )}

          <Button type="submit" size="lg" fullWidth loading={busy} disabled={!canSubmit} className="mt-5">
            Unlock console
          </Button>
        </form>

        <button
          onClick={() => router.push("/login")}
          className="mx-auto mt-5 block text-center text-xs font-semibold text-ink-3 hover:text-ink-2"
        >
          ← Back to student sign in
        </button>

        <p className="mt-3 text-center text-xs text-ink-3">
          Demo password — <span className="font-mono text-ink-2">admin2026</span>
        </p>
      </div>
    </main>
  );
}
