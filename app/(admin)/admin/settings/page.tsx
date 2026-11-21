"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge, Button, Card, CardHeader, CardBody, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { AutomationSettings } from "@/components/admin/Automations";
import { StaffCard } from "@/components/admin/StaffCard";
import { NotesKeyCard } from "@/components/admin/NotesKeyCard";
import { useDatabase, useStore } from "@/lib/data/store";
import { useToast } from "@/components/toast";
import { levelOf, subjectOf } from "@/lib/timetable";

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-5 py-8 sm:px-8">
      <PageHeader title="Settings" subtitle="Automations, staff, notes, levels and waitlist" />
      <AutomationSettings />
      <StaffCard />
      <NotesKeyCard />
      <LevelsAndSubjects />
      <Card className="max-w-2xl">
        <CardHeader><h2 className="text-base font-semibold text-ink">Waitlist</h2></CardHeader>
        <CardBody>
          <p className="mb-4 text-base text-ink-2">People who joined the waitlist from the website. Kept here, out of the menu, until it&apos;s busy.</p>
          <Link href="/admin/leads" className={buttonClasses({ variant: "secondary" })}>
            Open the waitlist
          </Link>
        </CardBody>
      </Card>
      <Card className="max-w-2xl">
        <CardHeader><h2 className="text-base font-semibold text-ink">Housekeeping</h2></CardHeader>
        <CardBody>
          <p className="mb-4 text-base text-ink-2">Some New test notices were sent twice before 21 November. See them first, then remove the extra copies.</p>
          <Link href="/admin/settings/tidy" className={buttonClasses({ variant: "secondary" })}>
            Tidy doubled notices
          </Link>
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
      <CardHeader><h2 className="text-base font-semibold text-ink">Levels and subjects</h2></CardHeader>
      <CardBody className="space-y-6">
        <p className="text-base text-ink-2">
          Used for students, tests, notes and the class timetable. The timetable recognises levels by A2, AS or IGCSE / O Level in the name, and
          subjects starting Econ, Bus or Acc.
        </p>
        {lists.map(({ key, ...l }) => (
          <NameList key={key} {...l} onError={(m) => toast(m, "error")} onSaved={(m) => toast(m, "success")} />
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
  onSaved,
}: {
  title: string;
  items: Array<{ id: string; name: string }>;
  match: (n: string) => boolean;
  add: (n: string) => void;
  rename: (id: string, n: string) => void;
  remove: (id: string) => void;
  hint: string;
  onError: (m: string) => void;
  onSaved: (m: string) => void;
}) {
  const [draft, setDraft] = useState("");
  // 16px on phones so iOS doesn't zoom in; 44px tall on touch.
  const field = "h-10 min-w-0 flex-1 rounded-field border border-field bg-surface px-3.5 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-md:text-base pointer-coarse:h-11";
  const taken = (v: string, except?: string) => items.some((i) => i.id !== except && i.name.toLowerCase() === v.toLowerCase());
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink-2">{title}</p>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id} className="flex items-center gap-2">
            <input
              defaultValue={it.name}
              aria-label={`${title}: ${it.name}`}
              className={field}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v === it.name) return;
                // Not saved: put the saved name back in the box, so it never shows a name that isn't real.
                if (!v || taken(v, it.id)) {
                  e.target.value = it.name;
                  return onError(v ? "That name is already there." : "A name can't be empty.");
                }
                rename(it.id, v);
                onSaved(`Renamed to ${v}.`);
              }}
            />
            {!match(it.name) && <Badge tone="warning" className="shrink-0">Not on the timetable</Badge>}
            <button
              type="button"
              aria-label={`Remove ${it.name}`}
              onClick={() => {
                if (window.confirm(`Remove "${it.name}"? Students, tests and notes using it lose that tag.`)) remove(it.id);
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors duration-150 hover:bg-error-soft hover:text-error pointer-coarse:h-11 pointer-coarse:w-11"
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
          if (taken(v)) return onError("That name is already there.");
          add(v);
          setDraft("");
          onSaved(`${v} added.`);
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
