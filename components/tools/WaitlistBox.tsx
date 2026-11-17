"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { INTERESTS, type InterestId } from "@/lib/leads";
import { chip, fieldBox, fieldLabel, goldAction } from "@/components/tools/ToolBits";

const LEVELS = ["O Level", "IGCSE", "AS Level", "A2 Level"];
const SUBJECTS = ["Accounting", "Business", "Economics"];

/**
 * "Be first to know": a short sign-up for future products and free
 * resources. Four taps and a number; nothing else is asked.
 */
export function WaitlistBox({ source }: { source: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [level, setLevel] = useState("");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [interests, setInterests] = useState<InterestId[]>(["tools"]);
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const toggle = <T,>(list: T[], set: (v: T[]) => void, x: T) => set(list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setState("sending");
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, level, subjects, interests, source, website }),
    }).catch(() => null);
    const j = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!res?.ok) {
      setError(j?.error ?? "Couldn't send that. Check your internet and try again.");
      setState("idle");
      return;
    }
    setState("done");
  }

  if (state === "done")
    return (
      <div className="pc-surface mt-16 rounded-card p-5 sm:p-6">
        <p className="text-xl font-semibold text-foreground">You are on the list.</p>
        <p className="mt-2 text-base text-muted-foreground">I will message you on WhatsApp when there is something new for your subjects. No spam, ever.</p>
      </div>
    );

  return (
    <form onSubmit={send} className="pc-surface mt-16 space-y-6 rounded-card p-5 sm:p-6">
      <div>
        <h2 className="text-2xl font-bold leading-tight text-foreground">First to know. Free.</h2>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">New tools, revision guides and courses are on the way. Tell me what you want and I will message you when it is ready.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={fieldLabel}>First name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" className={fieldBox} />
        </label>
        <label className="block">
          <span className={fieldLabel}>WhatsApp number</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            autoComplete="tel"
            placeholder="+92 300 1234567"
            className={fieldBox}
          />
        </label>
      </div>
      <fieldset>
        <legend className={fieldLabel}>Level</legend>
        <div className="flex flex-wrap gap-2">
          {LEVELS.map((l) => (
            <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} className={chip(level === l)}>
              {l}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className={fieldLabel}>Subjects</legend>
        <div className="flex flex-wrap gap-2">
          {SUBJECTS.map((s) => (
            <button key={s} type="button" aria-pressed={subjects.includes(s)} onClick={() => toggle(subjects, setSubjects, s)} className={chip(subjects.includes(s))}>
              {s}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className={fieldLabel}>Tell me about</legend>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((i) => (
            <button key={i.id} type="button" aria-pressed={interests.includes(i.id)} onClick={() => toggle(interests, setInterests, i.id)} className={chip(interests.includes(i.id))}>
              {i.label}
            </button>
          ))}
        </div>
      </fieldset>
      {/* Left empty by people; filled by bots. */}
      <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="hidden" name="website" />
      {error && (
        <p role="alert" className="text-sm text-error-x">
          {error}
        </p>
      )}
      <button type="submit" disabled={state === "sending"} className={cn(goldAction, "w-full sm:w-auto")}>
        {state === "sending" ? "Sending…" : "Put me on the list"}
      </button>
      <p className="text-sm text-muted-foreground">
        Only used to message you about these. See the <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">privacy policy</Link>.
      </p>
    </form>
  );
}
