"use client";

import { cld } from "@/lib/cld";
import { trackUpload, useUploadsInProgress } from "@/lib/upload-tracker";
import { memo, useRef, useState } from "react";
import type { Answer, Question } from "@/types";
import { RadioCard, Textarea, Pill, Badge, Icon } from "@/components/ui";
import { uploadAsImages } from "@/lib/cloudinary";
import { readPhotoTakenAt, withTakenTime } from "@/lib/photo-time";
import { useToast } from "@/components/toast";
import { PageStack } from "@/components/PageStack";
import { withoutSources } from "@/lib/paper-builder";
import { cn } from "@/lib/cn";

/**
 * Renders one question and its answer control (MCQ / Text / Photo).
 *
 * Memoised: the test timer re-renders the runner every second, and redrawing
 * the question, its photos and the answer box each time made typing and
 * scrolling stutter on phones. It redraws only when the question or the
 * answer changes. (onChange is ignored on purpose: each mount is tied to one
 * question, so its handler never changes meaning.)
 */
export const QuestionView = memo(QuestionViewInner, (a, b) => a.question === b.question && a.answer === b.answer && a.paperHidden === b.paperHidden);

/**
 * The new answer, or a function from the answer as it is right now. Photos use
 * the function: an upload can finish long after it started (the student has
 * moved to another question and back), so it must add to whatever is there by
 * then, never to the copy it started with.
 */
export type AnswerChange = Answer | ((current: Answer) => Answer);

