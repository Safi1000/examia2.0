"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { Icon, Spinner } from "@/components/ui";
import { PdfView } from "@/components/PdfView";
import { useBackToClose } from "@/components/student/useBackToClose";
import { DEMO } from "@/lib/demo";
import { savePosition } from "@/lib/notes-library";
import { setActivityNote, setActivityNotePage } from "@/lib/activity-tracker";

/** Word, PowerPoint and Excel: phones can't show these, so Microsoft's free online viewer does. */
const OFFICE = /\.(pptx?|docx?|xlsx?)$|officedocument|msword|ms-powerpoint|ms-excel/i;

/**
 * Reads a note inside the portal.
 *
 * The file is streamed through a link that is signed server-side and expires in
 * minutes, so there is nothing on the page worth copying and passing around,
 * and no download button anywhere.
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
  const [state, setState] = useState<{ url: string; fileType: string; fileName?: string; token?: string } | null>(null);
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
        // Preview: every sample note opens the one sample PDF (if it's there).
        if (DEMO) {
          if (!cancelled) setState({ url: "/demo/note.pdf", fileType: "application/pdf", fileName: "note.pdf" });
          return;
        }
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
        if (res.status === 404) throw new Error("This note isn't available any more. Ask Hamza if you need it.");
        if (!res.ok) throw new Error("This note didn't open. Check your internet and try again.");
        const body = (await res.json()) as { url: string; fileType: string; fileName?: string };
        if (!cancelled) setState({ ...body, token });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "This note didn't open. Check your internet and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId, attempt]);

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
      className="fixed inset-0 z-50 flex flex-col bg-paper outline-none select-none [-webkit-touch-callout:none]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface pb-1.5 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.375rem,env(safe-area-inset-top))]">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink">{title}</span>
          {highlight?.length ? (
            <span className="block truncate text-xs text-ink-3">
              Showing &ldquo;{highlight.join(" ")}&rdquo;{page ? ` on page ${page}` : ""}
            </span>
          ) : null}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink active:bg-surface-2"
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
                className="mt-4 inline-flex h-11 items-center rounded-full bg-brand px-6 text-sm font-semibold text-on-brand transition hover:brightness-110"
              >
                Try again
              </button>
            )}
          </div>
        ) : !state ? (
          <div className="flex flex-col items-center gap-3 text-ink-3">
            <Spinner size={28} />
            <span className="text-sm">Opening…</span>
          </div>
        ) : isOffice ? (
          <iframe src={officeSrc} title={title} className="h-full w-full rounded-md border border-border bg-white" />
        ) : isPdf && !pdfFailed ? (
          <PdfView url={state.url} authToken={state.token} onFail={onPdfFail} startPage={page} highlight={highlight} onPage={onPage} autoFocus />
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
              className="mt-4 inline-flex h-11 items-center rounded-full bg-brand px-6 text-sm font-semibold text-on-brand transition hover:brightness-110"
            >
              Try again
            </button>
          </div>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.url} alt={title} className="max-h-full max-w-full rounded-md" />
        ) : (
          <iframe src={state.url} title={title} className="h-full w-full rounded-md border border-border bg-surface" />
        )}
      </div>
    </div>,
    document.body,
  );
}
