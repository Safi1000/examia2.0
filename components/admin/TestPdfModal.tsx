"use client";

import { useState } from "react";
import type { Test } from "@/types";
import { Button, Checkbox, Modal } from "@/components/ui";

type Kind = "paper" | "answers";

/**
 * "Download as PDF" on the teacher's test page: the question paper to print
 * for students, and a marking sheet for the teacher. The PDF code
 * (lib/test-pdf.tsx and @react-pdf) loads only when a download is pressed.
 */
export function TestPdfModal({ open, onClose, test, className }: { open: boolean; onClose: () => void; test: Test; className?: string | null }) {
  const mcqs = test.questions.filter((q) => q.type === "mcq").length;
  const [grid, setGrid] = useState<boolean | null>(null);
  const withGrid = grid ?? mcqs >= 10;
  const [busy, setBusy] = useState<Kind | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const empty = test.questions.length === 0;

  async function make(kind: Kind) {
    setBusy(kind);
    setError("");
    setProgress("Getting ready");
    try {
      const { buildTestPdf, saveBlob } = await import("@/lib/test-pdf");
      const { blob, fileName } = await buildTestPdf(test, kind, { className, grid: withGrid }, (p) => setProgress(p.label));
      saveBlob(blob, fileName);
      setProgress(kind === "paper" ? "Question paper saved." : "Marking sheet saved.");
    } catch {
      setProgress("");
      setError("The PDF couldn't be made. Check your internet and try again.");
    } finally {
      setBusy(null);
    }
  }

  const row = (kind: Kind, title: string, text: string) => (
    <div key={kind} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink-2">{text}</p>
      </div>
      <Button size="sm" variant={kind === "paper" ? "primary" : "secondary"} onClick={() => void make(kind)} loading={busy === kind} disabled={empty || (busy !== null && busy !== kind)}>
        Download
      </Button>
    </div>
  );

  return (
    <Modal open={open} onClose={() => (busy ? undefined : onClose())} title="Download as PDF" description="A4, ready to print." size="md">
      <div className="space-y-3">
        {row("paper", "Question paper", "For students: name and date lines, every question in this test's order.")}
        {row("answers", "Marking sheet", "For you: the answer to each question, its marks and the mark scheme.")}
        {mcqs > 0 && (
          <Checkbox checked={withGrid} onChange={setGrid} disabled={busy !== null} label="Add a multiple choice answer grid on the last page" className="pt-1" />
        )}
        {empty && <p className="text-sm text-ink-2">Add questions first.</p>}
        <p aria-live="polite" className="min-h-5 text-sm tabular-nums text-ink-2">{progress}</p>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
