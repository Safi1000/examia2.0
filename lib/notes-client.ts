"use client";

import { supabase } from "@/lib/supabase";

/**
 * Browser side of "search inside notes": reading a PDF's words page by page
 * (with PDF.js, the same copy the reader uses), saving them, and searching.
 */
export const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

type TextItem = { str: string; hasEOL?: boolean; transform: number[]; width: number; height: number };
export type PdfLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (o: { url?: string; data?: ArrayBuffer }) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: TextItem[] }> }>;
      destroy?: () => Promise<void>;
    }>;
  };
  Util: { transform: (a: number[], b: number[]) => number[] };
};

let libPromise: Promise<PdfLib> | null = null;
export function loadPdfJs(): Promise<PdfLib> {
  libPromise ??= (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ PDFJS) as Promise<PdfLib>).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = WORKER;
    return lib;
  });
  libPromise.catch(() => (libPromise = null));
  return libPromise;
}

/** One page's words as plain text, with spaces where the gaps are. */
export function itemsToText(items: TextItem[]): string {
  let out = "";
  let prev: TextItem | null = null;
  for (const it of items) {
    if (!it.str) {
      if (it.hasEOL) out += "\n";
      continue;
    }
    if (prev && !out.endsWith("\n") && !out.endsWith(" ")) {
      const sameLine = Math.abs(it.transform[5] - prev.transform[5]) < 1;
      const gap = it.transform[4] - (prev.transform[4] + prev.width);
      const size = Math.hypot(it.transform[2], it.transform[3]) || 10;
      if (!sameLine || gap > size * 0.15) out += " ";
    }
    out += it.str;
    if (it.hasEOL) out += "\n";
    prev = it;
  }
  return out.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

/** Every page's text, from a picked file or a link. */
export async function pdfPagesText(src: File | string): Promise<string[]> {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument(typeof src === "string" ? { url: src } : { data: await src.arrayBuffer() }).promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pg = await doc.getPage(n);
      pages.push(itemsToText((await pg.getTextContent()).items));
    }
    return pages;
  } finally {
    void doc.destroy?.().catch(() => {});
  }
}

async function token(): Promise<string> {
  let { data } = await supabase().auth.getSession();
  if (!data.session) ({ data } = await supabase().auth.refreshSession());
  const t = data.session?.access_token;
  if (!t) throw new Error("You've been signed out. Sign in again.");
  return t;
}

/** Admin: save a note's words so it can be searched. */
export async function saveNoteText(noteId: string, pages: string[]): Promise<void> {
  const res = await fetch("/api/notes/text", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ noteId, pages }),
  });
  if (!res.ok) throw new Error("Couldn't make this note searchable.");
}

/** Admin: which of these notes are searchable already. */
export async function searchableNotes(ids: string[]): Promise<Set<string>> {
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += 150) {
    const res = await fetch(`/api/notes/text?ids=${ids.slice(i, i + 150).join(",")}`, { headers: { Authorization: `Bearer ${await token()}` } });
    if (!res.ok) throw new Error("Couldn't check notes.");
    for (const id of ((await res.json()) as { have: string[] }).have) have.add(id);
  }
  return have;
}

/** Admin: read an already uploaded note (through its signed link) and make it searchable. */
export async function indexExistingNote(noteId: string): Promise<void> {
  const res = await fetch("/api/notes/view-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token()}` },
    body: JSON.stringify({ noteId }),
  });
  if (!res.ok) throw new Error("Couldn't open the note.");
  const { url } = (await res.json()) as { url: string };
  await saveNoteText(noteId, await pdfPagesText(url));
}

export type NoteHit = { noteId: string; page: number; snippet: string };

/** Search inside every note this person can read. */
export async function searchInsideNotes(q: string, signal?: AbortSignal): Promise<{ hits: NoteHit[]; more: boolean }> {
  const res = await fetch(`/api/notes/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${await token()}` }, signal });
  if (!res.ok) throw new Error("Search didn't work. Check your internet and try again.");
  return (await res.json()) as { hits: NoteHit[]; more: boolean };
}
