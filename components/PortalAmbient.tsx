/**
 * The portal's backdrop, on phone and desktop, for students and the teacher
 * console alike: warm charcoal, a very faint grid like the homepage, and a
 * soft gold glow from the top. No photo and no cool tints, so every page
 * reads warm and calm, and nothing heavy (blur, big images) slows phones down.
 *
 * Groundwork keeps its own full photo; this sits behind everything else.
 * Purely decorative; never takes clicks.
 */
export function PortalAmbient() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-paper">
      <div className="portal-glow absolute inset-0" />
      <div className="portal-grid absolute inset-0" />
    </div>
  );
}
