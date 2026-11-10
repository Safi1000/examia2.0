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
      <PageHeader title="Whiteboard" subtitle="One board on your tablet and laptop. Write on either, then share the laptop screen in Meet or on the TV." />
      <div className="grid gap-4 sm:grid-cols-2">
        {steps.map((s) => (
          <Card key={s.n} className="flex flex-col p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold tabular-nums text-ink ring-1 ring-inset ring-white/[0.08]">{s.n}</span>
            <h2 className="mt-3 text-base font-semibold tracking-[-0.01em] text-ink">{s.title}</h2>
            <p className="mt-1 flex-1 text-sm text-ink-2">{s.body}</p>
            <a
              href={s.href}
              target="_blank"
              rel="noreferrer"
              // One gold button per view: the tablet board leads, the laptop one is quieter.
              className={
                s.n === "1"
                  ? "mt-4 inline-flex h-11 items-center justify-center rounded-full bg-brand px-5 text-sm font-semibold text-on-brand transition hover:brightness-110"
                  : "mt-4 inline-flex h-11 items-center justify-center rounded-full border border-border-strong px-5 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
              }
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
        <li>Typing: on the laptop, point where the words go and press T. On the tablet, pick the T tool and tap. Enter finishes, Shift+Enter starts a new line. Tap the words again to edit them.</li>
        <li>Every class has its own page (&ldquo;A2 Economics&rdquo;), always there, even before its first lesson: tap the page name at the top left to see them all, open one and write ahead. It opens by itself as the class starts, with everything still on it, and stays day after day until you delete it (deleting wipes it clean). The arrows step through the pages; + starts a blank one.</li>
        <li>Laptop keys: P pen, L line, A axes, E eraser, T type, V move pictures, H hide the tools, [ and ] pages, N new page, Ctrl+Z undo, Ctrl+Shift+Z redo.</li>
        <li>Diagrams: draw an L (or press A on the laptop) for clean x and y axes, with 0 at the origin and arrows at the ends.</li>
        <li>Moving things: the Move tool (V) drags pictures, typed text and writing. With the Type tool, a tap on words edits them and a drag moves them.</li>
        <li>While typing: B for bold, I for italic, and a highlighter, in the little bar above the words (or Ctrl+B, Ctrl+I, Ctrl+H).</li>
        <li>Writing lines at the bottom of the screen? Pause for a moment and the board slides up for fresh space (only after a few lines of writing there, never while you write or draw). Page Down on the laptop does it any time. Typed words carry on to the next line at the edge.</li>
        <li>Text boxes: drag the side handle to set how wide the lines run, the corner to make the words bigger or smaller. The bar above the words has bold, italic, highlight and the three colours.</li>
        <li>Pointing: hold the S Pen just above the tablet without touching, and a soft red dot shows on the laptop and TV where you point.</li>
        <li>The tools fade while you write, and on the laptop they step aside after 3 seconds without the mouse, so they never cover the board.</li>
        <li>For a fully clean shared screen, hide the tools (the eye button, or H). &ldquo;Show tools&rdquo; brings them back.</li>
        <li>Each device keeps its board when you leave, however full, and it&apos;s there when you come back.</li>
        <li>These pages never sign you out mid-class.</li>
      </ul>
    </div>
  );
}
