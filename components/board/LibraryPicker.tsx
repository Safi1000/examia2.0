"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDatabase } from "@/lib/data/store";
import { DEMO } from "@/lib/demo";
import { supabase } from "@/lib/supabase";
import { cloudinaryConfigured, uploadImage } from "@/lib/cloudinary";
import { loadPdfJs } from "@/lib/notes-client";
import { isHidden } from "@/lib/notes-library";
import {
  PAST_PAPER_SYLLABI,
  fileName,
  pageCount,
  pageRatios,
  pageUrl,
  papersFor,
  paperTitle,
  sessionLabel,
  type FileType,
  type Paper,
  type PastPaperSyllabus,
} from "@/lib/past-papers";

/**
 * Library: put a Cambridge past paper, or one of Hamza's own notes, straight onto the board.
 *
 * - Past papers: every page already exists as an image on this site (/papers/img/...), so picking
 *   one is instant: nothing is uploaded.
 * - My notes: the note's PDF is opened with a short-lived signed link (/api/notes/view-url, the same
 *   one the portal reader uses), each page is drawn with pdf.js, saved as a JPEG and uploaded to
 *   Cloudinary (the same way pictures on the board are). Without Cloudinary (local preview) the
 *   pages come back as blob: URLs that only work on this screen.
 */
export type LibraryPage = { url: string; w?: number; h?: number };

type Props = {
  open: boolean;
  onClose: () => void;
  /** Pages to place, top to bottom, and the notice text ("Added 9708 May/June 2025 Paper 22"). */
  onPick: (pages: LibraryPage[], title: string) => void | Promise<void>;
  /** Large touch targets on the tablet (and the sheet slides up from the bottom). */
  big?: boolean;
  /** The board's tone. */
  dark?: boolean;
  /** The board page's title, e.g. "A2 Economics": picks the syllabus to start on. */
  hint?: string;
  /** Which list it opens on (the board's Insert menu has a row for each). */
  startTab?: "papers" | "notes";
};

// ---- Look (same ink, glass and gold as the board's floating bars) -------------------------------
const TONE: Record<"light" | "dark", Record<string, string>> = {
  light: {
    "--lp-fg": "#1B1E21",
    "--lp-panel": "rgba(255,255,255,0.98)",
    "--lp-line": "rgba(27,30,33,0.09)",
    "--lp-soft": "rgba(27,30,33,0.045)",
    "--lp-soft-2": "rgba(27,30,33,0.08)",
    "--lp-mute": "rgba(27,30,33,0.62)",
    "--lp-on-bg": "#1B1E21",
    "--lp-on-fg": "#FBC159",
    "--lp-ring": "#1B1E21",
    "--lp-accent": "#8A5B00",
    "--lp-danger": "#B3261E",
    "--lp-shadow": "0 1px 2px rgba(27,30,33,0.05), 0 24px 60px -16px rgba(27,30,33,0.32)",
    "--lp-scrim": "rgba(27,30,33,0.32)",
  },
  dark: {
    "--lp-fg": "#FFFFFF",
    "--lp-panel": "rgba(27,30,33,0.97)",
    "--lp-line": "rgba(255,255,255,0.09)",
    "--lp-soft": "rgba(255,255,255,0.05)",
    "--lp-soft-2": "rgba(255,255,255,0.1)",
    "--lp-mute": "rgba(255,255,255,0.64)",
    "--lp-on-bg": "rgba(251,193,89,0.16)",
    "--lp-on-fg": "#FBC159",
    "--lp-ring": "#FBC159",
    "--lp-accent": "#FBC159",
    "--lp-danger": "#F4A397",
    "--lp-shadow": "inset 0 1px 0 rgba(255,255,255,0.07), 0 24px 60px -16px rgba(0,0,0,0.6)",
    "--lp-scrim": "rgba(10,11,12,0.55)",
  },
};
const RING = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--lp-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--lp-panel)]";

// ---- Recent picks --------------------------------------------------------------------------------
type Recent =
  | { t: "p"; name: string; title: string; page?: number }
  | { t: "n"; id: string; title: string };