function QuestionViewInner({
  question,
  answer,
  onChange,
  paperHidden = false,
}: {
  question: Question;
  answer: Answer;
  onChange: (next: AnswerChange) => void;
  /** Writing time is over: the wording and the question paper come off the
   *  screen and only the upload control is left. */
  paperHidden?: boolean;
}) {
  // A past paper question's source ("Q3 · 0452/12 May/June 2024") stays hidden
  // while the test is open, so the answer can't be looked up. Results show it.
  const prompt = withoutSources(question.prompt);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {question.topic.trim() && <Badge tone="neutral">{question.topic}</Badge>}
        <Pill>{question.marks} {question.marks === 1 ? "mark" : "marks"}</Pill>
        <span className="text-xs uppercase tracking-wide text-ink-3">{TYPE_LABEL[question.type] ?? question.type}</span>
      </div>
      {!paperHidden && prompt && (
        <p className="mt-3 whitespace-pre-wrap text-lg font-semibold leading-snug text-ink">{prompt}</p>
      )}
      {!paperHidden && question.attachments && question.attachments.length > 0 && (
        <div className="mt-3">
          <PageStack urls={question.attachments} label="Question paper" />
        </div>
      )}

      <div className="mt-5">
        {question.type === "mcq" && (
          <fieldset className="space-y-2.5">
            <legend className="sr-only">{prompt || "Choose one answer"}</legend>
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

const MAX_PHOTOS = 30; // a PDF lands as one entry per page, so this is a page budget

/**
 * Photo answer: multiple images, drag & drop, multi-select, preview, remove.
 *
 * `photoUrls` is the full ordered set; `photoDataUrl` is kept in sync with the
 * first image so existing grading / results / evaluation code that reads the
 * single URL keeps working unchanged.
 */
/** "42%", or "almost done" once the bytes are sent and Cloudinary is processing. */
function batchLabel(p: number) {
  return p >= 0.99 ? "· almost done" : `· ${Math.round(p * 100)}%`;
}

const photosOf = (a: Answer) => a.photoUrls ?? (a.photoDataUrl ? [a.photoDataUrl] : []);

function PhotoAnswer({ answer, onChange }: { answer: Answer; onChange: (next: AnswerChange) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Uploads started before this box was last drawn (the student went to
  // another question and came back) are still on their way.
  const stillUploading = useUploadsInProgress() > 0 && !uploading;

  const urls = photosOf(answer);

  // Always worked out from the pages that are there at that moment, so two
  // uploads finishing in any order both keep their pages.
  const apply = (change: (have: string[]) => string[]) =>
    onChange((current) => {
      const next = change(photosOf(current)).slice(0, MAX_PHOTOS);
      return { ...current, photoUrls: next, photoDataUrl: next[0] };
    });

  async function addFiles(files: File[]) {
    // A PDF is accepted whole and lands as one image per page, so the rest of
    // the app — preview, grading, annotation — only ever deals with images.
    const accepted = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (!accepted.length) {
      toast("Images or PDFs only, please.", "error");
      return;
    }
    const room = MAX_PHOTOS - urls.length;
    if (room <= 0) {
      toast(`That's the limit: ${MAX_PHOTOS} pages.`, "error");
      return;
    }
    const batch = accepted.slice(0, room);

    setUploading(true);
    setProgress(0);
    const finished = trackUpload();
    try {
      // Upload in parallel, but keep the order the student picked them in.
      // Progress is the average across all files, so the bar moves smoothly.
      const parts = batch.map(() => 0);
      // allSettled: one bad file never throws away the pages that did upload.
      const results = await Promise.allSettled(
          batch.map(async (f, i) => {
            // When the page was photographed (read before shrinking drops it),
            // kept on the link so Hamza sees it while marking.
            const taken = await readPhotoTakenAt(f);
            const got = await uploadAsImages(f, (p) => {
              parts[i] = p;
              setProgress(parts.reduce((a, b) => a + b, 0) / parts.length);
            });
            return got.map((u) => withTakenTime(u, taken));
          }),
      );
      const uploaded = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed) toast(failed === 1 ? "1 page didn't upload. Add it again." : `${failed} pages didn't upload. Add them again.`, "error");
      if (urls.length + uploaded.length > MAX_PHOTOS) toast(`Only the first ${MAX_PHOTOS} pages were kept.`, "info");
      if (uploaded.length) apply((have) => [...have, ...uploaded]);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Photo upload failed. Try again.", "error");
    } finally {
      finished();
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(url: string) {
    apply((have) => have.filter((u) => u !== url));
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        onChange={(e) => void addFiles(Array.from(e.target.files ?? []))}
        className="sr-only"
        aria-label="Upload photos or a PDF of your answer"
      />

      {urls.length > 0 && (
        <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {urls.map((url, i) => (
            <li key={url} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cld(url, 400)}
                loading="lazy"
                decoding="async"
                alt={`Answer image ${i + 1}`}
                className="h-32 w-full rounded-lg border border-border bg-surface-2 object-cover"
              />
              <span className="absolute left-1.5 top-1.5 rounded bg-paper/80 px-1.5 text-xs font-bold text-ink backdrop-blur tabular">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(url)}
                disabled={uploading}
                aria-label={`Remove image ${i + 1}`}
                className="absolute right-1 top-1 flex h-11 w-11 disabled:opacity-40 items-center justify-center rounded-md bg-paper/85 text-ink-2 backdrop-blur transition-colors hover:bg-error hover:text-paper"
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
            <span className="text-base font-semibold">
              {uploading
                ? `Uploading ${batchLabel(progress)}`
                : urls.length
                  ? "Add more pages"
                  : "Take photos or upload a PDF"}
            </span>
            {uploading && (
              <span className="h-1.5 w-44 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <span className="block h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${Math.max(4, progress * 100)}%` }} />
              </span>
            )}
            <span className="text-xs text-ink-3">
              {urls.length
                ? `${urls.length} of ${MAX_PHOTOS} pages added`
                : "One clear photo for each page of your working."}
            </span>
          </button>
        </div>
      )}
      {stillUploading && (
        <p role="status" className="mt-2 text-sm text-ink-2">
          Your photos are still uploading. They show up here as soon as they are done.
        </p>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { mcq: "Choice", text: "Written", photo: "Photo", MCQ: "Choice", TEXT: "Written", PHOTO: "Photo" };
