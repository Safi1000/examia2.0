import { Logo } from "@/components/Brand";

/**
 * A one-second logo moment when the homepage opens: the wordmark writes itself
 * in left to right with a soft gold glow, then the cover fades away. Pure CSS
 * (see .intro-splash in globals.css), so it never waits on JavaScript and the
 * page underneath is already loaded and readable by search engines.
 */
/**
 * Runs before the first paint (placed by app/page.tsx, a server component):
 * once someone has seen the intro this visit, later opens show the page at once.
 */
export const INTRO_SEEN_SCRIPT = `try{if(sessionStorage.getItem("ht-intro"))document.documentElement.classList.add("intro-seen");else sessionStorage.setItem("ht-intro","1")}catch(e){}`;

export function IntroLogo() {
  return (
    <div aria-hidden className="intro-splash">
      <div className="intro-splash__mark">
        <Logo className="h-14 sm:h-20" />
      </div>
    </div>
  );
}
