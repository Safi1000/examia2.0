/**
 * Section ids for articles. The same function names each h2 in the article
 * (mdx-components.tsx) and builds the "On this page" list from the .mdx file,
 * so the links always land on the right heading.
 */
import type { ReactNode } from "react";
import { isValidElement } from "react";

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

/** Plain text of rendered heading children (strings, numbers, nested elements). */
export function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** "## Heading" lines of an article's source, as shown text (markdown marks and links removed). */
export function headingsFromSource(source: string): Array<{ id: string; text: string }> {
  const body = source.replace(/export const meta[\s\S]*?\n};?\n/, "");
  const out: Array<{ id: string; text: string }> = [];
  for (const m of body.matchAll(/^##\s+(.+?)\s*$/gm)) {
    const text = m[1]
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[`*_~]/g, "")
      .trim();
    if (text) out.push({ id: headingId(text), text });
  }
  return out;
}
