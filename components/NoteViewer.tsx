"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { Icon } from "@/components/ui";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { buttonClasses } from "@/components/ui/Button";
import { PdfView } from "@/components/PdfView";
import { useBackToClose } from "@/components/student/useBackToClose";
import { DEMO } from "@/lib/demo";
import { savePosition } from "@/lib/notes-library";
import { loadPdfJs } from "@/lib/notes-client";
import { setActivityNote, setActivityNotePage } from "@/lib/activity-tracker";

/** Word, PowerPoint and Excel: phones can't show these, so Microsoft's free online viewer does. */
/** A PDF, by its type or its name. */
const isPdfFile = (f: { fileType: string }, title: string) => f.fileType?.includes("pdf") || /\.pdf($|\?)/i.test(title);

const OFFICE = /\.(pptx?|docx?|xlsx?)$|officedocument|msword|ms-powerpoint|ms-excel/i;

type Ticket = { url: string; fileType: string; fileName?: string; token?: string };
/** Ask the server for this note's short-lived link. Throws with a sentence the student can act on. */
async function askFor(noteId: string): Promise<Ticket> {
  // Preview: every sample note opens the one sample PDF (if it's there).
  if (DEMO) return { url: "/demo/note.pdf", fileType: "application/pdf", fileName: "note.pdf" };
  let { data } = await supabase().auth.getSession();
  // A phone left asleep can wake with an old sign-in: refresh it once before giving up.
  if (!data.session) ({ data } = await supabase().auth.refreshSession());
  const token = data.session?.access_token;
  if (!token) throw new Error("You've been signed out. Sign in again, then open this note.");
  const res = await fetch("/api/notes/view-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ noteId }),
  });
  if (res.status === 404) throw new Error("This note isn't available any more. Ask me if you need it.");
  if (res.status === 401 || res.status === 403) throw new Error("You've been signed out. Sign in again, then open this note.");
  if (res.status === 429) throw new Error("Too many notes opened at once. Give it a minute, then try again.");
  if (res.status >= 500) throw new Error("This note didn't open on my side. Try again in a minute.");
  if (!res.ok) throw new Error("This note didn't open. Check your internet and try again.");
  return { ...((await res.json()) as { url: string; fileType: string; fileName?: string }), token };
}
// Links asked for in the last few seconds (they expire in minutes, so only briefly kept).
const warm = new Map<string, { at: number; ticket: Promise<Ticket> }>();
/**
 * Start fetching a note's link the moment it is touched, so it is already on
 * its way when the reader slides in. Safe to call again and again.
 */
export function warmNote(noteId: string): Promise<Ticket> | null {
  if (typeof window === "undefined") return null;
  const hit = warm.get(noteId);
  if (hit && Date.now() - hit.at < 45_000) return hit.ticket;
  const ticket = askFor(noteId);
  // A failed try is forgotten (and never an unhandled error): opening asks again.
  ticket.catch(() => warm.get(noteId)?.ticket === ticket && warm.delete(noteId));
  warm.set(noteId, { at: Date.now(), ticket });
  if (warm.size > 12) warm.delete(warm.keys().next().value as string);
  return ticket;
}

const isPdfTicket = (t: Ticket, title = "") => /pdf/i.test(t.fileType ?? "") || /\.pdf($|\?)/i.test(title) || /\.pdf$/i.test(t.fileName ?? "");
// The last few PDFs read or fetched ahead, kept in memory only (gone on reload),
// so a note opened again, or one fetched while it was being reached for, shows at once.
const files = new Map<string, { at: number; bytes: Promise<ArrayBuffer> }>();
function noteFile(noteId: string, ticket: Ticket | Promise<Ticket>): Promise<ArrayBuffer> {
  const hit = files.get(noteId);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.bytes;
  const bytes = (async () => {
    const t = await ticket;
    const res = await fetch(t.url, t.token ? { headers: { Authorization: `Bearer ${t.token}` } } : undefined);
    if (!res.ok) throw new Error("file");
    return res.arrayBuffer();
  })();
  bytes.catch(() => files.get(noteId)?.bytes === bytes && files.delete(noteId));
  files.set(noteId, { at: Date.now(), bytes });
  while (files.size > 3) files.delete(files.keys().next().value as string);
  return bytes;
}
/**
 * Fetch a note ahead of the tap: its link, and for a PDF the file too. Called
 * when a note is touched, and once for the note most likely to be read next.
 * Opening it still checks with the server first, so nothing is shown that the
 * reader may not see.
 */
