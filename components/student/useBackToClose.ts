"use client";

import { useEffect, useRef } from "react";

type ViewState = { view?: string } | null;
const currentView = () => (window.history.state as ViewState)?.view;

// A view that has just closed by its own button: its history entry comes off
// a moment later, unless another view opens straight away and takes it over
// (React mounts twice in development, or one view replaces another).
let leaving: { key: string; timer: ReturnType<typeof setTimeout> } | null = null;

/**
 * Full-screen views (a note, the study timer, the welcome steps) look like a
 * page of their own, so the phone's Back button should close them, not leave
 * the page underneath. While the view is open it adds one history entry; Back
 * takes that off and calls `onBack`. Closing the view any other way takes the
 * entry off again quietly, without navigating anywhere.
 *
 * `onBack` returns true to stay open (the welcome steps go back a step
 * instead): the entry is then put back, so Back keeps working.
 */
export function useBackToClose(onBack: () => boolean | void) {
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    let key: string;
    if (leaving && currentView() === leaving.key) {
      clearTimeout(leaving.timer);
      key = leaving.key;
      leaving = null;
    } else {
      key = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      window.history.pushState({ view: key }, "");
    }
    let gone = false;
    const onPop = () => {
      // Forward onto our own entry again is not a Back.
      if (currentView() === key) return;
      gone = true;
      if (onBackRef.current() === true) {
        gone = false;
        window.history.pushState({ view: key }, "");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (gone) return;
      const timer = setTimeout(() => {
        if (leaving?.key === key) leaving = null;
        // Still on our entry (closed by its own button): step back off it.
        // After a link inside the view, the new page's entry is on top: leave it.
        if (currentView() === key) window.history.back();
      }, 0);
      leaving = { key, timer };
    };
  }, []);
}
