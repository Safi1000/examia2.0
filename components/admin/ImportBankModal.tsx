"use client";

import { useMemo, useState } from "react";
import { useDatabase } from "@/lib/data/store";
import { Modal, Button, Input, Select, Checkbox, Badge, EmptyState, Icon } from "@/components/ui";

/** Multi-select bank picker → returns chosen bank item ids to import. */
export function ImportBankModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (ids: string[]) => void;
}) {
  const db = useDatabase();
  const [q, setQ] = useState("");
  const [subject, setSubject] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const subjects = useMemo(() => Array.from(new Set(db.bank.map((b) => b.subject))).sort(), [db.bank]);
  const items = useMemo(() => {
    // Every word must appear somewhere, spaces at the ends ignored.
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return db.bank
      .filter((b) => (subject === "all" ? true : b.subject === subject))
      .filter((b) => {
        if (!words.length) return true;
        const hay = `${b.prompt} ${b.topic}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
  }, [db.bank, subject, q]);
  const [limit, setLimit] = useState(60);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirm() {
    onImport(Array.from(selected));
    setSelected(new Set());
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import from question bank"
      description="Select reusable questions to copy into this test."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={confirm} disabled={selected.size === 0}>
            Import {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="min-w-0 flex-1 basis-56"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions…" aria-label="Search bank" /></div>
        <div className="min-w-0 flex-1 basis-40 sm:max-w-52">
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filter subject">
            <option value="all">All subjects</option>
            {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<Icon.Search />} title="No matching questions" />
      ) : (
        <ul className="space-y-2">
          {items.slice(0, limit).map((b) => (
            <li
              key={b.id}
              className={"flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 " + (selected.has(b.id) ? "border-brand bg-brand-soft" : "border-border bg-surface")}
              onClick={() => toggle(b.id)}
            >
              {/* The row click already toggles: the box's own clicks stop here so one tap is one toggle. */}
              <span className="flex min-h-6 items-center" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selected.has(b.id)} onChange={() => toggle(b.id)} label={<span className="sr-only">Select this question</span>} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{b.subject}</Badge>
                  <span className="text-xs uppercase tracking-wide text-ink-3">{b.type} · {b.topic} · {b.marks}m</span>
                </div>
                <p className="mt-1 text-sm text-ink">{b.prompt}</p>
              </div>
            </li>
          ))}
          {items.length > limit && (
            <li className="flex justify-center">
              <button type="button" onClick={() => setLimit((n) => n + 100)} className="h-11 rounded-full px-5 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
                Show more ({items.length - limit} left)
              </button>
            </li>
          )}
        </ul>
      )}
    </Modal>
  );
}
