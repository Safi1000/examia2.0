"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { Modal, Button, Input, Select, Label, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { DraftQuestion } from "@/lib/question-parser";
import type { Question } from "@/types";

export const DOC_ACCEPT = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp";

/**
 * Bulk question creation from documents.
 *
 * Upload one or more PDFs / Word files / images → the server extracts the text
 * (see app/api/extract) → every question lands in an editable review table →
 * the teacher fixes anything the parser got wrong → saving goes through the
 * SAME store.addQuestion path as manual entry. Manual entry is untouched.
 */
export function ImportDocModal({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (questions: Omit<Question, "id" | "order">[]) => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [drafts, setDrafts] = useState<DraftQuestion[]>([]);
  const [problems, setProblems] = useState<string[]>([]);

  function reset() {
    setDrafts([]);
    setProblems([]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    reset();
    onClose();
  }

  async function extract(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setProblems([]);
    try {
      // The route is admin-only, so forward the caller's access token.
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session expired. Sign in again.");

      const form = new FormData();
      files.forEach((f) => form.append("files", f));

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = (await res.json()) as {
        questions?: DraftQuestion[];
        errors?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Extraction failed.");

      setDrafts((prev) => [...prev, ...(json.questions ?? [])]);
      setProblems(json.errors ?? []);
      if (!json.questions?.length) {
        toast("No questions could be read from those files.", "error");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Extraction failed.", "error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function patch(i: number, next: Partial<DraftQuestion>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...next } : d)));
  }
  function removeAt(i: number) {
    setDrafts((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    const questions = drafts.map((d) => {
      const base = { prompt: d.prompt.trim(), marks: d.marks, topic: d.topic.trim() || "Imported" };
      if (d.type === "mcq") {
        return { ...base, type: "mcq" as const, options: d.options, correctIndex: d.correctIndex };
      }
      if (d.type === "photo") return { ...base, type: "photo" as const };
      return { ...base, type: "text" as const };
    });
    onImport(questions);
    close();
  }

  const valid = drafts.length > 0 && drafts.every((d) => d.prompt.trim().length > 0);

  return (
    <Modal open={open} onClose={close} title="Import questions from documents" size="lg">
      <div className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept={DOC_ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => void extract(Array.from(e.target.files ?? []))}
          aria-label="Choose documents"
        />

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void extract(Array.from(e.dataTransfer.files));
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex min-h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed bg-surface px-4 py-5 text-ink-2 transition-colors disabled:opacity-60",
              dragging ? "border-brand bg-brand-soft/40" : "border-border-strong hover:border-brand hover:bg-brand-soft/40",
            )}
          >
            <Icon.Doc className="h-6 w-6" />
            <span className="text-sm font-semibold">
              {busy ? "Reading documents…" : "Choose files or drag them here"}
            </span>
            <span className="text-xs text-ink-3">PDF, DOC, DOCX, PNG, JPG, JPEG, WEBP — several at once</span>
          </button>
        </div>

        {problems.length > 0 && (
          <ul className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}

        {drafts.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-ink">
                {drafts.length} question{drafts.length === 1 ? "" : "s"} found
              </p>
              <p className="text-xs text-ink-3">Check and edit before saving.</p>
            </div>

            <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
              {drafts.map((d, i) => (
                <div key={i} className="rounded-lg border border-border bg-surface-2 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-xs font-bold text-ink-3 tabular">{i + 1}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        value={d.prompt}
                        onChange={(e) => patch(i, { prompt: e.target.value })}
                        placeholder="Question prompt"
                        aria-label={`Prompt for question ${i + 1}`}
                      />

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <div>
                          <Label>Type</Label>
                          <Select
                            value={d.type}
                            onChange={(e) =>
                              patch(i, { type: e.target.value as DraftQuestion["type"] })
                            }
                          >
                            <option value="mcq">MCQ</option>
                            <option value="text">Text</option>
                            <option value="photo">Photo</option>
                          </Select>
                        </div>
                        <div>
                          <Label>Marks</Label>
                          <Input
                            type="number"
                            min={1}
                            value={d.marks}
                            onChange={(e) => patch(i, { marks: Math.max(1, Number(e.target.value) || 1) })}
                          />
                        </div>
                        <div>
                          <Label>Topic</Label>
                          <Input
                            value={d.topic}
                            onChange={(e) => patch(i, { topic: e.target.value })}
                          />
                        </div>
                      </div>

                      {d.type === "mcq" && (
                        <div className="space-y-1.5">
                          <Label>Options — select the correct one</Label>
                          {d.options.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct-${i}`}
                                checked={d.correctIndex === oi}
                                onChange={() => patch(i, { correctIndex: oi })}
                                aria-label={`Mark option ${oi + 1} correct`}
                              />
                              <Input
                                value={opt}
                                onChange={(e) =>
                                  patch(i, {
                                    options: d.options.map((o, x) => (x === oi ? e.target.value : o)),
                                  })
                                }
                                aria-label={`Option ${oi + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  patch(i, {
                                    options: d.options.filter((_, x) => x !== oi),
                                    correctIndex: Math.max(0, d.correctIndex >= oi ? d.correctIndex - 1 : d.correctIndex),
                                  })
                                }
                                className="text-ink-3 hover:text-error"
                                aria-label={`Remove option ${oi + 1}`}
                              >
                                <Icon.Close className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => patch(i, { options: [...d.options, ""] })}
                          >
                            <Icon.Plus className="h-3.5 w-3.5" /> Add option
                          </Button>
                        </div>
                      )}

                      {d.source && <p className="text-[11px] text-ink-3">From {d.source}</p>}
                    </div>

                    <button
                      type="button"
                      onClick={() => removeAt(i)}
                      className="text-ink-3 hover:text-error"
                      aria-label={`Discard question ${i + 1}`}
                    >
                      <Icon.Trash className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={save} disabled={!valid || busy}>
            Add {drafts.length || ""} question{drafts.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
