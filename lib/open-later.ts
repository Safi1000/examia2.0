/**
 * Open a tab on the tap itself, fill in its address once it's ready.
 *
 * Safari and iPads block a window opened a few seconds after a tap (e.g.
 * after a report PDF uploads), so the tab is opened straight away and then
 * pointed at WhatsApp. If it was blocked anyway, this page goes there.
 */
export function openLater() {
  const w = typeof window !== "undefined" ? window.open("", "_blank") : null;
  if (w) w.opener = null;
  return {
    go(url: string) {
      if (w && !w.closed) w.location.href = url;
      else window.location.href = url;
    },
    cancel() {
      if (w && !w.closed) w.close();
    },
  };
}
