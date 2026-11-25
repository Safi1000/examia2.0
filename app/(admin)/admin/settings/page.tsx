"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Badge, Button, Card, CardHeader, CardBody, Icon } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { AutomationSettings } from "@/components/admin/Automations";
import { StaffCard } from "@/components/admin/StaffCard";
import { NotesKeyCard } from "@/components/admin/NotesKeyCard";
import { TestNotificationCard } from "@/components/admin/TestNotificationCard";
import { useDatabase, useStore } from "@/lib/data/store";
import { ConfirmBulk } from "@/components/admin/BulkBar";
import { useToast } from "@/components/toast";
import { levelOf, subjectOf } from "@/lib/timetable";

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-5 py-8 sm:px-8">
      <PageHeader title="Settings" subtitle="Automations, staff, notes, levels and waitlist" />
      <AutomationSettings />
      <StaffCard />
      <NotesKeyCard />
      <TestNotificationCard />
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
  // Remove asks in the portal's own dialog, saying exactly what goes with it.
  const [removing, setRemoving] = useState<{ kind: "class" | "subject"; id: string; name: string } | null>(null);
  const lists = [
    { key: "class", title: "Levels", items: db.classes, match: (n: string) => !!levelOf({ name: n }), add: (n: string) => store.addClass(n), rename: (id: string, n: string) => store.updateClass(id, n), askRemove: (it: { id: string; name: string }) => setRemoving({ kind: "class", ...it }), hint: "e.g. A-Levels (A2)" },
    { key: "subject", title: "Subjects", items: db.subjects, match: (n: string) => !!subjectOf({ name: n }), add: (n: string) => store.addSubject(n), rename: (id: string, n: string) => store.updateSubject(id, n), askRemove: (it: { id: string; name: string }) => setRemoving({ kind: "subject", ...it }), hint: "e.g. Economics" },
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
      <ConfirmBulk
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={removing ? `Remove ${removing.name}?` : ""}
        description="This removes more than the name. Here is everything that goes with it."
        confirmLabel="Remove"
        danger
        ack="I understand this can't be undone."
        onConfirm={() => {
          if (!removing) return;
          if (removing.kind === "class") store.deleteClass(removing.id);
          else store.deleteSubject(removing.id);
          setRemoving(null);
        }}
      >
        {removing && <RemovalSummary key={removing.id} kind={removing.kind} id={removing.id} />}
      </ConfirmBulk>
    </Card>
  );
}

/** Everything removing a level or subject takes with it, counted. */
function RemovalSummary({ kind, id }: { kind: "class" | "subject"; id: string }) {
  const db = useDatabase();
  const store = useStore();
  const [remote, setRemote] = useState<Awaited<ReturnType<typeof store.removalCounts>> | null>(null);
  useEffect(() => {
    let live = true;
    void store.removalCounts(kind, id).then((r) => live && setRemote(r));
    return () => {
      live = false;
    };
  }, [store, kind, id]);
  const word = kind === "class" ? "level" : "subject";
  const has = (ids: string[]) => ids.includes(id);
  const tagged = (x: { classId: string | null; subjectId: string | null }) => (kind === "class" ? x.classId : x.subjectId) === id;
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const verb = (k: number, one: string, many: string) => (k === 1 ? one : many);
  const students = db.students.filter((s) => has(kind === "class" ? s.classIds : s.subjectIds)).length;
  const cohorts = db.cohorts.filter((c) => has(kind === "class" ? c.classIds : c.subjectIds)).length;
  const tests = db.tests.filter(tagged).length;
  const homework = db.assignments.filter(tagged).length;
  const shares = db.noteAssignments.filter(tagged).length;
  const marks = kind === "class" ? db.attendanceDays.filter((d) => d.classId === id).length : 0;
  const later = (v: number | null | undefined, line: (k: number) => string, unknown: string) =>
    v === undefined ? "Counting" : v === null ? unknown : line(v);
  const lines = [
    `Taken off ${n(students, "student", "students")}. The students stay in the portal.`,
    `Taken off ${n(cohorts, "cohort", "cohorts")}.`,
    `${n(tests, "test", "tests")} ${verb(tests, "loses", "lose")} this ${word} and ${verb(tests, "becomes", "become")} open to every ${word} in ${verb(tests, "its", "their")} cohort.`,
    `${n(homework, "homework task", "homework tasks")} ${verb(homework, "loses", "lose")} this ${word} and ${verb(homework, "becomes", "become")} open to every ${word} in ${verb(homework, "its", "their")} cohort.`,
    `${n(shares, "note share", "note shares")} for this ${word} ${verb(shares, "is", "are")} deleted. Those notes stop showing for it.`,
    ...(kind === "class" ? [`${n(marks, "attendance mark loses", "attendance marks lose")} its level. The marks stay.`] : []),
    later(remote?.meetLinks, (k) => `${n(k, "Meet link", "Meet links")} deleted.`, "All its Meet links deleted (couldn't count them)."),
    later(remote?.recordings, (k) => `${n(k, "recording link", "recording links")} deleted. The videos stay in your Google Drive.`, "All its recording links deleted (couldn't count them). The videos stay in your Google Drive."),
    later(remote?.joins, (k) => `${n(k, "class join record", "class join records")} deleted (used for attendance).`, "All its class join records deleted (couldn't count them)."),
    later(remote?.feed, (k) => `${n(k, "notification", "notifications")} about it deleted.`, "All notifications about it deleted (couldn't count them)."),
  ];
  return (
    <ul className="list-disc space-y-1 pl-5">
      {lines.map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  );
}

function NameList({
  title,
  items,
  match,
  add,
  rename,
  askRemove,
  hint,
  onError,
  onSaved,
}: {
  title: string;
  items: Array<{ id: string; name: string }>;
  match: (n: string) => boolean;
  add: (n: string) => void;
  rename: (id: string, n: string) => void;
  askRemove: (it: { id: string; name: string }) => void;
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
              onClick={() => askRemove({ id: it.id, name: it.name })}
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
