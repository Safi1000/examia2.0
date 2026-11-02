"use client";

import { PageHeader } from "@/components/admin/PageHeader";
import { Card } from "@/components/ui";

/**
 * Whiteboard for class: one board on two devices. Draw, type and add pictures
 * on either; the laptop (shared in Meet) follows the tablet's pan and zoom, so
 * the tablet never has to join Meet (saves its battery and Wi-Fi).
 */
export default function WhiteboardPage() {
  const steps = [
    {
      n: "1",
      title: "On your tablet",
      body: "Open the board and draw. The S Pen writes, fingers pan and zoom. Where the tablet looks, the laptop looks.",
      href: "/teach/board",
      cta: "Open the board",
    },
    {
      n: "2",
      title: "On your laptop",
      body: "Open the laptop board, then in Meet choose Present → A tab (or window) → this one. Draw, type and add pictures here too.",
      href: "/teach/present",
      cta: "Open the laptop board",
    },
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader title="Whiteboard" subtitle="One board on your tablet and laptop. Write on either, share the laptop. Students on the link see each stroke the moment you lift the pen." />
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
        <li>Typing: pick the T tool, tap or click where the words go, and press Enter to finish. Tap the words again to edit them.</li>
        <li>Light board or dark board: the button at the top right. Light is easiest to see on a TV and in a bright room, and it changes on your laptop and the students&apos; screens too.</li>
        <li>For a clean shared screen, hide the tools (the eye button, or H on the laptop). &ldquo;Show tools&rdquo; brings them back.</li>
        <li>These pages never sign you out mid-class.</li>
      </ul>
    </div>
  );
}
