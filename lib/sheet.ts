/**
 * Reads a spreadsheet into rows of text, in the browser, with no library:
 * Excel (.xlsx), CSV, or rows pasted from Excel / Google Sheets (tabs).
 * Only the first sheet of a workbook is read.
 */

export type Rows = string[][];

/** CSV or pasted rows: tabs, commas or semicolons, with "quoted, cells". */
export function parseDelimited(text: string): Rows {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const first = clean.split("\n").find((l) => l.trim()) ?? "";
  const sep = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: Rows = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell) quoted = true;
    else if (ch === sep) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ""));
}

/** The files inside a .xlsx (a zip), unpacked with the browser's own inflater. */
async function unzip(buf: ArrayBuffer, wanted: (name: string) => boolean): Promise<Map<string, string>> {
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  // End of central directory: the last record starting 50 4b 05 06.
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("This file isn't a readable Excel file.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, string>();
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = bytes.slice(start, start + size);
    if (method === 0) out.set(name, dec.decode(data));
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      out.set(name, await new Response(stream).text());
    }
  }
  return out;
}

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(file: File): Promise<Rows> {
  const files = await unzip(await file.arrayBuffer(), (n) => n.startsWith("xl/") && n.endsWith(".xml") || n.endsWith(".rels"));
  const xml = (s: string | undefined) => (s ? new DOMParser().parseFromString(s, "application/xml") : null);
  // First sheet in the workbook's own order.
  const wb = xml(files.get("xl/workbook.xml"));
  const rels = xml(files.get("xl/_rels/workbook.xml.rels"));
  const firstId = wb?.getElementsByTagName("sheet")[0]?.getAttribute("r:id");
  const target = [...(rels?.getElementsByTagName("Relationship") ?? [])].find((r) => r.getAttribute("Id") === firstId)?.getAttribute("Target");
  const path = target ? (target.startsWith("/") ? target.slice(1) : `xl/${target}`) : "xl/worksheets/sheet1.xml";
  const sheet = xml(files.get(path) ?? files.get("xl/worksheets/sheet1.xml"));
  if (!sheet) throw new Error("No sheet found in this file.");
  const shared = [...(xml(files.get("xl/sharedStrings.xml"))?.getElementsByTagName("si") ?? [])].map((si) =>
    [...si.getElementsByTagName("t")].map((t) => t.textContent ?? "").join(""),
  );
  const rows: Rows = [];
  for (const r of sheet.getElementsByTagName("row")) {
    const row: string[] = [];
    for (const c of r.getElementsByTagName("c")) {
      const t = c.getAttribute("t");
      const raw = c.getElementsByTagName("v")[0]?.textContent ?? "";
      const text =
        t === "s" ? (shared[Number(raw)] ?? "") : t === "inlineStr" ? [...c.getElementsByTagName("t")].map((x) => x.textContent ?? "").join("") : raw;
      row[colIndex(c.getAttribute("r") ?? "A1")] = text.trim();
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

export async function readSheetFile(file: File): Promise<Rows> {
  if (/\.xlsx$/i.test(file.name)) return readXlsx(file);
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files can't be read. In Excel, Save As .xlsx or CSV and try again.");
  return parseDelimited(await file.text());
}
