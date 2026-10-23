"use client";

import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/ui";

/**
 * Whiteboard for class: draw on the tablet, share the laptop. The laptop view
 * follows every pan, zoom and stroke from the tablet live, so the tablet never
 * has to join Meet (saves its battery and Wi-Fi).
 */
export default function WhiteboardPage() {
  const steps = [
    {
      n: "1",
      title: "On your tablet",
      body: "Open the board and draw. Pan and zoom with two fingers; the S Pen draws.",
      href: "/teach/board",
      cta: "Open the board",
    },
    {
      n: "2",
      title: "On your laptop",
      body: "Open the screen-share view, then in Meet choose Present → A tab (or window) → this one. It follows the tablet by itself.",
      href: "/teach/present",
      cta: "Open screen-share view",
    },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="Whiteboard" subtitle="Draw on the tablet. Share the laptop. Students see every stroke, pan and zoom live." />
      <div className="grid gap-4 sm:grid-cols-2">
        {steps.map((s) => (
          <Card key={s.n} className="flex flex-col p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-on-brand">{s.n}</span>
            <h2 className="mt-3 text-lg font-bold text-ink">{s.title}</h2>
            <p className="mt-1 flex-1 text-sm text-ink-2">{s.body}</p>
            <a
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-on-brand transition hover:brightness-110"
            >
              {s.cta}
            </a>
          </Card>
        ))}
      </div>
      <ul className="mt-6 space-y-2 text-sm text-ink-3">
        <li>Both devices pair on their own because they&apos;re both signed in as you. Nothing to copy.</li>
        <li>Open the board on the tablet from this page (or bookmark it to the home screen for one tap).</li>
        <li>If the laptop was opened late, it catches up with everything already drawn within a second or two.</li>
        <li>These pages never sign you out mid-class.</li>
      </ul>
    </div>
  );
}
