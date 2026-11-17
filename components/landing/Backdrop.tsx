/**
 * One still background behind every public page: a soft gold light near the
 * top and a faint blueprint grid, fixed in place, plus an edge vignette.
 * Nothing follows the cursor or moves with scrolling (November look and feel
 * pass: every public page is as still as the homepage). Styles: globals.css.
 */
export function Backdrop() {
  return (
    <div aria-hidden className="landing-backdrop pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="landing-backdrop__ambient" />
      <div className="landing-backdrop__grid" />
      <div className="landing-backdrop__vignette" />
    </div>
  );
}