export function preloadNote(noteId: string, fileType: string) {
  const ticket = warmNote(noteId);
  if (!ticket || !/pdf/i.test(fileType)) return;
  void noteFile(noteId, ticket).catch(() => {});
}

/** Prints a note: every page drawn as a picture into a sheet only the printer sees (see globals.css). */
async function printPages(blob: Blob) {
  document.getElementById("note-print")?.remove();
  const lib = await loadPdfJs();
  type Page = {
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  };
  const doc = (await lib.getDocument({ data: await blob.arrayBuffer() }).promise) as unknown as {
    numPages: number;
    getPage: (n: number) => Promise<Page>;
    destroy?: () => Promise<void>;
  };
  const sheet = document.createElement("div");
  sheet.id = "note-print";
  sheet.setAttribute("aria-hidden", "true");
  const urls: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i);
      // About 200 dpi on A4: sharp on paper without a huge file.
      const vp = pg.getViewport({ scale: 2.8 });
      const c = document.createElement("canvas");
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      const img = await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("no image"))), "image/jpeg", 0.92));
      const url = URL.createObjectURL(img);
      urls.push(url);
      const el = document.createElement("img");
      el.src = url;
      el.alt = "";
      sheet.appendChild(el);
    }
  } finally {
    void doc.destroy?.();
  }
  document.body.appendChild(sheet);
  await Promise.all([...sheet.querySelectorAll("img")].map((el) => el.decode().catch(() => undefined)));
  const html = document.documentElement;
  let cleaned = false;
  const clean = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener("afterprint", clean);
    html.classList.remove("note-printing");
    sheet.remove();
    urls.forEach((u) => URL.revokeObjectURL(u));
  };
  window.addEventListener("afterprint", clean);
  html.classList.add("note-printing");
  window.print();
  // Some browsers never send "afterprint"; the sheet is invisible on screen, so tidy up later.
  setTimeout(clean, 5 * 60_000);
}

/**
 * Reads a note inside the portal.
 *
 * The file is streamed through a link that is signed server-side and expires in
 * minutes, so there is nothing on the page worth copying and passing around.
 * Saving a copy and printing are there for the students who need them, but
 * kept quiet: a small three-dot button beside Close, never a headline action.
 */
