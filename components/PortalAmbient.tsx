/**
 * The portal's backdrop, on phone and desktop, for students and the teacher
 * console alike: the homepage's own background (warm charcoal, the faint grid
 * with its wider gold lines, a soft gold glow and a gentle vignette), held
 * still. No photo and no cool tints; the photo wallpapers belong to
 * Groundwork only, which draws its own over this.
 *
 * Purely decorative; never takes clicks. Static, so it costs nothing while
 * scrolling (the homepage's cursor drift is left out on purpose).
 */
export function PortalAmbient() {
  return (
    <div aria-hidden className="landing-backdrop portal-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="landing-backdrop__ambient" />
      <div className="landing-backdrop__grid" />
      <div className="landing-backdrop__vignette" />
    </div>
  );
}
