"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { photoSrc, type Scene } from "@/lib/groundwork";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * The study receipt: a till-roll summary of a Groundwork session (when, what,
 * each focus block, the goal, today and the week), on screen and as a
 * story-sized image to save or share.
 */
export type ReceiptData = {
  id: string;
  name: string;
  subject: string;
  intention?: string;
  /** Did they finish what they set out to do? null = not answered. */
  intentionDone?: boolean | null;
  startedAt: number;
  endedAt: number;
  blocks: Array<{ kind: "focus" | "rest"; min: number }>;
  focusedMin: number;
  pauses: number;
  todayMin: number;
  weekMin: number;
  streak: number;
};

const SITE = "hamzateaches.com";
const PAPER = "#F5F0E6";
const INK = "#1d1d1f";
const MONO = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

const hm = (min: number) => (min < 60 ? `${min} MIN` : `${Math.floor(min / 60)} H${min % 60 ? ` ${min % 60} MIN` : ""}`);
const when = (ms: number) => {
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });
  const time = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" });
  return { date: date.toUpperCase(), time: time.toUpperCase() };
};

export function receiptId(startedAt: number) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
    .formatToParts(startedAt)
    .reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  return `GW-${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}

/** The lines of the receipt, shared by the screen and the image. */
function lines(r: ReceiptData) {
  const { date, time } = when(r.startedAt);
  let n = 0;
  const items = r.blocks.map((b) => ({ l: b.kind === "focus" ? `FOCUS BLOCK ${++n}` : "BREAK", r: `${b.min} MIN`, dim: b.kind === "rest" }));
  return {
    date,
    time,
    items,
    totals: [
      { l: "FOCUSED", r: hm(r.focusedMin), strong: true },
      ...(r.pauses ? [{ l: "PAUSES", r: String(r.pauses) }] : []),
      { l: "TODAY", r: hm(r.todayMin) },
      { l: "THIS WEEK", r: hm(r.weekMin) },
      ...(r.streak > 1 ? [{ l: "STREAK", r: `${r.streak} DAYS` }] : []),
    ],
  };
}

/** Bars from the receipt number, so each receipt has its own barcode. */
function bars(id: string) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return Array.from({ length: 46 }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 2654435761) ^ i;
    return 1 + (Math.abs(h) % 3);
  });
}

function Row({ l, r, strong, dim }: { l: string; r: string; strong?: boolean; dim?: boolean }) {
  return (
    <div className={cn("flex items-baseline gap-2", strong && "text-[15px] font-bold", dim && "opacity-55")}>
      <span className="shrink-0">{l}</span>
      <span className="mb-[3px] min-w-4 flex-1 border-b border-dotted border-current opacity-40" aria-hidden />
      <span className="shrink-0 tabular-nums">{r}</span>
    </div>
  );
}

const Rule = () => <div className="my-3 border-t border-dashed border-black/35" aria-hidden />;
const Edge = ({ flip }: { flip?: boolean }) => (
  <div
    aria-hidden
    className={cn("h-2.5 w-full", flip && "rotate-180")}
    style={{ background: `radial-gradient(circle at 7px 0, transparent 6px, ${PAPER} 6.5px) repeat-x`, backgroundSize: "14px 10px" }}
  />
);

/** The receipt on screen. */
export function Receipt({ r, className }: { r: ReceiptData; className?: string }) {
  const L = lines(r);
  return (
    <figure className={cn("mx-auto w-full max-w-[340px] drop-shadow-[0_24px_40px_rgba(0,0,0,.45)] animate-[receipt-in_700ms_cubic-bezier(.16,1,.3,1)_both]", className)} aria-label="Study receipt">
      <Edge />
      <div className="px-6 pb-6 pt-5 text-[13px] leading-[1.65]" style={{ background: PAPER, color: INK, fontFamily: MONO }}>
        <div className="text-center">
          <p className="text-[15px] font-bold tracking-[0.18em]">HAMZA TEACHES</p>
          <p className="text-xs tracking-[0.22em] opacity-70">GROUNDWORK · STUDY RECEIPT</p>
        </div>
        <Rule />
        <Row l={L.date} r={L.time} />
        <Row l="STUDENT" r={r.name.toUpperCase()} />
        <Rule />
        <p className="font-bold">{r.subject.toUpperCase()}</p>
        <div className="pl-3">
          {L.items.map((it, i) => (
            <Row key={i} l={it.l} r={it.r} dim={it.dim} />
          ))}
        </div>
        {r.intention && (
          <>
            <Rule />
            <p className="opacity-70">GOAL</p>
            <p className="break-words">{r.intention}</p>
            {r.intentionDone != null && <p className="mt-1 font-bold">{r.intentionDone ? "[x] DONE" : "[ ] NEXT TIME"}</p>}
          </>
        )}
        <Rule />
        {L.totals.map((t) => (
          <Row key={t.l} l={t.l} r={t.r} strong={"strong" in t && t.strong} />
        ))}
        <Rule />
        <div className="flex h-12 items-stretch justify-center gap-[2px]" aria-hidden>
          {bars(r.id).map((w, i) => (
            <span key={i} style={{ width: w, background: i % 2 ? "transparent" : INK }} />
          ))}
        </div>
        <p className="mt-1.5 text-center text-xs tracking-[0.2em] opacity-70">{r.id}</p>
        <p className="mt-3 text-center text-[12px] font-bold tracking-[0.16em]">THANK YOU FOR STUDYING</p>
        <p className="text-center text-xs opacity-60">{SITE.toUpperCase()}</p>
      </div>
      <Edge flip />
      <style>{`@keyframes receipt-in { from { opacity: 0; transform: translateY(-24px) scaleY(.96); transform-origin: top; } to { opacity: 1; transform: none; } } @media (prefers-reduced-motion: reduce) { figure[aria-label="Study receipt"] { animation: none !important; } }`}</style>
    </figure>
  );
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** The receipt as a 1080 × 1920 story image on their scene. */
export async function drawReceipt(r: ReceiptData, scene?: Scene): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#15181b";
  ctx.fillRect(0, 0, W, H);
  if (scene?.photo) {
    try {
      const img = await loadImage(photoSrc(scene, "tall"));
      const k = Math.max(W / img.width, H / img.height);
      ctx.drawImage(img, (W - img.width * k) / 2, (H - img.height * k) / 2, img.width * k, img.height * k);
    } catch {}
  }
  ctx.fillStyle = "rgba(10,12,14,.55)";
  ctx.fillRect(0, 0, W, H);

  const L = lines(r);
  const PW = 780;
  const lh = 46;
  const pad = 64;
  const font = "Menlo, 'SF Mono', Consolas, 'Courier New', monospace";
  // The goal, wrapped to the paper before the paper is sized: a word too long for a line is cut,
  // and a very long goal stops at four lines, so it never runs off the paper or the image.
  ctx.font = `400 30px ${font}`;
  const goal = r.intention ? wrapText(ctx, r.intention, PW - pad * 2, 4) : [];
  const rows = 2 + 1 + 2 + 1 + 1 + L.items.length + (r.intention ? 2 + goal.length + (r.intentionDone != null ? 1 : 0) : 0) + 1 + L.totals.length + 1 + 5;
  const PH = pad * 2 + rows * lh + 10;
  const x0 = (W - PW) / 2;
  const y0 = Math.max(120, (H - PH) / 2 - 40);

  ctx.save();
  ctx.translate(W / 2, y0 + PH / 2);
  ctx.rotate((-1.6 * Math.PI) / 180);
  ctx.translate(-W / 2, -(y0 + PH / 2));
  ctx.shadowColor = "rgba(0,0,0,.5)";
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 30;
  ctx.fillStyle = PAPER;
  // Paper with torn (scalloped) top and bottom edges.
  ctx.beginPath();
  const tooth = 20;
  ctx.moveTo(x0, y0);
  for (let x = x0; x < x0 + PW; x += tooth) ctx.arc(x + tooth / 2, y0, tooth / 2, Math.PI, 0, true);
  ctx.lineTo(x0 + PW, y0 + PH);
  for (let x = x0 + PW; x > x0; x -= tooth) ctx.arc(x - tooth / 2, y0 + PH, tooth / 2, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = "transparent";

  let y = y0 + pad + 30;
  const left = x0 + pad;
  const right = x0 + PW - pad;
  const center = (t: string, size: number, weight = 400, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(t, W / 2, y);
    ctx.globalAlpha = 1;
    y += lh;
  };
  const row = (l: string, rr: string, opts: { weight?: number; alpha?: number; indent?: number } = {}) => {
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.font = `${opts.weight ?? 400} 30px ${font}`;
    ctx.textAlign = "left";
    const lx = left + (opts.indent ?? 0);
    ctx.fillText(l, lx, y);
    ctx.textAlign = "right";
    ctx.fillText(rr, right, y);
    const lw = ctx.measureText(l).width;
    const rw = ctx.measureText(rr).width;
    ctx.globalAlpha = (opts.alpha ?? 1) * 0.35;
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.moveTo(lx + lw + 12, y - 6);
    ctx.lineTo(right - rw - 12, y - 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    y += lh;
  };
  const rule = () => {
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo(left, y - 20);
    ctx.lineTo(right, y - 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    y += 20;
  };
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  center("HAMZA TEACHES", 40, 700);
  center("GROUNDWORK · STUDY RECEIPT", 26, 400, 0.7);
  rule();
  row(L.date, L.time);
  row("STUDENT", r.name.toUpperCase());
  rule();
  ctx.font = `700 30px ${font}`;
  ctx.textAlign = "left";
  ctx.fillText(r.subject.toUpperCase(), left, y);
  y += lh;
  L.items.forEach((it) => row(it.l, it.r, { indent: 30, alpha: it.dim ? 0.55 : 1 }));
  if (r.intention) {
    rule();
    ctx.textAlign = "left";
    ctx.globalAlpha = 0.7;
    ctx.font = `400 30px ${font}`;
    ctx.fillText("GOAL", left, y);
    ctx.globalAlpha = 1;
    y += lh;
    for (const line of goal) {
      ctx.fillText(line, left, y);
      y += lh;
    }
    if (r.intentionDone != null) {
      ctx.font = `700 30px ${font}`;
      ctx.fillText(r.intentionDone ? "[x] DONE" : "[ ] NEXT TIME", left, y);
      y += lh;
    }
  }
  rule();
  L.totals.forEach((t) => row(t.l, t.r, { weight: "strong" in t && t.strong ? 700 : 400 }));
  rule();
  const b = bars(r.id);
  const bw = b.reduce((a, w) => a + w * 3 + 4, 0);
  let bx = W / 2 - bw / 2;
  b.forEach((w, i) => {
    if (i % 2 === 0) ctx.fillRect(bx, y - 30, w * 3, 90);
    bx += w * 3 + 4;
  });
  y += 100;
  center(r.id, 24, 400, 0.7);
  center("THANK YOU FOR STUDYING", 30, 700);
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.font = `600 34px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(`Studying with Hamza Teaches · ${SITE}`, W / 2, H - 110);
  return new Promise((resolve, reject) => c.toBlob((bl) => (bl ? resolve(bl) : reject(new Error("no image"))), "image/png"));
}

