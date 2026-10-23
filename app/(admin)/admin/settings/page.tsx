"use client";

import { useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button, Card, CardHeader, CardBody, Icon } from "@/components/ui";
import { ThemeSettings } from "@/components/ThemeSettings";
import { useDatabase, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { levelOf, subjectOf } from "@/lib/timetable";

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-8">
      <PageHeader title="Settings" subtitle="Personalise your console" />
      <LevelsAndSubjects />
      <Card className="max-w-2xl">
        <CardHeader><h2 className="font-bold text-ink">Accent colour</h2></CardHeader>
        <CardBody>
          <p className="mb-4 text-sm text-ink-3">
            Choose the highlight colour used across the console. Saved on this device.
          </p>
          <ThemeSettings />
        </CardBody>
      </Card>
    </div>
  );
}

/**
 * Levels (classes) and subjects: add, rename, remove. The timetable matches
 * them by name (A2, AS, IGCSE / O Level; Economics, Business, Accounting), so
 * a name it can't match is flagged.
 */
function LevelsAndSubjects() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();
  const lists = [
    { key: "class", title: "Levels", items: db.classes, match: (n: string) => !!levelOf({ name: n }), add: (n: string) => store.addClass(n), rename: (id: string, n: string) => store.updateClass(id, n), remove: (id: string) => store.deleteClass(id), hint: "e.g. A-Levels (A2)" },
    { key: "subject", title: "Subjects", items: db.subjects, match: (n: string) => !!subjectOf({ name: n }), add: (n: string) => store.addSubject(n), rename: (id: string, n: string) => store.updateSubject(id, n), remove: (id: string) => store.deleteSubject(id), hint: "e.g. Economics" },
  ];
  return (
    <Card className="max-w-2xl">
      <CardHeader><h2 className="font-bold text-ink">Levels and subjects</h2></CardHeader>
      <CardBody className="space-y-6">
        <p className="text-sm text-ink-3">
          Used for students, tests, notes and the class timetable. The timetable recognises levels by A2, AS or IGCSE / O Level in the name, and
          subjects starting Econ, Bus or Acc.
        </p>
        {lists.map(({ key, ...l }) => (
          <NameList key={key} {...l} onError={(m) => toast(m, "error")} />
        ))}
      </CardBody>
    </Card>
  );
}

function NameList({
  title,
  items,
  match,
  add,
  rename,
  remove,
  hint,
  onError,
}: {
  title: string;
  items: Array<{ id: string; name: string }>;
  match: (n: string) => boolean;
  add: (n: string) => void;
  rename: (id: string, n: string) => void;
  remove: (id: string) => void;
  hint: string;
  onError: (m: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const field = "h-10 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-sm text-ink";
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink">{title}</p>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2">
            <input
              defaultValue={it.name}
              aria-label={`${title}: ${it.name}`}
              className={field}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (!v) return onError("A name can't be empty.");
                if (v !== it.name) rename(it.id, v);
              }}
            />
            {!match(it.name) && <span className="shrink-0 text-xs text-warning">Not on the timetable</span>}
            <button
              type="button"
              aria-label={`Remove ${it.name}`}
              onClick={() => {
                if (window.confirm(`Remove "${it.name}"? Students, tests and notes using it lose that tag.`)) remove(it.id);
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-error"
            >
              <Icon.Trash className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = draft.trim();
          if (!v) return;
          if (items.some((i) => i.name.toLowerCase() === v.toLowerCase())) return onError("That name is already there.");
          add(v);
          setDraft("");
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={hint} aria-label={`New ${title.toLowerCase()}`} className={field} />
        <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim()}>
          <Icon.Plus className="h-4 w-4" /> Add
        </Button>
      </form>
    </div>
  );
}
