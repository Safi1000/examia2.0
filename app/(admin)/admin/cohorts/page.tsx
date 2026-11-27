"use client";

import Link from "next/link";
import { useState } from "react";
import type { Cohort, CohortColor } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { studentsInCohort } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Input, Select, CohortDot, Modal, Label, EmptyState, Icon, Badge, chipClass } from "@/components/ui";
import { cohortVar } from "@/lib/tokens";
import { cn } from "@/lib/cn";

const COLORS: CohortColor[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function ChipToggle({
  items,
  selected,
  onToggle,
}: {
  items: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (items.length === 0) return <p className="text-sm text-ink-3">No items yet. Add them in Settings.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const on = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className={chipClass(on)}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}

export default function CohortsPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const [editing, setEditing] = useState<Cohort | "new" | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<CohortColor>(1);
  const [selClassIds, setSelClassIds] = useState<string[]>([]);
  const [selSubjectIds, setSelSubjectIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<Cohort | null>(null);
  const [reassignTo, setReassignTo] = useState("");
  const [switchingOff, setSwitchingOff] = useState<Cohort | null>(null);
  const [clearing, setClearing] = useState<Cohort | null>(null);

  function toggleClass(id: string) {
    setSelClassIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function toggleSubject(id: string) {
    setSelSubjectIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function openNew() {
    setEditing("new");
    setName("");
    setColor(((db.cohorts.length % COLORS.length) + 1) as CohortColor);
    setSelClassIds([]);
    setSelSubjectIds([]);
  }
  function openEdit(c: Cohort) {
    setEditing(c);
    setName(c.name);
    setColor(c.color);
    setSelClassIds([...c.classIds]);
    setSelSubjectIds([...c.subjectIds]);
  }
  async function save() {
    if (!name.trim()) return;
    // The levels and subjects are saved before "created" or "updated" is said; a failure names the cohort.
    if (editing === "new") {
      const id = store.addCohort(name.trim(), color);
      const ok = (await Promise.all([store.setCohortClasses(id, selClassIds), store.setCohortSubjects(id, selSubjectIds)])).every(Boolean);
      toast(ok ? "Cohort created." : `${name.trim()} was created, but its levels or subjects didn't save. Open it and save again.`, ok ? "success" : "error");
    } else if (editing) {
      const cohort = editing;
      store.updateCohort(cohort.id, { name: name.trim(), color });
      const ok = (await Promise.all([store.setCohortClasses(cohort.id, selClassIds), store.setCohortSubjects(cohort.id, selSubjectIds)])).every(Boolean);
      toast(ok ? "Cohort updated." : `${name.trim()}: its levels or subjects didn't save. Open it and save again.`, ok ? "success" : "error");
    }
    setEditing(null);
  }
  function confirmDelete() {
    if (!deleting || !reassignTo) return;
    store.deleteCohort(deleting.id, reassignTo);
    toast("Cohort deleted and members reassigned.", "success");
    setDeleting(null);
    setReassignTo("");
  }

  const card = (c: Cohort) => {
            const studentCount = studentsInCohort(db, c.id).length;
            const testCount = db.tests.filter((t) => t.cohortId === c.id).length;
            const classNames = c.classIds.map((cid) => db.classes.find((x) => x.id === cid)?.name).filter(Boolean);
            const subjectNames = c.subjectIds.map((sid) => db.subjects.find((x) => x.id === sid)?.name).filter(Boolean);
            return (
              <Card key={c.id} className="flex flex-wrap items-start justify-between gap-3 p-5">
                {/* When the card is narrow the buttons drop to their own line rather than squeezing the name off it. */}
                <div className="flex min-w-40 flex-1 items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field" style={{ backgroundColor: `color-mix(in srgb, ${cohortVar(c.color)} 18%, transparent)` }}>
                    <CohortDot color={c.color} size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-[-0.01em] text-ink">
                      {/* The name itself truncates (a flex row can't), so the "Off" badge always shows. */}
                      <span className="min-w-0 truncate" title={c.name}>{c.name}</span>
                      {!c.active && <Badge tone="neutral" className="shrink-0">Off</Badge>}
                    </p>
                    <p className="text-sm tabular-nums text-ink-3">{studentCount} {studentCount === 1 ? "student" : "students"} · {testCount} {testCount === 1 ? "test" : "tests"}</p>
                    {!c.active && (
                      <p className="mt-1.5 flex flex-wrap gap-x-4 text-sm font-semibold">
                        <Link href="/admin/roster?archive=1" className="text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline">Roster</Link>
                        <Link href="/admin/tests?archive=1" className="text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline">Tests</Link>
                        <Link href="/admin/submissions?archive=1" className="text-ink-2 underline-offset-4 transition-colors hover:text-ink hover:underline">Marking</Link>
                      </p>
                    )}
                    {(classNames.length > 0 || subjectNames.length > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {classNames.map((n) => (
                          <span key={n} className="rounded-full border border-hairline-strong px-2 py-0.5 text-xs text-ink-2">{n}</span>
                        ))}
                        {subjectNames.map((n) => (
                          <span key={n} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{n}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 gap-1">
                  {!c.active && db.noteAssignments.some((na) => na.cohortId === c.id) && (
                    <button
                      type="button"
                      onClick={() => setClearing(c)}
                      className="flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-ink-3 transition-colors hover:bg-error-soft hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand max-md:h-11"
                      title="Delete the notes that were only for this cohort"
                    >
                      Delete notes
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (c.active) return setSwitchingOff(c);
                      store.setCohortActive(c.id, true);
                      toast(`${c.name} is back on. Its students, tests and work are out of the archive.`, "success");
                    }}
                    className="flex h-10 items-center rounded-full px-3.5 text-sm font-semibold text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink max-md:h-11"
                    aria-label={c.active ? `Archive ${c.name}` : `Switch on ${c.name}`}
                    title={c.active ? "Archive: hide everything from this cohort and delete its notes" : "Switch back on"}
                  >
                    {c.active ? "Archive" : "Switch on"}
                  </button>
                  <button onClick={() => openEdit(c)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 transition-colors max-md:h-11 max-md:w-11 hover:bg-surface-2 hover:text-ink" aria-label={`Edit ${c.name}`}>
                    <Icon.Edit className="h-5 w-5" />
                  </button>
                  <button onClick={() => { setDeleting(c); setReassignTo(""); }} disabled={db.cohorts.length < 2} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 transition-colors max-md:h-11 max-md:w-11 hover:bg-error-soft hover:text-error disabled:opacity-30" aria-label={`Delete ${c.name}`}>
                    <Icon.Trash className="h-5 w-5" />
                  </button>
                </div>
              </Card>
            );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
      <PageHeader
        title="Cohorts"
        subtitle={`${db.cohorts.filter((c) => c.active).length} active`}
        actions={<Button onClick={openNew}><Icon.Plus className="h-4 w-4" /> New cohort</Button>}
      />

      {db.cohorts.length === 0 ? (
        <EmptyState icon={<Icon.Layers />} title="No cohorts" action={<Button onClick={openNew}>Create one</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {db.cohorts.filter((c) => c.active).map(card)}
        </div>
      )}

      {db.cohorts.some((c) => !c.active) && (
        <details className="group mt-8">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
            <Icon.ChevronRight className="h-4 w-4 transition-transform duration-200 ease-[var(--ease-out)] group-open:rotate-90" />
            Archived cohorts ({db.cohorts.filter((c) => !c.active).length})
          </summary>
          <p className="mb-3 mt-1 text-sm text-ink-3">Hidden from every other screen in the portal. Open Roster, Tests or Marking to look back.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {db.cohorts.filter((c) => !c.active).map(card)}
          </div>
        </details>
      )}

      {/* Create / edit */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New cohort" : "Edit cohort"}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={!name.trim()}>{editing === "new" ? "Create" : "Save"}</Button>
          </>
        }
      >
        <div className="space-y-5">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Winter 2027" required autoFocus />
          <div>
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((cc) => (
                <button
                  key={cc}
                  onClick={() => setColor(cc)}
                  className={cn("flex h-11 w-11 items-center justify-center rounded-field border-2 transition-colors duration-150", color === cc ? "border-ink" : "border-transparent hover:border-hairline-strong")}
                  style={{ backgroundColor: `color-mix(in srgb, ${cohortVar(cc)} 16%, transparent)` }}
                  aria-label={`Color ${cc}`}
                  aria-pressed={color === cc}
                >
                  <CohortDot color={cc} size={18} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Levels</Label>
            <p className="mb-2 text-sm text-ink-3">Which levels does this cohort take?</p>
            <ChipToggle items={db.classes} selected={selClassIds} onToggle={toggleClass} />
          </div>
          <div>
            <Label>Subjects</Label>
            <p className="mb-2 text-sm text-ink-3">Which subjects are taught in this cohort?</p>
            <ChipToggle items={db.subjects} selected={selSubjectIds} onToggle={toggleSubject} />
          </div>
        </div>
      </Modal>

      {/* Switch off = archive */}
      <Modal
        open={!!switchingOff}
        onClose={() => setSwitchingOff(null)}
        title={switchingOff ? `Archive ${switchingOff.name}?` : ""}
        description="It disappears from every list and menu, and its notes are deleted. You can still find it under Archived cohorts at the bottom of this page."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSwitchingOff(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!switchingOff) return;
                store.setCohortActive(switchingOff.id, false);
                const r = store.clearCohortNotes(switchingOff.id);
                toast(`${switchingOff.name} archived${r.deleted ? `, ${r.deleted} ${r.deleted === 1 ? "note" : "notes"} deleted` : ""}.`, "success");
                setSwitchingOff(null);
              }}
            >
              Archive and delete notes
            </Button>
          </>
        }
      >
        {switchingOff && (() => {
          const ids = new Set(studentsInCohort(db, switchingOff.id).map((st) => st.id));
          const testIds = new Set(db.tests.filter((t) => t.cohortId === switchingOff.id).map((t) => t.id));
          const work = db.submissions.filter((x) => testIds.has(x.testId) || ids.has(x.studentId)).length;
          const notes = store.cohortNotes(switchingOff.id);
          return (
            <ul className="space-y-1.5 text-sm text-ink-2">
              <li><span className="font-semibold text-ink">{ids.size}</span> {ids.size === 1 ? "student is" : "students are"} hidden and can&apos;t sign in.</li>
              <li><span className="font-semibold text-ink">{testIds.size}</span> {testIds.size === 1 ? "test" : "tests"} and <span className="font-semibold text-ink">{work}</span> {work === 1 ? "hand-in" : "hand-ins"} are hidden from every list.</li>
              <li><span className="font-semibold text-ink">{notes.onlyHere.length}</span> {notes.onlyHere.length === 1 ? "note is" : "notes are"} deleted for good{notes.shared.length ? `; ${notes.shared.length} shared with other cohorts stay with them` : ""}.</li>
              <li>Marks are kept. Find them later under Archived cohorts below.</li>
            </ul>
          );
        })()}
      </Modal>

      {/* Delete an archived cohort's notes */}
      <Modal
        open={!!clearing}
        onClose={() => setClearing(null)}
        title={clearing ? `Delete ${clearing.name}'s notes?` : ""}
        description="This can't be undone."
        footer={
          <>
            <Button variant="secondary" onClick={() => setClearing(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!clearing) return;
                const r = store.clearCohortNotes(clearing.id);
                toast(`${r.deleted} ${r.deleted === 1 ? "note" : "notes"} deleted${r.unlinked ? `, ${r.unlinked} shared ${r.unlinked === 1 ? "note" : "notes"} kept for other cohorts` : ""}.`, "success");
                setClearing(null);
              }}
            >
              Delete notes
            </Button>
          </>
        }
      >
        {clearing && (() => {
          const r = store.cohortNotes(clearing.id);
          return (
            <ul className="space-y-1.5 text-sm text-ink-2">
              <li><span className="font-semibold text-ink">{r.onlyHere.length}</span> {r.onlyHere.length === 1 ? "note was" : "notes were"} only for this cohort and will be deleted.</li>
              {r.shared.length > 0 && <li><span className="font-semibold text-ink">{r.shared.length}</span> {r.shared.length === 1 ? "note is" : "notes are"} also shared with other cohorts: kept for them, just removed from this one.</li>}
              <li>Students, tests and marks stay in the archive.</li>
            </ul>
          );
        })()}
      </Modal>

      {/* Delete + reassign */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete cohort"
        description={deleting ? `Reassign everyone in "${deleting.name}" before deleting.` : ""}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} disabled={!reassignTo}>Delete and reassign</Button>
          </>
        }
      >
        {deleting && (() => {
          const students = studentsInCohort(db, deleting.id).length;
          const tests = db.tests.filter((t) => t.cohortId === deleting.id).length;
          const homework = db.assignments.filter((a) => a.cohortId === deleting.id).length;
          const notices = db.announcements.filter((a) => a.cohortId === deleting.id).length;
          const n = (c: number, w: string) => `${c} ${w}${c === 1 ? "" : "s"}`;
          return (
            <p className="mb-3 text-sm text-ink-2">
              Moving {n(students, "student")}, {n(tests, "test")}, {n(homework, "homework")} and {n(notices, "announcement")}. If this batch has finished, Archive it instead and keep everything where it is.
            </p>
          );
        })()}
        <Select label="Move students and tests to" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
          <option value="">Choose a cohort…</option>
          {/* Archived cohorts are offered last and named as such: students moved there can't sign in. */}
          {db.cohorts.filter((c) => c.id !== deleting?.id && c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          {db.cohorts.some((c) => c.id !== deleting?.id && !c.active) && (
            <optgroup label="Archived">
              {db.cohorts.filter((c) => c.id !== deleting?.id && !c.active).map((c) => <option key={c.id} value={c.id}>{c.name} (archived)</option>)}
            </optgroup>
          )}
        </Select>
        {reassignTo && db.cohorts.find((c) => c.id === reassignTo)?.active === false && (
          <p className="mt-2 text-sm text-warning">That cohort is archived, so students moved there can&apos;t sign in.</p>
        )}
      </Modal>
    </div>
  );
}