/** Lines of `text` no wider than `maxW` in the context's current font, at most `maxLines` (the last ends in "…" when cut). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const fits = (t: string) => ctx.measureText(t).width <= maxW;
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let w = word;
    // A word longer than a whole line (a link, a long name) is cut across lines.
    while (!fits(w)) {
      let n = w.length - 1;
      while (n > 1 && !fits((line ? `${line} ` : "") + w.slice(0, n))) n--;
      if (n <= 1 && line) {
        out.push(line);
        line = "";
        continue;
      }
      out.push((line ? `${line} ` : "") + w.slice(0, n));
      line = "";
      w = w.slice(n);
    }
    const t = line ? `${line} ${w}` : w;
    if (fits(t)) line = t;
    else {
      out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  if (out.length <= maxLines) return out;
  let last = out[maxLines - 1];
  while (last && !fits(`${last}…`)) last = last.slice(0, -1);
  return [...out.slice(0, maxLines - 1), `${last.trimEnd()}…`];
}

/** Save or share the receipt image (the phone's share sheet where it can). */
export function ShareReceipt({ r, scene }: { r: ReceiptData; scene?: Scene }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const save = useRef<HTMLAnchorElement>(null);
  const text = `${r.focusedMin} minutes of ${r.subject} done. Studying with Hamza Teaches: https://www.${SITE}`;
  const file = `study-receipt-${r.id.toLowerCase()}.png`;

  async function go() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const blob = await drawReceipt(r, scene);
      const f = new File([blob], file, { type: "image/png" });
      let shared = false;
      if (navigator.canShare?.({ files: [f] })) {
        try {
          await navigator.share({ files: [f], text });
          shared = true;
        } catch (e) {
          // They closed the share sheet: done. Anything else (the phone refused it): show the image to save instead.
          shared = (e as { name?: string } | null)?.name === "AbortError";
        }
      }
      if (!shared) setPreview(URL.createObjectURL(blob));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  // The image on show: the keyboard goes to it, Escape closes it (not the room behind), and its memory is freed after.
  useEffect(() => {
    if (!preview) return;
    const back = opener.current;
    save.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setPreview(null);
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      URL.revokeObjectURL(preview);
      back?.focus();
    };
  }, [preview]);

  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => void go()}
        aria-busy={busy}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/12 px-5 text-sm font-semibold text-white backdrop-blur-xl transition hover:bg-white/20 active:scale-[0.98]"
      >
        <Icon.Share className="h-4 w-4" />
        {busy ? "Printing…" : failed ? "Try again" : "Share receipt"}
      </button>
      {preview &&
        createPortal(
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Your study receipt" onClick={() => setPreview(null)}>
            <div className="w-full max-w-sm rounded-[24px] bg-[#1a1d20] p-4" onClick={(e) => e.stopPropagation()}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Your study receipt" className="mx-auto max-h-[60dvh] rounded-2xl" />
              <div className="mt-4 grid gap-2">
                <a ref={save} href={preview} download={file} className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white text-sm font-semibold text-black">
                  <Icon.Download className="h-4 w-4" /> Save image
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(text)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-white/15 text-sm font-semibold text-white"
                >
                  Send on WhatsApp
                </a>
                <button type="button" onClick={() => setPreview(null)} className="h-11 text-sm text-white/60">
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
