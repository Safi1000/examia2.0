import { useSyncExternalStore } from "react";

/**
 * The Hamza Teaches phone app shows this site inside a WebView. It names
 * itself in the user agent and sets <html data-app="1"> before any page script
 * runs, so CSS can hide web-only parts with no flash:
 * `html[data-app] .web-only` (see app/globals.css). Use these helpers where
 * logic has to change, not just visibility.
 */
export const APP_UA = "HamzaTeachesApp/";

/** True inside the phone app (client only; always false on the server). */
export function inApp(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.app === "1" || navigator.userAgent.includes(APP_UA);
}

/** Server side: true when the request's user-agent header comes from the phone app. */
export const inAppUA = (userAgent: string | null | undefined) => !!userAgent?.includes(APP_UA);

const noSubscribe = () => () => {};

/** inApp() for components: false while hydrating, then the real answer (no mismatch). */
export function useInApp(): boolean {
  return useSyncExternalStore(noSubscribe, inApp, () => false);
}
