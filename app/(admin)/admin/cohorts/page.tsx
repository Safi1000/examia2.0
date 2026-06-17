"use client";

import { useState } from "react";
import type { Cohort, CohortColor } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { studentsInCohort } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Input, Select, CohortDot, Modal, Label, EmptyState, Icon } from "@/components/ui";
import { cohortVar } from "@/lib/tokens";
import { cn } from "@/lib/cn";

const COLORS: CohortColor[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function CohortsPage() {
  const db = useDatabase();
  const store = useStore();
  const { toast } = useToast();

  const [editing, setEditing] = useState<Cohort | "new" | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<CohortColor>(1);
  const [deleting, setDeleting] = useState<Cohort | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  function openNew() {
    setEditing("new");
    setName("");
    setColor(((db.cohorts.length % COLORS.length) + 1) as CohortColor);
  }
  function openEdit(c: Cohort) {
    setEditing(c);
    setName(c.name);
    setColor(c.color);
  }
  function save() {
    if (!name.trim()) return;
    if (editing === "new") {
      store.addCohort(name.trim(), color);
      toast("Cohort created.", "success");
    } else if (editing) {
      store.updateCohort(editing.id, { name: name.trim(), color });
      toast("Cohort updated.", "success");
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

  return (
    <div className="px-4 py-6 sm:px-6">
      <PageHeader
        title="Cohorts"
        subtitle={`${db.cohorts.length} cohorts`}
        actions={<Button onClick={openNew}><Icon.Plus className="h-4 w-4" /> New cohort</Button>}
      />

      {db.cohorts.length === 0 ? (
        <EmptyState icon={<Icon.Layers />} title="No cohorts" action={<Button onClick={openNew}>Create one</Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {db.cohorts.map((c) => {
            const studentCount = studentsInCohort(db, c.id).length;
            const testCount = db.tests.filter((t) => t.cohortId === c.id).length;
            return (
              <Card key={c.id} className="flex items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `color-mix(in srgb, ${cohortVar(c.color)} 18%, transparent)` }}>
                    <CohortDot color={c.color} size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-ink">{c.name}</p>
                    <p className="text-sm text-ink-2">{studentCount} students · {testCount} tests</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => openEdit(c)} className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Edit ${c.name}`}>
                    <Icon.Edit className="h-4 w-4" />
                  </button>
                  <button onClick={() => { setDeleting(c); setReassignTo(""); }} disabled={db.cohorts.length < 2} className="flex h-9 w-9 items-center justify-center rounded text-ink-3 hover:bg-error-soft hover:text-error disabled:opacity-30" aria-label={`Delete ${c.name}`}>
                    <Icon.Trash className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / edit */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New cohort" : "Edit cohort"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={!name.trim()}>{editing === "new" ? "Create" : "Save"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Winter 2027" required autoFocus />
          <div>
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((cc) => (
                <button
                  key={cc}
                  onClick={() => setColor(cc)}
                  className={cn("flex h-11 w-11 items-center justify-center rounded-lg border-2 transition-transform", color === cc ? "border-ink scale-105" : "border-transparent hover:scale-105")}
                  style={{ backgroundColor: `color-mix(in srgb, ${cohortVar(cc)} 16%, transparent)` }}
                  aria-label={`Color ${cc}`}
                  aria-pressed={color === cc}
                >
                  <CohortDot color={cc} size={18} />
                </button>
              ))}
            </div>
          </div>
        </div>
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
            <Button variant="danger" onClick={confirmDelete} disabled={!reassignTo}>Delete &amp; reassign</Button>
          </>
        }
      >
        <Select label="Move students & tests to" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
          <option value="">Choose a cohort…</option>
          {db.cohorts.filter((c) => c.id !== deleting?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Modal>
    </div>
  );
}
