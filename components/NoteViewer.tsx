"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { Icon, Spinner } from "@/components/ui";

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
}: {
  noteId: string;
  title: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ url: string; fileType: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase().auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("Your session has expired. Sign in again.");
        const res = await fetch("/api/notes/view-url", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ noteId }),
        });
        if (!res.ok) throw new Error("This note could not be opened.");
        const body = (await res.json()) as { url: string; fileType: string };
        if (!cancelled) setState(body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "This note could not be opened.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  if (typeof document === "undefined") return null;

  const isImage = state?.fileType?.startsWith("image/");

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-paper" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2.5">
        <span className="truncate text-sm font-semibold text-ink">{title}</span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <Icon.Close className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto bg-surface-2/40 p-3">
        {error ? (
          <p className="text-sm text-error">{error}</p>
        ) : !state ? (
          <Spinner size={28} className="text-ink-3" />
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
