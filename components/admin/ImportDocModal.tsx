"use client";

import { useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/toast";
import { Modal, Button, Input, Select, Label, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { parseQuestions, type DraftQuestion } from "@/lib/question-parser";
import { useDatabase } from "@/lib/data/store";
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
  const [mode, setMode] = useState<"files" | "paste">("files");
  const [pasted, setPasted] = useState("");
  const [allTopic, setAllTopic] = useState("");
  const [allMarks, setAllMarks] = useState("");
  const [answerKey, setAnswerKey] = useState("");
  const db = useDatabase();

  // Topics already used in this portal, offered as suggestions so tags stay consistent.
  const knownTopics = useMemo(() => {
    const set = new Set<string>();
    for (const t of db.tests) for (const q of t.questions) if (q.topic.trim()) set.add(q.topic.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [db.tests]);

  /** Paste: parsed right here in the browser, no upload needed. */
  function readPasted() {
    const found = parseQuestions(pasted, "Pasted text");
    if (!found.length) {
      toast("No questions found. Number each one (1. 2. 3.) and letter the options (A) B) C)).", "error");
      return;
    }
    setDrafts((prev) => [...prev, ...found]);
    setPasted("");
  }

  function applyToAll(next: Partial<DraftQuestion>) {
    setDrafts((prev) => prev.map((d) => ({ ...d, ...next })));
  }

  /**
   * "1B 2C 3A" (by question number) or "BCA" (in MCQ order). Returns how many
   * answers were set, so the teacher sees whether it matched.
   */
  function applyAnswerKey() {
    const key = answerKey.trim();
    if (!key) return;
    const idx = (l: string) => l.toUpperCase().charCodeAt(0) - 65;
    let applied = 0;
    let next: DraftQuestion[];
    if (/\d/.test(key)) {
      const byNumber = new Map(
        Array.from(key.matchAll(/(\d{1,3})\s*[.):\-]?\s*([A-Ha-h])\b/g)).map((m) => [Number(m[1]), m[2]]),
      );
      next = drafts.map((d, i) => {
        const l = byNumber.get(i + 1);
        if (!l || d.type !== "mcq" || idx(l) >= d.options.length) return d;
        applied++;
        return { ...d, correctIndex: idx(l) };
      });
    } else {
      const letters = key.replace(/[^A-Ha-h]/g, "").split("");
      let n = 0;
      next = drafts.map((d) => {
        if (d.type !== "mcq") return d;
        const l = letters[n++];
        if (!l || idx(l) >= d.options.length) return d;
        applied++;
        return { ...d, correctIndex: idx(l) };
      });
    }
    setDrafts(next);
    toast(
      applied ? `Answer key set on ${applied} question${applied === 1 ? "" : "s"}.` : "That key didn't match any multiple-choice questions.",
      applied ? "success" : "error",
    );
  }


  function reset() {
    setPasted("");
    setAllTopic("");
    setAllMarks("");
    setAnswerKey("");
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
    <Modal open={open} onClose={close} title="Import questions" size="lg">
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

        <div role="tablist" aria-label="How to add questions" className="inline-flex rounded-md border border-border bg-surface p-1">
          {(["files", "paste"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "h-9 rounded px-4 text-sm font-semibold",
                mode === m ? "bg-brand-soft text-brand" : "text-ink-2 hover:text-ink",
              )}
            >
              {m === "files" ? "Upload files" : "Paste text"}
            </button>
          ))}
        </div>

        {mode === "paste" && (
          <div className="space-y-2">
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={"1. Which account is debited when goods are bought on credit?\nA) Sales  B) Purchases  C) Cash  D) Capital\n\n2. Explain one benefit of a partnership. [4 marks]"}
              aria-label="Paste questions"
              className="min-h-40 w-full rounded-md border border-border-strong bg-surface p-3 text-base text-ink placeholder:text-ink-3"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-ink-3">Copy from a past paper, Word or WhatsApp. Numbered questions and lettered options work best.</p>
              <Button size="sm" onClick={readPasted} disabled={!pasted.trim()}>Read questions</Button>
            </div>
          </div>
        )}

        <div
          hidden={mode !== "files"}
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

            {/* Set things once instead of on every row */}
            <div className="grid gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-3">
              <div>
                <Label>Topic for all</Label>
                <div className="flex gap-2">
                  <Input value={allTopic} onChange={(e) => setAllTopic(e.target.value)} list="known-topics" placeholder="e.g. Partnerships" />
                  <Button size="sm" variant="secondary" disabled={!allTopic.trim()} onClick={() => applyToAll({ topic: allTopic.trim() })}>Apply</Button>
                </div>
              </div>
              <div>
                <Label>Marks for all</Label>
                <div className="flex gap-2">
                  <Input type="number" min={1} value={allMarks} onChange={(e) => setAllMarks(e.target.value)} placeholder="e.g. 1" />
                  <Button size="sm" variant="secondary" disabled={!(Number(allMarks) >= 1)} onClick={() => applyToAll({ marks: Math.max(1, Math.round(Number(allMarks))) })}>Apply</Button>
                </div>
              </div>
              <div>
                <Label>Answer key</Label>
                <div className="flex gap-2">
                  <Input value={answerKey} onChange={(e) => setAnswerKey(e.target.value)} placeholder="1B 2C or BCA" />
                  <Button size="sm" variant="secondary" disabled={!answerKey.trim()} onClick={applyAnswerKey}>Apply</Button>
                </div>
              </div>
            </div>
            <datalist id="known-topics">
              {knownTopics.map((t) => <option key={t} value={t} />)}
            </datalist>

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
                            list="known-topics"
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
