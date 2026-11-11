"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Ticked rows for one list in the teacher console.
 *
 * `ids` is every row the current filter and search show, in screen order
 * (paging does not matter: "Select all" means everything that matches). The
 * selection only ever holds rows from that list: when the filter changes,
 * rows it hides drop out for good, so a bulk action can never reach a row
 * Hamza cannot see.
 *
 * - toggle(id, range): one row, or with range (shift-click) every row from the
 *   last one ticked to this one, all set the way this row is going.
 * - Escape clears (not while typing or while a dialog is open).
 * - listKeyDown on the list: Ctrl or Cmd + A selects every row shown, unless
 *   the focus is in a text field.
 */
export function useSelection(ids: readonly string[]) {
  const [state, setState] = useState<{ set: ReadonlySet<string>; anchor: string | null }>(() => ({ set: new Set(), anchor: null }));

  // The rows changed (filter, search, a row deleted): keep only those still shown.
  // Adjusted while rendering, as React suggests for state that follows props.
  const key = useMemo(() => ids.join("\u0001"), [ids]);
  const [seenKey, setSeenKey] = useState(key);
  if (key !== seenKey) {
    setSeenKey(key);
    const shown = new Set(ids);
    if ([...state.set].some((id) => !shown.has(id))) {
      setState((s) => ({ set: new Set([...s.set].filter((id) => shown.has(id))), anchor: s.anchor && shown.has(s.anchor) ? s.anchor : null }));
    }
  }

  const selected = useMemo(() => ids.filter((id) => state.set.has(id)), [ids, state.set]);
  const count = selected.length;
  const total = ids.length;
  const all: "none" | "some" | "all" = count === 0 ? "none" : count === total ? "all" : "some";

  const toggle = useCallback(
    (id: string, range = false) => {
      setState((s) => {
        const next = new Set(s.set);
        const on = !s.set.has(id);
        const from = range && s.anchor ? ids.indexOf(s.anchor) : -1;
        const to = ids.indexOf(id);
        if (from >= 0 && to >= 0) {
          const [a, b] = from < to ? [from, to] : [to, from];
          for (let i = a; i <= b; i++) {
            if (on) next.add(ids[i]);
            else next.delete(ids[i]);
          }
        } else if (on) next.add(id);
        else next.delete(id);
        return { set: next, anchor: id };
      });
    },
    [ids],
  );

  const selectAll = useCallback(() => setState({ set: new Set(ids), anchor: null }), [ids]);
  const clear = useCallback(() => setState({ set: new Set(), anchor: null }), []);
  const toggleAll = useCallback(() => (all === "all" ? clear() : selectAll()), [all, clear, selectAll]);
  /** Drop some rows (done, deleted) and keep the rest ticked. */
  const drop = useCallback((gone: readonly string[]) => setState((s) => ({ set: new Set([...s.set].filter((id) => !gone.includes(id))), anchor: null })), []);
  const isSelected = useCallback((id: string) => state.set.has(id), [state.set]);

  // Escape clears the selection, but never while a dialog is open or a field has focus.
  useEffect(() => {
    if (count === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      clear();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [count, clear]);

  const listKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "a" && !isTyping(e.target)) {
        e.preventDefault();
        selectAll();
      }
    },
    [selectAll],
  );

  return { selected, count, total, all, isSelected, toggle, toggleAll, selectAll, clear, drop, listKeyDown };
}

export type Selection = ReturnType<typeof useSelection>;

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "reset"].includes(type);
}
