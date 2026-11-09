"use client";

import { useMemo } from "react";
import type { Question } from "@/types";
import { Button, Modal } from "@/components/ui";
import { useToast } from "@/components/toast";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

interface KeyRow {
  n: number;
  letter: string;
}

/** A safe file name from the test's title. */
const fileName = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "answer-key";

/**
 * The multiple choice answer key for a test, for marking paper copies by hand:
 * shown on screen, and copied or saved as text, a picture or a PDF (through Print).
 * Questions keep their number in the test, so written ones leave a gap in the key.
 */
export function AnswerKeyModal({ open, onClose, title, code, questions }: { open: boolean; onClose: () => void; title: string; code?: string; questions: Question[] }) {
  const { toast } = useToast();
  const rows = useMemo<KeyRow[]>(
    () => questions.flatMap((q, i) => (q.type === "mcq" ? [{ n: i + 1, letter: LETTERS[q.correctIndex] ?? "?" }] : [])),
    [questions],
  );
  const heading = `${title}${code ? ` (${code})` : ""}`;
  const written = questions.length - rows.length;
  const text = `${heading}\nAnswer key\n\n${rows.map((r) => `${r.n}. ${r.letter}`).join("\n")}\n`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Answer key copied.", "success");
    } catch {
      toast("Couldn't copy. Use Save as text instead.", "error");
    }
  };

  const download = (blob: Blob, ext: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName(title)}-answer-key.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const saveText = () => download(new Blob([text], { type: "text/plain;charset=utf-8" }), "txt");

  // A clean white sheet: the title, then the answers in columns of 10.
  const savePicture = () => {
    const perCol = 10;
    const cols = Math.max(1, Math.ceil(rows.length / perCol));
    const colW = 150;
    const pad = 48;
    const rowH = 44;
    const top = 130;
    const scale = 2;
    const w = Math.max(560, pad * 2 + cols * colW);
    const h = top + Math.min(perCol, Math.max(rows.length, 1)) * rowH + pad;
    const canvas = document.createElement("canvas");
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1A1D20";
    ctx.font = "700 24px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(heading, pad, pad + 12, w - pad * 2);
    ctx.fillStyle = "#6B7280";
    ctx.font = "500 15px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(`Answer key · ${rows.length} multiple choice`, pad, pad + 42);
    rows.forEach((r, i) => {
      const x = pad + Math.floor(i / perCol) * colW;
      const y = top + (i % perCol) * rowH;
      ctx.fillStyle = "#6B7280";
      ctx.font = "500 18px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(`${r.n}.`, x, y);
      ctx.fillStyle = "#1A1D20";
      ctx.font = "800 22px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(r.letter, x + 46, y);
    });
    canvas.toBlob((b) => b && download(b, "png"), "image/png");
  };

  // Print opens the browser's own dialog, where "Save as PDF" makes the PDF.
  const printKey = () => {
    const win = window.open("", "_blank", "width=720,height=900");
    if (!win) {
      toast("Allow pop-ups for this site to print the key.", "error");
      return;
    }
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(heading)} answer key</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1A1D20;margin:40px}h1{font-size:22px;margin:0}p{color:#6B7280;margin:6px 0 24px}
ol{list-style:none;padding:0;margin:0;columns:4;column-gap:32px}li{font-size:18px;padding:6px 0;break-inside:avoid}b{display:inline-block;width:40px;color:#6B7280;font-weight:500}</style></head>
<body><h1>${esc(heading)}</h1><p>Answer key · ${rows.length} multiple choice</p><ol>${rows.map((r) => `<li><b>${r.n}.</b><strong>${r.letter}</strong></li>`).join("")}</ol>
<script>window.onload=function(){window.print()}</script></body></html>`);
    win.document.close();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Answer key"
      size="md"
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => void copy()} disabled={!rows.length}>Copy</Button>
          <Button variant="secondary" size="sm" onClick={saveText} disabled={!rows.length}>Save as text</Button>
          <Button variant="secondary" size="sm" onClick={savePicture} disabled={!rows.length}>Save as picture</Button>
          <Button size="sm" onClick={printKey} disabled={!rows.length}>Print or PDF</Button>
        </div>
      }
    >
      {rows.length ? (
        <>
          <p className="text-sm text-ink-2">
            {heading}. {rows.length} multiple choice{written ? `; ${written} written question${written === 1 ? "" : "s"} not in the key` : ""}.
          </p>
          <ol className="mt-4 grid grid-cols-4 gap-x-4 gap-y-2 sm:grid-cols-5">
            {rows.map((r) => (
              <li key={r.n} className="flex items-baseline gap-2 tabular-nums">
                <span className="w-7 text-right text-sm text-ink-3">{r.n}.</span>
                <span className="text-lg font-extrabold text-ink">{r.letter}</span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-sm text-ink-2">This test has no multiple choice questions yet.</p>
      )}
    </Modal>
  );
}
