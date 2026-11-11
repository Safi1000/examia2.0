import { Fragment } from "react";

/**
 * A past paper question typed out: its own line breaks kept (numbered
 * statements stay on their own lines) and the paper's bold words (**not**,
 * **least**) shown bold, as printed. Plain text for everything else.
 */
export function PaperText({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  return (
    <div className={className}>
      {lines.map((line, i) => (
        <p key={i} className={i > 0 ? "mt-2" : undefined}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            /^\*\*[^*]+\*\*$/.test(part) ? <strong key={j} className="font-extrabold">{part.slice(2, -2)}</strong> : <Fragment key={j}>{part}</Fragment>,
          )}
        </p>
      ))}
    </div>
  );
}

/** The same text without the bold marks (for labels read aloud or shown plain). */
export const plainPaperText = (text: string) => text.replace(/\*\*([^*]+)\*\*/g, "$1");
