"use client";

/**
 * The last copy of this person's portal, kept on their own device.
 *
 * Opening the app used to wait for every table to download before Home (and
 * the Join button) appeared. Now the last copy shows at once and the fresh
 * one replaces it a moment later. One copy per device, cleared on sign out.
 */
import type { Database } from "@/lib/data/seed";

const DB_NAME = "ht-portal";
const STORE = "snap";
const KEY = "last";
/** Older than this, a copy is more confusing than helpful: wait for fresh data. */
const MAX_AGE_MS = 7 * 24 * 3_600_000;
/** Bump when the cached shape changes so old copies are ignored. */
const VERSION = 1;

export type Snapshot = {
  v: number;
  userId: string;
  savedAt: number;
  session: { role: "admin" | "student"; studentId?: string };
  db: Database;
};

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function readSnapshot(userId: string): Promise<Snapshot | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const s = req.result as Snapshot | undefined;
        const fresh = s && s.v === VERSION && s.userId === userId && Date.now() - s.savedAt < MAX_AGE_MS;
        db.close();
        resolve(fresh ? s : null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/** Goes up on every sign-out, so a save that was already on its way can't put the copy back afterwards. */
let cleared = 0;

export async function writeSnapshot(s: Omit<Snapshot, "v" | "savedAt">): Promise<void> {
  const at = cleared;
  const db = await open();
  if (!db) return;
  try {
    if (at !== cleared) return; // signed out while the database was opening
    db.transaction(STORE, "readwrite").objectStore(STORE).put({ ...s, v: VERSION, savedAt: Date.now() }, KEY);
  } catch {
    // Private mode or a full disk: the app simply loads the slower way.
  } finally {
    db.close(); // closes once the save has finished; one connection per save used to stay open
  }
}

export async function clearSnapshot(): Promise<void> {
  cleared++;
  const db = await open();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).delete(KEY);
  } catch {
  } finally {
    db.close();
  }
}