export function NoteViewer({
  noteId,
  title,
  onClose,
  page,
  highlight,
}: {
  noteId: string;
  title: string;
  onClose: () => void;
  /** Open at this page (a search result, or where they left off). */
  page?: number;
  /** Words to mark (from a search). */
  highlight?: string[];
}) {
  // `token` is the sign-in the reader sends with the file request: a student's PDF link only opens with it.
  const [state, setState] = useState<(Ticket & { data?: ArrayBuffer }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Try again" asks for a fresh link.
  const [attempt, setAttempt] = useState(0);
  // PDFs open in our own reader (zoom works everywhere); the browser's viewer is the fallback.
  const [pdfFailed, setPdfFailed] = useState(false);
  const onPdfFail = useCallback(() => setPdfFailed(true), []);
  // Remember the page, so Notes can offer "Continue reading" next time.
  const onPage = useCallback(
    (p: number, total: number) => {
      savePosition(noteId, p, total);
      setActivityNotePage(noteId, p, total);
    },
    [noteId],
  );
  // Reading time and pages, for Hamza's Activity page (only counted for students).
  useEffect(() => {
    setActivityNote(noteId);
    return () => setActivityNote(null);
  }, [noteId]);

  // The quiet menu (three dots): save a copy, or print. `busy` names the one in progress.
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<"save" | "print" | null>(null);
  const [menuError, setMenuError] = useState("");
  async function fetchCopy(): Promise<Blob> {
    if (!state) throw new Error("not ready");
    const res = await fetch(state.url, state.token ? { headers: { Authorization: `Bearer ${state.token}` } } : undefined);
    if (!res.ok) throw new Error("expired");
    return res.blob();
  }
  async function takeCopy(kind: "save" | "print") {
    if (busy) return;
    setBusy(kind);
    setMenuError("");
    try {
      const blob = await fetchCopy();
      const href = URL.createObjectURL(blob);
      if (kind === "save") {
        const a = document.createElement("a");
        a.href = href;
        a.download = state?.fileName || title;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        // A PDF inside a hidden frame doesn't print in most browsers (blank page, or the
        // page behind it). So each page is drawn as a picture into a print-only sheet
        // and the page itself prints: the same in Chrome, Safari, Firefox and on phones.
        await printPages(blob);
      }
      setTimeout(() => URL.revokeObjectURL(href), 120_000);
      setMenu(false);
    } catch {
      setMenuError("That didn't work. Close this note, open it again, and try once more.");
    } finally {
      setBusy(null);
    }
  }

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  // The phone's Back button closes the note instead of leaving the page.
  useBackToClose(onClose);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus moves into the reader, so the keyboard and screen readers follow,
    // and goes back to the row that opened it when the reader closes.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      // Tab stays inside the reader instead of wandering onto the page underneath.
      const box = panel.current;
      if (e.key === "Tab" && box) {
        const items = [...box.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),iframe,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
        const first = items[0];
        const last = items[items.length - 1];
        const at = document.activeElement;
        if (!first) e.preventDefault();
        else if (e.shiftKey && (at === first || at === box)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (at === last || !box.contains(at))) {
          e.preventDefault();
          first.focus();
        }
      }
      // Notes are read on screen only: Ctrl+P / Cmd+P does nothing while one is open.
      if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKey, true);
    // The browser's own Print menu (and "Save as PDF", which goes through it)
    // gets a blank page with a short line instead of the note: see globals.css.
    document.documentElement.classList.add("note-open");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.documentElement.classList.remove("note-open");
      document.body.style.overflow = prev;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // The link asked for when the note was touched, or a fresh one ("Try again" always asks afresh).
        const ticket = await ((attempt === 0 && warmNote(noteId)) || askFor(noteId));
        warm.delete(noteId);
        // A PDF comes down here (or is already here, fetched ahead or read a moment ago).
        // If that fails, the reader fetches it itself and says so if it can't.
        const data = isPdfTicket(ticket, title) ? await noteFile(noteId, ticket).catch(() => undefined) : undefined;
        if (!cancelled) setState({ ...ticket, data });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "This note didn't open. Check your internet and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId, attempt, title]);

  if (typeof document === "undefined") return null;

  const isImage = state?.fileType?.startsWith("image/");
  const isPdf = !!state && (state.fileType?.includes("pdf") || /\.pdf($|\?)/i.test(title));
  const isOffice = !!state && !isPdf && (OFFICE.test(state.fileType) || OFFICE.test(state.fileName ?? "") || OFFICE.test(title));
  // The viewer reads the file from our short-lived link; the name at the end tells it the file type.
  const officeSrc =
    isOffice && state
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(`${window.location.origin}${state.url}&f=${encodeURIComponent(state.fileName || title)}`)}`
      : "";

  return createPortal(
    <div
      ref={panel}
      tabIndex={-1}
      // No right-click menu (no "Print…", "Save image as…") and no dragging pages out.
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      className="fixed inset-0 z-[70] flex flex-col bg-paper outline-none select-none [-webkit-touch-callout:none]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-hairline bg-surface pb-1.5 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.375rem,env(safe-area-inset-top))]">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-ink">{title}</span>
          {highlight?.length ? (
            <span className="block truncate text-sm text-ink-3">
              Showing &ldquo;{highlight.join(" ")}&rdquo;{page ? ` on page ${page}` : ""}
            </span>
          ) : null}
        </span>
        {state && (isPdfFile(state, title) || state.fileType?.startsWith("image/")) && (
          <div className="relative ml-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                setMenuError("");
                setMenu((m) => !m);
              }}
              aria-label="More"
              aria-haspopup="menu"
              aria-expanded={menu}
              className="flex h-11 w-11 items-center justify-center rounded-full text-ink-3/70 transition-colors hover:bg-surface-2 hover:text-ink active:bg-surface-2"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
            {menu && (
              <>
                <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
                <div role="menu" className="absolute right-0 top-12 z-20 w-56 animate-fade-up rounded-tile border border-hairline-strong bg-surface p-1.5 shadow-[var(--shadow-lg)]">
                  <button type="button" role="menuitem" disabled={!!busy} onClick={() => void takeCopy("save")} className="flex min-h-11 w-full items-center rounded-field px-3 text-left text-base font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:opacity-60">
                    {busy === "save" ? "Saving…" : "Save a copy"}
                  </button>
                  <button type="button" role="menuitem" disabled={!!busy} onClick={() => void takeCopy("print")} className="flex min-h-11 w-full items-center rounded-field px-3 text-left text-base font-medium text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink disabled:opacity-60">
                    {busy === "print" ? "Getting it ready…" : "Print"}
                  </button>
                  {menuError && <p role="alert" className="px-3 pb-2 pt-1 text-sm text-error">{menuError}</p>}
                </div>
              </>
            )}
          </div>
        )}
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink active:bg-surface-2"
        >
          <Icon.Close className="h-5 w-5" />
        </button>
      </div>

      <div className={isPdf && !pdfFailed ? "relative flex-1 overflow-hidden bg-surface-2/40" : "flex flex-1 items-center justify-center overflow-auto bg-surface-2/40 p-3"}>
        {error ? (
          <div className="max-w-xs text-center">
            <p className="text-base text-ink-2">{error}</p>
            {!DEMO && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setAttempt((n) => n + 1);
                }}
                className={buttonClasses({ className: "mt-4" })}
              >
                Try again
              </button>
            )}
          </div>
        ) : !state ? (
          <div className="flex h-full w-full flex-col items-center px-3 py-3" role="status">
            <PageSkeleton />
            <span className="sr-only">Opening</span>
          </div>
        ) : isOffice ? (
          <iframe src={officeSrc} title={title} className="h-full w-full rounded-field border border-hairline bg-white" />
        ) : isPdf && !pdfFailed ? (
          <PdfView url={state.url} authToken={state.token} data={state.data} onFail={onPdfFail} startPage={page} highlight={highlight} onPage={onPage} autoFocus />
        ) : isPdf ? (
          // Never fall back to the browser's own PDF viewer: it has Print and Download buttons.
          <div className="max-w-xs text-center">
            <p className="text-base text-ink-2">This note didn&apos;t open. Check your internet and try again.</p>
            <button
              type="button"
              onClick={() => {
                setPdfFailed(false);
                setState(null);
                setAttempt((n) => n + 1);
              }}
              className={buttonClasses({ className: "mt-4" })}
            >
              Try again
            </button>
          </div>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.url} alt={title} className="max-h-full max-w-full rounded-field" />
        ) : (
          <iframe src={state.url} title={title} className="h-full w-full rounded-field border border-hairline bg-surface" />
        )}
      </div>
    </div>,
    document.body,
  );
}