const RECENT_KEY = "ht-board-library-recent";
const LAST_SYLLABUS_KEY = "ht-board-library-syllabus";
function readRecent(): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? (v as Recent[]).filter((r) => r && (r.t === "p" || r.t === "n") && typeof r.title === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
function remember(r: Recent) {
  try {
    const key = (x: Recent) => (x.t === "p" ? `p|${x.name}|${x.page ?? ""}` : `n|${x.id}`);
    const next = [r, ...readRecent().filter((x) => key(x) !== key(r))].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode: nothing remembered, nothing breaks */
  }
}

// ---- Past papers helpers -------------------------------------------------------------------------
/** "A2 Economics" -> the likeliest syllabus. */
function syllabusFromHint(hint: string | undefined): PastPaperSyllabus | null {
  const h = (hint ?? "").toLowerCase();
  if (!h) return null;
  const subject = /econ/.test(h) ? "Economics" : /account/.test(h) ? "Accounting" : /business|bus\b/.test(h) ? "Business" : null;
  if (!subject) return null;
  const level: PastPaperSyllabus["level"] | null = /\bigcse\b|\bgcse\b/.test(h)
    ? "IGCSE"
    : /\bo[\s-]?level\b|\bolevel\b/.test(h)
      ? "O Level"
      : /\ba2\b|\bas\b|a[\s-]?level|\balevel\b|\bas[\s-]?level\b/.test(h)
        ? "AS and A Level"
        : null;
  return PAST_PAPER_SYLLABI.find((s) => s.subject === subject && (!level || s.level === level)) ?? null;
}

const levelTag = (s: PastPaperSyllabus) => (s.level === "AS and A Level" ? "A Level" : s.level);

/** Cambridge's own words for the search box: "mark scheme", "ms", "insert". */
const DOC_WORDS = /^(mark|scheme|markscheme|ms|insert|in|qp|paper)$/;

function paperWords(p: Paper): string {
  const s = p.session;
  const series = s.s === "m" ? "feb march february fm" : s.s === "s" ? "may june mj summer" : "oct nov october november on winter";
  return [p.pv, `p${p.num}`, `paper ${p.num}`, String(s.y), String(s.y).slice(2), series, (p.title ?? "").toLowerCase(), p.mcq ? "mcq multiple choice" : ""].join(" ").toLowerCase();
}

function matchPaper(p: Paper, q: string): boolean {
  const tokens = q.toLowerCase().split(/[\s,/]+/).filter(Boolean);
  if (!tokens.length) return true;
  const hay = paperWords(p);
  for (const t of tokens) {
    if (t === "mark" || t === "scheme" || t === "markscheme" || t === "ms") {
      if (!p.ms) return false;
    } else if (t === "insert") {
      if (!p.insert) return false;
    } else if (DOC_WORDS.test(t)) {
      continue;
    } else if (!hay.includes(t)) return false;
  }
  return true;
}

type Hit = { u: string; c: string; l: string; p: number; s: string; n: number; y: number };
const SERIES_FROM_LETTERS: Record<string, "m" | "s" | "w"> = { FM: "m", MJ: "s", ON: "w" };

/** A search hit's own paper: "2281/12/M/J/25" -> "2281_s25_qp_12". */
function nameFromHit(h: Hit): string | null {
  const parts = h.c.split("/");
  if (parts.length < 5) return null;
  const s = SERIES_FROM_LETTERS[`${parts[2]}${parts[3]}`];
  return s ? `${parts[0]}_${s}${parts[4]}_qp_${parts[1]}` : null;
}

function pagesOfPaper(name: string, only?: number): LibraryPage[] {
  const n = pageCount(name);
  const ratios = pageRatios(name);
  const list = only ? [only] : Array.from({ length: n }, (_, i) => i + 1);
  return list.map((p) => {
    const r = ratios?.[p - 1];
    return r ? { url: pageUrl(name, p), w: 1000, h: Math.round(1000 * r) } : { url: pageUrl(name, p) };
  });
}

// ---- Notes helpers -------------------------------------------------------------------------------
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas?: HTMLCanvasElement }) => { promise: Promise<void> };
  cleanup?: () => void;
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy?: () => Promise<void> };

