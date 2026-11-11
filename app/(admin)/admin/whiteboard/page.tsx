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
        <li>Typing: on the laptop, point where the words go and press T. On the tablet, pick the T tool and tap an empty spot. Enter finishes, Shift+Enter starts a new line.</li>
        <li>Typed words: tap or click them once to select them. A gold frame appears with a small bar, and the keyboard stays closed. Drag the words to move them, with a finger, the S Pen or the mouse. Tap them a second time (or press Enter) to edit. Tap an empty spot to let them go.</li>
        <li>Which tool for that: on the tablet a finger tap selects typed words with any tool, and the S Pen selects them with the Type or Move tool. With the Pen tool the S Pen always writes, even over typed words. On the laptop a click selects typed words with the Pen tool too.</li>
        <li>With typed words selected: the bar has Move, bold, italic, highlight, the four colours, Edit and a bin. Delete or Backspace removes them, the arrow keys nudge them (Shift moves 10 at a time), and Undo puts back a move or a delete in one step.</li>
        <li>Every class has its own page (&ldquo;A2 Economics&rdquo;), always there, even before its first lesson: tap the page name at the top left to see them all, open one and write ahead. It opens by itself as the class starts, with everything still on it, and stays day after day until you delete it (deleting wipes it clean). The arrows step through the pages; + starts a blank one.</li>
        <li>Laptop keys: P pen, L line, A axes, E eraser, T type, V move, H hide the tools, [ and ] pages, N new page, Page Down more room, Ctrl+Z undo, Ctrl+Shift+Z redo, Delete removes what is selected, Esc lets it go. Hold Space and drag to move the board.</li>
        <li>Diagrams: draw a big L (or press A on the laptop) for clean x and y axes, with 0 at the origin and arrows at the ends.</li>
        <li>Tidy shapes: a long straight stroke becomes a ruled line, and it comes out exactly level or upright when you drew it nearly so. A big empty box or oval becomes a clean one. For anything smaller, hold the pen still at the end of the stroke: a loop becomes a box or a circle, an L becomes axes, a straight stroke becomes a line. Curves and handwriting are left as you wrote them.</li>
        <li>Paper: the paper button at the top right has plain, dots, lines and squared paper, on a light board or a dark one. The print moves and zooms with your writing, and the other device changes with it. Plain on the light board is the usual one.</li>
        <li>The laptop always shows everything the tablet shows, at any zoom and whatever the two screen shapes. If you scroll the laptop by hand it goes back as soon as the tablet moves, or press Tablet view at the top right of the laptop.</li>
        <li>Moving things: the Move tool (V) drags pictures, typed text and writing. Selected typed words can be dragged with any tool.</li>
        <li>Ink colours: black, blue, red and green, for the pen and for typed words.</li>
        <li>While typing: B for bold, I for italic, and a highlighter, in the little bar by the words (or Ctrl+B, Ctrl+I, Ctrl+H).</li>
        <li>Need more room below? Press Page Down on the laptop and the board slides up for fresh space. The board never moves by itself. Typed words carry on to the next line at the edge.</li>
        <li>Text boxes: drag the side handle to set how wide the lines run, the corner to make the words bigger or smaller. This works on selected words and while typing. The bar by the words has bold, italic, highlight and the four colours.</li>
        <li>The tools fade while you write, and on the laptop they step aside after 3 seconds without the mouse, so they never cover the board.</li>
        <li>For a fully clean shared screen, hide the tools (the eye button, or H). &ldquo;Show tools&rdquo; brings them back.</li>
        <li>Each device keeps its board when you leave, however full, and it&apos;s there when you come back.</li>
        <li>These pages never sign you out mid-class.</li>
      </ul>
    </div>
  );
}
