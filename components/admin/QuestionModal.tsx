"use client";

import { cld } from "@/lib/cld";
import { useRef, useState } from "react";
import type { QuestionCommon, QuestionType, QuestionVariant } from "@/types";
import { Modal, Button, Input, Textarea, Label, Checkbox } from "@/components/ui";
import { cn } from "@/lib/cn";
import { uploadAsImages } from "@/lib/cloudinary";
import { useToast } from "@/components/toast";

/**
 * Question payload minus the test-only `order` / `id`; `subject` for bank items.
 * Written as a distributed intersection so the discriminated union on `type`
 * survives (a plain Omit<Question,…> would collapse it).
 */
export type QuestionDraft = Omit<QuestionCommon, "id"> & { subject?: string } & QuestionVariant;

const TYPE_LABEL: Record<QuestionType, string> = { mcq: "Multiple choice", text: "Written answer", photo: "Photo answer" };

export function QuestionModal({
  open,
  onClose,
  onSave,
  initial,
  withSubject,
  onAddNext,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (draft: QuestionDraft) => void;
  initial?: QuestionDraft | null;
  withSubject?: boolean;
  /** Adding: save this one and stay open for the next (type, topic and marks kept). */
  onAddNext?: (draft: QuestionDraft) => void;
}) {
  // State is seeded from `initial` at mount rather than synced in an effect.
  // Callers pass a `key` that changes per open/target, so opening the modal (or
  // switching which question is being edited) remounts it with fresh values.
  const [type, setType] = useState<QuestionType>(initial?.type ?? "mcq");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [topic, setTopic] = useState(initial?.topic ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [marks, setMarks] = useState(initial?.marks ?? 2);
  const [options, setOptions] = useState<string[]>(
    initial?.type === "mcq" ? [...initial.options, "", "", ""].slice(0, 4) : ["", "", "", ""],
  );
  const [correctIndex, setCorrectIndex] = useState(
    initial?.type === "mcq" ? initial.correctIndex : 0,
  );
  const [maxLength, setMaxLength] = useState(
    initial?.type === "text" ? initial.maxLength ?? 400 : 400,
  );
  const [showCounter, setShowCounter] = useState(
    initial?.type === "text" ? initial.showCounter ?? true : true,
  );
  // A PDF attached here is stored as one image URL per page, so students and
  // graders read it inline instead of downloading a file.
  const [attachments, setAttachments] = useState<string[]>(initial?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function addFiles(files: File[]) {
    const accepted = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!accepted.length) return;
    setUploading(true);
    try {
      const pages = (await Promise.all(accepted.map((f) => uploadAsImages(f)))).flat();
      setAttachments((prev) => [...prev, ...pages]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Upload failed. Try again.", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    // A photo question is usually just "answer the attached paper", so the prompt isn't worth
    // typing out. The topic tag is always optional (it only groups results by topic).
    if (type !== "photo" && !prompt.trim()) e.prompt = "A question prompt is required.";
    if (withSubject && !subject.trim()) e.subject = "Choose a subject.";
    if (marks < 1) e.marks = "Marks must be at least 1.";
    if (type === "mcq" && options.some((o) => !o.trim())) e.options = "Fill in all four options.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function build(): QuestionDraft {
    // No topic given: filed under "General", so results still group neatly.
    const common = { prompt: prompt.trim(), topic: topic.trim() || "General", marks, attachments, ...(withSubject ? { subject: subject.trim() } : {}) };
    let draft: QuestionDraft;
    if (type === "mcq") {
      draft = { ...common, type: "mcq", options: options.map((o) => o.trim()), correctIndex } as QuestionDraft;
    } else if (type === "text") {
      draft = { ...common, type: "text", maxLength, showCounter } as QuestionDraft;
    } else {
      draft = { ...common, type: "photo" } as QuestionDraft;
    }
    return draft;
  }
  function handleSave() {
    if (!validate()) return;
    onSave(build());
  }
  // Save and clear for the next question: same type, topic and marks, cursor back in the question.
  const formRef = useRef<HTMLDivElement>(null);
  function handleNext() {
    if (!onAddNext || !validate()) return;
    onAddNext(build());
    setPrompt("");
    setOptions(["", "", "", ""]);
    setCorrectIndex(0);
    setAttachments([]);
    setErrors({});
    requestAnimationFrame(() => formRef.current?.querySelector("textarea")?.focus());
  }
  const adding = !initial && !!onAddNext;

  // A whole multiple-choice question pasted at once ("Question… A) … B) … C) … D) …"):
  // the options go into their own boxes.
  function onPastePrompt(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (type !== "mcq") return;
    const text = e.clipboardData.getData("text");
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const opt = /^\(?([A-Da-d])[).:\]]\s*(.+)$/;
    const first = lines.findIndex((l) => opt.test(l));
    const found = lines.filter((l) => opt.test(l)).map((l) => l.replace(opt, "$2").trim());
    if (first < 1 || found.length < 2) return;
    e.preventDefault();
    setPrompt(lines.slice(0, first).join("\n"));
    setOptions([...found, "", "", ""].slice(0, 4));
    toast("Options filled in. Tap the circle next to the right answer.", "success");
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? "Edit question" : "Add question"}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {adding && (
            <Button variant="secondary" onClick={handleNext} title="Ctrl+Enter">
              Add &amp; next
            </Button>
          )}
          <Button onClick={handleSave}>{initial ? "Save changes" : adding ? "Add & close" : "Add question"}</Button>
        </>
      }
    >
      <div
        ref={formRef}
        className="space-y-4"
        onKeyDown={(e) => {
          // Ctrl+Enter (Cmd+Enter on a Mac): add and go to the next question (or save, when editing).
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (adding) handleNext();
            else handleSave();
          }
        }}
      >
        <div>
          <Label>Question type</Label>
          <div className="grid grid-cols-3 gap-2">
            {(["mcq", "text", "photo"] as QuestionType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={
                  "rounded-md border px-2 py-2.5 text-xs font-semibold transition-colors " +
                  (type === t ? "border-brand bg-brand-soft text-brand" : "border-border-strong bg-surface text-ink-2 hover:bg-surface-2")
                }
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        {withSubject && (
          <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} error={errors.subject} placeholder="e.g. Mathematics" required />
        )}

        <Textarea
          label={type === "photo" ? "Question prompt (optional)" : "Question prompt"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          error={errors.prompt}
          onPaste={onPastePrompt}
          placeholder={
            type === "photo"
              ? "Leave blank if the attached paper says it all"
              : type === "mcq"
                ? "What are you asking? Tip: paste the question with its A) B) C) D) options and they fill in by themselves"
                : "What are you asking?"
          }
          required={type !== "photo"}
        />

        <div>
          <Label>Question paper (optional)</Label>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="sr-only"
            onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
            aria-label="Attach a PDF or image to this question"
          />
          {attachments.length > 0 && (
            <ul className="mb-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {attachments.map((url, i) => (
                <li key={url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cld(url, 400)} loading="lazy" decoding="async" alt={`Attached page ${i + 1}`} className="h-24 w-full rounded border border-border bg-surface-2 object-cover" />
                  <button
                    type="button"
                    onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}
                    aria-label={`Remove page ${i + 1}`}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded bg-paper/85 text-ink-2 hover:bg-error hover:text-paper"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="secondary" size="sm" type="button" loading={uploading} onClick={() => fileRef.current?.click()}>
            {attachments.length ? "Add more pages" : "Attach PDF or image"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Topic tag (optional)"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            error={errors.topic}
            placeholder="e.g. Algebra"
          />
          <Input label="Marks" type="number" min={1} value={marks} onChange={(e) => setMarks(Number(e.target.value))} error={errors.marks} required />
        </div>

        {type === "mcq" && (
          <div>
            <Label>Options: select the correct one</Label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex min-h-[52px] items-center gap-3 rounded-md border px-4 py-2 transition-colors",
                    correctIndex === i ? "border-brand bg-brand-soft" : "border-border-strong bg-surface",
                  )}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={correctIndex === i}
                    aria-label={`Mark option ${i + 1} as correct`}
                    onClick={() => setCorrectIndex(i)}
                    className={cn(
                      "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors",
                      correctIndex === i ? "border-brand" : "border-border-strong hover:border-brand/50",
                    )}
                  >
                    {correctIndex === i && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                  </button>
                  <input
                    value={opt}
                    onChange={(e) => setOptions((prev) => prev.map((o, j) => (j === i ? e.target.value : o)))}
                    onKeyDown={(e) => {
                      // Enter goes to the next option.
                      if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        (e.currentTarget.closest(".space-y-2")?.querySelectorAll("input")[i + 1] as HTMLInputElement | undefined)?.focus();
                      }
                    }}
                    placeholder={`Option ${i + 1}`}
                    className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
                    aria-label={`Option ${i + 1}`}
                  />
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-3">Tap the circle to mark the correct answer.</p>
            {errors.options && <p className="mt-1.5 text-sm font-medium text-error">{errors.options}</p>}
          </div>
        )}

        {type === "text" && (
          <div className="grid grid-cols-2 items-end gap-3">
            <Input label="Max length" type="number" min={50} value={maxLength} onChange={(e) => setMaxLength(Number(e.target.value))} />
            <div className="pb-3">
              <Checkbox checked={showCounter} onChange={setShowCounter} label="Show character counter" />
            </div>
          </div>
        )}

        {type === "photo" && (
          <p className="rounded-md border border-border bg-surface-2/60 px-3 py-2.5 text-sm text-ink-2">
            Students will upload or photograph their handwritten working. Marked manually during grading.
          </p>
        )}
      </div>
    </Modal>
  );
}
