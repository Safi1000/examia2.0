"use client";

import type { Test } from "@/types";
import logo from "@/logo/logo-web.png";
import { cropUrl, idsInText, parseCrop } from "@/lib/paper-builder";
import { currentPaperUrls } from "@/components/PaperCrop";
import { levelOfName } from "@/lib/notes-library";
import { describeTest, fileSlug, type PdfImage, type PdfPaper, type PdfQuestion } from "@/lib/test-pdf-model";

/**
 * Makes a test's printable PDFs in the browser: the question paper for
 * students and the marking sheet for the teacher. Loaded only when the
 * Download button is pressed (it pulls in @react-pdf, about 1.4 MB), the same
 * way the parent report is made (lib/report-build.tsx).
 *
 * Pictures are cut out exactly as students see them on screen (the crop on the
 * link, the printed question number covered with paper white, see PaperCrop)
 * and handed to the PDF as small JPEGs. A picture that will not load is tried
 * three times, then printed as a clear note instead of a blank.
 */

export type PdfKind = "paper" | "answers";
export interface PdfProgress {
  done: number;
  total: number;
  /** "Preparing question 3 of 40" */
  label: string;
}

const WIDEST = 1700;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bitmap(url: string): Promise<ImageBitmap> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const src = attempt ? `${url}${url.includes("?") ? "&" : "?"}retry=${attempt}` : url;
      const res = await fetch(src, { mode: "cors", credentials: "omit" });
      if (!res.ok) throw new Error(String(res.status));
      return await createImageBitmap(await res.blob());
    } catch (e) {
      last = e;
      await wait(400 * (attempt + 1));
    }
  }
  throw last;
}

/** One picture link → a JPEG of exactly what the student sees. */
async function picture(url: string): Promise<PdfImage> {
  const crop = parseCrop(url);
  const href = crop ? crop.src : url;
  try {
    const im = await bitmap(href);
    const W = im.width;
    const H = im.height;
    const box = crop ? { x: crop.l * W, y: crop.t * H, w: (crop.r - crop.l) * W, h: (crop.b - crop.t) * H } : { x: 0, y: 0, w: W, h: H };
    const scale = Math.min(1, WIDEST / box.w);
    const cw = Math.max(1, Math.round(box.w * scale));
    const ch = Math.max(1, Math.round(box.h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(im, box.x, box.y, box.w, box.h, 0, 0, cw, ch);
    // The paper's own question number, hidden as on screen.
    if (crop?.cover) {
      const [x, y, w, h] = crop.cover;
      ctx.fillRect((x * W - box.x) * scale, (y * H - box.y) * scale, w * W * scale, h * H * scale);
    }
    im.close();
    return { src: canvas.toDataURL("image/jpeg", 0.9), w: cw, h: ch };
  } catch {
    return { failed: true };
  }
}

const SCHEME_BOX = { t: 0.04, b: 0.935, l: 0.055, r: 0.945, ratio: 1.414 };

/** Mark scheme pages for a written past paper question (marking sheet only). */
async function schemeUrls(source: string | null, prompt: string): Promise<string[]> {
  if (!source) return [];
  const id = idsInText(prompt)[0];
  if (!id) return [];
  try {
    const res = await fetch("/api/paper-builder", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ms", id }) });
    const body = res.ok ? ((await res.json()) as { ms: { name: string; start: number; end?: number; pages: number } | null }) : null;
    const ms = body?.ms;
    if (!ms) return [];
    const end = Math.min(ms.pages, ms.end ?? ms.start, ms.start + 3);
    // The page's white margins trimmed, so the scheme prints as large as it can.
    return Array.from({ length: end - ms.start + 1 }, (_, i) => cropUrl(`/papers/img/${ms.name}/${ms.start + i}.jpg`, SCHEME_BOX));
  } catch {
    return [];
  }
}

export async function buildTestPdf(
  test: Test,
  kind: PdfKind,
  opts: { className?: string | null; grid?: boolean },
  onProgress?: (p: PdfProgress) => void,
): Promise<{ blob: Blob; fileName: string }> {
  const logoSrc = new URL(logo.src, window.location.origin).href;
  const plan = describeTest(test, { level: levelOfName(opts.className), grid: opts.grid, logo: logoSrc });
  const sorted = [...test.questions].sort((a, b) => a.order - b.order);

  // Older picture links brought up to date first (the same as the screen does).
  const all = plan.questions.flatMap((q) => [...q.images, ...q.inserts]);
  const current = await currentPaperUrls(all);
  const swap = new Map(all.map((u, i) => [u, current[i]]));
  const now = (u: string) => swap.get(u) ?? u;

  const total = plan.questions.length;
  const cache = new Map<string, Promise<PdfImage>>();
  const load = (u: string) => {
    if (!cache.has(u)) cache.set(u, picture(u));
    return cache.get(u)!;
  };
  const questions: PdfQuestion<PdfImage>[] = [];
  for (const [i, q] of plan.questions.entries()) {
    onProgress?.({ done: i, total, label: `Preparing question ${i + 1} of ${total}` });
    const images = kind === "paper" ? await Promise.all(q.images.map((u) => load(now(u)))) : [];
    const inserts = kind === "paper" ? await Promise.all(q.inserts.map((u) => load(now(u)))) : [];
    const scheme = kind === "answers" && q.kind === "written" ? await Promise.all((await schemeUrls(q.source, sorted[i].prompt)).map(load)) : [];
    questions.push({ ...q, images, inserts, scheme });
    // Let the progress line paint.
    await wait(0);
  }

  onProgress?.({ done: total, total, label: "Setting out the pages" });
  await wait(30);
  const [{ pdf }, doc] = await Promise.all([import("@react-pdf/renderer"), import("@/components/admin/TestPaperDocument")]);
  const paper: PdfPaper = { ...plan, questions };
  const element = kind === "paper" ? <doc.TestPaperDocument paper={paper} /> : <doc.MarkingSheetDocument paper={paper} />;
  const blob = await pdf(element).toBlob();
  const slug = fileSlug(plan.title);
  return { blob, fileName: kind === "paper" ? `${slug}.pdf` : `${slug}-answers.pdf` };
}

/** Saves a made PDF with its file name. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
