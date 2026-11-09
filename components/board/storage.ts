"use client";

import type { BoardImage, Stroke } from "@/components/board/engine";

/**
 * Where a device keeps its board between visits: the browser's own database
 * (room for hundreds of megabytes), not the small 5 MB store it used before, so
 * a long class never stops saving. Boards saved the old way are still read.
 */
export interface SavedBoard {
  strokes: Stroke[];
  images: BoardImage[];
}

const DB = "ht-board";
const STORE = "boards";
let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
    // Ask the browser to keep the boards for good, so it never clears them to free up space.
    // (Installed or often-used sites are usually allowed; a "no" changes nothing.)
    void navigator.storage?.persist?.().catch(() => {});
  });
  return opening;
}

export async function saveBoard(key: string, board: SavedBoard): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(board, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // Saved the new way: the old copy only takes up the small store.
    try {
      localStorage.removeItem(key);
    } catch {}
  } catch {
    // No database (a private window): fall back to the small store.
    try {
      localStorage.setItem(key, JSON.stringify(board));
    } catch {}
  }
}

export async function loadBoard(key: string): Promise<SavedBoard | null> {
  try {
    const d = await db();
    const got = await new Promise<unknown>((resolve, reject) => {
      const req = d.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (got) return got as SavedBoard;
  } catch {}
  try {
    const old = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Array.isArray(old)) return { strokes: old as Stroke[], images: [] };
    if (old) return { strokes: old.strokes ?? [], images: old.images ?? [] };
  } catch {}
  return null;
}

/** A page of the board: one per class (made on its own as each class starts), or a blank one. */
export interface BoardPage {
  id: string;
  title: string;
  /** When it was made (pages are listed in this order). */
  at: number;
  /** The class it belongs to (made on its own when that class starts). */
  classId?: string;
  subjectId?: string;
}
export interface PageIndex {
  pages: BoardPage[];
  current: string;
}

export async function loadIndex(key: string): Promise<PageIndex | null> {
  try {
    const d = await db();
    const got = await new Promise<unknown>((resolve, reject) => {
      const req = d.transaction(STORE, "readonly").objectStore(STORE).get(`${key}#pages`);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return (got as PageIndex | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function saveIndex(key: string, index: PageIndex): Promise<void> {
  try {
    const d = await db();
    const tx = d.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(index, `${key}#pages`);
  } catch {}
}

/** A page Hamza deleted: its board goes too. */
export async function deleteBoard(key: string): Promise<void> {
  try {
    const d = await db();
    d.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
  } catch {}
}
