"use client";

import { useEffect } from "react";

/**
 * Browser tab titles for the portal ("Tests · Teacher console"), so a page
 * reads properly in the tab bar, history and when installed as an app.
 * Returns the text; layouts render it in a <title> (React puts it in <head>).
 * The longest matching path wins.
 */
export function pageTitle(pathname: string, map: Record<string, string>, suffix: string): string {
  const key = Object.keys(map)
    .filter((p) => pathname === p || pathname.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? `${map[key]} · ${suffix}` : suffix;
}

/**
 * Keeps the browser tab title set while a portal page is open. Next.js writes
 * the site's default <title> into <head> too, so this re-applies ours whenever
 * <head> changes.
 */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (!title) return;
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [title]);
}
