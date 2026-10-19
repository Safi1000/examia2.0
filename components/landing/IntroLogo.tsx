import { Logo } from "@/components/Brand";

/**
 * A one-second logo moment when the homepage opens: the wordmark writes itself
 * in left to right with a soft gold glow, then the cover fades away. Pure CSS
 * (see .intro-splash in globals.css), so it never waits on JavaScript and the
 * page underneath is already loaded and readable by search engines.
 */
export function IntroLogo() {
  return (
    <div aria-hidden className="intro-splash">
      <div className="intro-splash__mark">
        <Logo className="h-14 sm:h-20" />
      </div>
    </div>
  );
}
