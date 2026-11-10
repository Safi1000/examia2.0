"use client";

import { useRef, useState } from "react";
import type { Announcement } from "@/types";
import { useDatabase, useStore } from "@/lib/data/store";
import { cohortById } from "@/lib/data/selectors";
import { useToast } from "@/components/toast";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, Button, Textarea, Select, Checkbox, Badge, CohortTag, Modal, EmptyState, Icon } from "@/components/ui";
import { formatDate } from "@/lib/time";
import { useAdminFilter } from "@/lib/admin-filter";

const MAX = 250;

export default function AnnouncementsPage() {
  const db = useDatabase();
  // A new notice starts on the cohort picked in the sidebar.
  const { cohortId: viewing } = useAdminFilter();
  const store = useStore();
  const { toast } = useToast();

  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [toPhones, setToPhones] = useState(false);
  const [cohortId, setCohortId] = useState("");
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  // Posting also messages students, so it runs once: a second tap while it sends does nothing.
  const [posting, setPosting] = useState(false);
  const postingRef = useRef(false);

  function openNew() { setEditing("new"); setBody(""); setPinned(false); setToPhones(false); setCohortId(viewing ?? ""); }
  function openEdit(a: Announcement) { setEditing(a); setBody(a.body); setPinned(a.pinned); setCohortId(a.cohortId ?? ""); }
  async function save() {
    const text = body.trim().slice(0, MAX);
    if (!text || postingRef.current) return;
    if (editing === "new") {
      postingRef.current = true;
      setPosting(true);
      try {
        const sent = await store.addAnnouncement({ body: text, pinned, cohortId: cohortId || null }, toPhones);
        toast(
          !toPhones
            ? "Announcement posted."
            : sent === null
              ? "Posted. The phone notification couldn't go out; it still shows in the portal."
              : sent === 0
                ? "Posted. No phones to notify right now (quiet hours, or no one has notifications on)."
                : `Posted and sent to ${sent} ${sent === 1 ? "student" : "students"}.`,
          "success",
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : "Couldn't post the announcement. Try again.", "error");
        return;
      } finally {
        postingRef.current = false;
        setPosting(false);
      }
    } else if (editing) {
      store.updateAnnouncement(editing.id, { body: text, pinned, cohortId: cohortId || null });
      toast("Announcement updated.", "success");
    }
    setEditing(null);
  }

  // Esc or a tap outside the box: never lose a typed message without asking.
  function closeEditor() {
    if (postingRef.current) return;
    const before = editing === "new" || editing === null ? "" : editing.body;
    if (body.trim() !== before.trim() && !window.confirm("Throw away this message?")) return;
    setEditing(null);
  }

  const sorted = [...db.announcements].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
      <PageHeader
        title="Announcements"
        subtitle={`${db.announcements.length} posted`}
        actions={<Button onClick={openNew}><Icon.Plus className="h-4 w-4" /> New announcement</Button>}
      />

      {sorted.length === 0 ? (
        <EmptyState icon={<Icon.Megaphone />} title="No announcements" action={<Button onClick={openNew}>Post one</Button>} />
      ) : (
        <div className="space-y-3">
          {sorted.map((a) => {
            const cohort = cohortById(db, a.cohortId);
            return (
              <Card key={a.id} ruled={a.pinned} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      {a.pinned && <Badge tone="info"><Icon.Flag className="h-3 w-3" /> Pinned</Badge>}
                      {cohort ? <CohortTag color={cohort.color} name={cohort.name} className="text-xs" /> : <span className="text-xs text-ink-3">All cohorts</span>}
                      <span className="text-xs tabular-nums text-ink-3">{formatDate(a.createdAt)}</span>
                    </div>
                    <p className="max-w-[75ch] whitespace-pre-line break-words text-pretty text-sm leading-relaxed text-ink">{a.body}</p>
                    {!a.pinned && (
                      <p className="mt-1.5 text-xs text-ink-3">Dismissed by {a.dismissedBy.length} {a.dismissedBy.length === 1 ? "student" : "students"}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-pressed={a.pinned} onClick={() => store.updateAnnouncement(a.id, { pinned: !a.pinned })} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink max-md:h-11 max-md:w-11" aria-label="Pinned" title={a.pinned ? "Unpin" : "Pin"}>
                      <Icon.Flag className={a.pinned ? "h-4 w-4 text-info" : "h-4 w-4"} />
                    </button>
                    <button type="button" onClick={() => openEdit(a)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink max-md:h-11 max-md:w-11" aria-label="Edit">
                      <Icon.Edit className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setDeleting(a)} className="flex h-10 w-10 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-error-soft hover:text-error max-md:h-11 max-md:w-11" aria-label="Delete">
                      <Icon.Trash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={closeEditor}
        title={editing === "new" ? "New announcement" : "Edit announcement"}
        footer={
          <>
            <Button variant="secondary" disabled={posting} onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void save()} loading={posting} disabled={!body.trim()}>{editing === "new" ? "Post" : "Save"}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Textarea label="Message" value={body} maxLength={MAX} onChange={(e) => setBody(e.target.value)} placeholder="Keep it short and clear…" />
            <p className="mt-1 text-right text-xs text-ink-3 tabular">{body.length} / {MAX}</p>
          </div>
          <Select label="Audience" value={cohortId} onChange={(e) => setCohortId(e.target.value)}>
            <option value="">All cohorts</option>
            {db.cohorts.filter((c) => c.active || c.id === cohortId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Checkbox checked={pinned} onChange={setPinned} label="Pin to the top (always visible, not dismissible)" />
          {editing === "new" && <Checkbox checked={toPhones} onChange={setToPhones} label="Also send to their phones (for something important)" />}
        </div>
      </Modal>

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete announcement?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { if (deleting) store.deleteAnnouncement(deleting.id); setDeleting(null); toast("Deleted.", "success"); }}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Students will no longer see this message.</p>
      </Modal>
    </div>
  );
}