async function noteTicket(noteId: string): Promise<{ url: string; token?: string }> {
  if (DEMO) return { url: "/demo/note.pdf" };
  let { data } = await supabase().auth.getSession();
  if (!data.session) ({ data } = await supabase().auth.refreshSession());
  const token = data.session?.access_token;
  if (!token) throw new Error("You're signed out. Sign in again, then pick the note.");
  const res = await fetch("/api/notes/view-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ noteId }),
  });
  if (res.status === 404) throw new Error("That note isn't available any more.");
  if (!res.ok) throw new Error("The note didn't open. Check the internet and try again.");
  return { ...((await res.json()) as { url: string }), token };
}

const PAGE_WIDTH = 1600;
const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

// ---- Component -----------------------------------------------------------------------------------
export function LibraryPicker({ open, onClose, onPick, big = false, dark = false, hint, startTab = "papers" }: Props) {
  const [tab, setTab] = useState<"papers" | "notes">(startTab);
  const [shown, setShown] = useState(false);
  const [query, setQuery] = useState("");
  const [inside, setInside] = useState(false);
  const [code, setCode] = useState<string>(() => syllabusFromHint(hint)?.code ?? PAST_PAPER_SYLLABI[0].code);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [hits, setHits] = useState<{ q: string; list: Hit[]; total: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelled = useRef(false);
  const blobUrls = useRef<string[]>([]);
  const db = useDatabase();

  const cell = big ? "min-h-11" : "min-h-9";
  const text = big ? "text-[15px]" : "text-sm";

  // Open: pick the syllabus (hint, else the last one used), read recents, slide in.
  useEffect(() => {
    if (!open) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_SYLLABUS_KEY);
    } catch {
      /* ignore */
    }
    const fromHint = syllabusFromHint(hint)?.code;
    const start = fromHint ?? (last && PAST_PAPER_SYLLABI.some((s) => s.code === last) ? last : PAST_PAPER_SYLLABI[0].code);
    cancelled.current = false;
    const id = requestAnimationFrame(() => {
      setCode(start);
      setRecents(readRecent());
      setError("");
      setProgress("");
      setQuery("");
      setHits(null);
      setInside(false);
      setShown(true);
    });
    return () => {
      cancelAnimationFrame(id);
      setShown(false);
    };
  }, [open, hint]);

  const close = useCallback(() => {
    cancelled.current = true;
    onClose();
  }, [onClose]);

  // Esc closes; Tab stays inside the sheet; focus goes back where it was.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === "Tab" && panelRef.current) {
        const f = [...panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, [href], [tabindex]:not([tabindex='-1'])")].filter((el) => el.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    const t = window.setTimeout(() => (panelRef.current?.querySelector<HTMLElement>(big ? "[data-lp-tab]" : "input"))?.focus(), 60);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.clearTimeout(t);
      before?.focus?.();
    };
  }, [open, close, big]);

  const qTrim = query.trim();
  const longEnough = qTrim.replace(/[^a-z0-9]/gi, "").length >= 3;
  const current = longEnough && hits && hits.q === qTrim ? hits : null;
  const searching = inside && longEnough && !current;
  const syllabus = PAST_PAPER_SYLLABI.find((s) => s.code === code) ?? PAST_PAPER_SYLLABI[0];
  const papers = useMemo(() => (open ? papersFor(code) : []), [open, code]);
  const filtered = useMemo(() => papers.filter((p) => matchPaper(p, query)), [papers, query]);

  // Search inside papers: waits for a pause in typing.
  useEffect(() => {
    if (!open || tab !== "papers" || !inside) return;
    const q = query.trim();
    if (q.replace(/[^a-z0-9]/gi, "").length < 3) return;
    const ac = new AbortController();
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/past-papers/search?q=${encodeURIComponent(q)}&code=${code}`, { signal: ac.signal });
        const j = (await r.json()) as { hits: Hit[]; total: number };
        setHits({ q, list: j.hits ?? [], total: j.total ?? 0 });
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setHits({ q, list: [], total: 0 });
        }
      }
    }, 350);
    return () => {
      ac.abort();
      window.clearTimeout(t);
    };
  }, [open, tab, inside, query, code]);

  const finish = useCallback(
    async (pages: LibraryPage[], title: string, rec: Recent) => {
      try {
        await onPick(pages, title);
        remember(rec);
        onClose();
      } catch {
        setError("That didn't reach the board. Try again.");
      }
    },
    [onPick, onClose],
  );

  const pickPaper = async (p: Paper, type: FileType) => {
    const name = fileName(p.code, p.session, type, p.pv);
    const pages = pagesOfPaper(name);
    if (!pages.length) {
      setError("This file's pages aren't ready yet.");
      return;
    }
    try {
      localStorage.setItem(LAST_SYLLABUS_KEY, p.code);
    } catch {
      /* ignore */
    }
    const what = type === "ms" ? " mark scheme" : type === "in" ? " insert" : "";
    const title = `Added ${p.code} ${sessionLabel(p.session)} Paper ${p.pv}${what}`;
    setError("");
    await finish(pages, title, { t: "p", name, title: title.replace(/^Added /, "") });
  };

  const pickHit = async (h: Hit) => {
    const name = nameFromHit(h);
    if (!name) return;
    const title = `Added ${h.l.replace(/ · /g, ", ")}, page ${h.p}`;
    setError("");
    await finish(pagesOfPaper(name, h.p), title, { t: "p", name, title: title.replace(/^Added /, ""), page: h.p });
  };

  const pickRecent = async (r: Recent) => {
    setError("");
    if (r.t === "p") {
      const pages = pagesOfPaper(r.name, r.page);
      if (!pages.length) return setError("That file isn't on the site any more.");
      await finish(pages, `Added ${r.title}`, r);
    } else {
      const note = db.notes.find((n) => n.id === r.id);
      if (!note) return setError("That note isn't in the list any more.");
      await pickNote(note.id, note.title);
    }
  };

  const pickNote = async (id: string, title: string) => {
    if (busy) return;
    setBusy(id);
    setError("");
    setProgress("Opening the note…");
    cancelled.current = false;
    let doc: PdfDoc | null = null;
    // (Preview without uploads only: the pages this run made as blob: addresses.)
    let blobsHere: string[] = [];
    try {
      const ticket = await noteTicket(id);
      const res = await fetch(ticket.url, ticket.token ? { headers: { Authorization: `Bearer ${ticket.token}` } } : undefined);
      if (!res.ok) throw new Error("The note didn't open. Check the internet and try again.");
      const bytes = await res.arrayBuffer();
      const lib = await loadPdfJs();
      doc = (await (lib.getDocument as unknown as (o: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> })({ data: bytes }).promise) as PdfDoc;
      const total = doc.numPages;
      const cloud = cloudinaryConfigured();
      const made: Array<Promise<LibraryPage>> = [];
      let uploaded = 0;
      blobsHere = [];
      for (let n = 1; n <= total; n++) {
        if (cancelled.current) throw new Error("cancelled");
        setProgress(`Preparing page ${n} of ${total}…`);
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: PAGE_WIDTH / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("This screen can't prepare the pages.");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
        page.cleanup?.();
        if (!blob) throw new Error("A page couldn't be prepared.");
        const w = canvas.width;
        const h = canvas.height;
        canvas.width = canvas.height = 0;
        if (cloud) {
          const file = new File([blob], `note-${id.slice(0, 8)}-p${n}.jpg`, { type: "image/jpeg" });
          made.push(
            uploadImage(file).then((url) => {
              uploaded++;
              setProgress(`Uploaded ${uploaded} of ${total}…`);
              return { url, w, h };
            }),
          );
          // Keep at most three uploads in flight so a long note doesn't flood a slow line.
          if (made.length - uploaded >= 3) await Promise.race(made);
        } else {
          const url = URL.createObjectURL(blob);
          blobUrls.current.push(url);
          blobsHere.push(url);
          made.push(Promise.resolve({ url, w, h }));
        }
      }
      if (cloud) setProgress(`Uploading… (${uploaded} of ${total})`);
      const pages = await Promise.all(made);
      if (cancelled.current) throw new Error("cancelled");
      setProgress("Adding to the board…");
      await finish(pages, `Added ${title}`, { t: "n", id, title });
      // Handed to the board, which shows them from now on: not this sheet's to let go any more.
      blobUrls.current = blobUrls.current.filter((u) => !blobsHere.includes(u));
    } catch (e) {
      // Pages made on this screen that never reached the board (stopped, or something failed): let go.
      for (const u of blobsHere) URL.revokeObjectURL(u);
      blobUrls.current = blobUrls.current.filter((u) => !blobsHere.includes(u));
      const m = (e as Error).message;
      if (m !== "cancelled") setError(m || "That note didn't get ready. Try again.");
    } finally {
      void doc?.destroy?.().catch(() => {});
      setBusy(null);
      setProgress("");
    }
  };

  const notes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.notes
      .filter((n) => !isHidden(n.fileType))
      .filter((n) => !q || n.title.toLowerCase().includes(q) || n.fileName.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  }, [db.notes, query]);

  if (!open) return null;

  const showRecents = !query.trim() && recents.length > 0;
  const tabBtn = (id: "papers" | "notes", label: string) => (
    <button
      type="button"
      role="tab"
      data-lp-tab
      aria-selected={tab === id}
      onClick={() => {
        setTab(id);
        setError("");
      }}
      className={`${cell} ${text} rounded-[10px] px-4 font-medium transition-colors ${RING} ${tab === id ? "bg-[var(--lp-on-bg)] text-[var(--lp-on-fg)]" : "text-[var(--lp-mute)] hover:bg-[var(--lp-soft)] hover:text-[var(--lp-fg)]"}`}
    >
      {label}
    </button>
  );

  return (
    <div
      className={`fixed inset-0 z-[100] flex justify-center ${big ? "items-end" : "items-end sm:items-center"}`}
      style={{ ...(TONE[dark ? "dark" : "light"] as React.CSSProperties), fontFamily: "var(--font-sans)", color: "var(--lp-fg)" }}
    >
      <div
        aria-hidden
        onClick={close}
        className="absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none"
        style={{ background: "var(--lp-scrim)", opacity: shown ? 1 : 0 }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Library"
        className={`relative flex w-full flex-col overflow-hidden border border-[color:var(--lp-line)] bg-[var(--lp-panel)] backdrop-blur-xl transition-[transform,opacity] duration-250 ease-out motion-reduce:transition-none ${
          big ? "max-h-[80dvh] max-w-3xl rounded-t-[20px]" : "max-h-[80dvh] max-w-2xl rounded-t-[20px] sm:rounded-[18px]"
        }`}
        style={{ boxShadow: "var(--lp-shadow)", transform: shown ? "none" : "translateY(28px)", opacity: shown ? 1 : 0 }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
          <div role="tablist" aria-label="Library source" className="flex gap-1 rounded-[12px] bg-[var(--lp-soft)] p-1">
            {tabBtn("papers", "Past papers")}
            {tabBtn("notes", "My notes")}
          </div>
          <span className="flex-1" />
          <button type="button" onClick={close} aria-label="Close library" className={`grid ${big ? "h-11 w-11" : "h-9 w-9"} place-items-center rounded-[10px] text-[var(--lp-mute)] transition-colors hover:bg-[var(--lp-soft)] hover:text-[var(--lp-fg)] ${RING}`}>
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 px-3 pb-2">
          <label className="relative block">
            <span className="sr-only">{tab === "notes" ? "Search my notes" : inside ? "Search inside papers" : "Search papers"}</span>
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--lp-mute)]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <circle cx="9" cy="9" r="5.5" />
              <path d="M13.2 13.2L17 17" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "notes" ? "Search my notes" : inside ? "A topic, e.g. elasticity" : "2024 22, mark scheme, insert…"}
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              className={`w-full rounded-[12px] border border-[color:var(--lp-line)] bg-[var(--lp-soft)] pl-10 pr-3 text-base text-[var(--lp-fg)] placeholder:text-[var(--lp-mute)] ${big ? "h-12" : "h-10"} ${RING}`}
            />
          </label>

          {tab === "papers" && (
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
              {PAST_PAPER_SYLLABI.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  aria-pressed={s.code === code}
                  ref={(el) => {
                    if (el && s.code === code) el.parentElement!.scrollTo({ left: Math.max(0, el.offsetLeft - 16), behavior: "auto" });
                  }}
                  onClick={() => setCode(s.code)}
                  className={`${cell} ${text} shrink-0 whitespace-nowrap rounded-full px-3.5 font-medium transition-colors ${RING} ${s.code === code ? "bg-[var(--lp-on-bg)] text-[var(--lp-on-fg)]" : "bg-[var(--lp-soft)] text-[var(--lp-mute)] hover:text-[var(--lp-fg)]"}`}
                >
                  {s.subject === "Business" && s.level !== "AS and A Level" ? "Business" : s.subject} {s.code}
                  <span className="ml-1.5 font-normal opacity-70">{levelTag(s)}</span>
                </button>
              ))}
            </div>
          )}
          {tab === "papers" && (
            <div className="mt-1 flex items-center gap-3 text-[var(--lp-mute)]">
              <button
                type="button"
                role="switch"
                aria-checked={inside}
                onClick={() => setInside((v) => !v)}
                className={`inline-flex items-center gap-2 rounded-lg px-1 ${big ? "min-h-11" : "min-h-8"} ${text} ${RING}`}
              >
                <span className={`relative h-5 w-9 rounded-full transition-colors ${inside ? "bg-[var(--lp-accent)]" : "bg-[var(--lp-soft-2)]"}`}>
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--lp-panel)] shadow transition-[left] ${inside ? "left-[18px]" : "left-0.5"}`} />
                </span>
                Search inside papers
              </button>
            </div>
          )}
        </div>

        {(error || busy) && (
          <div role={error ? "alert" : "status"} className={`mx-3 mb-2 rounded-[10px] px-3 py-2 ${text} ${error ? "bg-[var(--lp-soft)] text-[var(--lp-danger)]" : "bg-[var(--lp-on-bg)] text-[var(--lp-on-fg)]"}`}>
            {error || progress}
          </div>
        )}

        {/* List */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 [scrollbar-width:thin]" data-lp-scroll>
          {showRecents && (
            <section aria-label="Recent" className="mb-3">
              <h3 className="px-1 pb-1.5 pt-1 text-xs font-medium uppercase tracking-wide text-[var(--lp-mute)]">Recent</h3>
              <div className="flex flex-wrap gap-1.5">
                {recents.map((r, i) => (
                  <button
                    key={`${r.t}-${i}`}
                    type="button"
                    disabled={!!busy}
                    onClick={() => void pickRecent(r)}
                    className={`${cell} ${text} max-w-full truncate rounded-full border border-[color:var(--lp-line)] px-3.5 text-[var(--lp-fg)] transition-colors hover:bg-[var(--lp-soft)] disabled:opacity-50 ${RING}`}
                  >
                    {r.title}
                  </button>
                ))}
              </div>
            </section>
          )}

          {tab === "papers" && !inside && (
            <ul className="flex flex-col gap-1.5" aria-label={`${syllabus.name} papers`}>
              {filtered.map((p) => {
                const qp = fileName(p.code, p.session, "qp", p.pv);
                return (
                  <li key={p.key} className="flex items-stretch gap-2 rounded-[12px] border border-[color:var(--lp-line)] p-1.5 [contain-intrinsic-size:auto_72px] [content-visibility:auto]">
                    <button
                      type="button"
                      onClick={() => void pickPaper(p, "qp")}
                      className={`flex min-w-0 flex-1 items-center gap-3 rounded-[9px] p-1 text-left transition-colors hover:bg-[var(--lp-soft)] ${RING}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={pageUrl(qp, 1)} alt="" loading="lazy" decoding="async" className="h-14 w-10 shrink-0 rounded-[4px] border border-[color:var(--lp-line)] bg-white object-cover object-top" />
                      <span className="min-w-0">
                        <span className={`block truncate font-medium ${text}`}>
                          {sessionLabel(p.session)} · Paper {p.pv}
                        </span>
                        <span className="block truncate text-[13px] text-[var(--lp-mute)]">
                          {paperTitle(p)}
                          {p.minutes ? ` · ${p.minutes} min` : ""}
                          {pageCount(qp) ? ` · ${pageCount(qp)} pages` : ""}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-col justify-center gap-1 sm:flex-row sm:items-center">
                      {p.ms && (
                        <button type="button" onClick={() => void pickPaper(p, "ms")} className={`${cell} rounded-[9px] border border-[color:var(--lp-line)] px-3 text-[13px] font-medium transition-colors hover:bg-[var(--lp-soft)] ${RING}`}>
                          Mark scheme
                        </button>
                      )}
                      {p.insert && (
                        <button type="button" onClick={() => void pickPaper(p, "in")} className={`${cell} rounded-[9px] border border-[color:var(--lp-line)] px-3 text-[13px] font-medium transition-colors hover:bg-[var(--lp-soft)] ${RING}`}>
                          Insert
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
              {!filtered.length && <li className={`px-2 py-8 text-center ${text} text-[var(--lp-mute)]`}>{papers.length ? "No paper matches that. Try a year or a paper number." : "No papers for this syllabus yet."}</li>}
            </ul>
          )}

          {tab === "papers" && inside && (
            <ul className="flex flex-col gap-1.5" aria-label="Pages that mention your topic">
              {searching && <li className={`px-2 py-6 text-center ${text} text-[var(--lp-mute)]`}>Searching…</li>}
              {!searching && !current && <li className={`px-2 py-8 text-center ${text} text-[var(--lp-mute)]`}>Type a topic (3 letters or more) to find pages in {syllabus.short} papers.</li>}
              {!searching && current && !current.list.length && <li className={`px-2 py-8 text-center ${text} text-[var(--lp-mute)]`}>No page mentions that in {syllabus.short}.</li>}
              {!searching &&
                current?.list.map((h) => (
                  <li key={`${h.c}-${h.p}`}>
                    <button type="button" onClick={() => void pickHit(h)} className={`w-full rounded-[12px] border border-[color:var(--lp-line)] p-3 text-left transition-colors hover:bg-[var(--lp-soft)] ${RING} ${big ? "min-h-11" : ""}`}>
                      <span className={`block font-medium ${text}`}>
                        {h.l.split(" · ").slice(1).join(" · ")} · page {h.p}
                      </span>
                      {h.s && (
                        <span className="mt-0.5 block text-[13px] leading-snug text-[var(--lp-mute)]">
                          {h.s.split(/(⟦[^⟧]*⟧)/).map((part, i) =>
                            part.startsWith("⟦") ? (
                              <mark key={i} className="rounded-sm bg-[var(--lp-on-bg)] px-0.5 text-[var(--lp-on-fg)]">
                                {part.slice(1, -1)}
                              </mark>
                            ) : (
                              part
                            ),
                          )}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              {!searching && current && current.total > current.list.length && <li className="px-2 py-2 text-center text-[13px] text-[var(--lp-mute)]">Showing the newest {current.list.length} of {current.total}. Add a word to narrow it.</li>}
            </ul>
          )}

          {tab === "notes" && (
            <>
              {!DEMO && !cloudinaryConfigured() && (
                <p className="mb-2 rounded-[10px] bg-[var(--lp-soft)] px-3 py-2 text-[13px] text-[var(--lp-mute)]">Picture storage isn&apos;t set up here, so a note will show on this screen only (not on students&apos; screens).</p>
              )}
              <ul className="flex flex-col gap-1.5" aria-label="My notes">
                {notes.map((n) => {
                  const pdf = /pdf/i.test(n.fileType) || /\.pdf$/i.test(n.fileName);
                  const working = busy === n.id;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        disabled={!pdf || !!busy}
                        onClick={() => void pickNote(n.id, n.title)}
                        className={`flex w-full items-center gap-3 rounded-[12px] border border-[color:var(--lp-line)] p-3 text-left transition-colors hover:bg-[var(--lp-soft)] disabled:cursor-not-allowed ${!pdf || (busy && !working) ? "disabled:opacity-50" : ""} ${RING} ${big ? "min-h-14" : ""}`}
                      >
                        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-[8px] bg-[var(--lp-soft)] text-[11px] font-semibold text-[var(--lp-mute)]">
                          {pdf ? "PDF" : (n.fileName.split(".").pop() ?? "").slice(0, 4).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-medium ${text}`}>{n.title}</span>
                          <span className="block truncate text-[13px] text-[var(--lp-mute)]">{working ? progress : pdf ? when(n.createdAt) : "PDF notes only on the board"}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {!notes.length && <li className={`px-2 py-8 text-center ${text} text-[var(--lp-mute)]`}>{db.notes.length ? "No note has that name." : "No notes yet, or they're still loading."}</li>}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
