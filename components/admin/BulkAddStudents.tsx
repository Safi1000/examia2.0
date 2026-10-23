"use client";

import { useMemo, useState } from "react";
import { useDatabase, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { isValidPhone, normalizePhone, waDigits } from "@/lib/phone";
import { welcomeMessage } from "@/lib/welcome-message";
import { Button, Modal, Select, Label } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * Term start: add a whole class at once. Paste one student per line
 * ("username, student's WhatsApp, parent's WhatsApp"; numbers optional),
 * pick their cohort, level and subjects, and every account is made in turn.
 * Then each welcome message is one tap to WhatsApp. Passwords are only kept
 * on screen until this closes (never saved anywhere readable).
 */
type Line = { username: string; phone?: string; parent?: string; problem?: string };
type Made = { username: string; password: string; phone?: string; parent?: string; sent?: boolean };

function newPassword() {
  const words = ["maple", "river", "amber", "delta", "lunar", "cedar", "north", "ochre"];
  return `${words[Math.floor(Math.random() * words.length)]}${Math.floor(100 + Math.random() * 900)}`;
}

export function BulkAddStudents({ open, onClose, defaultCohort }: { open: boolean; onClose: () => void; defaultCohort: string }) {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [cohortId, setCohortId] = useState(defaultCohort);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<{ done: number; of: number } | null>(null);
  const [made, setMade] = useState<Made[]>([]);

  const cohort = db.cohorts.find((c) => c.id === cohortId);
  // The cohort's own levels and subjects, or every one when it has none linked.
  const levels = cohort?.classIds.length ? db.classes.filter((c) => cohort.classIds.includes(c.id)) : db.classes;
  const subjects = cohort?.subjectIds.length ? db.subjects.filter((s) => cohort.subjectIds.includes(s.id)) : db.subjects;

  const lines = useMemo<Line[]>(() => {
    const seen = new Set<string>();
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [u = "", p = "", w = ""] = l.split(/[,\t;]/).map((x) => x.trim());
        const username = u.toLowerCase().replace(/\s+/g, ".");
        const phone = p ? normalizePhone(p) : undefined;
        const parent = w ? normalizePhone(w) : undefined;
        let problem: string | undefined;
        if (!/^[a-z0-9._-]{3,30}$/.test(username)) problem = "Username: 3 to 30 letters or numbers";
        else if (seen.has(username) || store.usernameTaken(username)) problem = "Username already taken";
        else if (phone && !isValidPhone(phone)) problem = "Student number needs the country code (+92…)";
        else if (parent && !isValidPhone(parent)) problem = "Parent number needs the country code (+92…)";
        seen.add(username);
        return { username, phone, parent, problem };
      });
  }, [text, store]);
  const good = lines.filter((l) => !l.problem);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function addAll() {
    if (!cohortId) return toast("Choose a cohort.", "error");
    if (levels.length && !classIds.length) return toast("Pick their level.", "error");
    if (subjects.length && !subjectIds.length) return toast("Pick at least one subject.", "error");
    if (!good.length) return;
    setBusy({ done: 0, of: good.length });
    const ok: Made[] = [];
    const failed: string[] = [];
    // One at a time: each account is a separate sign-in to create.
    for (const l of good) {
      const password = newPassword();
      try {
        await store.addStudent({ username: l.username, whatsapp: l.parent, phone: l.phone, cohortId, tempPassword: password, classIds, subjectIds });
        ok.push({ username: l.username, password, phone: l.phone, parent: l.parent });
      } catch {
        failed.push(l.username);
      }
      setBusy({ done: ok.length + failed.length, of: good.length });
    }
    setBusy(null);
    setMade(ok);
    setText(failed.join("\n"));
    if (failed.length) toast(`${failed.length} couldn't be added (left in the box to try again).`, "error");
    if (ok.length) toast(`${ok.length} student${ok.length === 1 ? "" : "s"} added. Send their logins below.`, "success");
  }

  function close() {
    if (made.some((m) => !m.sent) && !window.confirm("Some login messages haven't been sent. Passwords aren't kept after this closes (you can use Reset password later). Close anyway?")) return;
    setMade([]);
    setText("");
    onClose();
  }

  const wa = (to: string, m: Made) => `https://wa.me/${waDigits(to)}?text=${encodeURIComponent(welcomeMessage({ username: m.username, password: m.password }))}`;
  const markSent = (u: string) => setMade((list) => list.map((m) => (m.username === u ? { ...m, sent: true } : m)));
  const chip = (on: boolean) =>
    cn("rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors", on ? "border-brand bg-brand-soft text-brand" : "border-border text-ink-2 hover:border-border-strong hover:text-ink");

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={made.length ? "Send their logins" : "Add many students"}
      description={made.length ? "One tap each opens WhatsApp with their welcome message typed in." : "Paste one student per line. Everyone here gets the same cohort, level and subjects."}
      footer={
        made.length ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={() => void addAll()} loading={!!busy} disabled={!good.length || !!busy}>
              {busy ? `Adding ${busy.done + 1} of ${busy.of}…` : `Add ${good.length || ""} student${good.length === 1 ? "" : "s"}`}
            </Button>
          </>
        )
      }
    >
      {made.length ? (
        <ul className="divide-y divide-border">
          {made.map((m) => (
            <li key={m.username} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="min-w-0">
                <span className="block font-mono text-sm font-semibold text-ink">{m.username} · {m.password}</span>
                {m.sent && <span className="text-xs text-success">Sent</span>}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {m.parent && (
                  <a href={wa(m.parent, m)} target="_blank" rel="noreferrer" onClick={() => markSent(m.username)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                    Parent
                  </a>
                )}
                {m.phone && (
                  <a href={wa(m.phone, m)} target="_blank" rel="noreferrer" onClick={() => markSent(m.username)} className={buttonClasses({ size: "sm" })}>
                    Student
                  </a>
                )}
                {!m.phone && !m.parent && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard?.writeText(welcomeMessage({ username: m.username, password: m.password })).then(() => toast("Message copied.", "success"));
                      markSent(m.username);
                    }}
                  >
                    Copy message
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4">
          <div>
            <Label>Cohort</Label>
            <Select
              value={cohortId}
              onChange={(e) => {
                setCohortId(e.target.value);
                setClassIds([]);
                setSubjectIds([]);
              }}
            >
              <option value="">Choose…</option>
              {db.cohorts.filter((c) => c.active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Level</Label>
            <div className="flex flex-wrap gap-2">
              {levels.map((c) => (
                <button key={c.id} type="button" className={chip(classIds.includes(c.id))} onClick={() => toggle(classIds, setClassIds, c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Subjects</Label>
            <div className="flex flex-wrap gap-2">
              {subjects.map((s) => (
                <button key={s.id} type="button" className={chip(subjectIds.includes(s.id))} onClick={() => toggle(subjectIds, setSubjectIds, s.id)}>
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="bulk-list">Students</Label>
            <textarea
              id="bulk-list"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder={"ali.khan, +923001234567, +923331234567\nsara.ahmed, +923011112222\nusman.r"}
              className="w-full rounded-lg border border-border-strong bg-surface p-3 font-mono text-sm leading-relaxed text-ink"
            />
            <p className="mt-1 text-xs text-ink-3">Username, then the student&apos;s WhatsApp, then the parent&apos;s (numbers optional). Pasting from a spreadsheet works too.</p>
          </div>
          {lines.some((l) => l.problem) && (
            <ul className="space-y-1 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
              {lines
                .filter((l) => l.problem)
                .map((l, i) => (
                  <li key={`${l.username}-${i}`}>
                    <span className="font-mono font-semibold">{l.username || "(blank)"}</span>: {l.problem}. Skipped.
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
