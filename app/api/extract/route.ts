import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseQuestions, type DraftQuestion } from "@/lib/question-parser";

/**
 * Extracts question text from uploaded documents so a teacher can bulk-create a
 * test instead of typing every question.
 *
 * Server-side on purpose: the PDF/DOCX/OCR engines are heavy and must not be
 * shipped to the browser. Nothing is persisted here — the route only returns
 * draft questions, which the teacher reviews and edits before saving through
 * the existing store actions.
 *
 * Admin-only: the caller's Supabase JWT is verified and its role checked.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per file
const MAX_FILES = 10;

async function isAdmin(req: NextRequest): Promise<boolean> {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return false;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return false;

  const { data, error } = await createClient(url, key).auth.getUser(token);
  if (error || !data.user) return false;
  return (data.user.app_metadata as Record<string, unknown>)?.role === "admin";
}

/** Plain text from a PDF, page by page. */
async function fromPdf(buf: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

/** Plain text from a .docx (Office Open XML). */
async function fromDocx(buf: Buffer): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value;
}

/** OCR for images (handwriting will be unreliable; printed text is fine). */
async function fromImage(buf: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(buf);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Legacy .doc (OLE binary) has no maintained pure-JS parser. Rather than fail,
 * salvage the runs of printable ASCII — good enough for the teacher to correct
 * in the review step, and honest about being best-effort.
 */
function fromLegacyDoc(buf: Buffer): string {
  return buf
    .toString("latin1")
    .replace(/[^\x20-\x7E\r\n]+/g, "\n")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
    .join("\n");
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

async function textFor(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = extensionOf(file.name);
  const mime = file.type;

  if (ext === "pdf" || mime === "application/pdf") return fromPdf(buf);
  if (ext === "docx" || mime.includes("openxmlformats-officedocument.wordprocessingml")) {
    return fromDocx(buf);
  }
  if (ext === "doc" || mime === "application/msword") return fromLegacyDoc(buf);
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp"].includes(ext)) {
    return fromImage(buf);
  }
  throw new Error(`Unsupported file type: ${file.name}`);
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: "No files uploaded." }, { status: 400 });
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files (max ${MAX_FILES}).` }, { status: 400 });
  }

  const questions: DraftQuestion[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      errors.push(`${file.name}: larger than 15 MB.`);
      continue;
    }
    try {
      const text = await textFor(file);
      if (!text.trim()) {
        errors.push(`${file.name}: no readable text found.`);
        continue;
      }
      const parsed = parseQuestions(text, file.name);
      if (!parsed.length) {
        errors.push(`${file.name}: no questions recognised.`);
        continue;
      }
      questions.push(...parsed);
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : "could not be read."}`);
    }
  }

  return NextResponse.json({ questions, errors });
}
