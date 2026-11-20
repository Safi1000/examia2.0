"use client";

import { cld } from "@/lib/cld";
import { trackUpload, useUploadsInProgress } from "@/lib/upload-tracker";
import { memo, useLayoutEffect, useRef, useState } from "react";
import type { Answer, Question } from "@/types";
import { RadioCard, Textarea, Badge, Icon } from "@/components/ui";
import { uploadAsImages } from "@/lib/cloudinary";
import { readPhotoTakenAt, withTakenTime } from "@/lib/photo-time";
import { useToast } from "@/components/toast";
import { PageStack } from "@/components/PageStack";
import { isPastPaper, withoutSources } from "@/lib/paper-builder";
import { PaperText } from "@/components/PaperText";
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
export const QuestionView = memo(
  QuestionViewInner,
  (a, b) => a.question === b.question && a.answer === b.answer && a.paperHidden === b.paperHidden && a.number === b.number && a.total === b.total,
);

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
  number,
  total,
}: {
  question: Question;
  answer: Answer;
  onChange: (next: AnswerChange) => void;
  /** Writing time is over: the wording and the question paper come off the
   *  screen and only the upload control is left. */
  paperHidden?: boolean;
  /** Its number on this paper (1 based), and how many there are. */
  number?: number;
  total?: number;
}) {
  // A past paper question's source ("Q3 · 0452/12 May/June 2024") is never
  // shown to a student: the test numbers its own questions.
  const prompt = withoutSources(question.prompt);
  const pastPaper = isPastPaper(question);
  // Past paper multiple choice is one of two things, never both: typed out
  // (the stem and the four options as text), or the picture of that one
  // question with A, B, C and D to choose from.
  const pictureChoice = pastPaper && question.type === "mcq" && question.options.every((o) => /^[A-D]$/.test(o.trim()));
  const typedChoice = pastPaper && question.type === "mcq" && !pictureChoice;
  const showPrompt = !paperHidden && !!prompt && !pictureChoice;
  const showPictures = !paperHidden && !!question.attachments?.length && !typedChoice;
  // In upload time the wording is gone, so the first line of it says which box this is.
  const firstLine = paperHidden ? (prompt.split("\n").find((l) => l.trim()) ?? "").trim() : "";
  return (
    <div>
      {number != null && (
        <div className="mb-3">
          <h2 className="text-sm font-bold tabular-nums text-ink">
            Question {number}
            {!paperHidden && total ? <span className="font-semibold text-ink-3"> of {total}</span> : null}
          </h2>
          {firstLine && <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {question.topic.trim() && <Badge tone="neutral">{question.topic}</Badge>}
        <span className="text-sm text-ink-2 tabular-nums">
          {question.marks} {question.marks === 1 ? "mark" : "marks"}
          <span aria-hidden className="mx-1.5 text-ink-3">·</span>
          {TYPE_LABEL[question.type] ?? question.type}
        </span>
      </div>
      {showPrompt &&
        (pastPaper ? (
          <PaperText text={prompt} className="mt-4 text-lg font-medium leading-relaxed text-ink" />
        ) : (
          <p className="mt-4 whitespace-pre-wrap text-lg font-medium leading-relaxed text-ink">{prompt}</p>
        ))}
      {showPictures && (
        <div className="mt-4">
          <PageStack urls={question.attachments!} label={pastPaper ? "The question" : "Question paper"} />
        </div>
      )}

      <div className="mt-6">
        {question.type === "mcq" && pictureChoice && (
          <fieldset>
            <legend className="sr-only">Choose your answer: A, B, C or D</legend>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {question.options.map((opt, i) => (
                <RadioCard
                  key={i}
                  name={question.id}
                  checked={answer.selectedIndex === i}
                  onChange={() => onChange({ ...answer, selectedIndex: i })}
                  label={<span className="block text-center text-lg font-bold">{opt.trim()}</span>}
                />
              ))}
            </div>
          </fieldset>
        )}

        {question.type === "mcq" && !pictureChoice && (
          <fieldset className="space-y-2.5">
            <legend className="sr-only">{typedChoice ? "Choose one answer" : prompt || "Choose one answer"}</legend>
            {question.options.map((opt, i) => (
              <RadioCard
                key={i}
                name={question.id}
                checked={answer.selectedIndex === i}
                onChange={() => onChange({ ...answer, selectedIndex: i })}
                label={
                  typedChoice ? (
                    <span className="flex items-start gap-3">
                      <span className="w-4 shrink-0 font-bold text-ink">{"ABCD"[i]}</span>
                      <PaperText text={opt} className="min-w-0 text-ink" />
                    </span>
                  ) : (
                    opt
                  )
                }
              />
            ))}
          </fieldset>
        )}

        {question.type === "text" && <TextAnswer question={question} answer={answer} onChange={onChange} />}

        {question.type === "photo" && <PhotoAnswer questionId={question.id} answer={answer} onChange={onChange} />}
      </div>
    </div>
  );
}

/** Room for a long answer: at least this many characters for each mark. */
const CHARS_PER_MARK = 300;

/**
 * A written answer. The box grows with the answer (no small window to
 * scroll inside), and the limit is never smaller than the marks need: an
 * 8 mark answer has room for several hundred words. Near the limit it says
 * so in words, before typing stops.
 */
function TextAnswer({ question, answer, onChange }: { question: Extract<Question, { type: "text" }>; answer: Answer; onChange: (next: AnswerChange) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = answer.text ?? "";
  // (Never past what a saved copy can hold.)
  const limit = question.maxLength ? Math.min(20_000, Math.max(question.maxLength, Math.max(1, question.marks) * CHARS_PER_MARK)) : undefined;
  const left = limit ? limit - text.length : Infinity;
  // About six characters to a word, with the space.
  const wordsLeft = Math.max(0, Math.round(left / 6));

  // Grow to fit what is written (and shrink back when it is cut).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);

  return (
    <div>
      <Textarea
        ref={ref}
        value={text}
        maxLength={limit}
        rows={4}
        onChange={(e) => onChange({ ...answer, text: e.target.value })}
        placeholder="Write here..."
        aria-label="Your answer"
        className="overflow-hidden"
      />
      {limit != null && left <= 0 ? (
        <p role="status" className="mt-1.5 text-sm font-semibold text-warning">This answer is full. Shorten it to add more.</p>
      ) : limit != null && left <= limit * 0.1 ? (
        <p role="status" className="mt-1.5 text-sm text-warning">
          Nearly at the limit for this answer: about {wordsLeft} {wordsLeft === 1 ? "word" : "words"} left.
        </p>
      ) : (
        question.showCounter &&
        limit != null && (
          <p className="mt-1.5 text-right text-xs tabular-nums text-ink-3">
            {text.length.toLocaleString("en-GB")} of {limit.toLocaleString("en-GB")} characters
          </p>
        )
      )}
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

/**
 * Files that didn't upload, by question, so "Try again" still has them after
 * the student moves to another question and back (no hunting in the gallery).
 */
const failedFiles = new Map<string, File[]>();

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One file up, with two quiet tries more before it counts as failed (phone data drops for a moment). */
async function sendFile(f: File, onProgress: (p: number) => void): Promise<string[]> {
  // When the page was photographed (read before shrinking drops it),
  // kept on the link so Hamza sees it while marking.
  const taken = await readPhotoTakenAt(f).catch(() => null);
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const got = await uploadAsImages(f, onProgress);
      return got.map((u) => withTakenTime(u, taken));
    } catch (e) {
      last = e;
      onProgress(0);
      if (attempt < 2) await wait(attempt === 0 ? 1_500 : 4_000);
    }
  }
  throw last instanceof Error ? last : new Error("That photo didn't upload.");
}

/** A PDF this big can take minutes on phone data. */
const BIG_PDF = 8 * 1024 * 1024;

function PhotoAnswer({ questionId, answer, onChange }: { questionId: string; answer: Answer; onChange: (next: AnswerChange) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [failed, setFailed] = useState<File[]>(() => failedFiles.get(questionId) ?? []);
  const keepFailed = (files: File[]) => {
    if (files.length) failedFiles.set(questionId, files);
    else failedFiles.delete(questionId);
    setFailed(files);
  };
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
    const big = batch.find((f) => f.type === "application/pdf" && f.size > BIG_PDF);
    if (big) toast(`That PDF is ${Math.round(big.size / (1024 * 1024))} MB, so it can take a few minutes on phone data. Photos of each page are usually quicker.`, "info");

    setUploading(true);
    setProgress(0);
    const finished = trackUpload();
    try {
      // Two at a time, in the order the student picked them: many at once
      // stalled and failed together on phone data (and decoding several big
      // photos at once can crash the page on a low memory phone).
      // Progress is the average across all files, so the bar moves smoothly.
      const parts = batch.map(() => 0);
      const results: ({ ok: true; urls: string[] } | { ok: false; file: File })[] = new Array(batch.length);
      let next = 0;
      const worker = async () => {
        while (next < batch.length) {
          const i = next++;
          results[i] = await sendFile(batch[i], (p) => {
            parts[i] = p;
            setProgress(parts.reduce((a, b) => a + b, 0) / parts.length);
          }).then(
            (got) => ({ ok: true as const, urls: got }),
            () => ({ ok: false as const, file: batch[i] }),
          );
        }
      };
      await Promise.all([worker(), worker()]);
      const uploaded = results.flatMap((r) => (r.ok ? r.urls : []));
      // Kept here, ready for "Try again".
      const stillOut = results.flatMap((r) => (r.ok ? [] : [r.file]));
      keepFailed(stillOut);
      if (stillOut.length) toast(stillOut.length === 1 ? "1 page didn't upload. Tap Try again." : `${stillOut.length} pages didn't upload. Tap Try again.`, "error");
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

  // A stray tap on the X must never cost a page: Undo puts it back where it was.
  function remove(url: string) {
    const at = urls.indexOf(url);
    apply((have) => have.filter((u) => u !== url));
    toast(`Page ${at + 1} removed.`, "default", {
      label: "Undo",
      onClick: () => apply((have) => (have.includes(url) ? have : [...have.slice(0, Math.max(0, at)), url, ...have.slice(Math.max(0, at))])),
    });
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
                className="h-32 w-full rounded-tile border border-hairline bg-surface-2 object-cover"
              />
              <span className="absolute left-2 top-2 rounded-full bg-paper/85 px-2 text-xs font-bold tabular-nums text-ink">
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(url)}
                disabled={uploading}
                aria-label={`Remove image ${i + 1}`}
                className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-paper/85 text-ink-2 transition-colors duration-150 hover:bg-error hover:text-paper disabled:opacity-40"
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
              "flex w-full flex-col items-center justify-center gap-2 rounded-tile border-2 border-dashed bg-surface px-5 text-ink-2 transition-colors duration-150 ease-[var(--ease-out)] disabled:opacity-60",
              urls.length ? "min-h-24 py-4" : "min-h-40",
              dragging ? "border-ink-3 bg-surface-2 text-ink" : "border-border-strong hover:border-ink-3 hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon.Camera className="h-6 w-6" />
            <span className="text-base font-semibold">
              {uploading
                ? `Uploading ${batchLabel(progress)}`
                : urls.length
                  ? "Add more pages"
                  : "Take photos or upload a PDF"}
            </span>
            {uploading && (
              <span className="h-1.5 w-44 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <span className="block h-full rounded-full bg-ink-2 transition-[width] duration-200" style={{ width: `${Math.max(4, progress * 100)}%` }} />
              </span>
            )}
            <span className="text-sm tabular-nums text-ink-3">
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
      {failed.length > 0 && !uploading && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-tile border border-warning/30 bg-warning-soft px-4 py-3">
          <p className="text-sm font-semibold text-warning">
            {failed.length === 1 ? "1 page didn't upload." : `${failed.length} pages didn't upload.`}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => keepFailed([])}
              className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-ink-3 hover:text-ink"
            >
              Leave them
            </button>
            <button
              type="button"
              onClick={() => {
                const again = failed;
                keepFailed([]);
                void addFiles(again);
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border-strong px-4 text-sm font-semibold text-ink hover:border-ink-3"
            >
              <Icon.Refresh className="h-4 w-4" /> Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = { mcq: "Choice", text: "Written", photo: "Photo", MCQ: "Choice", TEXT: "Written", PHOTO: "Photo" };
