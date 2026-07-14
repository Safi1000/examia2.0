"use client";

import { useRef, useState } from "react";
import type { Answer, Question } from "@/types";
import { RadioCard, Textarea, Pill, Badge, Icon } from "@/components/ui";
import { uploadImage } from "@/lib/cloudinary";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";

/** Renders one question and its answer control (MCQ / Text / Photo). */
export function QuestionView({
  question,
  answer,
  onChange,
}: {
  question: Question;
  answer: Answer;
  onChange: (next: Answer) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{question.topic}</Badge>
        <Pill>{question.marks} {question.marks === 1 ? "mark" : "marks"}</Pill>
        <span className="text-xs uppercase tracking-wide text-ink-3">{question.type}</span>
      </div>
      <p className="mt-3 text-lg font-semibold leading-snug text-ink">{question.prompt}</p>

      <div className="mt-5">
        {question.type === "mcq" && (
          <fieldset className="space-y-2.5">
            <legend className="sr-only">{question.prompt}</legend>
            {question.options.map((opt, i) => (
              <RadioCard
                key={i}
                name={question.id}
                checked={answer.selectedIndex === i}
                onChange={() => onChange({ ...answer, selectedIndex: i })}
                label={opt}
              />
            ))}
          </fieldset>
        )}

        {question.type === "text" && (
          <div>
            <Textarea
              value={answer.text ?? ""}
              maxLength={question.maxLength}
              onChange={(e) => onChange({ ...answer, text: e.target.value })}
              placeholder="Write here..."
              aria-label="Your answer"
            />
            {question.showCounter && question.maxLength && (
              <p className="mt-1.5 text-right text-xs text-ink-3 tabular">
                {(answer.text ?? "").length} / {question.maxLength}
              </p>
            )}
          </div>
        )}

        {question.type === "photo" && <PhotoAnswer answer={answer} onChange={onChange} />}
      </div>
    </div>
  );
}

const MAX_PHOTOS = 10;

/**
 * Photo answer: multiple images, drag & drop, multi-select, preview, remove.
 *
 * `photoUrls` is the full ordered set; `photoDataUrl` is kept in sync with the
 * first image so existing grading / results / evaluation code that reads the
 * single URL keeps working unchanged.
 */
function PhotoAnswer({ answer, onChange }: { answer: Answer; onChange: (next: Answer) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const urls = answer.photoUrls ?? (answer.photoDataUrl ? [answer.photoDataUrl] : []);

  const apply = (next: string[]) =>
    onChange({ ...answer, photoUrls: next, photoDataUrl: next[0] });

  async function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) {
      toast("Images only, please.", "error");
      return;
    }
    const room = MAX_PHOTOS - urls.length;
    if (room <= 0) {
      toast(`That's the limit — ${MAX_PHOTOS} images.`, "error");
      return;
    }
    const batch = images.slice(0, room);
    if (images.length > room) toast(`Only the first ${room} were added (${MAX_PHOTOS} max).`, "info");

    setUploading(true);
    try {
      // Upload in parallel, but keep the order the student picked them in.
      const uploaded = await Promise.all(batch.map((f) => uploadImage(f)));
      apply([...urls, ...uploaded]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Photo upload failed. Try again.", "error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(i: number) {
    apply(urls.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
        className="sr-only"
        aria-label="Upload photos of your answer"
      />

      {urls.length > 0 && (
        <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {urls.map((url, i) => (
            <li key={url} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Answer image ${i + 1}`}
                className="h-32 w-full rounded-lg border border-border bg-surface-2 object-cover"
              />
              <span className="absolute left-1.5 top-1.5 rounded bg-paper/80 px-1.5 text-[11px] font-bold text-ink backdrop-blur tabular">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove image ${i + 1}`}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-paper/85 text-ink-2 backdrop-blur transition-colors hover:bg-error hover:text-paper"
              >
                <Icon.Close className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {urls.length < MAX_PHOTOS && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void addFiles(Array.from(e.dataTransfer.files));
          }}
        >
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed bg-surface text-ink-2 transition-colors disabled:opacity-60",
              urls.length ? "min-h-24 py-4" : "min-h-40",
              dragging ? "border-brand bg-brand-soft/40" : "border-border-strong hover:border-brand hover:bg-brand-soft/40",
            )}
          >
            <Icon.Camera className="h-7 w-7" />
            <span className="text-sm font-semibold">
              {uploading
                ? "Uploading..."
                : urls.length
                  ? "Add more images"
                  : "Take photos, upload, or drag them here"}
            </span>
            <span className="text-xs text-ink-3">
              {urls.length
                ? `${urls.length} of ${MAX_PHOTOS} added`
                : "Your handwritten working, please. You can add several."}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
